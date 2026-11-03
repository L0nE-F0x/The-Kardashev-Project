import { GameCtx, Panel, useGame } from './components';
import type { Game } from '../game/game';
import { TopBar } from './TopBar';
import { Dock } from './Dock';
import { Objectives } from './Objectives';
import { Inspector } from './Inspector';
import { ComputePanel } from './panels/ComputePanel';
import { OrdersPanel } from './panels/OrdersPanel';
import { ResearchPanel } from './panels/ResearchPanel';
import { FinancePanel } from './panels/FinancePanel';
import { GoalsPanel, NewsPanel } from './panels/MiscPanels';
import { ActCompleteModal, AwayModal, EventModal, GameOverModal } from './Modals';
import { ConfirmModal, DecisionPill, DioramaBar, FpsCounter, LinkHint, MapTooltip, RotateOverlay, Ticker, TipLayer, Toasts, UpdateToast } from './Overlays';
import { MainMenu } from './menu/MainMenu';
import { SettingsBody } from './menu/SettingsScreen';
import { FieldGuideBody } from './menu/FieldGuide';
import { TutorialOverlay } from './Tutorial';

function Hud() {
  const game = useGame();
  if (game.mode === 'title' || !game.state) return <MainMenu />;
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
      {panel === 'settings' && (
        <Panel title="Settings" icon="settings" class="wide" onClose={() => game.openPanel(null)}>
          <SettingsBody />
        </Panel>
      )}
      {panel === 'guide' && (
        <Panel title="Field Guide" icon="research" class="wide research" onClose={() => game.openPanel(null)}>
          <FieldGuideBody />
        </Panel>
      )}
      <DioramaBar />
      <LinkHint />
      <DecisionPill />
      <Ticker />
      <Toasts />
      <MapTooltip />
      <TutorialOverlay />
      <EventModal />
      <AwayModal />
      <ActCompleteModal />
      <GameOverModal />
      <ConfirmModal />
    </>
  );
}

export function App({ game }: { game: Game }) {
  return (
    <GameCtx.Provider value={game}>
      <Hud />
      <TipLayer />
      <UpdateToast />
      <FpsCounter />
      <RotateOverlay />
    </GameCtx.Provider>
  );
}
