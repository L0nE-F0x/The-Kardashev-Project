export default async ({ js, snap }) => {
  await js(`(async () => { await D.bots(); D.start('', 'west-texas'); D.ui(true); game.enterDiorama('west-texas'); D.clockAt(-102, 9); D.run(30); })()`);
  await js(`D.own(); D.cam({ pos: [-60, 60, 110], look: [-8, 2, 6], fov: 30 }); D.run(20)`);
  console.log(JSON.stringify(await js(`(() => { const sc = game.stage.getScene(); const st = game.stage; const gl = st.renderer.getContext(); return { fade: st.fade, arrive: st.arrive, cam: sc.camera.position.toArray().map(v => +v.toFixed(1)), same: sc === D.scene, canvas: [st.canvas.width, st.canvas.height], expo: sc.look.exposure, night: sc.sky?.night, hour: sc.localHour?.(), lost: gl.isContextLost(), mode: game.mode, kids: sc.scene.children.length, post: !!st.post, scn: st.scene === sc }; })()`)));
  console.log(await js(`String(window.__errs) + " " + window.__lastErr`)); await snap("a");
};
