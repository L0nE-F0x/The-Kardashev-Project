import type { FacilityType, GameState, SupplierId } from '../sim/types';
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
import { resolveEvent } from '../sim/events';
import { simulateOffline, type OfflineReport } from '../sim/offline';
import { buildCost, landCost, linkCost, upgradeCost } from '../sim/model';
import { OWN_CABLE_COST } from '../content/network';
import { DEAL_BY_ID } from '../content/stack';
import { siteDistanceKm } from '../content/sites';
import { fmtMoney } from '../sim/core';
import { getEra, setEra, syncCssVars, type Era } from '../render/palette';
import { deleteSlot, listSlots, loadSlot, migrateLegacySave, newSlotId, writeSlot, MAX_SLOTS, type SlotInfo } from '../save/save';
import { applyCssSettings, loadSettings, saveSettings, type Settings } from '../save/settings';
import { guideUnseen, unlockGuide } from '../save/guide';
import { unlockedFor, GUIDE_BY_ID } from '../content/fieldGuide';
import { sfx } from '../audio/sfx';
import { resumeAudio, setVolumes, suspendAudio, unlockOnGesture } from '../audio/engine';
import { musicUnlocked, playMusic } from '../audio/music';
import { canFullscreen, canPromptInstall, checkAppUpdate, enterFullscreen, initInstallPrompt, isPhone, isStandalone, onInstallChange, registerServiceWorker } from '../platform/platform';
import type { AppUpdate, AppUpdateStatus } from '../platform/platform';
import { kardashev } from '../sim/model';
import { TUTORIAL, PLAY_STEP } from './tutorial';
import { BRIEFINGS } from './briefings';
import type { TourDirector } from './tour';

export type Selection = { kind: 'site'; id: string } | { kind: 'region'; id: RegionId } | null;
export type PanelId = 'compute' | 'orders' | 'research' | 'finance' | 'news' | 'settings' | 'goals' | 'guide' | 'team' | 'deals' | 'blocs' | 'charter' | 'council' | 'planet' | 'system' | null;
export type PlanetTab = 'overview' | 'provinces' | 'grid' | 'fusion' | 'space' | 'climate';
export type SystemTab = 'overview' | 'thermal' | 'foundries' | 'asteroids' | 'swarm' | 'minds' | 'people';
/** The Type I ending, step by step. */
export type EndingStep = 'cinematic' | 'epilogue' | 'credits' | 'stats' | 'card';
export type Tool = { kind: 'link' | 'fiber'; from: string | null } | null;
export type Mode = 'title' | 'map' | 'diorama' | 'orbit' | 'system';
export type MenuScreen = 'main' | 'new' | 'load' | 'settings' | 'guide' | 'whatsnew' | 'credits' | 'install';
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

/** Game days a time jump advances per frame (the map time-lapses while it runs). */
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
  private notifyQueued = false;
  private lastObjectiveSeen: string | number | boolean | undefined;
  private lastNewsSeen = 0;
  private hiddenAt = 0;
  private frameCount = 0;
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
    unlockOnGesture(() => musicUnlocked());
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
    this.showActComplete = false;
    this.selection = { kind: 'site', id: opts.homeSite };
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
    const away = saved.savedAt ? Date.now() - saved.savedAt : 0;
    this.awayReport = null;
    if (this.settings.offline && away > 0 && !saved.meta.gameOver) {
      const report = simulateOffline(saved, this.ctx, away, this.settings.offlineRate);
      if (report) this.awayReport = report;
    }
    refreshStats(saved);
    this.lastObjectiveSeen = saved.flags.lastObjective;
    this.lastNewsSeen = saved.news[0]?.day ?? 0;
    this.selection = null;
    this.showActComplete = false;
    this.enterMap();
    this.speed = this.awayReport || saved.events.active || saved.meta.tutorialStep >= 0 ? 0 : 1;
    this.resumeSpeed = 1;
    sfx('start');
    return true;
  }

  /** Load a company from a save code or file into a free slot. */
  importCompany(s: GameState): boolean {
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

  quitToMenu(): void {
    this.save();
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
    this.stage.setZoomBoost(this.settings.zoom);
    this.startTour();
    playMusic('menu');
    this.notify();
  }

  /** Called once at boot: show the menu with the cinematic tour behind it. */
  showMenu(): void {
    this.mode = 'title';
    this.menuScreen = 'main';
    this.startTour();
    playMusic('menu');
    this.notify();
  }

  makeMapScene(): Scene {
    return this.scenes.map(this);
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
    this.stage.setZoomBoost(this.settings.zoom);
    this.stage.setScene(this.scenes.map(this));
    this.act2Music = (this.state?.act ?? 1) >= 2;
    this.act3Music = (this.state?.act ?? 1) >= 3;
    playMusic(this.act3Music ? 'game3' : this.act2Music ? 'game2' : 'game');
    this.notify();
  }

  /** Act IV: zoom out to the planet from orbit. */
  enterOrbit(): void {
    if (!this.scenes.orbit || !this.state?.planet) return;
    this.mode = 'orbit';
    this.dioramaSite = null;
    this.hover = null;
    this.stage.setZoomBoost(this.settings.zoom);
    this.stage.setScene(this.scenes.orbit(this));
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
    this.dioramaSite = null;
    this.hover = null;
    this.stage.setZoomBoost(this.settings.zoom);
    this.stage.setScene(this.scenes.system(this, { cinematic }));
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
    this.hover = null;
    // dioramas are close-ups: twice the pixel size of the world map
    this.stage.setZoomBoost(this.settings.zoom * 2);
    this.stage.setScene(this.scenes.diorama(this, siteId));
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
    writeSlot(this.slotId, this.state);
    this.lastAutosave = performance.now();
  }

  private onVisibility(): void {
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = Date.now();
      this.save();
      if (this.settings.muteInBackground) suspendAudio();
      return;
    }
    resumeAudio();
    if (this.hiddenAt && this.state && this.mode !== 'title' && this.settings.offline && !this.state.meta.gameOver) {
      const away = Date.now() - this.hiddenAt;
      const report = simulateOffline(this.state, this.ctx, away, this.settings.offlineRate);
      if (report) {
        refreshStats(this.state);
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
      // Act IV: a time jump runs a week per frame so the map can time-lapse (or all at once when skipped)
      if (s.planet?.jump) {
        const rec = PL.jumpStep(s, this.ctx, this.jumpFast ? 100_000 : JUMP_DAYS_PER_FRAME);
        refreshStats(s);
        if (rec) {
          this.jumpReport = rec;
          this.jumpFast = false;
          sfx('fanfare');
          this.save();
        }
        this.notify();
      }
      // Act V: an era (or the last climb) runs a week per frame while the views time-lapse
      if (s.system?.jump?.last && this.mode === 'map' && this.hasSystemView) this.enterSystem();
      if (s.system?.jump) {
        const last = !!s.system.jump.last;
        const rec = ERA.eraStep(s, this.ctx, this.jumpFast ? 100_000 : last ? JUMP_DAYS_PER_FRAME * 2 : JUMP_DAYS_PER_FRAME);
        refreshStats(s);
        if (rec) {
          this.eraReport = rec.last ? null : rec;
          this.jumpFast = false;
          sfx('fanfare');
          this.save();
        }
        this.notify();
      }
      this.tickEnding(dt);
      const blocked = this.blocked;
      if (blocked && this.speed !== 0) {
        this.resumeSpeed = this.speed;
        this.speed = 0;
        if (s.events.active) sfx('alert');
        this.notify();
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
    // battery saver: draw every other frame (~30 fps)
    if (!this.settings.batterySaver || this.frameCount % 2 === 0) this.stage.frame(this.settings.batterySaver ? dt * 2 : dt, now);
  }

  /** Fraction of the current day elapsed — used to interpolate moving things. */
  dayFraction(): number {
    return this.mode === 'title' ? (this.tour?.dayFraction() ?? 0) : this.acc;
  }

  private afterTick(): void {
    const s = this.state!;
    if (s.flags.lastObjective !== this.lastObjectiveSeen) {
      this.lastObjectiveSeen = s.flags.lastObjective;
      const news = s.news.find((n) => n.text.startsWith('✅'));
      if (news && s.meta.tutorialStep < 0) this.toast(news.text.replace('✅ ', ''), 'good', String(s.flags.lastObjectiveAdvisor ?? 'bit'));
      sfx('objective');
    }
    for (const n of s.news) {
      if (n.day <= this.lastNewsSeen) break;
      if (n.text.startsWith('🤖')) sfx('fanfare');
      else if (n.text.startsWith('🏗') && n.text.includes('online')) sfx('build');
      else if (n.text.startsWith('🔬')) sfx('research');
      else if (n.text.startsWith('📦') && n.text.includes('arrived')) sfx('cash');
    }
    this.lastNewsSeen = s.news[0]?.day ?? this.lastNewsSeen;
    if (s.flags.act1Complete && !s.flags.act1Shown) {
      s.flags.act1Shown = true;
      this.showActComplete = true;
      sfx('fanfare');
    }
    if ((s.act ?? 1) >= 2 && !this.act2Music) {
      this.act2Music = true;
      if (this.mode !== 'title') playMusic('game2');
    }
    if ((s.act ?? 1) >= 3 && !this.act3Music) {
      this.act3Music = true;
      if (this.mode !== 'title') playMusic('game3');
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
    const fresh = unlockGuide(unlockedFor(this.state));
    for (const id of fresh.slice(0, 2)) {
      const e = GUIDE_BY_ID[id];
      if (e && e.unlock !== 'start') this.toast(`New Field Guide entry: ${e.title}`, 'info', 'bit');
    }
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
    } else {
      TUTORIAL[s.meta.tutorialStep].enter?.(this);
      sfx('page');
    }
    this.notify();
  }

  tutorialSkip(): void {
    if (!this.state) return;
    this.state.meta.tutorialStep = -1;
    if (this.speed === 0 && !this.blocked) this.setSpeed(1);
    this.notify();
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
    if (this.blocked && speed > 0) return;
    this.speed = speed;
    if (speed > 0) this.resumeSpeed = speed;
    sfx('click');
    this.notify();
  }

  togglePause(): void {
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

  openMenuScreen(screen: MenuScreen): void {
    this.menuScreen = screen;
    sfx('click');
    this.notify();
  }

  setHover(h: Hover): void {
    const same = JSON.stringify(h) === JSON.stringify(this.hover);
    if (same) return;
    this.hover = h;
    this.notify();
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    sfx('click');
    this.notify();
  }

  toast(text: string, kind: Toast['kind'] = 'info', advisor?: string): void {
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
  private guarded(cost: number, title: string, run: () => void): void {
    const limit = this.settings.confirmSpend;
    if (limit > 0 && cost >= limit) {
      this.confirm = {
        title,
        detail: `This costs ${fmtMoney(cost)}. You have ${fmtMoney(this.state?.finance.cash ?? 0)}.`,
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

  lobby(region: Rid) {
    if (this.locked()) return this.lockedResult();
    return this.after(A.lobby(this.state!, region), 'cash');
  }

  applyLicence(rule: string, region: Rid) {
    if (this.locked()) return this.lockedResult();
    return this.after(A.applyLicence(this.state!, rule, region));
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
      if (year) {
        const best = { ...(this.settings.typeIBest ?? {}) };
        const d = s.meta.difficulty;
        if (!best[d] || year < best[d]) best[d] = year;
        this.updateSettings({ typeIBest: best, stewardUnlocked: true });
      }
      this.save();
    }
    playMusic(this.act3Music ? 'game3' : 'game2');
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
    this.guarded(b.price * 0.2, 'Award this contract?', run);
  }

  cancelProject(id: string): void {
    this.confirm = {
      title: 'Cancel this contract?',
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
    this.guarded(p ? CH.expediteCost(p) : 0, 'Pay for overtime crews?', () => void this.after(CH.expediteProject(this.state!, id), 'cash'));
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
    this.guarded(CO.favourCost(this.state!, r), 'Spend treasury money on a favour?', () => void this.after(CO.favourBloc(this.state!, r), 'cash'));
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

  chooseEvent(index: number): void {
    const s = this.state!;
    if (resolveEvent(s, index)) {
      refreshStats(s);
      sfx('confirm');
      if (!s.events.active) {
        this.eventOpen = false;
        const holdForTutorial = s.meta.tutorialStep >= 0 && s.meta.tutorialStep <= PLAY_STEP;
        this.speed = s.meta.gameOver || holdForTutorial ? 0 : this.resumeSpeed || 1;
      }
      this.notify();
    } else sfx('error');
  }
}
