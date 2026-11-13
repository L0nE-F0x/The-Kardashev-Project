import { useEffect, useRef, useState } from 'preact/hooks';
import { useGame } from './components';
import type { PanelId } from '../game/game';
import type { IconName } from './icons';
import { researchable } from '../sim/actions';
import { councilReady } from '../sim/council';
import { DockIcon } from './DockIcon';

/**
 * Later acts add a panel each, so the dock can outgrow a short screen (Act V has 17 buttons). The buttons shrink
 * to fit (CSS, from `--dock-n`); where even that isn't enough (phones) the dock scrolls, and `more` fades its foot
 * so it's clear there's more below.
 */
function useScrollHint(n: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  // a key needs about 52 px to carry its name under its picture: with less, the names go and the flyout says them
  const [tight, setTight] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 4);
      setTight(el.clientHeight / n < 52);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', check);
      ro.disconnect();
    };
  }, [n]);
  return { ref, more, tight };
}

type Item = { id: PanelId; icon: IconName; title: string; key: string; what: string; badge?: number; group: number; short?: string };

export function Dock() {
  const game = useGame();
  const s = game.state!;
  const act = s.act ?? 1;
  const items: Item[] = [
    { id: 'compute', icon: 'compute', title: 'Compute & models', short: 'Compute', key: 'C', what: 'Split your compute, rent more, train the next model.', badge: s.training ? undefined : s.models.length < 2 ? 1 : undefined, group: 0 },
    { id: 'orders', icon: 'orders', title: 'Orders', key: 'O', what: 'Buy chips and follow the ships that carry them.', badge: s.shipments.length || undefined, group: 0 },
    { id: 'research', icon: 'research', title: 'Research', key: 'R', what: 'Choose what the lab works on next.', badge: s.research.current || !researchable(s).length ? undefined : 1, group: 0 },
    { id: 'finance', icon: 'finance', title: 'Finance', key: 'F', what: 'Cash, revenue, running costs and loans.', group: 0 },
    { id: 'stats', icon: 'chart', title: 'Stats', key: 'K', what: 'Charts of your whole run.', group: 0 },
    ...(act >= 2
      ? ([
          { id: 'team', icon: 'team', title: 'Team', key: 'T', what: 'Give your advisors standing jobs.', badge: s.jobs && Object.values(s.jobs).some((j) => j?.on) ? undefined : 1, group: 1 },
          { id: 'deals', icon: 'deal', title: 'Deals', key: 'E', what: 'Supply deals, customers and companies for sale.', badge: s.capital.offers.length + s.startups.offers.length || undefined, group: 1 },
          { id: 'blocs', icon: 'blocs', title: 'Blocs', key: 'P', what: 'Where every government stands with you.', badge: s.capital.sovereign.filter((d) => d.status === 'offer').length || undefined, group: 1 },
        ] as Item[])
      : []),
    ...(act >= 3 && s.charter
      ? ([
          { id: 'charter', icon: 'charter', title: 'The Charter', key: 'H', what: 'Treasury, contracts, missions, partners, the world.', badge: s.charter.tenders.filter((t) => t.bids.length && !t.pending.length).length || undefined, group: 2 },
          { id: 'council', icon: 'council', title: 'The Council', key: 'U', what: 'Resolutions and votes.', badge: councilReady(s) ? 1 : undefined, group: 2 },
        ] as Item[])
      : []),
    ...(act >= 4 && s.planet ? ([{ id: 'planet', icon: 'globe', title: 'The Planet', key: 'Y', what: 'Provinces, the grid, fusion, space, climate.', badge: s.planet.planOpen ? 1 : undefined, group: 2 }] as Item[]) : []),
    ...(act >= 5 && s.system ? ([{ id: 'system', icon: 'swarm', title: 'The System', key: 'X', what: 'The Thermal Line, foundries, asteroids, the swarm, minds, people.', badge: s.system.planOpen ? 1 : undefined, group: 2 }] as Item[]) : []),
    { id: 'goals', icon: 'goals', title: 'Goals', key: 'G', what: 'What this act asks of you.', group: 3 },
    { id: 'guide', icon: 'guide', title: 'Field Guide', short: 'Guide', key: 'B', what: 'The real science and industry behind the game.', badge: game.guideBadge() || undefined, group: 3 },
    { id: 'news', icon: 'news', title: 'News', key: 'N', what: game.missedMessages ? `${game.missedMessages} message${game.missedMessages > 1 ? 's' : ''} you may have missed.` : 'Everything that has happened.', badge: game.missedMessages || undefined, group: 3 },
  ];
  // the panels, the line tool, the fiber tool (Act II on), How to play and Settings
  const n = items.length + (s.act >= 2 ? 4 : 3);
  const { ref, more, tight } = useScrollHint(n);
  return (
    <div ref={ref} data-tut="dock" class={`dock frame ${n >= 15 ? 'many' : ''} ${more ? 'more' : ''} ${tight ? 'tight' : ''}`} style={{ '--dock-n': n }}>
      {items.map(({ id, icon, title, key, what, badge, group, short }, i) => (
        <>
          {i > 0 && items[i - 1].group !== group && <div class="gap" key={`gap${group}`} />}
          <button key={id} class={`btn ${game.panel === id ? 'active' : ''}`} onClick={() => game.openPanel(id)} data-tip={`${title}\n${what}`} data-key={key} data-tip-at="right" aria-label={`${title} (${key})`} data-tut={`dock-${id}`}>
            <DockIcon name={icon} />
            <span class="dk-l">{short ?? title.replace(/^The /, '')}</span>
            {badge ? <span class="badge">{badge > 9 ? '9+' : badge}</span> : null}
          </button>
        </>
      ))}
      <div class="sep" />
      <button class={`btn ${game.tool?.kind === 'link' ? 'active' : ''}`} onClick={() => game.setTool(game.tool?.kind === 'link' ? null : { kind: 'link', from: null })} data-tip={'Transmission line\nJoin two of your sites: they pool their power. About $0.4M a km.'} data-key="L" data-tip-at="right" aria-label="Transmission line tool (L)">
        <DockIcon name="link" />
        <span class="dk-l">Line</span>
      </button>
      {s.act >= 2 && (
        <button class={`btn ${game.tool?.kind === 'fiber' ? 'active' : ''}`} onClick={() => game.setTool(game.tool?.kind === 'fiber' ? null : { kind: 'fiber', from: null })} data-tut="dock-fiber" data-tip={'Fiber\nJoin two of your sites’ regions into your private network: halls sell into both markets at low latency. About $0.08M a km.'} data-key="I" data-tip-at="right" aria-label="Fiber tool (I)">
          <DockIcon name="fiber" />
          <span class="dk-l">Fiber</span>
        </button>
      )}
      <div class="sep" />
      <button class={`btn ${game.panel === 'howto' ? 'active' : ''}`} onClick={() => game.openHowTo()} data-tip={'How to play\nThe handbook: the loop, every panel, each act.'} data-key="?" data-tip-at="right" aria-label="How to play (?)" data-tut="dock-howto">
        <DockIcon name="help" />
        <span class="dk-l">Help</span>
      </button>
      <button class={`btn ${game.panel === 'settings' ? 'active' : ''}`} onClick={() => game.openPanel('settings')} data-tip={'Settings\nDisplay, sound, controls, saves.'} data-tip-at="right" aria-label="Settings">
        <DockIcon name="settings" />
        <span class="dk-l">Settings</span>
      </button>
    </div>
  );
}
