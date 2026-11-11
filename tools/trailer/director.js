// The in-page director (plain script, injected into the game's tab by the capture tools): builds the worlds and
// scenes the shots need and puts a free camera on them. It only reaches into the running game; no game file changes.
(() => {
  const g = window.game, M = window.__mods;
  const D = (window.D = { g, M, frame: 0 });
  const lerp = (a, b, k) => a + (b - a) * k;
  const EASE = {
    linear: (k) => k,
    // a touch of ease at each end, steady between (the game's own tour move)
    soft: (k) => k * 0.82 + k * k * (3 - 2 * k) * 0.18,
    inout: (k) => k * k * (3 - 2 * k),
    out: (k) => 1 - Math.pow(1 - k, 2.2),
    in: (k) => Math.pow(k, 2.2),
    // fast away, settling: a move that lands
    land: (k) => 1 - Math.pow(1 - k, 3.4),
  };
  D.EASE = EASE;

  D.ui = (on) => { document.getElementById('ui').style.visibility = on ? 'visible' : 'hidden'; document.getElementById('kp-pointer')?.remove(); D.ptr = null; };

  /** The date the scenes see: this site at this local solar hour, on a day of the year (default late June). */
  D.clockAt = (lon, hour, month = 5, day = 21, year = 2026) => {
    window.__dateBase = Date.UTC(year, month, day, 12) - (lon / 15) * 3600000 + (hour - 12) * 3600000 - window.__vt();
  };

  /** The worlds: 'garage' (day one), 2 (the Act II showcase company), 4 (a ~2062 planet), 5 (a ~2084 solar system). */
  const worlds = (window.__worlds ??= new Map());
  D.world = (w, opts = {}) => {
    // (a real game left running by an interface shot: back to the title, where the scenes show the world we hand them)
    if (g.state || g.mode !== 'title') { g.quitToMenu(); D.quiet(); }
    const key = w + JSON.stringify(opts);
    if (!worlds.has(key)) {
      let s;
      if (w === 'garage') s = M.st.newGame({ name: 'Kardashev Labs', homeSite: opts.home ?? 'bay-area', seed: 7 });
      else if (w === 2) s = M.sc.makeShowcase(g.ctx);
      else if (w === 4) s = M.a4.act4PreviewState({ stage: 3, moon: 3, ...opts });
      else s = M.a5.act5PreviewState({ stage: 3, ...opts });
      if (w === 4 || w === 5) s.company.name = 'The Kardashev Project';
      M.tk.refreshStats(s);
      worlds.set(key, s);
    }
    g.showcase = worlds.get(key);
    return g.showcase;
  };

  D.quiet = () => {
    if (g.tour) { g.tour.running = false; g.tour.update = () => {}; }
    g.stage.fade = 0;
    g.tourCaption = '';
  };
  /** No fade-up on a new scene: the edit does its own. */
  D.noFade = () => { g.stage.fade = 0; g.stage.arrive = 0; g.stage.arriveWait = 0; };

  // our campus camera: a position and a point to look at, both free
  D.place = function () {
    const c = D.c;
    const cam = this.camera;
    const gy = this.ground.h(c.pos[0], c.pos[2]) + 1.2;
    cam.position.set(c.pos[0], Math.max(c.pos[1], gy), c.pos[2]);
    cam.lookAt(c.look[0], c.look[1], c.look[2]);
    // (the vertical cuts: a wider lens, so a campus still fits across the narrow frame)
    const fov = c.fov * (D.tall ? c.tallFov ?? 1.7 : 1);
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // what the scene's own systems read (grass rings, rain, people's detail)
    this.target.set(c.look[0], 0, c.look[2]);
    const d = Math.hypot(c.pos[0] - c.look[0], c.pos[1] - c.look[1], c.pos[2] - c.look[2]);
    this.dist = d;
    const max = c.dofMax ?? (1.2 + 3.6 * Math.min(1, Math.max(0, (d - 60) / 240)));
    this.look.dof = { focus: c.focus ?? d, range: c.range ?? 0.24, max: max * c.blur };
  };

  // ── campuses ──────────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * A campus scene on the stage. `light` = the game's named lights, or `hour` (+ month/day) for an exact sun.
   * The camera is ours from here on: `D.cam({ pos, look, fov, blur })`.
   */
  D.campus = (site, o = {}) => {
    D.quiet();
    const def = M.sites.SITE_BY_ID[site];
    if (o.hour !== undefined) D.clockAt(def.lon, o.hour, o.month, o.day);
    else D.clockAt(def.lon, 12, o.month, o.day);
    g.dioramaTimelapse = false;
    const sc = g.makeDioramaScene(site);
    sc.autoPan = false;
    g.stage.setScene(sc, 2);
    if (o.light) sc.setLight(o.light);
    if (o.weather !== undefined) sc.setWeather(o.weather);
    D.scene = sc;
    D.kind = 'campus';
    D.dist0 = sc.dist;
    // our camera: a position and a point to look at, both free (the game's keeps the target on the ground and
    // the camera above ~4°: fine for play, too tame for a hero shot)
    const c = (D.c = { pos: [0, 60, 120], look: [0, 4, 0], fov: 30, blur: 1, dofMax: null });
    sc.clampCam = () => {};
    sc.placeCamera = D.place;
    D.noFade();
    return { focus: sc.layout.focus, bounds: sc.layout.bounds, scenery: sc.scenery, dist: +D.dist0.toFixed(0), hour: +sc.localHour().toFixed(2) };
  };

  /** The game's own orbit camera, as numbers for ours: `orbit(x, z, dist, yaw, pitch, y)` → { pos, look }. */
  D.orbit = (x, z, dist, yaw, pitch, y = 0) => {
    const sp = Math.sin(pitch), cp = Math.cos(pitch);
    return { pos: [x + dist * sp * Math.sin(yaw), y + dist * cp, z + dist * sp * Math.cos(yaw)], look: [x, y, z] };
  };

  D.cam = (o) => { Object.assign(D.c, o); };

  /** A key in the game's own terms, relative to the campus's middle: `D.at(dx, dz, dist × the campus's own, yaw, pitch, lookY, fov)`. */
  D.at = (dx, dz, k, yaw, pitch, y = 0, fov = 30, more = {}) => {
    const f = D.scene.layout.focus;
    return { ...D.orbit(f.x + dx, f.z + dz, D.dist0 * k, yaw, pitch, y), fov, ...more };
  };
  /** The campus's width (its plots, west to east). */
  D.W = () => D.scene.layout.bounds.x1 - D.scene.layout.bounds.x0;

  /**
   * A move: keys [{ k (0..1), ...numbers and [x, y, z] arrays }], eased; `D.pose(u)` puts the camera at u (0..1).
   * Campus keys: pos, look, fov, blur, focus. Globe: lon, lat, dist, hour, season. System / orbit: az, el, dist.
   */
  D.move = (keys, ease = 'soft') => {
    D.keys = keys.map((k, i) => ({ k: k.k ?? i / Math.max(1, keys.length - 1), ...k }));
    D.ease = typeof ease === 'function' ? ease : EASE[ease] ?? EASE.soft;
  };
  // Catmull–Rom through the keys (two keys = a straight eased line)
  const spline = (p0, p1, p2, p3, t) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
  D.pose = (u) => {
    const K = D.keys;
    if (!K) return;
    const e = D.ease(Math.min(1, Math.max(0, u)));
    let i = 0;
    while (i < K.length - 2 && e > K[i + 1].k) i++;
    const a = K[i], b = K[i + 1] ?? a, p = K[i - 1] ?? a, n = K[i + 2] ?? b;
    const t = b === a ? 0 : (e - a.k) / (b.k - a.k);
    const o = {};
    for (const f of Object.keys(a)) {
      if (f === 'k') continue;
      const va = a[f], vb = b[f] ?? va, vp = p[f] ?? va, vn = n[f] ?? vb;
      o[f] = Array.isArray(va) ? va.map((_, j) => spline(vp[j], va[j], vb[j], vn[j], t)) : spline(vp, va, vb, vn, t);
    }
    D.apply(o);
  };
  D.apply = (o) => {
    const sc = D.scene;
    // the vertical cuts: the globe from further off (the system view gets a wider lens instead: see D.system)
    if (D.tall && o.dist !== undefined && (D.kind === 'globe' || D.kind === 'orbit')) o = { ...o, dist: o.dist * (D.kind === 'globe' ? 2.2 : 1.6) };
    if (D.kind === 'campus') D.cam(o);
    else if (D.kind === 'globe') {
      // (the game's own film glide, held at one point: it sets the view and the Sun exactly)
      const at = [o.lon, o.lat + 6];
      const sun = o.hour === undefined ? null : [o.lon - (o.hour - 12) * 15, o.lon - (o.hour - 12) * 15, o.season ?? 8];
      if (sun) { sun[0] = ((sun[0] + 540) % 360) - 180; sun[1] = sun[0]; }
      sc.cine = { from: at, to: at, t: 0, secs: 1e9, dist: o.dist, sun };
      sc.dist = o.dist;
    } else if (D.kind === 'system') {
      if (o.az !== undefined) sc.az = o.az;
      if (o.el !== undefined) sc.el = o.el;
      if (o.dist !== undefined) sc.dist = sc.goalDist = o.dist;
      sc.vAz = sc.vEl = 0;
    } else if (D.kind === 'orbit') {
      if (o.az !== undefined) sc.az = o.az;
      if (o.el !== undefined) sc.el = o.el;
      if (o.dist !== undefined) sc.dist = sc.goalDist = o.dist;
      sc.vAz = sc.vEl = 0;
      sc.idleUntil = 1e12;
    }
  };

  // ── the globe, the orbit view, the solar system ───────────────────────────────────────────────────────────────
  D.globe = (o = {}) => {
    D.quiet();
    const sc = g.makeMapScene();
    g.stage.setScene(sc, 1);
    sc.clampView = function () { this.lat = Math.max(-80, Math.min(80, this.lat)); };
    // no name tags in the film (they are for play: at video size they are specks); `bare` also drops the site markers
    if (!o.labels) { sc.labels.show([]); sc.labels.show = () => {}; }
    if (o.bare) { sc.markerRoot.visible = false; sc.halos.mesh.visible = false; }
    D.scene = sc;
    D.kind = 'globe';
    D.noFade();
  };
  D.orbitView = () => {
    D.quiet();
    const sc = g.makeOrbitScene();
    g.stage.setScene(sc, 1);
    D.scene = sc;
    D.kind = 'orbit';
    D.noFade();
    return { az: sc.az, el: sc.el, dist: sc.dist };
  };
  /** The solar system; `cinematic` = the Type I ending's pull-back (its clock is `D.scene.cineT`, in seconds). */
  D.system = (cinematic = false) => {
    D.quiet();
    const sc = g.scenes.system(g, { cinematic });
    g.stage.setScene(sc, 1);
    if (D.tall) { sc.camera.fov = Math.min(100, sc.camera.fov * 2.1); sc.camera.updateProjectionMatrix(); }
    D.scene = sc;
    D.kind = 'system';
    D.noFade();
    return { az: sc.az, el: sc.el, dist: sc.dist };
  };

  // ── a real game (the interface shots, the time-lapses) ────────────────────────────────────────────────────────
  /** Start a company: preset '' | 'act2' | 'act3' | 'act4' | 'act5'. Leaves the game on the map, clock stopped. */
  D.start = (preset, home = 'west-texas', name = 'Kardashev Labs') => {
    D.quiet();
    if (g.state) { g.quitToMenu(); D.quiet(); }
    try { localStorage.clear(); } catch {}
    const o = { name, homeSite: home, seed: 11, tutorial: false, difficulty: 'standard' };
    if (preset) o[preset] = true;
    if (!g.startNew(o)) throw new Error('startNew refused');
    g.updateSettings({ tips: false, autosaveSec: 100000 });
    D.calm();
    return g.state;
  };
  /** Nothing pops up over the shot: briefings skipped, cards answered (first enabled choice), toasts cleared. */
  D.calm = () => {
    for (let i = 0; i < 6 && g.briefing; i++) g.briefingSkip();
    // (a card's first choice can be a disabled one: try each)
    for (let i = 0; i < 12 && g.state?.events?.active; i++) g.chooseEvent(i % 4);
    // and no random card for a long while (scripted ones, an act's opening, still come and are answered here)
    if (g.state && !D.cards) g.state.events.nextRoll = g.state.day + 9999;
    if (g.showActComplete) g.dismissActComplete();
    if (g.toasts?.length) { g.toasts.length = 0; g.notify(); }
  };
  /** Play `days` game days at once with a bot at the controls (`bot(s, ctx)` before each day). */
  D.days = (days, bot) => {
    const s = g.state;
    for (let i = 0; i < days; i++) { bot?.(s, g.ctx); M.tk.tick(s, g.ctx); }
    M.tk.refreshStats(s);
    D.calm();
    g.notify();
  };
  D.bots = async () => (D.bot ??= {
    b1: (await import('/tests/helpers/act1bot.ts')).botDay1,
    b2: (await import('/tests/helpers/act2bot.ts')).botDay,
    b3: (await import('/tests/helpers/act3bot.ts')).botDay3,
  });
  // ── a pointer for the interface shots (the game is played by script; this shows where a player would click) ───
  D.pointer = () => {
    let el = document.getElementById('kp-pointer');
    if (!el) {
      el = document.createElement('div');
      el.id = 'kp-pointer';
      el.innerHTML = '<svg width="26" height="30" viewBox="0 0 26 30"><path d="M3 2 L3 23 L8.6 18 L12.4 27 L16 25.4 L12.2 16.6 L20 16.4 Z" fill="#fff" stroke="#14121c" stroke-width="1.8" stroke-linejoin="round"/></svg><i></i>';
      el.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55));will-change:transform';
      const ring = el.querySelector('i');
      ring.style.cssText = 'position:absolute;left:-17px;top:-17px;width:40px;height:40px;border-radius:50%;border:3px solid #fbd46e;opacity:0;box-sizing:border-box';
      document.body.appendChild(el);
    }
    D.ptr = { el, x: innerWidth * 0.5, y: innerHeight * 0.62, from: null, to: null, click: -1 };
    D.ptrDraw();
  };
  D.ptrDraw = () => {
    const p = D.ptr;
    p.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    const ring = p.el.querySelector('i');
    const a = p.click < 0 ? 1 : p.click / 20;
    ring.style.opacity = a >= 1 ? 0 : String(0.95 * (1 - a));
    ring.style.transform = `scale(${0.35 + a * 0.9})`;
    if (p.click >= 0) p.click++;
  };
  /** Glide the pointer to an element (or [x, y]) over frames f0..f1, then press it at f1 (`act` runs then). Call every frame. */
  D.ptrMove = (f, f0, f1, target, act) => {
    const p = D.ptr;
    if (f === f0) {
      const el = typeof target === 'string' ? [...document.querySelectorAll(target)].find((e) => e.getBoundingClientRect().width > 0) : null;
      const r = el?.getBoundingClientRect();
      p.from = [p.x, p.y];
      p.to = Array.isArray(target) ? target : r ? [r.left + Math.min(r.width * 0.5, 90), r.top + r.height * 0.55] : [p.x, p.y];
      p.target = el;
    }
    if (f >= f0 && f <= f1 && p.to) {
      const k = (f - f0) / (f1 - f0), e = k * k * (3 - 2 * k);
      p.x = p.from[0] + (p.to[0] - p.from[0]) * e;
      p.y = p.from[1] + (p.to[1] - p.from[1]) * e - Math.sin(k * Math.PI) * 14;
    }
    if (f === f1) { p.click = 0; act ? act(p.target) : p.target?.click(); }
  };

  /** Take over the campus camera of the scene the game itself opened (enterDiorama). */
  D.own = () => {
    const sc = g.stage.getScene();
    D.scene = sc;
    D.kind = 'campus';
    const c = (D.c = { pos: [0, 60, 120], look: [0, 4, 0], fov: 30, blur: 1, dofMax: null });
    sc.autoPan = false;
    sc.arrival = null;
    sc.clampCam = () => {};
    sc.placeCamera = D.place;
    D.noFade();
    return { focus: sc.layout.focus, bounds: sc.layout.bounds };
  };

  /** Advance the page n frames of `ms` each, calling `each(i)` before every one. */
  D.run = (n, ms = 1000 / 60, each) => {
    for (let i = 0; i < n; i++) { each?.(i); window.__step(ms); g.stage.fade = 0; }
  };
  /** The same, letting the page breathe between frames: models and textures load in the gaps (a tight loop starves them). */
  D.runAsync = async (n, ms = 1000 / 60, each) => {
    for (let i = 0; i < n; i++) {
      each?.(i);
      window.__step(ms);
      g.stage.fade = 0;
      if (i % 2 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  };
  /** Wait (real time) until nothing new has been fetched for a moment: the scene's models are in. */
  D.loaded = async (quiet = 350, max = 8000) => {
    const count = () => performance.getEntriesByType('resource').length;
    let n = count(), since = 0;
    for (let waited = 0; waited < max && since < quiet; waited += 50) {
      await new Promise((r) => setTimeout(r, 50));
      const m = count();
      if (m !== n) { n = m; since = 0; } else since += 50;
    }
  };
  return 'director ready';
})();
