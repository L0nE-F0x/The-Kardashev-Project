import { Icon, useGame } from './components';
import type { PanelId } from '../game/game';
import type { IconName } from './icons';

export function Dock() {
  const game = useGame();
  const s = game.state!;
  const items: [PanelId, IconName, string, number?][] = [
    ['compute', 'compute', 'Compute & models (C)', s.training ? undefined : s.models.length < 2 ? 1 : undefined],
    ['orders', 'orders', 'Chip orders & shipping (O)', s.shipments.length || undefined],
    ['research', 'research', 'Research (R)', s.research.current ? undefined : 1],
    ['finance', 'finance', 'Finance (F)'],
    ...(s.act >= 2
      ? ([
          ['team', 'team', 'Team · advisor jobs (T)', s.jobs && Object.values(s.jobs).some((j) => j?.on) ? undefined : 1],
          ['deals', 'deal', 'Deals: supply, customers, companies (E)', s.capital.offers.length + s.startups.offers.length || undefined],
          ['blocs', 'blocs', 'Blocs · diplomacy (P)', s.capital.sovereign.filter((d) => d.status === 'offer').length || undefined],
        ] as [PanelId, IconName, string, number?][])
      : []),
    ...((s.act ?? 1) >= 3 && s.charter
      ? ([
          ['charter', 'charter', 'The Charter: treasury, contracts, missions, partners, world (H)', s.charter.tenders.filter((t) => t.bids.length && !t.pending.length).length || undefined],
          ['council', 'council', 'The Council: resolutions and votes (U)', !s.charter.council.agenda.length && s.charter.capital >= 10 ? 1 : undefined],
        ] as [PanelId, IconName, string, number?][])
      : []),
    ['goals', 'goals', 'Goals (G)'],
    ['guide', 'guide', 'Field Guide (B)', game.guideBadge() || undefined],
    ['news', 'news', 'News (N)'],
  ];
  return (
    <div class="dock frame">
      {items.map(([id, icon, tip, badge]) => (
        <button key={id} class={`btn ${game.panel === id ? 'active' : ''}`} onClick={() => game.openPanel(id)} data-tip={tip} aria-label={tip} data-tut={`dock-${id}`}>
          <Icon name={icon} size="lg" />
          {badge ? <span class="badge">{badge > 9 ? '9+' : badge}</span> : null}
        </button>
      ))}
      <div class="sep" />
      <button class={`btn ${game.tool?.kind === 'link' ? 'active' : ''}`} onClick={() => game.setTool(game.tool?.kind === 'link' ? null : { kind: 'link', from: null })} data-tip={'Draw a transmission line between two of your sites (L).\nPools their power; costs ~$0.4M/km.'} aria-label="Transmission line tool">
        <Icon name="link" size="lg" />
      </button>
      {s.act >= 2 && (
        <button class={`btn ${game.tool?.kind === 'fiber' ? 'active' : ''}`} onClick={() => game.setTool(game.tool?.kind === 'fiber' ? null : { kind: 'fiber', from: null })} data-tut="dock-fiber" data-tip={'Lay fiber between two of your sites (I).\nJoins their regions into your private network: halls sell into both markets at low latency. ~$0.08M/km.'} aria-label="Fiber tool">
          <Icon name="fiber" size="lg" />
        </button>
      )}
      <button class={`btn ${game.panel === 'settings' ? 'active' : ''}`} onClick={() => game.openPanel('settings')} data-tip="Settings & save" aria-label="Settings">
        <Icon name="settings" size="lg" />
      </button>
    </div>
  );
}
