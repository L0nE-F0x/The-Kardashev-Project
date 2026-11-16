/**
 * The page side of tools/audio/render.mjs (dev only, never in the build): renders a track, an instrument demo or the
 * sound effects offline through the game's own mix and hands back the samples.
 *
 * Imported once by the render page; everything it needs comes through its static imports, so Vite gives every module
 * one URL (a module imported both plainly and with Vite's `?t=` would exist twice, with two engines).
 */
import { mixBus, renderOffline, setDelayTime } from '../../src/audio/engine';
import { Cinematic, type Mood, type Setup, type TrackDef } from '../../src/audio/cinematic';
import { seeded } from '../../src/audio/score';
import { strip } from '../../src/audio/synth';
import type { SoundId } from '../../src/audio/sfx';
import type { Lab } from '../../src/audio/voices/lab';

export interface Rendered {
  pcm: Float32Array;
  sr: number;
  nan: number;
  ms: number;
}

function interleave(buf: AudioBuffer): { pcm: Float32Array; nan: number } {
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const pcm = new Float32Array(L.length * 2);
  let nan = 0;
  for (let i = 0; i < L.length; i++) {
    const l = L[i], r = R[i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) nan++;
    pcm[2 * i] = Number.isFinite(l) ? l : 0;
    pcm[2 * i + 1] = Number.isFinite(r) ? r : 0;
  }
  return { pcm, nan };
}

async function load(path: string): Promise<Record<string, unknown>> {
  return (await import(/* @vite-ignore */ path)) as Record<string, unknown>;
}

/** A track (a TrackDef exported by `path`, `name` = the export or `TRACKS.<id>`) played as the game plays it. */
export async function renderTrack(path: string, name: string, secs: number, mood: Mood, sr = 48000, seed = 1): Promise<Rendered> {
  const mod = await load(path);
  const def = (name.startsWith('TRACKS.') ? (mod.TRACKS as Record<string, TrackDef>)[name.slice(7)] : (mod[name] as TrackDef)) ?? null;
  if (!def) throw new Error(`no track ${name} in ${path}`);
  const t0 = performance.now();
  let player: Cinematic | null = null;
  const buf = await renderOffline(secs, () => {
    player = new Cinematic(def, mood, mixBus('music')!.dry.context, seed);
    player.start(0);
  }, [], sr);
  void player;
  const { pcm, nan } = interleave(buf);
  return { pcm, sr, nan, ms: performance.now() - t0 };
}

/**
 * An instrument demo: `path` exports `name(lab)`, which builds its instrument on strips (through the music bus's
 * reverb and echo like a track's) and schedules notes from `lab.t0`.
 */
export async function renderFn(path: string, name: string, secs: number, sr = 48000): Promise<Rendered> {
  const mod = await load(path);
  const fn = mod[name] as ((lab: Lab) => void) | undefined;
  if (typeof fn !== 'function') throw new Error(`no function ${name} in ${path}`);
  const t0 = performance.now();
  const stops: (() => void)[] = [];
  const buf = await renderOffline(secs, () => {
    const bus = mixBus('music')!;
    const ctx = bus.dry.context;
    // the music's fades are normally opened by a track: a demo plays straight into the bus at full level
    setDelayTime(0.375);
    fn({ ctx, r: seeded(7), strip: (_n, o) => strip(ctx, bus, o), onStop: (f) => stops.push(f), t0: 0.1 });
  }, [], sr);
  for (const f of stops) f();
  const { pcm, nan } = interleave(buf);
  return { pcm, sr, nan, ms: performance.now() - t0 };
}

/** Sound effects, one after another `gap` seconds apart (longer gaps after the big ones). */
export async function renderSfx(ids: SoundId[], gap = 3, sr = 48000): Promise<Rendered & { at: [string, number][] }> {
  const LONG = new Set(['act', 'launch', 'storm', 'fanfare', 'decision', 'jump']);
  const at: [string, number][] = [];
  let t = 0.4;
  for (const id of ids) {
    at.push([id, t]);
    t += LONG.has(id) ? gap * 2 : gap;
  }
  // loaded here, not at the top: sfx.ts imports the music and every track, and a render page should only hold what
  // it renders (another piece being edited must not concern it)
  const { sfx } = await import('../../src/audio/sfx');
  const t0 = performance.now();
  const buf = await renderOffline(t + 0.5, () => {}, at.map(([id, when]) => [when, () => sfx(id as SoundId)]), sr);
  const { pcm, nan } = interleave(buf);
  return { pcm, sr, nan, ms: performance.now() - t0, at };
}

/** The strip names a track builds (for stem measurements). */
export async function trackStrips(path: string, name: string): Promise<string[]> {
  const mod = await load(path);
  const def = (name.startsWith('TRACKS.') ? (mod.TRACKS as Record<string, TrackDef>)[name.slice(7)] : (mod[name] as TrackDef)) ?? null;
  if (!def) throw new Error(`no track ${name} in ${path}`);
  let names: string[] = [];
  await renderOffline(0.2, () => {
    names = [...new Cinematic(def, { calm: false, drive: 1, tension: 1 }, mixBus('music')!.dry.context).strips.keys()];
  }, [], 22050);
  return names;
}

/** A track with only one strip sounding (`solo`), for its stem's loudness; the rest of the mix as in the game. */
export async function renderTrackSolo(path: string, name: string, secs: number, mood: Mood, solo: string, sr = 48000): Promise<Rendered> {
  const mod = await load(path);
  const def = (name.startsWith('TRACKS.') ? (mod.TRACKS as Record<string, TrackDef>)[name.slice(7)] : (mod[name] as TrackDef)) ?? null;
  if (!def) throw new Error(`no track ${name} in ${path}`);
  const t0 = performance.now();
  const buf = await renderOffline(secs, () => {
    const p = new Cinematic(def, mood, mixBus('music')!.dry.context, 1);
    p.start(0);
    for (const [n, s] of p.strips) if (n !== solo) s.fader.gain.value = 0;
  }, [], sr);
  const { pcm, nan } = interleave(buf);
  return { pcm, sr, nan, ms: performance.now() - t0 };
}

