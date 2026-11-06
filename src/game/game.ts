import type { FacilityType, GameState, SandboxOpts, SupplierId } from '../sim/types';
import type { MapLod } from '../world/mapData';
import type { Router } from '../world/routing';
import type { PixelStage, Scene } from '../render/stage';
import type { RegionId } from '../content/mapcodes';
import { newGame, type NewGameOptions } from '../sim/state';
import { newAct2Game } from '../sim/act2';
import { newAct3Game } from '../sim/act3';
import { newAct4Game } from '../sim/act4preset';
import { newAct5Game } from '../sim/act5preset';
import * as ERA from '../sim/eras';
import { haltFoundry as haltFoundrySim } from '../sim/foundries';
import { claimAsteroid as claimAst } from '../sim/asteroids';
import type { EraPlan, EraRecord } from '../sim/types';
import * as PL from '../sim/plans';
import * as AI from '../sim/airegions';
import type { AiId, FivePlan, JumpRecord } from '../sim/types';
import * as CH from '../sim/charter';
import * as CO from '../sim/council';
import { requestOwnLicence as requestLicence } from '../sim/frontier';
import { setDesk as setDeskJob } from '../sim/desk';
import type { ContractKind, ContractSize } from '../sim/types';
import type { CharterTab } from '../ui/panels/Act3Panels';
import type { RegionId as Rid } from '../content/mapcodes';
import type { AdvisorId, Job } from '../sim/types';
import { refreshStats, tick } from '../sim/tick';
import * as A from '../sim/actions';
import { dismissEvent, resolveEvent } from '../sim/events';
import { offlineAllowed, simulateOffline, type OfflineReport } from '../sim/offline';
import { buildCost, landCost, linkCost, upgradeCost } from '../sim/model';
import { OWN_CABLE_COST } from '../content/network';
import { LOBBY, RULE_BY_ID } from '../content/politics';
import { DEAL_BY_ID } from '../content/stack';
import { siteDistanceKm } from '../content/sites';
import { fmtMoney } from '../sim/core';
import { getEra, onEraChange, setEra, syncCssVars, type Era } from '../render/palette';
import { deleteSlot, listSlots, loadSlot, migrateLegacySave, newSlotId, writeSlot, MAX_SLOTS, type SlotInfo } from '../save/save';
import { applyCssSettings, loadSettings, saveSettings, type Settings } from '../save/settings';
import { guideUnseen, unlockGuide } from '../save/guide';
import { unlockedFor, GUIDE_BY_ID } from '../content/fieldGuide';
import { sfx } from '../audio/sfx';
import { resumeAudio, setVolumes, suspendAudio, unlockOnGesture } from '../audio/engine';
import { musicUnlocked, playMusic, type Track } from '../audio/music';
import { restartAmbience, setAmbience } from '../audio/ambience';
import { canFullscreen, canPromptInstall, checkAppUpdate, enterFullscreen, initInstallPrompt, isPhone, isStandalone, onInstallChange, registerServiceWorker } from '../platform/platform';
import type { AppUpdate, AppUpdateStatus } from '../platform/platform';
import { kardashev } from '../sim/model';
import { TUTORIAL, PLAY_STEP } from './tutorial';
import { BRIEFINGS } from './briefings';
import { checkTips, type ActiveTip } from './tips';
import type { TourDirector } from './tour';
import { ACHIEVEMENT_BY_ID, TEAM_TO_MEET, earned } from '../content/achievements';
import { achievements, saveAchievements } from '../save/achievements';
import { segmentsLit } from '../sim/systemView';
import { EVENT_BY_ID } from '../content/events';

export type Selection = { kind: 'site'; id: string } | { kind: 'region'; id: RegionId } | null;
export type PanelId = 'compute' | 'orders' | 'research' | 'finance' | 'news' | 'settings' | 'goals' | 'guide' | 'team' | 'deals' | 'blocs' | 'charter' | 'council' | 'planet' | 'system' | 'sandbox' | 'howto' | null;
export type PlanetTab = 'overview' | 'provinces' | 'grid' | 'fusion' | 'space' | 'climate';
export type SystemTab = 'overview' | 'thermal' | 'foundries' | 'asteroids' | 'swarm' | 'minds' | 'people';
/** The Type I ending, step by step. */
export type EndingStep = 'cinematic' | 'epilogue' | 'credits' | 'stats' | 'card';
export type Tool = { kind: 'link' | 'fiber'; from: string | null } | null;
export type Mode = 'title' | 'map' | 'diorama' | 'orbit' | 'system';
export type MenuScreen = 'main' | 'new' | 'load' | 'settings' | 'guide' | 'whatsnew' | 'credits' | 'install' | 'achievements' | 'howto';
export type Hover =
  | { kind: 'site'; id: string; clientX: number; clientY: number }
  | { kind: 'region'; id: RegionId; clientX: number; clientY: number }
  | { kind: 'shipment'; id: string; clientX: number; clientY: number }
  | { kind: 'facility'; id: string; clientX: number; clientY: number }
  | { kind: 'slot'; siteId: string; index: number; clientX: number; clientY: number }
  | { kind: 'chokepoint'; id: string; clientX: number; clientY: number }
  | null;

export interface Toast {
  id: number;
  text: string;
  advisor?: string;
  kind: 'good' | 'bad' | 'info';
  at: number;
}

export interface ConfirmRequest {
  title: string;
  detail: string;
  onYes: () => void;
  /** The yes button's words (default: a spend). */
  yes?: string;
}

export interface SceneFactory {
  map(game: Game): Scene;
  diorama(game: Game, siteId: string): Scene;
  tour(game: Game): TourDirector;
  /** Act IV: the planet from orbit. */
  orbit?(game: Game): Scene;
  /** Act V: the inner solar system (cinematic for the Type I ending). */
  system?(game: Game, opts?: { cinematic?: boolean }): Scene;
}

/** Game days a time jump advances per 1/60 s of real time (the map time-lapses while it runs). */
const JUMP_DAYS_PER_FRAME = 7;

const SPEEDS = [0, 1, 2, 4, 8] as const;
export type Speed = (typeof SPEEDS)[number];

/** Owns the simulation, the clock, the scenes, saves and the UI-facing state. */
export class Game {
  state: GameState | null = null;
  slotId: string | null = null;
  mode: Mode = 'title';
  menuScreen: MenuScreen = 'main';
  speed: Speed = 1;
  /** Speed to restore when a blocking card closes. */
  private resumeSpeed: Speed = 1;
  /** The clock was stopped by something on screen (not by the player): it starts again when that goes away. */
  private autoPaused = false;
  selection: Selection = null;
  panel: PanelId = null;
  tool: Tool = null;
  hover: Hover = null;
  dioramaSite: string | null = null;
  /** Diorama clock runs a full day every ~40 s instead of following the real clock. */
  dioramaTimelapse = false;
  toasts: Toast[] = [];
  awayReport: OfflineReport | null = null;
  showActComplete = false;
  /** Act III: which Charter tab is open, and a contract draft from the inspector. */
  charterTab: CharterTab = 'overview';
  /** Act IV. */
  planetTab: PlanetTab = 'overview';
  /** The report of the jump that just finished (shown until dismissed). */
  jumpReport: JumpRecord | null = null;
  /** Finish the running jump as fast as possible. */
  jumpFast = false;
  /** Act V. */
  systemTab: SystemTab = 'overview';
  /** The report of the era that just finished (shown until dismissed). */
  eraReport: EraRecord | null = null;
  /** The Type I ending in progress: which step, which epilogue card. */
  ending: { step: EndingStep; index: number; at: number } | null = null;
  charterDraft: { kind?: ContractKind; where?: string } | null = null;
  /** Act II unlock briefing on screen (UI-only; which ones were seen is saved in meta). */
  briefing: { id: string; step: number } | null = null;
  private briefingResume: Speed | null = null;
  private act2Music = false;
  private act3Music = false;
  /** With auto-pause off, event cards wait behind a pill until opened. */
  eventOpen = false;
  confirm: ConfirmRequest | null = null;
  settings: Settings = loadSettings();
  eraOverride: Era | null = null;
  updateReady: (() => void) | null = null;
  /** The installed app (desktop or Android) has a newer release; `hidden` after "Later" until the next start. */
  appUpdate: { version: string; install: AppUpdate['install']; status: AppUpdateStatus; hidden: boolean } | null = null;
  installAvailable = false;
  /** Demo world shown behind the main menu. */
  showcase: GameState | null = null;
  tour: TourDirector | null = null;
  tourCaption = '';
  fps = 0;
  version = 0;

  private listeners = new Set<() => void>();
  private acc = 0;
  private lastAutosave = 0;
  private toastId = 0;
  private lastArrivalChime = -999;
  /** Achievement toasts that came during the tutorial, shown when it ends. */
  private heldToasts: { text: string; kind: Toast['kind']; advisor?: string }[] = [];
  private notifyQueued = false;
  private lastObjectiveSeen: string | number | boolean | undefined;
  private lastNewsSeen = 0;
  private hiddenAt = 0;
  private frameCount = 0;
  /** Real time owed to a running jump or era, in 1/60 s ticks (a week each). */
  private jumpTicks = 0;
  private fpsTime = 0;
  private fpsFrames = 0;

  constructor(
    readonly stage: PixelStage,
    readonly world: { lods: MapLod[]; router: Router },
    private readonly scenes: SceneFactory,
  ) {
    migrateLegacySave();
    applyCssSettings(this.settings);
    setVolumes({ master: this.settings.master, music: this.settings.music, sfx: this.settings.sfx });
    this.stage.setZoomBoost(this.settings.zoom);
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.save());
    unlockOnGesture(() => {
      musicUnlocked();
      restartAmbience();
    });
    // a new era, a new soundtrack (the menu keeps its theme; the ending keeps its own)
    onEraChange(() => {
      if (this.mode !== 'title' && this.state && !this.ending) playMusic(this.eraTrack());
    });
    initInstallPrompt();
    onInstallChange(() => {
      this.installAvailable = canPromptInstall();
      this.notify();
    });
    void registerServiceWorker((apply) => {
      this.updateReady = apply;
      this.notify();
    });
    this.watchAppUpdates();
    this.autoFullscreen();
    document.addEventListener('fullscreenchange', () => this.notify());
  }

  /**
   * Phones in a browser tab lose a third of a landscape screen to the address bar and system bars:
   * the first tap of the visit goes fullscreen (browsers only allow it inside a tap). After that the
   * top bar's fullscreen button brings it back if the player leaves.
   */
  private autoFullscreen(): void {
    if (!isPhone() || isStandalone() || !canFullscreen()) return;
    const go = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      window.removeEventListener('pointerup', go, true);
      if (this.settings.phoneFullscreen) void enterFullscreen();
    };
    window.addEventListener('pointerup', go, true);
  }

  get ctx() {
    return { router: this.world.router };
  }

  /** The world the scenes draw: your company in game, the showcase behind the menu. */
  get view(): GameState | null {
    return this.mode === 'title' ? this.showcase : this.state;
  }

  // ── subscription ──────────────────────────────────────────────────────────────────────────
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Schedule a UI refresh (coalesced to one per frame). */
  notify(): void {
    this.version++;
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    requestAnimationFrame(() => {
      this.notifyQueued = false;
      for (const fn of this.listeners) fn();
    });
  }

  // ── slots & lifecycle ─────────────────────────────────────────────────────────────────────
  slots(): SlotInfo[] {
    return listSlots();
  }

  slotsFull(): boolean {
    return listSlots().length >= MAX_SLOTS;
  }

  startNew(opts: NewGameOptions & { act2?: boolean; act3?: boolean; act4?: boolean; act5?: boolean }): boolean {
    if (this.slotsFull()) {
      this.toast(`All ${MAX_SLOTS} company slots are in use — delete one first.`, 'bad');
      return false;
    }
    this.state = opts.act5 ? newAct5Game(opts, this.ctx) : opts.act4 ? newAct4Game(opts, this.ctx) : opts.act3 ? newAct3Game(opts) : opts.act2 ? newAct2Game(opts) : newGame(opts);
    this.slotId = newSlotId();
    refreshStats(this.state);
    this.awayReport = null;
    this.heldToasts = [];
    this.showActComplete = false;
    this.resetScreen();
    // the garage is where Acts I–II start; a Steward starting at Act III–V begins on the world, not the garage
    this.selection = opts.act3 || opts.act4 || opts.act5 ? null : { kind: 'site', id: opts.homeSite };
    this.lastObjectiveSeen = undefined;
    this.lastNewsSeen = 0;
    this.speed = 0;
    this.resumeSpeed = opts.tutorial ? 0 : 1;
    if (opts.tutorial && !this.settings.tutorialOffered) this.updateSettings({ tutorialOffered: true });
    this.enterMap();
    this.save();
    sfx('start');
    return true;
  }

  continueSlot(id: string): boolean {
    const saved = loadSlot(id);
    if (!saved) {
      this.toast('That save could not be loaded.', 'bad');
      return false;
    }
    this.state = saved;
    this.slotId = id;
    this.resetScreen();
    const away = saved.savedAt ? Date.now() - saved.savedAt : 0;
    this.awayReport = null;
    if (this.settings.offline && away > 0 && !saved.meta.pausedAtSave && offlineAllowed(saved)) {
      const report = simulateOffline(saved, this.ctx, away, this.settings.offlineRate);
      if (report) this.awayReport = report;
    }
    refreshStats(saved);
    this.lastObjectiveSeen = saved.flags.lastObjective;
    this.lastNewsSeen = saved.news[0]?.day ?? 0;
    this.selection = null;
    this.showActComplete = false;
    this.enterMap();
    this.speed = this.awayReport || saved.events.active || (saved.meta.tutorialStep >= 0 && saved.meta.tutorialStep <= PLAY_STEP) ? 0 : 1;
    this.resumeSpeed = 1;
    sfx('start');
    return true;
  }

  /** Load a company from a save code or file into a free slot. */
  importCompany(s: GameState): boolean {
    this.save();
    if (this.slotsFull()) {
      this.toast(`All ${MAX_SLOTS} company slots are in use — delete one first.`, 'bad');
      return false;
    }
    s.savedAt = Date.now(); // an import is not time away
    const id = newSlotId();
    writeSlot(id, s);
    return this.continueSlot(id);
  }

  deleteCompany(id: string): void {
    deleteSlot(id);
    if (this.slotId === id) {
      this.slotId = null;
      this.state = null;
    }
    this.notify();
  }

  /** Overlays that belong to one company's screen (a briefing, a report, a note) don't follow you to the next. */
  private resetScreen(): void {
    this.briefing = null;
    this.briefingResume = null;
    this.eventOpen = false;
    this.jumpReport = null;
    this.eraReport = null;
    this.noteOpen = false;
    this.confirm = null;
    this.autoPaused = false;
    this.jumpFast = false;
    this.tip = null;
    this.tipStreak.clear();
    this.tipDay = -1;
    this.howtoTopic = null;
    this.skip = null;
  }

  quitToMenu(): void {
    this.save();
    this.resetScreen();
    this.state = null;
    this.slotId = null;
    this.mode = 'title';
    this.menuScreen = 'main';
    this.panel = null;
    this.tool = null;
    this.selection = null;
    this.hover = null;
    this.dioramaSite = null;
    this.confirm = null;
    // the tour's first shot sets the zoom itself (doing it here rebuilt a diorama at the map's size just before
    // destroying it)
    this.startTour();
    playMusic('menu');
    setAmbience('none');
    this.notify();
  }

  /** Called once at boot: show the menu with the cinematic tour behind it. */
  showMenu(): void {
    this.mode = 'title';
    this.menuScreen = 'main';
    this.startTour();
    playMusic('menu');
    setAmbience('none');
    this.notify();
  }

  makeMapScene(): Scene {
    return this.scenes.map(this);
  }

  /** The orbit and solar-system views for the menu tour (when the build has them). */
  makeOrbitScene(): Scene | null {
    return this.scenes.orbit ? this.scenes.orbit(this) : null;
  }

  makeSystemScene(): Scene | null {
    return this.scenes.system ? this.scenes.system(this) : null;
  }

  makeDioramaScene(siteId: string): Scene {
    return this.scenes.diorama(this, siteId);
  }

  private startTour(): void {
    this.tour?.stop();
    this.tour = this.scenes.tour(this);
    this.tour.start();
  }

  enterMap(): void {
    this.tour?.stop();
    this.tour = null;
    this.mode = 'map';
    this.dioramaSite = null;
    setAmbience('map');
    this.stage.setScene(this.scenes.map(this), this.settings.zoom);
    this.act2Music = (this.state?.act ?? 1) >= 2;
    this.act3Music = (this.state?.act ?? 1) >= 3;
    playMusic(this.eraTrack());
    this.notify();
  }

  /** The soundtrack follows the palette's era (Smog & Silicon → Swarmlight). */
  private eraTrack(): Track {
    return `era${getEra()}` as Track;
  }

  /** Act IV: zoom out to the planet from orbit. */
  enterOrbit(): void {
    if (!this.scenes.orbit || !this.state?.planet) return;
    this.mode = 'orbit';
    this.dioramaSite = null;
    setAmbience('space');
    this.hover = null;
    this.stage.setScene(this.scenes.orbit(this), this.settings.zoom);
    sfx('whoosh');
    this.notify();
  }

  get hasOrbitView(): boolean {
    return !!this.scenes.orbit && !!this.state?.planet;
  }

  /** Act V: zoom out again, to the inner solar system. */
  enterSystem(cinematic = false): void {
    if (!this.scenes.system || !this.state?.system) return;
    this.mode = 'system';
    setAmbience('space');
    this.dioramaSite = null;
    this.hover = null;
    this.stage.setScene(this.scenes.system(this, { cinematic }), this.settings.zoom);
    if (!cinematic) sfx('whoosh');
    this.notify();
  }

  get hasSystemView(): boolean {
    return !!this.scenes.system && !!this.state?.system;
  }

  /** V cycles the views: world map → orbit → solar system (Act V) → world map. */
  cycleView(): void {
    if (this.mode === 'orbit') {
      if (this.hasSystemView) this.enterSystem();
      else this.enterMap();
    } else if (this.mode === 'system') this.enterMap();
    else if (this.hasOrbitView) this.enterOrbit();
  }

  enterDiorama(siteId: string): void {
    this.mode = 'diorama';
    this.dioramaSite = siteId;
    // ten different places seen up close: a world tour
    const st = achievements();
    if (this.state && !st.places.includes(siteId)) {
      st.places.push(siteId);
      saveAchievements();
      if (st.places.length >= 10) this.achieve('world-tour');
    }
    this.hover = null;
    // dioramas are close-ups: twice the pixel size of the world map
    this.stage.setScene(this.scenes.diorama(this, siteId), this.settings.zoom * 2);
    sfx('whoosh');
    this.notify();
  }

  /** The installed apps look for a newer release a few seconds after starting, then every six hours. */
  private watchAppUpdates(): void {
    const look = async () => {
      if (this.appUpdate) return;
      const u = await checkAppUpdate();
      if (!u) return;
      this.appUpdate = { version: u.version, install: u.install, status: { phase: 'ready' }, hidden: false };
      this.notify();
    };
    window.setTimeout(() => void look(), 6000);
    window.setInterval(() => void look(), 6 * 3600 * 1000);
  }

  /** Update the installed app now (the game is saved first: the app restarts or gets replaced). */
  installAppUpdate(): void {
    const u = this.appUpdate;
    if (!u || (u.status.phase !== 'ready' && u.status.phase !== 'failed' && u.status.phase !== 'cancelled')) return;
    this.save();
    u.install((status) => {
      u.status = status;
      this.notify();
    });
  }

  hideAppUpdate(): void {
    if (this.appUpdate) this.appUpdate.hidden = true;
    this.notify();
  }

  save(): void {
    if (!this.state || !this.slotId) return;
    // a game left paused (or waiting on a decision) stays put while you're away
    this.state.meta.pausedAtSave = this.speed === 0 && this.mode !== 'title';
    const ok = writeSlot(this.slotId, this.state);
    this.lastAutosave = performance.now();
    if (!ok && !this.saveWarned) {
      this.saveWarned = true;
      this.toast('Couldn’t save: this browser is blocking storage (private mode?). Export your company from Settings → Data to keep it.', 'bad', 'penny');
    }
  }
  private saveWarned = false;

  private onVisibility(): void {
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = Date.now();
      this.save();
      if (this.settings.muteInBackground) suspendAudio();
      return;
    }
    resumeAudio();
    if (this.hiddenAt && this.state && this.mode !== 'title' && this.settings.offline && this.speed > 0 && offlineAllowed(this.state)) {
      const away = Date.now() - this.hiddenAt;
      const report = simulateOffline(this.state, this.ctx, away, this.settings.offlineRate);
      if (report) {
        refreshStats(this.state);
        this.syncFeedback(this.state);
        this.awayReport = report;
        this.notify();
      }
    }
    this.hiddenAt = 0;
  }

  // ── main loop ─────────────────────────────────────────────────────────────────────────────
  /** True while something on screen must be answered before time moves on. */
  get blocked(): boolean {
    const s = this.state;
    if (!s) return true;
    return (
      (!!s.events.active && (this.settings.autoPause || this.eventOpen)) ||
      !!s.planet?.jump ||
      !!this.jumpReport ||
      !!s.system?.jump ||
      !!this.eraReport ||
      (!!s.system?.planOpen && !s.events.active) ||
      !!this.ending ||
      (!!s.planet?.planOpen && !s.events.active) ||
      !!this.awayReport ||
      this.showActComplete ||
      !!s.meta.gameOver ||
      !!this.confirm
    );
  }

  frame(dt: number, now: number): void {
    this.frameCount++;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
      if (this.settings.fps) this.notify();
    }
    const s = this.state;
    if (this.mode === 'title') {
      this.tour?.update(dt);
    } else if (s) {
      s.meta.playtime += dt;
      this.logPlay(s, dt);
      this.soundCues(s);
      this.achTimer += dt;
      if (this.achTimer >= 1) {
        this.achTimer = 0;
        for (const a of earned(s, achievements().got)) this.unlockAchievement(a.id);
      }
      // time-lapses go by real time (a week per 1/60 s), not per drawn frame: as long on a 120 Hz screen as on 60
      const ticks = this.jumpTicks + dt * 60;
      const steps = Math.max(0, Math.min(2, Math.round(ticks)));
      this.jumpTicks = Math.max(-0.5, Math.min(0.5, ticks - steps));
      // Act IV: a time jump runs a week a tick so the map can time-lapse (or all at once when skipped)
      if (s.planet?.jump && (steps || this.jumpFast)) {
        const rec = this.stepBudgeted(() => PL.jumpStep(s, this.ctx, this.jumpFast ? 30 : JUMP_DAYS_PER_FRAME * steps), () => !!s.planet?.jump);
        refreshStats(s);
        if (rec) {
          this.jumpReport = rec;
          this.jumpFast = false;
          this.syncFeedback(s);
          sfx('fanfare');
          this.save();
        }
        if (rec || this.frameCount % 6 === 0) this.notify();
      }
      // Act V: an era (or the last climb) runs a week per frame while the views time-lapse
      if (s.system?.jump?.last && this.mode === 'map' && this.hasSystemView) this.enterSystem();
      if (s.system?.jump && (steps || this.jumpFast)) {
        const last = !!s.system.jump.last;
        const rec = this.stepBudgeted(() => ERA.eraStep(s, this.ctx, this.jumpFast ? 30 : (last ? JUMP_DAYS_PER_FRAME * 2 : JUMP_DAYS_PER_FRAME) * steps), () => !!s.system?.jump);
        refreshStats(s);
        if (rec) {
          this.eraReport = rec.last ? null : rec;
          // the last climb ends on the number itself: show the Type I card at once
          if (rec.last && !s.events.active && s.events.queue.length) {
            s.events.active = s.events.queue.shift()!;
            s.events.last[s.events.active.id] = s.day;
          }
          this.jumpFast = false;
          this.syncFeedback(s);
          sfx('fanfare');
          this.save();
        }
        if (rec || this.frameCount % 6 === 0) this.notify();
      }
      if (s.flags.endingStart && !s.flags.endingShown && !this.ending) this.startEnding();
      this.tickEnding(dt);
      if (this.skip) this.skipFrame(s);
      const blocked = this.blocked;
      if (blocked && this.speed !== 0) {
        this.resumeSpeed = this.speed;
        this.speed = 0;
        this.autoPaused = true;
        if (s.events.active) sfx(EVENT_BY_ID[s.events.active.id]?.big ? 'decision' : 'alert');
        this.notify();
      } else if (!blocked && this.autoPaused) {
        // whatever stopped the clock (a report, a confirm, a card) is gone: play on, as the player had it
        this.autoPaused = false;
        const hold = s.meta.tutorialStep >= 0 && s.meta.tutorialStep <= PLAY_STEP;
        if (this.speed === 0 && !hold && !s.meta.gameOver) {
          this.speed = this.resumeSpeed || 1;
          this.notify();
        }
      }
      if (!blocked && this.speed > 0) {
        this.acc += Math.min(dt, 0.25) * this.speed;
        let n = 0;
        while (this.acc >= 1 && n < 10) {
          this.acc -= 1;
          n++;
          tick(s, this.ctx);
          if (s.events.active && this.settings.autoPause) {
            this.acc = 0;
            break;
          }
          if (s.meta.gameOver) break;
        }
        if (n) this.afterTick();
      }
      this.tutorialCheck();
      if (now - this.lastAutosave > this.settings.autosaveSec * 1000) this.save();
    }
    this.updateEra();
    // main.ts paces the frames (60 a second at most, 30 with the battery saver or while nothing moves)
    this.stage.frame(dt, now);
  }

  /**
   * One frame of a jump or era: a single step normally; when skipping, as many month-long steps as fit in ~14 ms
   * (the rest follows next frame) so the page never freezes.
   */
  private stepBudgeted<T>(step: () => T | null, running: () => boolean): T | null {
    if (!this.jumpFast) return step();
    const t0 = performance.now();
    let rec: T | null = null;
    do rec = step();
    while (!rec && running() && performance.now() - t0 < 14);
    return rec;
  }

  /** After time moved without the frame loop (away, a jump): don't replay every chime and toast at once. */
  private syncFeedback(s: GameState): void {
    this.lastNewsSeen = s.news[0]?.day ?? this.lastNewsSeen;
    this.lastObjectiveSeen = s.flags.lastObjective;
  }

  /** Fraction of the current day elapsed — used to interpolate moving things. */
  dayFraction(): number {
    return this.mode === 'title' ? (this.tour?.dayFraction() ?? 0) : this.acc;
  }

  private afterTick(): void {
    const s = this.state!;
    this.updateTips(s);
    if (s.flags.lastObjective !== this.lastObjectiveSeen) {
      this.lastObjectiveSeen = s.flags.lastObjective;
      const news = s.news.find((n) => n.text.startsWith('✅'));
      if (news && s.meta.tutorialStep < 0) this.toast(news.text.replace('✅ ', ''), 'good', String(s.flags.lastObjectiveAdvisor ?? 'bit'));
      sfx('objective');
    }
    for (const n of s.news) {
      if (n.day <= this.lastNewsSeen) break;
      if (n.text.startsWith('🤖')) {
        sfx('fanfare');
        // a new model is the beat everything else builds toward: say it out loud, not just in the ticker
        if (n.text.includes(' released!')) this.toast(n.text.replace('🤖 ', ''), 'good', 'bit');
      } else if (n.text.startsWith('🧠') && n.text.includes(' trained')) this.toast(n.text.replace('🧠 ', ''), 'info', 'bit');
      else if (n.text.startsWith('🏗') && n.text.includes('online')) sfx('build');
      else if (n.text.startsWith('🔬')) sfx('research');
      else if (n.text.startsWith('📦') && n.text.includes('arrived')) {
        // a big order lands in a dozen batches: one chime a fortnight, not one per ship
        if (s.day - this.lastArrivalChime >= 14) sfx('cash');
        this.lastArrivalChime = s.day;
      } else if (n.text.startsWith('🔌 Grid connection energised')) sfx('build');
      else if (n.text.startsWith('💸 Penny')) this.toast(n.text.replace('💸 Penny: ', ''), 'bad', 'penny');
      else if (n.text.startsWith('📬 Bids are in for ')) this.toast(n.text.replace('📬 ', ''), 'info', 'mira');
      else if (n.text.startsWith('🗂 Bit (Charter desk): pausing') || n.text.startsWith('🗂 Bit (Charter desk): back on') || n.text.startsWith('🧪 Bit can’t start')) this.toast(n.text.replace(/^(🗂|🧪) /, ''), 'info', 'bit');
    }
    this.lastNewsSeen = s.news[0]?.day ?? this.lastNewsSeen;
    if (s.flags.act1Complete && !s.flags.act1Shown) {
      s.flags.act1Shown = true;
      this.showActComplete = true;
      sfx('fanfare');
    }
    if ((s.act ?? 1) >= 2 && !this.act2Music) {
      this.act2Music = true;
      if (this.mode !== 'title') playMusic(this.eraTrack());
    }
    if ((s.act ?? 1) >= 3 && !this.act3Music) {
      this.act3Music = true;
      if (this.mode !== 'title') playMusic(this.eraTrack());
    }
    if (s.flags.act2Complete && !s.flags.act2Shown) {
      s.flags.act2Shown = true;
      this.showActComplete = true;
      sfx('fanfare');
    }
    if (s.flags.act3Complete && !s.flags.act3Shown) {
      s.flags.act3Shown = true;
      this.showActComplete = true;
      sfx('fanfare');
    }
    if (s.flags.act4Complete && !s.flags.act4Shown) {
      s.flags.act4Shown = true;
      this.showActComplete = true;
      sfx('fanfare');
    }
    if (s.flags.endingStart && !s.flags.endingShown && !this.ending) this.startEnding();
    if (s.events.active && !this.settings.autoPause && !s.flags[`seen:${s.events.active.id}:${s.events.active.day}`]) {
      s.flags[`seen:${s.events.active.id}:${s.events.active.day}`] = true;
      sfx('alert');
    }
    this.checkGuide();
    this.checkBriefings();
    this.notify();
  }

  // ── Act II briefings ────────────────────────────────────────────────────────────────────────
  private checkBriefings(): void {
    const s = this.state;
    if (!s || (s.act ?? 1) < 2 || this.briefing || this.mode !== 'map' || s.events.active || this.awayReport || this.showActComplete || this.confirm) return;
    if (s.meta.tutorialStep >= 0) return;
    const seen = (s.meta.briefings ??= []);
    const next = BRIEFINGS.find((b) => !seen.includes(b.id) && b.when(s));
    if (!next) return;
    seen.push(next.id);
    this.briefing = { id: next.id, step: 0 };
    this.briefingResume = this.speed || this.resumeSpeed || 1;
    this.speed = 0;
    next.steps[0].enter?.(this);
    sfx('page');
  }

  briefingNext(): void {
    const b = this.briefing;
    if (!b) return;
    const def = BRIEFINGS.find((x) => x.id === b.id);
    if (!def || b.step + 1 >= def.steps.length) return this.briefingSkip();
    this.briefing = { id: b.id, step: b.step + 1 };
    def.steps[b.step + 1].enter?.(this);
    sfx('page');
    this.notify();
  }

  briefingSkip(): void {
    this.briefing = null;
    if (!this.blocked) this.speed = this.briefingResume ?? (this.resumeSpeed || 1);
    this.briefingResume = null;
    this.notify();
  }

  /** Show the Act II briefings again (from the Field Guide). */
  replayBriefings(): void {
    if (!this.state) return;
    this.state.meta.briefings = [];
    this.panel = null;
    this.notify();
  }

  private checkGuide(): void {
    const fresh = unlockGuide(unlockedFor(this.state))
      .map((id) => GUIDE_BY_ID[id])
      .filter((e) => e && e.unlock !== 'start');
    // the dock's badge counts them anyway: stay quiet while Bit is talking, and say several in one line
    if (!fresh.length || (this.state?.meta.tutorialStep ?? -1) >= 0) return;
    this.toast(
      fresh.length === 1
        ? `New Field Guide entry: ${fresh[0].title}`
        : fresh.length <= 3
          ? `${fresh.length} new Field Guide entries: ${fresh.map((e) => e.title).join(' · ')}`
          : `${fresh.length} new Field Guide entries — they’re waiting in the Field Guide (B).`,
      'info',
      'bit',
    );
  }

  guideBadge(): number {
    return guideUnseen();
  }

  private updateEra(): void {
    // the era follows K, or the act, whichever is later (Act II barely moves K but should look like the Grid Rush)
    const act = this.view?.act ?? 1;
    const byAct = (act >= 5 ? 4 : act >= 4 ? 3 : act >= 3 ? 2 : act >= 2 ? 1 : 0) as Era;
    const target: Era = this.eraOverride ?? (Math.max(byAct, this.eraForK(this.view?.stats.K ?? kardashev(19.6e12))) as Era);
    if (target !== getEra()) {
      setEra(target);
      syncCssVars();
    }
  }

  private eraForK(k: number): Era {
    if (k < 0.74) return 0;
    if (k < 0.78) return 1;
    if (k < 0.88) return 2;
    return 3;
  }

  // ── tutorial ──────────────────────────────────────────────────────────────────────────────
  get tutorialStep(): number {
    return this.state?.meta.tutorialStep ?? -1;
  }

  tutorialCheck(): void {
    const s = this.state;
    if (!s || s.meta.tutorialStep < 0 || s.events.active || this.awayReport) return;
    const step = TUTORIAL[s.meta.tutorialStep];
    if (!step) {
      s.meta.tutorialStep = -1;
      this.notify();
      return;
    }
    if (step.done?.(this)) this.tutorialNext();
  }

  tutorialNext(): void {
    const s = this.state;
    if (!s || s.meta.tutorialStep < 0) return;
    s.meta.tutorialStep += 1;
    if (s.meta.tutorialStep >= TUTORIAL.length) {
      s.meta.tutorialStep = -1;
      this.toast('Tutorial complete — the goal card takes it from here.', 'good', 'bit');
      this.flushHeldToasts();
    } else {
      TUTORIAL[s.meta.tutorialStep].enter?.(this);
      sfx('page');
    }
    this.notify();
  }

  tutorialSkip(): void {
    if (!this.state) return;
    this.state.meta.tutorialStep = -1;
    this.flushHeldToasts();
    if (this.speed === 0 && !this.blocked) this.setSpeed(1);
    this.notify();
  }

  private flushHeldToasts(): void {
    for (const t of this.heldToasts.splice(0).slice(-3)) this.toast(t.text, t.kind, t.advisor);
  }

  tutorialRestart(): void {
    if (!this.state) return;
    this.state.meta.tutorialStep = 0;
    this.panel = null;
    TUTORIAL[0].enter?.(this);
    this.notify();
  }

  /** Client position of a site marker (tutorial spotlight). */
  locate(target: string): { x: number; y: number } | null {
    const scene = this.stage.getScene() as (Scene & { locate?: (t: string) => { x: number; y: number } | null }) | null;
    return scene?.locate?.(target) ?? null;
  }

  // ── UI state ──────────────────────────────────────────────────────────────────────────────
  setSpeed(speed: Speed): void {
    // any speed button (or Space) ends a skip-ahead
    if (this.skip) {
      this.skip = null;
      this.acc = 0;
    }
    if (this.blocked && speed > 0) return;
    this.autoPaused = false;
    this.speed = speed;
    if (speed > 0) this.resumeSpeed = speed;
    sfx('click');
    this.notify();
  }

  togglePause(): void {
    if (this.skip) return this.setSpeed(0);
    this.setSpeed(this.speed === 0 ? this.resumeSpeed || 1 : 0);
  }

  select(sel: Selection): void {
    this.selection = sel;
    if (sel) sfx('select');
    this.notify();
  }

  openPanel(panel: PanelId): void {
    this.panel = this.panel === panel ? null : panel;
    sfx('click');
    this.notify();
  }

  /** Skip-ahead (Acts I–III, the goal card's ⏭): days run as fast as the frame budget allows until `until`. */
  skip: { until: number; label: string; resume: Speed } | null = null;

  /** Run the clock flat out until a game day (a card, a block or the tutorial stops it sooner). */
  skipTo(day: number, label: string): void {
    const s = this.state;
    if (!s || this.skip || day <= s.day || (s.act ?? 1) >= 4 || s.meta.tutorialStep >= 0 || this.blocked || s.meta.gameOver) return;
    this.skip = { until: day, label, resume: this.speed || this.resumeSpeed || 1 };
    this.speed = 0;
    this.autoPaused = false;
    sfx('click');
    this.notify();
  }

  /** Stop skipping; play on at the speed the player had. */
  stopSkip(): void {
    if (!this.skip) return;
    this.speed = this.skip.resume;
    this.skip = null;
    this.acc = 0;
    this.save();
    this.notify();
  }

  private skipFrame(s: GameState): void {
    const sk = this.skip!;
    if (this.blocked || s.meta.gameOver) return this.stopSkip();
    const t0 = performance.now();
    let n = 0;
    while (s.day < sk.until && performance.now() - t0 < 12) {
      tick(s, this.ctx);
      n++;
      if (s.events.active || s.meta.gameOver) break;
    }
    if (n) this.afterTick();
    if (s.day >= sk.until || s.events.active || s.meta.gameOver) {
      if (s.day >= sk.until) sfx('objective');
      this.stopSkip();
    } else if (this.frameCount % 4 === 0) this.notify();
  }

  /** The advisor tip on screen (see tips.ts). */
  tip: ActiveTip | null = null;
  private tipStreak = new Map<string, number>();
  private tipDay = -1;

  /** Has this device ever opened a campus view? (the campus tip) */
  get visitedCampus(): boolean {
    return achievements().places.length > 0;
  }

  dismissTip(): void {
    this.tip = null;
    this.notify();
  }

  /** Run the tip's one-click fix, then put it away. */
  tipAction(): void {
    const t = this.tip;
    this.tip = null;
    t?.action?.run(this);
    this.notify();
  }

  private updateTips(s: GameState): void {
    const days = this.tipDay < 0 ? 0 : Math.max(0, s.day - this.tipDay);
    this.tipDay = s.day;
    const r = checkTips(this, s, days, this.tipStreak);
    if (r === undefined) return;
    this.tip = r;
    if (r) sfx('page');
    this.notify();
  }

  /** How to Play: which topic to open at (a tip's "Learn more"). */
  howtoTopic: string | null = null;

  /** Open the handbook (in game: a panel; on the title screen: a window), optionally at a topic. */
  openHowTo(topic?: string): void {
    this.howtoTopic = topic ?? null;
    if (this.mode === 'title' || !this.state) this.openMenuScreen('howto');
    else if (topic) {
      this.panel = 'howto';
      sfx('click');
      this.notify();
    } else this.openPanel('howto');
  }

  openMenuScreen(screen: MenuScreen): void {
    this.menuScreen = screen;
    sfx('click');
    this.notify();
  }

  setHover(h: Hover): void {
    const same = JSON.stringify(h) === JSON.stringify(this.hover);
    if (same) return;
    this.hover = h;
    // only the hover card listens: the rest of the HUD doesn't re-render on every mouse move
    for (const fn of this.hoverListeners) fn();
  }

  private hoverListeners = new Set<() => void>();
  subscribeHover(fn: () => void): () => void {
    this.hoverListeners.add(fn);
    return () => this.hoverListeners.delete(fn);
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    sfx('click');
    this.notify();
  }

  toast(text: string, kind: Toast['kind'] = 'info', advisor?: string): void {
    // Bit's tutorial points at real buttons, often where the toasts stack (phones): only errors interrupt it;
    // an achievement waits for the end, the rest Bit is already saying
    if ((this.state?.meta.tutorialStep ?? -1) >= 0 && kind !== 'bad') {
      if (text.startsWith('🏆')) this.heldToasts.push({ text, kind, advisor });
      return;
    }
    const t: Toast = { id: ++this.toastId, text, kind, advisor, at: performance.now() };
    this.toasts = [...this.toasts.slice(-3), t];
    this.notify();
    setTimeout(() => {
      this.toasts = this.toasts.filter((x) => x.id !== t.id);
      this.notify();
    }, 6000);
  }

  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    applyCssSettings(this.settings);
    setVolumes({ master: this.settings.master, music: this.settings.music, sfx: this.settings.sfx });
    if (patch.zoom !== undefined) this.stage.setZoomBoost(this.settings.zoom * (this.mode === 'diorama' || this.tour?.inCampus() ? 2 : 1));
    this.notify();
  }

  setEraOverride(era: Era | null): void {
    this.eraOverride = era;
    this.updateEra();
    this.notify();
  }

  toggleTimelapse(): void {
    this.dioramaTimelapse = !this.dioramaTimelapse;
    sfx('click');
    this.notify();
  }

  dismissAway(): void {
    this.awayReport = null;
    const holdForTutorial = !!this.state && this.state.meta.tutorialStep >= 0 && this.state.meta.tutorialStep <= PLAY_STEP;
    this.speed = this.blocked || holdForTutorial ? 0 : this.resumeSpeed || 1;
    this.notify();
  }

  dismissActComplete(): void {
    this.showActComplete = false;
    this.speed = this.resumeSpeed || 1;
    this.notify();
  }

  openEvent(): void {
    this.eventOpen = true;
    this.notify();
  }

  // ── Act III: the blind trust locks the company's own buttons ─────────────────────────────────
  /** True (with a toast) when the company is in a blind trust and the player tries to run it. */
  private locked(): boolean {
    const s = this.state;
    if (!s?.charter?.blindTrust) return false;
    sfx('error');
    const co = s.planet?.company;
    this.toast(
      co === 'sell' ? `🔒 You sold ${s.company.name}: it isn’t yours to run any more.` : co === 'utility' ? `🔒 ${s.company.name} is the Charter’s public utility now: its advisors run it.` : `🔒 ${s.company.name} is in a blind trust — your advisors run it now. (Charter → Overview to leave.)`,
      'bad',
      'penny',
    );
    return true;
  }

  private lockedResult(): A.Result {
    return { ok: false, reason: 'Your company is in a blind trust' };
  }

  // ── actions (wrap the sim, refresh, give feedback) ─────────────────────────────────────────
  /** Run an action, asking first when it costs more than the player's confirm threshold. */
  private guarded(cost: number, title: string, run: () => void, purse: 'company' | 'charter' = 'company'): void {
    const limit = this.settings.confirmSpend;
    if (limit > 0 && cost >= limit) {
      const have = purse === 'charter' ? (this.state?.charter?.budget ?? 0) : (this.state?.finance.cash ?? 0);
      this.confirm = {
        title,
        detail: `This costs ${fmtMoney(cost)}. ${purse === 'charter' ? 'The Charter’s treasury holds' : 'You have'} ${fmtMoney(have)}.`,
        onYes: () => {
          this.confirm = null;
          run();
        },
      };
      sfx('alert');
      this.notify();
      return;
    }
    run();
  }

  cancelConfirm(): void {
    this.confirm = null;
    this.notify();
  }

  private after(r: A.Result, okSound: Parameters<typeof sfx>[0] = 'confirm'): A.Result {
    if (!this.state) return r;
    if (r.ok) {
      refreshStats(this.state);
      sfx(okSound);
    } else {
      sfx('error');
      this.toast(r.reason, 'bad');
    }
    this.notify();
    return r;
  }

  build(siteId: string, type: FacilityType): void {
    if (this.locked()) return;
    const s = this.state!;
    this.guarded(buildCost(s, type), 'Build this?', () => void this.after(A.build(s, siteId, type), 'build'));
  }

  requestGrid(siteId: string, mw: number) {
    if (this.locked()) return this.lockedResult();
    return this.after(A.requestGrid(this.state!, siteId, mw));
  }

  linkClick(siteId: string): void {
    const tool = this.tool;
    if (!tool) return;
    if (this.locked()) {
      this.tool = null;
      return;
    }
    if (!tool.from) {
      this.tool = { kind: tool.kind, from: siteId };
      sfx('select');
      this.notify();
      return;
    }
    const from = tool.from;
    if (tool.kind === 'fiber') {
      const why = A.canFiber(this.state!, from, siteId);
      const cost = why ? 0 : A.fiberCost(siteDistanceKm(from, siteId));
      this.guarded(cost, 'Lay this fiber?', () => {
        const r = this.after(A.buildFiber(this.state!, from, siteId));
        if (r.ok) this.tool = null;
        this.notify();
      });
      return;
    }
    const why = A.canLink(this.state!, from, siteId);
    const cost = why ? 0 : linkCost(siteDistanceKm(from, siteId));
    this.guarded(cost, 'Build this power line?', () => {
      const r = this.after(A.buildLink(this.state!, from, siteId));
      if (r.ok) this.tool = null;
      this.notify();
    });
  }

  // ── Act II actions ──
  upgrade(facilityId: string): void {
    if (this.locked()) return;
    const s = this.state!;
    const f = s.facilities.find((x) => x.id === facilityId);
    if (!f) return;
    this.guarded(upgradeCost(s, f), 'Expand this facility?', () => void this.after(A.upgradeFacility(s, facilityId), 'build'));
  }

  buyLand(siteId: string): void {
    if (this.locked()) return;
    const s = this.state!;
    this.guarded(landCost(s, siteId), 'Buy more land here?', () => void this.after(A.buyLand(s, siteId), 'cash'));
  }

  leaseCable(id: string) {
    if (this.locked()) return this.lockedResult();
    return this.after(A.leaseCable(this.state!, id), 'cash');
  }

  dropLease(id: string) {
    if (this.locked()) return this.lockedResult();
    return this.after(A.dropLease(this.state!, id));
  }

  buildOwnCable(a: string, b: string): void {
    if (this.locked()) return;
    this.guarded(OWN_CABLE_COST, 'Lay your own subsea cable?', () => void this.after(A.buildOwnCable(this.state!, a, b), 'build'));
  }

  signDeal(id: string): void {
    if (this.locked()) return;
    const d = DEAL_BY_ID[id];
    this.guarded(d?.cost ?? 0, `Sign: ${d?.name}?`, () => void this.after(A.signDeal(this.state!, id), 'cash'));
  }

  buyStake(mineId: string): void {
    if (this.locked()) return;
    const s = this.state!;
    this.guarded(A.stakePrice(s, mineId), 'Buy a 10% stake?', () => void this.after(A.buyStake(s, mineId), 'cash'));
  }

  lobby(region: Rid): void {
    if (this.locked()) return;
    this.guarded(LOBBY.cost, 'Lobby here?', () => void this.after(A.lobby(this.state!, region), 'cash'));
  }

  applyLicence(rule: string, region: Rid): void {
    if (this.locked()) return;
    this.guarded(RULE_BY_ID[rule]?.licenceCost ?? 0, 'Apply for this licence?', () => void this.after(A.applyLicence(this.state!, rule, region)));
  }

  signTreaty(id: string) {
    if (this.locked()) return this.lockedResult();
    return this.after(A.signTreaty(this.state!, id), 'objective');
  }

  leaveTreaty(id: string) {
    if (this.locked()) return this.lockedResult();
    return this.after(A.leaveTreaty(this.state!, id));
  }

  acceptSovereign(id: string) {
    if (this.locked()) return this.lockedResult();
    return this.after(A.acceptSovereign(this.state!, id), 'objective');
  }

  declineSovereign(id: string) {
    if (this.locked()) return this.lockedResult();
    return this.after(A.declineSovereign(this.state!, id));
  }

  borrow(amount: number) {
    if (this.locked()) return this.lockedResult();
    return this.after(A.borrow(this.state!, amount), 'cash');
  }

  repayLoan(id: string): void {
    if (this.locked()) return;
    const l = this.state!.capital.loans.find((x) => x.id === id);
    this.guarded(l?.balance ?? 0, 'Repay this loan early?', () => void this.after(A.repayLoan(this.state!, id), 'cash'));
  }

  acceptContract(id: string) {
    if (this.locked()) return this.lockedResult();
    return this.after(A.acceptContract(this.state!, id), 'objective');
  }

  declineContract(id: string) {
    if (this.locked()) return this.lockedResult();
    return this.after(A.declineContract(this.state!, id));
  }

  buyStartup(id: string): void {
    if (this.locked()) return;
    const o = this.state!.startups.offers.find((x) => x.id === id);
    this.guarded(o?.price ?? 0, 'Acquire this company?', () => void this.after(A.buyStartup(this.state!, id), 'objective'));
  }

  setJob(advisor: AdvisorId, patch: Partial<Job>) {
    if (this.locked()) return this.lockedResult();
    const r = A.setJob(this.state!, advisor, patch);
    if (!r.ok) {
      sfx('error');
      this.toast(r.reason, 'bad');
    }
    this.notify();
    return r;
  }

  order(supplier: SupplierId, qty: number, dest: string, mode: 'sea' | 'air'): void {
    if (this.locked()) return;
    const s = this.state!;
    const quote = A.quoteOrder(s, this.ctx, supplier, qty, dest, mode);
    this.guarded(quote.total, 'Place this order?', () => void this.after(A.placeOrder(s, this.ctx, supplier, qty, dest, mode), 'cash'));
  }

  setRental(units: number): void {
    if (this.locked()) return;
    A.setRental(this.state!, units);
    refreshStats(this.state!);
    this.notify();
  }

  setAlloc(key: A.AllocKey, v: number): void {
    if (this.locked()) return;
    A.setAlloc(this.state!, key, v);
    refreshStats(this.state!);
    this.notify();
  }

  startTraining() {
    if (this.locked()) return this.lockedResult();
    return this.after(A.startTraining(this.state!), 'confirm');
  }

  setResearch(id: string) {
    if (this.locked()) return this.lockedResult();
    return this.after(A.setResearch(this.state!, id), 'confirm');
  }

  // ── Act III: the Charter ──
  setCharterTab(tab: CharterTab): void {
    this.charterTab = tab;
    sfx('click');
    this.notify();
  }

  /** Open the Charter on a tab, optionally with a contract draft (from a site inspector). */
  openCharter(tab: CharterTab, draft: { kind?: ContractKind; where?: string } | null = null): void {
    this.charterTab = tab;
    this.charterDraft = draft;
    this.panel = 'charter';
    sfx('click');
    this.notify();
  }

  postTender(kind: ContractKind, size: ContractSize, where: string, opt?: string) {
    this.charterDraft = null;
    return this.after(CH.postTender(this.state!, kind, size, where, opt), 'confirm');
  }

  // ── Act V: the system ──
  setSystemTab(tab: SystemTab): void {
    this.systemTab = tab;
    sfx('click');
    this.notify();
  }

  openSystem(tab: SystemTab): void {
    this.systemTab = tab;
    this.panel = 'system';
    sfx('click');
    this.notify();
  }

  /** Confirm the era plan: the next stage begins and the years start to jump. */
  confirmEra(plan: EraPlan) {
    const r = this.after(ERA.confirmEra(this.state!, plan), 'confirm');
    if (r.ok) {
      this.panel = null;
      this.select(null);
      if (this.mode !== 'map' && this.mode !== 'system') this.enterMap();
    }
    return r;
  }

  /** Change the dial, reinvestment and minds share between eras. */
  setLevers(dial: number, reinvest: number, minds: number): void {
    const s = this.state!;
    ERA.setLevers(s, dial, reinvest, minds);
    if (s.system?.plan) Object.assign(s.system.plan, { dial: s.system.dial, reinvest: s.system.reinvest, minds: s.system.minds });
    refreshStats(s);
    this.notify();
  }

  setAutopilot(on: boolean): void {
    const s = this.state!;
    s.flags.autopilot5 = on;
    sfx(on ? 'confirm' : 'click');
    this.toast(on ? '🧭 Autopilot on: the era planner posts and awards contracts between eras.' : '🧭 Autopilot off: the contracts are yours again.', 'info', 'bit');
    this.notify();
  }

  /** Act IV: between jumps the planner keeps posting and awarding by the plan's priorities. */
  setAutopilot4(on: boolean): void {
    const s = this.state!;
    s.flags.autopilot4 = on;
    sfx(on ? 'confirm' : 'click');
    this.toast(on ? '🧭 Autopilot on: between jumps the planner posts and awards contracts by the plan’s priorities.' : '🧭 Autopilot off: the contracts are yours again.', 'info', 'bit');
    this.notify();
  }

  claimAsteroid(id: string) {
    return this.after(claimAst(this.state!, id), 'confirm');
  }

  showEraReport(rec: EraRecord): void {
    this.eraReport = rec;
    this.panel = null;
    sfx('page');
    this.notify();
  }

  dismissEraReport(): void {
    this.eraReport = null;
    sfx('click');
    this.notify();
  }

  // ── the Type I ending ──
  /** Kardashev 1.0000: pull back to the solar system, then the epilogues, credits, stats and the end card. */
  startEnding(): void {
    const s = this.state;
    if (!s) return;
    this.panel = null;
    this.selection = null;
    this.ending = { step: 'cinematic', index: 0, at: 0 };
    if (this.hasSystemView) this.enterSystem(true);
    playMusic('ending');
    this.notify();
  }

  private tickEnding(dt: number): void {
    const e = this.ending;
    if (!e) return;
    e.at += dt;
    if (e.step === 'cinematic') {
      const scene = this.stage.getScene() as (Scene & { cinematicDone?: boolean }) | null;
      if ((scene?.cinematicDone && e.at > 6) || e.at > 16) this.endingNext();
    }
  }

  /** The next step of the ending (or the next epilogue card). */
  endingNext(): void {
    const e = this.ending;
    if (!e) return;
    const order: EndingStep[] = ['cinematic', 'epilogue', 'credits', 'stats', 'card'];
    if (e.step === 'epilogue' && e.index + 1 < this.epilogueCount) {
      e.index += 1;
      e.at = 0;
      sfx('page');
    } else {
      const i = order.indexOf(e.step);
      if (i + 1 >= order.length) return this.finishEnding();
      this.ending = { step: order[i + 1], index: 0, at: 0 };
      sfx('page');
    }
    this.notify();
  }

  /** Set by the UI (how many epilogue cards were picked). */
  epilogueCount = 10;

  /** After the end card: keep playing past Type I. */
  finishEnding(): void {
    const s = this.state;
    this.ending = null;
    if (s) {
      s.flags.endingShown = s.day;
      s.flags.act5Complete ??= s.day;
      const year = s.system?.typeI ? new Date(Date.UTC(2027, 0, 1) + s.system.typeI * 86_400_000).getUTCFullYear() : null;
      // a sandbox run is for fun: no records, no unlocks
      if (year && !s.meta.sandbox) {
        const best = { ...(this.settings.typeIBest ?? {}) };
        const d = s.meta.difficulty;
        if (!best[d] || year < best[d]) best[d] = year;
        this.updateSettings({ typeIBest: best, stewardUnlocked: true });
      }
      this.save();
    }
    this.enterMap();
    this.speed = 1;
    this.notify();
  }

  /** Replay the ending from the Goals panel. */
  replayEnding(): void {
    if (!this.state?.system?.typeI) return;
    this.startEnding();
  }

  // ── Act IV: the planet ──
  setPlanetTab(tab: PlanetTab): void {
    this.planetTab = tab;
    sfx('click');
    this.notify();
  }

  openPlanet(tab: PlanetTab): void {
    this.planetTab = tab;
    this.panel = 'planet';
    sfx('click');
    this.notify();
  }

  /** Confirm the five-year plan: the next stage begins and the years start to jump. */
  confirmPlan(plan: FivePlan) {
    const r = this.after(PL.confirmPlan(this.state!, plan), 'confirm');
    if (r.ok) {
      this.panel = null;
      this.select(null);
      if (this.mode !== 'map') this.enterMap();
    }
    return r;
  }

  skipJump(): void {
    this.jumpFast = true;
  }

  /** Re-read an earlier jump's report (Planet → Overview). */
  showJumpReport(rec: JumpRecord): void {
    this.jumpReport = rec;
    this.panel = null;
    sfx('page');
    this.notify();
  }

  dismissJumpReport(): void {
    this.jumpReport = null;
    sfx('click');
    this.notify();
  }

  /** Act V: stop a drifting foundry and check every line of its code (costs capacity for a while). */
  haltFoundry(id: string) {
    return this.after(haltFoundrySim(this.state!, id), 'confirm');
  }

  /** Give a walked-out bloc what it asked for (a development package from the treasury). */
  meetDemand(r: Rid) {
    return this.after(CO.meetDemand(this.state!, r), 'cash');
  }

  delegateProvince(r: Rid, ai: AiId) {
    return this.after(AI.delegate(this.state!, r, ai), 'confirm');
  }

  recallProvince(r: Rid) {
    return this.after(AI.recall(this.state!, r));
  }

  closeTender(id: string) {
    return this.after(CH.closeTender(this.state!, id));
  }

  awardBid(tenderId: string, bidIndex: number): void {
    const s = this.state!;
    const t = s.charter?.tenders.find((x) => x.id === tenderId);
    const b = t?.bids[bidIndex];
    if (!t || !b) return;
    const run = () => void this.after(CH.awardBid(s, tenderId, bidIndex), 'objective');
    const conflict = CH.conflictCost(s, t, b);
    if (conflict > 0) {
      this.confirm = {
        title: `Award ${s.company.name}?`,
        detail: `This is your own company’s bid. Awarding it costs ${conflict} Legitimacy${s.charter?.blindTrust ? ' (the blind trust softens it)' : ''}, and journalists may dig.`,
        onYes: () => {
          this.confirm = null;
          run();
        },
      };
      sfx('alert');
      this.notify();
      return;
    }
    this.guarded(b.price * 0.2, 'Award this contract?', run, 'charter');
  }

  cancelProject(id: string): void {
    this.confirm = {
      title: 'Cancel this contract?',
      yes: 'Yes, cancel it',
      detail: 'What the Charter has paid is gone, the builder will be furious (relationship −20) and Legitimacy falls by 4.',
      onYes: () => {
        this.confirm = null;
        this.after(CH.cancelProject(this.state!, id));
      },
    };
    sfx('alert');
    this.notify();
  }

  expedite(id: string): void {
    const p = this.state!.charter?.projects.find((x) => x.id === id);
    this.guarded(p ? CH.expediteCost(p) : 0, 'Pay for overtime crews?', () => void this.after(CH.expediteProject(this.state!, id), 'cash'), 'charter');
  }

  claimDamages(id: string) {
    return this.after(CH.claimDamages(this.state!, id), 'cash');
  }

  donate(amount: number): void {
    if (this.locked()) return;
    this.guarded(amount, 'Give this to the Charter?', () => void this.after(CH.donate(this.state!, amount), 'cash'));
  }

  setBlindTrust(on: boolean): void {
    const s = this.state!;
    const why = CH.canSetBlindTrust(s, on);
    if (why) {
      sfx('error');
      this.toast(why, 'bad', 'penny');
      return;
    }
    this.confirm = {
      title: on ? 'Put your company in a blind trust?' : 'Take your company out of the blind trust?',
      yes: on ? 'Yes, into the trust' : 'Yes, take it back',
      detail: on
        ? 'Your advisors will run it on standing orders and you won’t be able to touch it. Legitimacy +8; conflicts of interest cost far less.'
        : `You get the controls back. Legitimacy −12, and you can’t go back in for ${Math.round(CH.TRUST_COOLDOWN / 30.4)} months.`,
      onYes: () => {
        this.confirm = null;
        this.after(CH.setBlindTrust(s, on), on ? 'objective' : 'confirm');
      },
    };
    sfx('alert');
    this.notify();
  }

  tableResolution(id: string) {
    return this.after(CO.tableResolution(this.state!, id), 'confirm');
  }

  withdrawResolution(id: string) {
    return this.after(CO.withdrawResolution(this.state!, id));
  }

  whipBloc(r: Rid) {
    return this.after(CO.whipBloc(this.state!, r));
  }

  favourBloc(r: Rid): void {
    this.guarded(CO.favourCost(this.state!, r), 'Spend treasury money on a favour?', () => void this.after(CO.favourBloc(this.state!, r), 'cash'), 'charter');
  }

  requestOwnLicence(gen: number, fast: boolean) {
    return this.after(requestLicence(this.state!, gen, fast), fast ? 'confirm' : 'confirm');
  }

  setDesk(advisor: AdvisorId, patch: Partial<Job>) {
    const r = setDeskJob(this.state!, advisor, patch);
    if (!r.ok) {
      sfx('error');
      this.toast(r.reason, 'bad');
    }
    this.notify();
    return r;
  }

  // ── sound cues for the big moments ───────────────────────────────────────────────────────
  private cue = { jumping: false, arcs: -1, storm: false };

  private soundCues(s: GameState): void {
    const jumping = !!(s.planet?.jump || s.system?.jump);
    if (jumping && !this.cue.jumping) sfx('jump');
    this.cue.jumping = jumping;
    if (s.system) {
      const arcs = segmentsLit(s.system.collectors);
      if (this.cue.arcs >= 0 && arcs > this.cue.arcs && !jumping) sfx('arc');
      this.cue.arcs = arcs;
      const storm = !!s.system.solarmax && !s.system.solarmax.done;
      if (storm && !this.cue.storm) sfx('storm');
      this.cue.storm = storm;
    }
  }

  // ── achievements ──────────────────────────────────────────────────────────────────────────
  private achTimer = 0;

  /** Unlock an achievement the game notices on screen (a night launch, a world tour…). */
  achieve(id: string): void {
    const a = ACHIEVEMENT_BY_ID[id];
    if (!this.state || this.mode === 'title' || !a || achievements().got[id]) return;
    // campus finds are campaign achievements too: a sandbox only collects its own
    if (!!a.sandbox !== !!this.state.meta.sandbox) return;
    this.unlockAchievement(id);
  }

  private unlockAchievement(id: string): void {
    const a = ACHIEVEMENT_BY_ID[id];
    const st = achievements();
    if (!a || st.got[id]) return;
    st.got[id] = Date.now();
    saveAchievements();
    this.toast(`🏆 ${a.name} — ${a.desc}`, 'good');
    sfx('fanfare');
  }

  /** You said hello to an advisor (or Bit) on campus. */
  metOnCampus(id: string): void {
    const st = achievements();
    if (!st.met.includes(id)) {
      st.met.push(id);
      saveAchievements();
    }
    if (TEAM_TO_MEET.every((x) => st.met.includes(x))) this.achieve('meet-the-team');
  }

  // ── playtest log ──────────────────────────────────────────────────────────────────────────
  private seenCard: unknown = null;

  /** Real time per act: running (by speed), paused, in a time-lapse; event cards seen. */
  private logPlay(s: GameState, dt: number): void {
    const log = (s.meta.log ??= { acts: {}, notes: [] });
    let a = log.acts[s.act];
    if (!a) {
      a = log.acts[s.act] = { seconds: 0, paused: 0, jump: 0, bySpeed: {}, fromDay: s.day, events: 0, decisions: 0 };
      for (const [k, prev] of Object.entries(log.acts)) if (Number(k) < s.act && prev && prev.toDay === undefined) prev.toDay = s.day;
    }
    a.seconds += dt;
    if (s.planet?.jump || s.system?.jump) a.jump += dt;
    else if (this.speed === 0 || this.blocked) a.paused += dt;
    else a.bySpeed[this.speed] = (a.bySpeed[this.speed] ?? 0) + dt;
    if (s.events.active && s.events.active !== this.seenCard) a.events++;
    this.seenCard = s.events.active;
  }

  /** Change a sandbox's switches mid-game (only a sandbox company has them). */
  setSandbox(opts: SandboxOpts): void {
    const s = this.state;
    if (!s?.meta.sandbox) return;
    s.meta.sandbox = { ...opts };
    refreshStats(s);
    this.save();
    this.notify();
  }

  /** The quick playtest note box (Settings → Gameplay → Playtest notes, or J). */
  noteOpen = false;

  private noteResume: Speed = 0;

  openNote(): void {
    if (!this.state || !this.settings.playtestNotes || this.noteOpen) return;
    // the clock stops while you write
    this.noteResume = this.speed;
    this.speed = 0;
    this.noteOpen = true;
    this.notify();
  }

  closeNote(): void {
    this.noteOpen = false;
    if (this.noteResume && !this.blocked) this.speed = this.noteResume;
    this.noteResume = 0;
    this.notify();
  }

  /** Stamp a playtest note with the act, the date and what's on screen. */
  addNote(text: string): void {
    const s = this.state;
    const t = text.trim();
    this.closeNote();
    if (!s || !t) return;
    const log = (s.meta.log ??= { acts: {}, notes: [] });
    const sel = this.selection;
    const where = [this.mode, this.panel ? `panel:${this.panel}` : '', this.mode === 'diorama' && this.dioramaSite ? `site:${this.dioramaSite}` : sel ? `${sel.kind}:${'id' in sel ? sel.id : ''}` : '', s.events.active ? `card:${s.events.active.id}` : '']
      .filter(Boolean)
      .join(' · ');
    log.notes.push({ at: Date.now(), playtime: s.meta.playtime, act: s.act, day: s.day, where, text: t });
    this.save();
    this.toast('Note saved — Settings → Data exports them.', 'good');
  }

  /** The way out of a card with nothing left to choose (every choice disabled). */
  dismissEvent(): void {
    const s = this.state!;
    if (!dismissEvent(s)) return;
    sfx('click');
    if (!s.events.active) {
      this.eventOpen = false;
      const holdForTutorial = s.meta.tutorialStep >= 0 && s.meta.tutorialStep <= PLAY_STEP;
      this.speed = s.meta.gameOver || holdForTutorial ? 0 : this.resumeSpeed || 1;
      this.checkBriefings();
    }
    this.notify();
  }

  chooseEvent(index: number): void {
    const s = this.state!;
    const card = s.events.active;
    if (resolveEvent(s, index)) {
      const a = s.meta.log?.acts[s.act];
      if (a && card) a.decisions++;
      refreshStats(s);
      sfx('confirm');
      if (!s.events.active) {
        this.eventOpen = false;
        const holdForTutorial = s.meta.tutorialStep >= 0 && s.meta.tutorialStep <= PLAY_STEP;
        this.speed = s.meta.gameOver || holdForTutorial ? 0 : this.resumeSpeed || 1;
        this.checkBriefings();
      }
      this.notify();
    } else sfx('error');
  }
}
