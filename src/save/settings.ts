/** Player preferences, shared by every save slot. Stored in localStorage. */
export interface Settings {
  // gameplay
  autoPause: boolean;
  offline: boolean;
  /** Game months per real hour away. */
  offlineRate: number;
  autosaveSec: number;
  /** Ask before spending at least this much (0 = never ask). */
  confirmSpend: number;
  goalTracker: boolean;
  // display
  /** Extra whole-number pixel zoom on top of the automatic scale. */
  zoom: number;
  uiScale: number;
  weather: boolean;
  clouds: boolean;
  crt: boolean;
  dayNight: boolean;
  batterySaver: boolean;
  fps: boolean;
  // audio (0..1)
  master: number;
  music: number;
  sfx: number;
  muteInBackground: boolean;
  // accessibility
  readableFont: boolean;
  colorblind: 'off' | 'deutan' | 'tritan';
  reducedMotion: boolean;
  highContrast: boolean;
  // controls
  wheel: 'zoom' | 'pan';
  // bookkeeping
  lastSeenVersion: string;
  tutorialOffered: boolean;
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
    offline: true,
    offlineRate: 1,
    autosaveSec: 20,
    confirmSpend: 0,
    goalTracker: true,
    zoom: 1,
    uiScale: 1,
    weather: true,
    clouds: true,
    crt: false,
    dayNight: true,
    batterySaver: false,
    fps: false,
    master: 0.8,
    music: 0.6,
    sfx: 0.8,
    muteInBackground: true,
    readableFont: false,
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
    const raw = JSON.parse(txt) as Partial<Settings> & { sound?: boolean; tutorialHints?: boolean };
    // v0.1 settings: { sound, offline, zoom, tutorialHints }
    if (raw.sound === false && raw.master === undefined) raw.master = 0;
    if (raw.tutorialHints !== undefined && raw.goalTracker === undefined) raw.goalTracker = raw.tutorialHints;
    delete raw.sound;
    delete raw.tutorialHints;
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
  root.classList.toggle('readable', s.readableFont);
  root.classList.toggle('contrast', s.highContrast);
  root.classList.toggle('reduced-motion', s.reducedMotion);
  root.classList.toggle('cb-deutan', s.colorblind === 'deutan');
  root.classList.toggle('cb-tritan', s.colorblind === 'tritan');
  root.classList.toggle('crt', s.crt);
  root.style.setProperty('--ui-zoom', String(s.uiScale));
}
