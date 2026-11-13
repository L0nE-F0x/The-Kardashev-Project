// floorcheck.mjs [filter] — every piece: floor area hidden under the plot's pad (top 0.12), and parked cars off their surface
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const filter = process.argv[2] ?? '';
const browser = await chromium.connectOverCDP(process.env.CDP ?? 'http://127.0.0.1:9222');
const page = await browser.contexts()[0].newPage();
page.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
await page.goto((process.env.BASE ?? 'http://127.0.0.1:5317') + '/play/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => window.game && !document.getElementById('boot'), null, { timeout: 180000 });
await page.evaluate(() => { game.tour.running = false; });
const rows = await page.evaluate(async (filter) => {
  const reg = await import('/src/render3d/campus/registry.ts');
  const vo = await import('/src/render3d/campus/viewOnly.ts');
  const a3 = await import('/src/render3d/campus/act3sets.ts');
  const models = await import('/src/render3d/models.ts');
  const pcs = await import('/src/render3d/pieces.ts');
  const life = await import('/src/render3d/campus/life.ts');
  const BARE = /^set:(moon|he3|mass|rim|ice|regolith|yards|ring|hab|ast|sea|windSea|jetty|manhole)/;
  await models.loadModels(['garage', 'lab', 'gasplant', 'substation', 'watertower', 'oak', 'pickup', 'semitruck', 'sedan', 'hatchback', 'suv', 'van', 'mixer', 'flatbed']);
  const T = { Vector3: null };
  const out = [];
  const jobs = [];
  for (const type of Object.keys(reg.FACILITY_PIECES)) for (const tier of [1, 2, 3]) jobs.push({ name: `${type}${tier}`, make: () => reg.FACILITY_PIECES[type]({ seed: 7, w: 28, d: 26, tier }), w: 28, d: 26 });
  for (const kind of [...Object.keys(reg.SET_PIECES), ...Object.keys(a3.ACT3_SETS)]) {
    const [w, d] = vo.sizeOf(kind);
    jobs.push({ name: `set:${kind}`, make: () => reg.setFactory(kind)({ seed: 7, w, d, tier: 1, brand: 'lumen', label: 'LUMEN', accent: '#f7b258', hi: '#fbd46e' }), w, d });
  }
  let a, b, c, n, e1, e2;
  for (const j of jobs) {
    if (filter && !j.name.includes(filter)) continue;
    let piece;
    try { piece = j.make(); } catch (e) { out.push({ name: j.name, err: String(e.message).slice(0, 80) }); continue; }
    if (!piece) continue;
    if (!T.Vector3) { T.Vector3 = piece.obj.position.constructor; a = new T.Vector3(); b = new T.Vector3(); c = new T.Vector3(); n = new T.Vector3(); e1 = new T.Vector3(); e2 = new T.Vector3(); }
    const padded = !piece.ground && !BARE.test(j.name);
    const root = new piece.obj.constructor();
    if (padded) root.add(pcs.pad(j.w - 0.6, j.d - 0.6));
    root.add(piece.obj);
    life.settleCars?.(root);
    const hx = (j.w - 0.6) / 2, hz = (j.d - 0.6) / 2;
    root.updateMatrixWorld(true);
    const meshes = [], cars = [];
    const walk = (o, inCar) => {
      if (o.userData?.bay) { cars.push(o); inCar = true; }
      if (o.userData?.model) inCar = true;
      if (o.isMesh && !inCar && o.visible && !o.isInstancedMesh && o.geometry?.attributes?.position) meshes.push(o);
      for (const ch of o.children) walk(ch, inCar);
    };
    walk(root, false);
    const buckets = {}, ups = [];
    let low = 0;
    for (const m of meshes) {
      const g = m.geometry, p = g.attributes.position, idx = g.index;
      const cnt = idx ? idx.count : p.count;
      for (let i = 0; i < cnt; i += 3) {
        const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
        a.fromBufferAttribute(p, ia).applyMatrix4(m.matrixWorld); b.fromBufferAttribute(p, ib).applyMatrix4(m.matrixWorld); c.fromBufferAttribute(p, ic).applyMatrix4(m.matrixWorld);
        const ymax = Math.max(a.y, b.y, c.y), ymin = Math.min(a.y, b.y, c.y);
        if (ymax > 1.2) continue;
        e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2);
        const area = n.length() / 2;
        if (n.y / (2 * area || 1) < 0.95) continue;
        ups.push([a.x, a.z, b.x, b.z, c.x, c.z, ymax]);
        if (!padded || m.parent === root || ymax > 0.118 || ymin < 0.004 || ymax - ymin > 0.004) continue;
        const cx = (a.x + b.x + c.x) / 3, cz = (a.z + b.z + c.z) / 3;
        if (Math.abs(cx) > hx || Math.abs(cz) > hz) continue;
        const k = ymax.toFixed(2);
        buckets[k] = (buckets[k] ?? 0) + area; low += area;
      }
    }
    const inTri = (x, z, t) => { const d1 = (x - t[2]) * (t[1] - t[3]) - (t[0] - t[2]) * (z - t[3]), d2 = (x - t[4]) * (t[3] - t[5]) - (t[2] - t[4]) * (z - t[5]), d3 = (x - t[0]) * (t[5] - t[1]) - (t[4] - t[0]) * (z - t[1]); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
    const carOff = [];
    for (const car of cars) {
      const wp = car.getWorldPosition(new T.Vector3());
      let top = 0;
      for (const t of ups) if (t[6] < wp.y + 0.5 && t[6] > top && inTri(wp.x, wp.z, t)) top = t[6];
      if (padded && Math.abs(wp.x) <= hx && Math.abs(wp.z) <= hz) top = Math.max(top, 0.12);
      carOff.push(+(wp.y - top).toFixed(3));
    }
    const badCars = carOff.filter((v) => Math.abs(v - 0.005) > 0.02);
    if (low > 1.5 || badCars.length) out.push({ name: j.name, hidden: Object.entries(buckets).filter(([, v]) => v > 0.8).map(([k, v]) => `${v.toFixed(0)}m²@${k}`).join(' '), cars: badCars.join(',') , ncars: cars.length });
  }
  return out;
}, filter);
for (const r of rows) console.log(r.name.padEnd(24), r.err ? 'ERR ' + r.err : `hidden: ${r.hidden || '-'}   cars off (${r.ncars}): ${r.cars || '-'}`);
console.log(rows.length, 'pieces flagged');
await page.close(); await browser.close();
