/**
 * The marketing score's own player. The game's `Cinematic` starts a beat late and loops; a trailer cue is one fixed
 * timeline, so this file keeps only what it needs: a list of events at exact times (bar N starts at N × 2 s, to the
 * sample), pumped through the game's real mix (`renderOffline` in src/audio/engine.ts: buses, hall, echo, glue
 * compressor, limiter), with the game's instruments (src/audio/synth.ts) and its chord and melody notation
 * (src/audio/score.ts). Nothing under src/ is changed.
 */
import { mixBus, onPump, renderOffline, setDelayTime, setVolumes } from '../../../src/audio/engine';
import { bassNote, chords, drop2, melody, seeded, voice, MAJOR, type Chord } from '../../../src/audio/score';
import { strip, type Outs, type Strip } from '../../../src/audio/synth';

/** 120 BPM in 4/4: a bar is 2 s, a sixteenth 0.125 s (the same clock as tools/trailer/music-map.mjs). */
export const BAR = 2;
export const STEP = BAR / 16;
/** What to render: everything, the music alone, or the hits, risers and rumbles alone. */
export type Stem = 'full' | 'music' | 'fx';

type StripOpts = Parameters<typeof strip>[2];

export class Session {
  readonly ctx: BaseAudioContext;
  readonly r: () => number;
  readonly events: { t: number; fn: (t: number) => void }[] = [];
  readonly strips = new Map<string, Strip>();
  private groups: Record<'music' | 'fx', Outs>;
  /** In the music's dry path: `gap` closes it for the breath before a hit. */
  private breath: GainNode;
  /** The music group's faders (dry, hall send, echo send): `ride` moves all three. */
  private faders: GainNode[] = [];
  private musicLevel: number;

  /** `solo` = the one strip left sounding (balance.mjs measures the mix a strip at a time). */
  constructor(stem: Stem, seed: number, level: { music: number; fx: number }, private solo: string | null = null) {
    const m = mixBus('music')!, f = mixBus('sfx')!;
    const ctx = (this.ctx = m.dry.context);
    this.r = seeded(seed);
    const fader = (dest: AudioNode, gain: number) => {
      const g = ctx.createGain();
      g.gain.value = gain;
      g.connect(dest);
      return g;
    };
    this.musicLevel = stem === 'fx' ? 0 : level.music;
    const fxLevel = stem === 'music' ? 0 : level.fx;
    this.faders = [fader(m.dry, this.musicLevel), fader(m.rev, this.musicLevel), fader(m.del, this.musicLevel)];
    this.breath = fader(this.faders[0], 1);
    this.groups = {
      music: { dry: this.breath, rev: this.faders[1], del: this.faders[2] },
      fx: { dry: fader(f.dry, fxLevel), rev: fader(f.rev, fxLevel), del: fader(f.del, fxLevel) },
    };
  }

  strip(name: string, o: StripOpts, group: 'music' | 'fx' = 'music'): Strip {
    const s = strip(this.ctx, this.groups[group], o);
    if (this.solo && this.solo !== name) s.fader.gain.value = 0;
    this.strips.set(name, s);
    return s;
  }

  /** Schedule `fn(t)` at a sixteenth of a bar (steps past 15 run on into the next bars; fractions are fine). */
  at(bar: number, step: number, fn: (t: number) => void): void {
    this.events.push({ t: bar * BAR + step * STEP, fn });
  }

  atT(t: number, fn: (t: number) => void): void {
    this.events.push({ t, fn });
  }

  /**
   * The breath before a hit: the music's dry sound falls away over the last `len` seconds before `t` and is back,
   * whole, on `t` itself (the hall and the echo keep ringing, so it is a held breath and not a hole).
   */
  gap(t: number, len = 0.11, floor = 0.08): void {
    this.atT(Math.max(0, t - len - 0.05), () => {
      const g = this.breath.gain;
      g.setValueAtTime(1, t - len);
      g.linearRampToValueAtTime(floor, t - 0.035);
      g.setValueAtTime(floor, t - 0.002);
      g.linearRampToValueAtTime(1, t);
    });
  }

  /**
   * Ride the whole music group (dry and sends): from `t`, a straight line to `to` (1 = the piece's level) over
   * `over` seconds. Rides must be written in the order they happen and must not overlap.
   */
  ride(t: number, to: number, over = 0.02): void {
    const from = this.rode;
    this.rode = to;
    this.atT(Math.max(0, t - 0.01), () => {
      for (const f of this.faders) {
        f.gain.setValueAtTime(this.musicLevel * from, t);
        f.gain.linearRampToValueAtTime(this.musicLevel * to, t + over);
      }
    });
  }

  private rode = 1;
}

export interface PieceDef {
  bars: number;
  tail: number;
  seed: number;
  /** Levels into the game's music and sfx buses (the loudness calibration, by measurement). */
  level: { music: number; fx: number };
  build(k: Session): void;
}

/** Extra seconds rendered after the piece: the mix's two compressors delay everything by a few milliseconds. */
export const PAD = 0.25;

/**
 * Render a piece through the game's mix. Every random number comes from the piece's seed, so the same sources give
 * the same music; two renders are still not the same bytes: Chrome adds up a node's inputs in an order that changes
 * from run to run, the rounding differs in the last bit, and the mix's compressors magnify that (measured: renders
 * differ by noise around −85 dBFS, −65 at worst).
 */
export async function renderPiece(def: PieceDef, stem: Stem, solo: string | null = null, names?: string[]): Promise<AudioBuffer> {
  setVolumes({ master: 1, sfx: 1, music: 1, ambience: 1 });
  // the echo: a dotted eighth at 120 BPM
  setDelayTime(STEP * 3);
  return renderOffline(def.bars * BAR + def.tail + PAD, () => {
    const k = new Session(stem, def.seed, def.level, solo);
    def.build(k);
    names?.push(...k.strips.keys());
    // a stable sort: events at the same instant keep the order they were written in
    const evs = k.events.map((e, i) => ({ ...e, i })).sort((a, b) => a.t - b.t || a.i - b.i);
    let at = 0;
    onPump((until) => {
      while (at < evs.length && evs[at].t < until) {
        const e = evs[at++];
        e.fn(e.t);
      }
    });
  });
}

// ── harmony and tunes ───────────────────────────────────────────────────────────────────────
export interface HBar {
  ch: Chord;
  /** The chord at the top of the bar, voiced; `fresh` when newly struck; `hold` = bars until the next one. */
  v: number[];
  bass: number;
  fresh: boolean;
  hold: number;
  /** A second chord from the middle of the bar, if any. */
  v2: number[] | null;
  bass2: number;
}

/** Voice a chord line the way the game's player does (close position, minimal movement between chords). */
export function harmony(line: string, o: { lo?: number; hi?: number; size?: number; bassLo?: number; open?: boolean; prev?: number[] | null } = {}): HBar[] {
  const { lo = 55, hi = 74, size = 4, bassLo = 33, open = false } = o;
  let prev = o.prev ?? null;
  const bars = chords(line);
  const voiceIt = (c: Chord) => {
    const v = voice(c, prev, lo, hi, size);
    prev = v;
    return open ? drop2(v) : v;
  };
  const out: HBar[] = [];
  let held: number[] | null = null;
  bars.forEach((bar, i) => {
    const fresh = i === 0 || bars[i - 1] !== bar;
    const v = fresh || !held ? voiceIt(bar[0]) : held;
    held = v;
    let hold = 1;
    while (i + hold < bars.length && bars[i + hold] === bar) hold++;
    const v2 = bar[1] ? voiceIt(bar[1]) : null;
    if (v2) held = v2;
    out.push({ ch: bar[0], v, bass: bassNote(bar[0], bassLo), fresh, hold, v2, bass2: bar[1] ? bassNote(bar[1], bassLo) : 0 });
  });
  return out;
}

/** The voicing and the bass sounding at a step of a bar. */
export const vAt = (h: HBar, step: number) => (h.v2 && step >= 8 ? h.v2 : h.v);
export const bassAt = (h: HBar, step: number) => (h.v2 && step >= 8 ? h.bass2 : h.bass);

export interface TuneNote {
  /** Steps from the start of the tune, the length in steps, the MIDI note. */
  at: number;
  len: number;
  m: number;
}

/** A tune in scale degrees (score.ts `melody`) as MIDI notes in a key. */
export function tune(line: string, tonic: number, mode = MAJOR): TuneNote[] {
  return melody(line, 16, mode).map((n) => ({ at: n.at, len: n.len, m: tonic + n.semi }));
}

export type Note = (t: number, m: number, dur: number, vel: number) => void;

/** Play a tune on an instrument from a bar on, the downbeats leaning in a little. */
export function sing(k: Session, bar0: number, notes: TuneNote[], play: Note, vel: number, oct = 0, legato = 0.96): void {
  for (const n of notes) {
    const v = vel * (n.at % 16 === 0 ? 1 : 0.9) * (0.95 + k.r() * 0.1);
    k.at(bar0, n.at, (t) => play(t, n.m + oct, n.len * STEP * legato, v));
  }
}
