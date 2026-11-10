/**
 * The interface's vector art kit (art3d/INTERFACE.md): icons, dock icons and medals are a few shapes each, written
 * with these helpers and turned into an SVG data URL. No DOM: the sim's content files and the tests import it in Node.
 *
 * A colour is a palette key (`'yel0'`), optionally with an opacity in percent (`'white/40'`). Nothing else: the
 * interface keeps the game's hues. Light comes from the upper left, so a subject is usually three tones of one
 * family, `[lit, base, shade]`: `ball` and `box` shade a round or a square body that way; the rest is hand-placed.
 *
 * House rules (the 24-unit grid; dock icons use 32):
 *  - keep art inside 1.5 … 22.5; a body's corners are rounded by 1.5–2.5, small parts by 1;
 *  - no outlines; a stroke (`l`) is a drawn line (a tick, a wire, an arrow), 2 units wide or more, round ends;
 *  - nothing narrower than 1.5 units: icons are shown at 16–20 px.
 */
import { PALETTE, type ColorKey } from '../render/palette';

/** A palette key, or a key with an opacity in percent: `'white/40'`. */
export type Tone = ColorKey | `${ColorKey}/${number}`;
/** Three tones of one family: lit, base, shade. */
export type Tones = readonly [Tone, Tone, Tone];
/** One drawn shape (an SVG fragment). */
export type Shape = string;

const n = (v: number) => String(Math.round(v * 100) / 100);

function paint(attr: 'fill' | 'stroke', tone: Tone): string {
  const [key, a] = tone.split('/') as [ColorKey, string?];
  const hex = PALETTE[key];
  if (!hex) throw new Error(`icon colour "${tone}" is not in the palette`);
  return `${attr}='${hex}'${a ? ` ${attr}-opacity='${n(+a / 100)}'` : ''}`;
}

/** A rectangle, corners rounded by `rad`. */
export const r = (tone: Tone, x: number, y: number, w: number, h: number, rad = 0): Shape =>
  `<rect x='${n(x)}' y='${n(y)}' width='${n(w)}' height='${n(h)}'${rad ? ` rx='${n(rad)}'` : ''} ${paint('fill', tone)}/>`;

/** A circle, or an ellipse with `ry`. */
export const o = (tone: Tone, cx: number, cy: number, rx: number, ry?: number): Shape =>
  ry === undefined || ry === rx
    ? `<circle cx='${n(cx)}' cy='${n(cy)}' r='${n(rx)}' ${paint('fill', tone)}/>`
    : `<ellipse cx='${n(cx)}' cy='${n(cy)}' rx='${n(rx)}' ry='${n(ry)}' ${paint('fill', tone)}/>`;

/** A filled path (`evenodd`, so a second sub-path cuts a hole). */
export const p = (tone: Tone, d: string): Shape => `<path d='${d}' ${paint('fill', tone)} fill-rule='evenodd'/>`;

/** A filled polygon with softened corners: the points as `x,y x,y …`. */
export const poly = (tone: Tone, pts: string, soft = 1): Shape => {
  const hex = paint('fill', tone);
  return soft
    ? `<polygon points='${pts}' ${hex} ${paint('stroke', tone)} stroke-width='${n(soft)}' stroke-linejoin='round'/>`
    : `<polygon points='${pts}' ${hex}/>`;
};

/** A drawn line: a stroked path with round ends and joins; `dash` (`'3 2'`) breaks it into dashes. */
export const l = (tone: Tone, w: number, d: string, dash?: string): Shape =>
  `<path d='${d}' fill='none' ${paint('stroke', tone)} stroke-width='${n(w)}' stroke-linecap='round' stroke-linejoin='round'${dash ? ` stroke-dasharray='${dash}'` : ''}/>`;

/** A ring (a stroked circle or ellipse). */
export const ring = (tone: Tone, w: number, cx: number, cy: number, rx: number, ry = rx): Shape =>
  `<ellipse cx='${n(cx)}' cy='${n(cy)}' rx='${n(rx)}' ry='${n(ry)}' fill='none' ${paint('stroke', tone)} stroke-width='${n(w)}'/>`;

/** Shapes turned by `deg` about (cx, cy). */
export const rot = (deg: number, cx: number, cy: number, ...kids: Shape[]): Shape =>
  `<g transform='rotate(${n(deg)} ${n(cx)} ${n(cy)})'>${kids.join('')}</g>`;

/** Shapes moved by (dx, dy) and scaled by `k`. */
export const move = (dx: number, dy: number, k: number, ...kids: Shape[]): Shape =>
  `<g transform='translate(${n(dx)} ${n(dy)})${k === 1 ? '' : ` scale(${n(k)})`}'>${kids.join('')}</g>`;

/** Shapes mirrored left to right about the line x = cx. */
export const flip = (cx: number, ...kids: Shape[]): Shape => `<g transform='translate(${n(cx * 2)} 0) scale(-1 1)'>${kids.join('')}</g>`;

let clipId = 0;
/**
 * `kids` drawn only inside `mask` (any shapes, strokes included; their colour is ignored). A mask and not a
 * clip-path, because a clip-path drops strokes and softened polygons are strokes.
 */
export const clip = (mask: Shape | Shape[], ...kids: Shape[]): Shape => {
  const id = `k${(clipId++).toString(36)}`;
  const white = (Array.isArray(mask) ? mask.join('') : mask).replace(/(fill|stroke)='#[0-9a-f]{6}'/g, "$1='white'").replace(/ (fill|stroke)-opacity='[^']*'/g, '');
  return `<mask id='${id}' maskUnits='userSpaceOnUse' x='-8' y='-8' width='64' height='64'>${white}</mask><g mask='url(#${id})'>${kids.join('')}</g>`;
};

const pt = (cx: number, cy: number, rad: number, a: number) => `${n(cx + rad * Math.cos(a))} ${n(cy + rad * Math.sin(a))}`;

/** A star's outline as path data: `points` tips at `R`, the notches at `r`, the first tip up. */
export const starPath = (cx: number, cy: number, R: number, r: number, points = 5): string => {
  let d = '';
  for (let i = 0; i < points * 2; i++) d += `${i ? 'L' : 'M'}${pt(cx, cy, i % 2 ? r : R, (i * Math.PI) / points - Math.PI / 2)}`;
  return `${d}Z`;
};

/** A cog's outline as path data: `teeth` teeth out to `R` on a wheel of `r`, a hole of `hole` (fill is evenodd). */
export const gearPath = (cx: number, cy: number, R: number, r: number, teeth = 8, hole = 0): string => {
  const step = (Math.PI * 2) / teeth;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    d += `${i ? `A${n(r)} ${n(r)} 0 0 1 ` : 'M'}${pt(cx, cy, r, a - step * 0.3)}L${pt(cx, cy, R, a - step * 0.17)}L${pt(cx, cy, R, a + step * 0.17)}L${pt(cx, cy, r, a + step * 0.3)}`;
  }
  d += `A${n(r)} ${n(r)} 0 0 1 ${pt(cx, cy, r, -Math.PI / 2 - step * 0.3)}Z`;
  if (hole) d += `M${n(cx + hole)} ${n(cy)}A${n(hole)} ${n(hole)} 0 1 0 ${n(cx - hole)} ${n(cy)}A${n(hole)} ${n(hole)} 0 1 0 ${n(cx + hole)} ${n(cy)}Z`;
  return d;
};

/** A round body lit from the upper left: a shaded lower-right crescent and a soft highlight. */
export const ball = ([lit, base, shade]: Tones, cx: number, cy: number, rad: number, glint = true): Shape =>
  clip(
    o(base, cx, cy, rad),
    o(shade, cx, cy, rad),
    o(base, cx - rad * 0.2, cy - rad * 0.22, rad * 1.02),
    glint ? o(lit, cx - rad * 0.36, cy - rad * 0.4, rad * 0.34, rad * 0.26) : '',
  );

/** A rounded block lit from above: a lit band along the top (`top` units), a shaded band along the bottom. */
export const box = ([lit, base, shade]: Tones, x: number, y: number, w: number, h: number, rad = 2, top = Math.min(2, h * 0.24), bottom = top): Shape =>
  clip(r(base, x, y, w, h, rad), r(base, x, y, w, h), top ? r(lit, x, y, w, top) : '', bottom ? r(shade, x, y + h - bottom, w, bottom) : '');

/** A ring `w` thick lit from the upper left: lit there, shaded to the lower right. */
export const torus = ([lit, base, shade]: Tones, w: number, cx: number, cy: number, rx: number, ry = rx): Shape =>
  clip(ring(base, w, cx, cy, rx, ry), o(shade, cx, cy, rx + w, ry + w), o(base, cx - rx * 0.3, cy - ry * 0.34, rx * 1.16, ry * 1.16), o(lit, cx - rx * 0.86, cy - ry * 0.9, rx * 0.86, ry * 0.86));

/** A circle as path data (to cut holes, or to build crescents with `p`'s evenodd fill). */
export const circ = (cx: number, cy: number, rad: number): string =>
  `M${n(cx + rad)} ${n(cy)}A${n(rad)} ${n(rad)} 0 1 0 ${n(cx - rad)} ${n(cy)}A${n(rad)} ${n(rad)} 0 1 0 ${n(cx + rad)} ${n(cy)}Z`;

/** Two continents on a disc of radius 1 about the origin. */
const LAND =
  'M-.42 -.9C-.1 -.94 .12 -.7 -.06 -.44C-.22 -.2 -.5 -.3 -.46 .02C-.42 .3 -.12 .36 -.2 .72C-.28 .98 -.6 .8 -.82 .5C-1 .2 -1 -.3 -.8 -.62C-.7 -.78 -.58 -.86 -.42 -.9Z' +
  'M.34 -.5C.6 -.66 .9 -.44 .96 -.1C.8 .04 .66 -.08 .56 .2C.5 .5 .74 .56 .6 .84C.34 .76 .16 .44 .22 .14C.28 -.12 .1 -.3 .34 -.5Z';

/** The Earth: sea, two continents, the night side to the lower right, a glint. */
export const earth = (cx: number, cy: number, rad: number, sea: Tone = 'sea6', land: Tone = 'grn6'): Shape =>
  clip(
    o(sea, cx, cy, rad),
    o(sea, cx, cy, rad),
    move(cx, cy, rad, p(land, LAND)),
    p('sea0/50', circ(cx, cy, rad * 1.5) + circ(cx - rad * 0.24, cy - rad * 0.26, rad * 1.04)),
    o('white/30', cx - rad * 0.4, cy - rad * 0.44, rad * 0.3, rad * 0.22),
  );

/** A whole picture: the shapes on a `size`-unit square. */
export const svg = (size: number, shapes: readonly Shape[]): string => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${size} ${size}'>${shapes.join('')}</svg>`;

/** The picture as a URL an <img> can show. The markup uses single quotes only, so little needs escaping. */
export const svgUrl = (markup: string): string => `data:image/svg+xml,${markup.replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')}`;

/** The usual families, `[lit, base, shade]`. */
export const T = {
  gold: ['yel1', 'yel0', 'snd6'],
  amber: ['yel0', 'org2', 'org1'],
  orange: ['org2', 'org1', 'org0'],
  red: ['org0', 'red3', 'red2'],
  cyan: ['cyn6', 'cyn5', 'cyn4'],
  teal: ['cyn5', 'cyn4', 'cyn3'],
  violet: ['vio5', 'vio4', 'vio3'],
  blue: ['blu6', 'blu5', 'blu4'],
  navy: ['blu5', 'blu4', 'blu3'],
  green: ['grn7', 'grn6', 'grn5'],
  sea: ['sea8', 'sea7', 'sea6'],
  steel: ['white', 'ink9', 'ink7'],
  iron: ['ink8', 'ink7', 'ink6'],
  slate: ['ink7', 'ink6', 'ink5'],
  dark: ['ink6', 'ink5', 'ink4'],
  paper: ['yel2', 'snd8', 'snd7'],
  sand: ['snd7', 'snd6', 'snd5'],
  wood: ['snd5', 'snd4', 'snd3'],
  rock: ['rck6', 'rck5', 'rck4'],
  pink: ['pnk1', 'pnk0', 'dusk4'],
  skin: ['skn6', 'skn5', 'skn4'],
} as const satisfies Record<string, Tones>;
