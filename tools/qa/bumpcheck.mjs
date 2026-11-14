// bumpcheck.mjs <site,…> [hour] — is anyone standing or walking inside something solid? (short rays at hip height, eight ways)
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const sites = process.argv[2].split(','), hour = Number(process.argv[3] ?? 10.5);
const browser = await chromium.connectOverCDP(process.env.CDP ?? 'http://127.0.0.1:9222');
const page = await browser.contexts()[0].newPage();
await page.addInitScript(() => { if (!sessionStorage.getItem('qa')) { localStorage.clear(); sessionStorage.setItem('qa', '1'); } localStorage.setItem('kardashev.settings.v1', JSON.stringify({ quality3d: 'high', tips: false })); });
await page.goto((process.env.BASE ?? 'http://127.0.0.1:5317') + '/play/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => window.game && !document.getElementById('boot'), null, { timeout: 180000 });
await page.waitForTimeout(2500);
await page.evaluate(() => { game.tour.running = false; });
// SETUP=<file.js>: the body of an async function run in the page first (say, a company with the buildings to check:
// `game.startNew(…)` and facilities pushed onto a site); the campuses are then the state's, not the menu's world
if (process.env.SETUP) console.log(JSON.stringify(await page.evaluate(`(async () => { ${(await import('node:fs')).readFileSync(process.env.SETUP, 'utf8')} })()`)));
for (const site of sites) {
  await page.evaluate(([site, hour]) => { const sc = game.makeDioramaScene(site); game.stage.setScene(sc, 2); game.stage.fade = 0; sc.setHour(hour); }, [site, hour]);
  await page.waitForTimeout(3500);
  const res = await page.evaluate(() => {
    const sc = game.stage.getScene(); const ray = sc.ray; const V = ray.ray.origin.constructor;
    const targets = []; sc.scene.traverse((o) => { if (!o.isMesh) return; const m = o.material; if (!m || m.visible === false || m.colorWrite === false || (m.transparent && m.opacity === 0)) return; let p = o, ok = true; while (p) { if (p === sc.people.group || !p.visible || p.userData.advisor) ok = false; p = p.parent; } if (ok && !/grass|road|ground|farmland/.test((o.name || '') + (o.parent?.name || ''))) targets.push(o); });
    const facAt = (x, z) => { for (const e of sc.entries.values()) { const r = e.item.rect; if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return e.f.type + (e.f.status === 'online' ? '' : '*'); } return 'open'; };
    const tally = {}; const cases = []; let samples = 0;
    for (let round = 0; round < 40; round++) {
      for (let k = 0; k < 25; k++) sc.update(0.1);
      for (const a of sc.people.agents) {
        if (a.state !== 'out' || !a.obj.visible) continue;
        // (going in or out by a door: it stands open for them, and they walk through the doorway in the wall)
        if (a.tasks[0]?.k === 'in' || a.tasks[0]?.k === 'out') continue;
        samples++;
        const p = a.obj.position; let worst = 9, what = '';
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          ray.set(new V(p.x, p.y + 0.95, p.z), new V(Math.cos(ang), 0, Math.sin(ang))); ray.far = 0.28;
          const hit = ray.intersectObjects(targets, false)[0];
          if (hit && hit.distance < worst) { worst = hit.distance; let o = hit.object, nm = ''; while (o && !nm) { nm = o.userData.model || o.name || ''; o = o.parent; } what = nm || hit.object.geometry.type; }
        }
        if (worst < 0.2) { const key = facAt(p.x, p.z) + ' ' + what + ' ' + a.act + (a.box ? '+box' : ''); tally[key] = (tally[key] ?? 0) + 1; if (cases.length < 10) cases.push([key, +p.x.toFixed(1), +p.z.toFixed(1), +worst.toFixed(2), a.key, a.tasks[0]?.k]); }
      }
    }
    return { samples, tally, cases };
  });
  console.log(site, JSON.stringify(res));
}
await page.close(); await browser.close();
