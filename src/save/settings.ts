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
  /** Extra whole-number pixel zoom on top of the automatic scale. */
  zoom: number;
  uiScale: number;
  /** Interface look: the modern HUD (v0.9) or the classic pixel frames. */
  uiStyle: 'modern' | 'classic';
  weather: boolean;
  clouds: boolean;
  crt: boolean;
  dayNight: boolean;
  batterySaver: boolean;
  /** The 3D edition's detail (shadows, ambient occlusion, resolution, plants); 'auto' picks by device. */
  quality3d: 'auto' | 'high' | 'medium' | 'low';
  /**
   * Which edition opens: the installed apps always start at /play/, which hands over to /play3d/ when this is '3d'
   * (Settings → Display → Edition sets it).
   */
  edition: 'pixel' | '3d';
  fps: boolean;
  /** Phones in a browser tab: go fullscreen on the first tap. */
  phoneFullscreen: boolean;
  // audio (0..1)
  master: number;
  music: number;
  sfx: number;
  /** The sound of the place under the music: wind, birds, rain, the halls' hum. */
  ambience: number;
  /** Which score plays: 'auto' is the cinematic one in the 3D edition and the chiptune in the pixel edition. */
  soundtrack: 'auto' | 'cinematic' | 'chiptune';
  muteInBackground: boolean;
  // accessibility
  /** Text font: smooth Atkinson Hyperlegible (default), the classic pixel fonts, or the device's own. */
  textFont: 'clean' | 'pixel' | 'system';
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
    zoom: 1,
    uiScale: 1,
    uiStyle: 'modern',
    weather: true,
    clouds: true,
    crt: false,
    dayNight: true,
    batterySaver: false,
    quality3d: 'auto',
    edition: 'pixel',
    fps: false,
    phoneFullscreen: true,
    master: 0.8,
    music: 0.6,
    sfx: 0.8,
    ambience: 0.7,
    soundtrack: 'auto',
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
    const raw = JSON.parse(txt) as Partial<Settings> & { sound?: boolean; tutorialHints?: boolean; readableFont?: boolean };
    // v0.1 settings: { sound, offline, zoom, tutorialHints }
    if (raw.sound === false && raw.master === undefined) raw.master = 0;
    if (raw.tutorialHints !== undefined && raw.goalTracker === undefined) raw.goalTracker = raw.tutorialHints;
    // v0.4.1 and earlier: a "Readable font" toggle (the system font) over the pixel font
    if (raw.textFont === undefined && raw.readableFont === true) raw.textFont = 'system';
    delete raw.sound;
    delete raw.tutorialHints;
    delete raw.readableFont;
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

/** Apply the settings that live in CSS (fonts, contrast, colour-blind palette, UI scale, CRT). */
export function applyCssSettings(s: Settings): void {
  const root = document.documentElement;
  root.classList.toggle('font-pixel', s.textFont === 'pixel');
  root.classList.toggle('font-system', s.textFont === 'system');
  root.classList.toggle('contrast', s.highContrast);
  root.classList.toggle('reduced-motion', s.reducedMotion);
  root.classList.toggle('cb-deutan', s.colorblind === 'deutan');
  root.classList.toggle('cb-tritan', s.colorblind === 'tritan');
  root.classList.toggle('crt', s.crt);
  root.classList.toggle('ui-classic', s.uiStyle === 'classic');
  root.style.setProperty('--ui-zoom', String(s.uiScale));
}
