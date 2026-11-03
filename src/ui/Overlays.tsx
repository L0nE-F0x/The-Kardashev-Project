import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon, Portrait, pct, useGame } from './components';
import { SITE_BY_ID } from '../content/sites';
import { REGIONS, STANCE_LABEL } from '../content/regions';
import { FACILITIES } from '../content/facilities';
import { COMPANIES } from '../content/companies';
import { CHOKEPOINT_BY_ID } from '../world/routing';
import { closedChokepoints } from '../sim/effects';
import { fmtDays, fmtMW } from '../sim/core';
import type { AdvisorId } from '../sim/types';

/** Scrolling news ticker along the bottom. */
export function Ticker() {
  const game = useGame();
  const s = game.state!;
  const items = s.news.slice(0, 6);
  return (
    <div class="ticker frame interactive" onClick={() => game.openPanel('news')} data-tip="Open the news log (N)">
      <Icon name="news" size="sm" />
      <div class="feed">
        {items.length === 0 ? (
          <span class="muted">The world waits. Click a site on the map to begin.</span>
        ) : (
          items.map((n, i) => (
            <span key={`${n.day}-${i}`} class={n.kind}>
              {n.text}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

export function Toasts() {
  const game = useGame();
  return (
    <div class="toasts">
      {game.toasts.map((t) => (
        <div key={t.id} class={`toast frame ${t.kind}`}>
          {t.advisor && <Portrait id={t.advisor as AdvisorId} mood={t.kind === 'bad' ? 'worried' : 'happy'} size={40} />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Hover card for things on the map. */
export function MapTooltip() {
  const game = useGame();
  const h = game.hover;
  const s = game.state;
  if (!h || !s || h.clientX < 0 || game.mode === 'title') return null;
  let title = '';
  let body = '';
  if (h.kind === 'site') {
    const site = SITE_BY_ID[h.id];
    title = site.name;
    if (site.kind === 'build') {
      const facs = s.facilities.filter((f) => f.siteId === h.id);
      const sp = s.stats.sitePower[h.id];
      body = `${REGIONS[site.region].name}\n☀ ${pct(site.solarCF)}  🌬 ${pct(site.windCF)}  💧 ${site.water >= 0.5 ? 'ok' : 'scarce'}  ${site.climateC}°C`;
      if (facs.length) body += `\n${facs.map((f) => `${FACILITIES[f.type].name}${f.status === 'building' ? ' (building)' : ''}`).join(', ')}`;
      if (sp && sp.load > 0) body += `\nPower ${fmtMW(sp.served)} / ${fmtMW(sp.load)}`;
      body += game.tool?.kind === 'link' ? '\nClick to connect' : '\nClick to inspect · double-click to view';
    } else {
      const c = COMPANIES[(site.supplier ?? 'lumen') as keyof typeof COMPANIES];
      body = `${c?.sector ?? ''}\n${site.blurb}`;
    }
  } else if (h.kind === 'region') {
    const r = REGIONS[h.id];
    title = r.name;
    body = `Trust ${Math.round(s.regions[h.id].license)} · ${STANCE_LABEL[r.stance]}\nGrid $${r.gridPrice}/MWh`;
  } else if (h.kind === 'shipment') {
    const sh = s.shipments.find((x) => x.id === h.id);
    if (!sh) return null;
    title = `${sh.batch.qty.toLocaleString()} accelerators`;
    body = `${SITE_BY_ID[sh.from].name} → ${SITE_BY_ID[sh.dest].name}\nArrives in ${fmtDays(sh.arriveDay - s.day)}${sh.delayed ? ' (delayed)' : ''}${sh.chokepoints.length ? `\nVia ${sh.chokepoints.map((c) => CHOKEPOINT_BY_ID[c].name).join(', ')}` : ''}`;
  } else if (h.kind === 'chokepoint') {
    const c = CHOKEPOINT_BY_ID[h.id];
    title = c.name;
    body = closedChokepoints(s).has(h.id) ? 'CLOSED — ships are rerouting' : 'Open · a vital shipping chokepoint';
  } else if (h.kind === 'facility') {
    const f = s.facilities.find((x) => x.id === h.id);
    if (!f) return null;
    const def = FACILITIES[f.type];
    title = def.name;
    const racks = (f.racks ?? []).reduce((a, r) => a + r.qty, 0);
    body = f.status === 'building' ? `Under construction · ${fmtDays(f.buildDays - f.progress)} left` : f.type === 'datacenter' ? `${racks.toLocaleString()} accelerators installed` : def.blurb;
  } else if (h.kind === 'slot') {
    title = 'Empty plot';
    body = 'Click, then pick something to build from the panel.';
  } else return null;
  const left = Math.min(window.innerWidth - 310, h.clientX + 16);
  const top = Math.min(window.innerHeight - 140, h.clientY + 14);
  return (
    <div class="tooltip frame" style={{ left: `${left}px`, top: `${top}px` }}>
      <h3>{title}</h3>
      {body}
    </div>
  );
}

/** Global tooltip for any element with data-tip (hover on desktop, long-press on touch). */
export function TipLayer() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
      const text = el?.getAttribute('data-tip');
      setTip(text ? { text, x: e.clientX, y: e.clientY } : null);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t));
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      const el = (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
      const text = el?.getAttribute('data-tip');
      window.clearTimeout(timer.current);
      if (text) timer.current = window.setTimeout(() => setTip({ text, x: e.clientX, y: e.clientY - 40 }), 450);
    };
    const up = () => {
      window.clearTimeout(timer.current);
      window.setTimeout(() => setTip(null), 1500);
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', up);
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', up);
    };
  }, []);
  if (!tip) return null;
  const left = Math.max(4, Math.min(window.innerWidth - 310, tip.x + 14));
  const top = Math.max(4, Math.min(window.innerHeight - 120, tip.y + 16));
  return (
    <div class="tooltip frame" style={{ left: `${left}px`, top: `${top}px` }}>
      {tip.text}
    </div>
  );
}

export function DioramaBar() {
  const game = useGame();
  if (game.mode !== 'diorama' || !game.dioramaSite) return null;
  const site = SITE_BY_ID[game.dioramaSite];
  return (
    <div class="dioramabar frame interactive">
      <button class="btn small" onClick={() => game.enterMap()} data-tip="Back to the world map (M / Esc)">
        <Icon name="globe" size="sm" /> World map
      </button>
      <span>
        <b>{site.name}</b> <span class="muted small">· {REGIONS[site.region].name}</span>
      </span>
      <button class={`btn small ${game.dioramaTimelapse ? 'active' : ''}`} onClick={() => game.toggleTimelapse()} data-tip="Skies follow the site's real local time. Time-lapse spins a full day every ~40 seconds.">
        <Icon name="clock" size="sm" /> Time-lapse
      </button>
    </div>
  );
}

export function LinkHint() {
  const game = useGame();
  if (game.tool?.kind !== 'link' || game.mode !== 'map') return null;
  return (
    <div class="dioramabar frame interactive">
      <Icon name="link" size="sm" />
      <span class="small">{game.tool.from ? `From ${SITE_BY_ID[game.tool.from].name} — click another of your sites (≤1,500 km)` : 'Click the first of two sites to connect'}</span>
      <button class="btn small" onClick={() => game.setTool(null)}>
        Cancel
      </button>
    </div>
  );
}
