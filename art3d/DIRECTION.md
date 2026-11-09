# 3D look test — art direction (retry, 2026-11-09)

A side test on branch `3d-look`: does the game look better (for Steam) as 3D, or as a 3D/pixel hybrid?
Act I only, running on the real sim. Dev page: http://127.0.0.1:5317/3d/ (not part of the production build).

## Lessons from the first attempt (Grok, deleted)
- One Meshy mesh per facility gave models that didn't match each other, and the big hall failed twice.
- It looked like a plain low-poly grey box: flat ground, lollipop trees, muddy golden hour.
- A camera and post effects aren't art direction.

## The idea: the world as a scale model on a table
Every site is a **floating slab of land**, a chunk cut out of the world with a soil and rock cross-section on its
sides, sitting in a soft sky. It's the game's "diorama" made literal: the campus is a model you look down on and
watch grow. Tilt-shift blur at the top and bottom of the screen makes it read as a miniature.

## Rules
- **One house style for every Meshy model.** Each starts as a concept image drawn in the same style brief
  (`STYLE` in `tools/meshy.mjs`: a handcrafted architectural scale model, chunky bevelled forms, matte hand-painted
  colour, a fixed palette) and only becomes 3D once the concept is checked. Concepts cost 6 credits, models 30.
- **Meshy for the heroes, code for the masses.** The garage, the lab, the gas plant, the substation, the water
  tower, vehicles and trees come from Meshy. Halls, solar rows, battery containers, wind turbines, pumpjacks,
  fences, roads and power lines are built in code: they repeat, grow with the sim and need moving parts.
- **Code-built pieces match the models:** bevelled boxes (never sharp primitives), per-face colour jitter like hand
  painting, the same palette, roughness 0.8–1, no metal sheen.
- **Palette** = the game's own (`src/render/palette.ts`): sand and terracotta ground, cream walls, slate and teal
  accents, charcoal roofs, olive scrub. The Meshy textures get a light pull towards the palette in the shader.
- **Ground is never flat or uniform:** gentle rolling height, dry-grass colour noise, worn tracks, caliche roads,
  scrub clumps, rocks, mesquites in clusters, oil pumpjacks nodding out in the scrub (it's the Permian Basin).
- **Light:** a warm sun with soft shadows, a sky/ground hemisphere fill, ambient occlusion. The day runs on its own
  slow loop (dawn, noon, golden hour, night with lit windows, aviation beacons and bloom), or can be pinned.
- **Life:** trucks on the highway, turbine blades, chiller fans, pumpjacks, cranes over anything being built
  (buildings rise with the sim's construction progress).
- **Two looks, one scene** (toggle): *Model* (clean, tilt-shift) and *Pixel* (rendered at low resolution with
  outlines and snapped to the game's palette: the hybrid).

## Running it
`npm run dev`, then http://127.0.0.1:5317/3d/ (dev only; `vite build` doesn't include it). Drag to orbit, right-drag to
pan, wheel to zoom, H hides the HUD. The sim runs on the Act I bot (Autopilot); the build bar builds on West Texas
yourself. Console: `kp3d` (`run`, `sky.time = 0..1`, `post.setLook('pixel')`, `look(x, y, z, dist, az, pol)`, `flyTo(id)`).

## What's here (2026-11-09)
- `src/three/`: kit (bevelled hand-painted boxes, noise, cloud shadows, light pools), terrain (the slabs, strata,
  roads), models (Meshy loader + palette pull), pieces (hall, solar, batteries, wind, crane, scaffold, pumpjacks,
  pylons, windpump, cattle, people), world (both sites' dressing, traffic), campus (sim → plots, construction rises
  behind a clip plane), sky (time of day), post (the two looks), hud, simrun, main.
- Meshy: 10 concepts (`art3d/concepts/`) → 10 models, all first try: 360 credits (1,039 left). Raw downloads in
  `art3d/raw/` (git-ignored); web copies with 1k WebP textures in `public/3d/models/` (`tools/glb-tex.mjs`).
- Not done: Act II+ facilities, the map, the UI panels; the garage interior is Meshy's (no Bit, no screens); cattle
  and people are code-built placeholders.
