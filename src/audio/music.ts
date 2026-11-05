/**
 * Music: your theme song on the menu (public/audio/theme.mp3) with a code-made chiptune theme
 * as a fallback, and in game a chiptune track per era (Smog & Silicon → Swarmlight) that follows
 * the palette, each in sections (A A B A) so it doesn't loop audibly. Everything fades in and out.
 */
import { audioCtx, musicBus } from './engine';

export type Track = 'menu' | 'game' | 'game2' | 'game3' | 'era0' | 'era1' | 'era2' | 'era3' | 'era4' | 'ending' | null;

const THEME_URL = '../audio/theme.mp3';
let current: Track = null;
let want: Track = null;
let unlocked = false;
let themeEl: HTMLAudioElement | null = null;
let themeMissing = false;
let themeGain: GainNode | null = null;
let seq: Sequencer | null = null;

export function musicUnlocked(): void {
  unlocked = true;
  if (want) switchTo(want);
}

/** Ask for a track; it starts once audio is unlocked by a user gesture. */
export function playMusic(track: Track): void {
  want = track;
  if (unlocked) switchTo(track);
}

function switchTo(track: Track) {
  if (track === current) return;
  stopAll();
  current = track;
  if (track === 'menu') startMenu();
  else if (track === 'game') startSequencer(GAME_SONG);
  else if (track === 'game2') startSequencer(GAME2_SONG);
  else if (track === 'game3') startSequencer(GAME3_SONG);
  else if (track === 'ending') startSequencer(ENDING_SONG);
  else if (track && track.startsWith('era')) startSequencer(ERA_SONGS[Number(track.slice(3))] ?? ERA_SONGS[0]);
}

function stopAll() {
  const ctx = audioCtx();
  if (themeEl && themeGain && ctx) {
    const el = themeEl;
    themeGain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    setTimeout(() => {
      if (current !== 'menu') el.pause();
    }, 1500);
  }
  seq?.stop();
  seq = null;
}

function startMenu() {
  const ctx = audioCtx();
  const bus = musicBus();
  if (!ctx || !bus) return;
  if (themeMissing) return startSequencer(MENU_SONG);
  if (!themeEl) {
    themeEl = new Audio(THEME_URL);
    themeEl.loop = true;
    themeEl.preload = 'auto';
    themeEl.addEventListener('error', () => {
      themeMissing = true;
      themeEl = null;
      if (current === 'menu') startSequencer(MENU_SONG);
    });
    const src = ctx.createMediaElementSource(themeEl);
    themeGain = ctx.createGain();
    src.connect(themeGain);
    themeGain.connect(bus);
  }
  if (!themeEl || !themeGain) return;
  themeGain.gain.setValueAtTime(0, ctx.currentTime);
  themeGain.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
  themeEl.currentTime = 0;
  void themeEl.play().catch(() => {
    themeMissing = true;
    if (current === 'menu') startSequencer(MENU_SONG);
  });
}

function startSequencer(song: Song) {
  seq?.stop();
  seq = new Sequencer(song);
  seq.start();
}

// ── a tiny step sequencer ───────────────────────────────────────────────────────────────────
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
  sparse?: boolean;
  // ── era songs: sections and instruments (older songs leave these out) ──
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

const GAME_SONG: Song = {
  bpm: 66,
  chords: [
    [38, 62, 66, 69, 76],
    [35, 59, 62, 66, 73],
    [31, 55, 59, 62, 69],
    [33, 57, 61, 64, 71],
  ],
  arp: true,
  drums: false,
  padLevel: 0.05,
  sparse: true,
};

/** Act II: the same calm, but brighter and moving — Grid Rush. */
const GAME2_SONG: Song = {
  bpm: 76,
  chords: [
    [36, 60, 64, 67, 74],
    [41, 65, 69, 72, 76],
    [33, 57, 60, 64, 71],
    [43, 62, 67, 71, 74],
  ],
  melody: [72, null, 74, null, 76, null, 79, null, 76, null, 74, null, 72, null, null, null, 69, null, 72, null, 74, null, 72, null, 71, null, 67, null, null, null, null, null],
  arp: true,
  drums: false,
  padLevel: 0.055,
  sparse: true,
};

/** Act III: brighter and wider — a Lydian lift over a slow, hopeful progression. */
const GAME3_SONG: Song = {
  bpm: 72,
  chords: [
    [38, 62, 66, 69, 76],
    [43, 62, 67, 71, 78],
    [40, 64, 67, 71, 74],
    [45, 64, 69, 73, 76],
  ],
  melody: [74, null, null, 76, 78, null, 81, null, 78, null, 76, null, 74, null, null, null, 71, null, 74, null, 76, null, null, 78, 76, null, 73, null, null, null, null, null],
  arp: true,
  drums: false,
  padLevel: 0.06,
  sparse: true,
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
const ERA_SONGS: Song[] = [ERA0, ERA1, ERA2, ERA3, ERA4];

class Sequencer {
  private step = 0; // 16th notes
  private nextTime = 0;
  private timer: number | null = null;
  private noise: AudioBuffer | null = null;
  private out: GainNode | null = null;

  constructor(private readonly song: Song) {}

  start() {
    const ctx = audioCtx();
    const bus = musicBus();
    if (!ctx || !bus) return;
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, ctx.currentTime);
    this.out.gain.setTargetAtTime(1, ctx.currentTime, 1);
    this.out.connect(bus);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  stop() {
    const ctx = audioCtx();
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (ctx && this.out) {
      const out = this.out;
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
      setTimeout(() => out.disconnect(), 3000);
    }
  }

  private schedule() {
    const ctx = audioCtx();
    if (!ctx || !this.out) return;
    const sixteenth = 60 / this.song.bpm / 4;
    // a throttled background timer fell behind: skip ahead rather than play every missed note at once
    if (this.nextTime < ctx.currentTime - 0.1) {
      const missed = Math.ceil((ctx.currentTime - this.nextTime) / sixteenth);
      this.nextTime += missed * sixteenth;
      this.step += missed;
    }
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step++;
    }
  }

  private note(freq: number, t: number, dur: number, type: OscillatorType, vol: number, attack = 0.01, cutoff = 0) {
    const ctx = audioCtx()!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      osc.connect(f);
      f.connect(g);
    } else osc.connect(g);
    g.connect(this.out!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
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
    if (!song.drums || !this.noise) return;
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
    if (inBar === 0 || (!song.sparse && inBar === 10)) this.note(mtof(root), t, sixteenth * (song.sparse ? 14 : 6), 'triangle', 0.22, 0.01);
    // arpeggio
    if (song.arp) {
      const pattern = [0, 1, 2, 3, 2, 1];
      if (!song.sparse || (inBar % 4 === 0 && Math.random() < 0.7)) {
        const m = tones[pattern[step % pattern.length] % tones.length] + 12;
        this.note(mtof(m), t, sixteenth * (song.sparse ? 6 : 1.6), 'square', song.sparse ? 0.035 : 0.045, 0.005, 2200);
      }
    }
    // melody (every other loop, so the arrangement breathes)
    if (song.melody && inBar % 2 === 0) {
      const loop = Math.floor(step / (16 * song.chords.length));
      const m = song.melody[(bar * 8 + inBar / 2) % song.melody.length];
      if (m !== null && m !== undefined && loop % 2 === 1) this.note(mtof(m + 12), t, sixteenth * 3, 'triangle', 0.11, 0.02);
    }
    // drums
    if (song.drums && this.noise) {
      if (inBar % 4 === 2) this.hat(t);
      if (inBar === 0 || inBar === 8) this.kick(t);
    }
  }

  private snare(t: number, vol: number) {
    const ctx = audioCtx()!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(f);
    f.connect(g);
    g.connect(this.out!);
    src.start(t);
    src.stop(t + 0.14);
  }

  private hat(t: number, vol = 0.05) {
    const ctx = audioCtx()!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(f);
    f.connect(g);
    g.connect(this.out!);
    src.start(t);
    src.stop(t + 0.06);
  }

  private kick(t: number, vol = 0.22) {
    const ctx = audioCtx()!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(g);
    g.connect(this.out!);
    osc.start(t);
    osc.stop(t + 0.2);
  }
}
