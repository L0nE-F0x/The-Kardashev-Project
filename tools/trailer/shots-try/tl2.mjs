export default async ({ js, snap }) => {
  await js(`(async () => { await D.bots(); D.start('act2', 'west-texas'); D.ui(false); D.days(1, D.bot.b2); game.enterDiorama('west-texas'); D.clockAt(-102, 10); await D.runAsync(30); await D.loaded(); })()`);
  console.log(JSON.stringify(await js(`D.own()`)));
  await js(`D.cam({ pos: [-70, 80, 150], look: [10, 2, 0], fov: 30 }); D.run(20)`);
  await snap('0');
  for (let k = 1; k <= 5; k++) {
    await js(`(async () => { for (let f = 0; f < 60; f++) { D.days(5, D.bot.b2); window.__dateBase += 60000; await D.runAsync(1); if (f % 10 === 0) await D.loaded(60, 1500); } const b = game.stage.getScene().layout.bounds; const cx = (b.x0 + b.x1) / 2; D.cam({ pos: [cx - 80, 90, 170], look: [cx, 2, 0], fov: 30 }); await D.runAsync(4); })()`);
    console.log(JSON.stringify(await js(`({ day: game.state.day, act: game.state.act, phase: game.state.phase, cash: Math.round(game.state.finance.cash / 1e6), b: game.stage.getScene().layout.bounds, sites: Object.values(game.state.sites).filter(s => s.facilities?.length || s.owned).map(s => s.id + ':' + (s.facilities?.length ?? '?')).join(' ') })`)));
    await snap(String(k));
  }
};
