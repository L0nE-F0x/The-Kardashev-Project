// Measurements of a render (render.mjs calls `analyse`; or: node tools/audio/analyze.mjs file.wav [--json]).
// Loudness and true peak from ffmpeg's ebur128 (the broadcast meter); the rest in JavaScript:
//   peak / dc        sample peak, DC offset
//   clicks           isolated spikes in the second difference (a voice starting or stopping off zero), per minute
//   silence          share of 100 ms windows under −60 dBFS
//   bands            energy per octave (63 Hz … 16 kHz) relative to the loudest band: the mix's tilt
//   centroid         spectral centroid from the bands (Hz): dull < 900, bright > 3000 for music
//   width            1 − L/R correlation: 0 mono, ~0.3 wide, > 0.8 phasey
//   loudness curve   short-term LUFS every 3 s (ffmpeg), so a section that drops out or jumps shows
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

function ebur(file) {
  let log = '';
  // ffmpeg writes the meter to stderr
  try {
    log = execFileSync('bash', ['-c', `ffmpeg -hide_banner -nostats -loglevel verbose -i "${file}" -af ebur128=peak=true -f null - 2>&1`], { encoding: 'utf8', maxBuffer: 1 << 28 });
  } catch (e) {
    log = String(e.stdout ?? e);
  }
  const tail = log.slice(log.lastIndexOf('Summary:'));
  const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(tail)?.[1]);
  const LRA = Number(/LRA:\s+([\d.]+) LU/.exec(tail)?.[1]);
  const TP = Number(/Peak:\s+(-?[\d.inf]+) dBFS/.exec(tail)?.[1]);
  // short-term loudness (S:) every 3 s
  const curve = [];
  let next = 3;
  for (const m of log.matchAll(/t:\s*([\d.]+)\s+TARGET.*?S:\s*(-?[\d.]+|-inf)/g)) {
    const t = Number(m[1]);
    if (t + 0.05 >= next) {
      curve.push(m[2] === '-inf' ? -99 : Math.round(Number(m[2])));
      next += 3;
    }
  }
  return { I, LRA, TP, curve };
}

function biquadBand(x, sr, f0) {
  // a band-pass of one octave around f0 (RBJ cookbook, constant 0 dB peak), one channel
  const w = (2 * Math.PI * f0) / sr, q = 1.414;
  const al = Math.sin(w) / (2 * q), c = Math.cos(w);
  const b0 = al, b2 = -al, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, e = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
    e += y * y;
  }
  return e / x.length;
}

/** `pcm`: interleaved stereo float32. */
export function analyse(pcm, sr, file, { gainDb = 0 } = {}) {
  const n = pcm.length / 2;
  const mono = new Float32Array(n);
  let peak = 0, dc = 0, sl = 0, sr2 = 0, slr = 0;
  for (let i = 0; i < n; i++) {
    const l = pcm[2 * i], r = pcm[2 * i + 1];
    mono[i] = (l + r) / 2;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    dc += l + r;
    sl += l * l;
    sr2 += r * r;
    slr += l * r;
  }
  dc /= 2 * n;
  const corr = sl > 0 && sr2 > 0 ? slr / Math.sqrt(sl * sr2) : 1;
  // clicks: a second-difference spike far above its neighbourhood (10 ms), and not tiny
  let clicks = 0;
  const win = Math.round(sr * 0.01);
  let acc = 0;
  const d2 = new Float32Array(n);
  for (let i = 2; i < n; i++) d2[i] = mono[i] - 2 * mono[i - 1] + mono[i - 2];
  for (let i = 0; i < Math.min(n, win); i++) acc += d2[i] * d2[i];
  for (let i = win; i < n - win; i++) {
    acc += d2[i + win] * d2[i + win] - d2[i - win] * d2[i - win];
    const rms = Math.sqrt(Math.max(acc, 0) / (2 * win));
    if (Math.abs(d2[i]) > 0.02 && Math.abs(d2[i]) > 9 * rms) {
      clicks++;
      i += win; // one event, not its samples
    }
  }
  // silence
  const w100 = Math.round(sr * 0.1);
  let quiet = 0, wins = 0;
  for (let i = 0; i + w100 <= n; i += w100) {
    let s = 0;
    for (let j = i; j < i + w100; j++) s += mono[j] * mono[j];
    wins++;
    if (10 * Math.log10(s / w100 + 1e-20) < -60) quiet++;
  }
  // bands (a decimated copy for speed on the low ones is not worth it: a few seconds for two minutes)
  const centres = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const e = centres.map((f) => (f < sr / 2.2 ? biquadBand(mono, sr, f) : 0));
  const top = Math.max(...e);
  const bands = Object.fromEntries(centres.map((f, i) => [f, e[i] > 0 ? Math.round(10 * Math.log10(e[i] / top)) : -99]));
  let num = 0, den = 0;
  centres.forEach((f, i) => {
    num += f * e[i];
    den += e[i];
  });
  const lu = file ? ebur(file) : {};
  return {
    file,
    secs: +(n / sr).toFixed(1),
    lufs: Number.isFinite(lu.I) ? +(lu.I - gainDb).toFixed(1) : null,
    lra: lu.LRA ?? null,
    truePeak: Number.isFinite(lu.TP) ? +(lu.TP - gainDb).toFixed(1) : null,
    peak: +(20 * Math.log10(peak / Math.pow(10, gainDb / 20) + 1e-12)).toFixed(1),
    dc: +dc.toFixed(4),
    clicksPerMin: +((clicks / (n / sr)) * 60).toFixed(1),
    silence: +(quiet / Math.max(1, wins)).toFixed(2),
    centroid: Math.round(num / Math.max(den, 1e-20)),
    width: +(1 - corr).toFixed(2),
    bands,
    curve: lu.curve ?? [],
  };
}

export function formatAnalysis(a) {
  const b = Object.entries(a.bands).map(([f, v]) => `${f >= 1000 ? f / 1000 + 'k' : f}:${v}`).join(' ');
  return [
    `${a.file}  ${a.secs}s  render ${a.renderMs ?? '?'} ms (${a.realtime ?? '?'}× realtime)  NaN ${a.nan ?? '?'}`,
    `  loudness ${a.lufs} LUFS  LRA ${a.lra}  true peak ${a.truePeak} dBFS  peak ${a.peak} dBFS  dc ${a.dc}`,
    `  clicks ${a.clicksPerMin}/min  silence ${Math.round(a.silence * 100)}%  centroid ${a.centroid} Hz  width ${a.width}`,
    `  bands (dB re loudest) ${b}`,
    `  short-term LUFS every 3 s: ${a.curve.join(' ')}`,
    a.errors?.length ? `  PAGE ERRORS:\n    ${a.errors.join('\n    ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('analyze.mjs')) {
  const file = process.argv[2];
  const buf = fs.readFileSync(file);
  // minimal WAV reader: 16- or 24-bit PCM stereo
  const ch = buf.readUInt16LE(22), sr = buf.readUInt32LE(24), bits = buf.readUInt16LE(34);
  let off = 12;
  while (buf.toString('ascii', off, off + 4) !== 'data') off += 8 + buf.readUInt32LE(off + 4);
  const len = buf.readUInt32LE(off + 4);
  const bytes = bits / 8;
  const frames = len / (bytes * ch);
  const pcm = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < 2; c++) {
      const p = off + 8 + (i * ch + Math.min(c, ch - 1)) * bytes;
      pcm[2 * i + c] = bits === 24 ? buf.readIntLE(p, 3) / 8388608 : buf.readInt16LE(p) / 32768;
    }
  const a = analyse(pcm, sr, file);
  console.log(process.argv.includes('--json') ? JSON.stringify(a) : formatAnalysis(a));
}
