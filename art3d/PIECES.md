# Building 3D pieces for the 3D edition (conventions + how to check)

The 3D edition (branch `3d`, SPEC §28) draws the same game as the pixel one in three.js. Places are built from
**pieces**: a facility on its plot, or a view-only **set piece** (a supplier's fab, a megaproject's solar field, a
launch pad…). Read `art3d/DIRECTION.md` first: the look is a handcrafted architectural scale model (chunky bevelled
forms, matte hand-painted colour, the game's palette, soft light). Its rules are requirements.

## The toolkit (read the code)
- `src/render3d/kit.ts`: **`Kit`** merges bevelled boxes (`box`), cylinders (`cyl`), beams (`beam`) and any geometry
  (`geo`) into ONE vertex-coloured mesh with per-part hand-painted colour jitter and a contact shade. Build everything
  static with it. `col`/`mix`, `rng(seed)`, `noise`/`fbm`. `glowMat(colour, base)` = night-lit windows/lamps
  (`m.userData.nightOnly = k` → glows only at night, k = strength); `poolMat` + `lightPool` = light pools on the ground
  at night.
- `src/render3d/pieces.ts`: the **`Piece`** interface and the reference pieces (`dataHall` is the quality bar). Helpers:
  `fence`, `fenceMesh`, `crane` (a tower crane; its `userData.top` group slews), `scaffold`, `wires`, `pylon`,
  `windTurbine`, `pad`. Red aviation lights: any mesh with `userData.beacon = phase` blinks by itself.
- `src/render3d/fx.ts`: `Plume` (steam/smoke/exhaust: add `p.obj`, call `p.update(e)`; `strength` 0..1), `sign(text,
  w, fg, bg)` (text in the UI font, faces +z), `coolingTowerGeometry(h, r)`, `domeGeometry(r, wall)`.
- `src/render3d/models.ts`: Meshy models you may place: `model(name, length)` (vehicles face −x in model space):
  'pickup', 'semitruck', 'sedan', 'hatchback', 'suv', 'van', 'mixer', 'flatbed', 'substation', 'watertower', 'lab',
  'gasplant'. `src/render3d/campus/life.ts`: `parkedCars(...)`.

## The contract
- A factory returns `Piece { obj, w, d, h, update?(e), progress?(p), ground?(x, z) }`.
- Origin = the centre of the footprint, ground at y = 0; everything inside w × d (≈1 unit margin). The **front faces +z**
  (towards the camera and the road). `w`/`d` = the footprint used; `h` = the real top of the building (the scene clips a
  piece from the ground up to `p × h` while it's under construction, for facilities).
- `update(e)`: `e.t` (s), `e.dt`, `e.night` 0..1, `e.cue?.('launch' | 'night-launch')` for sounds/moments. Animate what
  moves: fans, rotors, water, plumes, vehicles, rockets.
- `ground(x, z)` (optional): reshape the terrain under the piece (a pit, a reservoir basin, a mountain): return a height
  in the piece's own coordinates, or null to leave the land as it is.
- Colours: the game palette (`src/render/palette.ts`) or muted hex in its spirit; matte (roughness 0.8–1); bevelled
  boxes (Kit's default), never sharp raw primitives; `rng(seed)` for variety.
- Scale: a person is ~1.75 units; a data hall 21×11×5.2; a pickup ~4.4 long; a campus plot 28×26.
- Efficient: a few Kit meshes per piece, at most a few hundred meshes, sensible segment counts.
- `npx tsc --noEmit -p .` (project root) must pass for your files (strict, noUnusedLocals). Others edit other files at
  the same time: errors only in files you didn't touch can be ignored.

## How to check (iterate until it looks great)
A Vite dev server runs at http://127.0.0.1:5317 (hot reload — don't start or stop servers). The **piece lab** renders one
piece with the real ground, sky, shadows and post look, and a worker for scale:
- facility: `/play3d/lab.html?piece=reactor&tier=1&w=28&d=54`
- set piece: `/play3d/lab.html?set=launchPad&accent=df5f3e&hi=f08a46&builder=parabola&label=PARABOLA&variant=liftoff`
  (footprint defaults to the kind's size; `&n=2`, `&p=0.5` (build progress), `&vseed=1`, `&variant=…`)
- scene options: `&night=1`, `&alt=12` (sun altitude °), `&az=-40` (sun azimuth, 0 = south), `&yaw=-0.5&pitch=1.0&dist=120`
  (camera), `&backdrop=desert|plains|mountain|boreal|temperate|tropical|savanna|volcanic|coast`, `&sea=1` (open sea all
  round, for offshore pieces), `&moon=1` (lunar ground and sky), `&nopad=1`.
- Screenshot headlessly (software WebGL, 10–30 s each; several queries → out-0.png, out-1.png…; prints shader errors):
  `node /tmp/claude-1000/-home-lonefox-Projects-Kardashev-Project/e996dc31-ea60-4a11-972f-d08503c51866/scratchpad/qa/labshot.mjs <out.png> '<query>' ['<query>' …]`
  Then Read the PNGs. Check day, night, a close-up, every variant. Fix grey placeholder look, floating parts, z-fighting,
  things poking outside the footprint, or anything that doesn't read as what it is.

## Don't
Commit, run npm install, start/stop servers, generate Meshy models (suggest them in your report instead), or edit files
outside the ones your brief gives you (describe needed changes in your report).

## Off-world lab options (Act IV–V)
`&moon=1` (lunar ground, black sky, the Earth low on the horizon), `&space=1` (no ground: the yards and Ring One float;
the Earth big in the background, the swarm's glitter), `&habitat=1` (inside Aurora: the land curves up both sides and
overhead round the sun-line; the floor at y = 0 is the bottom of a cylinder of radius 260 along x), `&asteroid=C|S|M` (a
small world: the ground falls away to a close horizon).
