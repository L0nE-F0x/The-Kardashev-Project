/**
 * The Type I end card: a 1920×1080 picture to save or share. The backdrop is the ending's own last frame (the
 * Sun ringed by the swarm, the Earth on its orbit: the 3D stage's capture of the solar-system scene, posed at the
 * cinematic's held shot), the run's numbers are set over it in the interface's typeface, with the logo small.
 * Composed on a 2D canvas, so it needs a browser; `endCardFacts` (what the card says) is pure and runs anywhere.
 */
import * as THREE from 'three';
import type { GameState } from '../sim/types';
import type { GameStage } from './stage';
import { PALETTE } from './palette';
import { fmtTW } from '../sim/core';
import { spaceTW } from '../sim/swarm';
import { warming } from '../sim/climate';
import { bitForm } from '../sim/systemView';

export const END_W = 1920;
export const END_H = 1080;

const FONT = '"Atkinson Hyperlegible Next", system-ui, -apple-system, "Segoe UI", sans-serif';

/** The run in a line: what Earth became, who owns the sky, what became of Bit. */
function identity(s: GameState): string {
  const sy = s.system;
  if (!sy) return '';
  const earth = sy.earth && { garden: 'Garden Earth', provinces: 'Patchwork Earth', workshop: 'Workshop Earth' }[sy.earth];
  const sky = sy.ownership && { commons: 'The commons', concessions: 'Concessions', claims: 'Claims' }[sy.ownership];
  const bit = sy.bitFate && { costeward: 'Bit at your side', free: 'Bit set free', leash: 'Bit on a leash' }[sy.bitFate];
  return [earth, sky, bit].filter(Boolean).join('  ·  ');
}

export interface EndCardFacts {
  year: number;
  company: string;
  kardashev: string;
  /** Label and value, in reading order (two columns on the card). */
  stats: [label: string, value: string][];
  identity: string;
}

/** Everything the card says about the run. */
export function endCardFacts(s: GameState): EndCardFacts {
  const day = s.system?.typeI ? s.system.typeI : s.day;
  const sy = s.system;
  const stats: [string, string][] = [
    ['World power', fmtTW(s.stats.worldTW)],
    ['In space', fmtTW(spaceTW(s))],
    ['Warming', `${warming(s).toFixed(2)} °C`],
    ['Solar Maximum', `${sy?.solarmax?.held ?? 0}/3 held`],
  ];
  if (sy) stats.push(['Healthy years', sy.lifeExp.toFixed(0)], ['Living in space', `${sy.spacePop.toFixed(0)}M`]);
  const difficulty = s.meta.difficulty.charAt(0).toUpperCase() + s.meta.difficulty.slice(1);
  stats.push(['Models', `${s.models.length} · Bit-${bitForm(s)}`], ['Difficulty', difficulty]);
  return {
    year: new Date(Date.UTC(2027, 0, 1) + day * 86_400_000).getUTCFullYear(),
    company: s.company.name.slice(0, 28),
    kardashev: s.stats.K.toFixed(4),
    stats,
    identity: identity(s),
  };
}

// ── the backdrop ────────────────────────────────────────────────────────────────────────────

export interface EndCardBackdrop {
  /** The stage's picture (a PNG data URL). */
  url: string;
  /** Where the Sun and the Earth are in it (0..1 across and down), when the scene could say. */
  sun: [number, number] | null;
  earth: [number, number] | null;
}

/** The ending's scene as far as the card needs it (render3d/system/systemScene.ts; every field checked before use). */
interface EndingScene {
  scene?: THREE.Object3D;
  camera?: THREE.Camera;
  /** Runs `shoot` with the camera on the pull-back's held frame (the ring closed, the Earth lower right). */
  atCardPose?<T>(shoot: () => T): T | null;
}

/**
 * A picture of the stage for the card, or null when the stage isn't showing the ending's solar system (the card
 * then paints its own sky).
 */
export function endCardBackdrop(stage: GameStage): EndCardBackdrop | null {
  const sc = stage.getScene() as (EndingScene & object) | null;
  if (!sc || !stage.capture || typeof sc.atCardPose !== 'function') return null;
  const capture = () => stage.capture!();
  try {
    return sc.atCardPose((): EndCardBackdrop | null => {
      const url = capture();
      if (!url) return null;
      let sun: [number, number] | null = null;
      let earth: [number, number] | null = null;
      if (sc.camera && sc.scene) {
        const at = (p: THREE.Vector3): [number, number] | null => {
          p.project(sc.camera!);
          return p.z < 1 ? [(p.x + 1) / 2, (1 - p.y) / 2] : null;
        };
        sc.camera.updateMatrixWorld();
        sun = at(new THREE.Vector3(0, 0, 0));
        // the Earth is the mesh that wears the globe's material (it has the land texture)
        sc.scene.traverse((o) => {
          const u = ((o as THREE.Mesh).material as THREE.ShaderMaterial | undefined)?.uniforms;
          if (!earth && u?.tLand && u?.tColor) earth = at(o.getWorldPosition(new THREE.Vector3()));
        });
      }
      return { url, sun, earth };
    });
  } catch {
    return null;
  }
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((done) => {
    const img = new Image();
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = url;
  });
}

/** A repeatable random number source (the fallback sky's stars). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where the card wants the Sun. */
const SUN_AT: [number, number] = [1160, 470];

/** Without the 3D scene: a painted sky with the Sun, the swarm's ring of glints and the Earth on it. */
function paintSky(ctx: CanvasRenderingContext2D): void {
  const [sx, sy] = SUN_AT;
  const bg = ctx.createLinearGradient(0, 0, 0, END_H);
  bg.addColorStop(0, '#03040c');
  bg.addColorStop(1, '#0b0a1c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, END_W, END_H);
  const rnd = rng(2091);
  for (let i = 0; i < 520; i++) {
    ctx.fillStyle = `rgb(230 236 255 / ${0.15 + rnd() * 0.6})`;
    const r = 0.5 + rnd() * rnd() * 1.6;
    ctx.beginPath();
    ctx.arc(rnd() * END_W, rnd() * END_H, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const glow = (r: number, stops: [number, string][]) => {
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    for (const [t, c] of stops) g.addColorStop(t, c);
    ctx.fillStyle = g;
    ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  };
  glow(620, [[0, 'rgb(255 190 110 / 0.34)'], [0.4, 'rgb(240 138 70 / 0.12)'], [1, 'rgb(240 138 70 / 0)']]);
  const rx = 600;
  const ry = 186;
  const ring = (near: boolean) => {
    for (let i = 0; i < 1500; i++) {
      const a = rnd() * Math.PI * 2;
      if (Math.sin(a) > 0 !== near) continue;
      const k = 1 + (rnd() - 0.5) * 0.09;
      const x = sx + Math.cos(a) * rx * k;
      const y = sy + Math.sin(a) * ry * k + (rnd() - 0.5) * 16;
      ctx.fillStyle = near ? `rgb(255 214 150 / ${0.4 + rnd() * 0.6})` : `rgb(240 138 70 / ${0.3 + rnd() * 0.5})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + rnd() * (near ? 2.2 : 1.4), 0, Math.PI * 2);
      ctx.fill();
    }
  };
  ring(false);
  glow(150, [[0, '#fffdf2'], [0.42, '#fff0c4'], [0.56, 'rgb(253 212 110 / 0.85)'], [1, 'rgb(240 138 70 / 0)']]);
  ring(true);
  // the Earth, on the near side of the ring
  const ex = sx + Math.cos(0.62) * rx;
  const ey = sy + Math.sin(0.62) * ry;
  const er = 26;
  const eg = ctx.createRadialGradient(ex - er * 0.5, ey - er * 0.3, er * 0.1, ex, ey, er);
  eg.addColorStop(0, '#8fd0ee');
  eg.addColorStop(0.5, '#2c6399');
  eg.addColorStop(1, '#0a1530');
  ctx.fillStyle = eg;
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, Math.PI * 2);
  ctx.fill();
}

/** The 3D picture under the card: scaled to fill, the Sun put where the card wants it, its edges melted into black. */
function paintBackdrop(ctx: CanvasRenderingContext2D, img: HTMLImageElement, b: EndCardBackdrop): [number, number] | null {
  ctx.fillStyle = '#020308';
  ctx.fillRect(0, 0, END_W, END_H);
  const h = END_H * 1.14;
  const w = (h * img.naturalWidth) / img.naturalHeight;
  const sun = b.sun ?? [0.5, 0.42];
  let x = SUN_AT[0] - sun[0] * w;
  let y = SUN_AT[1] - sun[1] * h;
  // keep the Earth clear of the right edge, and the picture over the whole height
  if (b.earth) x -= Math.max(0, Math.min(140, x + b.earth[0] * w - (END_W - 130)));
  y = Math.min(0, Math.max(END_H - h, y));
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, x, y, w, h);
  // where the picture ends short of the card's sides, melt it away
  for (const [edge, dir] of [[x, 1], [x + w, -1]] as const) {
    if (edge <= 0 || edge >= END_W) continue;
    const g = ctx.createLinearGradient(edge, 0, edge + dir * 260, 0);
    g.addColorStop(0, '#020308');
    g.addColorStop(1, 'rgb(2 3 8 / 0)');
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(edge, edge + dir * 260), 0, 260, END_H);
  }
  return b.earth ? [x + b.earth[0] * w, y + b.earth[1] * h] : null;
}

/** Text with letter-spacing, drawn letter by letter (the canvas property isn't in every webview). */
function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, gap: number, align: 'left' | 'center' | 'right' = 'left'): number {
  let width = 0;
  for (const ch of text) width += ctx.measureText(ch).width + gap;
  width -= gap;
  let cx = align === 'left' ? x : align === 'center' ? x - width / 2 : x - width;
  const was = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + gap;
  }
  ctx.textAlign = was;
  return width;
}

export interface EndCardInput {
  s: GameState;
  /** The stage's picture (`endCardBackdrop`), or null for the painted sky. */
  backdrop: EndCardBackdrop | null;
  /** The logo's address (ui/logo.ts). */
  logo: string;
}

/** The card as a PNG data URL (1920×1080). */
export async function drawEndCard({ s, backdrop, logo }: EndCardInput): Promise<string> {
  const f = endCardFacts(s);
  const [shot, mark] = await Promise.all([backdrop ? loadImage(backdrop.url) : null, loadImage(logo)]);
  // the interface's typeface, in the weights the card uses
  try {
    await Promise.all(['500', '700', '800'].map((w) => document.fonts.load(`${w} 40px "Atkinson Hyperlegible Next"`)));
  } catch {
    /* the fallback faces will do */
  }
  const canvas = document.createElement('canvas');
  canvas.width = END_W;
  canvas.height = END_H;
  const ctx = canvas.getContext('2d')!;
  let earth: [number, number] | null = null;
  if (shot && backdrop) earth = paintBackdrop(ctx, shot, backdrop);
  else paintSky(ctx);

  // a shade for the words at the left, a soft letterbox, the corners drawn in
  const shade = ctx.createLinearGradient(0, 0, END_W, 0);
  shade.addColorStop(0, 'rgb(4 4 11 / 0.95)');
  shade.addColorStop(0.24, 'rgb(4 4 11 / 0.88)');
  shade.addColorStop(0.38, 'rgb(4 4 11 / 0.55)');
  shade.addColorStop(0.54, 'rgb(4 4 11 / 0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, END_W, END_H);
  const box = ctx.createLinearGradient(0, 0, 0, END_H);
  box.addColorStop(0, 'rgb(4 4 11 / 0.5)');
  box.addColorStop(0.14, 'rgb(4 4 11 / 0)');
  box.addColorStop(0.84, 'rgb(4 4 11 / 0)');
  box.addColorStop(1, 'rgb(4 4 11 / 0.6)');
  ctx.fillStyle = box;
  ctx.fillRect(0, 0, END_W, END_H);

  const X = 104;
  const muted = '#a59db5';
  const text = '#f3eff8';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgb(0 0 0 / 0.6)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 2;

  // the logo, small (its picture is empty for 8/121 of its width at the left: the letters stand on the margin)
  const LOGO_W = 318;
  if (mark) {
    ctx.shadowColor = 'transparent';
    ctx.drawImage(mark, X - (LOGO_W * 8) / 121, 52, LOGO_W, (LOGO_W * mark.naturalHeight) / mark.naturalWidth);
    ctx.shadowColor = 'rgb(0 0 0 / 0.6)';
  } else {
    ctx.fillStyle = text;
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText('The Kardashev Project', X, 104);
  }

  // Type I, the year, the company
  ctx.font = `700 27px ${FONT}`;
  ctx.fillStyle = PALETTE.yel0;
  spaced(ctx, 'TYPE I CIVILISATION', X, 244, 8.5);
  ctx.font = `800 170px ${FONT}`;
  ctx.fillStyle = text;
  ctx.fillText(String(f.year), X - 8, 396);
  ctx.font = `700 46px ${FONT}`;
  ctx.fillStyle = PALETTE.cyn5;
  ctx.fillText(f.company, X, 464);

  // a hairline, then Kardashev large and the rest in two columns
  ctx.shadowColor = 'transparent';
  const rule = ctx.createLinearGradient(X, 0, X + 640, 0);
  rule.addColorStop(0, 'rgb(251 212 110 / 0.75)');
  rule.addColorStop(1, 'rgb(251 212 110 / 0)');
  ctx.fillStyle = rule;
  ctx.fillRect(X, 504, 640, 2);
  ctx.shadowColor = 'rgb(0 0 0 / 0.6)';
  const COL = 318;
  const cell = (label: string, value: string, x: number, y: number, big = false) => {
    ctx.font = `700 18px ${FONT}`;
    ctx.fillStyle = muted;
    spaced(ctx, label.toUpperCase(), x, y, 3.6);
    ctx.font = `800 ${big ? 78 : 36}px ${FONT}`;
    ctx.fillStyle = big ? PALETTE.yel0 : text;
    ctx.fillText(value, x - (big ? 3 : 0), y + (big ? 76 : 42));
  };
  cell('Kardashev', f.kardashev, X, 556, true);
  const [first, second, ...rest] = f.stats;
  // beside the big number: the world's power and how much of it is in space
  cell(first[0], first[1], X + COL, 556);
  cell(second[0], second[1], X + COL, 556 + 78);
  rest.forEach(([label, value], i) => cell(label, value, X + (i % 2) * COL, 722 + Math.floor(i / 2) * 82));
  const foot = 722 + Math.ceil(rest.length / 2) * 82;

  // the run in a line
  if (f.identity) {
    ctx.font = `500 25px ${FONT}`;
    ctx.fillStyle = PALETTE.cyn6;
    ctx.fillText(f.identity, X, Math.min(END_H - 56, foot + 26));
  }

  // the Earth, named (it is a marble at this distance)
  if (earth && earth[0] > END_W * 0.5 && earth[0] < END_W - 60 && earth[1] > 80 && earth[1] < END_H - 110) {
    ctx.font = `700 17px ${FONT}`;
    ctx.fillStyle = 'rgb(214 226 240 / 0.9)';
    spaced(ctx, 'EARTH', earth[0], earth[1] + 58, 5, 'center');
  }

  // the address, small, and a hairline frame
  ctx.font = `500 20px ${FONT}`;
  ctx.fillStyle = 'rgb(255 255 255 / 0.62)';
  ctx.textAlign = 'right';
  ctx.fillText('thekardashevproject.netlify.app', END_W - 64, END_H - 50);
  ctx.textAlign = 'left';
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgb(255 255 255 / 0.13)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(25, 25, END_W - 50, END_H - 50, 18);
  ctx.stroke();
  return canvas.toDataURL('image/png');
}
