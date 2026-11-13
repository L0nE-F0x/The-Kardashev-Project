import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Game } from '../game/game';
import { Icon, Portrait, pct, useGame } from './components';
import { rich } from './emoji';
import { linkMaxKm } from '../sim/model';
import { ASTEROID_BY_ID } from '../content/system';
import { SITE_BY_ID } from '../content/sites';
import { REGIONS, STANCE_LABEL } from '../content/regions';
import { FACILITIES } from '../content/facilities';
import { COMPANIES } from '../content/companies';
import { CHOKEPOINT_BY_ID } from '../world/routing';
import { closedChokepoints } from '../sim/effects';
import { fmtDate, fmtDays, fmtMW } from '../sim/core';
import type { AdvisorId } from '../sim/types';

export function Toasts() {
  const game = useGame();
  return (
    <div class="toasts">
      {game.toasts.map((t) => (
        <div key={t.id} class={`toast frame ${t.kind}`} onClick={() => game.dismissToast(t.id)}>
          {t.advisor && <Portrait id={t.advisor as AdvisorId} mood={t.kind === 'bad' ? 'worried' : 'happy'} size={40} />}
          <span>{rich(t.text)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Keeps a tooltip whole on screen: its place is worked out for a typical size before it renders, so a long one near
 * the right or bottom edge is nudged back inside once its real size is known.
 */
function useOnScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = r.right - (window.innerWidth - 4);
    const dy = r.bottom - (window.innerHeight - 4);
    if (dx > 0) el.style.left = `${Math.max(4, r.left - dx)}px`;
    if (dy > 0) el.style.top = `${Math.max(4, r.top - dy)}px`;
  });
  return ref;
}

/** Hover card for things on the map. */
export function MapTooltip() {
  const game = useGame();
  // the hover card has its own subscription (setHover doesn't re-render the whole HUD)
  const [, setV] = useState(0);
  useEffect(() => game.subscribeHover(() => setV((v) => v + 1)), [game]);
  const ref = useOnScreen();
  const h = game.hover;
  const s = game.state;
  if (!h || !s || h.clientX < 0 || game.mode === 'title') return null;
  // on a campus the card for a building or a plot is pinned to it instead (WorldNotes.tsx)
  if (game.mode === 'diorama' && (h.kind === 'facility' || h.kind === 'slot')) return null;
  let title = '';
  let body = '';
  if (h.kind === 'site') {
    const site = SITE_BY_ID[h.id];
    title = site.name;
    if (site.kind === 'build') {
      const facs = s.facilities.filter((f) => f.siteId === h.id);
      const sp = s.stats.sitePower[h.id];
      body = `${REGIONS[site.region].name}\n:solar: ${pct(site.solarCF)}  :wind: ${pct(site.windCF)}  :hydro: ${site.water >= 0.5 ? 'ok' : 'scarce'}  ${site.climateC}°C`;
      if (facs.length) body += `\n${facs.map((f) => `${FACILITIES[f.type].name}${f.status === 'building' ? ' (building)' : ''}`).join(', ')}`;
      if (sp && sp.load > 0) body += `\nPower ${fmtMW(sp.served)} / ${fmtMW(sp.load)}`;
      const rivals = (s.rivalBuilds ?? []).filter((b) => b.siteId === h.id);
      if (rivals.length) body += `\nRivals: ${rivals.map((b) => `${s.market.rivals.find((r) => r.id === b.owner)?.name.split(' ')[0] ?? b.owner} ${fmtMW(b.itMW)}${b.status === 'building' ? ' (building)' : ''}`).join(', ')}`;
      body += game.tool ? '\nClick to connect' : '\nClick to inspect · double-click to view';
    } else if (site.kind === 'landing') {
      body = `Cable landing station · ${REGIONS[site.region].name}\nClick to lease subsea cable capacity`;
    } else if (site.kind === 'mine') {
      body = `${REGIONS[site.region].name}\n${site.blurb}\nClick to buy a stake`;
    } else if (site.supplier) {
      const c = COMPANIES[site.supplier as keyof typeof COMPANIES];
      body = `${c?.sector ?? REGIONS[site.region].name}\n${site.blurb}`;
    } else {
      // the Charter's places (Acts III–V: its HQ, the megaproject and launch sites) belong to no company: their
      // card said "Logic fabs", the first supplier's trade
      body = `${REGIONS[site.region].name}\n${site.blurb}${site.kind === 'charter' || site.kind === 'mega' || site.kind === 'launch' ? '\nDouble-click to view' : ''}`;
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
    <div class="tooltip frame" ref={ref} style={{ left: `${left}px`, top: `${top}px` }}>
      <h3>{title}</h3>
      {rich(body)}
    </div>
  );
}

/** Global tooltip for any element with data-tip (hover on desktop, long-press on touch). */
export function TipLayer() {
  type Tip = { text: string; x: number; y: number; key?: string; at?: DOMRect };
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const ref = useOnScreen();
  useEffect(() => {
    // `data-key` = the shortcut, drawn as a key beside the title; `data-tip-at="right"` = a label that stands
    // beside its button (the dock) instead of following the pointer
    const read = (e: PointerEvent, dy = 0): Tip | null => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
      const text = el?.getAttribute('data-tip');
      if (!el || !text) return null;
      return { text, x: e.clientX, y: e.clientY + dy, key: el.getAttribute('data-key') ?? undefined, at: el.getAttribute('data-tip-at') === 'right' ? el.getBoundingClientRect() : undefined };
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      setTip(read(e));
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      setTip((t) => (t && !t.at ? { ...t, x: e.clientX, y: e.clientY } : t));
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      window.clearTimeout(timer.current);
      const t = read(e, -40);
      if (t) timer.current = window.setTimeout(() => setTip(t), 450);
    };
    const up = (e: PointerEvent) => {
      // a long-press tip lingers briefly after the finger lifts; a mouse click leaves the hover tip alone
      if (e.pointerType !== 'touch') return;
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
  // the first of several lines is the title; a lone line is just a line
  const cut = tip.text.indexOf('\n');
  const title = cut > 0 || tip.key ? (cut > 0 ? tip.text.slice(0, cut) : tip.text) : null;
  const rest = title ? (cut > 0 ? tip.text.slice(cut + 1) : '') : tip.text;
  const body = (
    <>
      {title && (
        <span class="tip-title">
          <span>{rich(title)}</span>
          {tip.key && <kbd>{tip.key}</kbd>}
        </span>
      )}
      {rest && <span class="tip-body">{rich(rest)}</span>}
    </>
  );
  if (tip.at) {
    const top = Math.max(30, Math.min(window.innerHeight - 30, tip.at.top + tip.at.height / 2));
    return (
      <div class="tooltip frame flyout" ref={ref} key="fly" style={{ left: `${tip.at.right + 12}px`, top: `${top}px` }}>
        {body}
      </div>
    );
  }
  const left = Math.max(4, Math.min(window.innerWidth - 310, tip.x + 14));
  const top = Math.max(4, Math.min(window.innerHeight - 120, tip.y + 16));
  return (
    <div class="tooltip frame" ref={ref} style={{ left: `${left}px`, top: `${top}px` }}>
      {body}
    </div>
  );
}

export function DioramaBar() {
  const game = useGame();
  if (game.mode !== 'diorama' || !game.dioramaSite) return null;
  const site = SITE_BY_ID[game.dioramaSite];
  // Act V: places in space go back to the solar-system view
  const inSpace = ['yards', 'ring', 'habitat', 'asteroid'].includes(site.kind) || (site.kind === 'moon' && !!game.state?.system);
  const where = site.kind === 'moon' ? 'The Moon' : site.kind === 'yards' ? 'an Earth–Moon Lagrange point' : site.kind === 'ring' ? 'near Earth’s orbit round the Sun' : site.kind === 'habitat' ? 'Earth–Moon L5' : site.kind === 'asteroid' ? `${ASTEROID_BY_ID[site.id]?.type ?? ''}-type asteroid · ${ASTEROID_BY_ID[site.id]?.belt === 'main' ? 'main belt' : 'near-Earth'}` : REGIONS[site.region].name;
  return (
    <div class="dioramabar frame interactive">
      {inSpace && game.hasSystemView ? (
        <button class="btn small" onClick={() => game.enterSystem()} data-tip="Back to the solar system (Esc for the world map)">
          <Icon name="swarm" size="sm" /> Solar system
        </button>
      ) : (
        <button class="btn small" onClick={() => game.enterMap()} data-tip="Back to the world map (M / Esc)">
          <Icon name="globe" size="sm" /> World map
        </button>
      )}
      <span>
        <b>{site.name}</b> <span class="muted small">· {where}</span>
      </span>
      <button class={`btn small ${game.dioramaTimelapse ? 'active' : ''}`} onClick={() => game.toggleTimelapse()} data-tip="Skies follow the site's real local time. Time-lapse spins a full day every ~40 seconds.">
        <Icon name="clock" size="sm" /> Time-lapse
      </button>
    </div>
  );
}

export function LinkHint() {
  const game = useGame();
  if (!game.tool || game.mode !== 'map') return null;
  const fiber = game.tool.kind === 'fiber';
  const max = fiber ? '5,000 km' : `${Math.round(linkMaxKm(game.state!)).toLocaleString()} km`;
  return (
    <div class="dioramabar frame interactive">
      <Icon name={fiber ? 'fiber' : 'link'} size="sm" />
      <span class="small">
        {fiber ? 'Fiber: ' : 'Power line: '}
        {game.tool.from ? `from ${SITE_BY_ID[game.tool.from].name} — click another of your sites (≤${max})` : 'click the first of two sites to connect'}
      </span>
      <button class="btn small" onClick={() => game.setTool(null)}>
        Cancel
      </button>
    </div>
  );
}

export function FpsCounter() {
  const game = useGame();
  if (!game.settings.fps) return null;
  return <div class="fps">{game.fps} fps</div>;
}

/** The app has a newer release: update it from inside the game. */
function AppUpdateToast() {
  const game = useGame();
  const u = game.appUpdate!;
  const st = u.status;
  const later = (
    <button class="btn small" onClick={() => game.hideAppUpdate()}>
      Later
    </button>
  );
  let body;
  if (st.phase === 'ready')
    body = (
      <>
        <span>Version {u.version} is out.</span>
        <button class="btn small primary" onClick={() => game.installAppUpdate()}>
          Update
        </button>
        {later}
      </>
    );
  else if (st.phase === 'downloading')
    body = (
      <span data-tip={(st.attempt ?? 1) > 1 ? 'The first connection was slow, so the game started a fresh one.' : undefined}>
        Downloading version {u.version}
        {st.fraction !== null ? ` · ${Math.round(st.fraction * 100)}%` : '…'}
        {(st.attempt ?? 1) > 1 ? ' · reconnected' : ''}
      </span>
    );
  else if (st.phase === 'installing') body = <span>Installing: the game restarts in a moment.</span>;
  else
    body = (
      <>
        <span data-tip={st.reason}>The update didn’t work.</span>
        <button class="btn small primary" onClick={() => game.installAppUpdate()}>
          Try again
        </button>
        {later}
      </>
    );
  return (
    <div class="update frame interactive" role="status">
      {body}
    </div>
  );
}

/** A newer version of the app is out. */
export function UpdateToast() {
  const game = useGame();
  return game.appUpdate && !game.appUpdate.hidden ? <AppUpdateToast /> : null;
}

/** Settings → Display → Graphics card: the question before the restart, the trial after it (with its frame rate), a kept choice that runs slowly, and a trial that was undone. */
export function GpuNotice() {
  const game = useGame();
  const n = game.gpuNotice;
  if (!n) return null;
  const strong = n.kind === 'ask' && n.prefer === 'strong';
  return (
    <div class="scrim">
      <div class="modal frame" role="alertdialog" aria-label="Graphics card" style={{ width: 'min(460px, 100%)' }}>
        <div class="head">
          <Icon name="settings" size="lg" />
          <h2 class="grow">Graphics card</h2>
        </div>
        <div class="body">
          {n.kind === 'ask' && (
            <>
              <p>{strong ? 'Run the game on this computer’s stronger graphics card? It looks and runs better, and uses more battery.' : 'Go back to the graphics card the system picks?'}</p>
              <p class="small muted">
                The game saves and restarts to switch.{strong ? ` You then get ${Game.GPU_TRIAL_SECONDS} seconds to confirm the picture: if something is wrong, it switches back by itself.` : ''}
              </p>
              <div class="row between">
                <button class="btn" onClick={() => game.gpuDismiss()}>
                  Cancel
                </button>
                <button class="btn primary" onClick={() => game.gpuSwitch()}>
                  Restart and switch
                </button>
              </div>
            </>
          )}
          {n.kind === 'trial' && (
            <>
              <p>The game is now running on the stronger graphics card. Does everything look right?</p>
              <p>
                {n.fps === null
                  ? 'Measuring how fast it runs here…'
                  : n.slow
                    ? `It runs slower on this card here: about ${Math.round(n.fps)} frames a second${n.base ? `, against ${Math.round(n.base)} on the automatic one` : ''}. Going back is the better choice.`
                    : `About ${Math.round(n.fps)} frames a second on the title screen${n.base ? ` (${Math.round(n.base)} on the automatic card)` : ''}.`}
              </p>
              <p class="small muted">Going back to the automatic card in {n.left} s unless you keep it.</p>
              <div class="row between">
                <button class={`btn ${n.slow ? 'primary' : ''}`} onClick={() => game.gpuRevert()}>
                  Go back
                </button>
                <button class={`btn ${n.slow ? '' : 'primary'}`} disabled={n.fps === null && n.left > Game.GPU_TRIAL_SECONDS - 10} onClick={() => game.gpuKeep()}>
                  {n.slow ? 'Keep it anyway' : 'Keep it'}
                </button>
              </div>
            </>
          )}
          {n.kind === 'slow' && (
            <>
              <p>
                The game is running slowly on the stronger graphics card: about {Math.round(n.fps)} frames a second on the title screen
                {n.base ? `, against ${Math.round(n.base)} on the automatic one` : ''}. Go back to the automatic card?
              </p>
              <p class="small muted">The game saves and restarts to switch.</p>
              <div class="row between">
                <button class="btn" onClick={() => game.gpuDismiss()}>
                  Stay
                </button>
                <button class="btn primary" onClick={() => game.gpuRevert()}>
                  Go back
                </button>
              </div>
            </>
          )}
          {n.kind === 'failed' && (
            <>
              <p>The stronger graphics card wasn’t confirmed last time, so the game went back to the automatic one.</p>
              <div class="row between">
                <span />
                <button class="btn primary" onClick={() => game.gpuDismiss()}>
                  OK
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** With auto-pause off, a waiting decision sits here until opened. */
export function DecisionPill() {
  const game = useGame();
  const s = game.state;
  if (!s?.events.active || game.settings.autoPause || game.eventOpen) return null;
  return (
    <button class="decision frame interactive" onClick={() => game.openEvent()}>
      <Icon name="warn" size="sm" /> Decision waiting — open
    </button>
  );
}

export function ConfirmModal() {
  const game = useGame();
  const c = game.confirm;
  if (!c) return null;
  return (
    <div class="scrim">
      <div class="modal frame" role="alertdialog" aria-label={c.title} style={{ width: 'min(420px, 100%)' }}>
        <div class="head">
          <Icon name={c.yes ? 'help' : 'cash'} size="lg" />
          <h2 class="grow">{c.title}</h2>
        </div>
        <div class="body">
          <p>{c.detail}</p>
          <div class="row between">
            <button class="btn" onClick={() => game.cancelConfirm()}>
              Cancel
            </button>
            <button class="btn primary" onClick={() => c.onYes()}>
              {c.yes ?? 'Yes, spend it'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The playtest note box: one line or a few, stamped with the act, the date and the screen. */
export function NoteModal() {
  const game = useGame();
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (game.noteOpen) {
      setText('');
      setTimeout(() => ref.current?.focus(), 0);
    }
  }, [game.noteOpen]);
  if (!game.noteOpen || !game.state) return null;
  const s = game.state;
  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && game.closeNote()}>
      <div class="modal frame" role="dialog" aria-label="Playtest note" style={{ width: 'min(460px, 100%)' }}>
        <div class="head">
          <span class="ico">✎</span>
          <h2 class="grow">Playtest note</h2>
          <span class="small muted">
            Act {s.act} · {fmtDate(s.day)}
          </span>
        </div>
        <div class="body">
          <textarea
            ref={ref}
            class="note-input"
            rows={4}
            value={text}
            placeholder="Too slow here? Confusing? Lovely? Anything goes."
            onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                game.addNote(text);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                game.closeNote();
              }
            }}
          />
          <div class="row between">
            <button class="btn" onClick={() => game.closeNote()}>
              Cancel
            </button>
            <button class="btn primary" onClick={() => game.addNote(text)} disabled={!text.trim()}>
              Save note
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
