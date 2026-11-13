/** Player preferences, shared by every save slot. Stored in localStorage. */
export interface Settings {
  // gameplay
  autoPause: boolean;
  /** Playtest notes: a Note button and the J key stamp quick notes onto the save. */
  playtestNotes: boolean;
  offline: boolean;
  /** Game months per real hour away. */
  offlineRate: number;
  autosaveSec: number;
  /** Ask before spending at least this much (0 = never ask). */
  confirmSpend: number;
  goalTracker: boolean;
  /** Advisor tips: one-off nudges when something is stuck (game/tips.ts). */
  tips: boolean;
  // display
  uiScale: number;
  weather: boolean;
  dayNight: boolean;
  batterySaver: boolean;
  /** 3D detail (shadows, ambient occlusion, resolution, plants); 'auto' picks by the machine. */
  quality3d: 'auto' | 'high' | 'medium' | 'low';
  fps: boolean;
  /**
   * The interface's look (SPEC §34): it grows with the acts ('auto': plywood and paper in the garage, metal, glass,
   * first light, only light by Type I), or stays on one stage (1–5) the player has reached.
   */
  interfaceLook: 'auto' | 1 | 2 | 3 | 4 | 5;
  /** The furthest look this player has reached: the stages Settings offers to stay on. */
  lookReached: number;
  /** The look last worn, so the loading screen can wear it before the game has started. */
  lookNow: number;
  // audio (0..1)
  master: number;
  music: number;
  sfx: number;
  /** The sound of the place under the music: wind, birds, rain, the halls' hum. */
  ambience: number;
  muteInBackground: boolean;
  // accessibility
  /** Text font: smooth Atkinson Hyperlegible (default), or the system's own. */
  textFont: 'clean' | 'system';
  colorblind: 'off' | 'deutan' | 'tritan';
  reducedMotion: boolean;
  highContrast: boolean;
  // controls
  wheel: 'zoom' | 'pan';
  // bookkeeping
  lastSeenVersion: string;
  tutorialOffered: boolean;
  /** New Game+: the best year each difficulty reached Type I, and the Steward founder unlocked. */
  typeIBest?: Record<string, number>;
  stewardUnlocked?: boolean;
}

const KEY = 'kardashev.settings.v1';

const prefersReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export function defaultSettings(): Settings {
  return {
    autoPause: true,
    playtestNotes: false,
    offline: true,
    offlineRate: 1,
    autosaveSec: 20,
    confirmSpend: 0,
    goalTracker: true,
    tips: true,
    uiScale: 1,
    weather: true,
    dayNight: true,
    batterySaver: false,
    quality3d: 'auto',
    fps: false,
    interfaceLook: 'auto',
    lookReached: 1,
    lookNow: 1,
    master: 0.8,
    music: 0.6,
    sfx: 0.8,
    ambience: 0.7,
    muteInBackground: true,
    textFont: 'clean',
    colorblind: 'off',
    reducedMotion: prefersReducedMotion(),
    highContrast: false,
    wheel: 'zoom',
    lastSeenVersion: '',
    tutorialOffered: false,
  };
}

export function loadSettings(): Settings {
  const base = defaultSettings();
  try {
    const txt = window.localStorage.getItem(KEY);
    if (!txt) return base;
    const raw = JSON.parse(txt) as Partial<Settings> & Record<string, unknown> & { sound?: boolean; tutorialHints?: boolean; readableFont?: boolean };
    // v0.1 settings: { sound, offline, zoom, tutorialHints }
    if (raw.sound === false && raw.master === undefined) raw.master = 0;
    if (raw.tutorialHints !== undefined && raw.goalTracker === undefined) raw.goalTracker = raw.tutorialHints;
    // v0.4.1 and earlier: a "Readable font" toggle (the system font) over the pixel font
    if (raw.textFont === undefined && raw.readableFont === true) raw.textFont = 'system';
    delete raw.sound;
    delete raw.tutorialHints;
    delete raw.readableFont;
    // v0.12 and earlier: the pixel edition's settings (its zoom, its map clouds, which edition opens, phones) and
    // the retro options (the Classic look, the CRT filter, the Chiptune soundtrack, the Pixel text font)
    for (const k of ['zoom', 'clouds', 'edition', 'phoneFullscreen', 'uiStyle', 'crt', 'soundtrack']) delete raw[k];
    if (raw.textFont !== 'system') raw.textFont = 'clean';
    return { ...base, ...raw };
  } catch {
    return base;
  }
}

export function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
}

/** The look for an act (1–5), or the one the player chose to stay on. */
export function lookFor(s: Settings, act: number): number {
  const grown = Math.max(1, Math.min(5, Math.round(act) || 1));
  return s.interfaceLook === 'auto' ? grown : Math.max(1, Math.min(5, s.interfaceLook));
}
export const LOOK_NAMES = ['', 'The garage', 'The scale-up', 'The Charter', 'Planetary', 'Type I'];

/** Apply the settings that live in CSS (font, contrast, colour-blind palette, UI scale). */
export function applyCssSettings(s: Settings): void {
  const root = document.documentElement;
  root.classList.toggle('font-system', s.textFont === 'system');
  root.classList.toggle('contrast', s.highContrast);
  root.classList.toggle('reduced-motion', s.reducedMotion);
  root.classList.toggle('cb-deutan', s.colorblind === 'deutan');
  root.classList.toggle('cb-tritan', s.colorblind === 'tritan');
  root.style.setProperty('--ui-zoom', String(s.uiScale));
}
