export default async ({ js }) => {
  return js(`(() => { const S = D.M.sites.SITE_BY_ID; const by = {}; for (const [id, s] of Object.entries(S)) (by[s.kind ?? 'site'] ??= []).push(id); const w2 = D.world(2); const own = Object.keys(w2.sites ?? {}).filter(k => (w2.sites[k].facilities ?? []).length); return { by, own: own.map(k => k + ':' + w2.sites[k].facilities.length) }; })()`);
};
