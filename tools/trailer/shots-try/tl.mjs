export default async ({ js, snap }) => {
  await js(`(async () => { await D.bots(); D.start('', 'west-texas'); D.ui(true); game.enterDiorama('west-texas'); D.clockAt(-102, 9); D.run(30); })()`);
  console.log(JSON.stringify(await js(`D.own()`)));
  await js(`D.cam({ pos: [-60, 60, 110], look: [-8, 2, 6], fov: 30 }); game.setSpeed(8); D.run(20)`);
  await snap('0');
  for (let k = 1; k <= 5; k++) {
    await js(`(async () => { for (let f = 0; f < 72; f++) { D.days(2, D.bot.b1); window.__dateBase += 90000; await D.runAsync(1); if (f % 8 === 0) await D.loaded(60, 1500); } })()`);
    console.log(JSON.stringify(await js(`({ day: game.state.day, act: game.state.act, cash: Math.round(game.state.finance.cash / 1e6), fac: Object.values(game.state.facilities ?? {}).length, mode: game.mode, blocked: game.blocked })`)));
    await snap(String(k));
  }
};
