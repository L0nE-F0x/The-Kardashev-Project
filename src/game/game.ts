import type { FacilityType, GameState, SupplierId } from '../sim/types';
import type { MapLod } from '../world/mapData';
import type { Router } from '../world/routing';
import type { PixelStage } from '../render/stage';
import type { RegionId } from '../content/mapcodes';
import { newGame } from '../sim/state';
import { refreshStats, tick } from '../sim/tick';
import * as A from '../sim/actions';
import { resolveEvent } from '../sim/events';
import { simulateOffline, type OfflineReport } from '../sim/offline';
import { getEra, setEra, syncCssVars, type Era } from '../render/palette';
import { loadSave, writeSave, clearSave, loadSettings, saveSettings, type Settings } from '../save/save';
import { sfx, setMuted } from '../audio/sfx';
import { kardashev } from '../sim/model';

export type Selection = { kind: 'site'; id: string } | { kind: 'region'; id: RegionId } | null;
export type PanelId = 'compute' | 'orders' | 'research' | 'finance' | 'news' | 'settings' | 'goals' | null;
export type Tool = { kind: 'link'; from: string | null } | null;
export type Mode = 'title' | 'map' | 'diorama';
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

export interface SceneFactory {
  map(game: Game): import('../render/stage').Scene;
  diorama(game: Game, siteId: string): import('../render/stage').Scene;
}

const SPEEDS = [0, 1, 2, 4, 8] as const;
export type Speed = (typeof SPEEDS)[number];

/** Owns the simulation, the clock, the scenes and the UI-facing state. */
export class Game {
  state: GameState | null = null;
  mode: Mode = 'title';
  speed: Speed = 1;
  /** Speed to restore when an event card closes. */
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
  settings: Settings = loadSettings();
  eraOverride: Era | null = null;
  version = 0;

  private listeners = new Set<() => void>();
  private acc = 0;
  private lastAutosave = 0;
  private toastId = 0;
  private notifyQueued = false;
  private lastObjectiveSeen: string | number | boolean | undefined;
  private lastNewsSeen = 0;
  private hiddenAt = 0;

  constructor(
    readonly stage: PixelStage,
    readonly world: { lods: MapLod[]; router: Router },
    private readonly scenes: SceneFactory,
  ) {
    setMuted(!this.settings.sound);
    this.stage.setZoomBoost(this.settings.zoom);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.hiddenAt = Date.now();
        this.save();
      } else if (this.hiddenAt && this.state && this.mode !== 'title' && this.settings.offline) {
        const away = Date.now() - this.hiddenAt;
        this.hiddenAt = 0;
        const report = simulateOffline(this.state, this.ctx, away);
        if (report) {
          refreshStats(this.state);
          this.awayReport = report;
          this.notify();
        }
      }
    });
    window.addEventListener('pagehide', () => this.save());
  }

  get ctx() {
    return { router: this.world.router };
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

  // ── lifecycle ─────────────────────────────────────────────────────────────────────────────
  hasSave(): boolean {
    return loadSave() !== null;
  }

  startNew(name: string, homeSite: string): void {
    clearSave();
    this.state = newGame({ name, homeSite });
    refreshStats(this.state);
    this.awayReport = null;
    this.selection = { kind: 'site', id: homeSite };
    this.enterMap();
    this.speed = 0;
    this.resumeSpeed = 1;
    this.save();
    sfx('start');
  }

  continueSaved(): boolean {
    const saved = loadSave();
    if (!saved) return false;
    this.state = saved;
    const away = saved.savedAt ? Date.now() - saved.savedAt : 0;
    if (this.settings.offline && away > 0) {
      const report = simulateOffline(saved, this.ctx, away);
      if (report) this.awayReport = report;
    }
    refreshStats(saved);
    this.lastObjectiveSeen = saved.flags.lastObjective;
    this.lastNewsSeen = saved.news[0]?.day ?? 0;
    this.enterMap();
    this.speed = this.awayReport || saved.events.active ? 0 : 1;
    sfx('start');
    return true;
  }

  quitToTitle(): void {
    this.save();
    this.state = null;
    this.mode = 'title';
    this.dioramaSite = null;
    this.stage.setScene(this.scenes.map(this));
    this.notify();
  }

  enterMap(): void {
    this.mode = 'map';
    this.dioramaSite = null;
    this.stage.setZoomBoost(this.settings.zoom);
    this.stage.setScene(this.scenes.map(this));
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
    if (!this.state) return;
    this.state.savedAt = Date.now();
    writeSave(this.state);
    this.lastAutosave = performance.now();
  }

  // ── main loop ─────────────────────────────────────────────────────────────────────────────
  frame(dt: number, now: number): void {
    const s = this.state;
    if (s && this.mode !== 'title') {
      const blocked = !!s.events.active || !!this.awayReport || this.showActComplete;
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
          if (s.events.active) {
            this.acc = 0;
            break;
          }
        }
        if (n) this.afterTick();
      }
      if (now - this.lastAutosave > 20_000) this.save();
    }
    this.updateEra();
    this.stage.frame(dt, now);
  }

  /** Fraction of the current day elapsed — used to interpolate moving things. */
  dayFraction(): number {
    return this.acc;
  }

  private afterTick(): void {
    const s = this.state!;
    if (s.flags.lastObjective !== this.lastObjectiveSeen) {
      this.lastObjectiveSeen = s.flags.lastObjective;
      const news = s.news.find((n) => n.text.startsWith('✅'));
      if (news) this.toast(news.text.replace('✅ ', ''), 'good', String(s.flags.lastObjectiveAdvisor ?? 'bit'));
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
    this.notify();
  }

  private updateEra(): void {
    const target: Era = this.eraOverride ?? this.eraForK(this.state?.stats.K ?? kardashev(19.6e12));
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

  // ── UI state ──────────────────────────────────────────────────────────────────────────────
  setSpeed(speed: Speed): void {
    if (this.state?.events.active || this.awayReport) return;
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
    setMuted(!this.settings.sound);
    if (patch.zoom !== undefined) this.stage.setZoomBoost(this.settings.zoom * (this.mode === 'diorama' ? 2 : 1));
    this.notify();
  }

  toggleTimelapse(): void {
    this.dioramaTimelapse = !this.dioramaTimelapse;
    sfx('click');
    this.notify();
  }

  setEraOverride(era: Era | null): void {
    this.eraOverride = era;
    this.updateEra();
    this.notify();
  }

  dismissAway(): void {
    this.awayReport = null;
    this.speed = this.state?.events.active ? 0 : this.resumeSpeed || 1;
    this.notify();
  }

  dismissActComplete(): void {
    this.showActComplete = false;
    this.speed = this.resumeSpeed || 1;
    this.notify();
  }

  // ── actions (wrap the sim, refresh, give feedback) ─────────────────────────────────────────
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

  build(siteId: string, type: FacilityType) {
    return this.after(A.build(this.state!, siteId, type), 'build');
  }

  requestGrid(siteId: string, mw: number) {
    return this.after(A.requestGrid(this.state!, siteId, mw));
  }

  linkClick(siteId: string): void {
    const tool = this.tool;
    if (!tool || tool.kind !== 'link') return;
    if (!tool.from) {
      this.tool = { kind: 'link', from: siteId };
      sfx('select');
      this.notify();
      return;
    }
    const r = this.after(A.buildLink(this.state!, tool.from, siteId));
    if (r.ok) this.tool = null;
    this.notify();
  }

  order(supplier: SupplierId, qty: number, dest: string, mode: 'sea' | 'air') {
    return this.after(A.placeOrder(this.state!, this.ctx, supplier, qty, dest, mode), 'cash');
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
      if (!s.events.active) this.speed = this.resumeSpeed || 1;
      this.notify();
    } else sfx('error');
  }
}
