// one look at every view-only place, to choose from
const SETS = {
  act2: [2, ['lumen-hsinchu', 'veldt-veldhoven', 'kestrel-ohio', 'hanbit-icheon', 'bondline-penang', 'cumulus-quincy', 'cls-singapore', 'cls-cornwall', 'mine-atacama', 'mine-pilbara', 'mine-helium', 'mojave']],
  mega4: [4, ['mega-cascadia', 'mega-plains', 'mega-patagonia', 'mega-northsea', 'mega-nordic', 'mega-siberia', 'mega-sahara', 'mega-kalahari', 'mega-deccan', 'mega-gobi', 'mega-pacific', 'mega-outback']],
  mega5: [5, ['mega-cascadia', 'mega-plains', 'mega-northsea', 'mega-sahara', 'mega-pacific', 'mega-outback', 'launch-guiana', 'launch-gulf', 'launch-steppe', 'charter-hq', 'moon', 'wyoming']],
  space: [5, ['l4', 'l5', 'ring', 'aurora', 'bennu', 'psyche', 'ceres', 'vesta', 'eros']],
  launch4: [4, ['launch-guiana', 'launch-gulf', 'launch-malindi', 'launch-steppe', 'launch-arctic', 'moon']],
};
export default async ({ js, snap }) => {
  const [w, ids] = SETS[process.env.SET];
  for (const id of ids) {
    try {
      const info = await js(`(() => { D.ui(false); D.world(${w}); const i = D.campus(${JSON.stringify(id)}, { light: 'golden' }); D.cam({ ...D.orbit(i.focus.x, i.focus.z, D.dist0 * 0.8, -0.45, 1.3), fov: 30 }); D.run(90); return i; })()`);
      console.log(id, JSON.stringify(info));
      await snap(id);
    } catch (e) { console.log(id, 'FAILED', String(e).slice(0, 200)); }
  }
};
