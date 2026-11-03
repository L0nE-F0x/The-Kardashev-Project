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
    ['goals', 'goals', 'Goals (G)'],
    ['news', 'news', 'News (N)'],
  ];
  return (
    <div class="dock frame">
      {items.map(([id, icon, tip, badge]) => (
        <button key={id} class={`btn ${game.panel === id ? 'active' : ''}`} onClick={() => game.openPanel(id)} data-tip={tip} aria-label={tip}>
          <Icon name={icon} size="lg" />
          {badge ? <span class="badge">{badge > 9 ? '9+' : badge}</span> : null}
        </button>
      ))}
      <div class="sep" />
      <button class={`btn ${game.tool?.kind === 'link' ? 'active' : ''}`} onClick={() => game.setTool(game.tool ? null : { kind: 'link', from: null })} data-tip={'Draw a transmission line between two of your sites (L).\nPools their power; costs ~$0.4M/km.'} aria-label="Transmission line tool">
        <Icon name="link" size="lg" />
      </button>
      <button class={`btn ${game.panel === 'settings' ? 'active' : ''}`} onClick={() => game.openPanel('settings')} data-tip="Settings & save" aria-label="Settings">
        <Icon name="settings" size="lg" />
      </button>
    </div>
  );
}
