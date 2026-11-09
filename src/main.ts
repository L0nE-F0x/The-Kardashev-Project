import { render, h } from 'preact';
import './ui/styles.css';
import './ui/modern.css';
import mapUrl from './content/generated/worldmap.bin?url';
import { PixelStage } from './render/stage';
import { syncCssVars } from './render/palette';
import { decodeWorldMap } from './world/mapData';
import { Router } from './world/routing';
import { Game } from './game/game';
import { MapScene, prebuildMapLod } from './render/worldMap/mapScene';
import { DioramaScene } from './render/diorama/dioramaScene';
import { OrbitScene } from './render/orbit/orbitScene';
import { SystemScene } from './render/system/systemScene';
import { TourDirector } from './game/tour';
import { App } from './ui/App';
import { startShell } from './game/shell';

async function boot() {
  syncCssVars();
  const host = document.getElementById('game')!;
  const status = document.getElementById('boot');
  const stage = new PixelStage();
  await stage.init(host);
  const buf = await (await fetch(mapUrl)).arrayBuffer();
  const lods = decodeWorldMap(buf);
  const router = new Router(lods[0]);
  const game = new Game(stage, { lods, router }, {
    map: (g) => new MapScene(g),
    diorama: (g, siteId) => new DioramaScene(g, siteId),
    tour: (g) => new TourDirector(g, { prebuild: prebuildMapLod }),
    orbit: (g) => new OrbitScene(g),
    system: (g, opts) => new SystemScene(g, opts),
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
