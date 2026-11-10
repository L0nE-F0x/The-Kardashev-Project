/**
 * Music: the score (tracks.ts: pads, pianos, bells, a choir, one theme that returns from the menu to the ending).
 * Your own theme song on the menu (public/audio/theme.mp3) wins over the menu's piece. Tracks cross-fade, and the
 * score follows the game's mood: calmer while paused, a little more drive at speed, tension in a finale.
 */
import { audioCtx, glide, musicBus } from './engine';
import { Cinematic, type Mood } from './cinematic';
import { TRACKS } from './tracks';

export type Track = 'menu' | 'era0' | 'era1' | 'era2' | 'era3' | 'era4' | 'ending' | null;

const THEME_URL = '../audio/theme.mp3';
const REST: Mood = { calm: false, drive: 0, tension: 0 };
let want: Track = null;
let unlocked = false;
let mood: Mood = REST;
/** What is sounding: the track and its player (null while the MP3 theme plays). */
let now: { track: Track; player: Cinematic | null } = { track: null, player: null };
let themeEl: HTMLAudioElement | null = null;
let themeMissing = false;
let themeGain: GainNode | null = null;

export function musicUnlocked(): void {
  unlocked = true;
  if (want) switchTo(want);
}

/** Ask for a track; it starts once audio is unlocked by a user gesture. */
export function playMusic(track: Track): void {
  want = track;
  if (unlocked) switchTo(track);
}

/**
 * Tell the score how the game feels right now: `paused` (the clock is stopped), `fast` (high speed, a skip, a time
 * jump), `tension` (a finale is running). Cheap to call every frame; the menu and the ending ignore it.
 */
export function setMusicMood(m: { paused: boolean; fast: boolean; tension: boolean }): void {
  if (m.paused === mood.calm && (m.fast ? 1 : 0) === mood.drive && (m.tension ? 1 : 0) === mood.tension) return;
  mood = { calm: m.paused, drive: m.fast ? 1 : 0, tension: m.tension ? 1 : 0 };
  if (now.player && now.track !== 'menu' && now.track !== 'ending') now.player.setMood(mood);
}

/** The tonic (pitch class, 0 = C) of the music that is on, so the sound effects can chime in key. D when unsure. */
export function musicKey(): number {
  if (!now.track || !now.player) return 2;
  return TRACKS[now.track].tonic % 12;
}

function switchTo(track: Track) {
  if (track === now.track) return;
  // the old track fades while the new one waits a beat, then rises through it
  const overlap = now.track ? 0.7 : 0;
  now.player?.stop();
  stopTheme();
  now = { track, player: null };
  if (track === 'menu' && !themeMissing) startTheme();
  else if (track) startGenerated(track, overlap);
}

function startGenerated(track: Exclude<Track, null>, wait = 0) {
  const ctx = audioCtx();
  if (!ctx || !musicBus()) return;
  const player = new Cinematic(TRACKS[track], track === 'menu' || track === 'ending' ? REST : mood, ctx);
  player.start(wait);
  now = { track, player };
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
