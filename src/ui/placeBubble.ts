/** Where a spotlight bubble (Bit's tutorial, the briefings) goes. Pure, so tests can check it never leaves the screen. */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  round: boolean;
}

export interface Area {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Where a w×h bubble goes: below or above its target (beside it for tall targets such as the dock), the first that
 * fits whole inside the area; if none does, the spot that covers the least of the target. Never off screen.
 */
export function placeBubble(box: Box | null, w: number, h: number, a: Area): { left: number; top: number } {
  const cx = (x: number) => Math.max(a.left, Math.min(a.right - w, x));
  const cy = (y: number) => Math.max(a.top, Math.min(a.bottom - h, y));
  if (!box) return { left: cx((a.left + a.right - w) / 2), top: cy(a.top + (a.bottom - a.top) * 0.6 - 20) };
  const gap = 10;
  const mid = box.x + box.w / 2;
  const below = { left: cx(mid - w / 2), top: box.y + box.h + gap };
  const above = { left: cx(mid - w / 2), top: box.y - gap - h };
  const right = { left: box.x + box.w + gap, top: cy(box.y - 10) };
  const left = { left: box.x - gap - w, top: cy(box.y - 10) };
  const tall = box.h > box.w * 1.5 || (box.x < 80 && box.w < 80);
  const order = tall ? [right, below, above, left] : [below, above, right, left];
  const fits = (p: { left: number; top: number }) => p.left >= a.left - 0.5 && p.top >= a.top - 0.5 && p.left + w <= a.right + 0.5 && p.top + h <= a.bottom + 0.5;
  const found = order.find(fits);
  if (found) return found;
  const overlap = (p: { left: number; top: number }) =>
    Math.max(0, Math.min(p.left + w, box.x + box.w) - Math.max(p.left, box.x)) * Math.max(0, Math.min(p.top + h, box.y + box.h) - Math.max(p.top, box.y));
  return order.map((p) => ({ left: cx(p.left), top: cy(p.top) })).reduce((best, p) => (overlap(p) < overlap(best) - 1 ? p : best));
}
