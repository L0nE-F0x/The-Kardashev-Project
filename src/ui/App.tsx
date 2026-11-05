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
import { BlocsPanel, CrunchTracker, DealsPanel, TeamPanel } from './panels/Act2Panels';
import { CharterPanel, CouncilPanel, ThresholdTracker } from './panels/Act3Panels';
import { HeatWallTracker, JumpOverlay, JumpReportModal, PlanModal, PlanetPanel } from './panels/Act4Panels';
import { EndingOverlay, EraOverlay, EraPlanModal, EraReportModal, SolarMaxTracker, SystemPanel } from './panels/Act5Panels';
import { ActCompleteModal, AwayModal, EventModal, GameOverModal } from './Modals';
import { ConfirmModal, DecisionPill, DioramaBar, FpsCounter, LinkHint, MapTooltip, NoteModal, RotateOverlay, Ticker, TipLayer, Toasts, UpdateToast } from './Overlays';
import { MainMenu } from './menu/MainMenu';
import { SettingsBody } from './menu/SettingsScreen';
import { FieldGuideBody } from './menu/FieldGuide';
import { BriefingOverlay, TutorialOverlay } from './Tutorial';
import { SandboxControls } from './menu/SandboxControls';

function Hud() {
  const game = useGame();
  if (game.mode === 'title' || !game.state) return <MainMenu />;
  // the Type I ending takes the whole screen
  if (game.ending) return <EndingOverlay />;
  const panel = game.panel;
  return (
    <>
      <TopBar />
      <Dock />
      {game.mode === 'map' && <Objectives />}
      <CrunchTracker />
      <ThresholdTracker />
      <HeatWallTracker />
      <SolarMaxTracker />
      <div class="side">{game.mode === 'map' || game.selection?.kind === 'site' ? <Inspector /> : null}</div>
      {panel === 'compute' && <ComputePanel />}
      {panel === 'orders' && <OrdersPanel />}
      {panel === 'research' && <ResearchPanel />}
      {panel === 'finance' && <FinancePanel />}
      {panel === 'news' && <NewsPanel />}
      {panel === 'goals' && <GoalsPanel />}
      {panel === 'team' && <TeamPanel />}
      {panel === 'deals' && <DealsPanel />}
      {panel === 'blocs' && <BlocsPanel />}
      {panel === 'charter' && <CharterPanel />}
      {panel === 'council' && <CouncilPanel />}
      {panel === 'planet' && <PlanetPanel />}
      {panel === 'system' && <SystemPanel />}
      {panel === 'settings' && (
        <Panel title="Settings" icon="settings" class="wide" onClose={() => game.openPanel(null)}>
          <SettingsBody />
        </Panel>
      )}
      {panel === 'sandbox' && game.state.meta.sandbox && (
        <Panel title="Sandbox" icon="research" class="wide" onClose={() => game.openPanel(null)}>
          <p class="small muted">Flip these any time. A sandbox keeps no records and unlocks nothing.</p>
          <SandboxControls value={game.state.meta.sandbox} onChange={(v) => game.setSandbox(v)} />
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
      <BriefingOverlay />
      <JumpOverlay />
      <EraOverlay />
      <EventModal />
      <PlanModal />
      <JumpReportModal />
      <EraPlanModal />
      <EraReportModal />
      <AwayModal />
      <ActCompleteModal />
      <GameOverModal />
      <ConfirmModal />
      <NoteModal />
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
