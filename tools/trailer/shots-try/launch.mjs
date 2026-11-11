export default async ({ js, snap }) => {
  console.log(JSON.stringify(await js(`(async () => { D.ui(false); D.world(4); const i = D.campus('launch-guiana', { light: 'sunset' }); await D.runAsync(60); await D.loaded();
    const sc = D.scene;

    return { i, t: sc.time, sp: sc.setPieces.map(p => ({ item: JSON.stringify(p.item).slice(0, 260), at: [+p.root.position.x.toFixed(1), +p.root.position.z.toFixed(1)], h: p.piece.h })) }; })()`)));
};
