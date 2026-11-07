/**
 * The dock's icons (v0.9.3): 13×13 art plus a dark outline = 15×15, so there are nearly three times the pixels of
 * the 9×9 UI icons and every button gets a real silhouette: a chip, a parcel, a flask, coins, a handshake, a gear.
 * Light comes from the top left; each icon keeps one colour family so the dock reads at a glance. The outline is
 * added here (4-neighbour, so corners come out rounded), never drawn by hand.
 *
 * Drawn by `DockIcon` (Dock.tsx) at a whole number of device pixels per art pixel. The classic interface look
 * keeps the old 9×9 icons.
 */
import { PixelCanvas } from '../render/pixels';
import { C, type ColorKey } from '../render/palette';

export const DOCK_ART = 13;
export const DOCK_SIZE = DOCK_ART + 2;

type Draw = (p: PixelCanvas) => void;
type Map = Record<string, ColorKey>;

/** A hand-drawn grid: one string per row, '.' is empty. */
const grid =
  (rows: string[], map: Map): Draw =>
  (p) =>
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const k = map[row[x]];
        if (k) p.set(x, y, C[k]);
      }
    });

/** Paint every pixel whose centre lies within r of (cx, cy) with what `col` returns (null = leave it). */
function disc(p: PixelCanvas, cx: number, cy: number, r: number, col: (dx: number, dy: number, d: number) => ColorKey | null) {
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d <= r) {
        const k = col(dx, dy, d);
        if (k) p.set(x, y, C[k]);
      }
    }
}

/** Light on a sphere from the top left: 1 = lit, 0 = in shadow. */
const lit = (dx: number, dy: number, r: number) => {
  const nx = dx / r;
  const ny = dy / r;
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return Math.max(0, -0.55 * nx - 0.6 * ny + 0.58 * nz);
};

const ramp = (t: number, keys: ColorKey[]) => keys[Math.max(0, Math.min(keys.length - 1, Math.floor(t * keys.length)))];

/**
 * A solid shape ('#'; any other letter is painted from `extra`) bevelled from its own mask: edges facing the light
 * (top, left) one step up the ramp, both lit = two, edges facing away (bottom, right) one step down.
 * ramp = [shadow, base, light, highlight].
 */
const bevel =
  (rows: string[], r: [ColorKey, ColorKey, ColorKey, ColorKey], extra: Map = {}): Draw =>
  (p) => {
    const solid = (x: number, y: number) => {
      const ch = rows[y]?.[x];
      return !!ch && ch !== '.';
    };
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        if (ch !== '#') {
          const k = extra[ch];
          if (k) p.set(x, y, C[k]);
          continue;
        }
        const litUp = !solid(x, y - 1);
        const litLeft = !solid(x - 1, y);
        const dark = !solid(x, y + 1) || !solid(x + 1, y);
        const t = litUp && litLeft ? 3 : litUp || litLeft ? 2 : 1;
        p.set(x, y, C[r[dark && t < 3 ? t - 1 : t]]);
      }
    });
  };

const ICONS: Record<string, Draw> = {
  // Compute: a chip, silver pins round a teal package, a glowing die
  compute: grid(
    [
      '...p.p.p.p...',
      '...q.q.q.q...',
      '..hhhhhhhhh..',
      'pqhbbbbbbbsqp',
      '..hbdddddbs..',
      'pqhbdgggdbsqp',
      '..hbdgwgdbs..',
      'pqhbdgggdbsqp',
      '..hbdddddbs..',
      'pqhbbbbbbbsqp',
      '..sssssssss..',
      '...q.q.q.q...',
      '...p.p.p.p...',
    ],
    { p: 'ink8', q: 'ink6', h: 'cyn5', b: 'cyn3', s: 'cyn2', d: 'ink1', g: 'cyn4', w: 'cyn6' },
  ),
  // Orders: a taped parcel, ready to ship
  orders: grid(
    [
      '.....TTT.....',
      '...TTkkTTT...',
      '.TTTTTkkTTTT.',
      'tTTTTTTkkTTTr',
      'LtTTTTTTkkTrR',
      'LLLtTTTTTrRRR',
      'LwwwLtTrRRkRR',
      'LwwwLLtRRRkRR',
      'LLLLLLtRRRkRR',
      'LLLLLLtRRRkRR',
      '..LLLLtRRRk..',
      '....LLtRR....',
      '......t......',
    ],
    { T: 'snd6', k: 'snd8', t: 'snd7', L: 'snd4', R: 'snd3', r: 'snd5', w: 'ink9' },
  ),
  // Research: a flask of bubbling violet
  research: grid(
    [
      '....rrrrr....',
      '.....geg.....',
      '.....geg.....',
      '.....gwg.....',
      '....gweeg....',
      '...gweeeeg...',
      '...gllllbg...',
      '..gvvvvvvvg..',
      '..gvbvvvvvg..',
      '.gvvvvvbvvvg.',
      '.gvvvvvvvvvg.',
      'gVVVVVVVVVVVg',
      'ggggggggggggg',
    ],
    { r: 'ink8', g: 'ice1', e: 'blu1', w: 'white', l: 'vio5', v: 'vio4', V: 'vio3', b: 'pnk1' },
  ),
  // Finance: a gold coin stamped with a bold $, a glint on its rim
  finance: (p) => {
    disc(p, 6.5, 6.5, 6.4, (dx, dy, d) => (d > 5.5 ? (dx + dy > 0.5 ? 'snd4' : 'org2') : d > 4.6 ? (dx + dy > 0.5 ? 'org2' : 'yel1') : lit(dx, dy, 6.4) > 0.6 ? 'yel1' : 'yel0'));
    grid(
      ['', '', '......s......', '....ssss.....', '...ss.s......', '....sss......', '......sss....', '......s.ss...', '....ssss.....', '......s......', '', '', ''],
      { s: 'snd3' },
    )(p);
    grid(['', '..w..........', '.www.........', '..w..........'], { w: 'yel2' })(p);
  },
  // Stats: three bars rising and the trend over them
  chart: grid(
    [
      '..........ww.',
      '.......llw.w.',
      '....lll..ww..',
      '..ll.........',
      '.l.......vv..',
      '.........vV..',
      '.....yy..vV..',
      '.....yY..vV..',
      '.cc..yY..vV..',
      '.cC..yY..vV..',
      '.cC..yY..vV..',
      '.cC..yY..vV..',
      'aaaaaaaaaaaaa',
    ],
    { c: 'cyn5', C: 'cyn3', y: 'yel0', Y: 'org2', v: 'vio5', V: 'vio3', a: 'ink7', l: 'ink9', w: 'white' },
  ),
  // Team: three people, the one in front in orange
  team: grid(
    [
      '.....hhh.....',
      '.hh.hhhhh.hh.',
      'hhhhhfffhhhhh',
      'FFFhfefefhFFF',
      'FFF.fffff.FFF',
      '.F...fff...F.',
      'bbbb.ooo.bbbb',
      'bBbbOoooooBbb',
      'bbbOoooooooBb',
      'bbOoooooooooB',
      'bbOoooooooooB',
      'bbOoooooooooB',
      'bbOoooooooooB',
    ],
    { h: 'snd2', f: 'skn5', e: 'ink2', F: 'skn3', o: 'org1', O: 'org2', b: 'blu3', B: 'blu4' },
  ),
  // Deals: a handshake, a blue cuff and an orange one
  deal: grid(
    [
      '.............',
      '.............',
      'bb.........oo',
      'bBb.......oOo',
      'bBbwffff.woOo',
      'bBwfffffffwOo',
      'bBbwfFfFfFfOo',
      '.bb.fkfkfkfoo',
      '.....fkfkff..',
      '......fff....',
      '.............',
      '.............',
      '.............',
    ],
    { b: 'blu4', B: 'blu5', o: 'org1', O: 'org2', w: 'white', f: 'skn5', F: 'skn4', k: 'skn3' },
  ),
  // Blocs: two flags on their poles, blue and red
  blocs: grid(
    [
      '.y...........',
      '.pbbbb.......',
      '.pBBBbb......',
      '.pwwwww.y....',
      '.pbbbbb.pRRRR',
      '.p..bbb.pRrRR',
      '.p......prrrr',
      '.p......pRRRR',
      '.p......p..RR',
      '.p......p....',
      '.p......p....',
      'qqqq...qqqq..',
      '.............',
    ],
    { y: 'yel0', b: 'blu4', B: 'blu5', w: 'white', R: 'red3', r: 'red2', p: 'ink8', q: 'ink6' },
  ),
  // Goals: a target with an arrow home in the gold
  goals: (p) => {
    disc(p, 6, 7, 5.6, (dx, dy, d) => {
      const band = Math.floor(d / 1.25);
      const shade = dx + dy > 2.5 && d > 4.4;
      if (band === 0) return 'yel0';
      return band % 2 ? (shade ? 'ink7' : 'ink9') : shade ? 'red2' : 'red3';
    });
    grid(
      [
        '..........f.f',
        '.........sff.',
        '........s.f.f',
        '.......s.....',
        '......s......',
        '.....s.......',
        '.....s.......',
      ],
      { f: 'org1', s: 'ink1' },
    )(p);
  },
  // Field Guide: an open book, teal covers, a ribbon
  guide: grid(
    [
      '.............',
      '.............',
      '.ww.......ww.',
      'wPPww.r.wwPPw',
      'wPllPPrPPllPw',
      'wPPPPPrPPPPPw',
      'wPllPPrPllPPw',
      'wPPPPPrPPPPPw',
      'wPlllPrPlllPw',
      'wPPPPPsPPPPPw',
      'cwwwwPsPwwwwc',
      'cccccc.cccccc',
      '.....CCC.....',
    ],
    { w: 'ink9', P: 'snd8', l: 'ink6', r: 'red3', s: 'snd5', c: 'cyn3', C: 'cyn2' },
  ),
  // News: the front page, masthead, headline, a photo
  news: grid(
    [
      'mmmmmmmmmmm..',
      'mMMMMMMMMMmw.',
      'wwwwwwwwwwwww',
      'wHHHHHHHHHwgw',
      'wHHHHHHHHHwgw',
      'wwwwwwwwwwwgw',
      'wppppwllllwgw',
      'wpssPwwwwwwgw',
      'wpssPwllllwgw',
      'wPPPPwwwwwwgw',
      'wllllllllllgw',
      'wwwwwwwwwwwgw',
      '.gggggggggggg',
    ],
    { m: 'red3', M: 'red2', w: 'ink9', H: 'ink3', p: 'sky4', s: 'yel1', P: 'blu4', l: 'ink6', g: 'ink6' },
  ),
  // The Charter: a small Earth in a gold sunburst (the map's HQ emblem)
  charter: (p) => {
    grid(
      [
        '......y......',
        '..y...y...y..',
        '...y.....y...',
        '.............',
        '.............',
        '.............',
        'yy.........yy',
        '.............',
        '.............',
        '.............',
        '...y.....y...',
        '..y...y...y..',
        '......y......',
      ],
      { y: 'yel0' },
    )(p);
    disc(p, 6.5, 6.5, 4.6, (_dx, _dy, d) => (d > 3.6 ? 'org2' : null));
    disc(p, 6.5, 6.5, 3.6, (dx, dy) => {
      const land = (dx > -2.2 && dx < 0.4 && dy < 0.8 && dy > -2.4) || (dx > 0.8 && dy > 0.2 && dy < 2.6 && dx < 2.8);
      const l = lit(dx, dy, 3.6);
      return land ? (l > 0.5 ? 'grn6' : 'grn5') : l > 0.55 ? 'sea7' : l > 0.25 ? 'sea6' : 'sea5';
    });
  },
  // The Council: a marble hall, its seal in the pediment
  council: grid(
    [
      '......w......',
      '....wwwww....',
      '..wwwwywwww..',
      'wwwwwwwwwwwwg',
      'ggggggggggggg',
      '.wg.wg.wg.wg.',
      '.wg.wg.wg.wg.',
      '.wg.wg.wg.wg.',
      '.wg.wg.wg.wg.',
      '.wg.wg.wg.wg.',
      'wwwwwwwwwwwwg',
      'ggggggggggggg',
      'ddddddddddddd',
    ],
    { w: 'ink9', g: 'ink7', y: 'yel0', d: 'ink6' },
  ),
  // The Planet: the Earth, lit from the top left
  globe: (p) => {
    const land = [
      '.............',
      '.....GG......',
      '...GGGGG.....',
      '..GGGGG...G..',
      '..GGGG....GG.',
      '...GGG...GGG.',
      '....GG...GG..',
      '.....G.......',
      '.....GG...G..',
      '......GG.GG..',
      '......G......',
      '.............',
      '.............',
    ];
    disc(p, 6.5, 6.5, 6.4, (dx, dy, d) => {
      const x = Math.floor(dx + 6.5);
      const y = Math.floor(dy + 6.5);
      const l = lit(dx, dy, 6.4);
      if (d > 5.9 && l < 0.2) return 'sea3';
      if (land[y]?.[x] === 'G') return l > 0.55 ? 'grn7' : l > 0.25 ? 'grn6' : 'grn4';
      return l > 0.7 ? 'sea8' : l > 0.45 ? 'sea7' : l > 0.2 ? 'sea6' : 'sea5';
    });
  },
  // The System: the Sun and its swarm of collectors on a tilted orbit
  swarm: (p) => {
    const orbit = (front: boolean) => {
      for (let a = 0; a < 64; a++) {
        const t = (a / 64) * Math.PI * 2;
        if (Math.sin(t) > 0 !== front) continue;
        const x = Math.floor(6.5 + Math.cos(t) * 6.3);
        const y = Math.floor(6.5 + Math.sin(t) * 3.4);
        const collector = a % 8 === 2;
        if (collector || !p.get(x, y)) p.set(x, y, C[collector ? 'cyn6' : front ? 'cyn4' : 'cyn2']);
      }
    };
    orbit(false);
    disc(p, 6.5, 6.5, 3.9, (dx, dy, d) => (d > 3.2 ? 'org0' : ramp(lit(dx, dy, 3.9), ['org1', 'org2', 'yel0', 'yel1', 'yel2'])));
    for (const [x, y] of [[6, 0], [6, 1], [0, 6], [12, 6], [6, 12], [6, 11], [2, 2], [10, 2], [2, 10], [10, 10]]) if (!p.get(x, y)) p.set(x, y, C.yel0);
    orbit(true);
  },
  // The transmission line tool: a lattice pylon, its insulators live
  link: bevel(
    [
      '......#......',
      '.....###.....',
      '.###########.',
      '.y...#.#...y.',
      '.y...#.#...y.',
      '..#########..',
      '..y..#.#..y..',
      '..y..#.#..y..',
      '....#...#....',
      '....#####....',
      '...#.....#...',
      '..#.......#..',
      '.#.........#.',
    ],
    ['ink6', 'ink7', 'ink8', 'ink9'],
    { y: 'yel0' },
  ),
  // The fiber tool: a cable's end firing strands of light
  fiber: (p) => {
    const rays: [number, number, ColorKey][] = [
      [1, 1, 'white'],
      [5, 0, 'pnk0'],
      [9, 0, 'cyn5'],
      [12, 3, 'yel1'],
    ];
    for (const [x, y, c] of rays) p.line(7, 5, x, y, C[c]);
    for (let i = 0; i < 7; i++) {
      p.set(6 - i, 7 + i, C.vio4);
      p.set(5 - i, 7 + i, C.vio3);
      p.set(7 - i, 7 + i, C.vio5);
      p.set(6 - i, 8 + i, C.vio2);
    }
    grid(['', '', '', '', '', '......ww.', '.....wiww', '......ii.'], { w: 'ink9', i: 'ink7' })(p);
  },
  // How to play: a question in a teal bubble
  help: (p) => {
    disc(p, 6.5, 6.2, 6.1, (dx, dy) => ramp(lit(dx, dy, 6.1), ['cyn2', 'cyn3', 'cyn4', 'cyn5']));
    grid(
      ['', '', '', '....www......', '...ww.ww.....', '......ww.....', '.....ww......', '.....w.......', '', '.....ww......', '', '', '..c..........'],
      { w: 'white', c: 'cyn2' },
    )(p);
    grid(['', '', '', '.....www.....', '....ww.ww....', '.......ww....', '......ww.....', '......ww.....', '.............', '......ww.....'], { w: 'white' })(p);
    // a tail under the bubble
    grid(['', '', '', '', '', '', '', '', '', '', '', '...cc........', '..cc.........'], { c: 'cyn3' })(p);
  },
  // Settings: a steel gear
  settings: bevel(
    [
      '.....###.....',
      '..#..###..#..',
      '.###########.',
      '..#########..',
      '..###...###..',
      '####.....####',
      '####.....####',
      '####.....####',
      '..###...###..',
      '..#########..',
      '.###########.',
      '..#..###..#..',
      '.....###.....',
    ],
    ['ink5', 'ink7', 'ink8', 'ink9'],
  ),
};

export type DockIconName = keyof typeof ICONS;
export const DOCK_ICON_NAMES = Object.keys(ICONS) as DockIconName[];
export const hasDockIcon = (name: string): name is DockIconName => name in ICONS;

/** The 15×15 dock icon: the art, then its outline. */
export function dockIconCanvas(name: DockIconName): PixelCanvas {
  const art = new PixelCanvas(DOCK_ART, DOCK_ART);
  ICONS[name](art);
  const out = new PixelCanvas(DOCK_SIZE, DOCK_SIZE);
  const ink = C.ink0;
  for (let y = 0; y < DOCK_SIZE; y++)
    for (let x = 0; x < DOCK_SIZE; x++) {
      const c = art.get(x - 1, y - 1);
      if (c) out.set(x, y, c);
      else if (art.get(x - 2, y - 1) || art.get(x, y - 1) || art.get(x - 1, y - 2) || art.get(x - 1, y)) out.set(x, y, ink);
    }
  return out;
}
