/**
 * The chiptune soundtrack (the pixel edition's own): a tiny step sequencer playing square and triangle voices.
 * A theme for the menu, a track per era (Smog & Silicon → Swarmlight) in sections (A A B A) so it doesn't loop
 * audibly, and the ending. It runs on the shared mix: a touch of the hall, the same loudness as the cinematic score.
 */
import { freeWhenDone, glide, mixBus, noiseBuffer, onPump } from './engine';

interface Section {
  /** One chord per bar: [bass root, chord tones…] as MIDI numbers. */
  chords: number[][];
  /** Eighth notes, 8 per bar. */
  melody?: (number | null)[];
}

interface Song {
  bpm: number;
  /** One chord per bar: [bass root, chord tones…] as MIDI numbers. */
  chords: number[][];
  melody?: (number | null)[];
  arp: boolean;
  drums: boolean;
  padLevel: number;
  // ── era songs: sections and instruments (the menu and ending leave these out) ──
  /** Sections played in `order` (e.g. A A B A); `chords`/`melody` are ignored when set. */
  sections?: Section[];
  order?: number[];
  /** Lead voice and its brightness / length (sixteenths). */
  lead?: OscillatorType;
  leadCut?: number;
  leadLen?: number;
  leadVol?: number;
  /** Arpeggio: waveform, pattern over the chord tones, one note every `arpEvery` sixteenths, octave up. */
  arpWave?: OscillatorType;
  arpPattern?: number[];
  arpEvery?: number;
  arpVol?: number;
  arpOctave?: number;
  /** Echo the arp and lead three sixteenths later, softer (space). */
  echo?: boolean;
  /** Drum kit: soft (kick on 1 and 3, hat on the offbeats), drive (four on the floor, 8th hats, snare), shaker. */
  kit?: 'soft' | 'drive' | 'shaker';
  padWave?: OscillatorType;
  padCut?: number;
  padAttack?: number;
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

const MENU_SONG: Song = {
  bpm: 92,
  chords: [
    [38, 62, 66, 69, 73],
    [38, 62, 66, 69, 73],
    [35, 59, 62, 66, 69],
    [35, 59, 62, 66, 69],
    [31, 55, 59, 62, 66],
    [31, 55, 59, 62, 66],
    [33, 57, 61, 64, 67],
    [33, 57, 61, 64, 69],
  ],
  // eighth notes, 8 per bar
  melody: [
    69, null, 66, null, 69, 71, 69, null,
    66, null, 64, null, 62, null, null, null,
    74, null, 73, null, 71, null, 69, null,
    71, null, null, null, 66, null, null, null,
    67, null, 69, null, 71, null, 74, null,
    73, null, 71, null, 69, null, null, null,
    64, null, 66, null, 67, null, 69, null,
    73, null, null, null, 76, null, null, null,
  ],
  arp: true,
  drums: true,
  padLevel: 0.07,
};

/** The Type I ending: a slow, wide climb in D that never quite settles, so it loops under the credits. */
const ENDING_SONG: Song = {
  bpm: 64,
  chords: [
    [38, 62, 66, 69, 74],
    [45, 61, 64, 69, 73],
    [47, 59, 62, 66, 71],
    [43, 59, 62, 67, 74],
    [38, 62, 66, 69, 74],
    [45, 61, 64, 69, 76],
    [43, 62, 67, 71, 74],
    [45, 61, 64, 69, 73],
  ],
  melody: [
    74, null, 76, null, 78, null, 81, null,
    81, null, null, null, 76, null, null, null,
    78, null, 76, null, 74, null, 71, null,
    74, null, null, null, null, null, null, null,
    74, null, 76, null, 78, null, 81, null,
    83, null, null, null, 81, null, null, null,
    79, null, 78, null, 76, null, 74, null,
    76, null, null, null, 73, null, null, null,
  ],
  arp: true,
  drums: false,
  padLevel: 0.075,
};

// ── era songs: the soundtrack follows the palette, Smog & Silicon → Swarmlight ──────────────
const r = null;
/** Smog & Silicon: gritty squares in A minor, a soft kit, a little menace in the turnaround. */
const ERA0: Song = {
  bpm: 84, chords: [], arp: true, drums: true, padLevel: 0.045,
  sections: [
    { chords: [[45, 57, 60, 64, 69], [41, 57, 60, 65, 69], [48, 55, 60, 64, 67], [43, 55, 59, 62, 67]],
      melody: [69, r, 72, r, 71, r, 69, r, 69, r, 67, r, 65, r, r, r, 67, r, 69, r, 72, r, 76, r, 74, r, r, r, 71, r, r, r] },
    { chords: [[38, 57, 62, 65, 69], [45, 57, 60, 64, 69], [40, 56, 59, 64, 68], [45, 57, 60, 64, 69]],
      melody: [74, r, 72, r, 69, r, 72, r, 71, r, 69, r, r, r, 64, r, 68, r, 71, r, 74, r, 71, r, 69, r, r, r, r, r, r, r] },
  ],
  order: [0, 0, 1, 0],
  lead: 'square', leadCut: 1700, leadLen: 2.5, leadVol: 0.07,
  arpWave: 'square', arpPattern: [0, 2, 1, 2], arpEvery: 2, arpVol: 0.03, arpOctave: 12,
  kit: 'soft', padWave: 'sawtooth', padCut: 700, padAttack: 0.4,
};
/** Grid Rush: D major, driving, four on the floor, bright squares. */
const ERA1: Song = {
  bpm: 112, chords: [], arp: true, drums: true, padLevel: 0.04,
  sections: [
    { chords: [[38, 62, 66, 69, 74], [45, 61, 64, 69, 73], [47, 62, 66, 71, 74], [43, 62, 67, 71, 74]],
      melody: [74, r, 76, r, 78, r, 74, r, 76, r, 73, r, 69, r, r, r, 74, r, 78, r, 81, r, 78, r, 79, r, 78, r, 76, r, 74, r] },
    { chords: [[43, 59, 62, 67, 71], [45, 61, 64, 69, 73], [42, 61, 66, 69, 73], [47, 62, 66, 71, 74]],
      melody: [71, r, 74, r, 79, r, 78, r, 76, r, r, r, 73, r, 76, r, 78, r, 81, r, 78, r, 73, r, 74, r, r, r, r, r, r, r] },
  ],
  order: [0, 0, 1, 1],
  lead: 'square', leadCut: 3200, leadLen: 1.6, leadVol: 0.06,
  arpWave: 'square', arpPattern: [0, 1, 2, 3, 2, 1, 0, 2], arpEvery: 1, arpVol: 0.028, arpOctave: 12,
  kit: 'drive', padWave: 'sawtooth', padCut: 1100, padAttack: 0.2,
};
/** Solarpunk Bloom: pentatonic G, marimba-ish triangles, a shaker, sunlight. */
const ERA2: Song = {
  bpm: 96, chords: [], arp: true, drums: true, padLevel: 0.04,
  sections: [
    { chords: [[43, 59, 62, 67, 71], [40, 59, 64, 67, 71], [36, 60, 64, 67, 72], [38, 62, 66, 69, 74]],
      melody: [79, r, 76, r, 74, r, 76, r, 79, r, 81, r, 79, r, r, r, 76, r, 74, r, 71, r, 74, r, 76, r, r, r, 74, r, r, r] },
    { chords: [[36, 60, 64, 67, 72], [38, 62, 66, 69, 74], [35, 59, 62, 66, 71], [40, 59, 64, 67, 71]],
      melody: [76, r, 79, r, 81, r, 79, r, 74, r, 76, r, 74, r, 71, r, 74, r, 71, r, 69, r, 71, r, 67, r, r, r, r, r, r, r] },
  ],
  order: [0, 1, 0, 1],
  lead: 'triangle', leadLen: 1.2, leadVol: 0.12,
  arpWave: 'triangle', arpPattern: [0, 2, 3, 1, 3, 2], arpEvery: 2, arpVol: 0.06, arpOctave: 12,
  kit: 'shaker', padWave: 'triangle', padCut: 1500, padAttack: 0.3,
};
/** Orbital Dawn: E Lydian, spacious arpeggios with echoes, slow pads, no drums but a pulse. */
const ERA3: Song = {
  bpm: 80, chords: [], arp: true, drums: false, padLevel: 0.06,
  sections: [
    { chords: [[40, 64, 68, 71, 75], [40, 66, 70, 73, 78], [37, 61, 64, 68, 73], [45, 64, 69, 71, 73]],
      melody: [76, r, r, 78, 80, r, 83, r, 82, r, r, r, 78, r, r, r, 80, r, 76, r, 73, r, r, 76, 78, r, r, r, r, r, r, r] },
    { chords: [[45, 61, 64, 69, 71], [47, 63, 66, 71, 75], [44, 63, 68, 71, 75], [37, 61, 64, 68, 73]],
      melody: [76, r, 78, r, 80, r, r, r, 78, r, 75, r, r, r, 71, r, 75, r, 78, r, 80, r, 83, r, 80, r, r, r, 76, r, r, r] },
  ],
  order: [0, 0, 1, 0],
  lead: 'triangle', leadLen: 4, leadVol: 0.1,
  arpWave: 'triangle', arpPattern: [0, 1, 2, 3, 4, 3, 2, 1], arpEvery: 2, arpVol: 0.045, arpOctave: 12,
  echo: true, padWave: 'sawtooth', padCut: 800, padAttack: 1.2,
};
/** Swarmlight: B major sevenths, shimmering high arps, long pads, everything floating. */
const ERA4: Song = {
  bpm: 70, chords: [], arp: true, drums: false, padLevel: 0.065,
  sections: [
    { chords: [[47, 63, 66, 70, 75], [44, 59, 63, 66, 70], [40, 56, 59, 63, 68], [42, 61, 66, 71, 73]],
      melody: [78, r, r, r, 75, r, r, r, 73, r, 75, r, 78, r, r, r, 80, r, r, r, 78, r, 75, r, 73, r, r, r, r, r, r, r] },
    { chords: [[40, 56, 59, 63, 68], [39, 58, 61, 66, 70], [37, 56, 59, 64, 68], [42, 58, 61, 66, 70]],
      melody: [75, r, r, r, 78, r, r, r, 82, r, 80, r, 78, r, r, r, 76, r, 75, r, 73, r, 71, r, 73, r, r, r, 70, r, r, r] },
  ],
  order: [0, 1, 0, 1],
  lead: 'sine', leadLen: 6, leadVol: 0.1,
  arpWave: 'triangle', arpPattern: [0, 2, 4, 3, 1, 3], arpEvery: 1, arpVol: 0.022, arpOctave: 24,
  echo: true, padWave: 'triangle', padCut: 2000, padAttack: 2,
};

export type ChipId = 'menu' | 'era0' | 'era1' | 'era2' | 'era3' | 'era4' | 'ending';
const SONGS: Record<ChipId, Song> = { menu: MENU_SONG, era0: ERA0, era1: ERA1, era2: ERA2, era3: ERA3, era4: ERA4, ending: ENDING_SONG };
/** Per-song trim: the voices were written quiet; this lands every song at the cinematic score's loudness. */
const LEVEL: Record<ChipId, number> = { menu: 2.6, era0: 3, era1: 3, era2: 3, era3: 2.5, era4: 2.1, ending: 2.5 };

export class Chiptune {
  private step = 0; // 16th notes
  private nextTime = 0;
  private unpump: (() => void) | null = null;
  private out: GainNode;
  private send: GainNode;
  private readonly song: Song;

  constructor(private readonly id: ChipId, private readonly ctx: BaseAudioContext) {
    this.song = SONGS[id];
    const bus = mixBus('music')!;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(bus.dry);
    // a small room around the chips, so they sit in the same space as the sound effects
    this.send = ctx.createGain();
    this.send.gain.value = 0.14;
    this.out.connect(this.send);
    this.send.connect(bus.rev);
  }

  start(wait = 0): void {
    const t = this.ctx.currentTime + wait;
    this.out.gain.setTargetAtTime(LEVEL[this.id], t, 0.5);
    this.nextTime = t + 0.1;
    this.unpump = onPump((until, now) => this.schedule(until, now));
  }

  stop(fade = 2.5): void {
    this.unpump?.();
    this.unpump = null;
    const t = this.ctx.currentTime;
    glide(this.out.gain, 0, t, fade / 4);
    const killAt = t + fade + 0.5;
    const off = onPump((_until, now) => {
      if (now < killAt) return;
      off();
      this.out.disconnect();
      this.send.disconnect();
    });
  }

  private schedule(until: number, now: number) {
    const sixteenth = 60 / this.song.bpm / 4;
    // a throttled background timer fell behind: skip ahead rather than play every missed note at once
    if (this.nextTime < now - 0.1) {
      const missed = Math.ceil((now - this.nextTime) / sixteenth);
      this.nextTime += missed * sixteenth;
      this.step += missed;
    }
    while (this.nextTime < until) {
      this.playStep(this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step++;
    }
  }

  private note(freq: number, t: number, dur: number, type: OscillatorType, vol: number, attack = 0.01, cutoff = 0) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    // silent until the note starts (a GainNode is born at 1: a voice that starts a sample early would click)
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
    let f: BiquadFilterNode | null = null;
    if (cutoff) {
      f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      osc.connect(f);
      f.connect(g);
    } else osc.connect(g);
    g.connect(this.out);
    osc.start(t);
    osc.stop(t + dur + 0.03);
    if (f) freeWhenDone(osc, f, g);
    else freeWhenDone(osc, g);
  }

  /** The chord and melody bar under a step, walking an era song's sections in order. */
  private sectionAt(step: number): { chord: number[]; mel: (number | null)[] | undefined; barInSection: number; loop: number; lastBar: boolean } {
    const song = this.song;
    const order = song.order ?? song.sections!.map((_, i) => i);
    const bars = order.map((i) => song.sections![i].chords.length);
    const cycle = bars.reduce((a, b) => a + b, 0);
    const bar = Math.floor(step / 16);
    let b = bar % cycle;
    let k = 0;
    while (b >= bars[k]) b -= bars[k++];
    const sec = song.sections![order[k]];
    return { chord: sec.chords[b], mel: sec.melody, barInSection: b, loop: bar >= bars[0] ? 1 : 0, lastBar: k === order.length - 1 && b === bars[k] - 1 };
  }

  private playEraStep(step: number, t: number, sixteenth: number) {
    const song = this.song;
    const inBar = step % 16;
    const { chord, mel, barInSection, loop, lastBar } = this.sectionAt(step);
    const [root, ...tones] = chord;
    if (inBar === 0) for (const m of tones.slice(0, 3)) this.note(mtof(m), t, sixteenth * 16, song.padWave ?? 'sawtooth', song.padLevel, song.padAttack ?? 0.6, song.padCut ?? 900);
    // bass: the root on the bar, a fifth on beat three when there are drums
    if (inBar === 0) this.note(mtof(root), t, sixteenth * (song.drums ? 7 : 15), 'triangle', 0.2, 0.01);
    if (song.drums && inBar === 8) this.note(mtof(root + 7), t, sixteenth * 6, 'triangle', 0.16, 0.01);
    // arpeggio
    const every = song.arpEvery ?? 1;
    if (song.arp && inBar % every === 0) {
      const pat = song.arpPattern ?? [0, 1, 2, 3];
      const m = tones[pat[(step / every) % pat.length | 0] % tones.length] + (song.arpOctave ?? 12);
      const vol = song.arpVol ?? 0.035;
      this.note(mtof(m), t, sixteenth * every * 1.6, song.arpWave ?? 'square', vol, 0.005, 2600);
      if (song.echo) this.note(mtof(m), t + sixteenth * 3, sixteenth * every * 1.6, song.arpWave ?? 'square', vol * 0.4, 0.005, 1800);
    }
    // the lead sits out the opening section, then sings
    if (mel && inBar % 2 === 0 && loop >= 1) {
      const m = mel[barInSection * 8 + inBar / 2];
      if (m !== null && m !== undefined) {
        const len = song.leadLen ?? 3;
        this.note(mtof(m), t, sixteenth * len, song.lead ?? 'triangle', song.leadVol ?? 0.1, 0.02, song.leadCut ?? 0);
        if (song.echo) this.note(mtof(m), t + sixteenth * 3, sixteenth * len, song.lead ?? 'triangle', (song.leadVol ?? 0.1) * 0.35, 0.02, 1500);
      }
    }
    if (!song.drums) return;
    if (song.kit === 'soft') {
      if (inBar === 0 || inBar === 8) this.kick(t);
      if (inBar % 4 === 2) this.hat(t);
      if (inBar === 4 || inBar === 12) this.snare(t, 0.05);
    } else if (song.kit === 'drive') {
      if (inBar % 4 === 0) this.kick(t);
      if (inBar % 2 === 1) this.hat(t);
      if (inBar === 4 || inBar === 12) this.snare(t, 0.08);
      // a little fill into the top of the cycle
      if (lastBar && inBar >= 12) this.snare(t, 0.05);
    } else if (song.kit === 'shaker') {
      if (inBar % 2 === 1) this.hat(t, 0.025);
      if (inBar === 0) this.kick(t, 0.12);
    }
  }

  private playStep(step: number, t: number, sixteenth: number) {
    if (this.song.sections) return this.playEraStep(step, t, sixteenth);
    const song = this.song;
    const bar = Math.floor(step / 16) % song.chords.length;
    const inBar = step % 16;
    const chord = song.chords[bar];
    const [root, ...tones] = chord;
    // pad: a soft chord at the start of each bar
    if (inBar === 0) for (const m of tones.slice(0, 3)) this.note(mtof(m), t, sixteenth * 16, 'sawtooth', song.padLevel, 0.6, 900);
    // bass
    if (inBar === 0 || inBar === 10) this.note(mtof(root), t, sixteenth * 6, 'triangle', 0.22, 0.01);
    // arpeggio
    if (song.arp) {
      const pattern = [0, 1, 2, 3, 2, 1];
      const m = tones[pattern[step % pattern.length] % tones.length] + 12;
      this.note(mtof(m), t, sixteenth * 1.6, 'square', 0.045, 0.005, 2200);
    }
    // melody (every other loop, so the arrangement breathes)
    if (song.melody && inBar % 2 === 0) {
      const loop = Math.floor(step / (16 * song.chords.length));
      const m = song.melody[(bar * 8 + inBar / 2) % song.melody.length];
      if (m !== null && m !== undefined && loop % 2 === 1) this.note(mtof(m + 12), t, sixteenth * 3, 'triangle', 0.11, 0.02);
    }
    // drums
    if (song.drums) {
      if (inBar % 4 === 2) this.hat(t);
      if (inBar === 0 || inBar === 8) this.kick(t);
    }
  }

  private noise(t: number, type: BiquadFilterType, freq: number, vol: number, dur: number) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer('white');
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    // the shared noise is stereo and half-level: doubled here to keep the old kit's balance
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * 2, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    src.start(t, Math.random() * 4);
    src.stop(t + dur + 0.02);
    freeWhenDone(src, f, g);
  }

  private snare(t: number, vol: number) {
    this.noise(t, 'bandpass', 1800, vol, 0.12);
  }

  private hat(t: number, vol = 0.05) {
    this.noise(t, 'highpass', 7000, vol, 0.05);
  }

  private kick(t: number, vol = 0.22) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(g);
    g.connect(this.out);
    osc.start(t);
    osc.stop(t + 0.2);
    freeWhenDone(osc, g);
  }
}
