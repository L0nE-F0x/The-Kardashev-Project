/**
 * Music: two soundtracks over the same cues. "Cinematic" (tracks.ts: pads, pianos, bells, a choir, one theme that
 * returns from the menu to the ending) is the game's score; "Chiptune" (chiptune.ts) is the retro alternative. Your own
 * theme song on the menu (public/audio/theme.mp3) still wins over both. Tracks cross-fade, and the cinematic score
 * follows the game's mood: calmer while paused, a little more drive at speed, tension in a finale.
 */
import { audioCtx, glide, musicBus } from './engine';
import { Chiptune } from './chiptune';
import { Cinematic, type Mood } from './cinematic';
import { TRACKS } from './tracks';

export type Track = 'menu' | 'era0' | 'era1' | 'era2' | 'era3' | 'era4' | 'ending' | null;
/** Settings → Audio → Soundtrack. */
export type Soundtrack = 'cinematic' | 'chiptune';

const THEME_URL = '../audio/theme.mp3';
const REST: Mood = { calm: false, drive: 0, tension: 0 };
let want: Track = null;
let unlocked = false;
let soundtrack: Soundtrack = 'cinematic';
let mood: Mood = REST;
/** What is sounding: the track, which soundtrack plays it, and the player (null while the MP3 theme plays). */
let now: { track: Track; style: string; player: Cinematic | Chiptune | null } = { track: null, style: '', player: null };
let themeEl: HTMLAudioElement | null = null;
let themeMissing = false;
let themeGain: GainNode | null = null;

const style = (): Soundtrack => soundtrack;

export function musicUnlocked(): void {
  unlocked = true;
  if (want) switchTo(want);
}

/** Ask for a track; it starts once audio is unlocked by a user gesture. */
export function playMusic(track: Track): void {
  want = track;
  if (unlocked) switchTo(track);
}

/** Choose the soundtrack (Settings → Audio); what is playing cross-fades to the other one. */
export function setSoundtrack(s: Soundtrack): void {
  if (s === soundtrack) return;
  soundtrack = s;
  if (unlocked) switchTo(want);
}

/**
 * Tell the score how the game feels right now: `paused` (the clock is stopped), `fast` (high speed, a skip, a time
 * jump), `tension` (a finale is running). Cheap to call every frame; the menu and the ending ignore it.
 */
export function setMusicMood(m: { paused: boolean; fast: boolean; tension: boolean }): void {
  if (m.paused === mood.calm && (m.fast ? 1 : 0) === mood.drive && (m.tension ? 1 : 0) === mood.tension) return;
  mood = { calm: m.paused, drive: m.fast ? 1 : 0, tension: m.tension ? 1 : 0 };
  if (now.player instanceof Cinematic && now.track !== 'menu' && now.track !== 'ending') now.player.setMood(mood);
}

/** The chiptune songs' keys (as the tonic of their major scale; Smog & Silicon's A minor counts as C). */
const CHIP_KEY: Record<Exclude<Track, null>, number> = { menu: 2, era0: 0, era1: 2, era2: 7, era3: 4, era4: 11, ending: 2 };

/** The tonic (pitch class, 0 = C) of the music that is on, so the sound effects can chime in key. D when unsure. */
export function musicKey(): number {
  if (!now.track || !now.player) return 2;
  return now.player instanceof Cinematic ? TRACKS[now.track].tonic % 12 : CHIP_KEY[now.track];
}

function switchTo(track: Track) {
  const st = style();
  if (track === now.track && (st === now.style || !now.player)) return;
  // the old track fades while the new one waits a beat, then rises through it
  const overlap = now.track ? 0.7 : 0;
  now.player?.stop();
  stopTheme();
  now = { track, style: st, player: null };
  if (track === 'menu' && !themeMissing) startTheme();
  else if (track) startGenerated(track, overlap);
}

function startGenerated(track: Exclude<Track, null>, wait = 0) {
  const ctx = audioCtx();
  if (!ctx || !musicBus()) return;
  const st = style();
  const player = st === 'cinematic' ? new Cinematic(TRACKS[track], track === 'menu' || track === 'ending' ? REST : mood, ctx) : new Chiptune(track, ctx);
  player.start(wait);
  now = { track, style: st, player };
}

function stopTheme() {
  const ctx = audioCtx();
  if (!themeEl || !themeGain || !ctx) return;
  const el = themeEl;
  glide(themeGain.gain, 0, ctx.currentTime, 0.4);
  setTimeout(() => {
    if (now.track !== 'menu' || now.player) el.pause();
  }, 1500);
}

/** The menu's own song, if the game ships one; the generated menu theme takes over when it doesn't. */
function startTheme() {
  const ctx = audioCtx();
  const bus = musicBus();
  if (!ctx || !bus) return;
  const fallBack = () => {
    themeMissing = true;
    if (now.track === 'menu' && !now.player) startGenerated('menu');
  };
  if (!themeEl) {
    themeEl = new Audio(THEME_URL);
    themeEl.loop = true;
    themeEl.preload = 'auto';
    themeEl.addEventListener('error', () => {
      themeEl = null;
      fallBack();
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
  void themeEl.play().catch(fallBack);
}
