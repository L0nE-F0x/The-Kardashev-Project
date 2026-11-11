export default async ({ js, snap }) => {
  await js(`D.ui(false); D.world('garage'); D.campus('bay-area', { hour: 8.9, month: 11, day: 12 }); D.cam({ pos: [-30, 3.5, 30], look: [-17, 2.5, 14], fov: 30 }); D.run(240)`);
  console.log(JSON.stringify(await js(`(() => { const sc = D.scene; const P = sc.people; const ag = (P?.agents ?? []).map(a => { const o = a.obj ?? a.root ?? a.mesh; return o ? [+o.position.x.toFixed(1), +o.position.z.toFixed(1), o.visible] : Object.keys(a).slice(0, 12); }); return { ag, keys: P ? Object.keys(P).slice(0, 30) : null, bit: sc.bit ? [sc.bit.obj.position.x.toFixed(1), sc.bit.obj.position.z.toFixed(1)] : null }; })()`)));
  const views = {
    a: `D.cam({ pos: [-30, 3.5, 30], look: [-17, 2.5, 14], fov: 30 })`,
    b: `D.cam({ pos: [-34, 6, 27], look: [-15, 2, 15], fov: 28 })`,
    c: `D.cam({ pos: [-24, 2.6, 27.5], look: [-16, 2.6, 14], fov: 36 })`,
    d: `D.cam({ pos: [-38, 10, 20], look: [-14, 1.5, 17], fov: 24 })`,
    e: `D.cam({ pos: [-27, 14, 36], look: [-15, 1.5, 16], fov: 24 })`,
    f: `D.cam({ pos: [-1, 3, 27], look: [-17, 2.6, 15], fov: 32 })`,
  };
  for (const [k, v] of Object.entries(views)) { await js(v); await js('D.run(3)'); await snap(k); }
};
