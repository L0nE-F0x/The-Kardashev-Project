/**
 * The 3D edition (play3d/index.html): the same Game, sim, UI, saves and audio as the pixel game,
 * drawn by three.js. See SPEC §28.
 */
import { render, h } from 'preact';
import './ui/styles.css';
import './ui/modern.css';
import './render3d/edition.css';
import mapUrl from './content/generated/worldmap.bin?url';
import { syncCssVars } from './render/palette';
import { decodeWorldMap } from './world/mapData';
import { Router } from './world/routing';
import { Game } from './game/game';
import { TourDirector } from './game/tour';
import { App } from './ui/App';
import { startShell } from './game/shell';
import { siteDef } from './content/sites';
import { Stage3D } from './render3d/stage3d';
import { GlobeScene } from './render3d/globe/globeScene';
import { CampusScene } from './render3d/campus/campusScene';
import { OrbitScene3D } from './render3d/orbit/orbitScene';
import { SystemScene3D } from './render3d/system/systemScene';
import { loadModels, PEOPLE } from './render3d/models';
import { loadSettings } from './save/settings';
import { resolveQuality, setQuality } from './render3d/quality';

/** Everything Act I's campuses use, loaded before the menu so scenes build in one go. */
const ACT1_MODELS = ['garage', 'lab', 'gasplant', 'substation', 'watertower', 'mesquite', 'oak', 'pickup', 'semitruck', 'sedan', 'hatchback', 'suv', 'van', 'mixer', 'flatbed'] as const;

async function boot() {
  syncCssVars();
  document.documentElement.classList.add('edition-3d');
  const host = document.getElementById('game')!;
  const status = document.getElementById('boot');
  if (status) status.textContent = 'BUILDING THE WORLD…';
  setQuality(resolveQuality(loadSettings().quality3d));
  const stage = new Stage3D(host);
  const [buf] = await Promise.all([(await fetch(mapUrl)).arrayBuffer(), loadModels([...ACT1_MODELS, ...PEOPLE])]);
  const lods = decodeWorldMap(buf);
  const router = new Router(lods[0]);
  /** Facility types with their 3D art so far (the tour only cuts to campuses built from these). */
  const DONE = new Set(['hq', 'solar', 'wind', 'gas', 'battery', 'datacenter', 'lab', 'hydro', 'geothermal', 'restart', 'smr', 'reactor', 'packaging', 'fab', 'campus']);
  const shotReady = (site: string) => siteDef(site).kind === 'build' && (game.showcase?.facilities ?? []).filter((f) => f.siteId === site).every((f) => DONE.has(f.type));
  const game: Game = new Game(stage, { lods, router }, {
    map: (g) => new GlobeScene(g),
    diorama: (g, siteId) => new CampusScene(g, siteId),
    orbit: (g) => new OrbitScene3D(g),
    system: (g, opts) => new SystemScene3D(g, opts),
    // the menu tour, with the shots the 3D edition can show so far (Acts I–II campuses and the globe)
    tour: (g) => new TourDirector(g, { supports: (shot) => (shot.world ?? 2) === 2 && (shot.kind === 'map' || (shot.kind === 'campus' && shotReady(shot.site!))) }),
  });
  // the detail level follows the setting
  let q = game.settings.quality3d;
  game.subscribe(() => {
    if (game.settings.quality3d === q) return;
    q = game.settings.quality3d;
    setQuality(resolveQuality(q));
    stage.applyQuality();
  });
  game.showMenu();
  render(h(App, { game }), document.getElementById('ui')!);
  status?.remove();
  startShell(game);
}

boot().catch((err) => {
  console.error(err);
  const status = document.getElementById('boot');
  if (status) status.textContent = `Failed to start: ${err?.message ?? err}`;
});
