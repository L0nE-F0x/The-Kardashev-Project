export default async ({ js, snap }) => {
  await js(`D.ui(false); D.world('garage'); D.globe(); D.run(30)`);
  for (const [k, o] of Object.entries({
    g1: { lon: -30, lat: 28, dist: 215, hour: 1.6, season: -22 },
    g2: { lon: 10, lat: 28, dist: 215, hour: 2.12, season: -22 },
    g3: { lon: 20, lat: 20, dist: 420, hour: 5.4, season: 10 },
    g4: { lon: 100, lat: 25, dist: 150, hour: 19, season: 10 },
  })) { await js(`D.apply(${JSON.stringify(o)}); D.run(20, 16.667, () => D.apply(${JSON.stringify(o)}))`); await snap(k); }
  console.log(JSON.stringify(await js(`D.world(4); D.clockAt(60, 17); D.orbitView()`)));
  await js(`D.run(60)`); await snap('o1');
  await js(`D.apply({ az: 0.6, el: 0.12, dist: 240 }); D.run(30, 16.667, () => D.apply({ az: 0.6, el: 0.12, dist: 240 }))`); await snap('o2');
  console.log(JSON.stringify(await js(`D.world(5); D.system()`)));
  await js(`D.run(60)`); await snap('s1');
  await js(`D.apply({ az: -0.4, el: 0.16, dist: 420 }); D.run(30, 16.667, () => D.apply({ az: -0.4, el: 0.16, dist: 420 }))`); await snap('s2');
  await js(`D.system(true); D.run(2)`);
  for (const t of [0.5, 2.3, 5, 8, 10, 11.3, 13, 16]) { await js(`D.scene.cineT = ${t}; D.run(1, 0.001)`); await snap('c' + t); }
};
