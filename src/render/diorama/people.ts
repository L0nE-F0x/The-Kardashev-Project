/**
 * People in the dioramas. Every figure is an 8×13 canvas: a body four pixels wide inside a
 * one-pixel dark outline, with a spare column each side for swinging arms and carried things.
 * Walks have four frames with a bob (the head rises on the passing frames); there are idle poses
 * for standing, waving, phoning, talking, cheering, hammering and carrying a box. Looks come from
 * the job (staff, worker, tech, astronaut), the era (hoodies → hi-vis → sun hats → jumpsuits) and
 * a seed; the advisors get their portrait colours so you can spot them on campus. Bit floats.
 */
import { C, KEYS } from '../palette';
import { hash2, PixelCanvas } from '../pixels';
import type { AdvisorId } from '../../sim/types';

export const FIG_W = 8;
export const FIG_H = 14;
/** Canvas row of the feet (the outline sits below it). */
export const FIG_FEET = 12;
/** Canvas column of the body's left edge (the body is 4 px wide). */
export const FIG_BODY_X = 2;

export type HairStyle = 'short' | 'long' | 'bob' | 'bun' | 'ponytail' | 'curly' | 'spiky' | 'bald';
export type Hat = 'none' | 'hardhat' | 'cap' | 'sunhat' | 'beanie' | 'helmet';
export type Outfit = 'tee' | 'hoodie' | 'hivis' | 'coat' | 'suit' | 'dress' | 'overalls' | 'jumpsuit' | 'spacesuit';
export type Role = 'staff' | 'worker' | 'tech' | 'astronaut';

export interface PersonLook {
  skin: number;
  hair: number;
  style: HairStyle;
  hat: Hat;
  hatCol: number;
  outfit: Outfit;
  shirt: number;
  pants: number;
  shoes: number;
  /** Vest, tie, coat lining, suit patch or visor colour. */
  accent: number;
  beard?: boolean;
  scarf?: number;
  headset?: boolean;
}

export type WalkPose = 'walk0' | 'walk1' | 'walk2' | 'walk3';
export type CarryPose = 'carry0' | 'carry1' | 'carry2' | 'carry3';
export type Pose = WalkPose | CarryPose | 'stand' | 'wave' | 'phone' | 'talk' | 'cheer' | 'work0' | 'work1';
export const WALK: WalkPose[] = ['walk0', 'walk1', 'walk2', 'walk3'];
export const CARRY: CarryPose[] = ['carry0', 'carry1', 'carry2', 'carry3'];

// ── colour helpers ─────────────────────────────────────────────────────────────────────────
const SPECIAL_SHADE: Record<string, string> = {
  white: 'ink8', org0: 'red3', org1: 'org0', org2: 'org1', yel0: 'org2', yel1: 'yel0', yel2: 'yel1', pnk0: 'red3', pnk1: 'pnk0', foam: 'sea8',
};
/** One step darker on the colour's own ramp (blu4 → blu3, white → ink8). */
export function shade(c: number): number {
  const key = KEYS[c - 1];
  if (!key) return c;
  const special = SPECIAL_SHADE[key];
  if (special) return C[special as keyof typeof C];
  const m = /^([a-z]+)(\d)$/.exec(key);
  if (!m) return c;
  const n = Number(m[2]);
  if (n === 0) return c;
  const darker = `${m[1]}${n - 1}` as keyof typeof C;
  return C[darker] ?? c;
}

// ── the figure ─────────────────────────────────────────────────────────────────────────────
/** Draw one pose into its own 8×14 canvas (facing right), outlined. */
export function figure(L: PersonLook, pose: Pose): PixelCanvas {
  const pc = new PixelCanvas(FIG_W, FIG_H);
  const put = (bx: number, y: number, c: number) => pc.set(FIG_BODY_X + bx, y, c);
  const step = pose.startsWith('walk') || pose.startsWith('carry') ? Number(pose.slice(-1)) : -1;
  const contact = step === 0 || step === 2;
  // head row: the body rises a pixel on the passing frames (straight legs) and dips on the strides
  const t = contact ? 3 : 2;
  const S = L.shirt;
  const Ss = shade(L.shirt);
  const sk = L.skin;
  const sks = shade(L.skin);
  const suit = L.outfit === 'spacesuit';
  const skirt = L.outfit === 'dress';
  const coat = L.outfit === 'coat';
  const P = L.outfit === 'jumpsuit' || L.outfit === 'spacesuit' ? S : skirt ? sk : L.pants;
  const Ps = shade(P);

  // legs and feet (feet always on row 12)
  if (contact) {
    // thighs together, shins apart: the stride (the lit leg swaps sides each step)
    const near = step === 0 ? P : Ps;
    const far = step === 0 ? Ps : P;
    put(1, 10, far);
    put(2, 10, near);
    put(0, 11, far);
    put(3, 11, near);
    put(0, 12, L.shoes);
    put(3, 12, L.shoes);
  } else {
    for (let y = 9; y <= 11; y++) {
      put(1, y, Ps);
      put(2, y, P);
    }
    put(1, 12, L.shoes);
    put(2, 12, L.shoes);
  }
  // hips: trousers, or a skirt / coat tails flaring out
  if (skirt || coat) {
    const c = coat ? S : L.shirt;
    for (let bx = 0; bx < 4; bx++) put(bx, t + 6, bx === 0 ? shade(c) : c);
  } else {
    put(1, t + 6, Ps);
    put(2, t + 6, P);
  }

  // torso (3 rows) and the arms down the sides
  for (let r = 3; r <= 5; r++) {
    put(1, t + r, S);
    put(2, t + r, S);
  }
  if (L.outfit === 'hivis') {
    put(1, t + 3, L.accent);
    put(2, t + 3, L.accent);
    put(1, t + 4, shade(L.accent));
    put(2, t + 4, L.accent);
    put(1, t + 5, L.accent);
    put(2, t + 5, L.accent);
  } else if (L.outfit === 'suit') {
    put(2, t + 3, C.white);
    put(2, t + 4, L.accent);
  } else if (L.outfit === 'overalls') {
    put(1, t + 4, L.pants);
    put(2, t + 4, L.pants);
    put(1, t + 5, L.pants);
    put(2, t + 5, L.pants);
  } else if (coat) {
    put(2, t + 4, L.accent);
  } else if (L.outfit === 'jumpsuit' || suit) {
    put(1, t + 3, L.accent);
  }
  if (L.scarf) {
    put(1, t + 3, L.scarf);
    put(2, t + 3, L.scarf);
  }
  if (suit) {
    // the life-support pack on the back
    put(-1, t + 3, C.ink6);
    put(-1, t + 4, C.ink5);
    put(0, t + 5, C.ink6);
  }
  const hand = suit ? C.ink7 : sk;
  const handS = suit ? C.ink6 : sks;
  // far arm (shaded) and near arm
  const farDown = () => {
    put(0, t + 3, Ss);
    put(0, t + 4, Ss);
    put(0, t + 5, handS);
  };
  const nearDown = () => {
    put(3, t + 3, S);
    put(3, t + 4, S);
    put(3, t + 5, hand);
  };
  if (contact && !pose.startsWith('carry')) {
    // the stride swings the near arm forward and the far one back
    put(0, t + 3, Ss);
    put(-1, t + 4, handS);
    put(3, t + 3, S);
    put(3, t + 4, S);
    put(4, t + 5, hand);
  } else if (pose.startsWith('carry')) {
    put(0, t + 3, Ss);
    put(0, t + 4, Ss);
    put(3, t + 3, S);
    // a cardboard box held against the chest
    put(3, t + 4, C.snd5);
    put(4, t + 4, C.snd6);
    put(3, t + 5, C.snd4);
    put(4, t + 5, C.snd5);
    put(4, t + 3, hand);
  } else if (pose === 'wave') {
    farDown();
    put(3, t + 3, S);
    put(4, t + 2, S);
    put(4, t + 1, hand);
  } else if (pose === 'cheer') {
    put(0, t + 3, Ss);
    put(-1, t + 2, Ss);
    put(-1, t + 1, handS);
    put(3, t + 3, S);
    put(4, t + 2, S);
    put(4, t + 1, hand);
  } else if (pose === 'phone') {
    farDown();
    put(3, t + 3, S);
    put(3, t + 2, hand);
    put(3, t + 1, C.ink3);
  } else if (pose === 'talk') {
    farDown();
    put(3, t + 3, S);
    put(4, t + 4, hand);
  } else if (pose === 'work0') {
    // hammer up
    farDown();
    put(3, t + 3, S);
    put(4, t + 2, hand);
    put(3, t + 1, C.ink6);
    put(4, t + 1, C.ink7);
  } else if (pose === 'work1') {
    // hammer down
    farDown();
    put(3, t + 3, S);
    put(4, t + 4, hand);
    put(4, t + 5, C.ink7);
  } else {
    farDown();
    nearDown();
  }

  drawHead(put, L, t);
  pc.outline(C.ink1);
  return pc;
}

/** Hair, face and hat on rows t..t+2 (and t−1 for tall hats and buns). */
function drawHead(put: (bx: number, y: number, c: number) => void, L: PersonLook, t: number) {
  const sk = L.skin;
  const h = L.hair;
  const hs = shade(L.hair);
  if (L.hat === 'helmet') {
    // a round helmet with a tinted visor facing forward
    put(1, t - 1, C.ink9);
    put(2, t - 1, C.white);
    put(0, t, C.ink8);
    put(1, t, C.ink9);
    put(2, t, C.white);
    put(3, t, C.white);
    put(0, t + 1, C.ink8);
    put(1, t + 1, C.ink9);
    put(2, t + 1, L.accent);
    put(3, t + 1, shade(L.accent));
    put(0, t + 2, C.ink7);
    put(1, t + 2, C.ink8);
    put(2, t + 2, C.ink9);
    put(3, t + 2, C.ink8);
    return;
  }
  // face: the skin shows on the front two columns
  put(2, t + 1, sk);
  put(1, t + 2, sk);
  put(2, t + 2, sk);
  switch (L.style) {
    case 'bald':
      put(1, t, sk);
      put(2, t, sk);
      put(1, t + 1, hs);
      break;
    case 'long':
      put(1, t, h);
      put(2, t, h);
      put(0, t + 1, hs);
      put(1, t + 1, h);
      put(0, t + 2, hs);
      put(0, t + 3, hs);
      break;
    case 'bob':
      put(0, t, hs);
      put(1, t, h);
      put(2, t, h);
      put(0, t + 1, hs);
      put(1, t + 1, h);
      put(0, t + 2, hs);
      break;
    case 'bun':
      put(0, t - 1, h);
      put(1, t, h);
      put(2, t, h);
      put(0, t, hs);
      put(1, t + 1, h);
      break;
    case 'ponytail':
      put(1, t, h);
      put(2, t, h);
      put(0, t, hs);
      put(1, t + 1, h);
      put(-1, t + 1, hs);
      break;
    case 'curly':
      put(0, t - 1, hs);
      put(1, t - 1, h);
      put(2, t - 1, h);
      put(0, t, h);
      put(1, t, h);
      put(2, t, h);
      put(0, t + 1, hs);
      put(1, t + 1, h);
      break;
    case 'spiky':
      put(1, t - 1, h);
      put(3, t - 1, h);
      put(1, t, h);
      put(2, t, h);
      put(3, t, hs);
      put(0, t, hs);
      put(1, t + 1, h);
      break;
    default:
      put(1, t, h);
      put(2, t, h);
      put(1, t + 1, h);
  }
  if (L.beard) put(1, t + 2, hs);
  if (L.headset) put(1, t + 1, C.cyn5);
  const H = L.hatCol;
  const Hs = shade(H);
  switch (L.hat) {
    case 'hardhat':
      put(1, t - 1, H);
      put(2, t - 1, H);
      put(0, t, Hs);
      put(1, t, H);
      put(2, t, H);
      put(3, t, H);
      break;
    case 'cap':
      put(1, t, H);
      put(2, t, H);
      put(3, t, Hs);
      put(1, t - 1, H);
      break;
    case 'beanie':
      put(1, t - 1, H);
      put(2, t - 1, H);
      put(0, t, Hs);
      put(1, t, H);
      put(2, t, H);
      break;
    case 'sunhat':
      put(1, t - 1, H);
      put(2, t - 1, H);
      put(-1, t, Hs);
      put(0, t, H);
      put(1, t, H);
      put(2, t, H);
      put(3, t, H);
      put(4, t, Hs);
      break;
  }
}

/** A person sitting on a bench or a step: 8×12, thighs on row 7 (the seat is right under them). */
export function seatedFigure(L: PersonLook): PixelCanvas {
  const pc = new PixelCanvas(FIG_W, 12);
  const put = (bx: number, y: number, c: number) => pc.set(FIG_BODY_X + bx, y, c);
  const t = 1;
  const S = L.shirt;
  for (let r = 3; r <= 5; r++) {
    put(1, t + r, S);
    put(2, t + r, S);
  }
  if (L.outfit === 'hivis') for (let r = 3; r <= 5; r++) put(1, t + r, L.accent);
  if (L.scarf) {
    put(1, t + 3, L.scarf);
    put(2, t + 3, L.scarf);
  }
  put(0, t + 3, shade(S));
  put(0, t + 4, shade(S));
  put(3, t + 3, S);
  put(3, t + 4, S);
  put(4, t + 5, L.skin);
  const P = L.outfit === 'jumpsuit' ? S : L.outfit === 'dress' ? S : L.pants;
  for (let bx = 1; bx <= 4; bx++) put(bx, t + 6, bx === 1 ? shade(P) : P);
  put(4, t + 7, L.outfit === 'dress' ? L.skin : P);
  put(4, t + 8, L.shoes);
  put(5, t + 8, L.shoes);
  drawHead(put, L, t);
  pc.outline(C.ink1);
  return pc;
}

// ── looks ──────────────────────────────────────────────────────────────────────────────────
const SKINS = [C.skn1, C.skn2, C.skn3, C.skn4, C.skn5, C.skn6];
const HAIRS = [C.ink1, C.ink1, C.snd1, C.snd3, C.ink2, C.yel0, C.rck2, C.red2, C.ink6];
const STYLES: HairStyle[] = ['short', 'short', 'long', 'bob', 'bun', 'ponytail', 'curly', 'spiky', 'bald'];
/** Shirt colours by era: smoggy hoodies → bright grid-rush tees → bloom greens → orbital whites → swarm pastels. */
const ERA_SHIRTS: number[][] = [
  [C.blu3, C.red2, C.grn3, C.ink5, C.snd3, C.vio3, C.org0, C.cyn3, C.ink4],
  [C.blu4, C.org1, C.grn5, C.vio4, C.red3, C.cyn4, C.yel0, C.white, C.blu3],
  [C.grn5, C.grn6, C.yel0, C.org1, C.snd5, C.cyn4, C.pnk0, C.white, C.grn4],
  [C.white, C.ink8, C.cyn4, C.blu5, C.org1, C.vio4, C.sky4, C.ink5, C.cyn5],
  [C.white, C.cyn5, C.vio4, C.pnk1, C.yel1, C.sky4, C.grn6, C.blu5, C.vio5],
];
const PANTS = [C.blu3, C.blu2, C.snd3, C.rck3, C.ink4, C.grn3, C.snd4, C.blu1];
const SHOES = [C.ink3, C.snd2, C.ink3, C.ink8, C.red2];

const pick = <T>(arr: T[], seed: number, salt: number): T => arr[Math.floor(hash2(seed, salt, 911) * arr.length) % arr.length];

/** A look for an anonymous person: the job sets the clothes, the era the fashion, the seed the rest. */
export function lookFor(seed: number, role: Role, era: number): PersonLook {
  const e = Math.max(0, Math.min(4, era));
  const r = (salt: number) => hash2(seed, salt, 577);
  const look: PersonLook = {
    skin: pick(SKINS, seed, 1),
    hair: pick(HAIRS, seed, 2),
    style: pick(STYLES, seed, 3),
    hat: 'none',
    hatCol: C.yel0,
    outfit: 'tee',
    shirt: pick(ERA_SHIRTS[e], seed, 4),
    pants: pick(PANTS, seed, 5),
    shoes: pick(SHOES, seed, 6),
    accent: C.yel0,
    beard: r(7) < 0.12,
  };
  if (role === 'astronaut') {
    return { ...look, hat: 'helmet', outfit: 'spacesuit', shirt: C.white, shoes: C.ink6, accent: r(8) < 0.5 ? C.yel0 : C.cyn5, beard: false };
  }
  if (role === 'worker') {
    look.hat = 'hardhat';
    look.hatCol = pick([C.yel0, C.yel0, C.org1, C.white, C.blu4], seed, 9);
    look.outfit = r(10) < 0.6 ? 'hivis' : 'overalls';
    look.accent = r(11) < 0.7 ? C.yel0 : C.org1;
    look.shirt = pick([C.blu3, C.ink5, C.red2, C.grn3, C.snd3], seed, 12);
    look.pants = pick([C.blu2, C.blu3, C.snd3, C.ink4], seed, 13);
    look.shoes = C.snd2;
    return look;
  }
  if (role === 'tech') {
    if (r(14) < 0.55) {
      look.outfit = 'coat';
      look.shirt = C.white;
      look.accent = pick([C.cyn4, C.blu4, C.vio4], seed, 15);
    } else look.headset = true;
    return look;
  }
  // staff and visitors: the era's fashion
  const k = r(16);
  if (e === 0) look.outfit = k < 0.4 ? 'hoodie' : k < 0.55 ? 'suit' : 'tee';
  else if (e === 1) look.outfit = k < 0.15 ? 'suit' : k < 0.25 ? 'dress' : 'tee';
  else if (e === 2) {
    look.outfit = k < 0.25 ? 'dress' : k < 0.35 ? 'overalls' : 'tee';
    if (r(17) < 0.18) {
      look.hat = 'sunhat';
      look.hatCol = C.snd6;
    }
  } else look.outfit = k < 0.4 ? 'jumpsuit' : k < 0.6 ? 'dress' : 'tee';
  if (look.outfit === 'suit') {
    look.shirt = pick([C.ink3, C.blu1, C.ink4, C.snd2], seed, 18);
    look.pants = look.shirt;
    look.accent = pick([C.red3, C.blu4, C.yel0, C.grn4], seed, 19);
  }
  if (look.outfit === 'jumpsuit') look.accent = pick([C.cyn5, C.org1, C.yel0, C.vio4], seed, 20);
  if (look.hat === 'none' && r(21) < (e === 0 ? 0.12 : 0.06)) {
    look.hat = r(22) < 0.5 ? 'cap' : 'beanie';
    look.hatCol = pick([C.red3, C.blu4, C.ink3, C.grn4, C.org1], seed, 23);
  }
  if (look.outfit === 'dress' || look.style === 'bald') look.beard = false;
  return look;
}

/** The advisors, dressed as in their portraits (age 1–2 greys the hair in Act V; 3 = renewed). */
export function advisorLook(id: Exclude<AdvisorId, 'bit'>, age = 0): PersonLook {
  const grey = age === 1 ? C.ink6 : age === 2 ? C.ink8 : 0;
  const base: Record<Exclude<AdvisorId, 'bit'>, PersonLook> = {
    // the chief engineer's white hard hat (the crews wear yellow)
    juno: { skin: C.skn2, hair: C.ink1, style: 'short', hat: 'hardhat', hatCol: C.white, outfit: 'hivis', shirt: C.blu3, pants: C.blu2, shoes: C.snd2, accent: C.org1 },
    penny: { skin: C.skn5, hair: C.snd2, style: 'bob', hat: 'none', hatCol: 0, outfit: 'suit', shirt: C.ink4, pants: C.ink4, shoes: C.ink3, accent: C.grn5 },
    mira: { skin: C.skn4, hair: C.ink1, style: 'long', hat: 'none', hatCol: 0, outfit: 'tee', shirt: C.vio3, pants: C.ink3, shoes: C.ink3, accent: C.cyn4, headset: true },
    sol: { skin: C.skn3, hair: C.ink1, style: 'curly', hat: 'none', hatCol: 0, outfit: 'tee', shirt: C.snd4, pants: C.snd2, shoes: C.snd1, accent: C.red3, beard: true, scarf: C.red3 },
    iris: { skin: C.skn5, hair: C.ink7, style: 'bun', hat: 'none', hatCol: 0, outfit: 'coat', shirt: C.white, pants: C.blu2, shoes: C.ink3, accent: C.blu4 },
    kip: { skin: C.skn5, hair: C.yel0, style: 'spiky', hat: 'none', hatCol: 0, outfit: 'jumpsuit', shirt: C.org1, pants: C.org1, shoes: C.ink3, accent: C.blu4 },
    lena: { skin: C.skn4, hair: C.ink8, style: 'short', hat: 'none', hatCol: 0, outfit: 'coat', shirt: C.white, pants: C.vio2, shoes: C.ink3, accent: C.vio3 },
  };
  const L = { ...base[id] };
  if (grey) L.hair = id === 'iris' || id === 'lena' ? C.white : grey;
  return L;
}

/** Bit's little hover body (8×14, two bob frames). Later generations get a brighter shell. */
export function bitFrames(form: number): PixelCanvas[] {
  const shell = form >= 10 ? C.yel1 : form >= 7 ? C.white : form >= 4 ? C.ink9 : C.ink8;
  const rim = form >= 10 ? C.yel0 : form >= 7 ? C.ink8 : C.ink7;
  const screen = form >= 11 ? C.vio1 : C.cyn1;
  const eyes = form >= 11 ? C.vio5 : form >= 8 ? C.cyn6 : C.cyn5;
  return [0, 1].map((f) => {
    const pc = new PixelCanvas(FIG_W, FIG_H);
    const y0 = 4 + f;
    // antenna with a blinking tip
    pc.set(4, y0 - 2, f ? C.org1 : C.yel0);
    pc.set(4, y0 - 1, rim);
    // the shell and its screen face
    pc.rect(1, y0, 6, 5, shell);
    pc.hline(1, y0 + 4, 6, rim);
    pc.vline(6, y0, 5, rim);
    pc.rect(2, y0 + 1, 4, 2, screen);
    pc.set(3, y0 + 1, eyes);
    pc.set(5, y0 + 1, eyes);
    pc.hline(3, y0 + 2, 3, f ? screen : eyes);
    pc.set(3, y0 + 2, screen);
    pc.set(5, y0 + 2, screen);
    pc.set(4, y0 + 2, eyes);
    pc.outline(C.ink1);
    // a thruster glow under it
    pc.set(3, y0 + 6, f ? C.cyn4 : C.cyn6);
    pc.set(4, y0 + 6, f ? C.cyn6 : C.cyn4);
    if (f) pc.set(4, y0 + 7, C.cyn3);
    return pc;
  });
}

// ── speech bubbles ─────────────────────────────────────────────────────────────────────────
export type Emote = 'alert' | 'ask' | 'heart' | 'note' | 'bolt' | 'star' | 'dots' | 'coffee';
const EMOTE_ICON: Record<Emote, { rows: string; c: keyof typeof C; c2?: keyof typeof C }> = {
  alert: { rows: '..a..\n..a..\n..a..\n.....\n..a..', c: 'red3' },
  ask: { rows: '.aaa.\n....a\n..aa.\n.....\n..a..', c: 'blu3' },
  heart: { rows: '.a.a.\naabaa\naaaaa\n.aaa.\n..a..', c: 'red3', c2: 'pnk1' },
  note: { rows: '..aaa\n..a.a\n..a.a\naa.aa\naa.aa', c: 'vio3' },
  bolt: { rows: '...a.\n..a..\n.aaa.\n..a..\n.a...', c: 'org0' },
  star: { rows: '..a..\n.aaa.\naaaaa\n.aaa.\n.a.a.', c: 'org1' },
  dots: { rows: '.....\n.....\na.a.a\n.....\n.....', c: 'ink4' },
  coffee: { rows: '.b.b.\n.....\naaaa.\naaaaa\n.aa..', c: 'snd3', c2: 'ink7' },
};

/** A 9×10 speech bubble with an icon, its tail at the bottom-left (x 2–3). */
export function emoteArt(kind: Emote): PixelCanvas {
  const pc = new PixelCanvas(9, 10);
  pc.rect(1, 0, 7, 7, C.white);
  pc.rect(0, 1, 9, 5, C.white);
  pc.set(2, 7, C.white);
  pc.set(3, 7, C.white);
  pc.set(2, 8, C.white);
  const ic = EMOTE_ICON[kind];
  const rows = ic.rows.split('\n');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'a') pc.set(2 + x, 1 + y, C[ic.c]);
      else if (row[x] === 'b' && ic.c2) pc.set(2 + x, 1 + y, C[ic.c2]);
    }
  });
  const out = new PixelCanvas(11, 11);
  out.blit(pc, 1, 0);
  out.outline(C.ink1);
  return out;
}

// ── baked people (drawn straight into a piece's canvas) ───────────────────────────────────
const lookCache = new Map<string, PersonLook>();
function cachedLook(seed: number, era: number): PersonLook {
  const k = `${seed}|${era}`;
  let L = lookCache.get(k);
  if (!L) {
    L = lookFor(seed, 'staff', era);
    lookCache.set(k, L);
  }
  return L;
}

/**
 * Stamp a figure into a canvas: body's left column at x, feet on the row above footY (as the old
 * 3×7 people stood), so existing set pieces keep their spots.
 */
export function stampPerson(pc: PixelCanvas, x: number, footY: number, seed: number, pose: Pose = 'stand', era = 1, flip = false) {
  const fig = figure(cachedLook(seed, era), pose);
  pc.blit(fig, flip ? x - (FIG_W - FIG_BODY_X - 4) : x - FIG_BODY_X, footY - 1 - FIG_FEET, flip);
}

/** Stamp a seated figure: thighs on seatY − 1, as the old seated people sat. */
export function stampSeated(pc: PixelCanvas, x: number, seatY: number, seed: number, era = 1) {
  pc.blit(seatedFigure(cachedLook(seed, era)), x - FIG_BODY_X, seatY - 8);
}
