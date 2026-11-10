/**
 * The dock's icons: the panel buttons down the left edge, and How to Play's panel list. Vector art on a 32×32 grid
 * (art3d/INTERFACE.md), built with iconKit.ts like the small icons (icons.ts) but a little richer: a third tone, a
 * glint, one more detail. Same names as the small icons, so a panel's button and its header show the same subject.
 * Light comes from the upper left; each icon keeps one colour family so the dock reads at a glance.
 *
 * Shown at about 24–34 px (`DockIcon`). Check them on the sheet: /play/icons.html?group=dock. No DOM here.
 */
import { T, ball, box, clip, earth, flip, gearPath, l, o, p, poly, r, ring, rot, svg, svgUrl, torus, type Shape, type Tone, type Tones } from './iconKit';

const all = (tone: Tone): Shape => r(tone, 0, 0, 32, 32);

/** Head and shoulders, shaded: the head (radius hr) at (x, y), the shoulders w wide down to `foot`. */
const bust = (x: number, y: number, hr: number, w: number, foot: number, skin: Tones, [lit, base, shade]: Tones): Shape[] => {
  const top = y + hr + 1;
  const d = `M${x - w / 2} ${foot}A${w / 2} ${foot - top} 0 0 1 ${x + w / 2} ${foot}Z`;
  return [ball(skin, x, y, hr, false), clip(p(base, d), all(shade), o(base, x - w * 0.14, foot - (foot - top) * 0.24, w * 0.54), o(lit, x - w * 0.2, top + (foot - top) * 0.3, w * 0.2, (foot - top) * 0.16))];
};

/** A flag flying to the right of a pole at x, its top edge at y: lit along the top, a shaded fold down the middle. */
const flag = (x: number, y: number, w: number, h: number, [lit, base, shade]: Tones): Shape =>
  clip(
    p(base, `M${x} ${y + 0.8}C${x + w * 0.3} ${y - 1.2} ${x + w * 0.6} ${y + 2.2} ${x + w} ${y + 0.6}V${y + h}C${x + w * 0.6} ${y + h + 1.6} ${x + w * 0.3} ${y + h - 1.8} ${x} ${y + h + 0.2}Z`),
    all(base),
    r(lit, 0, 0, 32, y + h * 0.42),
    r(shade, x + w * 0.52, 0, w * 0.26, 32),
  );

const PARCEL = '16,4.2 27.6,9.8 27.6,22.4 16,28 4.4,22.4 4.4,9.8';
const FLASK = 'M12.6 3.6H19.4V11.6L27 24.6A2.6 2.6 0 0 1 24.8 28.6H7.2A2.6 2.6 0 0 1 5 24.6L12.6 11.6Z';
const PAGE = 'M3.8 7.2C8.4 5.6 12.8 6.4 16 8.8V26.2C12.8 23.8 8.4 23 3.8 24.6Z';
const BUBBLE = 'M8 3.6H24A5 5 0 0 1 29 8.6V18.4A5 5 0 0 1 24 23.4H15L8.4 29V23.4H8A5 5 0 0 1 3 18.4V8.6A5 5 0 0 1 8 3.6Z';
/** One of the swarm's collectors: a diamond `size` across, `dist` from the Sun at `deg` degrees. */
const collector = (deg: number, dist: number, tone: Tone, size: number): Shape => rot(deg, 16, 16, poly(tone, `16,${16 - dist - size} ${16 + size * 0.8},${16 - dist} 16,${16 - dist + size} ${16 - size * 0.8},${16 - dist}`, 0.7));

const ICONS = {
  // Compute: a chip, silver pins round a teal package, a glowing die
  compute: [
    l('ink8', 2.2, 'M10.4 3V8M14.1 3V8M17.9 3V8M21.6 3V8M3 10.4H8M3 14.1H8M3 17.9H8M3 21.6H8'),
    l('ink6', 2.2, 'M10.4 24V29M14.1 24V29M17.9 24V29M21.6 24V29M24 10.4H29M24 14.1H29M24 17.9H29M24 21.6H29'),
    box(['cyn4', 'cyn3', 'cyn2'], 6.4, 6.4, 19.2, 19.2, 3.4, 2.2, 2.6),
    box(['cyn6', 'cyn5', 'cyn4'], 11, 11, 10, 10, 1.7, 2, 1.6),
    o('white/85', 13.6, 13.4, 1.3),
    o('cyn5', 9.6, 22.4, 1),
  ],
  // Orders: a taped parcel, ready to ship
  orders: [
    clip(
      poly('snd6', PARCEL, 2.2),
      all('snd6'),
      p('snd7', 'M16 1L32 8.8L16 15.4L0 8.8Z'),
      p('snd4', 'M16 15.4L32 8.2V32H16Z'),
      p('snd8', 'M8.7 11.9L11.7 13.3L23.3 7.7L20.3 6.3Z'),
      p('snd7', 'M8.7 11.9L11.7 13.3V19.6L8.7 18.2Z'),
      p('snd8', 'M18.6 20.4L24.6 17.5V21.3L18.6 24.2Z'),
      l('yel2/60', 0.9, 'M4.4 9.8L16 15.4L27.6 9.8M16 15.4V28'),
    ),
  ],
  // Research: a flask of bubbling violet
  research: [
    clip(
      p('ice2', FLASK),
      all('ice2'),
      p('vio4', 'M0 18.4C5 16.6 9 19.6 16 18.2C22 17 27 19.4 32 17.6V32H0Z'),
      p('vio5', 'M0 18.4C5 16.6 9 19.6 13 18.7L9 32H0Z'),
      p('vio3', 'M22 17.4C26 17.6 29 18.8 32 17.6V32H24Z'),
      l('white', 1.6, 'M14.8 6.6V12.2L11.6 17.6'),
    ),
    r('ink9', 11, 2.4, 10, 3, 1.5),
    o('white', 13.4, 23.4, 1.8),
    o('pnk1', 18.8, 21.4, 1.3),
    o('vio5', 16.6, 25.6, 1),
  ],
  // Finance: a gold coin stamped with a bold $, a glint on its rim
  finance: [
    o('snd4', 16, 17.6, 12.6),
    ball(T.gold, 16, 15.2, 12.6),
    ring('snd6', 1.5, 16, 15.2, 9.5),
    l('snd4', 2.6, 'M19.6 11.8C19.6 9.9 18 9 16 9C13.8 9 12.3 10.2 12.3 11.9C12.3 13.9 14 14.5 16 14.9C18.1 15.3 19.8 16 19.8 18C19.8 19.8 18.2 20.9 16 20.9C13.8 20.9 12.2 19.9 12.2 18.1M16 6.8V23.4'),
    l('white/90', 1.6, 'M6.2 11.4A10.8 10.8 0 0 1 12.2 5.4'),
  ],
  // Stats: three bars rising and the trend over them
  chart: [
    box(['cyn6', 'cyn4', 'cyn3'], 4.4, 18.6, 6, 8.6, 1.4, 1.8, 0),
    box(['yel2', 'yel0', 'org2'], 13, 14, 6, 13.2, 1.4, 1.8, 0),
    box(['vio5', 'vio4', 'vio3'], 21.6, 9.6, 6, 17.6, 1.4, 1.8, 0),
    r('ink7', 2.6, 27, 26.8, 2.2, 1.1),
    l('white', 1.8, 'M5.4 13.6L12.4 8.8L17.6 10.4L25.4 4.4'),
    poly('white', '22.6,3.4 26.8,3 26.2,7.2', 1),
    o('grn7', 12.4, 8.8, 1.7),
    o('grn7', 17.6, 10.4, 1.7),
  ],
  // Team: three people, the one in front in orange
  team: [
    ...bust(7.6, 9.6, 3.6, 11, 24, ['skn4', 'skn3', 'skn2'], ['blu5', 'blu4', 'blu3']),
    ...bust(24.4, 9.6, 3.6, 11, 24, ['skn4', 'skn3', 'skn2'], ['blu5', 'blu4', 'blu3']),
    ...bust(16, 12, 4.8, 15.6, 28.4, ['skn6', 'skn5', 'skn4'], ['org2', 'org1', 'org0']),
  ],
  // Deals: a handshake, a blue cuff and an orange one
  deal: [
    box(['blu6', 'blu5', 'blu4'], 2, 9.4, 6.8, 13.2, 1.6, 2, 2.2),
    box(['org2', 'org1', 'org0'], 23.2, 9.4, 6.8, 13.2, 1.6, 2, 2.2),
    clip(r('skn3', 12.4, 10.8, 12.4, 10.4, 4.6), all('skn3'), r('skn2', 0, 18.4, 32, 6)),
    rot(-24, 13, 10, r('skn3', 10, 8.4, 7, 3.6, 1.8)),
    clip(r('skn5', 7.4, 10.8, 9.4, 10.4, 3.4), all('skn5'), r('skn6', 0, 0, 32, 13.2), r('skn4', 0, 19, 32, 6)),
    r('skn5', 13, 11.4, 7.4, 2.7, 1.35),
    r('skn5', 13, 14.6, 8.2, 2.7, 1.35),
    r('skn4', 13, 17.8, 7, 2.7, 1.35),
  ],
  // Blocs: two flags on their poles, blue and red
  blocs: [l('ink8', 2.4, 'M6 6V29'), o('yel0', 6, 4.6, 2), flag(7.2, 6.2, 10.8, 8.6, ['blu6', 'blu5', 'blu4']), l('ink7', 2.4, 'M18.4 12V29'), o('yel0', 18.4, 10.6, 2), flag(19.6, 12.2, 10, 8.2, ['org0', 'red3', 'red2'])],
  // Goals: a target with an arrow home in the gold
  goals: [
    ball(['org0', 'red3', 'red2'], 14.6, 17.4, 12.4, false),
    clip(o('white', 14.6, 17.4, 8.6), all('ink8'), o('white', 13.2, 16, 8.6)),
    clip(o('red3', 14.6, 17.4, 5.2), all('red2'), o('red3', 13.8, 16.6, 5.2)),
    o('yel0', 14.6, 17.4, 2.2),
    l('snd3', 2.2, 'M15 17L26.2 5.8'),
    p('cyn6', 'M23.6 8.4L26.6 5.4L25.75 2.85L22.75 5.85Z'),
    p('cyn4', 'M23.6 8.4L26.6 5.4L29.15 6.25L26.15 9.25Z'),
  ],
  // Field Guide: an open book, teal covers, a ribbon
  guide: [
    clip(r('cyn4', 1.8, 8.8, 28.4, 19, 2.4), all('cyn4'), r('cyn2', 0, 25.4, 32, 4)),
    p('white', PAGE),
    flip(16, p('ink9', PAGE)),
    p('ink7/60', 'M16 8.8C17.2 8 18.2 7.4 19.6 7V24.4C18.2 24.8 17.2 25.4 16 26.2Z'),
    l('ink6', 1.4, 'M6.4 11.2C9 10.6 11.2 11 13.2 12.2M6.4 15C9 14.4 11.2 14.8 13.2 16M6.4 18.8C9 18.2 11.2 18.6 13.2 19.8'),
    l('ink6', 1.4, 'M25.6 15C23.6 14.5 22.4 14.7 21.4 15.2M25.6 18.8C23.6 18.3 22.4 18.5 21.4 19'),
    p('red3', 'M22.4 6.2H25.6V13L24 11.4L22.4 13Z'),
  ],
  // News: the front page, masthead, headline, a photo
  news: [
    p('ink7', 'M21 10.4H26A2 2 0 0 1 28 12.4V24.6A3.4 3.4 0 0 1 21.2 24.6Z'),
    clip(p('ink9', 'M6 4.4H22A2 2 0 0 1 24 6.4V24.6A3.4 3.4 0 0 0 24.6 28H7.4A3.4 3.4 0 0 1 4 24.6V6.4A2 2 0 0 1 6 4.4Z'), all('ink9'), r('white', 0, 0, 32, 6.2), r('ink8', 0, 26, 32, 4)),
    r('ink3', 7, 8, 14, 3.4, 0.9),
    r('blu4', 7, 14, 6.6, 6.6, 1.1),
    p('blu6', 'M7 20.6L10 17.2L11.8 19L13.6 17.6V19.5A1.1 1.1 0 0 1 12.5 20.6Z'),
    o('yel0', 9.2, 16, 1),
    l('ink6', 1.6, 'M16.4 14.8H20.8M16.4 17.6H20.8M16.4 20.4H19.2M7.2 23.8H20.8'),
  ],
  // The Charter: a small Earth in a gold sunburst (the map's HQ emblem)
  charter: [
    ...[0, 45, 90, 135, 180, 225, 270, 315].map((a) => rot(a, 16, 16, poly(a === 0 || a === 270 || a === 315 ? 'yel1' : a === 90 || a === 135 || a === 180 ? 'org2' : 'yel0', '16,1.8 18.2,5.8 13.8,5.8', 0.9))),
    torus(['yel1', 'yel0', 'org2'], 2.6, 16, 16, 10),
    earth(16, 16, 8, 'sea5'),
  ],
  // The Council: a marble hall, its seal in the pediment
  council: [
    clip(poly('ink9', '16,3.8 28.2,10.6 3.8,10.6', 1.6), all('ink9'), p('white', 'M0 0H16L2 12H0Z'), p('ink8', 'M16 3L32 12H16Z')),
    ball(T.gold, 16, 7.8, 2, false),
    r('ink8', 4.4, 12.4, 23.2, 2.4, 0.8),
    ...[5.8, 11.4, 17, 22.6].map((x) => clip(r('white', x, 15.2, 3.6, 8.8), all('white'), r('ink8', x + 2.3, 0, 2, 32))),
    r('ink8', 3.6, 24.4, 24.8, 2.2, 0.8),
    r('ink7', 2, 26.8, 28, 2.6, 1),
  ],
  // The Planet: the Earth, lit from the upper left
  globe: [earth(16, 16, 13), l('white/75', 1.7, 'M7.6 11.4H13M19.4 21.6H25'), l('white/55', 1.5, 'M17.6 8.4H21.6')],
  // The System: the Sun and its swarm of collectors on a tilted orbit
  swarm: [
    ...[22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((a) => collector(a, 14, 'cyn3', 1.3)),
    ...[0, 45, 90, 135, 180, 225, 270, 315].map((a) => collector(a, 11.6, a >= 180 && a <= 270 ? 'cyn6' : a === 0 || a === 45 || a === 90 ? 'cyn4' : 'cyn5', 2.1)),
    o('org1', 16, 16, 7.4),
    ball(['white', 'yel0', 'org2'], 16, 16, 6),
  ],
  // The transmission line tool: a lattice pylon, its insulators live
  link: [
    l('ink6', 1.5, 'M13.3 15.4L20.6 23M18.7 15.4L11.4 23M12 20.4H20'),
    l('ink8', 2.2, 'M16 4.4L10 29M16 4.4L22 29'),
    l('ink9', 2.4, 'M4.6 9.6H27.4M8 14.8H24'),
    l('yel0', 2.2, 'M5.4 11.4V13.6M26.6 11.4V13.6M9 16.6V18.6M23 16.6V18.6'),
    o('yel1', 16, 4, 2),
    l('org2', 1.3, 'M1.6 15.6C3.2 15.4 4.6 14.8 5.4 14.2M26.6 14.2C27.4 14.8 28.8 15.4 30.4 15.6'),
  ],
  // The fiber tool: a cable's end firing strands of light
  fiber: [
    l('pnk0', 2, 'M16 18L5.4 7.6M16 18L10.6 4.6M16 18L21.4 4.6M16 18L26.6 7.6'),
    l('pnk1', 2, 'M16 18V3.4'),
    ...([[5.4, 7.6], [10.6, 4.6], [16, 3.4], [21.4, 4.6], [26.6, 7.6]] as const).flatMap(([x, y]) => [o('pnk1', x, y, 2.6), o('white', x, y, 1.5)]),
    clip(r('vio4', 12.8, 18.4, 6.4, 11.2, 1.6), all('vio4'), r('vio5', 0, 0, 14.8, 32), r('vio2', 17.2, 0, 15, 32)),
    box(['white', 'ink8', 'ink6'], 11.8, 16.4, 8.4, 3.4, 1.4, 1, 1),
  ],
  // How to play: a question in a teal bubble
  help: [
    clip(p('cyn4', BUBBLE), all('cyn4'), r('cyn5', 0, 0, 32, 7), r('cyn3', 0, 19.6, 32, 12)),
    l('white', 3, 'M12 10.6A4.1 4.1 0 1 1 18.2 14C16.7 15 16 15.8 16 17.4'),
    o('white', 16, 21, 1.8),
  ],
  // Settings: a steel gear
  settings: [
    clip(p('ink8', gearPath(16, 16, 13.6, 10.2, 8, 4.6)), all('ink8'), p('ink6', 'M32 4V32H4Z'), p('white', 'M0 0H17L0 17Z')),
    ring('ink5', 1.3, 16, 16, 5.3),
    ring('ink9', 1.2, 16, 16, 7.6),
  ],
} satisfies Record<string, Shape[]>;

export type DockIconName = keyof typeof ICONS;
export const DOCK_ICON_NAMES = Object.keys(ICONS) as DockIconName[];
export const hasDockIcon = (name: string): name is DockIconName => name in ICONS;

/** The grid every dock icon is drawn on. */
export const DOCK_SIZE = 32;

/** The dock icon's SVG markup. */
export const dockIconSvg = (name: DockIconName): string => svg(DOCK_SIZE, ICONS[name]);

const cache = new Map<DockIconName, string>();

/** The dock icon as a `data:image/svg+xml` URL for an <img>. */
export function dockIconUrl(name: DockIconName): string {
  let u = cache.get(name);
  if (!u) {
    u = svgUrl(dockIconSvg(name));
    cache.set(name, u);
  }
  return u;
}
