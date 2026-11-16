/**
 * The marketing score's own player. The game's `Cinematic` starts a beat late, loops and follows the game's mood; a
 * trailer cue is one fixed timeline, so this file walks a piece's sections once, bar by bar, exactly as the game's
 * player does (the same voice-leading, the same `Bar` an arranger in src/audio/tracks/ receives, so arranging code
 * moves between the two unchanged), with every bar on the picture's clock: bar N starts at N × 2 s, to the sample.
 * It all goes through the game's real mix (`renderOffline` in src/audio/engine.ts: buses, hall, echo, glue
 * compressor, limiter) on the game's instruments (src/audio/voices/). Nothing under src/ is changed.
 */
import { mixBus, onPump, renderOffline, setDelayTime, setVolumes } from '../../../src/audio/engine';
import type { Bar, Mood } from '../../../src/audio/cinematic';
import { bassNote, chords, drop2, melody, seeded, voice, MAJOR, type Chord, type MelNote } from '../../../src/audio/score';
import { strip, type Outs, type Strip } from '../../../src/audio/synth';

/** 120 BPM in 4/4: a bar is 2 s, a sixteenth 0.125 s (the same clock as tools/trailer/music-map.mjs). */
export const BAR = 2;
export const STEP = BAR / 16;
/** What to render: everything, the music alone, or the hits, risers and rumbles alone. */
export type Stem = 'full' | 'music' | 'fx';

type StripOpts = Parameters<typeof strip>[2];

/** A bar as the game's arrangers see it, plus what a fixed timeline knows: the chord the next bar opens on. */
export interface TBar extends Bar {
  nextCh: Chord;
}

/** One section of a piece: who arranges it (`sec`), its key, its chords (a bar between `|`) and its tune. */
export interface SecDef {
  sec: string;
  /** MIDI note of degree 1. */
  tonic: number;
  ch: string;
  mel?: string;
}

const MOOD: Mood = { calm: false, drive: 1, tension: 0 };

export class Session {
  readonly ctx: BaseAudioContext;
  readonly r: () => number;
  readonly events: { t: number; fn: (t: number) => void }[] = [];
  readonly strips = new Map<string, Strip>();
  readonly stops: (() => void)[] = [];
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

  /** What an instrument's maker wants (the game's `Setup`). */
  get setup() {
    return { ctx: this.ctx, r: this.r, strip: (name: string, o: StripOpts) => this.strip(name, o), onStop: (fn: () => void) => void this.stops.push(fn) };
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

  /**
   * Walk the sections from bar 0 and hand every bar to `arrange`, as the game's player would: chords voiced with the
   * least movement from the one before, a chord held over a bar line not struck again, the tune's notes by bar.
   * Returns the number of bars.
   */
  play(form: SecDef[], v: Voicing, arrange: (c: TBar) => void): number {
    const secs = form.map((s) => {
      const bars = chords(s.ch);
      const mel: MelNote[][] = bars.map(() => []);
      for (const m of s.mel ? melody(s.mel, 16, MAJOR) : []) {
        const b = Math.floor(m.at / 16);
        if (b < mel.length) mel[b].push({ ...m, at: m.at - b * 16 });
      }
      return { ...s, bars, mel };
    });
    const size = v.size ?? 4;
    let prev: number[] | null = null, held: number[] | null = null, n = 0;
    const voiceIt = (c: Chord) => {
      const x = voice(c, prev, v.lo, v.hi, size);
      prev = x;
      return v.open ? drop2(x) : x;
    };
    const x = Array.from({ length: 8 }, () => 0);
    secs.forEach((sec, k) => {
      sec.bars.forEach((bar, i) => {
        const fresh = i === 0 || sec.bars[i - 1] !== bar;
        const vo = fresh || !held ? voiceIt(bar[0]) : held;
        held = vo;
        let hold = 1;
        while (i + hold < sec.bars.length && sec.bars[i + hold] === bar) hold++;
        const t0 = n * BAR;
        const after = i + 1 < sec.bars.length ? sec.bars[i + 1] : secs[k + 1]?.bars[0];
        const c: TBar = {
          sec: sec.sec, i, len: sec.bars.length, n, turn: 0, pass: 0,
          next: i === sec.bars.length - 1 ? (secs[k + 1]?.sec ?? '') : sec.sec,
          ch: bar[0], v: vo, bass: bassNote(bar[0], v.bassLo), fresh, hold,
          v2: bar[1] ? voiceIt(bar[1]) : null, bass2: bar[1] ? bassNote(bar[1], v.bassLo) : 0,
          mel: sec.mel[i], tonic: sec.tonic, mood: MOOD, r: this.r, x, steps: 16,
          nextCh: after ? after[0] : bar[bar.length - 1],
          dur: (s) => s * STEP,
          at: (step, fn, human) => void this.events.push({ t: t0 + step * STEP + (human ? this.r() * 0.014 : 0), fn }),
        };
        if (bar[1]) held = c.v2;
        arrange(c);
        n++;
      });
    });
    return n;
  }
}

/** Where a piece's chord voicings sit (as a game track's `lo`, `hi`, `size`, `open`, `bassLo`). */
export interface Voicing {
  lo: number;
  hi: number;
  size?: number;
  open?: boolean;
  bassLo: number;
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
  // the echo: a dotted eighth at 120 BPM (three steps, as the game's medley has it)
  setDelayTime(STEP * 3);
  let session: Session | null = null;
  const buf = await renderOffline(def.bars * BAR + def.tail + PAD, () => {
    const k = (session = new Session(stem, def.seed, def.level, solo));
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
  for (const fn of (session as Session | null)?.stops ?? []) fn();
  return buf;
}
