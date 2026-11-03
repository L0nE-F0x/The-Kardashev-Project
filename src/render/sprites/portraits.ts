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
  style: 'hardhat' | 'bob' | 'long' | 'curly' | 'bun' | 'spiky' | 'slick' | 'receding' | 'bald' | 'beanie' | 'puff' | 'wavy' | 'updo';
  glasses?: boolean | 'thin';
  beard?: boolean;
  headset?: boolean;
  scarf?: number;
  coat?: boolean;
  // ── CEO extras ──
  /** Jacket over a shirt (V of shirt colour), with an optional tie. */
  suit?: { shirt: number; tie?: number };
  turtleneck?: boolean;
  hoodie?: boolean;
  earrings?: number;
  necklace?: number;
  /** Lapel pin colour. */
  pin?: number;
  /** Headband / beanie colours [dark, light]. */
  band?: [number, number];
  freckles?: boolean;
  stubble?: boolean;
  goatee?: boolean;
  /** Smile lines and crow's feet. */
  lines?: boolean;
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
    case 'slick':
      // swept back, short at the sides
      pc.ellipse(16, 8.5, 8.5, 5, dk);
      pc.rect(8, 9, 2, 5, dk);
      pc.rect(23, 9, 2, 5, dk);
      pc.ellipse(15, 7, 7, 3, lt);
      for (let x = 9; x < 23; x += 3) pc.line(x, 9, x + 3, 5, dk);
      pc.hline(10, 9, 13, lt);
      break;
    case 'receding':
      // bald crown, hair over the ears and round the back
      pc.ellipse(16, 11, 9, 6, dk);
      pc.rect(7, 10, 3, 7, dk);
      pc.rect(23, 10, 3, 7, dk);
      pc.set(8, 11, lt);
      pc.set(8, 13, lt);
      pc.set(24, 12, lt);
      break;
    case 'bald':
      pc.rect(7, 11, 3, 5, dk);
      pc.rect(23, 11, 3, 5, dk);
      pc.set(8, 12, lt);
      pc.set(24, 13, lt);
      break;
    case 'beanie': {
      const [bd, bl] = L.band ?? [C.grn4, C.grn6];
      // braids over the shoulders
      for (const bx of [8, 23]) {
        for (let y = 11; y < 26; y++) {
          const k = (y >> 1) & 1;
          pc.set(bx + k, y, lt);
          pc.set(bx + 1 - k, y, y % 2 ? dk : lt);
        }
        pc.set(bx, 26, L.band?.[1] ?? C.red3);
        pc.set(bx + 1, 26, L.band?.[1] ?? C.red3);
      }
      pc.rect(9, 9, 2, 3, lt);
      pc.rect(22, 9, 2, 3, lt);
      // the beanie: crown, ribbed cuff, pom-pom
      pc.ellipse(16, 7.5, 8.5, 5.5, bl);
      for (let x = 7; x < 26; x++) pc.rect(x, 7, 1, 3, x % 2 ? bd : bl);
      pc.circle(16.5, 2.2, 1.7, C.white);
      pc.set(17, 3, C.ink9);
      break;
    }
    case 'puff':
      // a big round afro behind the head
      pc.ellipse(16, 8, 11, 8.5, dk);
      for (let i = 0; i < 26; i++) {
        const x = 6 + ((i * 7) % 21);
        const y = 1 + ((i * 5) % 13);
        if (pc.get(x, y) === dk && pc.get(x + 1, y) === dk) pc.set(x, y, lt);
      }
      break;
    case 'wavy':
      // thick hair swept back off a high forehead
      pc.ellipse(16, 7.5, 9, 5.5, dk);
      pc.rect(8, 8, 2, 6, dk);
      pc.rect(23, 8, 2, 6, dk);
      pc.hline(12, 10, 10, 0);
      pc.hline(13, 9, 8, 0);
      pc.hline(15, 8, 4, 0);
      for (let x = 10; x < 23; x += 3) pc.line(x, 7, x + 2, 4, lt);
      pc.set(11, 9, lt);
      break;
    case 'updo':
      // a neat silver bob with a deep side part and a swept fringe
      pc.ellipse(16, 9, 10, 6.5, dk);
      pc.rect(6, 9, 4, 9, dk);
      pc.rect(23, 9, 4, 9, dk);
      pc.ellipse(14, 7, 7, 3.5, lt);
      pc.rect(7, 10, 2, 6, lt);
      pc.line(10, 11, 18, 8, lt);
      pc.line(10, 12, 15, 10, dk);
      pc.hline(19, 9, 4, dk);
      pc.set(20, 5, dk);
      pc.set(21, 6, dk);
      break;
  }
}

function accessories(pc: PixelCanvas, L: Look) {
  const [sh, base] = L.skin;
  if (L.turtleneck) {
    pc.rect(12, 21, 9, 5, L.cloth[1]);
    pc.rect(18, 21, 3, 5, L.cloth[0]);
    for (let y = 22; y < 26; y += 2) pc.hline(12, y, 6, L.cloth[2]);
  }
  if (L.suit) {
    // shirt V between the lapels, tie down the middle
    for (let y = 25; y < 31; y++) {
      const half = Math.max(0, 3 - Math.floor((y - 25) / 2));
      pc.hline(16 - half, y, half * 2 + 1, L.suit.shirt);
    }
    pc.line(12, 25, 16, 31, L.cloth[2]);
    pc.line(20, 25, 16, 31, L.cloth[0]);
    if (L.suit.tie) {
      pc.rect(15, 25, 3, 1, L.suit.tie);
      pc.vline(16, 26, 5, L.suit.tie);
      pc.set(15, 28, L.suit.tie);
      pc.set(17, 28, L.suit.tie);
    }
  }
  if (L.hoodie) {
    pc.ellipse(16, 25.5, 8, 2.5, L.cloth[2]);
    pc.ellipse(16, 25, 5, 1.5, L.cloth[0]);
    pc.vline(14, 26, 4, C.ink9);
    pc.vline(18, 26, 4, C.ink9);
  }
  if (L.pin) {
    pc.set(11, 28, L.pin);
    pc.set(12, 27, L.pin);
    pc.set(10, 27, L.pin);
    pc.set(11, 26, L.pin);
  }
  if (L.necklace) {
    for (let x = 11; x <= 21; x += 2) pc.set(x, 24 + Math.round(Math.abs(16 - x) < 3 ? 1 : 0), L.necklace);
  }
  if (L.earrings) {
    pc.set(8, 16, L.earrings);
    pc.set(24, 16, L.earrings);
  }
  if (L.freckles) for (const [x, y] of [[11, 16], [13, 17], [12, 18], [20, 16], [21, 17], [19, 17]]) pc.set(x, y, L.skin[0] === C.skn4 ? C.skn3 : sh);
  if (L.lines) {
    pc.set(9, 13, sh);
    pc.set(23, 13, sh);
    pc.set(12, 18, sh);
    pc.set(12, 19, sh);
    pc.set(20, 18, sh);
    pc.set(20, 19, sh);
  }
  if (L.stubble) {
    for (let y = 17; y < 23; y++) {
      for (let x = 9; x < 24; x++) {
        const c = pc.get(x, y);
        if ((c === base || c === sh) && (x * 3 + y * 2) % 4 === 0 && (y > 19 || ((x < 11 || x > 21) && y > 17))) pc.set(x, y, sh);
      }
    }
  }
  if (L.goatee) {
    pc.rect(15, 21, 3, 2, L.hair[0]);
    pc.set(16, 23, L.hair[0]);
    pc.set(14, 21, sh);
    pc.set(18, 21, sh);
  }
  if (L.band) {
    if (L.style === 'puff') {
      pc.hline(9, 7, 15, L.band[0]);
      pc.hline(10, 6, 13, L.band[1]);
      pc.set(12, 5, L.band[1]);
      pc.set(13, 5, L.band[1]);
    }
  }
  if (L.glasses === 'thin') {
    pc.box(10, 12, 5, 4, C.ink6);
    pc.box(18, 12, 5, 4, C.ink6);
    pc.hline(15, 13, 3, C.ink6);
    pc.set(13, 13, C.white);
    pc.set(21, 13, C.white);
  } else if (L.glasses) {
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
  if (gen >= 4) return bitNext(pc, Math.min(5, gen), mood);
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

/** Recolour the outer (top/left/right) edge pixels of a shape, from a snapshot so it doesn't spread. */
function rimLight(pc: PixelCanvas, fill: number[], edge: number, y0: number, y1: number) {
  const snap = pc.clone();
  const inside = (x: number, y: number) => fill.includes(snap.get(x, y));
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < S; x++) {
      if (inside(x, y) && (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1))) pc.set(x, y, edge);
    }
  }
}

/**
 * Bit-4 (pearl chassis, ear fins, a floating orb, violet glow) and Bit-5 (a dark glass head full
 * of light, a halo instead of an antenna, stars behind it).
 */
function bitNext(pc: PixelCanvas, gen: 4 | 5 | number, mood: Mood) {
  const five = gen >= 5;
  background(pc, five ? [C.night1, C.night3] : [C.blu0, C.blu1]);
  if (five) {
    for (const [x, y, c] of [[3, 4, C.white], [27, 6, C.cyn6], [5, 19, C.cyn5], [28, 15, C.white], [24, 2, C.yel1], [2, 11, C.blu5], [29, 22, C.blu5]] as const) pc.set(x, y, c);
  } else {
    for (const [x, y] of [[4, 5], [27, 8], [3, 17]] as const) pc.set(x, y, C.blu3);
  }
  const body = five ? C.blu1 : C.ice3;
  const mid = five ? C.blu0 : C.ice2;
  const shade = five ? C.night1 : C.ice0;
  const edge = five ? C.cyn5 : C.ice1;
  const glow = five ? C.white : C.vio5;
  const glow2 = five ? C.cyn6 : C.pnk1;
  const screen = five ? C.night0 : C.vio0;
  // shoulders with a glowing core
  pc.ellipse(16, 32, 11, 7, body);
  for (let y = 25; y < S; y++) for (let x = 17; x < 28; x++) if (pc.get(x, y) === body) pc.set(x, y, mid);
  if (five) rimLight(pc, [body, mid], edge, 25, S);
  pc.circle(16.5, 28.5, 2, five ? C.yel1 : C.cyn5);
  pc.set(16, 28, C.white);
  // neck
  pc.rect(14, 21, 5, 4, shade);
  pc.hline(14, 23, 5, edge);
  // head: a rounder shell than the earlier models
  pc.ellipse(16, 14, 10.5, 9, body);
  for (let y = 4; y < 24; y++) for (let x = 20; x < 28; x++) if (pc.get(x, y) === body && x > 22 - (y > 14 ? 1 : 0)) pc.set(x, y, mid);
  if (five) {
    // light leaks around the glass edge
    rimLight(pc, [body, mid], edge, 3, 24);
  } else {
    pc.set(9, 8, C.white);
    pc.set(10, 7, C.white);
  }
  // ear fins (Bit-4) / light rings (Bit-5)
  if (five) {
    pc.ring(5.5, 14.5, 2, C.cyn4);
    pc.ring(27.5, 14.5, 2, C.cyn4);
  } else {
    pc.rect(3, 11, 3, 7, C.cyn4);
    pc.vline(3, 11, 7, C.cyn6);
    pc.rect(27, 11, 3, 7, C.cyn3);
    pc.vline(29, 11, 7, C.cyn2);
  }
  // the face plate
  pc.ellipse(16, 14.5, 8, 6.5, screen);
  if (five) {
    // faint circuitry in the glass
    for (const [x0, y0, x1, y1] of [[9, 17, 12, 17], [12, 17, 13, 18], [20, 10, 23, 10], [23, 10, 23, 12]] as const) pc.line(x0, y0, x1, y1, C.blu2);
  }
  // halo (Bit-5) or a floating orb (Bit-4)
  if (five) {
    for (let a = 0; a < 360; a += 6) {
      const r = (a * Math.PI) / 180;
      pc.set(Math.round(16 + Math.cos(r) * 7), Math.round(2 + Math.sin(r) * 1.6), a > 180 ? C.yel2 : C.yel0);
    }
  } else {
    pc.circle(16.5, 2.5, 1.8, C.vio5);
    pc.set(16, 2, C.white);
    pc.set(13, 3, C.vio3);
    pc.set(20, 2, C.vio3);
  }
  // eyes
  const ey = 13;
  if (mood === 'happy' || mood === 'excited') {
    for (const ex of [11, 18]) {
      pc.set(ex, ey + 1, glow);
      pc.set(ex + 1, ey, glow);
      pc.set(ex + 2, ey, glow);
      pc.set(ex + 3, ey + 1, glow);
    }
    if (mood === 'excited') for (const [x, y] of [[8, 10], [24, 10]] as const) pc.set(x, y, glow2);
  } else if (mood === 'worried') {
    pc.rect(12, ey, 2, 3, glow);
    pc.rect(19, ey, 2, 3, glow);
    pc.line(10, ey - 2, 13, ey - 1, glow2);
    pc.line(19, ey - 1, 22, ey - 2, glow2);
  } else if (mood === 'angry') {
    pc.rect(11, ey, 3, 2, glow);
    pc.rect(19, ey, 3, 2, glow);
    pc.line(10, ey - 2, 13, ey - 1, glow2);
    pc.line(19, ey - 1, 22, ey - 2, glow2);
  } else {
    pc.rect(11, ey - 1, 3, 4, glow2);
    pc.rect(19, ey - 1, 3, 4, glow2);
    pc.rect(12, ey, 1, 2, glow);
    pc.rect(20, ey, 1, 2, glow);
  }
  // mouth
  const my = 18;
  if (mood === 'excited') {
    pc.rect(14, my, 5, 2, glow2);
    pc.hline(15, my, 3, glow);
  } else if (mood === 'worried') {
    pc.hline(14, my + 1, 5, glow2);
    pc.set(14, my, glow2);
  } else if (mood === 'angry') {
    pc.hline(14, my + 1, 5, glow2);
  } else {
    pc.set(13, my, glow2);
    pc.hline(14, my + 1, 5, glow);
    pc.set(19, my, glow2);
  }
}

// ── CEOs (Act II) ─────────────────────────────────────────────────────────────────────────────
export type CeoId = 'meridian' | 'lattice' | 'orchard' | 'kestrel' | 'littlesun' | 'veldt' | 'board';

const CEO_LOOKS: Record<CeoId, Look> = {
  // Dana Voss — platinum swept-back hair, black turtleneck, Meridian red
  meridian: { bg: [C.red1, C.red2], skin: [C.skn4, C.skn5, C.skn6], hair: [C.snd6, C.yel2], cloth: [C.ink0, C.ink1, C.ink3], style: 'slick', turtleneck: true, earrings: C.yel0 },
  // Prof. Anand Iyer — grey crown of hair, neat beard, glasses, cardigan over a shirt
  lattice: { bg: [C.vio1, C.vio3], skin: [C.skn1, C.skn2, C.skn3], hair: [C.ink6, C.ink8], cloth: [C.snd2, C.snd3, C.snd4], style: 'receding', glasses: true, beard: true, suit: { shirt: C.ink9 }, lines: true },
  // Tove Brandt — blonde braids, a green beanie, freckles, a hoodie
  orchard: { bg: [C.grn2, C.grn4], skin: [C.skn4, C.skn5, C.skn6], hair: [C.yel0, C.yel1], cloth: [C.grn1, C.grn3, C.grn5], style: 'beanie', band: [C.grn4, C.grn7], freckles: true, hoodie: true },
  // Marco Bellini — dark waves, stubble, a blazer and an open collar
  kestrel: { bg: [C.org0, C.org2], skin: [C.skn3, C.skn4, C.skn5], hair: [C.ink0, C.ink2], cloth: [C.blu0, C.blu1, C.blu2], style: 'wavy', stubble: true, suit: { shirt: C.white } },
  // Ada Nwosu — an afro puff with a yellow band, navy blazer with a little-sun pin
  littlesun: { bg: [C.org2, C.yel0], skin: [C.skn0, C.skn1, C.skn2], hair: [C.ink0, C.ink2], cloth: [C.blu1, C.blu2, C.blu3], style: 'puff', band: [C.yel0, C.yel1], suit: { shirt: C.ink9 }, pin: C.yel0, earrings: C.yel1 },
  // Hendrik Maas — bald, rimless glasses, white goatee, dark suit and tie
  veldt: { bg: [C.cyn0, C.cyn2], skin: [C.skn4, C.skn5, C.skn6], hair: [C.ink7, C.ink9], cloth: [C.ink1, C.ink2, C.ink3], style: 'bald', glasses: 'thin', goatee: true, suit: { shirt: C.white, tie: C.yel0 }, lines: true },
  // Eleanor Grant — silver chignon, pearls, charcoal suit, wood panelling
  board: { bg: [C.snd1, C.snd2], skin: [C.skn4, C.skn5, C.skn6], hair: [C.ink7, C.ink9], cloth: [C.ink2, C.ink3, C.ink5], style: 'updo', suit: { shirt: C.red2 }, necklace: C.white, earrings: C.white, lines: true },
};

export const CEO_IDS = Object.keys(CEO_LOOKS) as CeoId[];

/** Someone without a portrait of their own: a grey-suited executive. */
const GENERIC_CEO: Look = { bg: [C.ink3, C.ink4], skin: [C.skn3, C.skn4, C.skn5], hair: [C.ink2, C.ink4], cloth: [C.ink1, C.ink2, C.ink4], style: 'wavy', suit: { shirt: C.ink9, tie: C.blu3 } };

/** Raw canvas for a CEO portrait (unknown ids get a generic executive). */
export function ceoPortraitCanvas(id: string, mood: Mood = 'neutral'): PixelCanvas {
  const pc = new PixelCanvas(S, S);
  drawPerson(pc, CEO_LOOKS[id as CeoId] ?? GENERIC_CEO, mood);
  return pc;
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

/** Data URL for a CEO portrait: meridian, lattice, orchard, kestrel, littlesun, veldt, board (32×32). */
export function ceoPortraitUrl(id: string, mood: Mood = 'neutral'): string {
  const key = `ceo:${id}:${mood}`;
  let url = cache.get(key);
  if (!url) {
    url = toDataUrl(ceoPortraitCanvas(id, mood));
    cache.set(key, url);
  }
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
  const front = L.style === 'hardhat' || L.style === 'beanie';
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
