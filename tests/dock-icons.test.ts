/**
 * The interface's vector art (ui/icons.ts, ui/dockIcons.ts, ui/medals.ts): every name draws, the markup is
 * well-formed SVG on the right grid, every colour is the palette's, and the dock's names match the small icons.
 * How they look is checked on the sheet (/play/icons.html in dev). With PREVIEW_DIR set this also writes
 * icon-sheet.svg, the whole set in one picture any browser opens:
 *   PREVIEW_DIR=/some/dir npx vitest run tests/dock-icons.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../src/render/palette';
import { DOCK_ICON_NAMES, DOCK_SIZE, dockIconSvg, dockIconUrl, hasDockIcon } from '../src/ui/dockIcons';
import { ICON_GROUPS, ICON_NAMES, ICON_SIZE, iconSvg, iconUrl, type IconName } from '../src/ui/icons';
import { MEDAL_SIZE, MEDAL_TIERS, medalSvg, medalUrl } from '../src/ui/medals';

const HEXES = new Set<string>(Object.values(PALETTE));
/** What the kit draws with: anything else in an icon is a mistake (or needs a helper in iconKit.ts). */
const TAGS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'polygon', 'mask']);

/** Checks `markup` is one well-formed <svg> on a `size`-unit grid and returns what it uses. */
function inspect(markup: string, size: number, what: string) {
  const open: string[] = [];
  const colours: string[] = [];
  const ids: string[] = [];
  const refs: string[] = [];
  let shapes = 0;
  let at = 0;
  const tag = /<(\/?)([a-zA-Z]+)((?:\s+[a-zA-Z:-]+='[^'<>]*')*)\s*(\/?)>/y;
  while (at < markup.length) {
    tag.lastIndex = at;
    const m = tag.exec(markup);
    expect(m, `${what}: not a tag at ${at}: "${markup.slice(at, at + 40)}"`).toBeTruthy();
    const [, closing, name, attrs, selfClosing] = m!;
    expect(TAGS.has(name), `${what}: <${name}>`).toBe(true);
    if (closing) expect(open.pop(), `${what}: </${name}>`).toBe(name);
    else {
      if (!selfClosing) open.push(name);
      else shapes++;
      for (const [, key, value] of attrs.matchAll(/([a-zA-Z:-]+)='([^']*)'/g)) {
        if (key === 'id') ids.push(value);
        if (key === 'mask') refs.push(value.replace(/^url\(#(.*)\)$/, '$1'));
        if (key === 'fill' || key === 'stroke') {
          if (value.startsWith('#')) colours.push(value);
          else expect(['none', 'white'], `${what}: ${key}='${value}'`).toContain(value);
        }
        // numbers must be numbers: a NaN or an undefined from a helper would land here
        expect(value, `${what}: ${key}`).not.toMatch(/NaN|undefined|Infinity/);
      }
    }
    at = tag.lastIndex;
  }
  expect(open, `${what}: unclosed`).toEqual([]);
  expect(markup.startsWith(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${size} ${size}'>`), `${what}: the root`).toBe(true);
  expect(markup.endsWith('</svg>'), `${what}: the end`).toBe(true);
  expect(shapes, `${what}: shapes`).toBeGreaterThan(0);
  expect(new Set(ids).size, `${what}: mask ids`).toBe(ids.length);
  for (const ref of refs) expect(ids, `${what}: mask ${ref}`).toContain(ref);
  for (const c of colours) expect(HEXES.has(c), `${what}: ${c} is not a palette colour`).toBe(true);
  return { colours: new Set(colours), shapes };
}

describe('interface icons', () => {
  it('draws every icon as well-formed SVG in palette colours', () => {
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(123);
    for (const name of ICON_NAMES) {
      const { colours } = inspect(iconSvg(name), ICON_SIZE, name);
      // flat one-colour art is what the direction rules out: lit, base, shade
      expect(colours.size, `${name}: tones`).toBeGreaterThanOrEqual(2);
    }
  });

  it('has unique names, each in exactly one family', () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
    const grouped = Object.values(ICON_GROUPS).flat();
    expect(grouped.length).toBe(ICON_NAMES.length);
    expect(new Set(grouped)).toEqual(new Set(ICON_NAMES));
  });

  it('gives every icon its own picture, as a cached data URL', () => {
    const seen = new Map<string, string>();
    for (const name of ICON_NAMES) {
      const url = iconUrl(name);
      expect(url.startsWith('data:image/svg+xml,'), name).toBe(true);
      expect(url, name).not.toMatch(/[#<>"]/);
      expect(decodeURIComponent(url.slice('data:image/svg+xml,'.length)), name).toBe(iconSvg(name));
      expect(iconUrl(name), name).toBe(url);
      expect(seen.get(url), `${name} is drawn exactly like ${seen.get(url)}`).toBeUndefined();
      seen.set(url, name);
    }
  });
});

describe('dock icons', () => {
  it('draws every dock icon as well-formed SVG in palette colours, richer than the small one', () => {
    expect(DOCK_ICON_NAMES.length).toBeGreaterThanOrEqual(19);
    for (const name of DOCK_ICON_NAMES) {
      const { colours } = inspect(dockIconSvg(name), DOCK_SIZE, `dock:${name}`);
      expect(colours.size, `dock:${name}: tones`).toBeGreaterThanOrEqual(3);
      expect(dockIconUrl(name).startsWith('data:image/svg+xml,'), name).toBe(true);
      expect(dockIconUrl(name), name).not.toBe(iconUrl(name as IconName));
    }
  });

  it('has a small icon of the same name for every dock icon', () => {
    expect(new Set(DOCK_ICON_NAMES).size).toBe(DOCK_ICON_NAMES.length);
    for (const name of DOCK_ICON_NAMES) expect(ICON_NAMES, name).toContain(name as IconName);
  });

  it('covers every button the dock and How to Play show', () => {
    // Dock.tsx's buttons (the panels of all five acts, the two tools, How to play, Settings)
    const dock = ['compute', 'orders', 'research', 'finance', 'chart', 'team', 'deal', 'blocs', 'charter', 'council', 'globe', 'swarm', 'goals', 'guide', 'news', 'link', 'fiber', 'help', 'settings'];
    for (const name of dock) expect(hasDockIcon(name), name).toBe(true);
  });
});

describe('medals', () => {
  it('draws every tier as well-formed SVG in palette colours', () => {
    const urls = new Set<string>();
    for (const tier of MEDAL_TIERS) {
      inspect(medalSvg(tier), MEDAL_SIZE, `medal:${tier}`);
      urls.add(medalUrl(tier));
    }
    expect(urls.size).toBe(MEDAL_TIERS.length);
  });
});

describe('the sheet', () => {
  it.runIf(!!process.env.PREVIEW_DIR)('writes icon-sheet.svg', () => {
    const cell = 96;
    const cols = 12;
    const all: [string, string][] = [
      ...ICON_NAMES.map((n): [string, string] => [n, iconSvg(n)]),
      ...DOCK_ICON_NAMES.map((n): [string, string] => [`dock:${n}`, dockIconSvg(n)]),
      ...MEDAL_TIERS.map((t): [string, string] => [`medal:${t}`, medalSvg(t)]),
    ];
    const rows = Math.ceil(all.length / cols);
    let out = `<svg xmlns='http://www.w3.org/2000/svg' width='${cols * cell}' height='${rows * cell}' font-family='sans-serif' font-size='10'><rect width='100%' height='100%' fill='${PALETTE.ink1}'/>`;
    all.forEach(([name, markup], i) => {
      const x = (i % cols) * cell;
      const y = Math.floor(i / cols) * cell;
      // each icon at 48 px and, beside it, at the 18 px most of the interface shows
      const nested = (px: number, dx: number, dy: number) => markup.replace('<svg ', `<svg x='${x + dx}' y='${y + dy}' width='${px}' height='${px}' `);
      out += nested(48, 10, 12) + nested(18, 66, 27) + `<text x='${x + 10}' y='${y + 78}' fill='${PALETTE.ink7}'>${name}</text>`;
    });
    out += '</svg>';
    const dir = process.env.PREVIEW_DIR!;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'icon-sheet.svg'), out);
  });
});
