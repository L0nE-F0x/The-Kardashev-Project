/**
 * Who everyone is: the look of every face in the game (advisors and how they age, partner CEOs, faction delegates,
 * the Act IV–V cast, successors, province governors), which ids are abstract AI avatars, and which of Bit's forms a
 * model generation wears. Data only: nothing here touches the DOM or WebGL, so the sim and the tests can import it.
 * The busts are built from it in bust.ts (people), bit.ts and avatars.ts, and photographed in studio.ts.
 *
 * Colours are palette indices (`C.*` from render/palette.ts); the busts read the base palette, not the era grade.
 */
import type { AdvisorId } from '../../sim/types';
import { C } from '../../render/palette';

export interface Look {
  bg: [number, number];
  skin: [number, number, number]; // shadow, base, light
  hair: [number, number];
  cloth: [number, number, number];
  style:
    | 'hardhat' | 'bob' | 'long' | 'curly' | 'bun' | 'spiky' | 'slick' | 'receding' | 'bald' | 'beanie' | 'puff' | 'wavy' | 'updo'
    // ── Act III ──
    | 'crop' | 'ponytail' | 'messy' | 'sidepart' | 'pompadour' | 'longwavy' | 'locs' | 'cap' | 'helmet' | 'gele'
    // ── Act IV ──
    | 'pixie' | 'braid' | 'undercut' | 'bandana' | 'shag'
    // ── Act V ──
    | 'chullo' | 'sidebraid';
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
  // ── Act IV extras ──
  /** A glowing plasma ring behind the head [dark, light]. */
  torus?: [number, number];
  /** A spacesuit: a metal neck ring over the suit. */
  eva?: boolean;
  /** A small tattoo on the neck (colour). */
  tattoo?: number;
  /** A check pattern on the shirt (colour). */
  plaid?: number;
  /** A low lunar horizon across the background [dark, light]. */
  horizon?: [number, number];
  // ── Act V extras ──
  /** How old the face looks (the advisors in Act V): 1 greying, 2 elder, 3 renewed by the treatments. */
  age?: 1 | 2 | 3;
  /** Salt and pepper: a scatter of hair pixels in this colour. */
  grizzle?: number;
  /** A healthy glow: a sparkle in the background, bright cheekbones. */
  glow?: boolean;
  /** The inside of a habitat cylinder behind the head: fields curving up both sides, a river, the sky in the middle. */
  cylinder?: boolean;
  /** A doubling curve rising across the background (colour). */
  curve?: number;
  /** An arc of swarm panels glinting round the head [dark, light]. */
  swarm?: [number, number];
  /** A stethoscope round the neck (tube colour). */
  stethoscope?: number;
  /** Dust on the clothes (colour). */
  dust?: number;
}

export const LOOKS: Record<Exclude<AdvisorId, 'bit'>, Look> = {
  juno: { bg: [C.org0, C.org1], skin: [C.skn1, C.skn2, C.skn3], hair: [C.ink0, C.ink1], cloth: [C.blu1, C.blu2, C.blu3], style: 'hardhat' },
  penny: { bg: [C.grn3, C.grn5], skin: [C.skn4, C.skn5, C.skn6], hair: [C.snd1, C.snd2], cloth: [C.ink3, C.ink4, C.ink5], style: 'bob', glasses: true },
  mira: { bg: [C.cyn2, C.cyn3], skin: [C.skn3, C.skn4, C.skn5], hair: [C.ink0, C.ink1], cloth: [C.vio1, C.vio2, C.vio3], style: 'long', headset: true },
  sol: { bg: [C.vio2, C.vio3], skin: [C.skn2, C.skn3, C.skn4], hair: [C.ink1, C.ink2], cloth: [C.snd2, C.snd3, C.snd4], style: 'curly', beard: true, scarf: C.red3 },
  iris: { bg: [C.blu2, C.blu4], skin: [C.skn4, C.skn5, C.skn6], hair: [C.ink7, C.ink8], cloth: [C.ink8, C.ink9, C.white], style: 'bun', glasses: true, coat: true },
  // Kip: the space kid — swept spikes, aviator goggles up on his forehead, a mission patch on his flight suit
  kip: { bg: [C.sky1, C.sky2], skin: [C.skn4, C.skn5, C.skn6], hair: [C.yel0, C.yel1], cloth: [C.org0, C.org1, C.org2], style: 'spiky', goggles: C.sky4, patch: C.blu4 },
  // Dr. Lena Moreau: thirty years of plasma physics — a silver pixie cut, thin glasses, a lab coat over violet, a plasma ring behind her
  lena: { bg: [C.blu1, C.blu2], skin: [C.skn3, C.skn4, C.skn5], hair: [C.ink6, C.ink8], cloth: [C.ink8, C.ink9, C.white], style: 'pixie', glasses: 'thin', suit: { shirt: C.vio3 }, pin: C.pnk0, torus: [C.vio4, C.pnk1], lines: true, earrings: C.pnk1 },
};

/** How old an advisor looks in Act V: 0 as in Acts I–IV · 1 greying · 2 elder · 3 renewed by the longevity treatments. */
export type PortraitAge = 0 | 1 | 2 | 3;

/** Each advisor's look at ages 1, 2 and 3 (changes on top of their Act I–IV look). */
export const AGED: Record<Exclude<AdvisorId, 'bit'>, [Partial<Look>, Partial<Look>, Partial<Look>]> = {
  // Juno: grey sideburns under the hard hat, then white, reading glasses on site
  juno: [{ hair: [C.ink5, C.ink7], grizzle: C.ink3 }, { hair: [C.ink8, C.white], glasses: 'thin', lines: true }, { hair: [C.ink1, C.ink3], grizzle: C.ink6 }],
  // Penny: the brown bob greys, then goes silver; renewed, silver wings at the temples
  penny: [{ hair: [C.snd2, C.snd4], grizzle: C.ink7 }, { hair: [C.ink7, C.ink9], lines: true }, { hair: [C.snd1, C.snd3], temples: C.ink8 }],
  // Mira: a silver streak in the black, then long silver hair and glasses
  mira: [{ hair: [C.ink1, C.ink3], grizzle: C.ink6, streak: C.ink8 }, { hair: [C.ink6, C.ink8], glasses: 'thin', lines: true }, { hair: [C.ink0, C.ink2], streak: C.ink7 }],
  // Sol: salt-and-pepper curls and beard, then white, with round glasses
  sol: [{ hair: [C.ink3, C.ink6], grizzle: C.ink8 }, { hair: [C.ink8, C.white], glasses: true, lines: true }, { hair: [C.ink2, C.ink4], grizzle: C.ink7 }],
  // Iris: already grey; then snow white, tired eyes
  iris: [{ hair: [C.ink8, C.ink9], lines: true }, { hair: [C.ink9, C.white], lines: true }, { hair: [C.ink7, C.ink9] }],
  // Kip: the blond spikes go platinum, then white
  kip: [{ hair: [C.yel1, C.yel2], grizzle: C.ink9 }, { hair: [C.ink8, C.white], glasses: 'thin', lines: true }, { hair: [C.yel0, C.yel2], grizzle: C.ink9 }],
  // Lena: the silver goes white
  lena: [{ hair: [C.ink7, C.ink9] }, { hair: [C.ink9, C.white] }, { hair: [C.ink6, C.ink8], lines: false }],
};

/** An advisor's look at an age (age 0 is exactly the Act I–IV look). */
export function lookAt(id: Exclude<AdvisorId, 'bit'>, age: number): Look {
  const base = LOOKS[id];
  if (age !== 1 && age !== 2 && age !== 3) return base;
  const extra: Partial<Look> = age === 3 ? { glow: true, bags: false } : {};
  return { ...base, ...AGED[id][age - 1], ...extra, age };
}

// ── CEOs (Act II) ─────────────────────────────────────────────────────────────────────────────
export type CeoId =
  | 'meridian' | 'lattice' | 'orchard' | 'kestrel' | 'littlesun' | 'veldt' | 'board'
  // ── Act III partners ──
  | 'halcyon' | 'brightwater' | 'sunforge' | 'spanwire' | 'tidewater' | 'deepvein' | 'saltflat' | 'lumen'
  | 'stackwell' | 'hanbit' | 'bondline' | 'cumulus' | 'stratum' | 'parabola' | 'karman'
  // ── Act III faction delegates ──
  | 'atlantic' | 'eastern' | 'nonaligned'
  // ── Act IV partners and cast ──
  | 'twistfield' | 'kindle' | 'quickpinch' | 'carbonfold' | 'ade'
  // ── Act V partners and cast ──
  | 'lodestar' | 'vonn' | 'evergreen' | 'wren' | 'ify' | 'kenta' | 'amaru' | 'priya' | 'tobias';

export const CEO_LOOKS: Record<CeoId, Look> = {
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
  // ── Act IV partners ──
  // Prof. Greta Lindahl — forty years on one design: a white crown braid, round glasses, a knitted cardigan, the twisted ring behind her
  twistfield: { bg: [C.vio3, C.vio5], skin: [C.skn4, C.skn5, C.skn6], hair: [C.snd6, C.snd8], cloth: [C.grn1, C.grn2, C.grn3], style: 'braid', band: [C.snd5, C.white], glasses: 'thin', knit: C.ink9, lines: true, earrings: C.vio5 },
  // Jonah Pike — talks fast, thinks faster: a bleached undercut, stubble, a black tee and the laser tattoo he won't explain
  kindle: { bg: [C.org0, C.org1], skin: [C.skn4, C.skn5, C.skn6], hair: [C.snd4, C.yel1], cloth: [C.ink0, C.ink1, C.ink3], style: 'undercut', stubble: true, tattoo: C.red3, earrings: C.ink9 },
  // Rosa Quintero — garage-startup energy: a cloud of curls under a red bandana, gold hoops, a denim work shirt
  quickpinch: { bg: [C.yel0, C.yel1], skin: [C.skn2, C.skn3, C.skn4], hair: [C.ink0, C.ink2], cloth: [C.blu2, C.blu3, C.blu4], style: 'bandana', band: [C.red2, C.red3], earrings: C.yel0, lips: C.red3, freckles: true },
  // Sigrid Aalto — the geologist who fell in love with a fan: ginger shag, freckles, a field vest over a flannel shirt
  carbonfold: { bg: [C.grn3, C.grn5], skin: [C.skn4, C.skn5, C.skn6], hair: [C.org0, C.org1], cloth: [C.red1, C.red2, C.red3], style: 'shag', freckles: true, plaid: C.ink2, vest: [C.grn1, C.grn2], ruddy: true },
  // ── Act IV cast ──
  // Ade Bello — Moon base commander, ex-navy: a close crop and a neat beard, the EVA suit, the Moon and Earth behind him
  ade: { bg: [C.night1, C.night3], skin: [C.skn0, C.skn1, C.skn2], hair: [C.ink0, C.ink2], cloth: [C.ink7, C.ink9, C.white], style: 'crop', beard: true, eva: true, patch: C.blu4, stars: true, horizon: [C.rck2, C.rck4] },
  // ── Act V partners ──
  // Marisol "Dusty" Vega — Atacama mining stock: a dark ponytail, amber dust goggles up, a bandana pulled down, a dusty canvas jacket
  lodestar: { bg: [C.rck3, C.rck5], skin: [C.skn2, C.skn3, C.skn4], hair: [C.ink1, C.snd3], cloth: [C.snd2, C.snd3, C.snd4], style: 'ponytail', band: [C.red2, C.org1], goggles: C.org1, mask: C.red2, ruddy: true, lines: true, dust: C.snd6, earrings: C.yel0 },
  // Dr. Yusuf Kaya — cautious and exponential: a neat beard, greying temples, thin glasses, a doubling curve on graph paper behind him
  vonn: { bg: [C.cyn1, C.cyn2], skin: [C.skn3, C.skn4, C.skn5], hair: [C.ink0, C.ink2], cloth: [C.ink2, C.ink3, C.ink4], style: 'crop', temples: C.ink6, beard: true, glasses: 'thin', suit: { shirt: C.ink9, tie: C.cyn4 }, curve: C.cyn6 },
  // Dr. Mateus Silva — "about forty" for decades: glossy dark waves, not a line on his face, a lab coat and stethoscope, a healthy glow
  evergreen: { bg: [C.grn5, C.grn7], skin: [C.skn2, C.skn3, C.skn4], hair: [C.ink0, C.snd1], cloth: [C.ink8, C.ink9, C.white], style: 'wavy', suit: { shirt: C.grn4 }, stethoscope: C.ink2, glow: true, pin: C.grn6 },
  // ── Act V cast ──
  // Wren Achterberg — Penny's protégé, drier still: a sleek black bob, thin glasses, a charcoal turtleneck, Penny's green behind her
  wren: { bg: [C.grn2, C.grn4], skin: [C.skn4, C.skn5, C.skn6], hair: [C.ink0, C.ink2], cloth: [C.ink1, C.ink2, C.ink3], style: 'bob', glasses: 'thin', turtleneck: true, earrings: C.ink9, lips: C.red3 },
  // Ify Okafor — Juno's niece, building in orbit: her aunt's colours, a hard hat with a headlamp, the EVA suit's neck ring
  ify: { bg: [C.dusk4, C.dusk5], skin: [C.skn1, C.skn2, C.skn3], hair: [C.ink0, C.ink1], cloth: [C.blu1, C.blu2, C.blu3], style: 'helmet', hat: [C.org2, C.yel0], eva: true, earrings: C.yel1 },
  // Kenta Mori — talks to the foundries: an undercut, a headset like Mira's, a work jacket with a leaf pin
  kenta: { bg: [C.cyn3, C.cyn5], skin: [C.skn4, C.skn5, C.skn6], hair: [C.ink0, C.ink2], cloth: [C.grn1, C.grn2, C.grn3], style: 'undercut', headset: true, pin: C.grn7, stubble: true },
  // Amaru Quispe — patient as a mountain: a woven chullo, smile lines, a striped poncho collar
  amaru: { bg: [C.vio2, C.vio4], skin: [C.skn2, C.skn3, C.skn4], hair: [C.ink0, C.ink1], cloth: [C.red1, C.red2, C.red3], style: 'chullo', hat: [C.red2, C.red3], weave: [C.yel0, C.white, C.grn5, C.blu4], lines: true },
  // Dr. Priya Raman — fusion engineer turned swarm physicist: a long braid over her shoulder, gold earrings, the swarm's first arc behind her
  priya: { bg: [C.night2, C.night3], skin: [C.skn2, C.skn3, C.skn4], hair: [C.ink0, C.ink2], cloth: [C.cyn1, C.cyn2, C.cyn3], style: 'sidebraid', band: [C.yel0, C.org2], suit: { shirt: C.yel0 }, earrings: C.yel0, swarm: [C.org2, C.yel1] },
  // Tobias Lund — first mayor in space, once a schoolteacher: sandy hair and beard, round glasses, a cardigan, Aurora's fields curving up behind him
  tobias: { bg: [C.sky3, C.sky4], skin: [C.skn4, C.skn5, C.skn6], hair: [C.snd2, C.snd4], cloth: [C.red1, C.red2, C.red3], style: 'receding', beard: true, glasses: true, suit: { shirt: C.ink9 }, knit: C.snd6, lines: true, cylinder: true },
};

/**
 * The AIs that are not people: abstract forms, not faces (built in avatars.ts).
 * Apex (Meridian): a faceted red crystal with a visor of light · Weft (Lattice): a face woven of violet threads on a
 * loom · Sapling (Orchard): a green bud with leaves · Chorus (the minds' envoy): a pale face in slices, like a voiceprint.
 */
export const AVATAR_IDS = ['apex', 'weft', 'sapling', 'chorus'] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];
export const isAvatar = (id: string): id is AvatarId => (AVATAR_IDS as readonly string[]).includes(id);

/** Everyone with a portrait of their own (`ceo:<id>` speakers): partners, delegates, the Act IV cast and the rival AIs. */
export const CEO_IDS = [...Object.keys(CEO_LOOKS), ...AVATAR_IDS] as (CeoId | AvatarId)[];

/** A `ceo:<id>` speaker's look (unknown ids get a generic executive; the AI avatars have no `Look`). */
export const ceoLook = (id: string): Look => CEO_LOOKS[id as CeoId] ?? GENERIC_CEO;

// ── Act IV: the province governors ──
export const GOVERNOR_LOOKS: Record<string, Look> = {
  // Lin Wei — a silver bob, thin glasses, a mandarin-collar jacket
  eam: { bg: [C.cyn1, C.cyn3], skin: [C.skn3, C.skn4, C.skn5], hair: [C.ink7, C.ink9], cloth: [C.ink2, C.ink3, C.ink5], style: 'bob', glasses: 'thin', mandarin: true, lines: true },
  // Priya Raman — a long braid, gold earrings, saffron
  sas: { bg: [C.org0, C.org2], skin: [C.skn2, C.skn3, C.skn4], hair: [C.ink0, C.ink2], cloth: [C.org0, C.org1, C.org2], style: 'braid', earrings: C.yel0 },
  // Amara Diallo — a bright gele, a green dress
  ssa: { bg: [C.grn3, C.grn5], skin: [C.skn0, C.skn1, C.skn2], hair: [C.ink0, C.ink1], cloth: [C.grn3, C.grn5, C.grn7], style: 'gele', band: [C.yel0, C.org1], earrings: C.yel1 },
  // Tomas Reyes — a crop, smile lines, a white shirt
  seo: { bg: [C.sea4, C.sea6], skin: [C.skn2, C.skn3, C.skn4], hair: [C.ink1, C.ink3], cloth: [C.ink8, C.ink9, C.white], style: 'crop', lines: true },
  // Nadia Benali — an updo, a sand blazer
  mena: { bg: [C.snd4, C.snd6], skin: [C.skn3, C.skn4, C.skn5], hair: [C.ink1, C.ink2], cloth: [C.snd2, C.snd3, C.snd5], style: 'updo', suit: { shirt: C.white }, earrings: C.yel0 },
  // Mateo Quispe — a chullo, a poncho in red and gold
  lat: { bg: [C.red1, C.red3], skin: [C.skn1, C.skn2, C.skn3], hair: [C.ink0, C.ink1], cloth: [C.red2, C.red3, C.org1], style: 'chullo', band: [C.red3, C.yel0] },
  // Ruth Calloway — a grey bob, plain glasses, denim
  atl: { bg: [C.blu2, C.blu4], skin: [C.skn4, C.skn5, C.skn6], hair: [C.ink6, C.ink8], cloth: [C.blu2, C.blu3, C.blu4], style: 'bob', glasses: true, lines: true },
  // Kai Nakamura-Ortiz — an undercut, a hoodie
  pac: { bg: [C.dusk3, C.dusk5], skin: [C.skn3, C.skn4, C.skn5], hair: [C.ink1, C.ink3], cloth: [C.ink3, C.ink4, C.ink6], style: 'undercut', hoodie: true },
  // Élise Fournier — a pixie cut, a red scarf
  eur: { bg: [C.blu1, C.blu3], skin: [C.skn4, C.skn5, C.skn6], hair: [C.snd1, C.snd3], cloth: [C.ink2, C.ink3, C.ink4], style: 'pixie', scarf: C.red3 },
  // Sigrid Halvorsen — a pale ponytail, a knit
  nor: { bg: [C.ice0, C.ice2], skin: [C.skn5, C.skn6, C.white], hair: [C.snd6, C.snd8], cloth: [C.blu1, C.blu2, C.blu3], style: 'ponytail', knit: C.ice3 },
  // Arman Seitkali — receding grey hair, a moustache, a dark suit
  stp: { bg: [C.snd3, C.snd5], skin: [C.skn3, C.skn4, C.skn5], hair: [C.ink6, C.ink8], cloth: [C.ink1, C.ink2, C.ink3], style: 'receding', moustache: true, suit: { shirt: C.ink9, tie: C.blu4 }, lines: true },
  // Mei-Ling Chou — a bun, a headset, a lab-grey jacket
  fab: { bg: [C.vio1, C.vio3], skin: [C.skn4, C.skn5, C.skn6], hair: [C.ink0, C.ink2], cloth: [C.ink5, C.ink6, C.ink8], style: 'bun', headset: true, earrings: C.cyn5 },
};

/** Someone without a portrait of their own: a grey-suited executive. */
export const GENERIC_CEO: Look = { bg: [C.ink3, C.ink4], skin: [C.skn3, C.skn4, C.skn5], hair: [C.ink2, C.ink4], cloth: [C.ink1, C.ink2, C.ink4], style: 'wavy', suit: { shirt: C.ink9, tie: C.blu3 } };

/** A province governor's look (an unknown region gets the generic executive). */
export const governorLook = (region: string): Look => GOVERNOR_LOOKS[region] ?? GENERIC_CEO;

// ── Bit ──
/**
 * Bit's six bodies. Each has two or three steps, one per model generation:
 *   classic    Bit-0 (asleep), Bit-1 (a grey desk robot), Bit-2 (blue, rounder), Bit-3 (a gold antenna with a ring)
 *   next       Bit-4 (a pearl shell, ear fins, a floating orb), Bit-5 (dark glass full of light, a halo)
 *   oracle     Bit-6 (pearl and gold, the head floating free), Bit-7 (a head of light, a ring in orbit, a crown of stars)
 *   planetary  Bit-8 (a small blue world with an aurora and two satellites), Bit-9 (an eclipse inside the first lattice)
 *   steward    Bit-10, the co-steward (Act V's fate, not a model generation): warm light behind a gold rim
 *   free       Bit-11, a free mind in the swarm: a constellation in the shape of a face
 */
export type BitFamily = 'classic' | 'next' | 'oracle' | 'planetary' | 'steward' | 'free';
export interface BitModel {
  family: BitFamily;
  /** The generation actually built (0–11): anything above 11 wears Bit-9, the last model generation. */
  gen: number;
}

/** Which Bit a `bitGen` shows. 10 and 11 are Act V's endings; model generations stop at 9. */
export function bitModel(bitGen: number): BitModel {
  const g = Number.isFinite(bitGen) ? Math.floor(bitGen) : 1;
  if (g === 10) return { family: 'steward', gen: 10 };
  if (g === 11) return { family: 'free', gen: 11 };
  if (g >= 8) return { family: 'planetary', gen: Math.min(9, g) };
  if (g >= 6) return { family: 'oracle', gen: g };
  if (g >= 4) return { family: 'next', gen: g };
  return { family: 'classic', gen: Math.max(0, g) };
}
