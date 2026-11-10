/**
 * The cinematic score's player: walks a track's sections bar by bar, voices the chords, hands each bar to the
 * track's arranger (tracks.ts) and schedules what it asks for in small look-ahead windows. It also owns the mood:
 * rhythm rests while the game is paused, a drive layer joins at speed, a tension layer in a finale.
 */
import { glide, mixBus, onPump, setDelayTime } from './engine';
import { bassNote, chords, drop2, melody, seeded, voice, MAJOR, type Chord, type MelNote } from './score';
import { makeKit, makePad, makePluck, strip, type Group, type Outs, type Strip } from './synth';

export interface Mood {
  /** The game is paused or waiting on the player: the rhythm section rests, the rest softens. */
  calm: boolean;
  /** 0..1: the clock runs fast. */
  drive: number;
  /** 0..1: a finale or a crisis. */
  tension: number;
}

export interface SecDef {
  /** Chords, a bar between `|` (one or two chords; `.` holds the bar before). */
  ch: string;
  /** The tune, in scale degrees and steps (score.ts `melody`). */
  mel?: string;
  /** This section's key, when it leaves the track's (the ending's lift). */
  tonic?: number;
}

/** One bar, as a track's arranger sees it. */
export interface Bar {
  sec: string;
  /** Bar in the section, the section's length, bars since the track began, times this section has come round. */
  i: number;
  len: number;
  n: number;
  turn: number;
  /** How many times the whole form has been played (0 = the first, composed statement). */
  pass: number;
  /** The section after this one. */
  next: string;
  /** The chord at the top of the bar, voiced; `fresh` when it is newly struck; `hold` = bars until the next one. */
  ch: Chord;
  v: number[];
  bass: number;
  fresh: boolean;
  hold: number;
  /** A second chord from the middle of the bar, if any. */
  v2: number[] | null;
  bass2: number;
  /** The tune's notes that start in this bar (`at` counted from the bar line). */
  mel: MelNote[];
  tonic: number;
  mood: Mood;
  /** Seeded randomness: `r()` per call; `x[k]` is fixed for the section (all 0 on the first pass: the full arrangement). */
  r: () => number;
  x: number[];
  steps: number;
  /** Seconds in `n` steps. */
  dur(n: number): number;
  /** Schedule `fn(t)` at a step of this bar; `human` loosens it by a few milliseconds. */
  at(step: number, fn: (t: number) => void, human?: boolean): void;
}

export interface Setup {
  ctx: BaseAudioContext;
  r: () => number;
  strip(name: string, o: Parameters<typeof strip>[2]): Strip;
  /** Something to stop when the track ends (a looping bed). */
  onStop(fn: () => void): void;
}

export interface TrackDef {
  /** Beats a minute, steps a bar (16 = sixteenths in 4/4, 12 = eighths in 12/8) and steps a beat. */
  bpm: number;
  steps: 12 | 16;
  beat: number;
  /** Odd sixteenths arrive late by this share of a step. */
  swing?: number;
  /** MIDI note of degree 1 for the tunes, and the scale they are written in. */
  tonic: number;
  mode?: number[];
  /** The echo's time, in steps. */
  delay: number;
  /** Where the chord voicings sit, how many voices, and whether they open up (drop 2). */
  lo: number;
  hi: number;
  size?: number;
  open?: boolean;
  bassLo: number;
  /** Overall trim so every track lands at the same loudness. */
  gain: number;
  secs: Record<string, SecDef>;
  /** The order of sections for a pass through the piece. */
  form(pass: number, r: () => number): string[];
  setup(k: Setup): (c: Bar) => void;
}

interface Sec {
  bars: Chord[][];
  mel: MelNote[][];
  tonic: number;
}

const GROUP_GAIN: Record<Group, (m: Mood) => number> = {
  core: (m) => (m.calm ? 0.9 : 1),
  rhythm: (m) => (m.calm ? 0 : 1),
  drive: (m) => (m.calm ? 0 : m.drive),
  tension: (m) => m.tension,
};

export class Cinematic {
  /** The channel strips by name (the QA harness solos them to balance the mix). */
  readonly strips = new Map<string, Strip>();
  private ctx: BaseAudioContext;
  private fades: GainNode[] = [];
  private tone: BiquadFilterNode;
  private outs: Outs;
  private secs = new Map<string, Sec>();
  private arrange: (c: Bar) => void;
  private stops: (() => void)[] = [];
  private unpump: (() => void) | null = null;
  private events: { t: number; fn: (t: number) => void }[] = [];
  private r: () => number;
  private stepDur: number;
  private nextBar = 0;
  private form: string[] = [];
  private formAt = -1;
  private pass = -1;
  private secBar = 0;
  private n = 0;
  private turns = new Map<string, number>();
  private x: number[] = [];
  private prev: number[] | null = null;
  /** The voicing still sounding from the bar before (a chord held over the bar line). */
  private held: number[] | null = null;
  private tense: ((c: Bar) => void) | null = null;

  constructor(private readonly def: TrackDef, private mood: Mood, ctx: BaseAudioContext, seed = 1) {
    this.ctx = ctx;
    this.r = seeded(seed * 7919 + def.bpm);
    this.stepDur = 60 / def.bpm / def.beat;
    const bus = mixBus('music')!;
    const dry = ctx.createGain(), rev = ctx.createGain(), del = ctx.createGain();
    // paused: the top comes off the dry sound, as if the score moved to the next room
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.Q.value = 0.5;
    this.tone.frequency.value = mood.calm ? 3200 : 18000;
    dry.connect(this.tone);
    this.outs = { dry, rev, del };
    for (const [from, to] of [[this.tone, bus.dry], [rev, bus.rev], [del, bus.del]] as const) {
      const f = ctx.createGain();
      f.gain.value = 0;
      from.connect(f);
      f.connect(to);
      this.fades.push(f);
    }
    for (const [name, s] of Object.entries(def.secs)) {
      const bars = chords(s.ch);
      const mel: MelNote[][] = bars.map(() => []);
      for (const m of s.mel ? melody(s.mel, def.steps, def.mode ?? MAJOR) : []) {
        const b = Math.floor(m.at / def.steps);
        if (b < mel.length) mel[b].push({ ...m, at: m.at - b * def.steps });
      }
      this.secs.set(name, { bars, mel, tonic: s.tonic ?? def.tonic });
    }
    this.arrange = def.setup({
      ctx,
      r: this.r,
      strip: (name, o) => this.addStrip(name, o),
      onStop: (fn) => this.stops.push(fn),
    });
  }

  private addStrip(name: string, o: Parameters<typeof strip>[2]): Strip {
    const s = strip(this.ctx, this.outs, o);
    s.fader.gain.value = s.level * GROUP_GAIN[s.group](this.mood);
    this.strips.set(name, s);
    return s;
  }

  /** Start playing, fading in after `wait` seconds (the track before is still fading out). */
  start(wait = 0): void {
    const t = this.ctx.currentTime + wait;
    for (const f of this.fades) f.gain.setTargetAtTime(this.def.gain, t, 0.5);
    setDelayTime(this.stepDur * this.def.delay);
    this.nextBar = t + 0.12;
    this.unpump = onPump((until, now) => this.pump(until, now));
  }

  /** Fade out over about `fade` seconds, then take the whole track out of the graph. */
  stop(fade = 2.5): void {
    this.unpump?.();
    this.unpump = null;
    this.events = [];
    const t = this.ctx.currentTime;
    for (const f of this.fades) glide(f.gain, 0, t, fade / 4);
    const killAt = t + fade + 0.5;
    const off = onPump((_until, now) => {
      if (now < killAt) return;
      off();
      for (const fn of this.stops) fn();
      for (const s of this.strips.values()) for (const n of s.nodes) n.disconnect();
      for (const n of [this.outs.dry, this.outs.rev, this.outs.del, this.tone, ...this.fades]) n.disconnect();
    });
  }

  setMood(m: Mood): void {
    this.mood = m;
    const t = this.ctx.currentTime;
    for (const s of this.strips.values()) glide(s.fader.gain, s.level * GROUP_GAIN[s.group](m), t, 0.35);
    glide(this.tone.frequency, m.calm ? 3200 : 18000, t, 0.4);
  }

  private pump(until: number, now: number): void {
    const barDur = this.stepDur * this.def.steps;
    // a stalled timer (a sleeping laptop): pick the piece up at the next bar instead of replaying what was missed
    if (now > this.nextBar + barDur) {
      this.events = [];
      this.nextBar = now + 0.1;
    }
    for (;;) {
      while (this.events.length && this.events[0].t < until) {
        const e = this.events.shift()!;
        if (e.t > now - 0.03) e.fn(Math.max(e.t, now + 0.003));
      }
      if (this.nextBar >= until) return;
      this.compile(this.nextBar);
      this.nextBar += barDur;
    }
  }

  /** The section the form moves to next (without moving). */
  private peek(): string {
    return this.formAt + 1 < this.form.length ? this.form[this.formAt + 1] : this.def.form(this.pass + 1, seeded(this.pass * 31 + 17))[0];
  }

  private compile(t0: number): void {
    const def = this.def;
    let sec = this.secs.get(this.form[this.formAt]);
    if (!sec || this.secBar >= sec.bars.length) {
      if (++this.formAt >= this.form.length) {
        this.pass++;
        this.form = def.form(this.pass, seeded(this.pass * 31 + 17));
        this.formAt = 0;
      }
      const name = this.form[this.formAt];
      sec = this.secs.get(name)!;
      this.secBar = 0;
      this.turns.set(name, (this.turns.get(name) ?? -1) + 1);
      this.x = Array.from({ length: 8 }, () => (this.pass === 0 ? 0 : this.r()));
    }
    const name = this.form[this.formAt];
    const i = this.secBar++;
    const bar = sec.bars[i];
    const size = def.size ?? 4;
    const voiceIt = (c: Chord) => {
      const v = voice(c, this.prev, def.lo, def.hi, size);
      this.prev = v;
      return def.open ? drop2(v) : v;
    };
    const fresh = i === 0 || sec.bars[i - 1] !== bar;
    const v = fresh || !this.held ? voiceIt(bar[0]) : this.held;
    this.held = v;
    let hold = 1;
    while (i + hold < sec.bars.length && sec.bars[i + hold] === bar) hold++;
    const events = this.events;
    const swing = def.swing ?? 0;
    const c: Bar = {
      sec: name, i, len: sec.bars.length, n: this.n++, turn: this.turns.get(name) ?? 0, pass: this.pass,
      next: i === sec.bars.length - 1 ? this.peek() : name,
      ch: bar[0], v, bass: bassNote(bar[0], def.bassLo), fresh, hold,
      v2: bar[1] ? voiceIt(bar[1]) : null, bass2: bar[1] ? bassNote(bar[1], def.bassLo) : 0,
      mel: sec.mel[i], tonic: sec.tonic, mood: this.mood, r: this.r, x: this.x, steps: def.steps,
      dur: (n) => n * this.stepDur,
      at: (step, fn, human) => {
        const late = (step % 2 ? swing * this.stepDur : 0) + (human ? this.r() * 0.014 : 0);
        events.push({ t: t0 + step * this.stepDur + late, fn });
      },
    };
    if (bar[1]) this.held = c.v2;
    this.arrange(c);
    if (this.mood.tension > 0) (this.tense ??= this.tension())(c);
    events.sort((a, b) => a.t - b.t);
  }

  /**
   * The finale layer, the same in every key: a low ostinato on the dominant, a heartbeat, a thin high line that
   * never resolves. All diatonic, so it shades whatever the track is playing instead of fighting it.
   */
  private tension(): (c: Bar) => void {
    const ost = makePluck(this.ctx, this.addStrip('tension', { gain: 0.5, group: 'tension', rev: 0.3, del: 0.15 }), { wave: 'warm', cut: 700, q: 2.2, decay: 0.3 });
    const high = makePad(this.ctx, this.addStrip('tension-high', { gain: 0.16, group: 'tension', rev: 0.7 }), this.r, { wave: 'glass', cut: 3000, attack: 1.5, release: 2.5, detune: 14 });
    const kit = makeKit(this.ctx, this.addStrip('tension-kit', { gain: 0.5, group: 'tension', rev: 0.3 }), this.r);
    return (c) => {
      const fifth = 76 + ((c.tonic + 7 - 76) % 12 + 12) % 12;
      const low = 36 + ((fifth - 36) % 12 + 12) % 12;
      const eighth = c.steps === 12 ? 1 : 2;
      for (let s = 0; s < c.steps; s += eighth) {
        const accent = s % (c.steps / 4) === 0;
        c.at(s, (t) => ost(t, low + (accent ? 0 : 12), accent ? 0.8 : 0.4, 0, 0.8 + 0.4 * Math.sin(c.n * 0.4)));
      }
      c.at(0, (t) => kit.kick(t, 0.5, { f0: 70, f1: 38, decay: 0.35 }));
      c.at(c.steps === 12 ? 2 : 3, (t) => kit.kick(t, 0.32, { f0: 64, f1: 36, decay: 0.3 }));
      if (c.n % 2 === 0) c.at(0, (t) => high(t, [fifth, fifth + 2], c.dur(c.steps * 2), 0.5));
      if (c.n % 8 === 4) c.at(0, (t) => kit.boom(t, 0.6));
    };
  }
}
