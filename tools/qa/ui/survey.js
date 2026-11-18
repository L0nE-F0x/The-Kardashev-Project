// Every dock panel and every tab in it, in each act, at three window sizes, scanned (scan.js) for what is wrong on
// screen. Prints each kind of issue once, with how often and where first. About 3 minutes.
//   node tools/qa/ui/page.mjs --fresh < tools/qa/ui/survey.js          ACTS=3,4 SIZES=1920x1080,960x540
const ACTS = (process.env.ACTS ?? '1,2,3,4,5').split(',').map(Number);
const SIZES = (process.env.SIZES ?? '1920x1080,1280x800,960x540').split(',').map((x) => x.split('x').map(Number));
const found = new Map();
const note = (where, issues) => { for (const i of issues) { const k = i.replace(/\d[\d,.]*/g, '#').slice(0, 90); if (!found.has(k)) found.set(k, { n: 0, first: where, text: i }); found.get(k).n++; } };
const scan = async (where) => { try { note(where, await page.evaluate(SCAN)); } catch (e) { note(where, ['SCAN ERROR ' + e.message.slice(0, 80)]); } };
const PANELS = { 1: ['compute', 'orders', 'research', 'finance', 'stats', 'goals', 'guide', 'news'], 2: ['compute', 'orders', 'research', 'finance', 'stats', 'team', 'deals', 'blocs', 'goals', 'news'], 3: ['compute', 'finance', 'charter', 'council', 'goals', 'stats', 'news', 'blocs'], 4: ['planet', 'charter', 'council', 'goals', 'stats', 'compute', 'news'], 5: ['system', 'planet', 'charter', 'council', 'goals', 'stats', 'news'] };
for (const act of ACTS) {
  await ev(async () => { const sv = await import('/src/save/save.ts'); for (const sl of sv.listSlots()) sv.deleteSlot(sl.id); });
  await ev((act) => game.startNew({ name: 'Survey Co', homeSite: 'bay-area', seed: 21, tutorial: false, ...(act > 1 ? { ['act' + act]: true } : {}) }), act);
  await sleep(400);
  // a lived-in state: play forward with the bots, answer the cards, mark the briefings read
  await ev(async (act) => {
    const s = game.state; const E = await import('/src/sim/events.ts');
    (s.meta.briefings ??= []).push(...(await import('/src/game/briefings.ts')).BRIEFINGS.map((b) => b.id)); game.briefing = null;
    game.updateSettings({ tips: false, dayNight: false });
  }, act);
  await days(act === 1 ? 500 : act === 2 ? 700 : act === 3 ? 900 : 0, { bot: true });
  await ev(async () => { const s = game.state; const E = await import('/src/sim/events.ts'); for (let i = 0; i < 20 && s.events.active; i++) { const d = (await import('/src/content/events.ts')).EVENT_BY_ID[s.events.active.id]; const c = d.choices(s, s.events.active.ctx); E.resolveEvent(s, Math.max(0, c.findIndex((x) => !x.disabled))); } game.speed = 0; game.notify(); });
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h }); await sleep(500);
    const at = `act${act} ${w}x${h}`;
    await ev(() => game.openPanel(null)); await sleep(300);
    await scan(`${at} hud`);
    for (const p of PANELS[act]) {
      await ev((p) => game.openPanel(p), p); await sleep(350);
      await scan(`${at} ${p}`);
      // every tab the panel has
      const tabs = await page.$$('.panel .tabs button, .panel .seg.tabs button, .panel [role=tablist] button');
      for (let i = 0; i < tabs.length && i < 9; i++) {
        const t = (await page.$$('.panel .tabs button, .panel .seg.tabs button, .panel [role=tablist] button'))[i]; if (!t) break;
        const label = (await t.textContent())?.trim().slice(0, 14);
        await t.click({ timeout: 2000 }).catch(() => {}); await sleep(300);
        await scan(`${at} ${p}/${label}`);
      }
    }
    await ev(() => game.openPanel(null));
    // the plan screens of Acts IV–V
    if (act >= 4) { const open = await ev(() => !!(game.state.planet?.planOpen || game.state.system?.planOpen)); if (open) { await sleep(300); await scan(`${at} plan screen`); if (w === 1920) await shot(`survey-act${act}-plan`); } }
    if (w === 1920) await shot(`survey-act${act}-hud`);
  }
}
await page.setViewportSize({ width: 1920, height: 1080 });
return [...found.values()].sort((a, b) => b.n - a.n).map((x) => `${String(x.n).padStart(3)}× ${x.text}   ← ${x.first}`).join('\n');
