import { describe, expect, it } from 'vitest';
import { placeBubble, type Area, type Box } from '../src/ui/placeBubble';

// v0.9.2: on a 377 px tall phone, Bit's bubble used to run off the bottom and hide its Next button
const inside = (p: { left: number; top: number }, w: number, h: number, a: Area) =>
  p.left >= a.left - 0.5 && p.top >= a.top - 0.5 && p.left + w <= a.right + 0.5 && p.top + h <= a.bottom + 0.5;
const overlaps = (p: { left: number; top: number }, w: number, h: number, b: Box) =>
  p.left < b.x + b.w && p.left + w > b.x && p.top < b.y + b.h && p.top + h > b.y;

describe('placeBubble', () => {
  const screens: Area[] = [
    { left: 6, top: 6, right: 725, bottom: 371 }, // a phone in the Android app
    { left: 52, top: 6, right: 771, bottom: 371 }, // a phone browser with a camera cutout on the left
    { left: 6, top: 6, right: 857, bottom: 294 }, // a phone browser with its address bar
    { left: 6, top: 6, right: 1360, bottom: 762 }, // a laptop
  ];
  const targets: (Box | null)[] = [
    null,
    { x: 2, y: 40, w: 44, h: 300, round: false }, // the dock
    { x: 230, y: 0, w: 380, h: 44, round: false }, // the top bar's stats
    { x: 600, y: 200, w: 120, h: 40, round: false }, // a button low on the right
    { x: 40, y: 330, w: 40, h: 40, round: false }, // How to play, bottom left
    { x: 300, y: 150, w: 48, h: 48, round: true }, // a site on the map
  ];

  it('keeps every bubble inside the screen, whatever its size and target', () => {
    for (const a of screens) {
      for (const box of targets) {
        for (const [w, h] of [
          [360, 150],
          [460, 250],
          [460, 360],
        ]) {
          const ww = Math.min(w, a.right - a.left);
          const hh = Math.min(h, a.bottom - a.top);
          const p = placeBubble(box, ww, hh, a);
          expect(inside(p, ww, hh, a), `${JSON.stringify(a)} ${JSON.stringify(box)} ${w}×${h} → ${JSON.stringify(p)}`).toBe(true);
        }
      }
    }
  });

  it('leaves the target uncovered when there is room', () => {
    const a = screens[0];
    for (const box of targets.slice(1)) {
      const p = placeBubble(box, 360, 150, a);
      expect(overlaps(p, 360, 150, box!), JSON.stringify(box)).toBe(false);
    }
  });

  it('puts the bubble beside the dock, not under it', () => {
    const dock = targets[1]!;
    const p = placeBubble(dock, 360, 150, screens[0]);
    expect(p.left).toBeGreaterThanOrEqual(dock.x + dock.w);
  });
});
