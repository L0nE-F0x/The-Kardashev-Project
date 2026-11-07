import { useEffect, useRef } from 'preact/hooks';
import { Icon } from './components';
import type { IconName } from './icons';
import { bakeRgba } from '../render/pixels';
import { getEra } from '../render/palette';
import { DOCK_SIZE, dockIconCanvas, hasDockIcon } from './dockIcons';

/** Device pixels per CSS pixel at `el`: the screen's ratio times every CSS zoom above it (the interface size). */
function deviceScale(el: Element): number {
  let zoom = 1;
  for (let a: Element | null = el; a; a = a.parentElement) zoom *= parseFloat(getComputedStyle(a).zoom) || 1;
  return (window.devicePixelRatio || 1) * zoom;
}

/**
 * A dock icon (dockIcons.ts) on a canvas the size of the button's inside, in whole device pixels, with the art at
 * the largest whole-number scale that leaves a little room (two when only a tight fit allows it). So every art
 * pixel is the same size on any screen scale (1.25×, 1.5×, phones), where an <img> stretched to 27 CSS px mixes
 * 3- and 4-pixel-wide pixels. The classic look keeps the 9×9 icons.
 */
export function DockIcon({ name, classic }: { name: IconName; classic: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const art = !classic && hasDockIcon(name);
  const era = getEra();
  useEffect(() => {
    const cv = ref.current;
    if (!art || !cv) return;
    const pc = dockIconCanvas(name as never);
    const src = new Uint8Array(DOCK_SIZE * DOCK_SIZE * 4);
    bakeRgba(pc, src);
    const draw = (dw: number, dh: number) => {
      dw = Math.round(dw);
      dh = Math.round(dh);
      if (dw < 1 || dh < 1) return;
      const m = Math.min(dw, dh);
      let k = Math.floor((m * 0.9) / DOCK_SIZE);
      if (k < 2 && m >= DOCK_SIZE * 2) k = 2;
      k = Math.max(1, k);
      cv.width = dw;
      cv.height = dh;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      const img = ctx.createImageData(dw, dh);
      const ox = Math.floor((dw - DOCK_SIZE * k) / 2);
      const oy = Math.floor((dh - DOCK_SIZE * k) / 2);
      for (let y = 0; y < DOCK_SIZE * k; y++) {
        const ty = oy + y;
        if (ty < 0 || ty >= dh) continue;
        const sy = Math.floor(y / k) * DOCK_SIZE;
        for (let x = 0; x < DOCK_SIZE * k; x++) {
          const tx = ox + x;
          if (tx < 0 || tx >= dw) continue;
          const si = (sy + Math.floor(x / k)) * 4;
          if (!src[si + 3]) continue;
          const ti = (ty * dw + tx) * 4;
          img.data[ti] = src[si];
          img.data[ti + 1] = src[si + 1];
          img.data[ti + 2] = src[si + 2];
          img.data[ti + 3] = src[si + 3];
        }
      }
      ctx.putImageData(img, 0, 0);
    };
    const ro = new ResizeObserver(([e]) => {
      // Chrome's exact device-pixel size when it agrees with ours (emulated screen scales report CSS pixels there;
      // WebKit has no such box): otherwise our estimate, the CSS size times the screen scale and the UI zoom
      const f = deviceScale(cv);
      const w = e.contentRect.width * f;
      const h = e.contentRect.height * f;
      const box = e.devicePixelContentBoxSize?.[0];
      if (box && Math.abs(box.inlineSize - w) <= 2 && Math.abs(box.blockSize - h) <= 2) draw(box.inlineSize, box.blockSize);
      else draw(w, h);
    });
    try {
      ro.observe(cv, { box: 'device-pixel-content-box' });
    } catch {
      ro.observe(cv);
    }
    return () => ro.disconnect();
  }, [name, art, era]);
  if (!art) return <Icon name={name} size="lg" />;
  return <canvas ref={ref} class="dock-ic" aria-hidden="true" />;
}
