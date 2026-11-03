import type { AdvisorId } from '../../sim/types';
import type { Mood } from '../../content/events';
import { C } from '../palette';
import { PixelCanvas, toDataUrl } from '../pixels';
import { onEraChange } from '../palette';

const S = 32;

interface Look {
  bg: [number, number];
  skin: [number, number, number]; // shadow, base, light
  hair: [number, number];
  cloth: [number, number, number];
  style: 'hardhat' | 'bob' | 'long' | 'curly' | 'bun' | 'spiky';
  glasses?: boolean;
  beard?: boolean;
  headset?: boolean;
  scarf?: number;
  coat?: boolean;
}

const LOOKS: Record<Exclude<AdvisorId, 'bit'>, Look> = {
  juno: { bg: [C.org0, C.org1], skin: [C.skn1, C.skn2, C.skn3], hair: [C.ink0, C.ink1], cloth: [C.blu1, C.blu2, C.blu3], style: 'hardhat' },
  penny: { bg: [C.grn3, C.grn5], skin: [C.skn4, C.skn5, C.skn6], hair: [C.snd1, C.snd2], cloth: [C.ink3, C.ink4, C.ink5], style: 'bob', glasses: true },
  mira: { bg: [C.cyn2, C.cyn3], skin: [C.skn3, C.skn4, C.skn5], hair: [C.ink0, C.ink1], cloth: [C.vio1, C.vio2, C.vio3], style: 'long', headset: true },
  sol: { bg: [C.vio2, C.vio3], skin: [C.skn2, C.skn3, C.skn4], hair: [C.ink1, C.ink2], cloth: [C.snd2, C.snd3, C.snd4], style: 'curly', beard: true, scarf: C.red3 },
  iris: { bg: [C.blu2, C.blu4], skin: [C.skn4, C.skn5, C.skn6], hair: [C.ink7, C.ink8], cloth: [C.ink8, C.ink9, C.white], style: 'bun', glasses: true, coat: true },
  kip: { bg: [C.sky1, C.sky2], skin: [C.skn4, C.skn5, C.skn6], hair: [C.yel0, C.yel1], cloth: [C.org0, C.org1, C.org2], style: 'spiky' },
};

function background(pc: PixelCanvas, [dark, light]: [number, number]) {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const corner = (x < 2 && y < 2 && x + y < 2) || (x > S - 3 && y < 2 && S - 1 - x + y < 2) || (x < 2 && y > S - 3 && x + S - 1 - y < 2) || (x > S - 3 && y > S - 3 && S * 2 - 2 - x - y < 2);
      if (corner) continue;
      pc.set(x, y, y < 18 || ((x + y) & 1 && y < 24) ? light : dark);
    }
  }
}

function face(pc: PixelCanvas, L: Look, mood: Mood) {
  const [sh, base, hi] = L.skin;
  // shoulders + torso
  pc.ellipse(16, 33, 13, 9, L.cloth[1]);
  for (let y = 25; y < S; y++) for (let x = 3; x < 29; x++) if (pc.get(x, y) === L.cloth[1] && x > 20) pc.set(x, y, L.cloth[0]);
  for (let y = 25; y < S; y++) for (let x = 3; x < 12; x++) if (pc.get(x, y) === L.cloth[1] && (x + y) % 3 === 0) pc.set(x, y, L.cloth[2]);
  if (L.coat) {
    pc.line(13, 25, 16, 31, C.ink6);
    pc.line(19, 25, 16, 31, C.ink6);
  }
  // neck
  pc.rect(13, 20, 6, 6, sh);
  pc.rect(13, 20, 3, 4, base);
  if (L.scarf) {
    pc.rect(10, 24, 12, 2, L.scarf);
    pc.rect(18, 26, 2, 4, L.scarf);
  }
  // head
  pc.ellipse(16, 13.5, 7, 8.5, base);
  for (let y = 5; y < 23; y++) for (let x = 19; x < 24; x++) if (pc.get(x, y) === base && x + (y > 15 ? 1 : 0) > 20) pc.set(x, y, sh);
  pc.set(11, 9, hi);
  pc.set(11, 10, hi);
  pc.set(12, 8, hi);
  // ears
  pc.rect(8, 13, 1, 3, base);
  pc.rect(24, 13, 1, 3, sh);
  // nose
  pc.set(16, 16, sh);
  pc.set(17, 17, sh);
  // eyes + brows + mouth by mood
  const eye = C.ink0;
  const ey = 13;
  const brow = L.hair[1] === C.ink8 ? C.ink6 : L.hair[0];
  if (mood === 'happy') {
    for (const ex of [12, 19]) {
      pc.set(ex, ey + 1, eye);
      pc.set(ex + 1, ey, eye);
      pc.set(ex + 2, ey + 1, eye);
    }
  } else if (mood === 'excited') {
    for (const ex of [12, 19]) {
      pc.rect(ex, ey - 1, 2, 3, eye);
      pc.set(ex, ey - 1, C.white);
    }
  } else {
    for (const ex of [12, 19]) {
      pc.rect(ex, ey, 2, 2, eye);
      pc.set(ex, ey, C.white);
    }
  }
  // brows
  if (mood === 'worried') {
    pc.line(11, ey - 2, 13, ey - 3, brow);
    pc.line(19, ey - 3, 21, ey - 2, brow);
  } else if (mood === 'angry') {
    pc.line(11, ey - 3, 13, ey - 2, brow);
    pc.line(19, ey - 2, 21, ey - 3, brow);
  } else {
    pc.hline(11, ey - 3, 3, brow);
    pc.hline(19, ey - 3, 3, brow);
  }
  const m = C.red2;
  const my = 19;
  if (mood === 'happy') {
    pc.set(13, my, m);
    pc.hline(14, my + 1, 4, m);
    pc.set(18, my, m);
    pc.set(11, 17, C.pnk1);
    pc.set(21, 17, C.pnk0);
  } else if (mood === 'excited') {
    pc.rect(14, my, 4, 2, C.red1);
    pc.hline(14, my, 4, m);
    pc.set(15, my + 1, C.pnk0);
    pc.set(11, 17, C.pnk1);
    pc.set(21, 17, C.pnk0);
  } else if (mood === 'worried') {
    pc.hline(14, my + 1, 2, m);
    pc.set(16, my, m);
    pc.set(17, my + 1, m);
  } else if (mood === 'angry') {
    pc.set(13, my + 1, m);
    pc.hline(14, my, 4, m);
    pc.set(18, my + 1, m);
  } else {
    pc.hline(14, my, 4, sh === C.skn1 || sh === C.skn2 ? C.skn0 : C.skn2);
  }
  if (L.beard) {
    for (let y = 17; y < 23; y++) for (let x = 9; x < 24; x++) if (pc.get(x, y) === base || pc.get(x, y) === sh) if (y > 18 || x < 12 || x > 20) pc.set(x, y, (x + y) % 3 ? L.hair[1] : L.hair[0]);
    // keep the mouth visible
    pc.hline(14, 19, 4, C.red2);
  }
}

function hair(pc: PixelCanvas, L: Look) {
  const [dk, lt] = L.hair;
  switch (L.style) {
    case 'hardhat':
      pc.rect(10, 9, 2, 5, dk);
      pc.rect(21, 9, 2, 5, dk);
      pc.ellipse(16, 8, 9, 5, C.yel0);
      pc.rect(6, 8, 21, 2, C.org2);
      pc.hline(6, 10, 21, C.org1);
      pc.rect(15, 3, 3, 6, C.org2);
      pc.set(11, 5, C.yel1);
      pc.set(12, 4, C.yel1);
      break;
    case 'bob':
      pc.ellipse(16, 10, 9, 7, dk);
      pc.rect(7, 10, 4, 10, dk);
      pc.rect(22, 10, 4, 10, dk);
      pc.ellipse(16, 9, 7, 4, lt);
      pc.rect(9, 9, 15, 2, lt);
      // fringe cut
      pc.hline(10, 11, 13, lt);
      break;
    case 'long':
      pc.ellipse(16, 10, 9, 7, dk);
      pc.rect(7, 10, 3, 16, dk);
      pc.rect(23, 10, 3, 16, dk);
      pc.rect(9, 9, 15, 3, dk);
      pc.set(12, 7, lt);
      pc.set(13, 6, lt);
      break;
    case 'curly':
      for (let i = 0; i < 18; i++) {
        const a = Math.PI + (i / 17) * Math.PI;
        pc.circle(16 + Math.cos(a) * 7.5, 9 + Math.sin(a) * 6, 2.2, i % 2 ? dk : lt);
      }
      pc.rect(10, 7, 13, 3, dk);
      break;
    case 'bun':
      pc.ellipse(16, 8, 8, 5, dk);
      pc.circle(16, 3, 3, lt);
      pc.rect(9, 8, 2, 6, dk);
      pc.rect(22, 8, 2, 6, dk);
      pc.hline(11, 7, 9, lt);
      break;
    case 'spiky':
      for (let i = 0; i < 6; i++) pc.line(9 + i * 3, 9, 8 + i * 3 + (i % 2), 2 + (i % 2) * 2, lt);
      pc.rect(9, 6, 15, 4, lt);
      pc.hline(9, 9, 15, dk);
      break;
  }
}

function accessories(pc: PixelCanvas, L: Look) {
  if (L.glasses) {
    pc.box(10, 12, 5, 4, C.ink1);
    pc.box(18, 12, 5, 4, C.ink1);
    pc.hline(15, 13, 3, C.ink1);
    pc.set(11, 13, C.white);
    pc.set(19, 13, C.white);
  }
  if (L.headset) {
    // band arcing over the hair, ear cup and boom mic
    for (let a = 200; a <= 340; a += 4) {
      const r = (a * Math.PI) / 180;
      pc.set(Math.round(16 + Math.cos(r) * 9), Math.round(9.5 + Math.sin(r) * 7.5), C.ink4);
    }
    pc.rect(6, 11, 3, 5, C.ink3);
    pc.set(7, 12, C.ink5);
    pc.line(8, 16, 13, 20, C.ink3);
    pc.set(13, 20, C.red3);
  }
}

function bit(pc: PixelCanvas, gen: number, mood: Mood) {
  background(pc, [C.ink2, C.ink3]);
  const body = gen >= 2 ? C.blu5 : C.ink7;
  const bodySh = gen >= 2 ? C.blu3 : C.ink5;
  const screen = gen === 0 ? C.ink1 : C.cyn1;
  const glow = gen === 0 ? C.ink4 : gen >= 3 ? C.yel1 : C.cyn5;
  // body
  pc.rect(9, 25, 14, 7, body);
  pc.rect(18, 25, 5, 7, bodySh);
  pc.rect(14, 22, 4, 3, bodySh);
  pc.set(12, 28, glow);
  // head
  const r = gen >= 2 ? 3 : 1;
  for (let y = 7; y < 23; y++) {
    for (let x = 6; x < 26; x++) {
      const cx = x < 6 + r ? 6 + r : x > 25 - r ? 25 - r : x;
      const cy = y < 7 + r ? 7 + r : y > 22 - r ? 22 - r : y;
      if (Math.hypot(x + 0.5 - (cx + 0.5), y + 0.5 - (cy + 0.5)) <= r) pc.set(x, y, x > 21 ? bodySh : body);
    }
  }
  pc.rect(8, 9, 16, 12, screen);
  // antenna
  pc.vline(16, 3, 4, bodySh);
  pc.circle(16.5, 3, gen >= 2 ? 2 : 1.4, glow);
  if (gen >= 3) pc.ring(16.5, 3, 3.5, C.yel0);
  // face on the screen
  if (gen === 0) {
    pc.hline(11, 14, 3, glow);
    pc.hline(18, 14, 3, glow);
    pc.text('Z', 21, 9, glow);
    return;
  }
  if (mood === 'happy' || mood === 'excited') {
    for (const ex of [11, 18]) {
      pc.set(ex, 14, glow);
      pc.set(ex + 1, 13, glow);
      pc.set(ex + 2, 14, glow);
    }
  } else if (mood === 'worried') {
    pc.rect(11, 13, 2, 3, glow);
    pc.rect(19, 13, 2, 3, glow);
    pc.line(10, 11, 13, 12, glow);
    pc.line(19, 12, 22, 11, glow);
  } else {
    pc.rect(11, 12, 3, 3, glow);
    pc.rect(18, 12, 3, 3, glow);
    pc.set(11, 12, C.white);
    pc.set(18, 12, C.white);
  }
  if (mood === 'excited') pc.rect(14, 17, 4, 2, glow);
  else if (mood === 'worried') pc.hline(14, 18, 4, glow);
  else {
    pc.set(13, 17, glow);
    pc.hline(14, 18, 4, glow);
    pc.set(18, 17, glow);
  }
  if (gen >= 2) {
    pc.set(9, 10, C.cyn6);
    pc.set(10, 10, C.cyn6);
  }
}

const cache = new Map<string, string>();
onEraChange(() => cache.clear());

/** Data URL for an advisor portrait (32×32 pixel art; scale up with CSS). */
export function portraitUrl(id: AdvisorId, mood: Mood = 'neutral', bitGen = 1): string {
  const key = `${id}:${mood}:${id === 'bit' ? bitGen : ''}`;
  let url = cache.get(key);
  if (url) return url;
  const pc = new PixelCanvas(S, S);
  if (id === 'bit') bit(pc, bitGen, mood);
  else drawPerson(pc, LOOKS[id], mood);
  url = toDataUrl(pc);
  cache.set(key, url);
  return url;
}

/** Raw canvas for preview tests. */
export function portraitCanvas(id: AdvisorId, mood: Mood = 'neutral', bitGen = 1): PixelCanvas {
  const pc = new PixelCanvas(S, S);
  if (id === 'bit') bit(pc, bitGen, mood);
  else drawPerson(pc, LOOKS[id], mood);
  return pc;
}

/** Hair is drawn once into a scratch layer: behind the head, then again only where it frames the face. */
function drawPerson(pc: PixelCanvas, L: Look, mood: Mood) {
  background(pc, L.bg);
  const h = new PixelCanvas(S, S);
  hair(h, L);
  const front = L.style === 'hardhat';
  if (!front) pc.blit(h, 0, 0);
  face(pc, L, mood);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const c = h.get(x, y);
      if (!c) continue;
      const nx = (x + 0.5 - 16) / 7;
      const ny = (y + 0.5 - 13.5) / 8.5;
      const insideFace = nx * nx + ny * ny <= 1 && y > 9;
      if (front || !insideFace) pc.set(x, y, c);
    }
  }
  accessories(pc, L);
}
