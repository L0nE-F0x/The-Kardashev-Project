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

/** Marker for one of the player's sites. */
export function sitePinTexture(color: ColorKey): Texture {
  return cachedTexture(`pin:${color}`, () => PixelCanvas.from(PIN, { a: 'ink0', b: color, c: 'white' }));
}

export function homeTexture(): Texture {
  return cachedTexture('home', () => PixelCanvas.from(HOUSE, { a: 'ink0', b: 'yel0', c: 'org2', d: 'snd3' }));
}

export function candidateTexture(hover: boolean): Texture {
  return cachedTexture(`cand:${hover}`, () => PixelCanvas.from(DIAMOND, { a: hover ? 'white' : 'ink8', b: hover ? 'yel1' : 'ink1' }));
}

export function supplierTexture(color: ColorKey): Texture {
  return cachedTexture(`chip:${color}`, () => PixelCanvas.from(CHIP, { a: 'ink0', b: color, c: 'ink2', d: 'ink8' }));
}

export function cloudMarkTexture(): Texture {
  return cachedTexture('cloudmark', () => PixelCanvas.from(CLOUD_MARK, { a: 'ink0', b: 'blu6' }));
}

const FAC_ICONS: Record<FacilityType, [string, Map]> = {
  datacenter: [`aaaaa\nabcba\naaaaa\nabcba\naaaaa`, { a: 'ink2', b: 'cyn5', c: 'ink5' }],
  solar: [`bbbbb\nbcbcb\nbbbbb\n..a..\n.aaa.`, { a: 'ink7', b: 'blu3', c: 'sky4' }],
  wind: [`b...b\n.b.b.\n..a..\n..a..\n..a..`, { a: 'white', b: 'ink9' }],
  battery: [`.aaa.\nabbba\nabcba\nabbba\naaaaa`, { a: 'ink1', b: 'grn5', c: 'yel1' }],
  gas: [`..b..\n.bcb.\n.bcb.\nbcccb\n.bbb.`, { a: 'ink1', b: 'org1', c: 'yel0' }],
  lab: [`.aaa.\n..a..\n.aba.\nabbba\naaaaa`, { a: 'ink9', b: 'vio4' }],
  hq: [`..a..\n.aaa.\naaaaa\n.b.b.\n.bbb.`, { a: 'yel0', b: 'snd5' }],
};

export function facilityIconTexture(type: FacilityType, building: boolean): Texture {
  return cachedTexture(`fi:${type}:${building}`, () => {
    const [rows, map] = FAC_ICONS[type];
    const pc = PixelCanvas.from(rows, map);
    if (building) {
      // hazard-tape corner to show construction
      for (let i = 0; i < pc.w; i++) if (i % 2 === 0) pc.set(i, pc.h - 1, C.yel0);
    }
    const out = new PixelCanvas(pc.w + 2, pc.h + 2);
    out.blit(pc, 1, 1);
    out.outline(C.ink0);
    return out;
  });
}

export function shipTexture(): Texture {
  return cachedTexture('ship', () =>
    PixelCanvas.from(
      `
      ...cd..
      .bcdcb.
      aaaaaaa
      .aaaaa.
    `,
      { a: 'red2', b: 'cyn4', c: 'org1', d: 'yel0' },
    ),
  );
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

export function chokepointTexture(closed: boolean): Texture {
  return cachedTexture(`choke:${closed}`, () => {
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
  });
}

/** Animated selection brackets (frame 0/1). */
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
    return pc;
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
