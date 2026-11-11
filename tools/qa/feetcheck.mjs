// feetcheck.mjs <site,site…> [hour] — for everyone standing outside: how far are their feet from the surface under them?
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const sites = process.argv[2].split(','), hour = Number(process.argv[3] ?? 10.5);
const browser = await chromium.connectOverCDP(process.env.CDP ?? 'http://127.0.0.1:9222');
const page = await browser.contexts()[0].newPage();
await page.setViewportSize({ width: 1280, height: 720 });
await page.addInitScript(() => { if (!sessionStorage.getItem('qa')) { localStorage.clear(); sessionStorage.setItem('qa', '1'); } localStorage.setItem('kardashev.settings.v1', JSON.stringify({ quality3d: 'high', tips: false })); });
await page.goto((process.env.BASE ?? 'http://127.0.0.1:5317') + '/play/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => window.game && !document.getElementById('boot'), null, { timeout: 180000 });
await page.waitForTimeout(2500);
await page.evaluate(() => { game.tour.running = false; });
for (const site of sites) {
  await page.evaluate(([site, hour]) => { const sc = game.makeDioramaScene(site); game.stage.setScene(sc, 2); game.stage.fade = 0; sc.setHour(hour); }, [site, hour]);
  await page.waitForTimeout(3500);
  const res = await page.evaluate(async () => {
    const sc = game.stage.getScene();
    const ray = sc.ray;
    const V = ray.ray.origin.constructor;
    const targets = []; sc.scene.traverse((o) => { if (!o.isMesh) return; const m = o.material; if (!m || m.visible === false || m.colorWrite === false || (m.transparent && m.opacity === 0)) return; let p = o, ok = true; while (p) { if (p === sc.people.group || !p.visible) ok = false; p = p.parent; } if (ok) targets.push(o); });
    const diffs = {}; const worst = [];
    const facAt = (x, z) => { for (const e of sc.entries.values()) { const r = e.item.rect; if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return e.f.type; } return 'open'; };
    for (let round = 0; round < 14; round++) {
      for (let k = 0; k < 60; k++) sc.update(0.1);
      for (const a of sc.people.agents) {
        if (a.state !== 'out' || !a.obj.visible) continue;
        const p = a.obj.position;
        ray.set(new V(p.x, p.y + 1.2, p.z), new V(0, -1, 0));
        ray.far = 6;
        const hit = ray.intersectObjects(targets, false).find((h) => { let o = h.object; while (o) { if (o.userData.advisor) return false; o = o.parent; } return true; });
        if (!hit) continue;
        const d = Math.round((hit.point.y - p.y) * 50) / 50;
        const where = facAt(p.x, p.z);
        const key = where + ' ' + d.toFixed(2);
        diffs[key] = (diffs[key] ?? 0) + 1;
        if (Math.abs(d) >= 0.06) worst.push([where, d, a.act, +p.x.toFixed(1), +p.z.toFixed(1), hit.object.name || hit.object.parent?.name || hit.object.type]);
      }
    }
    // vehicles: the lowest point of each (its tyres) against the surface under its middle
    const cars = {}; const carWorst = [];
    const B = new (sc.scene.children[0].geometry?.boundingBox?.constructor ?? Object)();
    const names = new Set(['sedan', 'hatchback', 'suv', 'pickup', 'van', 'semitruck', 'mixer', 'flatbed']);
    const list = []; sc.scene.traverse((o) => { if (names.has(o.userData.model) && o.visible) { let p = o, vis = true; while (p) { if (!p.visible) vis = false; p = p.parent; } if (vis) list.push(o); } });
    const Box3 = (await import('/node_modules/.vite/deps/three.js').catch(() => ({}))).Box3;
    for (const o of list) {
      o.updateMatrixWorld(true);
      let minY = Infinity; const c = new V();
      o.traverse((m) => { if (!m.isMesh) return; m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox; for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) { c.set(x, y, z).applyMatrix4(m.matrixWorld); minY = Math.min(minY, c.y); } });
      const w = o.getWorldPosition(new V());
      ray.set(new V(w.x, w.y + 6, w.z), new V(0, -1, 0)); ray.far = 14;
      const hit = ray.intersectObjects(targets, false).find((h) => { let p = h.object; while (p) { if (p === o) return false; p = p.parent; } return true; });
      if (!hit) continue;
      const d = Math.round((hit.point.y - w.y) * 50) / 50;
      const where = facAt(w.x, w.z);
      if (Math.abs(d) >= 0.15) carWorst.push([o.userData.model, where, d, +w.x.toFixed(1), +w.z.toFixed(1), +w.y.toFixed(2), hit.object.name || hit.object.parent?.name || '?']);
      const key = o.userData.model + '@' + where + ' ' + d.toFixed(2);
      cars[key] = (cars[key] ?? 0) + 1;
    }
    return { diffs, worst: worst.slice(0, 8), n: sc.people.agents.length, cars, carWorst: carWorst.slice(0, 10) };
  });
  console.log(site, JSON.stringify(res));
}
await page.close(); await browser.close();
