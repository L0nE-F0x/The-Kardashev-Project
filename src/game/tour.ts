import type { Game } from './game';
import type { GameScene as Scene } from '../render/stage';
import { SITE_BY_ID } from '../content/sites';
import { REGIONS } from '../content/regions';
import { loopShowcaseShips, makeShowcase } from './showcase';
import { act4PreviewState } from '../sim/planetPreview';
import { act5PreviewState } from '../sim/systemPreview';
import { refreshStats } from '../sim/tick';
import type { GameState } from '../sim/types';

/** Which world a shot shows: the Act II showcase company, a ~2062 planet, a ~2084 solar system. */
type World = 2 | 4 | 5;

/** How a campus shot is filmed: the light, and the camera's move. */
type Light = 'dawn' | 'morning' | 'noon' | 'golden' | 'sunset' | 'dusk' | 'night';
type Move = 'rise' | 'orbit' | 'push' | 'fly' | 'crane' | 'low' | 'sky';

type Shot =
  | { kind: 'map'; lod: number; from: [number, number]; to: [number, number]; secs: number; caption: string; world?: World;
      /** The light: local solar time (hours) where the glide ends, as the shot starts and as it ends. */
      hours?: [number, number];
      /** The latitude the Sun stands over (default a mild northern summer). */
      season?: number }
  | { kind: 'campus'; site: string; secs: number; caption?: string; world?: World; light?: Light; move?: Move }
  | { kind: 'orbit'; secs: number; caption: string; world: World }
  | { kind: 'system'; secs: number; caption: string; world: World };

/** The menu's cinematic: slow globe fly-overs that cut into real campus dioramas. */
const SHOTS: Shot[] = [
  // (the film opens on the night side, lights and cables; the Sun breaks over the limb as the glide ends: it has to
  // stand almost behind the planet for that, hence the small hours and the southern season)
  { kind: 'map', lod: 0, from: [-60, 22], to: [10, 28], secs: 12, caption: 'Earth · 19.6 terawatts · K 0.729', hours: [1.55, 2.12], season: -22 },
  { kind: 'campus', site: 'west-texas', secs: 12, light: 'golden', move: 'rise' },
  { kind: 'campus', site: 'lakeshore', secs: 10, caption: 'Lakeshore Station · a retired reactor, restarted', light: 'morning', move: 'orbit' },
  { kind: 'map', lod: 1, from: [104, 5], to: [128, 30], secs: 10, caption: 'The Pacific Fab Belt and the Strait of Malacca', hours: [9.6, 10] },
  { kind: 'campus', site: 'lulea', secs: 11, caption: 'Luleå · free cooling at the Arctic Circle', light: 'night', move: 'sky' },
  { kind: 'map', lod: 1, from: [20, 38], to: [50, 18], secs: 10, caption: 'Suez, the Red Sea and the Gulf', hours: [15.2, 15.6] },
  { kind: 'campus', site: 'gulf-coast', secs: 11, light: 'noon', move: 'fly' },
  // (the day's edge crosses Asia in eleven seconds, the camera going west with it: Japan's lights first, then China's)
  { kind: 'map', lod: 0, from: [138, 24], to: [102, 20], secs: 11, caption: 'Night falls over Asia', hours: [16.2, 19.4] },
  { kind: 'campus', site: 'columbia-gorge', secs: 11, light: 'dusk', move: 'push' },
  { kind: 'map', lod: 1, from: [-90, 10], to: [-60, -25], secs: 10, caption: 'Panama and the Andes', hours: [15, 15.4] },
  { kind: 'campus', site: 'atacama', secs: 11, caption: 'Atacama · the sunniest desert on Earth', light: 'sunset', move: 'low' },
  { kind: 'campus', site: 'kyushu', secs: 10, light: 'morning', move: 'crane' },
  { kind: 'map', lod: 1, from: [-75, 42], to: [-20, 48], secs: 10, caption: 'Subsea cables under the Atlantic', hours: [22.4, 22.8] },
  { kind: 'campus', site: 'wyoming', secs: 13, caption: 'Wyoming · a gigawatt campus on the high plains', light: 'golden', move: 'orbit' },
  // ── Acts III–V: the Charter, the planet, the solar system ──
  { kind: 'campus', world: 4, site: 'charter-hq', secs: 12, caption: 'Geneva · the Kardashev Project', light: 'dusk', move: 'rise' },
  { kind: 'campus', world: 4, site: 'mega-sahara', secs: 11, caption: 'The Sahara · solar to the horizon', light: 'noon', move: 'crane' },
  { kind: 'map', world: 4, lod: 0, from: [-30, 18], to: [70, 24], secs: 12, caption: 'One planet, one grid · a supergrid that follows the sun', hours: [16.4, 17.8] },
  { kind: 'campus', world: 4, site: 'launch-guiana', secs: 11, caption: 'Guiana Space Coast · the road to orbit', light: 'sunset', move: 'fly' },
  { kind: 'orbit', world: 4, secs: 12, caption: 'Low Earth orbit · stations, beams and launches' },
  { kind: 'campus', world: 4, site: 'moon', secs: 12, caption: 'Shackleton Base · the Moon' },
  { kind: 'system', world: 5, secs: 13, caption: 'The inner solar system · the swarm grows' },
  { kind: 'campus', world: 5, site: 'aurora', secs: 12, caption: 'Aurora · the first habitat at L5' },
  { kind: 'campus', world: 5, site: 'eros', secs: 11, caption: 'Eros · an asteroid mined in place' },
];

const FADE = 0.6;

interface MapLike extends Scene {
  cinematic?(from: [number, number], to: [number, number], secs: number, lod: number, hours?: [number, number], season?: number): void;
}

interface DioramaLike extends Scene {
  autoPan?: boolean;
  direct?(d: { light?: Light; move?: Move; secs: number }): void;
}

export class TourDirector {
  private index = -1;
  private t = 0;
  private clock = 0;
  private fadingOut = false;
  private running = false;
  /** The later-act worlds, built the first time a shot needs them (never saved). */
  private worlds = new Map<World, GameState>();

  constructor(private readonly game: Game) {}

  private world(w: World): GameState {
    const g = this.game;
    if (w === 2) return (this.worlds.get(2) ?? (this.worlds.set(2, (g.showcase ??= makeShowcase(g.ctx))), g.showcase))!;
    let s = this.worlds.get(w);
    if (!s) {
      s = w === 4 ? act4PreviewState({ stage: 3, moon: 3 }) : act5PreviewState({ stage: 3 });
      s.company.name = 'The Kardashev Project';
      refreshStats(s);
      this.worlds.set(w, s);
    }
    return s;
  }

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
    // the demo company's world drifts forward so ships sail (the later worlds hold still)
    this.clock += dt * 0.8;
    if (s === this.worlds.get(2)) {
      s.day = Math.floor(this.clock);
      loopShowcaseShips(s);
    }
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

  private nextShot(first: boolean): void {
    const g = this.game;
    this.index = (this.index + 1) % SHOTS.length;
    const shot = SHOTS[this.index];
    this.t = 0;
    this.fadingOut = false;
    g.stage.fade = first ? 1 : 1;
    g.showcase = this.world(shot.world ?? 2);
    // (the zoom changes between the old scene going and the new one coming, so neither is laid out twice)
    if (shot.kind === 'orbit' || shot.kind === 'system') {
      const scene = shot.kind === 'orbit' ? g.makeOrbitScene() : g.makeSystemScene();
      if (!scene) {
        this.nextShot(false);
        return;
      }
      g.stage.setScene(scene, 1);
      g.tourCaption = shot.caption;
    } else if (shot.kind === 'map') {
      const scene = g.makeMapScene() as MapLike;
      g.stage.setScene(scene, 1);
      scene.cinematic?.(shot.from, shot.to, shot.secs, shot.lod, shot.hours, shot.season);
      g.tourCaption = shot.caption;
    } else {
      const scene = g.makeDioramaScene(shot.site) as DioramaLike;
      scene.autoPan = true;
      scene.direct?.({ light: shot.light, move: shot.move, secs: shot.secs });
      g.stage.setScene(scene, 2);
      const site = SITE_BY_ID[shot.site];
      g.tourCaption = shot.caption ?? `${site.name} · ${REGIONS[site.region].name}`;
    }
    g.notify();
  }
}
