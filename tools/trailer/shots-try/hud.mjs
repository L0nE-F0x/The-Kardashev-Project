// what the interface looks like in each act (a 1280x720 page at 2x: big, readable on a phone)
export default async ({ js, snap, page }) => {
  const start = (preset, home = 'bay-area') => js(`(() => { const g = game; D.quiet(); if (g.state) g.quitToMenu(); D.quiet(); try { localStorage.clear(); } catch {} D.clockAt(-100, 16.5);
    const o = { name: 'Kardashev Labs', homeSite: ${JSON.stringify(home)}, seed: 11, tutorial: false, difficulty: 'standard' }; ${preset ? `o.${preset} = true;` : ''}
    if (!g.startNew(o)) throw new Error('refused'); D.ui(true); g.toasts && (g.toasts.length = 0); g.notify(); D.run(30); return { act: g.state.act, day: g.state.day, mode: g.mode, home: g.state.company?.home ?? g.state.homeSite }; })()`);
  const clear = `for (let i = 0; i < 8 && game.state?.events?.active; i++) game.chooseEvent(0);`;
  const which = process.env.ACT ?? '2';
  if (which === '2') {
    console.log(JSON.stringify(await start('act2', 'west-texas')));
    await js(`${clear} game.setSpeed(2); D.run(240); ${clear}`); await snap('map');
    await js(`game.enterDiorama(game.state.sites ? Object.values(game.state.sites).find(s => s.facilities?.length)?.id ?? 'west-texas' : 'west-texas'); D.run(200); ${clear}`); await snap('campus');
    await js(`game.openPanel('research'); D.run(20)`); await snap('research');
    await js(`game.openPanel('compute'); D.run(20)`); await snap('compute');
    await js(`game.openPanel('deals'); D.run(20)`); await snap('deals');
    await js(`game.openPanel('stats'); D.run(20)`); await snap('stats');
  } else if (which === '3') {
    console.log(JSON.stringify(await start('act3')));
    await js(`${clear} game.setSpeed(2); D.run(120); ${clear}`); await snap('map');
    await js(`game.openPanel('charter'); D.run(20)`); await snap('charter');
    await js(`game.openPanel('council'); D.run(20)`); await snap('council');
    await js(`game.openPanel(null); game.enterDiorama('charter-hq'); D.run(120)`); await snap('hq');
  } else if (which === '4') {
    console.log(JSON.stringify(await start('act4')));
    await js(`${clear} D.run(120); ${clear}`); await snap('map');
    await js(`game.openPanel('planet'); D.run(20)`); await snap('planet');
    await js(`game.openPanel(null); game.enterOrbit(); D.run(120)`); await snap('orbit');
  } else {
    console.log(JSON.stringify(await start('act5')));
    await js(`${clear} D.run(120); ${clear}`); await snap('map');
    await js(`game.openPanel('system'); D.run(20)`); await snap('system-panel');
    await js(`game.openPanel(null); game.enterSystem(); D.run(120)`); await snap('system');
  }
};
