// The last stage, in Node: trim the mix's latency, fade the tail to silence, bring the piece to its loudness target
// under a true-peak ceiling (a look-ahead limiter), and write the WAV. Also the meters the analysis uses
// (BS.1770 loudness, 4× oversampled true peak). Plain arrays, no dependencies.
import fs from 'node:fs';

export const SR = 48000;
const db = (x) => 20 * Math.log10(Math.max(x, 1e-12));

// ── BS.1770 loudness ─────────────────────────────────────────────────────────────────────────
function biquad(x, b, a) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}
/** The K weighting at 48 kHz: a high shelf, then a high-pass. */
export function kWeight(x) {
  const s = biquad(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]);
  return biquad(s, [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);
}
/** Mean square of L + R (K-weighted) in windows of `win` seconds every `hop` seconds, as loudness (LUFS). */
export function windows(kl, kr, win, hop) {
  const n = Math.round(win * SR), h = Math.round(hop * SR);
  const acc = new Float64Array(kl.length + 1);
  for (let i = 0; i < kl.length; i++) acc[i + 1] = acc[i] + kl[i] * kl[i] + kr[i] * kr[i];
  const out = [];
  for (let s = 0; s + n <= kl.length; s += h) out.push((acc[s + n] - acc[s]) / n);
  return out;
}
const lufs = (ms) => -0.691 + 10 * Math.log10(Math.max(ms, 1e-12));
/** Integrated loudness (gated), LUFS. */
export function integrated(L, R) {
  const blocks = windows(kWeight(L), kWeight(R), 0.4, 0.1);
  const loud = blocks.filter((b) => lufs(b) > -70);
  if (!loud.length) return -Infinity;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const gate = lufs(mean(loud)) - 10;
  const kept = loud.filter((b) => lufs(b) > gate);
  return lufs(mean(kept));
}
/** Short-term loudness (3 s windows) once a second: [time of the window's centre, LUFS]. */
export function shortTerm(L, R, win = 3, hop = 1) {
  return windows(kWeight(L), kWeight(R), win, hop).map((b, i) => [i * hop + win / 2, lufs(b)]);
}
/** Loudness of one stretch (ungated), LUFS. */
export function loudnessOf(kl, kr, t0, t1) {
  const a = Math.max(0, Math.round(t0 * SR)), b = Math.min(kl.length, Math.round(t1 * SR));
  let s = 0;
  for (let i = a; i < b; i++) s += kl[i] * kl[i] + kr[i] * kr[i];
  return lufs(s / Math.max(1, b - a));
}

// ── true peak ────────────────────────────────────────────────────────────────────────────────
const TAPS = 8;
const PHASES = [1, 2, 3].map((p) => {
  const h = new Float64Array(2 * TAPS);
  for (let k = -TAPS + 1; k <= TAPS; k++) {
    const x = k - p / 4;
    h[k + TAPS - 1] = (Math.sin(Math.PI * x) / (Math.PI * x)) * (0.5 + 0.5 * Math.cos((Math.PI * x) / TAPS));
  }
  return h;
});
/** The largest magnitude between sample n and n + 1 (the samples themselves and three points between). */
function peakTrack(L, R) {
  const N = L.length, pk = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    let m = Math.max(Math.abs(L[n]), Math.abs(R[n]));
    if (m > 0.05 && n >= TAPS && n < N - TAPS - 1)
      for (const h of PHASES) {
        let a = 0, b = 0;
        for (let k = 0; k < 2 * TAPS; k++) {
          a += h[k] * L[n + k - TAPS + 1];
          b += h[k] * R[n + k - TAPS + 1];
        }
        m = Math.max(m, Math.abs(a), Math.abs(b));
      }
    pk[n] = m;
  }
  return pk;
}
export function truePeakDb(L, R) {
  const pk = peakTrack(L, R);
  let m = 0;
  for (let i = 0; i < pk.length; i++) if (pk[i] > m) m = pk[i];
  return db(m);
}

/** A look-ahead limiter on the true peak: 5 ms ahead, 90 ms release. Returns new channels and what it did. */
export function limit(L, R, ceilingDb) {
  const N = L.length, C = Math.pow(10, ceilingDb / 20), LA = 240;
  const pk = peakTrack(L, R);
  const need = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const p = Math.max(pk[n], n ? pk[n - 1] : 0);
    need[n] = p > C ? C / p : 1;
  }
  // the lowest gain needed anywhere in the next 5 ms (a sliding minimum)
  const ahead = new Float32Array(N), q = new Int32Array(N);
  let head = 0, tail = 0;
  for (let n = N - 1; n >= 0; n--) {
    while (tail > head && need[q[tail - 1]] >= need[n]) tail--;
    q[tail++] = n;
    while (q[head] > n + LA) head++;
    ahead[n] = need[q[head]];
  }
  // release, then a 5 ms moving average so the gain glides down before the peak arrives
  const rel = 1 - Math.exp(-1 / (0.09 * SR));
  const g = new Float32Array(N);
  let cur = 1;
  for (let n = 0; n < N; n++) {
    cur = ahead[n] < cur ? ahead[n] : cur + (1 - cur) * rel;
    if (cur > ahead[n]) cur = ahead[n];
    g[n] = cur;
  }
  const oL = new Float64Array(N), oR = new Float64Array(N);
  let sum = 0, minG = 1, touched = 0;
  for (let n = 0; n < N; n++) {
    sum += g[n];
    if (n >= LA) sum -= g[n - LA];
    const gain = sum / Math.min(n + 1, LA);
    if (gain < minG) minG = gain;
    if (gain < 0.999) touched++;
    oL[n] = L[n] * gain;
    oR[n] = R[n] * gain;
  }
  return { L: oL, R: oR, maxReductionDb: -db(minG), limitedShare: touched / N };
}

/**
 * From the page's raw render to the finished piece: drop the mix's latency, cut to length, fade the tail (the last
 * 0.35 s are silence), then gain + limiter until the integrated loudness is on target.
 */
export function master(inter, { seconds, latency, target, ceiling = -1.3, fade = 1.2, gainDb = null }) {
  const N = Math.round(seconds * SR);
  const L = new Float64Array(N), R = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const j = i + latency;
    if (j * 2 + 1 < inter.length) {
      L[i] = inter[j * 2];
      R[i] = inter[j * 2 + 1];
    }
  }
  // no DC: a first-order high-pass far below anything audible (8 Hz)
  const pole = 1 - (2 * Math.PI * 8) / SR;
  for (const ch of [L, R]) {
    let x1 = 0, y1 = 0;
    for (let i = 0; i < N; i++) {
      const y = ch[i] - x1 + pole * y1;
      x1 = ch[i];
      ch[i] = y1 = y;
    }
  }
  const quiet = Math.round(0.35 * SR), f = Math.round(fade * SR);
  for (let i = N - quiet - f; i < N; i++) {
    const x = i >= N - quiet ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * (i - (N - quiet - f))) / f);
    L[i] *= x;
    R[i] *= x;
  }
  const scaled = (G) => {
    const k = Math.pow(10, G / 20);
    return limit(L.map((v) => v * k), R.map((v) => v * k), ceiling);
  };
  let G = gainDb ?? 0, out = scaled(G), I = integrated(out.L, out.R);
  if (gainDb === null)
    for (let it = 0; it < 6 && Math.abs(target - I) > 0.03; it++) {
      G += target - I;
      out = scaled(G);
      I = integrated(out.L, out.R);
    }
  return { ...out, gainDb: G, lufs: I, truePeak: truePeakDb(out.L, out.R) };
}

// ── WAV ──────────────────────────────────────────────────────────────────────────────────────
export function writeWav24(file, L, R) {
  const N = L.length, data = Buffer.alloc(N * 6), head = Buffer.alloc(44);
  // a flat (TPDF) dither of one step, seeded: the file is the same every time
  let seed = 0x2f6e2b1;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  let o = 0;
  for (let i = 0; i < N; i++)
    for (const ch of [L, R]) {
      const silent = ch[i] === 0;
      const v = Math.max(-8388608, Math.min(8388607, Math.round(ch[i] * 8388607 + (silent ? 0 : rnd() - rnd()))));
      data.writeIntLE(v, o, 3);
      o += 3;
    }
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * 6, 28);
  head.writeUInt16LE(6, 32);
  head.writeUInt16LE(24, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, data]));
}

export function readWav24(file) {
  const b = fs.readFileSync(file);
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') data = b.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size % 2);
  }
  if (!fmt || !data || fmt.bits !== 24 || fmt.ch !== 2 || fmt.sr !== SR) throw new Error(`${file}: expected 48 kHz stereo 24-bit`);
  const N = data.length / 6, L = new Float64Array(N), R = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    L[i] = data.readIntLE(i * 6, 3) / 8388607;
    R[i] = data.readIntLE(i * 6 + 3, 3) / 8388607;
  }
  return { L, R };
}
