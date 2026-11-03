import { render, h } from 'preact';
import './ui/styles.css';
import mapUrl from './content/generated/worldmap.bin?url';
import { PixelStage } from './render/stage';
import { syncCssVars } from './render/palette';
import { decodeWorldMap } from './world/mapData';
import { Router } from './world/routing';
import { Game } from './game/game';
import { MapScene } from './render/worldMap/mapScene';
import { DioramaScene } from './render/diorama/dioramaScene';
import { TourDirector } from './game/tour';
import { App } from './ui/App';

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
    tour: (g) => new TourDirector(g),
  });
  game.showMenu();
  render(h(App, { game }), document.getElementById('ui')!);
  status?.remove();
  bindKeys(game);

  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    game.frame(dt, now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // handy in the console while iterating
  (window as unknown as { game: Game }).game = game;
}

function bindKeys(game: Game) {
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || game.mode === 'title' || !game.state) return;
    const scene = game.stage.getScene();
    const pan = (dx: number, dy: number) => (scene as MapScene)?.pan?.(dx, dy);
    switch (e.key) {
      case ' ':
        e.preventDefault();
        game.togglePause();
        break;
      case '1':
        game.setSpeed(1);
        break;
      case '2':
        game.setSpeed(2);
        break;
      case '3':
        game.setSpeed(4);
        break;
      case '4':
        game.setSpeed(8);
        break;
      case 'c':
        game.openPanel('compute');
        break;
      case 'o':
        game.openPanel('orders');
        break;
      case 'r':
        game.openPanel('research');
        break;
      case 'f':
        game.openPanel('finance');
        break;
      case 'g':
        game.openPanel('goals');
        break;
      case 'n':
        game.openPanel('news');
        break;
      case 'b':
        game.openPanel('guide');
        break;
      case 'l':
        game.setTool(game.tool ? null : { kind: 'link', from: null });
        break;
      case 'm':
        if (game.mode === 'diorama') game.enterMap();
        break;
      case 'Escape':
        if (game.tool) game.setTool(null);
        else if (game.panel) game.openPanel(null);
        else if (game.mode === 'diorama') game.enterMap();
        else game.select(null);
        break;
      case 'ArrowLeft':
      case 'a':
        pan(-12, 0);
        break;
      case 'ArrowRight':
      case 'd':
        pan(12, 0);
        break;
      case 'ArrowUp':
      case 'w':
        pan(0, -12);
        break;
      case 'ArrowDown':
      case 's':
        pan(0, 12);
        break;
      case '+':
      case '=':
        (scene as MapScene)?.zoomIn?.();
        break;
      case '-':
        (scene as MapScene)?.zoomOut?.();
        break;
    }
  });
}

boot().catch((err) => {
  console.error(err);
  const status = document.getElementById('boot');
  if (status) status.textContent = `Failed to start: ${err?.message ?? err}`;
});
