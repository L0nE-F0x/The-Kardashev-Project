// doorcheck.mjs <site,site…> — every door people use: is there a wall behind it (a doorway that opens for them) and
// does the way in from the place's gate reach it? A door with neither is a spot on the open ground where staff step
// "in" and vanish (a piece that never said where its entrance is gets the middle of its footprint's front edge).
// SETUP=<file.js> as in feetcheck (a company with the buildings to check); PLAYWRIGHT=, CDP=, BASE= as there.
// KINDS=hq,hall,lab,plant,set (the default): which places to check. A set piece that names no door has no staff
// (people.ts `staffs`): it is listed as such, not checked.
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const sites = process.argv[2].split(',');
const browser = await chromium.connectOverCDP(process.env.CDP ?? 'http://127.0.0.1:9222');
const page = await browser.contexts()[0].newPage();
await page.setViewportSize({ width: 1280, height: 720 });
page.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
await page.addInitScript(() => { if (!sessionStorage.getItem('qa')) { localStorage.clear(); sessionStorage.setItem('qa', '1'); } localStorage.setItem('kardashev.settings.v1', JSON.stringify({ quality3d: 'high', tips: false })); });
await page.goto((process.env.BASE ?? 'http://127.0.0.1:5317') + '/play/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => window.game && !document.getElementById('boot'), null, { timeout: 180000 });
await page.waitForTimeout(2500);
await page.evaluate(() => { game.tour.running = false; });
if (process.env.SETUP) console.log(JSON.stringify(await page.evaluate(`(async () => { ${(await import('node:fs')).readFileSync(process.env.SETUP, 'utf8')} })()`)));
let bad = 0;
for (const site of sites) {
  await page.evaluate((site) => { const sc = game.makeDioramaScene(site); game.stage.setScene(sc, 2); game.stage.fade = 0; sc.setHour(10.5); }, site);
  await page.waitForTimeout(3500);
  const rows = await page.evaluate(async (kinds) => {
    const { placeGate } = await import('/src/render3d/campus/paths.ts');
    const sc = game.stage.getScene(), P = sc.people;
    // (offshore, the Moon, space and the habitat have no working day of their own)
    if (!P) return [];
    const typeOf = new Map([...sc.entries.values()].map((e) => [e.f.id, e.f.type]));
    const out = [];
    for (const p of P.places.values()) {
      if (p.building || !kinds.includes(p.kind)) continue;
      if (p.kind === 'set' && !p.ownDoors) { out.push({ type: p.id, kind: p.kind, unstaffed: true }); continue; }
      const gate = placeGate(p, P.roads);
      for (const d of p.doors) {
        const r = P.map.route(gate, d);
        const end = r?.[r.length - 1];
        const reach = end ? Math.hypot(end.x - d.x, end.z - d.z) : null;
        out.push({ type: typeOf.get(p.id) ?? p.id, kind: p.kind, door: [+d.x.toFixed(1), +d.z.toFixed(1)], wall: d.in !== undefined, reach: reach === null ? 'none' : +reach.toFixed(2) });
      }
    }
    return out;
  }, (process.env.KINDS ?? 'hq,hall,lab,plant,set').split(','));
  for (const r of rows) {
    if (r.unstaffed) { console.log(`--  ${site} ${r.type}: names no door, no staff`); continue; }
    const ok = r.wall && r.reach !== 'none' && r.reach < 0.6;
    if (!ok) bad++;
    console.log(`${ok ? 'ok ' : 'BAD'} ${site} ${r.type} (${r.kind}) door ${r.door.join(', ')}: ${r.wall ? 'doorway' : 'NO WALL'}, way in ${r.reach === 'none' ? 'NONE' : r.reach < 0.6 ? 'reaches it' : `ends ${r.reach} m short`}`);
  }
}
console.log(bad ? `${bad} door(s) to fix` : 'every door has a doorway and a way in');
await page.close(); await browser.close();
