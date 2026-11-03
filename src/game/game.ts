import type { FacilityType, GameState, SupplierId } from '../sim/types';
import type { MapLod } from '../world/mapData';
import type { Router } from '../world/routing';
import type { PixelStage, Scene } from '../render/stage';
import type { RegionId } from '../content/mapcodes';
import { newGame, type NewGameOptions } from '../sim/state';
import { newAct2Game } from '../sim/act2';
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
import { canPromptInstall, initInstallPrompt, onInstallChange, registerServiceWorker } from '../platform/platform';
import { kardashev } from '../sim/model';
import { TUTORIAL, PLAY_STEP } from './tutorial';
import { BRIEFINGS } from './briefings';
import type { TourDirector } from './tour';

export type Selection = { kind: 'site'; id: string } | { kind: 'region'; id: RegionId } | null;
export type PanelId = 'compute' | 'orders' | 'research' | 'finance' | 'news' | 'settings' | 'goals' | 'guide' | 'team' | 'deals' | 'blocs' | null;
export type Tool = { kind: 'link' | 'fiber'; from: string | null } | null;
export type Mode = 'title' | 'map' | 'diorama';
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
}

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
  /** Act II unlock briefing on screen (UI-only; which ones were seen is saved in meta). */
  briefing: { id: string; step: number } | null = null;
  private briefingResume: Speed | null = null;
  private act2Music = false;
  /** With auto-pause off, event cards wait behind a pill until opened. */
  eventOpen = false;
  confirm: ConfirmRequest | null = null;
  settings: Settings = loadSettings();
  eraOverride: Era | null = null;
  updateReady: (() => void) | null = null;
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

  startNew(opts: NewGameOptions & { act2?: boolean }): boolean {
    if (this.slotsFull()) {
      this.toast(`All ${MAX_SLOTS} company slots are in use — delete one first.`, 'bad');
      return false;
    }
    this.state = opts.act2 ? newAct2Game(opts) : newGame(opts);
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
    playMusic(this.act2Music ? 'game2' : 'game');
    this.notify();
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
    if (s.flags.act2Complete && !s.flags.act2Shown) {
      s.flags.act2Shown = true;
      this.showActComplete = true;
      sfx('fanfare');
    }
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
    const byAct = (act >= 2 ? 1 : 0) as Era;
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
    const s = this.state!;
    this.guarded(buildCost(s, type), 'Build this?', () => void this.after(A.build(s, siteId, type), 'build'));
  }

  requestGrid(siteId: string, mw: number) {
    return this.after(A.requestGrid(this.state!, siteId, mw));
  }

  linkClick(siteId: string): void {
    const tool = this.tool;
    if (!tool) return;
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
    const s = this.state!;
    const f = s.facilities.find((x) => x.id === facilityId);
    if (!f) return;
    this.guarded(upgradeCost(s, f), 'Expand this facility?', () => void this.after(A.upgradeFacility(s, facilityId), 'build'));
  }

  buyLand(siteId: string): void {
    const s = this.state!;
    this.guarded(landCost(s, siteId), 'Buy more land here?', () => void this.after(A.buyLand(s, siteId), 'cash'));
  }

  leaseCable(id: string) {
    return this.after(A.leaseCable(this.state!, id), 'cash');
  }

  dropLease(id: string) {
    return this.after(A.dropLease(this.state!, id));
  }

  buildOwnCable(a: string, b: string): void {
    this.guarded(OWN_CABLE_COST, 'Lay your own subsea cable?', () => void this.after(A.buildOwnCable(this.state!, a, b), 'build'));
  }

  signDeal(id: string): void {
    const d = DEAL_BY_ID[id];
    this.guarded(d?.cost ?? 0, `Sign: ${d?.name}?`, () => void this.after(A.signDeal(this.state!, id), 'cash'));
  }

  buyStake(mineId: string): void {
    const s = this.state!;
    this.guarded(A.stakePrice(s, mineId), 'Buy a 10% stake?', () => void this.after(A.buyStake(s, mineId), 'cash'));
  }

  lobby(region: Rid) {
    return this.after(A.lobby(this.state!, region), 'cash');
  }

  applyLicence(rule: string, region: Rid) {
    return this.after(A.applyLicence(this.state!, rule, region));
  }

  signTreaty(id: string) {
    return this.after(A.signTreaty(this.state!, id), 'objective');
  }

  leaveTreaty(id: string) {
    return this.after(A.leaveTreaty(this.state!, id));
  }

  acceptSovereign(id: string) {
    return this.after(A.acceptSovereign(this.state!, id), 'objective');
  }

  declineSovereign(id: string) {
    return this.after(A.declineSovereign(this.state!, id));
  }

  borrow(amount: number) {
    return this.after(A.borrow(this.state!, amount), 'cash');
  }

  repayLoan(id: string): void {
    const l = this.state!.capital.loans.find((x) => x.id === id);
    this.guarded(l?.balance ?? 0, 'Repay this loan early?', () => void this.after(A.repayLoan(this.state!, id), 'cash'));
  }

  acceptContract(id: string) {
    return this.after(A.acceptContract(this.state!, id), 'objective');
  }

  declineContract(id: string) {
    return this.after(A.declineContract(this.state!, id));
  }

  buyStartup(id: string): void {
    const o = this.state!.startups.offers.find((x) => x.id === id);
    this.guarded(o?.price ?? 0, 'Acquire this company?', () => void this.after(A.buyStartup(this.state!, id), 'objective'));
  }

  setJob(advisor: AdvisorId, patch: Partial<Job>) {
    const r = A.setJob(this.state!, advisor, patch);
    if (!r.ok) {
      sfx('error');
      this.toast(r.reason, 'bad');
    }
    this.notify();
    return r;
  }

  order(supplier: SupplierId, qty: number, dest: string, mode: 'sea' | 'air'): void {
    const s = this.state!;
    const quote = A.quoteOrder(s, this.ctx, supplier, qty, dest, mode);
    this.guarded(quote.total, 'Place this order?', () => void this.after(A.placeOrder(s, this.ctx, supplier, qty, dest, mode), 'cash'));
  }

  setRental(units: number): void {
    A.setRental(this.state!, units);
    refreshStats(this.state!);
    this.notify();
  }

  setAlloc(key: A.AllocKey, v: number): void {
    A.setAlloc(this.state!, key, v);
    refreshStats(this.state!);
    this.notify();
  }

  startTraining() {
    return this.after(A.startTraining(this.state!), 'confirm');
  }

  setResearch(id: string) {
    return this.after(A.setResearch(this.state!, id), 'confirm');
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
