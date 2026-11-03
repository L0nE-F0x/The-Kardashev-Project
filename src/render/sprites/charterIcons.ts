/**
 * Act III map sprites: the Charter HQ emblem, megaproject markers by kind and stage, builder
 * cranes, launch pads and rockets, the orbital test satellite and the space-solar craft, HVDC
 * converter stations and the small glyphs gathered at each bloc's anchor.
 * All drawn with palette keys into PixelCanvases (cached as textures by the callers).
 */
import type { Texture } from 'pixi.js';
import type { ContractKind } from '../../sim/types';
import { C, type ColorKey } from '../palette';
import { PixelCanvas } from '../pixels';
import { cachedTexture } from '../textures';

type Keys = Record<string, ColorKey | null>;

// ── colour ramps ─────────────────────────────────────────────────────────────────────────────
const RAMP_GROUPS: ColorKey[][] = [
  ['ink0', 'ink1', 'ink2', 'ink3', 'ink4', 'ink5', 'ink6', 'ink7', 'ink8', 'ink9', 'white'],
  ['sea0', 'sea1', 'sea2', 'sea3', 'sea4', 'sea5', 'sea6', 'sea7', 'sea8', 'foam'],
  ['sky0', 'sky1', 'sky2', 'sky3', 'sky4', 'sky5'],
  ['dusk0', 'dusk1', 'dusk2', 'dusk3', 'dusk4', 'dusk5', 'dusk6'],
  ['night0', 'night1', 'night2', 'night3'],
  ['grn0', 'grn1', 'grn2', 'grn3', 'grn4', 'grn5', 'grn6', 'grn7', 'grn8'],
  ['snd0', 'snd1', 'snd2', 'snd3', 'snd4', 'snd5', 'snd6', 'snd7', 'snd8'],
  ['rck0', 'rck1', 'rck2', 'rck3', 'rck4', 'rck5', 'rck6'],
  ['ice0', 'ice1', 'ice2', 'ice3'],
  ['red0', 'red1', 'red2', 'red3', 'org0', 'org1', 'org2', 'yel0', 'yel1', 'yel2'],
  ['cyn0', 'cyn1', 'cyn2', 'cyn3', 'cyn4', 'cyn5', 'cyn6'],
  ['vio0', 'vio1', 'vio2', 'vio3', 'vio4', 'vio5', 'pnk0', 'pnk1'],
  ['blu0', 'blu1', 'blu2', 'blu3', 'blu4', 'blu5', 'blu6'],
  ['skn0', 'skn1', 'skn2', 'skn3', 'skn4', 'skn5', 'skn6'],
];

/** [darker, base, lighter] around a palette colour, within its own ramp. */
export function rampOf(col: ColorKey): [ColorKey, ColorKey, ColorKey] {
  for (const g of RAMP_GROUPS) {
    const i = g.indexOf(col);
    if (i >= 0) return [g[Math.max(0, i - 1)], col, g[Math.min(g.length - 1, i + 1)]];
  }
  return [col, col, col];
}

/** Stamp a text grid into a canvas at (x, y). */
function stamp(pc: PixelCanvas, rows: string, x: number, y: number, map: Keys) {
  const src = PixelCanvas.from(rows, map);
  pc.blit(src, x, y);
}

/** Grow a canvas by `pad` px on every side and outline it. */
function framed(pc: PixelCanvas, outline: number = C.ink0, diagonal = false, pad = 1): PixelCanvas {
  const out = new PixelCanvas(pc.w + pad * 2, pc.h + pad * 2);
  out.blit(pc, pad, pad);
  out.outline(outline, diagonal);
  return out;
}

// ── cranes ───────────────────────────────────────────────────────────────────────────────────
/**
 * A tower crane in a builder's colours: a lattice mast with its cab, a long jib with a trolley,
 * the counterweight on the short arm, and a thin hook line hanging free (drawn after the outline).
 */
export function craneCanvas(col: ColorKey, small = false): PixelCanvas {
  const [dk, base, lt] = rampOf(col);
  const w = small ? 7 : 8;
  const h = small ? 7 : 9;
  const mx = w - 3;
  const pc = new PixelCanvas(w, h);
  pc.set(mx, 0, C[lt]);
  for (let x = 0; x < w; x++) pc.set(x, 1, C[x < mx ? base : lt]);
  pc.set(w - 1, 1, C.ink5);
  pc.set(w - 1, 2, C.ink5);
  for (let y = 2; y < h - 1; y++) pc.set(mx, y, C[y % 2 ? dk : base]);
  pc.set(mx - 1, 2, C.ink9);
  for (let x = mx - 1; x <= mx + 1; x++) pc.set(x, h - 1, C.ink4);
  const out = framed(pc);
  // trolley, hook line and hook, left unoutlined so they stay fine
  const hx = 2;
  out.set(hx, 3, C.ink9);
  for (let y = 4; y < (small ? 6 : 7); y++) out.set(hx, y, C.ink8);
  out.set(hx, small ? 6 : 7, C.yel1);
  return out;
}
export function craneTexture(col: ColorKey, small = false): Texture {
  return cachedTexture(`crane3:${col}:${small}`, () => craneCanvas(col, small));
}

// ── the Charter HQ ───────────────────────────────────────────────────────────────────────────
/** The Charter HQ: a gold sunburst around a small blue-green globe. */
export function charterHqCanvas(hover = false): PixelCanvas {
  const pc = PixelCanvas.from(
    `
    .....r.....
    .r...r...r.
    ..r.ggg.r..
    ...ghhhg...
    ..gbcccdg..
    rrgbccedgrr
    ..gbcedeg..
    ...gddeg...
    ..r.ggg.r..
    .r...r...r.
    .....r.....
  `,
    hover
      ? { r: 'yel2', g: 'yel1', h: 'white', b: 'sea6', c: 'sea7', d: 'sea5', e: 'grn7' }
      : { r: 'yel0', g: 'yel0', h: 'yel2', b: 'sea5', c: 'sea6', d: 'sea4', e: 'grn6' },
  );
  // the gold ring's lit top-left and shaded bottom-right
  if (!hover) {
    for (const [x, y] of [[3, 3], [2, 4], [4, 2]] as const) pc.set(x, y, C.yel1);
    for (const [x, y] of [[7, 7], [8, 6], [6, 8], [7, 8], [8, 7]] as const) if (pc.get(x, y) === C.yel0) pc.set(x, y, C.org2);
  }
  return framed(pc, C.ink0, true);
}
export function charterHqTexture(hover = false): Texture {
  return cachedTexture(`charterhq:${hover}`, () => charterHqCanvas(hover));
}

// ── megaprojects ─────────────────────────────────────────────────────────────────────────────
const PANEL: Keys = { a: 'blu1', b: 'blu3', c: 'sky4', e: 'grn5', f: 'yel1', g: 'ink6' };

function solarIcon(stage: number): PixelCanvas {
  const w = [0, 7, 9, 11][stage];
  const pc = new PixelCanvas(w, stage * 2 + 2);
  const rows = stage + 1;
  for (let r = 0; r < rows; r++) {
    const len = w - 1 - (stage >= 2 && r < 2 ? 2 : 0);
    const x0 = r;
    for (let i = 0; i < Math.min(len, w - x0); i++) {
      pc.set(x0 + i, r * 2, (i + r) % 3 === 1 ? C.sky5 : C.blu5);
      pc.set(x0 + i, r * 2 + 1, C.blu3);
    }
  }
  // battery yards beside the bigger parks
  if (stage >= 2) stamp(pc, 'ee\nef', w - 2, 0, PANEL);
  if (stage >= 3) stamp(pc, 'ee\nfe', w - 2, 2, PANEL);
  return pc;
}

/**
 * Wind turbines: slim outlined towers, then the three blades added after the outline so they
 * stay one pixel thin (one up, two swept down from the hub).
 */
function windIcon(stage: number): PixelCanvas {
  const spots: [number, number, boolean][][] = [
    [],
    [[1, 0, true], [5, 1, false]],
    [[1, 1, false], [5, 0, true], [9, 1, false]],
    [[1, 1, false], [5, 0, true], [9, 1, false], [13, 0, true]],
  ];
  const pts = spots[stage];
  const w = Math.max(...pts.map(([x]) => x + 2));
  const h = Math.max(...pts.map(([, y, tall]) => y + (tall ? 8 : 7)));
  const pc = new PixelCanvas(w, h);
  for (const [x, y, tall] of pts) {
    const hub = y + (tall ? 2 : 2);
    for (let yy = hub + 1; yy < h; yy++) pc.set(x, yy, yy === h - 1 ? C.ink6 : C.ink9);
    pc.set(x, hub, C.ink7);
  }
  return pc;
}

/** Blades for the turbines in windIcon (drawn on the framed canvas, offset by the frame). */
function windBlades(pc: PixelCanvas, stage: number) {
  const spots: [number, number][][] = [[], [[1, 0], [5, 1]], [[1, 1], [5, 0], [9, 1]], [[1, 1], [5, 0], [9, 1], [13, 0]]];
  for (const [x0, y0] of spots[stage]) {
    const x = x0 + 1;
    const hub = y0 + 2 + 1;
    pc.set(x, hub - 1, C.white);
    pc.set(x, hub - 2, C.white);
    pc.set(x - 1, hub + 1, C.white);
    pc.set(x + 1, hub + 1, C.white);
    pc.set(x - 2, hub + 2, C.ink8);
    pc.set(x + 2, hub + 2, C.ink8);
  }
}

const DOME = `
  .ab.
  abbb
  abbb
`;
const TOWER = `
  .c.c.
  ..c..
  .aab.
  ..ab.
  .aab.
  aaabb
`;
const NUKE: Keys = { a: 'ink8', b: 'ink6', c: 'white', d: 'yel0' };

function nuclearIcon(stage: number): PixelCanvas {
  const layout: Record<number, [string, number, number][]> = {
    1: [[TOWER, 0, 0], [DOME, 5, 3]],
    2: [[TOWER, 0, 0], [DOME, 5, 3], [DOME, 9, 3]],
    3: [[TOWER, 0, 0], [TOWER, 4, 1], [DOME, 9, 4], [DOME, 13, 4], [DOME, 11, 1]],
  };
  const parts = layout[stage];
  const w = Math.max(...parts.map(([r, x]) => x + r.trim().split('\n')[0].trim().length));
  const h = Math.max(...parts.map(([r, , y]) => y + r.trim().split('\n').length));
  const pc = new PixelCanvas(w, h);
  for (const [r, x, y] of parts) stamp(pc, r, x, y, NUKE);
  // the Little Sun yellow band on each dome
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (pc.get(x, y) === C.ink6 && pc.get(x, y - 1) === C.ink8 && pc.get(x - 1, y) === C.ink8) pc.set(x, y, C.yel0);
  return pc;
}

/** A dam across a valley: the reservoir behind, a tapering concrete wall, the spillway foaming into the river. */
function hydroIcon(stage: number): PixelCanvas {
  const w = [0, 7, 9, 11][stage];
  const top = stage >= 3 ? 3 : 0;
  const wallRows = stage >= 2 ? 3 : 2;
  const pc = new PixelCanvas(w, top + 3 + wallRows + 1);
  const mid = Math.floor(w / 2);
  for (let x = 0; x < w; x++) {
    pc.set(x, top, C.sea6);
    pc.set(x, top + 1, (x + stage) % 4 === 1 ? C.sea7 : C.sea6);
    pc.set(x, top + 2, x === 0 || x === w - 1 ? C.ink7 : C.ink9);
  }
  for (let r = 0; r < wallRows; r++) {
    const inset = r + 1;
    for (let x = 0; x < w; x++) {
      const inWall = x >= inset && x < w - inset;
      pc.set(x, top + 3 + r, !inWall ? (x < mid ? C.rck4 : C.rck3) : x === mid ? C.foam : x < mid ? C.ink7 : C.ink6);
    }
  }
  // the river leaving the spillway between the valley sides
  for (let x = 0; x < w; x++) pc.set(x, top + 3 + wallRows, x === mid ? C.sea7 : x === mid - 1 || x === mid + 1 ? C.grn4 : x < mid ? C.rck4 : C.rck3);
  if (stage >= 3) {
    // pumped storage: a second reservoir up the hill and the penstock down to the powerhouse
    for (let x = 0; x < 5; x++) pc.set(x, 0, C.sea6);
    for (let x = 0; x < 5; x++) pc.set(x, 1, x === 0 ? C.ink7 : C.ink9);
    pc.set(5, 1, C.ink8);
    pc.set(6, 2, C.ink8);
  }
  return pc;
}

/** A geothermal plant: a steam plume over a small powerhouse on its well pad. */
const WELL = `
  .wi..
  wwii.
  .ii..
  ..a..
  .bbb.
  ccccc
`;
const GEO: Keys = { w: 'white', i: 'ice2', a: 'ink6', b: 'ink8', c: 'snd3' };

function geoIcon(stage: number): PixelCanvas {
  const spots: [number, number][][] = [[], [[0, 0]], [[0, 1], [5, 0]], [[0, 1], [5, 0], [10, 1]]];
  const pts = spots[stage];
  const w = Math.max(...pts.map(([x]) => x + 5)) + (stage === 1 ? 3 : 0);
  const h = Math.max(...pts.map(([, y]) => y + 6));
  const pc = new PixelCanvas(w, h);
  for (const [x, y] of pts) stamp(pc, WELL, x, y, GEO);
  // the silver pipeline joining the pads (and running off to the next well field)
  for (let x = 0; x < w; x++) if (!pc.get(x, h - 2)) pc.set(x, h - 2, x % 3 === 2 ? C.ink6 : C.ink8);
  return pc;
}

/** The survey marker of a megaproject site nobody has built at yet: a faint dotted plot with a stake. */
export function megaSurveyCanvas(hover = false): PixelCanvas {
  return PixelCanvas.from(
    `
    ...a...
    ..a.a..
    .a.b.a.
    a..b..a
    .a.c.a.
    ..a.a..
    ...a...
  `,
    hover ? { a: 'white', b: 'yel1', c: 'yel0' } : { a: 'ink7', b: 'yel0', c: 'snd4' },
  );
}

const MEGA_DRAW: Partial<Record<ContractKind, (stage: number) => PixelCanvas>> = {
  solar: solarIcon,
  wind: windIcon,
  nuclear: nuclearIcon,
  hydro: hydroIcon,
  geo: geoIcon,
};

/**
 * A megaproject marker: stage 0 = the faint survey plot; 1–3 = a growing icon for the site's
 * main kind (panel rows, turbines, reactor domes, a dam, well pads), outlined. Hover brightens the outline.
 */
export function megaMarkerCanvas(kind: ContractKind, stage: number, hover = false): PixelCanvas {
  if (stage <= 0) return megaSurveyCanvas(hover);
  const draw = MEGA_DRAW[kind] ?? solarIcon;
  const icon = draw(Math.min(3, stage));
  if (stage < 3) {
    const out = framed(icon, hover ? C.white : C.ink0);
    if (kind === 'wind') windBlades(out, stage);
    return out;
  }
  // full scale: the Charter's gold pennant planted on the corner
  const pc = new PixelCanvas(icon.w + 2, icon.h + 3);
  pc.blit(icon, 0, 3);
  for (let y = 0; y < 4; y++) pc.set(icon.w, y, C.ink9);
  pc.set(icon.w + 1, 0, C.yel0);
  pc.set(icon.w + 1, 1, C.yel1);
  const out = framed(pc, hover ? C.white : C.ink0);
  if (kind === 'wind') {
    // blades sit 3 rows lower under the pennant
    const tmp = new PixelCanvas(out.w, out.h);
    windBlades(tmp, 3);
    out.blit(tmp, 0, 3);
  }
  return out;
}
export function megaMarkerTexture(kind: ContractKind, stage: number, hover = false): Texture {
  return cachedTexture(`megamark:${kind}:${stage}:${hover}`, () => megaMarkerCanvas(kind, stage, hover));
}

// ── launch ───────────────────────────────────────────────────────────────────────────────────
const ROCKET = `
  .o.
  .w.
  wwv
  wbv
  wwv
  wkv
  wwv
  wwv
  oko
`;
const ROCKET_KEYS: Keys = { o: 'org0', w: 'white', v: 'ink8', b: 'blu4', k: 'ink5' };

/** A candidate launch site: a faint pad with a rocket silhouette. */
export function launchCandidateCanvas(hover = false): PixelCanvas {
  const pc = PixelCanvas.from(
    `
    ..a..
    .aba.
    .aba.
    .aba.
    aabaa
    c.c.c
  `,
    hover ? { a: 'white', b: 'yel1', c: 'yel0' } : { a: 'ink6', b: 'ink4', c: 'ink6' },
  );
  return framed(pc);
}

/**
 * The launch complex: service tower, pad and flame trench, the tank farm beside it. `rocket` puts
 * the rocket on the pad (hidden while the liftoff replays). Under construction the tower is half
 * built and a crane in the builder's colours works over the empty pad.
 */
export function launchPadCanvas(opts: { building: boolean; rocket: boolean; hover?: boolean; builder?: ColorKey }): PixelCanvas {
  const pc = new PixelCanvas(11, 14);
  const top = opts.building ? 6 : 1;
  // service tower: a lattice on the left with arms reaching right
  for (let y = top; y < 12; y++) {
    pc.set(1, y, y % 2 ? C.ink8 : C.ink6);
    pc.set(2, y, y % 2 ? C.ink6 : C.ink8);
  }
  if (!opts.building) {
    pc.set(3, 3, C.ink7);
    pc.set(3, 7, C.ink7);
    pc.set(1, 0, C.red3);
  } else {
    // scaffold where the tower will rise
    for (let y = 2; y < 6; y++) if (y % 2 === 0) pc.set(1, y, C.ink5);
    pc.set(2, 3, C.ink5);
    const [dk, base, lt] = rampOf(opts.builder ?? 'yel0');
    // the crane: mast right of the pad, jib reaching over it, the hook hanging down
    for (let y = 2; y < 12; y++) pc.set(8, y, C[y % 2 ? dk : base]);
    for (let x = 3; x <= 10; x++) pc.set(x, 2, C[x === 8 ? lt : base]);
    pc.set(10, 3, C.ink5);
    pc.set(8, 1, C[lt]);
  }
  if (opts.rocket && !opts.building) stamp(pc, ROCKET, 4, 3, ROCKET_KEYS);
  // the pad: a concrete slab with the flame trench, and the tank farm on the right
  for (let x = 0; x < 11; x++) {
    pc.set(x, 12, x === 5 ? C.ink2 : C.ink5);
    pc.set(x, 13, C.ink4);
  }
  if (!opts.building) {
    pc.set(9, 10, C.ink9);
    pc.set(10, 10, C.ink8);
    pc.set(9, 11, C.ink8);
    pc.set(10, 11, C.ink7);
  }
  if (opts.hover) pc.replace(C.ink5, C.ink7);
  const out = framed(pc, opts.hover ? C.white : C.ink0);
  if (opts.building) {
    // the hook line hangs free of the outline
    for (let y = 4; y < 8; y++) out.set(5, y, C.ink8);
    out.set(5, 8, C.yel1);
  }
  return out;
}
export function launchPadTexture(building: boolean, rocket: boolean, hover = false, builder: ColorKey = 'yel0'): Texture {
  return cachedTexture(`launchpad:${building}:${rocket}:${hover}:${builder}`, () => launchPadCanvas({ building, rocket, hover, builder }));
}

/** The rocket in flight (frame 0/1 flicker the flame). */
export function rocketCanvas(frame: number): PixelCanvas {
  const pc = new PixelCanvas(3, 13);
  stamp(pc, ROCKET, 0, 0, ROCKET_KEYS);
  const flame = frame % 2 ? `\n  yzy\n  .y.\n  .o.\n  ` : `\n  zyz\n  yzy\n  .o.\n  .o.\n  `;
  stamp(pc, flame, 0, 9, { y: 'yel1', z: 'yel2', o: 'org1' });
  return framed(pc);
}
export function rocketTexture(frame: number): Texture {
  return cachedTexture(`rocket:${frame % 2}`, () => rocketCanvas(frame));
}

// ── orbit ────────────────────────────────────────────────────────────────────────────────────
/** The orbital compute test: a gold bus between two blue solar wings. */
export function satelliteCanvas(): PixelCanvas {
  const pc = PixelCanvas.from(
    `
    bcb.y.bcb
    bbbaYabbb
    bcb.y.bcb
  `,
    { a: 'ink8', b: 'blu3', c: 'blu5', y: 'yel0', Y: 'yel2' },
  );
  return framed(pc);
}
export function satelliteTexture(): Texture {
  return cachedTexture('satellite', satelliteCanvas);
}

/** The space-solar demonstrator: two wide gold arrays on a truss, the microwave dish underneath facing Earth. */
export function spaceSolarCanvas(): PixelCanvas {
  const pc = PixelCanvas.from(
    `
    yzyzy.yzyzy
    zzzzzazzzzz
    yzyzy.yzyzy
    .....a.....
    ....bdb....
  `,
    { y: 'yel1', z: 'org2', a: 'ink8', b: 'ink9', d: 'pnk1' },
  );
  return framed(pc);
}
export function spaceSolarTexture(): Texture {
  return cachedTexture('spacesolar', spaceSolarCanvas);
}

/** The microwave beam from the space-solar craft to the ground (dithered, faint). */
export function beamCanvas(len: number): PixelCanvas {
  const pc = new PixelCanvas(3, len);
  for (let y = 0; y < len; y++) {
    pc.set(1, y, y % 2 ? C.pnk1 : C.yel1);
    if (y % 3 === 0) pc.set(y % 6 === 0 ? 0 : 2, y, C.pnk0);
  }
  return pc;
}
export function beamTexture(len: number): Texture {
  return cachedTexture(`beam:${len}`, () => beamCanvas(len));
}

// ── HVDC ─────────────────────────────────────────────────────────────────────────────────────
/** A converter station at each end of an HVDC link: a hall with a lit valve room. */
export function converterCanvas(online: boolean): PixelCanvas {
  const pc = PixelCanvas.from(
    `
    a.a..
    bbbbb
    bcbcb
  `,
    online ? { a: 'ink8', b: 'ink8', c: 'yel1' } : { a: 'ink6', b: 'ink6', c: 'ink4' },
  );
  return framed(pc);
}
export function converterTexture(online: boolean): Texture {
  return cachedTexture(`converter:${online}`, () => converterCanvas(online));
}

/** A 2×2 power pulse (HVDC lines are thicker than ordinary links). */
export function pulse2Canvas(): PixelCanvas {
  const pc = new PixelCanvas(2, 2);
  pc.rect(0, 0, 2, 2, C.white);
  return pc;
}
export function pulse2Texture(): Texture {
  return cachedTexture('pulse2', pulse2Canvas);
}

// ── anchors: public compute, open cables, Commons lines ──────────────────────────────────────
/** 7×4 glyphs; `b` is painted in the builder's colour (roofs, dies), `k` in its darker shade. */
const ANCHOR_GLYPHS: Partial<Record<ContractKind, string>> = {
  // a public data hall: the builder's roof over rows of lit racks
  compute: `
    bbbbbbb
    acacaca
    aaaaaaa
    acacaca
  `,
  // a landing hut where an open cable comes ashore through the surf
  cable: `
    .bbbbb.
    .acwca.
    .aaaaa.
    dedeede
  `,
  // a cleanroom block with exhaust stacks and the builder's band
  fab: `
    g.....g
    bbbbbbb
    efefefe
    eeeeeee
  `,
  // memory dies stacked in the builder's colours on a substrate
  hbm: `
    .bbbbb.
    .kkkkk.
    .bbbbb.
    hhhhhhh
  `,
  // an interposer: a logic die between two stacks in the builder's colours
  pkg: `
    b.fff.b
    k.fff.k
    hhhhhhh
    i.i.i.i
  `,
  // an EUV tool: the mirror barrel glowing violet, the builder's band round the body
  euv: `
    ..eee..
    .ejjje.
    bbbbbbb
    aaaaaaa
  `,
};
const ANCHOR_KEYS: Keys = { a: 'ink2', c: 'cyn5', w: 'white', d: 'sea6', e: 'ice2', f: 'cyn4', g: 'ink6', h: 'grn4', i: 'snd6', j: 'vio5' };

/**
 * A small glyph for a public compute campus, an open cable or a Commons line, in its builder's
 * colours. Under construction the top row is scaffold and a crane in the builder's colours
 * stands beside it.
 */
export function anchorGlyphCanvas(kind: ContractKind, builder: ColorKey, building: boolean): PixelCanvas {
  const rows = ANCHOR_GLYPHS[kind] ?? ANCHOR_GLYPHS.compute!;
  const [dk, base, lt] = rampOf(builder);
  const glyph = PixelCanvas.from(rows, { ...ANCHOR_KEYS, b: base, k: dk });
  if (kind === 'compute' || kind === 'cable') glyph.set(1, 0, C[lt]);
  if (!building) return framed(glyph);
  for (let x = 0; x < glyph.w; x++) if (glyph.get(x, 0)) glyph.set(x, 0, x % 2 ? C.ink4 : 0);
  // a crane in the builder's colours: mast on the right, jib over the glyph, hook line
  const out = new PixelCanvas(glyph.w + 2, glyph.h + 3);
  out.blit(glyph, 0, 3);
  const mx = glyph.w;
  for (let y = 1; y < out.h; y++) out.set(mx, y, C[y % 2 ? dk : base]);
  for (let x = 1; x <= mx + 1; x++) out.set(x, 1, C[base]);
  out.set(mx + 1, 1, C.ink6);
  out.set(mx, 0, C[base]);
  out.set(2, 2, C.ink8);
  return framed(out);
}
export function anchorGlyphTexture(kind: ContractKind, builder: ColorKey, building: boolean): Texture {
  return cachedTexture(`anchor2:${kind}:${builder}:${building}`, () => anchorGlyphCanvas(kind, builder, building));
}
