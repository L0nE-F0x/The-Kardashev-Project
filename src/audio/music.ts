/**
 * Music: your theme song on the menu (public/audio/theme.mp3) with a code-made chiptune theme
 * as a fallback, and quiet procedural ambience in game. Everything fades in and out.
 */
import { audioCtx, musicBus } from './engine';

type Track = 'menu' | 'game' | 'game2' | 'game3' | 'ending' | null;

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
interface Song {
  bpm: number;
  /** One chord per bar: [bass root, chord tones…] as MIDI numbers. */
  chords: number[][];
  melody?: (number | null)[];
  arp: boolean;
  drums: boolean;
  padLevel: number;
  sparse?: boolean;
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

  private playStep(step: number, t: number, sixteenth: number) {
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

  private hat(t: number) {
    const ctx = audioCtx()!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(f);
    f.connect(g);
    g.connect(this.out!);
    src.start(t);
    src.stop(t + 0.06);
  }

  private kick(t: number) {
    const ctx = audioCtx()!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(g);
    g.connect(this.out!);
    osc.start(t);
    osc.stop(t + 0.2);
  }
}
