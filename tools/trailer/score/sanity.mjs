// The check on paper (sanity.ts), printed:  node tools/trailer/score/sanity.mjs      (same servers as render.mjs)
process.env.CDP ??= 'http://127.0.0.1:9334';
process.env.BASE ??= 'http://127.0.0.1:5318';
const { openPage, sleep, BASE } = await import('../cdp.mjs');
const page = await openPage({ url: `${BASE}/tools/trailer/score/page.html`, shim: false, width: 640, height: 360 });
try {
  for (let i = 0; i < 300; i++) {
    await sleep(100);
    if (await page.js('!!window.__ready').catch(() => false)) break;
  }
  console.log((await page.js('window.__sanity()')).join('\n'));
} finally {
  await page.close();
}
