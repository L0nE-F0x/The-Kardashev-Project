// the Act III interface (look 3) a few years into the Charter: the Charter and Council panels over the globe, a megaproject site
export default async ({ js, snap }) => {
  const days = +(process.env.DAYS ?? 1500);
  console.log(JSON.stringify(await js(`(async () => { await D.bots(); D.ui(true); D.start('act3', 'west-texas'); const t = Date.now(); D.days(${days}, D.bot.b3);
    game.enterMap(); await D.runAsync(30); await D.loaded(); D.scene = game.stage.getScene(); D.kind = 'globe'; D.scene.clampView = function () {}; game.select?.(null);
    D.move([{ lon: 14, lat: 30, dist: 150, hour: 15.5 }, { lon: 30, lat: 30, dist: 140, hour: 16.5 }], 'soft'); D.pose(0); await D.runAsync(30); D.calm();
    const c = game.state.charter; return { ms: Date.now() - t, day: game.state.day, phase: c.phase, projects: Object.keys(c.projects ?? {}).length, tenders: Object.keys(c.tenders ?? {}).length, look: document.documentElement.dataset.look }; })()`)));
  await snap('map');
  await js(`game.openPanel('charter'); D.run(20); D.calm()`); await snap('charter');
  await js(`game.openPanel('council'); D.run(20); D.calm()`); await snap('council');
  await js(`(async () => { game.openPanel(null); game.enterDiorama('mega-sahara'); D.clockAt(8, 16.6, 5, 21); await D.runAsync(60); await D.loaded(); D.own(); D.scene.setWeather('clear'); game.select?.({ kind: 'site', id: 'mega-sahara' });
    D.move([D.at(-30, 60, 0.5, -0.5, 1.36, 18, 30), D.at(-10, 30, 0.62, -0.2, 1.24, 14, 30)]); D.pose(0.5); await D.runAsync(40); D.calm(); })()`); await snap('sahara');
};
