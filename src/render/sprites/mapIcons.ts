import type { Texture } from 'pixi.js';
import type { FacilityType } from '../../sim/types';
import { C, type ColorKey } from '../palette';
import { hash2, PixelCanvas } from '../pixels';
import { cachedTexture } from '../textures';

type Map = Record<string, ColorKey | null>;

const PIN = `
  ..aaaaa..
  .abbbbba.
  abbcccbba
  abbcccbba
  abbcccbba
  .abbbbba.
  ..abbba..
  ...aba...
  ....a....
`;

const DIAMOND = `
  ..a..
  .aba.
  ab.ba
  .aba.
  ..a..
`;

const CHIP = `
  .d.d.d.
  abbbbba
  dbcccbd
  abcccba
  dbcccbd
  abbbbba
  .d.d.d.
`;

const CLOUD_MARK = `
  ...aaa...
  ..abbba..
  .aabbbaa.
  abbbbbbba
  abbbbbbba
  .aaaaaaa.
`;

const HOUSE = `
  ....a....
  ...aba...
  ..abbba..
  .abbbbba.
  abbbbbbba
  .accbcca.
  .accbcca.
  .abbdbba.
  .aaaaaaa.
`;

/**
 * A 1 px dark rim (ink0) round a map sprite wherever its edge is light, so it reads on snow,
 * sand, surf and city lights alike. Baked once into the canvas (textures are cached), never per
 * frame. Grows the canvas by 1 px on every side, so centred sprites stay centred; edges already
 * rimmed in ink0/ink1 are left as they are, and so are holes inside the sprite.
 */
export function mapRim(pc: PixelCanvas): PixelCanvas {
  const out = new PixelCanvas(pc.w + 2, pc.h + 2);
  out.blit(pc, 1, 1);
  const { w, h } = out;
  const src = out.data.slice();
  // the empty pixels outside the sprite: flood in from the (empty) border
  const outside = new Uint8Array(w * h);
  const stack = [0];
  outside[0] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (outside[j] || src[j] !== 0) continue;
      outside[j] = 1;
      stack.push(j);
    }
  }
  const light = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const c = src[y * w + x];
    return c !== 0 && c !== C.ink0 && c !== C.ink1;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!outside[y * w + x]) continue;
      if (light(x - 1, y) || light(x + 1, y) || light(x, y - 1) || light(x, y + 1)) out.set(x, y, C.ink0);
    }
  }
  return out;
}

/** Marker for one of the player's sites. */
export function sitePinCanvas(color: ColorKey): PixelCanvas {
  return PixelCanvas.from(PIN, { a: 'ink0', b: color, c: 'white' });
}
export function sitePinTexture(color: ColorKey): Texture {
  return cachedTexture(`pin:${color}`, () => sitePinCanvas(color));
}

export function homeCanvas(): PixelCanvas {
  return PixelCanvas.from(HOUSE, { a: 'ink0', b: 'yel0', c: 'org2', d: 'snd3' });
}
export function homeTexture(): Texture {
  return cachedTexture('home', homeCanvas);
}

/** An empty build site: a small plot diamond, rimmed dark so it shows on light ground too. */
export function candidateCanvas(hover: boolean): PixelCanvas {
  return mapRim(PixelCanvas.from(DIAMOND, { a: hover ? 'white' : 'ink8', b: hover ? 'yel1' : 'ink1' }));
}
export function candidateTexture(hover: boolean): Texture {
  return cachedTexture(`cand:${hover}`, () => candidateCanvas(hover));
}

export function supplierCanvas(color: ColorKey): PixelCanvas {
  return mapRim(PixelCanvas.from(CHIP, { a: 'ink0', b: color, c: 'ink2', d: 'ink8' }));
}
export function supplierTexture(color: ColorKey): Texture {
  return cachedTexture(`chip:${color}`, () => supplierCanvas(color));
}

export function cloudMarkCanvas(): PixelCanvas {
  return PixelCanvas.from(CLOUD_MARK, { a: 'ink0', b: 'blu6' });
}
export function cloudMarkTexture(): Texture {
  return cachedTexture('cloudmark', cloudMarkCanvas);
}

/** Facility glyphs: 5 px tall, 5–7 px wide (bigger plants get wider glyphs). */
const FAC_ICONS: Record<FacilityType, [string, Map]> = {
  datacenter: [`aaaaa\nabcba\naaaaa\nabcba\naaaaa`, { a: 'ink2', b: 'cyn5', c: 'ink5' }],
  solar: [`bbbbb\nbcbcb\nbbbbb\n..a..\n.aaa.`, { a: 'ink7', b: 'blu3', c: 'sky4' }],
  wind: [`b...b\n.b.b.\n..a..\n..a..\n..a..`, { a: 'white', b: 'ink9' }],
  battery: [`.aaa.\nabbba\nabcba\nabbba\naaaaa`, { a: 'ink1', b: 'grn5', c: 'yel1' }],
  gas: [`..b..\n.bcb.\n.bcb.\nbcccb\n.bbb.`, { a: 'ink1', b: 'org1', c: 'yel0' }],
  lab: [`.aaa.\n..a..\n.aba.\nabbba\naaaaa`, { a: 'ink9', b: 'vio4' }],
  hq: [`..a..\n.aaa.\naaaaa\n.b.b.\n.bbb.`, { a: 'yel0', b: 'snd5' }],
  // ── Act II ──
  // a dam: reservoir behind a concrete wall, spillway foam below
  hydro: [`bbbbb\ncbcbc\naaaaa\nadada\nadada`, { a: 'ink8', b: 'sea6', c: 'sea7', d: 'foam' }],
  // steam rising from a well head and pipework
  geothermal: [`c..c.\n.c..c\nc..c.\naeaae\nbbbbb`, { a: 'rck5', b: 'red3', c: 'white', e: 'org1' }],
  // one old cooling tower, steaming again
  restart: [`.c.c.\n..c..\n.aab.\n.aab.\naaabb`, { a: 'ink8', b: 'ink6', c: 'white' }],
  // a row of small modules with the Little Sun cap
  smr: [`.c.c.c.\nacacaca\nabababa\nabababa\naaaaaaa`, { a: 'ink6', b: 'ink9', c: 'yel0' }],
  // containment dome + a big cooling tower
  reactor: [`.....c.c\n..aa..c.\n.abbacce\n.abba.de\naaaaaadd`, { a: 'ink6', b: 'ink9', c: 'white', d: 'ink8', e: 'ink6' }],
  // interposer: logic die between HBM stacks, solder balls under
  packaging: [`d.c.d\ndcccd\ndcccd\nbbbbb\ne.e.e`, { a: 'ink1', b: 'grn4', c: 'cyn5', d: 'vio4', e: 'snd6' }],
  // white cleanroom block with exhaust stacks
  fab: [`a...a.\na.a.a.\nbbbbbb\nbcbcbc\nbbbbbb`, { a: 'ink6', b: 'ice2', c: 'cyn3' }],
  // rows of lit halls
  campus: [`.aa.aa.\naaaaaaa\nacacaca\naaaaaaa\nacacaca`, { a: 'ink2', c: 'yel1' }],
};

export type FacilityIconState = 'online' | 'building' | 'upgrade';

/**
 * A facility glyph with its 1px outline. Construction shows a tiny crane over the glyph
 * (`crane`), or Act I's hazard tape when `crane` is false. Tier 2/3 adds one/two gold pips.
 */
export function facilityIconCanvas(type: FacilityType, state: FacilityIconState = 'online', tier = 1, crane = true): PixelCanvas {
  const [rows, map] = FAC_ICONS[type];
  const pc = PixelCanvas.from(rows, map);
  if (state !== 'online' && !crane) {
    // Act I look: hazard-tape bottom edge
    for (let i = 0; i < pc.w; i++) if (i % 2 === 0) pc.set(i, pc.h - 1, C.yel0);
  }
  if (state === 'building' && crane) {
    // unfinished: the top rows are still scaffolding
    for (let y = 0; y < 2; y++) for (let x = 0; x < pc.w; x++) if (pc.get(x, y)) pc.set(x, y, (x + y) % 2 ? C.ink4 : 0);
  }
  const withCrane = state !== 'online' && crane;
  const top = withCrane ? 3 : 0;
  const out = new PixelCanvas(pc.w + 2 + (withCrane ? 2 : 0), pc.h + 2 + top);
  out.blit(pc, 1, 1 + top);
  if (withCrane) {
    // mast on the right, jib across the top with a counterweight, hook line over the glyph
    const mx = pc.w + 2;
    for (let y = 1; y < out.h - 1; y++) out.set(mx, y, y % 2 ? C.yel0 : C.org1);
    for (let x = 2; x <= mx + 1; x++) out.set(x, 1, C.yel0);
    out.set(mx + 1, 1, C.ink6);
    out.set(3, 2, C.ink8);
    out.set(3, 3, C.ink8);
  }
  out.outline(C.ink0);
  if (tier >= 2) {
    // gold pips in the top-left corner of the frame
    out.set(0, top, C.yel0);
    if (tier >= 3) out.set(0, top + 2, C.yel0);
  }
  return out;
}

export function facilityIconTexture(type: FacilityType, building: boolean, opts: { upgrade?: boolean; tier?: number; crane?: boolean } = {}): Texture {
  const state: FacilityIconState = building ? 'building' : opts.upgrade ? 'upgrade' : 'online';
  const tier = opts.tier ?? 1;
  const crane = opts.crane ?? false;
  return cachedTexture(`fi:${type}:${state}:${tier}:${crane}`, () => facilityIconCanvas(type, state, tier, crane));
}

// ── Act II map markers ───────────────────────────────────────────────────────────────────────

/** Rival colour ramps [dark, base, light] by rival id. */
export const RIVAL_RAMP: Record<string, [ColorKey, ColorKey, ColorKey]> = {
  meridian: ['red1', 'red3', 'org0'],
  lattice: ['vio2', 'vio4', 'vio5'],
  orchard: ['grn3', 'grn5', 'grn7'],
};
const rivalRamp = (owner: string): [ColorKey, ColorKey, ColorKey] => RIVAL_RAMP[owner] ?? ['ink4', 'ink6', 'ink8'];

/** The main colour for a rival (map markers, ships, UI accents). */
export function rivalColor(owner: string): ColorKey {
  return rivalRamp(owner)[1];
}

/** A rival campus: a pennant over a hall in the rival's colours. Under construction it is hollow. */
export function rivalCampusCanvas(owner: string, building: boolean): PixelCanvas {
  const [dk, base, lt] = rivalRamp(owner);
  const pc = PixelCanvas.from(
    `
    .ab..
    .abb.
    .a...
    ccccc
    cdcdc
    ccccc
  `,
    building ? { a: 'ink6', b: dk, c: 'ink5', d: 'ink3' } : { a: 'ink8', b: lt, c: base, d: 'yel1' },
  );
  if (building) {
    pc.set(1, 3, C.ink3);
    pc.set(3, 3, C.ink3);
  }
  const out = new PixelCanvas(pc.w + 2, pc.h + 2);
  out.blit(pc, 1, 1);
  out.outline(C.ink0);
  return out;
}
export function rivalCampusTexture(owner: string, building: boolean): Texture {
  return cachedTexture(`rival:${owner}:${building}`, () => rivalCampusCanvas(owner, building));
}

/** A cable landing station: a small node; bright when it is part of your network. */
export function landingCanvas(active: boolean, hover = false): PixelCanvas {
  return PixelCanvas.from(
    `
    .aaa.
    abbba
    abcba
    abbba
    .aaa.
  `,
    active ? { a: 'ink0', b: hover ? 'cyn6' : 'cyn4', c: 'white' } : { a: 'ink0', b: hover ? 'ink9' : 'ink6', c: hover ? 'yel1' : 'cyn5' },
  );
}
export function landingTexture(active: boolean, hover = false): Texture {
  return cachedTexture(`landing:${active}:${hover}`, () => landingCanvas(active, hover));
}

const MATERIAL_COLOR: Record<string, [ColorKey, ColorKey]> = {
  lithium: ['cyn3', 'cyn6'],
  copper: ['snd3', 'org1'],
  helium: ['blu4', 'sky4'],
  neon: ['red2', 'pnk0'],
};

/** A mine or gas works: an ore cart heaped with the material's colour; a pennant when you hold a stake. */
export function mineCanvas(material: string, owned: boolean, hover = false): PixelCanvas {
  const [oreDk, ore] = MATERIAL_COLOR[material] ?? ['ink5', 'ink8'];
  const pc = PixelCanvas.from(
    `
    .de.d..
    deddde.
    aaaaaaa
    .abbba.
    ..c.c..
  `,
    { a: hover ? 'white' : 'ink8', b: hover ? 'ink6' : 'ink4', c: 'ink1', d: oreDk, e: ore },
  );
  const top = owned ? 3 : 0;
  const out = new PixelCanvas(pc.w + (owned ? 4 : 2), pc.h + 2 + top);
  out.blit(pc, 1, 1 + top);
  if (owned) {
    // your stake: a pennant planted on the heap
    const px = pc.w + 1;
    for (let y = 1; y < 6; y++) out.set(px, y, C.ink9);
    out.set(px + 1, 1, C.cyn5);
    out.set(px + 1, 2, C.cyn5);
  }
  out.outline(C.ink0);
  return out;
}
export function mineTexture(material: string, owned: boolean, hover = false): Texture {
  return cachedTexture(`mine:${material}:${owned}:${hover}`, () => mineCanvas(material, owned, hover));
}

/** Candidate marker for a retired reactor that can be restarted: a cold, grey cooling tower. */
export function restartSiteCanvas(hover: boolean): PixelCanvas {
  const pc = PixelCanvas.from(
    `
    .aab.
    ..ab.
    .aab.
    aaabb
  `,
    { a: hover ? 'yel1' : 'ink7', b: hover ? 'org2' : 'ink5' },
  );
  const out = new PixelCanvas(pc.w + 2, pc.h + 2);
  out.blit(pc, 1, 1);
  out.outline(C.ink0);
  return out;
}
export function restartSiteTexture(hover: boolean): Texture {
  return cachedTexture(`restartsite:${hover}`, () => restartSiteCanvas(hover));
}

/** Candidate marker for a megasite: a bigger, greener version of the plot diamond. */
export function megasiteCanvas(hover: boolean): PixelCanvas {
  return mapRim(
    PixelCanvas.from(
      `
      ...a...
      ..aba..
      .abcba.
      abc.cba
      .abcba.
      ..aba..
      ...a...
    `,
      { a: hover ? 'white' : 'ink8', b: hover ? 'yel1' : 'grn6', c: 'ink1' },
    ),
  );
}
export function megasiteTexture(hover: boolean): Texture {
  return cachedTexture(`megasite:${hover}`, () => megasiteCanvas(hover));
}

/** Where a cable is cut: a red cross. */
export function cutMarkCanvas(): PixelCanvas {
  const pc = PixelCanvas.from(
    `
    a...a
    .a.a.
    ..b..
    .a.a.
    a...a
  `,
    { a: 'red3', b: 'yel1' },
  );
  const out = new PixelCanvas(7, 7);
  out.blit(pc, 1, 1);
  out.outline(C.ink0, true);
  return out;
}
export function cutMarkTexture(): Texture {
  return cachedTexture('cutmark', cutMarkCanvas);
}

/** Cable ship: white hull with a cable drum, laying or repairing a cable. */
export function cableShipCanvas(): PixelCanvas {
  return PixelCanvas.from(
    `
    ..b....
    .bcb.d.
    aaaaaaa
    .aaaaa.
  `,
    { a: 'ink9', b: 'org1', c: 'ink3', d: 'yel0' },
  );
}
export function cableShipTexture(): Texture {
  return cachedTexture('cableship', cableShipCanvas);
}

/** A cosmetic cargo ship with containers in one colour. */
export function cargoShipCanvas(cargo: ColorKey, hull: ColorKey = 'ink4'): PixelCanvas {
  return PixelCanvas.from(
    `
    ....d..
    .bcbd..
    aaaaaaa
    .aaaaa.
  `,
    { a: hull, b: cargo, c: 'ink8', d: 'white' },
  );
}
export function cargoShipTexture(cargo: ColorKey, hull: ColorKey = 'ink4'): Texture {
  return cachedTexture(`cargo:${cargo}:${hull}`, () => cargoShipCanvas(cargo, hull));
}

export function shipCanvas(): PixelCanvas {
  return PixelCanvas.from(
    `
      ...cd..
      .bcdcb.
      aaaaaaa
      .aaaaa.
    `,
    { a: 'red2', b: 'cyn4', c: 'org1', d: 'yel0' },
  );
}
export function shipTexture(): Texture {
  return cachedTexture('ship', shipCanvas);
}

export function planeTexture(): Texture {
  return cachedTexture('plane', () =>
    PixelCanvas.from(
      `
      ..a....
      ..aa...
      aaaaaab
      ..aa...
      ..a....
    `,
      { a: 'white', b: 'ink6' },
    ),
  );
}

export function chokepointCanvas(closed: boolean): PixelCanvas {
  const pc = PixelCanvas.from(
    `
      ..a..
      .a.a.
      ..a..
      a.a.a
      .aaa.
    `,
    { a: closed ? 'red3' : 'ink8' },
  );
  if (closed) {
    pc.set(0, 0, C.red3);
    pc.set(4, 0, C.red3);
  }
  const out = new PixelCanvas(7, 7);
  out.blit(pc, 1, 1);
  out.outline(C.ink0);
  return out;
}
export function chokepointTexture(closed: boolean): Texture {
  return cachedTexture(`choke:${closed}`, () => chokepointCanvas(closed));
}

/** Animated selection brackets (frame 0/1), rimmed dark so they show on snow and sand too. */
export function selectionTexture(frame: number): Texture {
  return cachedTexture(`sel:${frame}`, () => {
    const n = 15 + frame * 2;
    const pc = new PixelCanvas(n, n);
    const L = 4;
    const col = frame ? C.yel1 : C.white;
    for (const [x, y, dx, dy] of [[0, 0, 1, 1], [n - 1, 0, -1, 1], [0, n - 1, 1, -1], [n - 1, n - 1, -1, -1]] as const) {
      for (let i = 0; i < L; i++) {
        pc.set(x + dx * i, y, col);
        pc.set(x, y + dy * i, col);
      }
    }
    return mapRim(pc);
  });
}

/** Soft, irregular pixel cumulus for the map (variant 0..5). */
export function cloudTexture(variant: number, shadow: boolean): Texture {
  return cachedTexture(`cloud:${variant}:${shadow}`, () => {
    const w = 12 + (variant % 3) * 5;
    const h = 7 + (variant % 2) * 2;
    const pc = new PixelCanvas(w, h);
    const base = h - 2;
    // a flat-ish base with a few puffs of different sizes on top
    pc.ellipse(w / 2, base, w / 2 - 1, 1.6, shadow ? C.ink0 : C.ice2);
    const puffs = 2 + (variant % 3);
    for (let b = 0; b < puffs; b++) {
      const t = (b + 0.5) / puffs;
      const cx = 2 + t * (w - 4) + (hash2(variant, b, 1) - 0.5) * 2;
      const r = 1.6 + hash2(variant, b, 3) * (h / 2 - 1.2) * (1 - Math.abs(t - 0.5));
      pc.ellipse(cx, base - r * 0.7, r * 1.15, r, shadow ? C.ink0 : C.ice2);
    }
    if (!shadow) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!pc.get(x, y)) continue;
          if (!pc.get(x, y - 1) || !pc.get(x - 1, y)) pc.set(x, y, C.white);
          else if (!pc.get(x, y + 1)) pc.set(x, y, C.ice1);
        }
      }
    }
    return pc;
  });
}

/** 1×1 white pixel — tinted for dots and particles. */
export function pixelTexture(): Texture {
  return cachedTexture('px', () => {
    const pc = new PixelCanvas(1, 1);
    pc.set(0, 0, C.white);
    return pc;
  });
}
