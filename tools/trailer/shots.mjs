// Every shot the videos use. A shot = how to set the scene (`setup`, run in the page; see director.js for D.*),
// its camera move (D.move keys, played over the shot's `secs` by D.pose) and what happens per frame (`D.each`).
// secs is what gets recorded; the edit takes a part. kind 'hud' = with the interface, at double size.
// Campus space: x east, y up, z south (the road and the camera's usual side); a campus's plots sit around its focus.
const j = JSON.stringify;

/**
 * A campus shot. `light`: { light: 'golden' } or { hour, month, day }. `keys`: page code giving the D.move keys
 * (D.at(dx, dz, dist×, yaw, pitch, lookY, fov) = the game's own orbit terms, relative to the campus's middle).
 */
const campus = (id, world, site, light, secs, keys, o = {}) => ({
  id, secs, warm: 150, ...o,
  setup: `D.world(${j(world)}${o.worldOpts ? ', ' + j(o.worldOpts) : ''}); D.campus(${j(site)}, ${j({ weather: 'clear', ...light })});
    await D.runAsync(20); await D.loaded(); D.move(${keys}, ${j(o.ease ?? 'soft')}); ${o.more ?? ''}`,
});
/** A globe shot: keys of { lon, lat, dist, hour (local solar time at lon), season (the Sun's latitude) }. */
const globe = (id, world, secs, keys, o = {}) => ({
  id, secs, warm: 50, ...o,
  setup: `D.world(${j(world)}); D.globe(${j({ bare: !!o.bare })}); D.move(${j(keys)}, ${j(o.ease ?? 'inout')}); ${o.more ?? ''}`,
});
/** Cards answered, toasts cleared, every frame of an interface shot. */
const CALM = `D.calm();`;

export const SHOTS = [
  // ── the opening: Earth at night, 2026 ─────────────────────────────────────────────────────────────────────────
  globe('earth-night', 'garage', 11, [
    { lon: -76, lat: 24, dist: 250, hour: 1.15, season: -22 },
    { lon: 2, lat: 30, dist: 205, hour: 2.08, season: -22 },
  ], { bare: true, still: [0.55, 0.97] }),

  // ── Act I: the garage ─────────────────────────────────────────────────────────────────────────────────────────
  campus('garage', 'garage', 'bay-area', { hour: 8.9, month: 11, day: 12 }, 6,
    `[{ pos: [-33, 22, 50], look: [-15, 1.5, 15], fov: 24 }, { pos: [-25, 10, 32], look: [-15.5, 1.9, 15.5], fov: 24 }]`,
    { warm: 300, ease: 'out', still: [0.9] }),
  // the first campus going up next to the garage, the real interface on screen, the game's own bot playing
  {
    id: 'hud-build', kind: 'hud', secs: 8, warm: 30, preview: [0.2, 0.5, 1],
    setup: `await D.bots(); D.start('', 'west-texas'); game.select?.({ kind: 'site', id: 'west-texas' }); game.enterDiorama('west-texas');
      D.clockAt(-102, 8.5, 4, 10); await D.runAsync(40); await D.loaded(); D.own(); D.scene.setWeather('clear'); D.pointer();
      D.move([{ pos: [-52, 58, 104], look: [4, 0, 6], fov: 30 }, { pos: [-30, 46, 96], look: [12, 0, 4], fov: 30 }], 'soft');
      D.shot.on = 0;
      D.each = (u, f) => {
        // the player's two clicks (the real buttons), then the clock at full speed with the game's test bot playing on
        D.ptrMove(f, 14, 46, '[data-tut="build-datacenter"]');
        D.ptrMove(f, 58, 84, '[data-tut="build-solar"]');
        D.ptrMove(f, 96, 130, [innerWidth * 0.42, innerHeight * 0.7], () => {});
        if (f === 100) game.setSpeed(8);
        if (f >= 100) { D.days(f < 250 ? 2 : 1, D.bot.b1); window.__dateBase += 70000; }
        const on = game.state.facilities ? Object.values(game.state.facilities).filter((x) => x.status === 'online').length : 0;
        if (on !== D.shot.on) { D.shot.on = on; (D.shot.log ??= []).push('online ' + on + ' @ frame ' + f + ' day ' + game.state.day); } };
      D.post = () => { D.calm(); };`,
    still: [0.5],
  },

  // ── Act II: the scale-up ──────────────────────────────────────────────────────────────────────────────────────
  // four years of the company's home campus in five seconds (the Act II bot at the controls)
  {
    id: 'timelapse', secs: 6, warm: 30,
    setup: `await D.bots(); D.start('act2', 'west-texas'); D.days(1, D.bot.b2); game.enterDiorama('west-texas');
      D.clockAt(-102, 7.6, 5, 21); await D.runAsync(40); await D.loaded(); D.own(); D.scene.setWeather('clear'); D.ui(false);
      D.move([{ pos: [-64, 46, 118], look: [6, 3, 2], fov: 30 }, { pos: [-10, 60, 150], look: [22, 3, 0], fov: 30 }, { pos: [62, 52, 150], look: [20, 4, 0], fov: 30 }], 'soft');
      D.each = (u, f) => { D.days(4, D.bot.b2); window.__dateBase += 95000; };`,
    still: [0.8],
  },
  campus('lulea-night', 2, 'lulea', { light: 'night' }, 6,
    `[D.at(-D.W() * 0.14, 20, 0.36, -0.42, 1.52, 9, 34), D.at(D.W() * 0.02, 18, 0.33, -0.05, 1.52, 11, 34)]`, { still: [0.5] }),
  campus('lakeshore', 2, 'lakeshore', { light: 'morning' }, 6,
    `[D.at(-6, 4, 0.42, -0.95, 1.47, 14, 32), D.at(-2, 4, 0.4, -0.35, 1.45, 16, 32)]`, { still: [0.6] }),
  campus('fab', 2, 'lumen-hsinchu', { light: 'golden' }, 5,
    `[D.at(-6, 6, 0.6, 0.75, 1.36, 6, 30), D.at(-12, 6, 0.5, 0.3, 1.4, 7, 30)]`, { still: [0.6] }),
  campus('mine', 2, 'mine-pilbara', { light: 'golden' }, 5,
    `[D.at(6, 2, 0.5, 0.5, 1.2, 2, 30), D.at(10, 0, 0.4, 0.05, 1.3, 3, 30)]`, {}),
  campus('wind', 2, 'west-texas', { light: 'golden' }, 6,
    `[D.at(-D.W() * 0.12, 24, 0.44, -0.78, 1.53, 10, 32), D.at(0, 4, 0.7, -0.4, 1.3, 6, 30)]`, { still: [0.25, 0.9] }),
  campus('wyoming', 2, 'wyoming', { light: 'golden' }, 6,
    `[D.at(0, 0, 0.6, 0.62, 1.4, 6, 30), D.at(0, 0, 0.6, 0.02, 1.4, 6, 30)]`, { still: [0.5] }),
  campus('atacama', 2, 'atacama', { light: 'sunset' }, 5,
    `[D.at(D.W() * 0.1, 34, 0.6, 0.5, 1.5, 8, 30), D.at(-D.W() * 0.04, 30, 0.5, 0.2, 1.48, 8, 30)]`, { skip: true }),
  campus('gorge-dusk', 2, 'columbia-gorge', { light: 'dusk' }, 5,
    `[D.at(0, 0, 1.0, -0.16, 1.3, 2, 30), D.at(-D.W() * 0.08, 6, 0.46, -0.46, 1.42, 5, 30)]`, { still: [0.9] }),
  // the map as you play it: the interface over the globe, ships under way, the clock running
  {
    id: 'hud-map', kind: 'hud', secs: 5, warm: 30,
    setup: `await D.bots(); D.start('act2', 'west-texas'); D.days(520, D.bot.b2); game.enterMap(); await D.runAsync(30); await D.loaded();
      D.scene = game.stage.getScene(); D.kind = 'globe'; D.scene.clampView = function () {}; game.select?.(null); game.setSpeed(8);
      D.move([{ lon: -128, lat: 30, dist: 150, hour: 14.5 }, { lon: -92, lat: 30, dist: 128, hour: 16.5 }], 'soft');
      D.each = () => { D.days(1, D.bot.b2); }; D.post = () => { D.calm(); };`,
    still: [0.7],
  },
  {
    id: 'hud-research', kind: 'hud', secs: 4, warm: 30,
    setup: `await D.bots(); D.start('act2', 'west-texas'); D.days(300, D.bot.b2); game.enterDiorama('west-texas'); D.clockAt(-102, 16.8, 5, 21);
      await D.runAsync(40); await D.loaded(); D.own(); D.scene.setWeather('clear'); game.setSpeed(4); game.select?.(null); game.openPanel('research');
      D.move([{ pos: [-50, 40, 110], look: [14, 3, 2], fov: 30 }, { pos: [-30, 40, 116], look: [18, 3, 2], fov: 30 }], 'soft');
      D.post = () => { ${CALM} };`,
    still: [0.5],
  },
  // a card: the fabs have stopped; two advisors, two ways out; the player picks one
  {
    id: 'hud-event', kind: 'hud', secs: 6, warm: 30, preview: [0.3, 0.6, 0.95],
    setup: `await D.bots(); D.start('act2', 'west-texas'); D.days(300, D.bot.b2); game.enterDiorama('west-texas'); D.clockAt(-102, 16.8, 5, 21);
      await D.runAsync(40); await D.loaded(); D.own(); D.scene.setWeather('clear'); game.setSpeed(2); game.select?.(null); D.pointer();
      const ev = await import('/src/sim/events.ts');
      D.move([{ pos: [-58, 42, 112], look: [12, 3, 2], fov: 30 }, { pos: [-36, 40, 118], look: [18, 3, 2], fov: 30 }], 'soft');
      D.each = (u, f) => {
        if (f === 24) { ev.queueEvent(game.state, 'fab-quake'); D.M.tk.tick(game.state, game.ctx); game.notify(); }
        D.ptrMove(f, 150, 200, '.btn.choice.primary');
        D.ptrMove(f, 230, 270, [innerWidth * 0.5, innerHeight * 0.75], () => {});
      };`,
    still: [0.6],
  },
  {
    id: 'hud-campus', kind: 'hud', secs: 5, warm: 30,
    setup: `await D.bots(); D.start('act2', 'west-texas'); D.days(900, D.bot.b2); game.enterDiorama('west-texas'); D.clockAt(-102, 17.2, 5, 21);
      await D.runAsync(40); await D.loaded(); D.own(); D.scene.setWeather('clear'); game.setSpeed(4); game.select?.({ kind: 'site', id: 'west-texas' });
      D.move([{ pos: [-66, 44, 116], look: [10, 3, 2], fov: 30 }, { pos: [-40, 40, 122], look: [16, 3, 2], fov: 30 }], 'soft');
      D.each = () => { D.days(1, D.bot.b2); }; D.post = () => { D.calm(); };`,
    still: [0.5],
  },
  globe('globe-cables', 2, 7, [
    { lon: -72, lat: 40, dist: 128, hour: 22.3 },
    { lon: -24, lat: 46, dist: 118, hour: 22.9 },
  ], { still: [0.5] }),
  globe('globe-asia', 2, 7, [
    { lon: 138, lat: 26, dist: 205, hour: 16.3, season: 10 },
    { lon: 104, lat: 22, dist: 190, hour: 19.5, season: 10 },
  ], { still: [0.75] }),

  // ── Act III: the Charter ──────────────────────────────────────────────────────────────────────────────────────
  campus('geneva', 4, 'charter-hq', { light: 'dusk' }, 7,
    `[D.at(-D.W() * 0.14, 26, 0.42, -0.8, 1.53, 10, 30), D.at(-4, 2, 0.74, -0.4, 1.3, 8, 30)]`, { still: [0.3, 0.95] }),
  campus('sahara', 4, 'mega-sahara', { light: 'golden' }, 6,
    `[D.at(-30, 60, 0.5, -0.5, 1.36, 18, 30), D.at(-10, 30, 0.62, -0.2, 1.24, 14, 30)]`, { still: [0.6] }),
  // the Charter as you run it: four years in (the Act III bot), megaprojects on the map, the player opens the Charter
  {
    id: 'hud-charter', kind: 'hud', secs: 5, warm: 30, preview: [0.1, 0.4, 0.9],
    setup: `await D.bots(); D.start('act3', 'west-texas'); D.days(1500, D.bot.b3); await D.briefed(); game.enterMap(); await D.runAsync(30); await D.loaded();
      D.scene = game.stage.getScene(); D.kind = 'globe'; D.scene.clampView = function () {}; game.select?.(null); game.openPanel(null); game.setSpeed(4); D.pointer();
      D.move([{ lon: -26, lat: 30, dist: 150, hour: 11.2 }, { lon: -8, lat: 30, dist: 138, hour: 12.2 }], 'soft');
      // (the game's own clock runs the days here: the bot's would call a Council session over the shot)
      D.each = (u, f) => {
        D.ptrMove(f, 24, 66, '[data-tut="dock-charter"]');
        D.ptrMove(f, 96, 140, [innerWidth * 0.8, innerHeight * 0.66], () => {});
      };
      D.post = () => { D.calm(); };`,
    still: [0.6],
  },

  // ── Act IV: planetary ─────────────────────────────────────────────────────────────────────────────────────────
  campus('northsea', 4, 'mega-northsea', { light: 'golden' }, 6,
    `[D.at(-60, 30, 0.34, -0.9, 1.5, 24, 34), D.at(-10, 20, 0.3, -0.5, 1.5, 26, 34)]`, { still: [0.5] }),
  campus('fusion', 4, 'mega-plains', { light: 'dusk' }, 6,
    `[D.at(-20, 30, 0.34, -0.7, 1.46, 10, 30), D.at(10, 26, 0.3, -0.25, 1.46, 10, 30)]`, { still: [0.5] }),
  globe('supergrid', 4, 7, [
    { lon: -28, lat: 20, dist: 215, hour: 16.4, season: 10 },
    { lon: 66, lat: 26, dist: 205, hour: 17.9, season: 10 },
  ], { still: [0.5] }),
  // the rocket on the middle pad lifts off `lift` seconds into the shot (the pads cycle every 28 s: see sets/launch/pad.ts)
  // (the long one stands west of the pad, so the rocket on the pad behind is beside ours, not a ghost through it)
  ...[['liftoff', 9, 3.0, 44], ['liftoff-long', 15, 8.0, 0]].map(([id, secs, lift, cx]) => ({
    id, secs, warm: 200,
    setup: `D.world(4); D.campus('launch-guiana', { light: 'sunset', weather: 'clear' }); await D.runAsync(30); await D.loaded();
      D.shot.lift = ${lift}; D.shot.secs = ${secs};
      // pad two (x 18, z 6.5): lifts when the scene's clock reads 12 (+28 s a cycle)
      D.shot.cx = ${cx}; D.cam({ pos: [${cx}, 3.2, 70], look: [18, 20, 6.5], fov: 34, tallFov: 1.5 });
      D.each = (u, f) => {
        const t = f / 60, s = Math.max(0, t - D.shot.lift), climb = 3.6 * s * s + 0.8 * s;
        const k = Math.min(1, t / D.shot.secs), e = k * k * (3 - 2 * k);
        // the camera waits low by the road, then tilts up after the rocket (a little behind it) and widens
        const up = Math.min(climb, 300) * (0.86 - 0.22 * Math.min(1, s / 5));
        D.cam({ pos: [D.shot.cx - e * 5, 3.2 + e * 2.5, 70 + e * 6], look: [18, 20 + up, 6.5 - Math.max(0, climb - 60) * 0.12], fov: 34 + Math.min(1, s / 4) * 10 });
      };`,
    after: `D.scene.time = 28 + 12 - ${lift};`,
    still: [0.2, lift / secs + 0.19], preview: [0.3, 0.6, 0.8],
  })),
  {
    id: 'orbit', secs: 7, warm: 60,
    setup: `D.world(4); D.clockAt(70, 18.2, 5, 21); D.orbitView(); await D.runAsync(20); await D.loaded();
      D.move([{ az: -0.8, el: 0.2, dist: 330 }, { az: -0.38, el: 0.13, dist: 232 }], 'soft');`,
    still: [0.5],
  },
  {
    id: 'hud-planet', kind: 'hud', secs: 4, warm: 30,
    setup: `D.start('act4', 'west-texas'); game.state = D.M.a4.act4PreviewState({ stage: 3, moon: 3 }); game.state.company.name = 'Kardashev Labs'; D.M.tk.refreshStats(game.state);
      game.enterOrbit(); await D.runAsync(30); await D.loaded(); D.clockAt(70, 18.2, 5, 21); D.scene = game.stage.getScene(); D.kind = 'orbit'; game.openPanel('planet'); D.calm();
      D.move([{ az: -0.75, el: 0.2, dist: 420 }, { az: -0.6, el: 0.2, dist: 400 }], 'soft'); D.each = () => { ${CALM} };`,
    still: [0.5],
  },
  campus('moon', 4, 'moon', {}, 7,
    `[D.at(-40, 30, 0.2, -0.9, 1.5, 8, 32), D.at(0, 26, 0.24, -0.45, 1.47, 9, 32)]`, { still: [0.6] }),

  // ── Act V: Type I ─────────────────────────────────────────────────────────────────────────────────────────────
  campus('yards', 5, 'l4', {}, 6,
    `[D.at(-90, 20, 0.2, -1.0, 1.42, 6, 34), D.at(-30, 16, 0.2, -0.55, 1.42, 6, 34)]`, { still: [0.6] }),
  campus('eros', 5, 'eros', {}, 6,
    `[D.at(-30, 20, 0.34, -0.7, 1.4, 6, 30), D.at(20, 20, 0.3, -0.2, 1.36, 6, 30)]`, { still: [0.5] }),
  campus('ring', 5, 'ring', {}, 6,
    `[D.at(-70, 20, 0.26, -1.0, 1.36, 6, 34), D.at(-10, 16, 0.24, -0.5, 1.36, 8, 34)]`, { still: [0.6] }),
  // the habitat: the game's own film move (a slow turn toward the axis, the land curving overhead)
  campus('habitat', 5, 'aurora', {}, 7,
    `[{ ...D.orbit(D.scene.layout.focus.x - 10, D.scene.layout.focus.z + 4, 105, -0.8, 1.45, 105 * 0.14), fov: 30, dofMax: 1.5 }, { ...D.orbit(D.scene.layout.focus.x + 8, D.scene.layout.focus.z + 4, 135, -1.36, 1.44, 135 * 0.14), fov: 30, dofMax: 1.5 }]`,
    { still: [0.5], more: `(() => { const K = D.keys; for (const k of K) { const d = k === K[0] ? 105 : 135; const f = D.scene.layout.focus; const cx = f.x + (k === K[0] ? -10 : 8), cz = f.z + 4; const yaw = k === K[0] ? -0.8 : -1.36, p = k === K[0] ? 1.45 : 1.44; k.pos = [cx + d * Math.sin(p) * Math.sin(yaw), d * Math.cos(p), cz + d * Math.sin(p) * Math.cos(yaw)]; k.look = [cx, d * 0.14, cz]; } })();` }),
  {
    id: 'hud-system', kind: 'hud', secs: 5, warm: 30,
    setup: `D.start('act5', 'west-texas'); game.state = D.M.a5.act5PreviewState({ stage: 3, collectors: 4200 }); game.state.company.name = 'Kardashev Labs'; D.M.tk.refreshStats(game.state);
      game.enterSystem(); await D.runAsync(30); await D.loaded(); D.scene = game.stage.getScene(); D.kind = 'system'; D.calm();
      D.move([{ az: -1.1, el: 0.42, dist: 820 }, { az: -0.86, el: 0.36, dist: 700 }], 'soft'); D.each = () => { ${CALM} };`,
    still: [0.5],
  },
  // the swarm filling in round the Sun: forty years in six seconds
  {
    id: 'swarm', secs: 7, warm: 40,
    setup: `const s = D.world(5, { stage: 4, collectors: 60 }); D.system(); await D.runAsync(20); await D.loaded();
      D.move([{ az: -1.25, el: 0.2, dist: 470 }, { az: -0.7, el: 0.3, dist: 640 }], 'soft');
      D.each = (u) => { const sy = s.system; sy.collectors = 60 + 9300 * Math.pow(u, 1.6); sy.rings = sy.collectors * 0.5; sy.habitat = sy.collectors * 0.35; };`,
    still: [0.45, 0.95],
  },
  // the ending's own pull-back (cinematic.ts): 0 s the night side, 2.3 s sunrise, 6–11 s the swarm lights, 13 s held
  {
    id: 'type1', secs: 30, warm: 6,
    setup: `D.world(5, { stage: 5, collectors: 10000, typeI: true }); D.system(true); await D.runAsync(4); await D.loaded(); D.scene.cineT = 0;`,
    still: [0.02, 0.08, 0.27, 0.38, 0.55],
  },

  // ── for the short clips ───────────────────────────────────────────────────────────────────────────────────────
  // one campus, one day: dawn to night in sixteen seconds
  {
    id: 'day', secs: 18, warm: 150,
    setup: `D.world(2); D.campus('wyoming', { hour: 4.6, month: 5, day: 21, weather: 'clear' }); await D.runAsync(20); await D.loaded();
      D.move([D.at(0, 0, 0.62, 0.55, 1.36, 6, 30, { tallFov: 1.9 }), D.at(0, 0, 0.62, -0.15, 1.36, 6, 30, { tallFov: 1.9 })], 'linear');
      // dawn to dusk in twelve seconds (the lamps come on with the music's bar 6), then the night, slowly
      const lon = D.M.sites.SITE_BY_ID.wyoming.lon;
      D.each = (u, f) => { const t = f / 60; D.clockAt(lon, t < 12 ? 4.8 + (16.1 * t) / 12 : 20.9 + (1.7 * (t - 12)) / 6, 5, 21); };`,
    // (upright: along the frontage instead of round the whole campus, which would be a thin strip)
    tall: `D.move([D.at(-D.W() * 0.2, 0, 0.4, 0.5, 1.4, 9, 30, { tallFov: 1.5 }), D.at(D.W() * 0.2, 0, 0.4, -0.12, 1.4, 9, 30, { tallFov: 1.5 })], 'linear');`,
  },
];
