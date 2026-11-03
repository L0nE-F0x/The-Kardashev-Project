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
  style:
    | 'hardhat' | 'bob' | 'long' | 'curly' | 'bun' | 'spiky' | 'slick' | 'receding' | 'bald' | 'beanie' | 'puff' | 'wavy' | 'updo'
    // ── Act III ──
    | 'crop' | 'ponytail' | 'messy' | 'sidepart' | 'pompadour' | 'longwavy' | 'locs' | 'cap' | 'helmet' | 'gele';
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
  // ── Act III extras ──
  /** Lip colour (default red2). */
  lips?: number;
  moustache?: boolean;
  /** Tired eyes. */
  bags?: boolean;
  /** Weathered red cheeks. */
  ruddy?: boolean;
  /** Safety goggles pushed up on the head (lens colour). */
  goggles?: number;
  /** A travel neck pillow [base, light]. */
  pillow?: [number, number];
  earbuds?: boolean;
  /** A vest over the shirt [dark, light]. */
  vest?: [number, number];
  /** High-vis straps with reflective stripes. */
  hivis?: boolean;
  /** A knitted yoke pattern (colour). */
  knit?: number;
  /** Woven stripes across the collar (colours). */
  weave?: number[];
  /** A mission patch on the chest (colour). */
  patch?: number;
  /** A mandarin-collar suit with a button line. */
  mandarin?: boolean;
  scar?: boolean;
  /** Stars in the background. */
  stars?: boolean;
  /** Dyed hair tips (colour). */
  tips?: number;
  /** Hat colours [dark, light] for the cap / helmet / gele styles. */
  hat?: [number, number];
  /** A face mask pulled down under the chin (colour). */
  mask?: number;
  /** A streak of colour in the fringe. */
  streak?: number;
  /** Greying temples (colour). */
  temples?: number;
}

const LOOKS: Record<Exclude<AdvisorId, 'bit'>, Look> = {
  juno: { bg: [C.org0, C.org1], skin: [C.skn1, C.skn2, C.skn3], hair: [C.ink0, C.ink1], cloth: [C.blu1, C.blu2, C.blu3], style: 'hardhat' },
  penny: { bg: [C.grn3, C.grn5], skin: [C.skn4, C.skn5, C.skn6], hair: [C.snd1, C.snd2], cloth: [C.ink3, C.ink4, C.ink5], style: 'bob', glasses: true },
  mira: { bg: [C.cyn2, C.cyn3], skin: [C.skn3, C.skn4, C.skn5], hair: [C.ink0, C.ink1], cloth: [C.vio1, C.vio2, C.vio3], style: 'long', headset: true },
  sol: { bg: [C.vio2, C.vio3], skin: [C.skn2, C.skn3, C.skn4], hair: [C.ink1, C.ink2], cloth: [C.snd2, C.snd3, C.snd4], style: 'curly', beard: true, scarf: C.red3 },
  iris: { bg: [C.blu2, C.blu4], skin: [C.skn4, C.skn5, C.skn6], hair: [C.ink7, C.ink8], cloth: [C.ink8, C.ink9, C.white], style: 'bun', glasses: true, coat: true },
  // Kip: the space kid — swept spikes, aviator goggles up on his forehead, a mission patch on his flight suit
  kip: { bg: [C.sky1, C.sky2], skin: [C.skn4, C.skn5, C.skn6], hair: [C.yel0, C.yel1], cloth: [C.org0, C.org1, C.org2], style: 'spiky', goggles: C.sky4, patch: C.blu4 },
};

function background(pc: PixelCanvas, [dark, light]: [number, number], stars = false) {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const corner = (x < 2 && y < 2 && x + y < 2) || (x > S - 3 && y < 2 && S - 1 - x + y < 2) || (x < 2 && y > S - 3 && x + S - 1 - y < 2) || (x > S - 3 && y > S - 3 && S * 2 - 2 - x - y < 2);
      if (corner) continue;
      pc.set(x, y, y < 18 || ((x + y) & 1 && y < 24) ? light : dark);
    }
  }
  if (stars) for (const [x, y, c] of [[3, 4, C.white], [27, 3, C.yel1], [5, 15, C.sky4], [28, 12, C.white], [24, 7, C.sky4], [2, 9, C.ice2]] as const) pc.set(x, y, c);
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
  const m = L.lips ?? C.red2;
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
      // spikes swept back and to the right
      for (let i = 0; i < 6; i++) pc.line(8 + i * 3, 8, 10 + i * 3 + (i % 2), 1 + (i % 2) * 2, i % 2 ? lt : dk);
      pc.rect(9, 5, 15, 5, lt);
      for (let i = 0; i < 6; i++) pc.set(10 + i * 3, 5, dk);
      pc.hline(9, 9, 15, dk);
      pc.line(23, 6, 25, 4, lt);
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
    // ── Act III ──
    case 'crop':
      // a short crew cut, textured on top
      pc.ellipse(16, 9.5, 8, 5.5, dk);
      pc.rect(8, 9, 2, 5, dk);
      pc.rect(23, 9, 2, 5, dk);
      for (let x = 10; x < 23; x += 2) pc.set(x, 5 + ((x >> 1) & 1), lt);
      for (let x = 11; x < 22; x += 3) pc.set(x, 7, lt);
      break;
    case 'ponytail':
      // pulled back tight, the tail hanging behind the right shoulder
      pc.ellipse(16, 9, 8.5, 5.5, dk);
      pc.rect(8, 9, 2, 4, dk);
      pc.rect(23, 9, 2, 4, dk);
      pc.ellipse(25, 7.5, 2.5, 2.5, dk);
      for (let y = 9; y < 24; y++) pc.rect(25 + ((y >> 2) & 1), y, 2, 1, y % 4 === 1 ? lt : dk);
      pc.set(24, 6, L.band?.[1] ?? C.red3);
      pc.set(24, 7, L.band?.[0] ?? C.red2);
      pc.line(11, 6, 14, 5, lt);
      pc.line(15, 5, 19, 5, lt);
      break;
    case 'messy':
      // slept-at-the-factory hair: tousled clumps and stray strands
      pc.ellipse(16, 8.5, 9, 6, dk);
      pc.rect(8, 9, 2, 5, dk);
      pc.rect(23, 9, 2, 5, dk);
      for (const [cx, cy, r] of [[9, 6, 2.2], [12, 3.6, 2.3], [16, 2.8, 2.4], [20, 3.4, 2.2], [23.4, 5.8, 2.2], [24.8, 9, 1.5], [7.4, 9.6, 1.5]] as const) pc.circle(cx, cy, r, dk);
      pc.line(10, 5, 12, 3, lt);
      pc.line(15, 3, 17, 2, lt);
      pc.line(19, 4, 21, 3, lt);
      pc.set(23, 6, lt);
      pc.set(13, 0, dk);
      pc.set(21, 1, dk);
      pc.line(12, 9, 13, 7, dk);
      pc.line(16, 9, 17, 7, dk);
      pc.set(20, 9, dk);
      break;
    case 'sidepart':
      // neat and short, parted on the left, swept to the right
      pc.ellipse(16, 8.5, 8.5, 5, dk);
      pc.rect(8, 9, 2, 4, dk);
      pc.rect(23, 9, 2, 4, dk);
      pc.line(12, 4, 12, 7, lt);
      pc.line(13, 5, 21, 6, lt);
      pc.line(14, 7, 22, 8, lt);
      pc.set(10, 9, 0);
      pc.set(11, 9, 0);
      break;
    case 'pompadour':
      // volume swept up off the forehead, short sides
      pc.ellipse(16, 8, 8.5, 5.5, dk);
      pc.ellipse(16.5, 4.5, 7.5, 3.5, dk);
      pc.rect(8, 9, 2, 4, dk);
      pc.rect(23, 9, 2, 4, dk);
      pc.line(11, 4, 15, 2, lt);
      pc.line(15, 3, 20, 2, lt);
      pc.line(12, 6, 17, 4, lt);
      pc.set(21, 3, lt);
      pc.set(8, 11, lt);
      pc.set(24, 11, lt);
      break;
    case 'longwavy':
      // shoulder-length waves with a side-swept fringe
      pc.ellipse(16, 10, 9.5, 7, dk);
      for (let y = 10; y < 26; y++) {
        const w = Math.round(Math.sin(y / 2.3) * 1.1);
        const lw = y < 23 ? 4 : 3;
        pc.rect(6 + w, y, lw, 1, dk);
        pc.rect(23 - w, y, lw, 1, dk);
      }
      for (let y = 11; y < 25; y += 3) {
        const w = Math.round(Math.sin(y / 2.3) * 1.1);
        pc.set(7 + w, y, lt);
        pc.set(25 - w, y, lt);
      }
      pc.rect(9, 9, 15, 1, dk);
      pc.line(10, 10, 16, 7, dk);
      pc.line(12, 6, 18, 5, lt);
      pc.set(9, 10, dk);
      break;
    case 'locs': {
      // locs gathered into a high bun, with a gold cuff
      pc.ellipse(16, 9, 8.5, 5.5, dk);
      pc.rect(8, 9, 2, 5, dk);
      pc.rect(23, 9, 2, 5, dk);
      pc.ellipse(16, 2.6, 5.2, 2.8, dk);
      for (let x = 9; x < 24; x += 2) for (let y = 5; y < 9; y++) if (pc.get(x, y)) pc.set(x, y, lt);
      for (let x = 12; x < 21; x += 2) for (let y = 0; y < 4; y++) if (pc.get(x, y) === dk) pc.set(x, y, lt);
      pc.hline(13, 4, 7, L.band?.[1] ?? C.yel0);
      break;
    }
    case 'cap': {
      // a ship captain's cap: white crown, black band and visor, gold badge
      const [cd, cl] = L.hat ?? [C.ink8, C.white];
      pc.rect(8, 9, 2, 5, dk);
      pc.rect(23, 9, 2, 5, dk);
      pc.set(8, 12, lt);
      pc.ellipse(16, 4.6, 9.5, 3.4, cl);
      for (let y = 1; y < 9; y++) for (let x = 20; x < 27; x++) if (pc.get(x, y) === cl) pc.set(x, y, cd);
      pc.rect(8, 6, 17, 2, C.ink1);
      pc.hline(8, 8, 17, C.ink0);
      pc.hline(10, 9, 13, C.ink2);
      pc.set(15, 5, C.yel1);
      pc.set(16, 5, C.yel0);
      pc.set(17, 5, C.yel1);
      pc.set(16, 6, C.yel0);
      pc.set(11, 3, C.white);
      break;
    }
    case 'helmet': {
      // a scuffed hard hat with a headlamp
      const [hd, hl] = L.hat ?? [C.ink7, C.ink9];
      pc.rect(10, 9, 2, 5, dk);
      pc.rect(21, 9, 2, 5, dk);
      pc.ellipse(16, 8, 9, 5, hl);
      for (let y = 2; y < 10; y++) for (let x = 19; x < 26; x++) if (pc.get(x, y) === hl) pc.set(x, y, hd);
      pc.rect(6, 8, 21, 2, hl);
      pc.hline(6, 10, 21, hd);
      pc.rect(14, 4, 5, 3, C.ink2);
      pc.rect(15, 5, 3, 1, C.yel1);
      pc.set(16, 5, C.white);
      pc.hline(7, 7, 7, C.ink3);
      pc.set(10, 4, C.white);
      pc.set(22, 6, C.ink5);
      break;
    }
    case 'gele': {
      // a tall gele: pleated wrap rising to a fan on the right, gold trim
      const [gd, gl] = L.hat ?? [C.grn4, C.grn6];
      pc.ellipse(16, 6, 10, 4.5, gl);
      pc.ellipse(21, 2.5, 6.5, 3, gl);
      pc.ellipse(10, 3, 4, 2.2, gl);
      for (let i = -2; i < 8; i++) pc.line(7 + i * 3, 10, 11 + i * 3, 0, gd);
      for (let y = 0; y < 12; y++) for (let x = 0; x < S; x++) if (pc.get(x, y) === gd && !(((x - 16) / 10.5) ** 2 + ((y - 6) / 5) ** 2 <= 1 || ((x - 21) / 7) ** 2 + ((y - 2.5) / 3.5) ** 2 <= 1 || ((x - 10) / 4.5) ** 2 + ((y - 3) / 2.7) ** 2 <= 1)) pc.set(x, y, 0);
      for (let x = 7; x < 26; x++) if (pc.get(x, 9)) pc.set(x, 9, C.yel0);
      for (let x = 0; x < S; x++) for (let y = 10; y < 14; y++) pc.set(x, y, 0);
      pc.rect(8, 10, 2, 4, dk);
      pc.rect(23, 10, 2, 4, dk);
      break;
    }
  }
  if (L.tips) for (let y = 20; y < S; y++) for (let x = 0; x < S; x++) if (pc.get(x, y) === dk || pc.get(x, y) === lt) pc.set(x, y, L.tips);
  if (L.streak) {
    pc.line(12, 4, 11, 9, L.streak);
    pc.line(13, 4, 13, 7, L.streak);
  }
  if (L.temples) {
    pc.rect(8, 10, 2, 3, L.temples);
    pc.rect(23, 10, 2, 3, L.temples);
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
  // ── Act III extras ──
  if (L.vest) {
    const [vd, vl] = L.vest;
    for (let y = 24; y < S; y++) for (let x = 3; x < 29; x++) if (L.cloth.includes(pc.get(x, y)) && (x <= 12 || x >= 20)) pc.set(x, y, x >= 20 ? vd : vl);
    if (L.hivis) for (let x = 3; x < 29; x++) if ((pc.get(x, 28) === vd || pc.get(x, 28) === vl) && x % 3 !== 2) pc.set(x, 28, C.yel2);
  }
  if (L.knit) {
    for (let y = 24; y < 29; y++) {
      for (let x = 3; x < 29; x++) {
        if (!L.cloth.includes(pc.get(x, y))) continue;
        if (((y === 25 || y === 28) && x % 2 === 0) || (y === 26 && x % 4 === 1) || (y === 27 && x % 4 === 3)) pc.set(x, y, L.knit);
      }
    }
  }
  if (L.weave) {
    for (let y = 25; y < S; y++) {
      const half = Math.max(0, 3 - Math.floor((y - 25) / 2));
      for (let x = 16 - half; x <= 16 + half; x++) pc.set(x, y, L.weave[(y + (x & 1)) % L.weave.length]);
    }
  }
  if (L.mandarin) {
    pc.hline(13, 23, 7, L.cloth[2]);
    pc.hline(13, 24, 7, L.cloth[1]);
    pc.vline(16, 25, 7, L.cloth[0]);
    for (const y of [26, 28, 30]) pc.set(17, y, C.ink8);
  }
  if (L.patch) {
    pc.set(11, 27, L.patch);
    pc.rect(10, 28, 3, 1, L.patch);
    pc.set(11, 29, L.patch);
    pc.set(11, 28, C.white);
  }
  if (L.mask) {
    pc.rect(12, 22, 9, 2, L.mask);
    pc.hline(13, 22, 7, C.white);
  }
  if (L.pillow) {
    // a U-shaped travel pillow round the neck, open under the chin
    const [pb, pl] = L.pillow;
    for (const cx of [10.6, 21.4]) pc.ellipse(cx, 21.8, 2.4, 3.4, pb);
    pc.vline(9, 20, 3, pl);
    pc.vline(20, 20, 3, pl);
    pc.set(10, 19, pl);
    pc.set(21, 19, pl);
  }
  if (L.moustache) {
    const [dk, lt] = L.hair;
    pc.hline(13, 17, 7, dk);
    pc.hline(12, 18, 3, dk);
    pc.hline(18, 18, 3, dk);
    pc.set(12, 19, dk);
    pc.set(20, 19, dk);
    pc.set(14, 17, lt);
    pc.set(17, 17, lt);
  }
  if (L.bags) {
    for (const ex of [12, 19]) {
      pc.set(ex, 15, sh);
      pc.set(ex + 1, 15, sh);
    }
  }
  if (L.ruddy) {
    for (const [x, y] of [[11, 16], [11, 17], [12, 17], [20, 17], [21, 16], [21, 17]] as const) pc.set(x, y, C.pnk1);
  }
  if (L.scar) {
    pc.set(20, 14, L.skin[2]);
    pc.set(21, 15, L.skin[2]);
    pc.set(21, 16, L.skin[2]);
  }
  if (L.goggles) {
    pc.hline(8, 7, 17, C.ink1);
    for (const gx of [11, 17]) {
      pc.rect(gx, 5, 5, 3, C.ink1);
      pc.rect(gx + 1, 6, 3, 1, L.goggles);
      pc.set(gx + 1, 6, C.white);
    }
  }
  if (L.earbuds) {
    pc.set(8, 14, C.white);
    pc.set(8, 15, C.ink8);
    pc.set(24, 14, C.white);
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
  if (gen >= 6) return bitOracle(pc, Math.min(7, gen), mood);
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

/**
 * Bit-6 (the Oracle: a pearl-and-gold head floating free of its shoulders, a halo over a little
 * antenna array, light orbs at its ears) and Bit-7 (a head of pure light in a dawn sky, a ring in
 * orbit round it and a crown of stars). Still Bit: big glowing eyes, a small smile.
 */
function bitOracle(pc: PixelCanvas, gen: number, mood: Mood) {
  const seven = gen >= 7;
  if (seven) {
    // a dawn sky: deep blue at the top warming to rose at the bottom, stars overhead
    const sky = new PixelCanvas(S, S);
    sky.vgradient(0, 0, S, S, [C.night2, C.night3, C.dusk2, C.dusk3, C.dusk4]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) pc.set(x, y, sky.get(x, y));
    for (const [x, y] of [[2, 0], [29, 0], [0, 2], [31, 2], [0, 29], [31, 29], [1, 31], [30, 31], [0, 30], [31, 30], [0, 31], [31, 31], [0, 0], [1, 0], [0, 1], [31, 0], [30, 0], [31, 1]] as const) pc.set(x, y, 0);
    for (const [x, y, c] of [[3, 3, C.white], [27, 2, C.yel1], [6, 9, C.cyn6], [29, 8, C.white], [23, 4, C.pnk1], [2, 13, C.ice2]] as const) pc.set(x, y, c);
  } else {
    background(pc, [C.dusk0, C.dusk1], false);
    for (const [x, y, c] of [[3, 4, C.white], [27, 5, C.cyn6], [4, 20, C.vio5], [28, 17, C.white], [25, 2, C.yel1], [2, 11, C.vio4], [29, 24, C.vio4]] as const) pc.set(x, y, c);
    // the aura: faint rings behind the head
    pc.ring(16, 14, 14.5, C.dusk2);
    for (let a = 0; a < 360; a += 9) {
      const r = (a * Math.PI) / 180;
      pc.set(Math.round(16 + Math.cos(r) * 12.5), Math.round(14 + Math.sin(r) * 12.5), C.dusk3);
    }
  }
  const shell = seven ? C.white : C.yel2;
  const shellMid = seven ? C.yel2 : C.ice2;
  const rim = seven ? C.pnk1 : C.yel0;
  const plate = seven ? C.vio1 : C.vio0;
  const glow = seven ? C.white : C.yel2;
  const glow2 = seven ? C.cyn6 : C.yel1;
  // shoulders of light floating below the head, a core glowing in the chest
  const bodyY = seven ? 34 : 33;
  pc.ellipse(16, bodyY, seven ? 7 : 9.5, 6.5, shellMid);
  pc.ellipse(15, bodyY, seven ? 5 : 7, 5.5, shell);
  pc.circle(16, bodyY - 3.5, 1.6, seven ? C.cyn6 : C.yel1);
  pc.set(16, bodyY - 4, C.white);
  if (seven) {
    // the aura round the head: a soft ring of light
    for (let a = 0; a < 360; a += 6) {
      const r = (a * Math.PI) / 180;
      pc.set(Math.round(16 + Math.cos(r) * 12.8), Math.round(13.6 + Math.sin(r) * 11.6), a % 12 ? C.dusk5 : C.pnk1);
    }
  }
  // orbit ring, back half (behind the head)
  const ring = (front: boolean) => {
    for (let a = 0; a < 360; a += 2) {
      const r = (a * Math.PI) / 180;
      const inFront = Math.sin(r) > 0;
      if (inFront !== front) continue;
      const x = 16 + Math.cos(r) * 14.5;
      const y = 20 + Math.sin(r) * 2.6 - Math.cos(r) * 1.6;
      pc.set(Math.round(x), Math.round(y), front ? (a % 20 < 10 ? C.cyn6 : C.white) : C.cyn4);
    }
  };
  if (seven) ring(false);
  // the head floats free: a gap of sky below the chin
  pc.ellipse(16, 13.5, 10, 8.8, shell);
  for (let y = 4; y < 23; y++) for (let x = 19; x < 27; x++) if (pc.get(x, y) === shell && x > 22 - (y > 14 ? 1 : 0)) pc.set(x, y, shellMid);
  rimLight(pc, [shell, shellMid], rim, 4, 23);
  pc.set(9, 8, C.white);
  pc.set(10, 7, C.white);
  // ear orbs
  for (const ox of [4.5, 27.5]) {
    pc.circle(ox, 14, 1.8, seven ? C.cyn5 : C.yel1);
    pc.set(Math.floor(ox), 13, C.white);
  }
  // face plate
  pc.ellipse(16, 14.5, 7.6, 6.2, plate);
  if (!seven) for (const [x0, y0, x1, y1] of [[10, 18, 12, 18], [20, 11, 22, 11]] as const) pc.line(x0, y0, x1, y1, C.vio2);
  // antenna array under the halo (Bit-6) / a crown of light points (Bit-7)
  if (seven) {
    for (const [x, y, c] of [[9, 4, C.cyn6], [12, 2, C.white], [16, 1, C.yel1], [20, 2, C.white], [23, 4, C.pnk1]] as const) {
      pc.set(x, y, c);
      if (c === C.yel1) {
        pc.set(x - 1, y, C.yel0);
        pc.set(x + 1, y, C.yel0);
        pc.set(x, y + 1, C.yel0);
      }
    }
  } else {
    for (const [x, tip] of [[12, C.cyn6], [16, C.yel1], [20, C.pnk1]] as const) {
      pc.vline(x, x === 16 ? 2 : 3, x === 16 ? 3 : 2, C.ink9);
      pc.set(x, x === 16 ? 1 : 2, tip);
    }
    for (let a = 0; a < 360; a += 6) {
      const r = (a * Math.PI) / 180;
      pc.set(Math.round(16 + Math.cos(r) * 8), Math.round(1.2 + Math.sin(r) * 1.3), a > 180 ? C.yel1 : C.yel0);
    }
  }
  // eyes: big, soft and glowing
  const ey = 13;
  if (mood === 'happy' || mood === 'excited') {
    for (const ex of [11, 18]) {
      pc.set(ex, ey + 1, glow);
      pc.set(ex + 1, ey, glow);
      pc.set(ex + 2, ey, glow);
      pc.set(ex + 3, ey + 1, glow);
    }
    if (mood === 'excited') for (const [x, y] of [[8, 10], [24, 10], [9, 9], [23, 9]] as const) pc.set(x, y, glow2);
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
    pc.set(13, ey - 1, C.white);
    pc.set(21, ey - 1, C.white);
  }
  const my = 18;
  if (mood === 'excited') {
    pc.rect(14, my, 5, 2, glow2);
    pc.hline(15, my, 3, glow);
  } else if (mood === 'worried' || mood === 'angry') {
    pc.hline(14, my + 1, 5, glow2);
    if (mood === 'worried') pc.set(14, my, glow2);
  } else {
    pc.set(13, my, glow2);
    pc.hline(14, my + 1, 5, glow);
    pc.set(19, my, glow2);
  }
  if (seven) ring(true);
}

// ── CEOs (Act II) ─────────────────────────────────────────────────────────────────────────────
export type CeoId =
  | 'meridian' | 'lattice' | 'orchard' | 'kestrel' | 'littlesun' | 'veldt' | 'board'
  // ── Act III partners ──
  | 'halcyon' | 'brightwater' | 'sunforge' | 'spanwire' | 'tidewater' | 'deepvein' | 'saltflat' | 'lumen'
  | 'stackwell' | 'hanbit' | 'bondline' | 'cumulus' | 'stratum' | 'parabola' | 'karman'
  // ── Act III faction delegates ──
  | 'atlantic' | 'eastern' | 'nonaligned';

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
  // ── Act III partners ──
  // Walt Brennan — forty years of concrete: grey crew cut, walrus moustache, ruddy cheeks, hi-vis over a work jacket
  halcyon: { bg: [C.rck3, C.rck5], skin: [C.skn4, C.skn5, C.skn6], hair: [C.ink6, C.ink8], cloth: [C.snd2, C.snd3, C.snd4], style: 'crop', moustache: true, ruddy: true, lines: true, vest: [C.org0, C.org1], hivis: true },
  // Ingrid Solberg — thinks in centuries: pale-blonde ponytail, thin glasses, a Nordic knit
  brightwater: { bg: [C.sea5, C.sea7], skin: [C.skn4, C.skn5, C.skn6], hair: [C.snd6, C.snd8], cloth: [C.blu1, C.blu2, C.blu3], style: 'ponytail', band: [C.blu2, C.blu4], glasses: 'thin', knit: C.ice3, lines: true },
  // Dr. Kenji Arakawa — plasma physicist on a founder's calendar: messy hair, round glasses, a black hoodie
  sunforge: { bg: [C.dusk2, C.dusk3], skin: [C.skn3, C.skn4, C.skn5], hair: [C.ink0, C.ink2], cloth: [C.ink1, C.ink2, C.ink3], style: 'messy', glasses: true, hoodie: true, pin: C.pnk0 },
  // Elodie Marchetti — converter stations as cathedrals: dark waves, red lips, a cream blazer, gold earrings
  spanwire: { bg: [C.sky2, C.sky3], skin: [C.skn3, C.skn4, C.skn5], hair: [C.snd0, C.snd2], cloth: [C.snd5, C.snd6, C.snd7], style: 'longwavy', lips: C.red3, suit: { shirt: C.ink1 }, earrings: C.yel0 },
  // Rafael Ortega — former ship's captain: the cap, a salt-and-pepper beard, a navy peacoat
  tidewater: { bg: [C.sea2, C.sea4], skin: [C.skn2, C.skn3, C.skn4], hair: [C.ink4, C.ink6], cloth: [C.blu0, C.blu1, C.blu2], style: 'cap', beard: true, suit: { shirt: C.white }, pin: C.yel0, lines: true },
  // Silas Grue — never seen without a hard hat: the headlamp, stubble, a scar, a dark work jacket with reflectors
  deepvein: { bg: [C.snd2, C.snd4], skin: [C.skn3, C.skn4, C.skn5], hair: [C.ink3, C.ink5], cloth: [C.ink2, C.ink3, C.ink4], style: 'helmet', hat: [C.ink7, C.ink9], stubble: true, scar: true, vest: [C.ink2, C.ink3], hivis: true },
  // Valentina Rojas — Altiplano chemist: a high ponytail, goggles pushed up, a lab coat over a woven top
  saltflat: { bg: [C.ice1, C.ice3], skin: [C.skn2, C.skn3, C.skn4], hair: [C.ink0, C.ink1], cloth: [C.ink8, C.ink9, C.white], style: 'ponytail', band: [C.red2, C.red3], goggles: C.cyn5, coat: true, weave: [C.red3, C.yel0, C.grn5, C.pnk0, C.blu4] },
  // Mei-Lin Chao — knows every tool in every cleanroom: a neat bob with a silver streak, thin glasses, the cleanroom suit with its hood down
  lumen: { bg: [C.cyn3, C.cyn5], skin: [C.skn4, C.skn5, C.skn6], hair: [C.ink1, C.ink3], cloth: [C.ice1, C.ice2, C.ice3], style: 'bob', streak: C.ink7, glasses: 'thin', hoodie: true, mask: C.sky4, lines: true },
  // Doug Pruitt — remembers every price crash: grey flat-top, tired eyes, a fleece vest over a blue shirt
  stackwell: { bg: [C.vio3, C.vio5], skin: [C.skn4, C.skn5, C.skn6], hair: [C.ink6, C.ink8], cloth: [C.blu3, C.blu4, C.blu5], style: 'crop', bags: true, lines: true, vest: [C.vio1, C.vio2] },
  // Park Ji-woo — the 3 a.m. yield war room: a sharp black bob, tired eyes, a black blazer and a lanyard
  hanbit: { bg: [C.pnk0, C.pnk1], skin: [C.skn4, C.skn5, C.skn6], hair: [C.ink0, C.ink1], cloth: [C.ink0, C.ink1, C.ink2], style: 'bob', bags: true, suit: { shirt: C.white }, necklace: C.pnk0 },
  // Arjun Pillai — permanently between Penang and everywhere: side part, stubble, crisp shirt, a travel pillow
  bondline: { bg: [C.grn5, C.grn7], skin: [C.skn1, C.skn2, C.skn3], hair: [C.ink0, C.ink2], cloth: [C.ink8, C.ink9, C.white], style: 'sidepart', stubble: true, pillow: [C.grn3, C.grn6] },
  // Jessa Kim — a dashboard away from solved: long hair with sky-blue tips, earbuds, a blue tee
  cumulus: { bg: [C.sky3, C.sky5], skin: [C.skn4, C.skn5, C.skn6], hair: [C.ink0, C.ink2], cloth: [C.blu4, C.blu5, C.blu6], style: 'long', tips: C.sky4, earbuds: true, necklace: C.white },
  // Vikram Desai — slightly too good to be true: a glossy pompadour, designer stubble, a burgundy velvet blazer
  stratum: { bg: [C.dusk4, C.dusk5], skin: [C.skn2, C.skn3, C.skn4], hair: [C.ink0, C.ink3], cloth: [C.red1, C.red2, C.red3], style: 'pompadour', stubble: true, suit: { shirt: C.white }, pin: C.yel0 },
  // Max Kowalczyk — sleeps at the factory: bed-head, stubble, tired eyes, a black tee with a mission patch
  parabola: { bg: [C.red3, C.org0], skin: [C.skn4, C.skn5, C.skn6], hair: [C.snd4, C.snd6], cloth: [C.ink1, C.ink2, C.ink3], style: 'messy', stubble: true, bags: true, patch: C.org0 },
  // Dr. Amara Diallo — a spreadsheet for every contingency: locs in a high bun, thin glasses, a flight-director jacket
  karman: { bg: [C.blu0, C.blu2], skin: [C.skn0, C.skn1, C.skn2], hair: [C.ink0, C.ink2], cloth: [C.blu2, C.blu3, C.blu4], style: 'locs', glasses: 'thin', patch: C.yel0, earrings: C.yel0, stars: true },
  // ── Act III faction delegates ──
  // Claire Whitford (Atlantic) — polite until she isn't: a blonde bob, red lips, a navy suit with the Atlantic pin
  atlantic: { bg: [C.blu4, C.blu6], skin: [C.skn4, C.skn5, C.skn6], hair: [C.snd5, C.snd7], cloth: [C.blu0, C.blu1, C.blu2], style: 'bob', lips: C.red3, suit: { shirt: C.white }, pin: C.blu5, earrings: C.ink9, lines: true },
  // Lin Haoran (Eastern) — plays a very long game: neat side part greying at the temples, a mandarin-collar suit
  eastern: { bg: [C.red2, C.red3], skin: [C.skn4, C.skn5, C.skn6], hair: [C.ink1, C.ink3], cloth: [C.ink1, C.ink2, C.ink3], style: 'sidepart', temples: C.ink7, mandarin: true, lines: true, pin: C.red3 },
  // Nkechi Adeyemi (Non-aligned) — speaks for four billion people: a tall green-and-gold gele, coral beads
  nonaligned: { bg: [C.grn6, C.grn8], skin: [C.skn0, C.skn1, C.skn2], hair: [C.ink0, C.ink2], cloth: [C.grn3, C.grn4, C.grn5], style: 'gele', hat: [C.grn3, C.grn5], earrings: C.yel0, necklace: C.org1, weave: [C.yel0, C.grn6, C.yel1, C.grn4] },
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
  background(pc, L.bg, L.stars);
  const h = new PixelCanvas(S, S);
  hair(h, L);
  const front = L.style === 'hardhat' || L.style === 'beanie' || L.style === 'cap' || L.style === 'helmet' || L.style === 'gele';
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
