/** The render page (Vite dev serves it): render.mjs calls `__render` and receives the samples over HTTP. */
import { renderPiece, type Stem } from './kit';
import { PIECES } from './pieces';
import { sanity } from './sanity';

declare global {
  interface Window {
    __render: (name: string, stem: Stem, postTo: string, solo?: string) => Promise<{ frames: number; sampleRate: number; ms: number; strips: string[] }>;
    __sanity: () => string[];
    __ready: boolean;
  }
}

window.__render = async (name, stem, postTo, solo) => {
  const def = PIECES[name];
  if (!def) throw new Error(`no piece called ${name}`);
  const t0 = performance.now();
  const strips: string[] = [];
  const buf = await renderPiece(def, stem, solo ?? null, strips);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const out = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) {
    out[i * 2] = L[i];
    out[i * 2 + 1] = R[i];
  }
  const res = await fetch(postTo, { method: 'POST', body: out.buffer, headers: { 'Content-Type': 'application/octet-stream' } });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return { frames: L.length, sampleRate: buf.sampleRate, ms: Math.round(performance.now() - t0), strips };
};
window.__sanity = sanity;
window.__ready = true;
