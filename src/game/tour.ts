import type { Game } from './game';
import type { Scene } from '../render/stage';
import { SITE_BY_ID } from '../content/sites';
import { REGIONS } from '../content/regions';
import { loopShowcaseShips, makeShowcase } from './showcase';

type Shot =
  | { kind: 'map'; lod: number; from: [number, number]; to: [number, number]; secs: number; caption: string }
  | { kind: 'campus'; site: string; secs: number; caption?: string };

/** The menu's cinematic: slow globe fly-overs that cut into real campus dioramas. */
const SHOTS: Shot[] = [
  { kind: 'map', lod: 0, from: [-60, 22], to: [10, 28], secs: 12, caption: 'Earth · 19.6 terawatts · K 0.729' },
  { kind: 'campus', site: 'west-texas', secs: 12 },
  { kind: 'map', lod: 1, from: [104, 5], to: [128, 30], secs: 10, caption: 'The Pacific Fab Belt and the Strait of Malacca' },
  { kind: 'campus', site: 'lulea', secs: 11, caption: 'Luleå · free cooling at the Arctic Circle' },
  { kind: 'map', lod: 1, from: [20, 38], to: [50, 18], secs: 10, caption: 'Suez, the Red Sea and the Gulf' },
  { kind: 'campus', site: 'gulf-coast', secs: 11 },
  { kind: 'map', lod: 0, from: [100, 15], to: [170, 10], secs: 11, caption: 'Night falls over Asia' },
  { kind: 'campus', site: 'columbia-gorge', secs: 11 },
  { kind: 'map', lod: 1, from: [-90, 10], to: [-60, -25], secs: 10, caption: 'Panama and the Andes' },
  { kind: 'campus', site: 'atacama', secs: 11, caption: 'Atacama · the sunniest desert on Earth' },
  { kind: 'campus', site: 'kyushu', secs: 10 },
];

const FADE = 0.6;

interface MapLike extends Scene {
  cinematic?(from: [number, number], to: [number, number], secs: number, lod: number): void;
}

interface DioramaLike extends Scene {
  autoPan?: boolean;
}

export class TourDirector {
  private index = -1;
  private t = 0;
  private clock = 0;
  private fadingOut = false;
  private running = false;

  constructor(private readonly game: Game) {}

  start() {
    const g = this.game;
    g.showcase ??= makeShowcase(g.ctx);
    this.clock = g.showcase.day;
    this.running = true;
    this.index = -1;
    this.nextShot(true);
  }

  stop() {
    this.running = false;
    this.game.stage.fade = 0;
  }

  inCampus(): boolean {
    return SHOTS[this.index]?.kind === 'campus';
  }

  dayFraction(): number {
    return this.clock - Math.floor(this.clock);
  }

  update(dt: number) {
    if (!this.running) return;
    const g = this.game;
    const s = g.showcase!;
    // the demo world drifts forward so ships sail
    this.clock += dt * 0.8;
    s.day = Math.floor(this.clock);
    loopShowcaseShips(s);
    const shot = SHOTS[this.index];
    this.t += dt;
    const stage = g.stage;
    if (this.fadingOut) {
      stage.fade = Math.min(1, stage.fade + dt / FADE);
      if (stage.fade >= 1) this.nextShot(false);
      return;
    }
    if (stage.fade > 0) stage.fade = Math.max(0, stage.fade - dt / FADE);
    if (shot && this.t >= shot.secs - FADE) this.fadingOut = true;
  }

  private nextShot(first: boolean) {
    const g = this.game;
    this.index = (this.index + 1) % SHOTS.length;
    const shot = SHOTS[this.index];
    this.t = 0;
    this.fadingOut = false;
    g.stage.fade = first ? 1 : 1;
    if (shot.kind === 'map') {
      g.stage.setZoomBoost(g.settings.zoom);
      const scene = g.makeMapScene() as MapLike;
      g.stage.setScene(scene);
      scene.cinematic?.(shot.from, shot.to, shot.secs, shot.lod);
      g.tourCaption = shot.caption;
    } else {
      g.stage.setZoomBoost(g.settings.zoom * 2);
      const scene = g.makeDioramaScene(shot.site) as DioramaLike;
      scene.autoPan = true;
      g.stage.setScene(scene);
      const site = SITE_BY_ID[shot.site];
      g.tourCaption = shot.caption ?? `${site.name} · ${REGIONS[site.region].name}`;
    }
    g.notify();
  }
}
