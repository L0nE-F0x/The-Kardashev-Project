/** Shared WebAudio graph: master → (sfx bus, music bus). Created lazily on first use. */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicGain: GainNode | null = null;
const volumes = { master: 0.8, sfx: 0.8, music: 0.6 };
let suspendedByApp = false;

export function audioCtx(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      masterGain = ctx.createGain();
      sfxGain = ctx.createGain();
      musicGain = ctx.createGain();
      sfxGain.connect(masterGain);
      musicGain.connect(masterGain);
      masterGain.connect(ctx.destination);
      applyVolumes();
    }
    if (ctx.state === 'suspended' && !suspendedByApp) void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function sfxBus(): GainNode | null {
  return audioCtx() ? sfxGain : null;
}

export function musicBus(): GainNode | null {
  return audioCtx() ? musicGain : null;
}

function applyVolumes() {
  if (!ctx || !masterGain || !sfxGain || !musicGain) return;
  const t = ctx.currentTime;
  masterGain.gain.setTargetAtTime(volumes.master, t, 0.05);
  sfxGain.gain.setTargetAtTime(volumes.sfx * 0.2, t, 0.05);
  musicGain.gain.setTargetAtTime(volumes.music * 0.35, t, 0.1);
}

export function setVolumes(v: Partial<typeof volumes>): void {
  Object.assign(volumes, v);
  applyVolumes();
}

export function getVolumes() {
  return { ...volumes };
}

/** Pause all audio (tab hidden, app backgrounded). */
export function suspendAudio(): void {
  suspendedByApp = true;
  void ctx?.suspend();
}

export function resumeAudio(): void {
  suspendedByApp = false;
  void ctx?.resume();
}

/** Browsers only allow audio after a user gesture: unlock on the first one. */
export function unlockOnGesture(onUnlock: () => void): void {
  const go = () => {
    window.removeEventListener('pointerdown', go);
    window.removeEventListener('keydown', go);
    audioCtx();
    onUnlock();
  };
  window.addEventListener('pointerdown', go);
  window.addEventListener('keydown', go);
}
