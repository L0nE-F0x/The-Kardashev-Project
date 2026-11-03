import { GameCtx, useGame } from './components';
import type { Game } from '../game/game';
import { TopBar } from './TopBar';
import { Dock } from './Dock';
import { Objectives } from './Objectives';
import { Inspector } from './Inspector';
import { ComputePanel } from './panels/ComputePanel';
import { OrdersPanel } from './panels/OrdersPanel';
import { ResearchPanel } from './panels/ResearchPanel';
import { FinancePanel } from './panels/FinancePanel';
import { GoalsPanel, NewsPanel, SettingsPanel } from './panels/MiscPanels';
import { ActCompleteModal, AwayModal, EventModal } from './Modals';
import { DioramaBar, LinkHint, MapTooltip, Ticker, TipLayer, Toasts } from './Overlays';
import { TitleScreen } from './TitleScreen';

function Hud() {
  const game = useGame();
  if (game.mode === 'title' || !game.state) return <TitleScreen />;
  const panel = game.panel;
  return (
    <>
      <TopBar />
      <Dock />
      {game.mode === 'map' && <Objectives />}
      <div class="side">{game.mode === 'map' || game.selection?.kind === 'site' ? <Inspector /> : null}</div>
      {panel === 'compute' && <ComputePanel />}
      {panel === 'orders' && <OrdersPanel />}
      {panel === 'research' && <ResearchPanel />}
      {panel === 'finance' && <FinancePanel />}
      {panel === 'news' && <NewsPanel />}
      {panel === 'goals' && <GoalsPanel />}
      {panel === 'settings' && <SettingsPanel />}
      <DioramaBar />
      <LinkHint />
      <Ticker />
      <Toasts />
      <MapTooltip />
      <EventModal />
      <AwayModal />
      <ActCompleteModal />
    </>
  );
}

export function App({ game }: { game: Game }) {
  return (
    <GameCtx.Provider value={game}>
      <Hud />
      <TipLayer />
    </GameCtx.Provider>
  );
}
