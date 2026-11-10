/**
 * The game (play/index.html): the sim, the interface, saves and audio in `Game`, drawn by three.js
 * (render3d/). See SPEC §28–30.
 */
import { render, h } from 'preact';
import './ui/styles.css';
import './ui/modern.css';
import './render3d/edition.css';
import './render3d/photo.css';
import mapUrl from './content/generated/worldmap.bin?url';
import { syncCssVars } from './render/palette';
import { decodeWorldMap } from './world/mapData';
import { Router } from './world/routing';
import { Game } from './game/game';
import { TourDirector } from './game/tour';
import { App } from './ui/App';
import { startShell } from './game/shell';
import { Stage3D } from './render3d/stage3d';
import { GlobeScene } from './render3d/globe/globeScene';
import { CampusScene } from './render3d/campus/campusScene';
import { OrbitScene3D } from './render3d/orbit/orbitScene';
import { SystemScene3D } from './render3d/system/systemScene';
import { loadModels, PEOPLE, SCENERY } from './render3d/models';
import { loadSettings } from './save/settings';
import { quality, resolveQuality, setOnStrongGpu, setQuality } from './render3d/quality';
import { gpuStatus } from './platform/platform';

/** Everything Act I's campuses use, loaded before the menu so scenes build in one go. */
const ACT1_MODELS = ['garage', 'lab', 'gasplant', 'substation', 'watertower', 'mesquite', 'pickup', 'semitruck', 'sedan', 'hatchback', 'suv', 'van', 'mixer', 'flatbed', ...SCENERY] as const;

async function boot() {
  syncCssVars();
  document.documentElement.classList.add('edition-3d');
  const host = document.getElementById('game')!;
  const status = document.getElementById('boot');
  if (status) status.textContent = 'BUILDING THE WORLD…';
  // the app may have been started on the stronger graphics card: Auto detail then means High
  setOnStrongGpu(!!(await gpuStatus())?.active);
  const q0 = loadSettings().quality3d;
  setQuality(resolveQuality(q0), (q0 ?? 'auto') === 'auto');
  // handy in the console while tuning (the live detail level the stage and scenes read)
  (window as unknown as { quality3d: typeof quality }).quality3d = quality;
  const stage = new Stage3D(host);
  const [buf] = await Promise.all([(await fetch(mapUrl)).arrayBuffer(), loadModels([...ACT1_MODELS, ...PEOPLE])]);
  const lods = decodeWorldMap(buf);
  const router = new Router(lods[0]);
  const game: Game = new Game(stage, { lods, router }, {
    map: (g) => new GlobeScene(g),
    diorama: (g, siteId) => new CampusScene(g, siteId),
    orbit: (g) => new OrbitScene3D(g),
    system: (g, opts) => new SystemScene3D(g, opts),
    // the menu tour: every shot, from the first campuses to Geneva, the Moon, the swarm and Aurora
    tour: (g) => new TourDirector(g),
  });
  // the detail level follows the setting
  let q = game.settings.quality3d;
  game.subscribe(() => {
    if (game.settings.quality3d === q) return;
    q = game.settings.quality3d;
    setQuality(resolveQuality(q), q === 'auto');
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
