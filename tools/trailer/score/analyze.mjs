// Nobody can listen to the score here, so it is measured:  node tools/trailer/score/analyze.mjs <file.wav> <piece> [out.png]
// Prints the loudness (BS.1770, cross-checked with ffmpeg's ebur128), a table per bar (loudness, peak, energy in five
// bands, how well left + right add up in mono), the loudness of every cue in the map, where each hit's onset really
// is against its bar line, and the checks the brief asks for. With a PNG path, ffmpeg draws the spectrogram.
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { integrated, kWeight, loudnessOf, readWav24, shortTerm, truePeakDb, windows, SR } from './master.mjs';

const db10 = (x) => 10 * Math.log10(Math.max(x, 1e-14));
const DEFAULT_BANDS = [['sub', 30, 80], ['low', 80, 300], ['mid', 300, 4000], ['high', 4000, 8000], ['air', 8000, 20000]];
const TARGET = { trailer: [-14, 0.7], teaser: [-14, 0.7], calm: [-15, 0.7], rise: [-14, 0.7] };

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

const OCTAVES = [20, 31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000, 22000];

/** Mean power in each band between two times, for one signal. */
function bandPower(x, t0, t1, BANDS = DEFAULT_BANDS, N = 4096) {
  const hop = N / 2, out = BANDS.map(() => 0);
  let frames = 0;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = Math.round(t0 * SR); s + N <= Math.min(x.length, Math.round(t1 * SR) + hop); s += hop) {
    for (let i = 0; i < N; i++) {
      re[i] = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      im[i] = 0;
    }
    fft(re, im);
    BANDS.forEach(([, lo, hi], b) => {
      for (let k = Math.ceil((lo * N) / SR); k < (hi * N) / SR; k++) out[b] += (re[k] * re[k] + im[k] * im[k]) / (N * N) * 8 / 3 * 2;
    });
    frames++;
  }
  return out.map((v) => v / Math.max(1, frames));
}

export async function analyze(file, piece, { png } = {}) {
  const { MAP } = await import('../music-map.mjs');
  const map = MAP[piece];
  const { L, R } = readWav24(file);
  const N = L.length, seconds = N / SR;
  const kl = kWeight(L), kr = kWeight(R);
  const mono = L.map((v, i) => (v + R[i]) / 2);
  const fails = [];
  const check = (ok, text) => {
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${text}`);
    if (!ok) fails.push(text);
  };
  console.log(`\n── ${piece}: ${file} (${seconds.toFixed(3)} s) ──`);

  // loudness and peaks, ours and ffmpeg's
  const I = integrated(L, R), TP = truePeakDb(L, R);
  const ff = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const sum = ff.slice(ff.lastIndexOf('Summary:'));
  const ffI = Number(/I:\s*(-?[\d.]+) LUFS/.exec(sum)?.[1]), ffLRA = Number(/LRA:\s*(-?[\d.]+) LU/.exec(sum)?.[1]), ffTP = Number(/Peak:\s*(-?[\d.]+) dBFS/.exec(sum)?.[1]);
  console.log(`  integrated ${I.toFixed(2)} LUFS (ffmpeg ${ffI}), true peak ${TP.toFixed(2)} dBTP (ffmpeg ${ffTP}), loudness range ${ffLRA} LU`);
  const [target, tol] = TARGET[piece];
  check(Math.abs(ffI - target) <= tol, `integrated loudness ${ffI} LUFS within ±${tol} of ${target}`);
  check(ffTP <= -1.0, `true peak ${ffTP} dBTP ≤ −1.0`);
  check(Math.abs(seconds - (map.bars * 2 + map.tail)) < 1e-6, `length ${seconds} s = ${map.bars} bars + ${map.tail} s`);
  let endMax = 0, dc = 0;
  for (let i = N - Math.round(0.3 * SR); i < N; i++) endMax = Math.max(endMax, Math.abs(L[i]), Math.abs(R[i]));
  for (let i = 0; i < N; i++) dc += L[i] + R[i];
  check(endMax === 0, `the last 0.3 s are silent (max ${endMax})`);
  check(Math.abs(dc / (2 * N)) < 1e-4, `no DC offset (${(dc / (2 * N)).toExponential(1)})`);
  // flat tops: runs of samples stuck at the same extreme value
  let plateau = 0, run = 0;
  for (let i = 1; i < N; i++) {
    run = Math.abs(L[i]) > 0.5 && Math.abs(L[i] - L[i - 1]) < 1e-6 ? run + 1 : 0;
    if (run > plateau) plateau = run;
  }
  check(plateau < 4, `no clipping plateaus (longest flat run ${plateau + 1} samples)`);

  // clicks: a step between two neighbouring samples that stands alone (a drum's noise is full of big steps, but
  // they come in crowds; a break in the waveform is one step ten times the size of everything round it)
  let click = 0, clickAt = 0;
  for (let i = 300; i < N - 300; i++) {
    const d = Math.abs(L[i] - L[i - 1]);
    if (d < 0.08) continue;
    let s = 0;
    for (let j = i - 240; j <= i + 240; j++) if (Math.abs(j - i) > 3) s += (L[j] - L[j - 1]) ** 2;
    const ratio = d / Math.sqrt(s / 474 + 1e-12);
    if (ratio > click) { click = ratio; clickAt = i; }
  }
  check(click < 10, `no clicks (the most isolated step between two samples is ${click.toFixed(1)}× its surroundings, at ${(clickAt / SR).toFixed(3)} s)`);

  // per bar
  const cueOf = (bar) => map.cues.find((c) => bar >= c[1] && bar < c[2])?.[0] ?? 'tail';
  const hitOf = (bar) => map.hits.find((h) => h[0] === bar)?.[1] ?? '';
  console.log('\n  bar  t(s)  cue       hit      LUFS    peak   |  sub    low    mid   high    air  | mono<150  mono');
  const rows = [];
  const totalBars = map.bars + Math.ceil(map.tail / 2);
  for (let b = 0; b < totalBars; b++) {
    const t0 = b * 2, t1 = Math.min(seconds, t0 + 2);
    let pk = 0;
    for (let i = t0 * SR; i < t1 * SR; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    const pl = bandPower(L, t0, t1), pr = bandPower(R, t0, t1), pm = bandPower(mono, t0, t1);
    const bands = pl.map((v, i) => db10((v + pr[i]) / 2));
    // how much of the bass, and of everything, survives the sum to mono (0 dB = all of it, −3 = unrelated sides)
    const lowKeep = db10((pm[0] + pm[1] * 0.3) / ((pl[0] + pr[0]) / 2 + ((pl[1] + pr[1]) / 2) * 0.3));
    const allKeep = db10(pm.reduce((s, v) => s + v, 0) / (pl.reduce((s, v) => s + v, 0) / 2 + pr.reduce((s, v) => s + v, 0) / 2));
    const row = { b, cue: cueOf(b), lufs: loudnessOf(kl, kr, t0, t1), pk: 20 * Math.log10(Math.max(pk, 1e-9)), bands, lowKeep, allKeep };
    rows.push(row);
    console.log(`  ${String(b).padStart(3)} ${String(t0).padStart(5)}  ${row.cue.padEnd(9)} ${hitOf(b).padEnd(7)} ${row.lufs.toFixed(1).padStart(6)} ${row.pk.toFixed(1).padStart(6)}   | ${bands.map((v) => v.toFixed(0).padStart(4)).join('   ')}  | ${lowKeep.toFixed(1).padStart(6)}  ${allKeep.toFixed(1).padStart(6)}`);
  }

  // per cue
  console.log('\n  cue        bars     LUFS   (loudest 3 s window, 400 ms window)');
  const st = shortTerm(L, R), mom = windows(kl, kr, 0.4, 0.1).map((v, i) => [i * 0.1 + 0.2, -0.691 + db10(v)]);
  const cue = {};
  for (const [name, from, to] of map.cues) {
    const t0 = from * 2, t1 = to * 2;
    const loud = loudnessOf(kl, kr, t0, t1);
    const stMax = Math.max(...st.filter(([t]) => t >= t0 && t < t1).map(([, v]) => v), -99);
    const mMax = Math.max(...mom.filter(([t]) => t >= t0 && t < t1).map(([, v]) => v), -99);
    cue[name] = { loud, stMax, mMax };
    console.log(`  ${name.padEnd(9)} ${String(from).padStart(3)}–${String(to).padEnd(3)} ${loud.toFixed(1).padStart(6)}   (${stMax.toFixed(1)}, ${mMax.toFixed(1)})`);
  }
  // the long-term spectrum of each cue, an octave at a time (a full mix falls a few dB an octave from 100 Hz up)
  console.log(`\n  octaves from  ${OCTAVES.slice(0, -1).map((f) => String(f >= 1000 ? `${f / 1000}k` : f).padStart(5)).join(' ')}   (dB, mono sum)`);
  const octs = OCTAVES.slice(0, -1).map((f, i) => ['', f, OCTAVES[i + 1]]);
  for (const [name, from, to] of map.cues) console.log(`  ${name.padEnd(12)}  ${bandPower(mono, from * 2, to * 2, octs, 16384).map((v) => db10(v).toFixed(0).padStart(5)).join(' ')}`);
  // whistles: a narrow line above 3 kHz that is loud (within 30 dB of the cue's strongest band), far above its
  // neighbourhood, and there for most of the cue (in three of its quarters: a bell's partial rings and is gone, a
  // whistle stays). Lower down, narrow lines are simply the notes.
  for (const [name, from, to] of map.cues) {
    const bands = [];
    for (let f = 200; f < 12000; f *= 2 ** (1 / 24)) bands.push(['', f, f * 2 ** (1 / 24)]);
    const stands = bands.map(() => 0), most = bands.map(() => 0);
    for (let q = 0; q < 4; q++) {
      const t0 = from * 2 + ((to - from) * 2 * q) / 4;
      const p = bandPower(mono, t0, t0 + (to - from) / 2, bands, 16384).map(db10);
      const top = Math.max(...p);
      p.forEach((v, i) => {
        if (bands[i][1] < 3000 || v < top - 30) return;
        const hood = p.slice(Math.max(0, i - 10), i + 11).sort((a, b) => a - b);
        const over = v - hood[Math.floor(hood.length / 2)];
        if (over > 15) stands[i]++;
        most[i] = Math.max(most[i], over);
      });
    }
    const i = stands.indexOf(Math.max(...stands));
    if (stands[i] >= 3) fails.push(`${name}: a loud narrow line at ${bands[i][1].toFixed(0)} Hz stands up to ${most[i].toFixed(0)} dB above its neighbours for most of the cue`);
    else if (stands[i] > 0) console.log(`  (${name}: a narrow line at ${bands[i][1].toFixed(0)} Hz, ${most[i].toFixed(0)} dB above its neighbours, in ${stands[i]} of the cue's 4 quarters: a ringing partial, not a whistle)`);
  }
  console.log(`  short-term loudness by second (window centre): ${st.map(([t, v]) => `${t}:${v.toFixed(0)}`).join(' ')}`);

  // hits: where the onset really is
  console.log('\n  hits (onset against the bar line; the 50 ms before it against the 50 ms after)');
  const env = (t0, t1) => {
    // 1 ms steps of the mean square over 2 ms
    const out = [];
    for (let t = t0; t < t1; t += 0.001) {
      const a = Math.round(t * SR), n = Math.round(0.002 * SR);
      let s = 0;
      for (let i = Math.max(0, a); i < Math.min(N, a + n); i++) s += L[i] * L[i] + R[i] * R[i];
      out.push(s / (2 * n));
    }
    return out;
  };
  for (const [bar, kind, note] of map.hits) {
    const t = bar * 2;
    if (kind === 'cutout') {
      const before = loudnessOf(kl, kr, t - 1, t), after = loudnessOf(kl, kr, t + 0.5, t + 2);
      console.log(`  bar ${String(bar).padStart(2)} cutout: ${before.toFixed(1)} LUFS before → ${after.toFixed(1)} after (${(after - before).toFixed(1)} LU)`);
      continue;
    }
    const e = env(t - 0.08, t + 0.08), top = Math.max(...e.slice(80));
    const pre = e.slice(20, 75).reduce((s, v) => s + v, 0) / 55;
    // the onset: the first millisecond that stands clear of what came before and reaches a tenth of the hit's top
    let on = -1;
    for (let i = 60; i < e.length; i++) if (e[i] > Math.max(top * 0.1, pre * 3)) { on = i; break; }
    const off = on < 0 ? NaN : on - 80;
    const jump = db10(e.slice(80, 130).reduce((s, v) => s + v, 0) / 50) - db10(Math.max(pre, 1e-12));
    const line = `  bar ${String(bar).padStart(2)} ${kind.padEnd(7)} onset ${off >= 0 ? '+' : ''}${off} ms, jump ${jump.toFixed(1)} dB${note ? `  (${note.slice(0, 50)})` : ''}`;
    console.log(line);
    if (kind === 'impact') check(Math.abs(off) <= 10, `bar ${bar} impact lands within 10 ms of ${t} s (${off} ms)`);
  }

  // the story, piece by piece
  const quiet = (a, b, by = 8) => check(cue[a].loud <= cue[b].loud - by, `${a} (${cue[a].loud.toFixed(1)}) at least ${by} LU under ${b} (${cue[b].loud.toFixed(1)})`);
  const louder = (a, b) => check(cue[b].loud > cue[a].loud, `${b} (${cue[b].loud.toFixed(1)}) louder than ${a} (${cue[a].loud.toFixed(1)})`);
  const topAt = (bar) => {
    const best = (arr) => arr.reduce((m, v) => (v[1] > m[1] ? v : m));
    const m = best(mom), s = best(st);
    check(m[0] >= bar * 2 && m[0] < bar * 2 + 2, `the loudest 400 ms of the piece are at bar ${bar} (found at ${m[0].toFixed(1)} s, ${m[1].toFixed(1)} LUFS)`);
    check(s[0] - 1.5 >= bar * 2 - 1.01 && s[0] - 1.5 <= bar * 2 + 0.01, `the loudest 3 s window starts on the bar-${bar} hit (found ${(s[0] - 1.5).toFixed(0)}–${(s[0] + 1.5).toFixed(0)} s, ${s[1].toFixed(1)} LUFS)`);
  };
  if (piece === 'trailer') {
    for (const q of ['intro', 'break1', 'break2']) quiet(q, 'groove1');
    quiet('break1', 'groove2');
    quiet('break2', 'groove3');
    louder('garage', 'groove1');
    louder('groove1', 'groove2');
    louder('groove2', 'groove3');
    topAt(38);
  } else if (piece === 'teaser') {
    quiet('intro', 'groove');
    topAt(10);
  } else if (piece === 'rise') {
    louder('build', 'land');
    topAt(4);
  }
  // the grooves: energy across the range
  for (const r of rows.filter((r) => /^groove/.test(r.cue))) {
    const [sub, low, mid, high, air] = r.bands;
    if (sub > low + 6) fails.push(`bar ${r.b}: the sub booms (${sub.toFixed(0)} against ${low.toFixed(0)} dB)`);
    if (sub < mid - 18) fails.push(`bar ${r.b}: no sub (${sub.toFixed(0)} dB)`);
    if (air < mid - 38) fails.push(`bar ${r.b}: no air above 8 kHz (${air.toFixed(0)} dB)`);
    if (high < mid - 30) fails.push(`bar ${r.b}: dull (${high.toFixed(0)} dB at 4–8 kHz)`);
  }
  const worstLow = Math.min(...rows.filter((r) => r.lufs > -40).map((r) => r.lowKeep));
  check(worstLow > -1.5, `mono: the bass adds up (worst bar keeps ${worstLow.toFixed(1)} dB of it)`);
  const worstAll = Math.min(...rows.filter((r) => r.lufs > -40).map((r) => r.allKeep));
  check(worstAll > -3.5, `mono: nothing cancels (worst bar keeps ${worstAll.toFixed(1)} dB)`);

  if (png) {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-lavfi', 'showspectrumpic=s=1800x700:legend=1:fscale=log', png]);
    console.log(`  spectrogram: ${png}`);
  }
  console.log(fails.length ? `  ${fails.length} PROBLEM(S):\n   - ${fails.join('\n   - ')}` : '  all checks pass');
  return fails;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, piece, png] = process.argv.slice(2);
  if (!file || !piece) throw new Error('usage: analyze.mjs <file.wav> <trailer|teaser|calm|rise> [out.png]');
  await analyze(file, piece, { png });
}
