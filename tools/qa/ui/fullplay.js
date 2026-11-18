// The whole campaign on one save, through the interface: every card, act card, briefing, plan screen, time-lapse,
// report and the ending answered with real clicks, to the end card and back into the game. Between them the days
// are ticked: with the test bots as the player's hands in Acts I–III (they build, order, post, table), plain in Acts
// IV–V (the game's own autopilot works the plan). Every new screen is scanned (scan.js). About 12 minutes.
//
//   node tools/qa/ui/page.mjs --fresh < tools/qa/ui/fullplay.js       SIZE=1280x800 DIFF=relaxed TAG=deck STEPS=2500
//
// The log is OUT/<TAG>.log, pictures OUT/<TAG>-*.png. It ends "past the ending: back in the game" when all is well;
// STUCK, CARD NOT SHOWN, NO BUTTON and ISSUE lines are what to read. v1.0's pass found the credits could not be
// clicked past with this (SPEC §40).
const fs = await import('node:fs');
const SIZE = (process.env.SIZE ?? '1920x1080').split('x').map(Number);
const TAG = process.env.TAG ?? 'full';
const DIFF = process.env.DIFF ?? 'standard';
const MAXSTEPS = Number(process.env.STEPS ?? 2500);
const LOG = `${OUT}/${TAG}.log`;
fs.writeFileSync(LOG, '');
const say = (line) => fs.appendFileSync(LOG, line + '\n');
await page.setViewportSize({ width: SIZE[0], height: SIZE[1] });
await ev(async () => {
  const sv = await import('/src/save/save.ts');
  for (const sl of sv.listSlots()) sv.deleteSlot(sl.id);
});
await ev((d) => game.startNew({ name: 'Whole Run', homeSite: 'bay-area', seed: 77, tutorial: false, difficulty: d }), DIFF);
await sleep(600);
await ev(() => {
  game.updateSettings({ tips: true });
  game.notify();
});
const issues = new Map();
const shots = new Set();
const scan = async (where) => {
  const r = await page.evaluate(SCAN).catch((e) => ['SCAN ERROR ' + e.message.slice(0, 60)]);
  for (const i of r) {
    if (i.includes('button.fe')) continue;
    const k = i.replace(/\d[\d,.]*/g, '#').slice(0, 80);
    if (!issues.has(k)) {
      issues.set(k, `${i}   <- ${where}`);
      say('ISSUE ' + i + '   <- ' + where);
    }
  }
};
const snap = async (name) => {
  if (shots.has(name)) return;
  shots.add(name);
  await shot(`${TAG}-${name}`);
};
const state = () =>
  ev(() => {
    const s = game.state;
    const q = (x) => !!document.querySelector(x);
    return {
      day: s.day,
      act: s.act,
      card: s.events.active?.id ?? null,
      cardUp: q('.modal.event'),
      plan: q('.planmodal'),
      jump: !!(s.planet?.jump || s.system?.jump),
      jumpReport: !!game.jumpReport,
      eraReport: !!game.eraReport,
      actDone: game.showActComplete,
      brief: game.briefing ? game.briefing.id + ':' + game.briefing.step : null,
      ending: game.ending ? game.ending.step + ':' + game.ending.index : null,
      typeI: !!s.flags.typeI,
      over: !!s.meta.gameOver,
      away: !!game.awayReport,
      confirm: !!game.confirm,
    };
  });
let last = '';
let idle = 0;
let cards = 0;
const perAct = {};
for (let step = 0; step < MAXSTEPS; step++) {
  const st = await state();
  const what = st.over ? 'GAME OVER' : st.ending ? 'ending ' + st.ending : st.actDone ? 'ACT COMPLETE' : st.jumpReport ? 'JUMP REPORT' : st.eraReport ? 'ERA REPORT' : st.card ? 'card ' + st.card : st.brief ? 'briefing ' + st.brief : st.plan ? 'PLAN' : st.jump ? 'time-lapse' : st.confirm ? 'confirm' : 'play';
  if (what !== last) {
    if (what !== 'play') say(`${st.day} act ${st.act}: ${what}`);
    last = what;
    idle = 0;
  }
  if (st.over) {
    await snap('gameover');
    await scan('game over');
    break;
  }
  if (st.ending) {
    await sleep(1300);
    await scan('ending ' + st.ending);
    if (!st.ending.startsWith('epilogue') || st.ending.endsWith(':0')) await snap('ending-' + st.ending.replace(':', ''));
    if (st.ending.startsWith('card')) {
      const b = await page.$$('.ending .choice');
      if (b.length) await b[b.length - 1].click().catch(() => {});
    } else {
      const b = await page.$('.ending .choice, .ending .btn.primary');
      if (b) await b.click({ timeout: 3000 }).catch(() => {});
      else await page.mouse.click(SIZE[0] / 2, SIZE[1] / 3);
    }
    await sleep(1000);
    if (++idle > 80) {
      say('STUCK in the ending at ' + st.ending);
      break;
    }
    continue;
  }
  if (st.typeI && !st.ending && perAct.done) {
    say('past the ending: back in the game');
    await sleep(800);
    await scan('after the ending');
    await snap('after');
    break;
  }
  if (st.typeI) perAct.done = true;
  if (st.actDone) {
    await sleep(600);
    await scan('act complete (act ' + st.act + ')');
    await snap('actdone-' + st.act);
    await page.click('.modal.milestone .choice').catch(() => say('act card: no button'));
    await sleep(700);
    continue;
  }
  if (st.jumpReport || st.eraReport) {
    await sleep(600);
    await scan(st.jumpReport ? 'jump report' : 'era report');
    await snap(st.jumpReport ? 'jumpreport' : 'erareport');
    await page.click('.modal .choices .btn, .modal .btn.primary').catch(() => say('report: no button'));
    await sleep(600);
    continue;
  }
  if (st.card) {
    if (!st.cardUp) {
      // the card is in the sim but not on screen: something is in front of it (a briefing?) or it never drew
      if (++idle > 6) {
        say(`CARD NOT SHOWN: ${st.card} (briefing ${st.brief}, away ${st.away}, confirm ${st.confirm})`);
        await snap('card-not-shown-' + st.card);
        break;
      }
      await sleep(500);
      continue;
    }
    cards++;
    perAct[st.act] = (perAct[st.act] ?? 0) + 1;
    await sleep(300);
    await scan('card ' + st.card);
    if (cards % 40 === 1) await snap('card-' + st.card);
    const c = (await page.$('.modal.event .choice:not([disabled])')) ?? (await page.$('.modal.event .btn'));
    if (c) await c.click({ timeout: 3000 }).catch(() => say('card click failed ' + st.card));
    else say('NO BUTTON on card ' + st.card);
    await sleep(380);
    continue;
  }
  if (st.brief) {
    await sleep(400);
    await scan('briefing ' + st.brief);
    const hasBubble = await ev(() => !!document.querySelector('.tut-bubble'));
    if (!hasBubble) say('BRIEFING WITH NO BUBBLE ' + st.brief);
    await page.click('.tut-bubble .btn.primary').catch(() => ev(() => game.briefingSkip()));
    await sleep(350);
    continue;
  }
  if (st.plan) {
    await sleep(500);
    await scan('plan screen');
    await snap('plan-' + st.act);
    const c = await page.$('.planmodal .btn.primary:not([disabled])');
    if (c) await c.click().catch(() => {});
    else {
      say('PLAN has no enabled primary button');
      break;
    }
    await sleep(900);
    continue;
  }
  if (st.jump) {
    await snap('timelapse-' + st.act);
    await scan('time-lapse');
    await sleep(2500);
    if (++idle > 300) {
      say('time-lapse did not end');
      break;
    }
    continue;
  }
  if (st.confirm) {
    await page.click('.modal .btn.primary').catch(() => {});
    await sleep(300);
    continue;
  }
  // nothing in the way: the days run
  if (step % 60 === 0) await scan(`hud act ${st.act}`);
  const r = await ev(async () => {
    const { tick } = await import('/src/sim/tick.ts');
    const b1 = (await import('/tests/helpers/act1bot.ts')).botDay1;
    const b3 = (await import('/tests/helpers/act3bot.ts')).botDay3;
    const s = game.state;
    let n = 0;
    for (; n < 240; n++) {
      if (s.events.active || s.planet?.planOpen || s.system?.planOpen || s.planet?.jump || s.system?.jump || s.flags.endingStart || s.meta.gameOver) break;
      const act = s.act;
      if (act <= 1) b1(s, game.ctx);
      else if (act <= 3) b3(s);
      else {
        s.flags.autopilot4 = true;
        if (s.system) s.flags.autopilot5 = true;
      }
      tick(s, game.ctx);
      if (s.act !== act || Object.keys(s.flags).some((k) => /^act\dComplete$/.test(k) && !s.flags[k.replace('Complete', 'Shown')])) break;
    }
    // let the game notice what the days brought (act cards, briefings, toasts): one frame of its own clock
    game.speed = 1;
    game.notify();
    return n;
  });
  await sleep(450);
  await ev(() => {
    game.speed = 0;
  });
  if (r === 0 && ++idle > 30) {
    say('STUCK: nothing on screen and no day passes · ' + JSON.stringify(st));
    await snap('stuck');
    break;
  }
}
const fin = await ev(() => ({ day: game.state.day, act: game.state.act, typeI: game.state.flags.typeI ?? null, K: game.state.stats.K, played: game.state.meta.playtime }));
say(`--- cards answered ${cards} · per act ${JSON.stringify(perAct)} · final ${JSON.stringify(fin)}`);
say(`--- ${issues.size} kinds of issue`);
return fs.readFileSync(LOG, 'utf8').split('\n').filter((l) => /ISSUE|STUCK|NOT SHOWN|NO BUTTON|ACT COMPLETE|ending|GAME OVER|---|PLAN |failed|BRIEFING WITH/.test(l)).join('\n');
