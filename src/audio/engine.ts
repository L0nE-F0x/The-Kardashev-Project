/**
 * The shared WebAudio mix, created lazily on first use:
 *
 *   sfx · music (ducked under stings, a touch of air) · ambience ── each a dry input and two sends
 *        dry ─────────────────────────────────────┐
 *        reverb send → hall (a generated impulse) ─┤→ sub filter → glue compressor → limiter → ceiling → master → out
 *        delay send → ping-pong, tempo-synced ─────┘
 *
 * The master volume sits after the limiter, so turning the game down never changes how it is mixed, and the ceiling
 * (a soft clipper at −1.5 dBFS) is a hard promise that nothing clips whatever the limiter lets through.
 * One timer (`onPump`) drives every sequencer in small look-ahead windows; voices free their nodes when they end.
 */
import { seeded } from './score';

export interface Volumes {
  master: number;
  sfx: number;
  music: number;
  ambience: number;
}

/** A mix bus: its dry input and its sends to the shared reverb and delay. All three follow the bus's volume. */
export interface Bus {
  dry: GainNode;
  rev: GainNode;
  del: GainNode;
}

type BusName = 'sfx' | 'music' | 'amb';

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  buses: Record<BusName, Bus>;
  duck: GainNode[];
  /** The echo: its two lines, and the three gains that close it while its time changes. */
  delays: DelayNode[];
  echoGates: GainNode[];
}

// Bus levels at a full slider. Calibrated by measurement (the offline renders in the QA harness): with every slider
// at 100% the music sits near −16 LUFS and the limiter idles; the default sliders land it near −22.
const TRIM = { sfx: 0.62, music: 0.84, amb: 0.5 };
/** After the limiter: takes back the make-up gain browsers' compressors add, leaving ~1.5 dB under full scale. */
const POST = 0.82;
const CEILING = 0.84;
/** The echo's return level and the two gains round its loop (each echo two thirds of the last). */
const ECHO = [0.8, 0.66, 0.66];

let live: Graph | null = null;
/** The graph in use: the live one, or an offline render's while `renderOffline` runs. */
let g: Graph | null = null;
let offline = false;
const volumes: Volumes = { master: 0.8, sfx: 0.8, music: 0.6, ambience: 0.7 };
let suspendedByApp = false;
let delayTime = 0.5;

/**
 * The hall's impulse: two and a half seconds of decaying noise, darker as it dies (air and walls eat the highs
 * first), a few early reflections up front. One channel: a convolution is the dearest thing in the mix (measured:
 * a stereo one of this length costs as much as everything else on the idle bus put together), so the hall is
 * convolved once and widened afterwards (see `build`). Made once, in a few milliseconds.
 */
function impulse(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate, len = Math.floor(sr * 2.6);
  const buf = ctx.createBuffer(1, len, sr);
  const r = seeded(1977);
  const pre = Math.floor(sr * 0.018);
  const d = buf.getChannelData(0);
  // -60 dB in about 2.6 s, as a running product (no exponential per sample: this runs on the main thread)
  const fall = Math.exp(-2.65 / sr);
  let lp = 0, a = 0, env = 1;
  for (let i = pre; i < len; i++) {
    const n = i - pre;
    // the low-pass closes from ~11 kHz to ~2 kHz across the tail
    if (n % 64 === 0) a = Math.exp((-2 * Math.PI * (2000 + 9000 * Math.exp((-n / sr) * 2))) / sr);
    lp = lp * a + (r() * 2 - 1) * (1 - a);
    // a quick build (diffusion), then the decay
    d[i] = lp * Math.min(1, n / (0.035 * sr)) * env;
    env *= fall;
  }
  for (let k = 0; k < 7; k++) d[pre + Math.floor(sr * (0.007 + r() * 0.07))] += (r() > 0.5 ? 1 : -1) * 0.5 * (1 - k / 9);
  return buf;
}

/**
 * A filter for a voice. Its frequency is read once per render block (2.7 ms), not per sample: a biquad whose
 * frequency moves recomputes its coefficients as often as it reads it, and per sample that costs ten times as much
 * (measured) for a difference no ear can tell.
 */
export function voiceFilter(ctx: BaseAudioContext): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.frequency.automationRate = 'k-rate';
  f.detune.automationRate = 'k-rate';
  return f;
}

function build(ctx: AudioContext): Graph {
  const master = ctx.createGain();
  const mix = ctx.createGain();
  // rumble and any DC out, before the compressors can pump on it
  const sub = ctx.createBiquadFilter();
  sub.type = 'highpass';
  sub.frequency.value = 26;
  sub.Q.value = 0.7;
  // glue: a slow, soft-kneed 2:1 that leans on the loud passages only
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -18;
  glue.knee.value = 14;
  glue.ratio.value = 2;
  glue.attack.value = 0.03;
  glue.release.value = 0.28;
  // the limiter: fast and steep, for the peaks the glue lets through
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  const post = ctx.createGain();
  post.gain.value = POST;
  // the ceiling: transparent below it, a smooth bend into ±CEILING above (only ever touched by freak peaks)
  const ceiling = ctx.createWaveShaper();
  const curve = new Float32Array(2049);
  const knee = CEILING * 0.9;
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1, a = Math.abs(x);
    curve[i] = Math.sign(x) * (a <= knee ? a : knee + (CEILING - knee) * Math.tanh((a - knee) / (CEILING - knee)));
  }
  ceiling.curve = curve;
  mix.connect(sub);
  sub.connect(glue);
  glue.connect(limiter);
  limiter.connect(post);
  post.connect(ceiling);
  ceiling.connect(master);
  master.connect(ctx.destination);

  // the hall: sends are thinned below 220 Hz so bass never washes
  const revIn = ctx.createBiquadFilter();
  revIn.type = 'highpass';
  revIn.frequency.value = 220;
  revIn.Q.value = 0.5;
  const hall = ctx.createConvolver();
  // one convolution: the sends are summed to mono on the way in
  hall.channelCount = 1;
  hall.channelCountMode = 'explicit';
  hall.buffer = impulse(ctx);
  // width: the right side is the same hall a moment later with its phases scrambled (three all-passes), so the two
  // sides are different rooms to the ear; a third of the left is mixed back in so the tail still adds up in mono
  const wide = ctx.createChannelMerger(2);
  let right: AudioNode = hall;
  for (const freq of [420, 1600, 5200]) {
    const ap = ctx.createBiquadFilter();
    ap.type = 'allpass';
    ap.frequency.value = freq;
    ap.Q.value = 0.6;
    right.connect(ap);
    right = ap;
  }
  const late = ctx.createDelay(0.1);
  late.delayTime.value = 0.019;
  const shared = ctx.createGain();
  shared.gain.value = 0.35;
  right.connect(late);
  hall.connect(wide, 0, 0);
  late.connect(wide, 0, 1);
  hall.connect(shared);
  shared.connect(wide, 0, 1);
  const revOut = ctx.createGain();
  revOut.gain.value = 0.9;
  revIn.connect(hall);
  wide.connect(revOut);
  revOut.connect(mix);

  // the delay: left and right feed each other (ping-pong), each echo darker and thinner than the last
  const delIn = ctx.createGain();
  const dl = ctx.createDelay(2), dr = ctx.createDelay(2);
  dl.delayTime.value = delayTime;
  dr.delayTime.value = delayTime;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 3400;
  tone.Q.value = 0.5;
  const thin = ctx.createBiquadFilter();
  thin.type = 'highpass';
  thin.frequency.value = 320;
  thin.Q.value = 0.5;
  const cross = ctx.createGain(), fb = ctx.createGain();
  cross.gain.value = ECHO[1];
  fb.gain.value = ECHO[2];
  const merge = ctx.createChannelMerger(2);
  const delOut = ctx.createGain();
  delOut.gain.value = ECHO[0];
  delIn.connect(thin);
  thin.connect(dl);
  dl.connect(tone);
  tone.connect(cross);
  cross.connect(dr);
  dr.connect(fb);
  fb.connect(dl);
  dl.connect(merge, 0, 0);
  dr.connect(merge, 0, 1);
  merge.connect(delOut);
  delOut.connect(mix);
  // echoes trail off into the hall
  const delToRev = ctx.createGain();
  delToRev.gain.value = 0.25;
  merge.connect(delToRev);
  delToRev.connect(revIn);

  // the score's instruments are warm by design: a mastering shelf gives the music back its air
  const air = ctx.createBiquadFilter();
  air.type = 'highshelf';
  air.frequency.value = 5500;
  air.gain.value = 4;
  air.connect(mix);

  const duck: GainNode[] = [];
  const bus = (ducked: boolean): Bus => {
    const mk = (to: AudioNode) => {
      const vol = ctx.createGain();
      if (ducked) {
        const d = ctx.createGain();
        vol.connect(d);
        d.connect(to);
        duck.push(d);
      } else vol.connect(to);
      return vol;
    };
    return { dry: mk(ducked ? air : mix), rev: mk(revIn), del: mk(delIn) };
  };
  return { ctx, master, buses: { sfx: bus(false), music: bus(true), amb: bus(false) }, duck, delays: [dl, dr], echoGates: [delOut, cross, fb] };
}

export function audioCtx(): AudioContext | null {
  try {
    if (offline) return g?.ctx ?? null;
    if (!live) {
      live = g = build(new AudioContext());
      applyVolumes(0);
      // make the noise the kits, beds and whooshes will ask for now, a piece at a time, so none of it lands in a busy frame
      (['white', 'pink', 'brown'] as const).forEach((kind, i) => window.setTimeout(() => !offline && noiseBuffer(kind), 150 * (i + 1)));
    }
    if (live.ctx.state === 'suspended' && !suspendedByApp) void live.ctx.resume();
    return live.ctx;
  } catch {
    return null;
  }
}

/** True when sound scheduled now will be heard (the context runs, or an offline render is being set up). */
export function audioRunning(): boolean {
  return offline || audioCtx()?.state === 'running';
}

export function mixBus(name: BusName): Bus | null {
  return audioCtx() && g ? g.buses[name] : null;
}

export function sfxBus(): GainNode | null {
  return mixBus('sfx')?.dry ?? null;
}

export function musicBus(): GainNode | null {
  return mixBus('music')?.dry ?? null;
}

function applyVolumes(tau = 0.06) {
  if (!g) return;
  const t = g.ctx.currentTime;
  const set = (p: AudioParam, v: number) => (tau ? p.setTargetAtTime(v, t, tau) : p.setValueAtTime(v, t));
  set(g.master.gain, volumes.master);
  for (const [name, v] of [['sfx', volumes.sfx * TRIM.sfx], ['music', volumes.music * TRIM.music], ['amb', volumes.ambience * TRIM.amb]] as const) {
    set(g.buses[name].dry.gain, v);
    set(g.buses[name].rev.gain, v);
    set(g.buses[name].del.gain, v);
  }
}

export function setVolumes(v: Partial<Volumes>): void {
  for (const k of Object.keys(v) as (keyof Volumes)[]) if (typeof v[k] === 'number') volumes[k] = Math.max(0, Math.min(1, v[k]!));
  applyVolumes();
}

export function getVolumes(): Volumes {
  return { ...volumes };
}

/** Pause all audio (tab hidden, app backgrounded). */
export function suspendAudio(): void {
  suspendedByApp = true;
  void live?.ctx.suspend();
}

export function resumeAudio(): void {
  suspendedByApp = false;
  void live?.ctx.resume();
}

/** Browsers only allow audio after a user gesture: unlock on the first one. */
export function unlockOnGesture(onUnlock: () => void): void {
  const go = () => {
    window.removeEventListener('pointerdown', go);
    window.removeEventListener('keydown', go);
    audioCtx();
    onUnlock();
  };
  window.addEventListener('pointerdown', go);
  window.addEventListener('keydown', go);
}

/** Glide a parameter to a value from wherever it is now (no jump, whatever was scheduled before). */
export function glide(p: AudioParam, value: number, t: number, tau: number): void {
  if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
  else p.cancelScheduledValues(t);
  p.setTargetAtTime(value, t, tau);
}

/**
 * Dip the music under a moment that matters (a sting, a decision card): down by `depth` in a blink, held for
 * `hold` seconds, then back up slowly enough that nobody notices it return.
 */
export function duckMusic(depth = 0.5, hold = 1.2): void {
  if (!audioCtx() || !g) return;
  const t = g.ctx.currentTime;
  for (const d of g.duck) {
    glide(d.gain, 1 - depth, t, 0.05);
    d.gain.setTargetAtTime(1, t + 0.15 + hold, 0.6);
  }
}

/** Set the echo's time (the score keeps it on the beat: usually a dotted eighth). */
export function setDelayTime(seconds: number): void {
  const next = Math.max(0.05, Math.min(1.9, seconds));
  if (next === delayTime) return;
  delayTime = next;
  if (!g) return;
  // a delay line can't change length with echoes in it (they bend, or tear): close its return and its loop for a
  // moment, jump while nothing passes, open again. The gap is a tenth of a second of missing echo
  const t = g.ctx.currentTime;
  g.echoGates.forEach((gate, k) => {
    glide(gate.gain, 0, t, 0.012);
    gate.gain.setTargetAtTime(ECHO[k], t + 0.14, 0.05);
  });
  for (const d of g.delays) d.delayTime.setValueAtTime(delayTime, t + 0.11);
}

// ── the pump: one look-ahead timer for every sequencer ──────────────────────────────────────
type Pump = (until: number, now: number) => void;
const pumps = new Set<Pump>();
let timer: number | null = null;
let watching = false;

function pumpAll() {
  if (offline || !live || live.ctx.state !== 'running') return;
  const now = live.ctx.currentTime;
  // a hidden tab's timers fire once a second: look further ahead there so the music doesn't starve
  const ahead = document.hidden ? 2.2 : 0.3;
  for (const p of [...pumps]) {
    try {
      p(now + ahead, now);
    } catch {
      // a broken sequencer must never take the others (or the game) with it
      pumps.delete(p);
    }
  }
}

/**
 * Register a sequencer: `fn(until, now)` schedules everything that starts before `until` (context time).
 * Called every ~90 ms while audio runs. Returns the function that unregisters it.
 */
export function onPump(fn: Pump): () => void {
  pumps.add(fn);
  if (timer === null) {
    timer = window.setInterval(pumpAll, 90);
    // going to the background: schedule the long window at once, before the timer slows down
    if (!watching) document.addEventListener('visibilitychange', pumpAll);
    watching = true;
  }
  return () => {
    pumps.delete(fn);
    if (!pumps.size && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

/** When `src` finishes, disconnect it and everything named: a finished voice leaves nothing in the graph. */
export function freeWhenDone(src: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
  src.onended = () => {
    src.onended = null;
    src.disconnect();
    for (const n of nodes) n.disconnect();
  };
}

// ── noise ───────────────────────────────────────────────────────────────────────────────────
const noiseBufs = new Map<string, AudioBuffer>();

/**
 * Six seconds of looping stereo noise: white (hiss), pink (rain, surf, air) or brown (wind, rumble). Left and right
 * share a third of their signal, so beds are wide but still add up in mono.
 */
export function noiseBuffer(kind: 'white' | 'pink' | 'brown'): AudioBuffer {
  const ctx = g!.ctx;
  const key = `${kind}@${ctx.sampleRate}`;
  let buf = noiseBufs.get(key);
  if (buf) return buf;
  const len = ctx.sampleRate * 6, fold = Math.floor(ctx.sampleRate * 0.06);
  buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const r = seeded(kind.length * 7919);
  const colour = () => {
    // Paul Kellet's pink filter; brown is a leaky integrator
    let b0 = 0, b1 = 0, b2 = 0, br = 0;
    return (w: number) => {
      if (kind === 'white') return w * 0.5;
      if (kind === 'brown') return (br = br * 0.985 + w * 0.06) * 1.6;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      return (b0 + b1 + b2 + w * 0.1848) * 0.11;
    };
  };
  const cl = colour(), cr = colour(), cm = colour();
  const L = new Float32Array(len + fold), R = new Float32Array(len + fold);
  for (let i = 0; i < len + fold; i++) {
    const m = cm(r() * 2 - 1) * 0.58;
    L[i] = cl(r() * 2 - 1) * 0.82 + m;
    R[i] = cr(r() * 2 - 1) * 0.82 + m;
  }
  // the loop point: what would have followed the end fades into the start, so a looping bed never ticks
  for (const d of [L, R])
    for (let i = 0; i < fold; i++) {
      const k = i / fold;
      d[i] = d[i] * Math.sqrt(k) + d[len + i] * Math.sqrt(1 - k);
    }
  buf.copyToChannel(L.subarray(0, len), 0);
  buf.copyToChannel(R.subarray(0, len), 1);
  noiseBufs.set(key, buf);
  return buf;
}

// ── offline rendering (the QA harness measures the real mix with it) ────────────────────────
/**
 * Render `seconds` of the whole mix (buses, hall, delay, compressors, ceiling) without playing it. `setup` starts
 * whatever should play; `cues` run at their times (a sting, a mood change). Sequencers are pumped in half-second
 * steps exactly as they are live. The live graph is put back afterwards.
 */
export async function renderOffline(seconds: number, setup: () => void, cues: [number, () => void][] = [], sampleRate = 48000): Promise<AudioBuffer> {
  const octx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const keep = { g, pumps: [...pumps] };
  pumps.clear();
  offline = true;
  try {
    g = build(octx as unknown as AudioContext);
    applyVolumes(0);
    setup();
    const todo = [...cues].sort((a, b) => a[0] - b[0]);
    const STEP = 0.5;
    const step = (t: number) => {
      while (todo.length && todo[0][0] <= t + 1e-6) todo.shift()![1]();
      for (const p of [...pumps]) p(t + STEP + 0.3, t);
    };
    step(0);
    for (let t = STEP; t < seconds; t += STEP)
      void octx.suspend(t).then(() => {
        step(t);
        void octx.resume();
      });
    return await octx.startRendering();
  } finally {
    offline = false;
    pumps.clear();
    for (const p of keep.pumps) pumps.add(p);
    g = keep.g;
  }
}
