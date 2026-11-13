import { useEffect, useRef, useState } from 'preact/hooks';
import { useGame } from './components';
import { FACILITIES } from '../content/facilities';
import { chipSpec, dcCapacityUnits, facilityIT, facilityMW } from '../sim/model';
import { fmtDays, fmtMW } from '../sim/core';
import type { Facility, GameState } from '../sim/types';
import type { PlotAnchor } from '../render3d/campus/campusScene';

/**
 * Notes on the world (SPEC §34): on a campus, what the interface has to say about a building is pinned to the
 * building. Two kinds:
 *  - remarks: a few standing words in the look's own hand (a flag of paper, grease pencil, a stylus, a label of
 *    light) where something wants saying: a hall with no chips, a hall nearly full, a build's time to go, a
 *    free plot. Three at most, the most useful first.
 *  - the call-out: the building under the pointer is ringed (by hand, or by brackets of light) and its card
 *    stands beside it on a leader, instead of a card that follows the pointer.
 * The scene says where each plot is (`CampusScene.plotAnchors`); a frame loop moves the notes there without
 * re-rendering anything, so they hold on to their buildings while the camera moves.
 */
interface Remark {
  key: string;
  text: string;
  tone: 'warn' | 'good' | 'plain';
}

function hallFill(s: GameState, f: Facility): { installed: number; cap: number } {
  const installed = (f.racks ?? []).reduce((a, r) => a + r.qty, 0);
  return { installed, cap: dcCapacityUnits(f.racks?.[0]?.kw ?? chipSpec(s, 'lumen').kw, facilityIT(f)) };
}

/** The standing remarks for a site, most useful first. */
function remarksFor(s: GameState, siteId: string, hasEmpty: boolean): Remark[] {
  const ranked: [number, Remark][] = [];
  for (const f of s.facilities) {
    if (f.siteId !== siteId) continue;
    const key = `f:${f.id}`;
    const isHall = f.type === 'datacenter' || f.type === 'campus';
    if (f.status === 'building') {
      ranked.push([f.blocked ? 1 : 3, { key, text: f.blocked ? 'waiting on tools' : `${fmtDays(f.buildDays - f.progress)} to go`, tone: f.blocked ? 'warn' : 'plain' }]);
    } else if (f.upgrade) {
      ranked.push([4, { key, text: `bigger in ${fmtDays(f.upgrade.buildDays - f.upgrade.progress)}`, tone: 'plain' }]);
    } else if (isHall) {
      const { installed, cap } = hallFill(s, f);
      if (installed === 0) ranked.push([0, { key, text: 'empty! order chips', tone: 'warn' }]);
      else if (cap > 0 && installed / cap >= 0.92) ranked.push([2, { key, text: 'nearly full!', tone: 'good' }]);
    }
  }
  if (hasEmpty) ranked.push([5, { key: 'e:0', text: 'free plot', tone: 'plain' }]);
  // the same words twice on one campus is noise: the first building to say them says them
  const said = new Set<string>();
  return ranked
    .sort((a, b) => a[0] - b[0])
    .map((r) => r[1])
    .filter((r) => !said.has(r.text) && !!said.add(r.text))
    .slice(0, 3);
}

/** One line on what a building is doing: the site panel's wording, shortened. */
function statusLine(s: GameState, f: Facility): string {
  const def = FACILITIES[f.type];
  if (f.status === 'building') return f.blocked ? 'Waiting on EUV tools' : `Building · ${fmtDays(f.buildDays - f.progress)} left`;
  if (f.type === 'datacenter' || f.type === 'campus') {
    const { installed, cap } = hallFill(s, f);
    return `${installed.toLocaleString()} / ~${cap.toLocaleString()} chips · ${fmtMW(facilityIT(f))} IT`;
  }
  if (def.mw) return `${fmtMW(facilityMW(f))}${f.type === 'battery' ? ' of storage' : ' nameplate'}`;
  return def.blurb;
}

type Anchored = { plotAnchors(): PlotAnchor[] };

export function WorldNotes() {
  const game = useGame();
  const [, setV] = useState(0);
  useEffect(() => game.subscribeHover(() => setV((v) => v + 1)), [game]);
  const root = useRef<HTMLDivElement>(null);
  const s = game.state;
  const on = game.mode === 'diorama' && !!s && !!game.dioramaSite && !game.photo;
  const scene = on ? (game.stage.getScene() as unknown as Partial<Anchored> | null) : null;
  const can = !!scene?.plotAnchors;

  // every frame: each note to its plot (no re-render; the notes carry `data-at`)
  useEffect(() => {
    if (!can) return;
    let raf = 0;
    const place = () => {
      raf = requestAnimationFrame(place);
      const el = root.current;
      const sc = game.stage.getScene() as unknown as Partial<Anchored> | null;
      if (!el || !sc?.plotAnchors) return;
      const box = game.stage.canvas.getBoundingClientRect();
      const at = new Map(sc.plotAnchors().map((a) => [a.key, a]));
      for (const n of el.children as unknown as HTMLElement[]) {
        const a = at.get(n.dataset.at ?? '');
        if (!a || !a.on) {
          n.style.visibility = 'hidden';
          continue;
        }
        n.style.visibility = '';
        if (n.classList.contains('wn-ring')) {
          const pad = 10;
          n.style.translate = `${box.left + a.x0 - pad}px ${box.top + a.y0 - pad}px`;
          n.style.width = `${a.x1 - a.x0 + pad * 2}px`;
          n.style.height = `${a.y1 - a.y0 + pad * 2}px`;
        } else {
          n.style.translate = `${Math.round(box.left + a.x)}px ${Math.round(box.top + a.y)}px`;
          // the card stands to the right of its building unless the site panel (or the window's edge) is in the
          // way there and there is room for it on the left
          if (n.classList.contains('wn-call')) {
            const w = (n.firstElementChild as HTMLElement | null)?.getBoundingClientRect().width ?? 300;
            const wall = document.querySelector('#ui > .side > .panel')?.getBoundingClientRect().left ?? window.innerWidth;
            const x = box.left + a.x;
            n.classList.toggle('flip', x + 60 + w > wall && x - 60 - w > 0);
          }
        }
      }
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [can, game]);

  if (!can || !s) return null;
  const siteId = game.dioramaSite!;
  const anchors = scene!.plotAnchors!();
  const h = game.hover;
  const hoverKey = h?.kind === 'facility' ? `f:${h.id}` : h?.kind === 'slot' ? `e:${h.index}` : null;
  const hovered = h?.kind === 'facility' ? s.facilities.find((f) => f.id === h.id) : undefined;
  const remarks = remarksFor(s, siteId, anchors.some((a) => a.key === 'e:0')).filter((r) => r.key !== hoverKey);
  const fill = hovered && hovered.status !== 'building' && (hovered.type === 'datacenter' || hovered.type === 'campus') ? hallFill(s, hovered) : null;
  return (
    <div class="worldnotes" ref={root} aria-hidden="true">
      {remarks.map((r, i) => (
        <div class={`wn wn-remark ${r.tone} n${i}`} data-at={r.key} key={`r:${r.key}`}>
          <span>{r.text}</span>
        </div>
      ))}
      {hoverKey && <div class="wn-ring" data-at={hoverKey} key="ring" />}
      {hoverKey && (
        <div class="wn wn-call" data-at={hoverKey} key={`c:${hoverKey}`}>
          <div class="wn-card">
            <span class="wn-l">{hovered ? (hovered.status === 'building' ? 'Under construction' : hovered.upgrade ? 'Expanding' : 'Online') : 'Free plot'}</span>
            <b>{hovered ? FACILITIES[hovered.type].name : 'Nothing built here'}</b>
            {fill && (
              <span class="wn-bar">
                <i style={{ width: `${Math.min(100, (fill.installed / Math.max(1, fill.cap)) * 100)}%` }} />
              </span>
            )}
            <span class="wn-s">{hovered ? statusLine(s, hovered) : 'Click, then pick something to build from the panel.'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
