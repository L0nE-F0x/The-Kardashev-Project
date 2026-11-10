# The Kardashev Project — dev guide

A 3D management sim about the AI boom, for desktop (Windows, macOS, Linux; Steam is the goal). Design doc: `SPEC.md`
(pillars, acts, decisions log).
**One game, one platform (v0.12.0 "All In", SPEC §30):** the pixel-art edition, the web game, the installable web app
(PWA) and the Android app were removed on 2026-11-11. Don't bring them back, and don't add phone or browser support:
the game is the 3D one, shipped as the desktop app. What is left of the pixel days is the interface's art (logo,
portraits, 9×9 and 15×15 icons, the Type I end card) and the optional Chiptune soundtrack.
Current build: **v0.12.0 "All In"** on top of v0.11.0 "Golden Hour" (the grand polish pass on the 3D edition: sky, light and atmosphere on the
campuses, the globe rebuilt, cinematic space views and ending, a 3D interface theme, new sound, photo mode: SPEC §29)
on top of v0.10.1 "Lived In" (the 3D polish pass: globe, roads, grass, farmland, traffic, people with a
working day, far-north daylight: SPEC §28) on top of v0.10.0 "Third Dimension" (the 3D edition in beta, opt-in via
Settings → Display → Edition: SPEC §28) on top of v0.9.4 "Fast Lane" (desktop updates download in pieces over six connections: SPEC §26b) on top of
v0.9.3 "Clear Signs" (new 15×15 dock icons drawn in whole device pixels, the dock badge fix, the desktop
updater's retry on a stalled download: SPEC §26) on top of v0.9.2 "Pocket Size" (the phone pass: tutorial bubbles that fit, a two-column phone menu, no double
cutout gap in the Android app, a top bar that fits, toasts over the ticker: SPEC §25) on top of v0.9.1 "Skip Ahead"
(Coming up + skip-ahead, Act I side goals, Stats, campus moments: SPEC §24) and
v0.9.0 "Easy Start" (the modern HUD layer, How to Play, a 20-step tutorial, advisor tips: SPEC §23), v0.8.1 (the Linux AppImage sound fix) and v0.8.0 "Stakes & Polish" (a whole-game audit for fun, bugs and speed: SPEC §22) and v0.7.0 "Sandbox &
Soundtrack" (M5 steps 1–7) and v0.6 "Type I" (M4.5): the whole v1 campaign is playable end to end — Acts I (The Garage), II (The
Scale-Up), III (The Charter), IV (Planetary) and V (Type I, ending on Kardashev 1.0000) — on top of v0.2 "The Front Door" (website, main menu, tutorial, settings, save slots, PWA and
desktop builds). v0.6.1 "Signs of Life" redrew the diorama people (people.ts, life.ts), lighting and depth, decluttered the world map
and cleaned up the off-world dither. v0.4.2 "Easy Reading" added the readable font (Atkinson Hyperlegible Next), phone fullscreen and the
Android app; v0.5.1 added in-app updates (an Update toast in the game). Release names before 0.12 mention editions, phones and
the Android app: history only.
The website is live at https://thekardashevproject.netlify.app (Netlify auto-deploys `main`, the website only).

## The renderer (SPEC §28, §29)

`play/index.html` → `src/main.ts` builds `Game` with `render3d/stage3d.ts` (three.js) and the scenes behind
`SceneFactory`. `Game` only knows the `GameStage`/`GameScene` contract (render/stage.ts); keys and the frame loop are
`game/shell.ts`. main.ts adds `html.edition-3d` before the UI renders (the interface theme is scoped to it). 3D detail =
`render3d/quality.ts`
(shadows, AO at half resolution, resolution, MSAA on high only / FXAA below, plants, bevel segments; since v0.11 also
the blur's quality, the ground bump and the globe's extras: high only where it costs). Auto = high only when the
webview names a discrete GPU (WebKit never does), else medium, plus adaptive resolution in
`stage3d.ts` (one frame timed by GPU syncs every 0.7 s; not the frame rate: WebKit caps rAF at 30 in low-power mode).
Measured on the dev laptop's Intel iGPU on battery, ~1.1 MP: scene ~18 ms, full-res AO +24, 4× MSAA +11, bloom +3.5.
- **The picture (v0.11, SPEC §29):** `post.ts` = one scene render (HDR + depth) → GTAO from depth → depth-of-field →
  bloom → one film pass (exposure, neutral or ACES `tone`, sharpen, era grade, contrast, vignette, fade) → FXAA below
  high. A scene asks through its `look` (`tone`, `exposure`, `dof`, `contrast`, `sharpen`, `saturation`; defaults =
  neutral, as the globe and space use). `atmosphere.ts` patches three's fog and light chunks for campus scenes (any
  scene with `scene.fog`): aerial haze, the lamp field (light pools drawn from above into a texture: `lightPool` in
  kit.ts puts them on `LAMP_LAYER`), sky reflections under roughness 0.6, wet ground; every material gets the shared
  `atmo` uniforms automatically (an accessor on `Material.prototype.onBeforeCompile`), so pieces need nothing.
  `campus/sky.ts` = the dome (sun, moon, clouds, stars, aurora) and the light keys by sun altitude (`KEYS`: colours,
  intensities, haze, exposure). Tune the look there, not per piece.
- **Scenes:** `globe/` (globeScene: Earth from `earth.ts` + `bake.ts` (climate, lights) + `space.ts` (stars, Sun,
  aurora) + `markers.ts`: biome/land/relief/region textures + shader with real-time sun, city lights, weather, region
  tints, heat haze; `layerData.ts` = what the layers read from the game (site visibility, cables, lanes, the Charter's
  map view, the orbit); `layers2/3/45.ts` = Act II cables/fiber/lanes · Act III megaproject
  patches, HVDC, satellite, liftoff · Act IV–V supergrid, fusion/rectenna glows, banners, garden/forge), `campus/`
  (campusScene: every site — build sites on plots (`layout.ts`), view-only places (`viewOnly.ts`: Act II set pieces via
  `setPiecesFor`, Act III–V via the planner `act3Plan` + `act3Key` rebuilds in `plan.ts` / `plan5.ts`, with `planKit.ts`
  for builder colours, bloc banners and yard flags; `tests/site-plan.test.ts`), sceneries: campus, geneva (lake),
  offshore, launch coast, moon, space (no ground), habitat (`habitatShell.ts`), asteroid (curved ground); `ground.ts` =
  ten backdrops to the horizon, `sky.ts` (real sun at the site, weather, lunar/space/habitat modes), `weather.ts`,
  `water.ts` (lakes and seas cut from the ground grid), `life.ts` (rigged people, advisors, Bit, traffic)),
  `orbit/orbitScene.ts` (Act IV–V), `system/systemScene.ts` + `swarm.ts` + `cinematic.ts` (Act V + the Type I
  pull-back), `space/` (their shared kit: backdrop, Sun, bodies, ribbon lines), the TourDirector (every shot;
  each campus shot has a `light` and a camera `move`: `CampusScene.direct`). Photo mode: `ui/PhotoMode.tsx`,
  `game.photo`, `Stage3D.capture`, the campus's `setHour` / `setWeather` / `setLens` / `blur`. The 3D interface theme is
  CSS only, scoped to `html.edition-3d`: `render3d/edition.css` imports `render3d/ui/*.css` (tokens, art, menu, hud,
  cards, acts); the loading screen is in `play/index.html`. Scenes free their GPU memory in `destroy()` via
  `disposeObject` (kit.ts: skips anything with `userData.shared`, e.g. model materials, cached kit textures, the
  Earth's textures); a campus rebuild frees the old world too.
- **Pieces:** `campus/registry.ts` maps facility types (`act1.ts`, `plants2.ts`) and set pieces (`industry.ts`,
  `act3sets.ts` → `sets/*.ts`; footprints in `act3sizes.ts`) to builders returning `Piece` (pieces.ts). Conventions
  and the lab: `art3d/PIECES.md`; lab page `/play/lab.html?piece=…|set=…` (dev). Art direction: `art3d/DIRECTION.md`.
- **Meshy:** `tools/meshy.mjs` (concept image first with one style brief; `--char` = rigged people), `tools/glb-tex.mjs`
  shrinks textures into `public/3d/models/` (people: the `_walk.glb`, `--size 1024`); models load on demand
  (`models.ts`: PEOPLE at boot, advisors/astronaut/TOWNSFOLK when a scene needs them; the lab's `?people=1|town`
  lines them up). The app carries them in its bundle (`dist/3d/models/`).
- **QA:** headless Chrome on the dev laptop's RTX is far faster than SwiftShader and shows the high preset as players see
  it: `__NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia __EGL_VENDOR_LIBRARY_FILENAMES=/usr/share/glvnd/egl_vendor.d/10_nvidia.json
  google-chrome-stable --headless=new --remote-debugging-port=9222 --use-angle=gl-egl --ignore-gpu-blocklist` and
  Playwright's `connectOverCDP`. Campus hooks: `setLight('dawn'|'morning'|'noon'|'golden'|'sunset'|'dusk'|'night')`,
  `setHour(h)`, `setWeather('rain'|…|null)`, `aim(...)`; freeze a tour shot with `tour.index = i - 1; tour.nextShot(false);
  tour.running = false`. Otherwise: headless Chrome + `--use-angle=swiftshader`; stub Vite's `@vite/client` with a working `updateStyle` (else no
  CSS) when other edits would hot-reload the page; campus `aim(x, z, dist, yaw, pitch)`; `game.updateSettings({ dayNight:
  false })` pins local noon; `tests/render3d-layout.test.ts` checks every place's layout. Adaptive resolution is off
  under automation (`navigator.webdriver`). Real-GPU timing: Chrome with `--use-angle=gl-egl` (the Intel iGPU), or the
  desktop app (`npx tauri build --debug --no-bundle --config '{"identifier":"…test3d","build":{"beforeBuildCommand":""}}'`
  after `npm run build`, scratch XDG dirs + the WebKit inspector, see the update test below; WebKit's Runtime.evaluate
  doesn't await promises). `window.quality3d` is the live detail level. The game page in dev is
  http://127.0.0.1:5317/play/ (the browser is a development tool only: players get the desktop app).

## Commands

```bash
npm run dev           # Vite dev server → http://127.0.0.1:5317 (the game at /play/, the website at /)
npm run build         # typecheck (tsc 7) + the game → dist/ (play/index.html; what the desktop app bundles)
npm run build:site    # typecheck + the website → dist-site/ (index.html; what Netlify serves: no game in it)
                      # (vite.config.ts: KP_TARGET=site picks the website; each build drops the other's public/ files)
BALANCE=1 npx vitest run tests/balance.test.ts   # the balance report: every act's bot × Relaxed/Standard/Hard × seeds
                      # (BALANCE_ACTS=4,5 BALANCE_SEEDS=21,7 BALANCE_DIR=…; Act I searches 24 plans per run)
npm test              # vitest: sim determinism, Act I bot, Act II bot (preset → IPO), Act III bot (preset → renewal),
                      # Act IV bot (preset → jumps → the Heat Wall), Act V bot (preset → eras → Solar Maximum → Type I),
                      # offline, saves, routing, the site planner and the 3D layouts
npm run gen:map       # rebuild src/content/generated/worldmap.bin from Natural Earth (tools/raw/)
npm run gen:assets    # re-render icons, favicon, logo + src-tauri/icons from the pixel-art code (the website's social
                      # card and still globe are 3D renders: node tools/og3d.mjs [globe], PLAYWRIGHT=<its index.mjs>)
npm run desktop:dev   # Tauri window on top of the dev server
npm run desktop:build # local desktop build (Linux: add `-- --bundles deb` to skip the AppImage)
PREVIEW_DIR=/some/dir npx vitest run tests/preview.test.ts tests/routing.test.ts tests/act4-portraits.test.ts \
  tests/act5-portraits.test.ts tests/governors.test.ts tests/dock-icons.test.ts
                      # render the terrain / portrait / route / dock-icon previews to PNG
```

In the browser console, `window.game` is the live `Game` (state, actions, `setEraOverride(0..3)`, `enterDiorama(siteId)`,
`showMenu()`, `tutorialRestart()`, `replayBriefings()`, `startNew({ ..., act3: true })`). To fast-forward in QA, import
`/src/sim/tick.ts` in the console and call `tick(game.state, game.ctx)` in a loop (then `refreshStats` + `game.notify()`):
an automated or off-screen Chrome window throttles requestAnimationFrame to ~1 fps, which also throttles the game clock.
The test bots import fine in the console too (`await import('/tests/helpers/act3bot.ts')` → `botDay3(game.state)` before
each tick) to play an act forward on autopilot.
Screenshots for the website: in dev, the page can POST a PNG to `/__screenshot?name=<name>` (Content-Type `image/png`, same origin only) and it lands in `public/screenshots/`.

## Architecture

```
index.html          the website (landing page) → src/landing/   (built by `npm run build:site`)
play/index.html     the game → src/main.ts (+ play/lab.html, the dev piece lab)   (built by `npm run build`)
src/
  sim/        PURE game logic — no DOM, no Pixi. Deterministic (seeded RNG in state).
    types.ts      GameState and friends (everything serialisable); GameMeta = difficulty, founder, custom start
    state.ts      newGame(opts) + SAVE_VERSION
    tick.ts       one game day: construction → supply → stack → power → compute → economy → capital/politics/rivals
                  → license → rivals' models → stats → jobs → finale → objectives → act phases → events
    model.ts      shared formulas (costs, tiers, plots, chip pools, materials, capability, K, crisisCost) — UI previews use these too
    actions.ts    player actions; validate → spend → mutate → Result {ok | reason} (Act II actions at the bottom)
    power.ts / supply.ts / ai.ts / economy.ts / events.ts / offline.ts   (see SPEC §11)
    act2.ts       Act II framework: beginAct2, phases (1 Gigawatts · 2 The Stack · 3 The Race · 4 The Crunch · 5 done),
                  Series B / race / finale triggers, the "Start at Act II" preset (newAct2Game)
    act3.ts       Act III framework: beginAct3, Charter phases (1 Founding · 2 Build-Out · 3 Frontier · 4 Threshold ·
                  5 Renewal · 6 done, kept in s.charter.phase), the Mandate trigger, the "Start at Act III" preset
    charter.ts    the Kardashev Project: treasury + dues, partners, tenders/bids/projects (trouble, completion effects),
                  missions, compute access, Legitimacy / political capital, conflict of interest, the blind trust
    charterInit.ts / charterView.ts   the Charter's starting state · read-only views for the map, dioramas and UI
    world.ts      Act III world energy: per-bloc TW + clean share, growth from Charter spillovers, the carbon budget
    council.ts    resolutions, forecasts, sessions every 90 days, whips/favours, factions, walkouts, the Concord
    frontier.ts   the safety regime: world alignment vs the frontier (world safety margin), the compute cap and
                  your own run licences, rival incidents and licence requests
    trustee.ts / desk.ts   the blind trust's autopilot · the Charter desk (Mira, Juno, Sol, Penny, Kip, Bit)
    threshold.ts  The Threshold (grid · frontier · council fronts), the renewal vote and the ending
    act4.ts       Act IV framework: beginAct4, stages in `s.planet.stage` (0 Mandate · 1 Supergrid · 2 Fusion Age ·
                  3 High Frontier · 4 Heat Wall · 5 done), stage gates, `planetChecklist` (live); act4preset.ts =
                  "Start at Act IV" (the Act III preset fast-forwarded to 2045)
    sandbox.ts    sandbox mode: `meta.sandbox` switches (unlimited money, research fast/all, overnight builds) and
                  scenario sliders (politics, climate, shocks, chips) read by the sim's formulas; `tickSandbox` daily
    plans.ts      five-year plans and time jumps (real daily ticks with `flags.offline = 'jump'`), the planner that
                  posts/awards contracts by priority, autopilot for events (first enabled choice), the report + Bit's diary
    supergrid.ts / provinces.ts / climate.ts / fusion.ts / orbit.ts (+ the Moon) / airegions.ts / heatwall.ts
                  the Act IV systems; planetInit.ts (starting state), planetView.ts (read-only views for map, orbit,
                  dioramas), planetPreview.ts (a ready-made ~2062 world for previews and tests)
    act5.ts       Act V framework: beginAct5, stages in `s.system.stage` (0 Thermal Line · 1 Foundries · 2 Swarm ·
                  3 Last Climb · 4 Solar Maximum · 5 Type I), stage gates (big decisions queued at each gate),
                  `typeIChecklist` (live); act5preset.ts = "Start at Act V" (the Act IV preset compressed to 2068, due dates
                  moved along with the calendar)
    eras.ts       era plans and jumps (like plans.ts; `eraStep`, the Act V planner incl. claims, `setLevers`), the last
                  climb (a jump that stops on K 1.0000 → `reachTypeI`), the era report + Bit's diary
    foundries.ts / asteroids.ts / swarm.ts (+ the Thermal Line, the dividend) / longevity.ts / earth.ts (garden ↔ forge)
                  / minds.ts / solarmax.ts / ending.ts (epilogue picks, campaign stats)   the Act V systems;
                  systemInit.ts, systemView.ts (read-only views for the solar-system view, orbit extras, map, dioramas,
                  portraits: castAge, bitForm, deskHolder), systemPreview.ts (a ready-made ~2084 world)
    upcoming.ts   read-only "Coming up": builds, upgrades, chips (whole orders, estimated), grid, the run, research, Act III
                  projects/bids/Council, soonest first; Acts IV–V return [] (they jump). `game.skipTo(day)` skips ahead
    network.ts    regional inference markets: private graph (fiber, leased/own cables), serve efficiency, contracts first
    stack.ts / politics.ts / capital.ts / rivals.ts / jobs.ts / finale.ts   (see SPEC §17)
  content/    data: regions, sites, facilities (with tiers), techs, companies, events (+ events2.ts for Act II), objectives,
              advisors, cities, difficulty.ts, fieldGuide.ts, changelog.ts (parses CHANGELOG.md), campusLines.ts (what the
              advisors say when you click them on campus)
              Act II: network.ts (cables), stack.ts (deals, mines, materials), politics.ts (export rules, treaties,
              sovereign deals), capital.ts (customers, Series B, board, finance), rivals.ts (rival prefs, startups), jobs.ts
              Act III: charter.ts (partners, contract kinds, HVDC routes, missions, bloc economics, factions, access,
              CHARTER numbers), council.ts (resolutions), events3.ts; sites.ts adds the Charter HQ, 12 megaproject
              sites (kind 'mega') and 5 launch candidates (kind 'launch')
              Act IV: planet.ts (PLANET numbers, provinces, the AIs, fusion designs, supergrid routes, priorities, the
              cast), events4.ts; the 12 Act IV contract kinds live in charter.ts (ACT4_KINDS); MOON_SITE (kind 'moon')
              is in SITE_BY_ID but not in SITES (no map marker, no sea route)
              Act V: system.ts (SYSTEM numbers, asteroids, seed places, era priorities, Solar Maximum fronts, CAST5 and
              successors), decisions.ts (the big decisions: EventDefs with `big: true`), events5.ts, epilogues.ts; the 9 Act V
              contract kinds live in charter.ts (ACT5_KINDS, `vstage`); SPACE_SITES (yards, ring, habitat, asteroids) are
              in SITE_BY_ID but not in SITES, like the Moon
  world/      map raster decode + sea router (A* over 0.5° ocean, carved canals, closable chokepoints) + sun position
  render/     What is left of the pixel renderer: the stage contract and the interface's pixel art (no Pixi, no scenes).
    stage.ts      `GameStage` / `GameScene` / `PixelPointer`: all `Game` knows about what draws it (Stage3D implements it)
    palette.ts    master palette + era grading (Smog & Silicon → Grid Rush → Solarpunk Bloom → Orbital Dawn → Swarmlight);
                  the 3D post pass reads the era, pieces and plans carry colours as palette indices
    pixels.ts     PixelCanvas: indexed-colour drawing (rect/line/ellipse/dither/text) baked with the era palette
    font.ts / globe.ts / worldMap/terrain.ts   pixel text, the pixel Earth and the terrain painter: the logo, the app
                  icons (tools/gen-assets.ts), site previews in panels and the end card draw with them
    endcard.ts    the Type I end card (480×270 PixelCanvas: the Sun, the swarm, the Earth, the run's numbers)
    sprites/portraits.ts   advisor + CEO portraits (procedural, with moods; Bit upgrades per model generation, up to
                  Bit-9; every partner CEO, the faction delegates, Ade and the three rival AIs have looks). Portraits take
                  an `age` (0–3: greying, elder, renewed) and Bit gens 10 (co-steward) and 11 (a free mind)
  render3d/   the renderer (three.js): see "The renderer" above
  game/
    game.ts       orchestrator: state, clock, scenes, slots, settings, tutorial, menu/tour, UI subscriptions, sound
    tutorial.ts   Bit's guided steps (20 since v0.9: the loop, the dock, a typical day, How to play): text, target (`data-tut`
                  attribute or `site:<id>`), done(g) check
    tips.ts       advisor tips: one-off nudges after the tutorial (slow clock, idle lab, empty hall, brownout, rentals, margin,
                  runway, the long Bit-2 wait) when a condition holds N game days; `meta.tipsSeen`; never stop the clock
    moments.ts    campus moments: a "take a look" card (the tip card, `kind: 'moment'`) when a big build or a megaproject
                  stage finishes; Acts I–III, one per 45 days, memo seeded from what exists so loads/skips don't replay
    chart.ts      the Stats panel's history: `sampleChart` writes one point a month to `meta.chart` (after ticks, skips, jump
                  and era steps, loads); old saves back-filled from the finance history
    briefings.ts  Act II (`b-*`), Act III (`c-*`), Act IV (`d-*`) and Act V (`e-*`) unlock briefings: the owning advisor's 1–3 step
                  spotlight, shown once (each act's briefings only fire in that act)
    showcase.ts   the fake "day 900" world the menu tour flies over
    tour.ts       TourDirector: globe glides + campus cuts behind the main menu; Act III–V shots borrow the preview
                  worlds (`act4PreviewState`, `act5PreviewState`) and the orbit and solar-system scenes
    playtest.ts   the playtest report (real time per act from `meta.log`, the notes) that Settings → Data → Log saves
  ui/         Preact DOM overlay (crisp text). components.tsx has useGame()/Icon/Portrait/Bar/Panel/Toggle/Choice/Window
    icons.ts      the 9×9 UI icons (top bar, panels, inline text); dockIcons.ts = the dock's 15×15 icons (13×13 art +
                  an automatic outline; grids, `disc`, `bevel`), drawn by DockIcon.tsx on a canvas at a whole number of
                  device pixels per art pixel (dock + How to Play's panel list; the Classic look keeps the 9×9 ones)
    panels/Act2Panels.tsx  Team (advisor jobs), Deals (supply · customers · companies), Blocs, Board & debt, Crunch tracker
    panels/Act3Panels.tsx  Charter (overview · contracts · missions · partners · world), Council, Charter desk,
                           own-run licence box, Threshold tracker, Charter HQ / megaproject / launch inspectors
    panels/Act4Panels.tsx  the Planet panel (overview · provinces · grid · fusion · space · climate), the plan screen,
                           the jump time-lapse overlay and report, the Heat Wall tracker, Act IV complete
    panels/Act5Panels.tsx  the System panel (overview · Earth · foundries · asteroids · swarm · minds · people), the era
                           plan, the era overlay and report, the Solar Maximum tracker, the Type I ending (cinematic,
                           epilogues, credits, stats, end card); game.ending drives it
    base.css      fonts, palette vars, frames, buttons — shared by the game and the website (`.frame` reads --frame-bg/-edge/-shadow)
    styles.css    the HUD (its `max-height: 520px` / narrow-window rules date from the phone days: harmless, never hit in
                  the app's 960×540 minimum window; leave or prune, don't extend)
    modern.css    the modern HUD layer (v0.9): softer frames, accent rules, hairlines, motion; every rule is scoped
                  `:where(html:not(.ui-classic))` (zero specificity, so variant rules still win); Settings → Display →
                  Interface look → Classic adds `html.ui-classic` and turns it off
    menu/         MainMenu, NewCompany, SettingsScreen (tabs; used in menu and in game), FieldGuide, InfoScreens,
                  HowToPlay (the handbook: content/howToPlay.ts; menu item, dock ? button, ? / F1, `game.openHowTo(topic)`)
    Tutorial.tsx  spotlight + Bit bubble; Overlays.tsx: FPS, update toast, decision pill, confirm
  landing/    website script + css: the hero (the pixel logo and the game's own globe: `globe3d.ts`, earth.ts on the
              coarse map, baked once the page is idle, fading in over a CSS dark planet; without WebGL a still,
              public/globe.png), then glass panels on a starfield: sticky nav, a bento of pillars, one row per act, a
              screenshot gallery with a lightbox, the K-scale bar, one download card per system filled from the latest
              GitHub release (the visitor's system lit, the hero button going straight to it), a compact What's New.
              There is no Play button: the game is not on the website. Shots are renders saved as 1600×900 WebP in
              public/screenshots/, shot in Chrome on the real GPU at the High preset by freezing menu-tour shots
              (`game.tour`: index − 1, `nextShot`, `running = false`) or `makeDioramaScene` + `aim`; the gallery's 2-wide
              shots need their order kept (see the comment in landing.css). The OG card and the still globe:
              `tools/og3d.mjs`. public/sw.js + the redirects in netlify.toml retire the old web game for browsers that
              had it installed (the worker deletes the old caches and unregisters itself): keep both for a good while
  platform/   platform.ts: the desktop shell (quit, fullscreen, in-app updates, opening links, saving files); a plain
              browser tab in dev falls through to downloads and document fullscreen. Files (`saveImage`,
              `saveTextFile` → a `Saved` path, `savedNote` for the message): a download link does nothing in the
              app's webview, so the app writes them itself (src-tauri/src/savefile.rs, the `save_file` command:
              pictures → Pictures/The Kardashev Project, the rest → Documents/The Kardashev Project, no overwrites)
  save/       save.ts (5 slots + index, migrate(), export/import), settings.ts (+ applyCssSettings), guide.ts (Field Guide unlocks),
              achievements.ts (per-device achievement store: unlocked, advisors met, places visited)
  audio/      All synthesised in WebAudio (v0.11: SPEC §29). engine.ts (the mix: sfx / music / ambience buses, each
              with a dry path and two shared sends (a generated hall, a tempo-synced echo), then sub filter → glue
              compressor → limiter → ceiling; one look-ahead timer for every sequencer; `renderOffline` for
              measurements), music.ts (which track plays, the `soundtrack` setting: cinematic by default,
              chiptune as the retro option; `setMusicMood`; the menu's theme.mp3 override), the cinematic score = score.ts
              (sequencer, voice-leading) + synth.ts (instruments) + cinematic.ts + tracks.ts (seven pieces on one
              theme: menu, era0–4, ending), chiptune.ts (the optional retro tracks), sfx.ts (layered effects in the
              music's key) + ui.ts (clicks and hover ticks on every button), ambience.ts (a living bed per place: map,
              campus, night, rain, coast, lake, Moon, space, habitat; the 3D campus says which through `ambience()`).
              Nobody can listen in QA: measure instead (the harness and rendered WAVs lived in the session's scratchpad;
              `renderOffline` + ffmpeg `ebur128` reproduce it: music −16 LUFS at full sliders, peaks under −1.5 dBFS).
src-tauri/    Tauri 2 desktop shell (one window loading play/index.html from dist/, the game bundled; capabilities = close, fullscreen,
              updater, restart, opener scoped to the ApexForge page). The AppImage bundles GStreamer plugins
              (`bundleMediaFramework`, plugin packages installed in CI): without them Ubuntu's bundled GStreamer finds
              none on Arch/Fedora and WebKit aborts the page when the game's audio starts (≤ 0.8.0). In-app updates: tauri-plugin-updater reads releases/latest/download/latest.json and
              only installs builds signed with the updater key (public half in tauri.conf.json plugins.updater).
              Since v0.9.4 the app downloads the file itself (src/fastdl.rs, the `update_fast` command: 2 MB pieces
              over 6 connections spread across the host's addresses, a stalled or crawling one swapped for a fresh
              one, keeping its bytes) and hands it to the updater's `install`, which checks the signature first;
              errors starting "fast download:" fall back to the updater's own download (`platform.ts#installDesktop`)
tools/gen-worldmap.mjs   Natural Earth → region/biome rasters (two LODs, RLE)
tools/gen-assets.ts      brand assets + desktop icons (ICO/ICNS writers in-file), all drawn natively per size
.github/workflows/desktop.yml   tag v* → Windows/macOS/Linux installers + latest.json on a draft GitHub release
```

## Conventions

- **Interface pixel art:** the logo, portraits, icons and the end card go through `PixelCanvas` with palette
  indices (`C.ink3`, `C.yel0`…), never raw hex, and are shown at a whole number of device pixels per art pixel
  (render3d/ui/art.css), never resampled. The world itself is 3D: `art3d/DIRECTION.md`, `art3d/PIECES.md`.
- **Sim/render split:** the sim must stay runnable in Node (tests). UI reads `game.state` (or `game.view`, which is
  the showcase world during the menu tour); mutations go through `game.*` action wrappers (they refresh stats,
  play sounds, toast errors and honour the confirm-spend setting).
- **Platform split:** game code never touches Tauri/Electron APIs directly — only `src/platform/platform.ts`.
- **Fonts:** `--font` (Atkinson Hyperlegible Next: all running text, buttons, numbers), `--font-label` (small labels;
  their rules set capitals + `--caps-track`), `--font-pixel` (Silkscreen: `h2` titles, the website's section titles
  and brand only). Never set a pixel font on body text. Settings → Accessibility → Text font switches `html.font-pixel`
  (the pre-0.4.2 Pixelify + Silkscreen look) or `html.font-system`. In-world text (map labels, logo) is PixelCanvas art.
- **Windows, not phones:** the app's window is at least 960×540; the HUD also has to hold up on big and high-DPI
  screens and on a Steam Deck (1280×800, touch). **Zoomed HUD boxes** (the `zoom: …--ui-zoom…` list in styles.css):
  size them in % of the screen, never `vh`/`vw` (zoom multiplies those; divide by `--z` if you must). Spotlight bubbles
  go through `SpotBubble`/`placeBubble` (Tutorial.tsx), which measure and keep them on screen.
- **Content first:** new facilities/techs/events/sites/objectives are data in `src/content/`. Events are
  `EventDef`s with `weight`/`setup`/`choices[].apply` — keep choices to real trade-offs, give 2 advisor lines, and
  price crises with `cc(s, n)` so difficulty scales them.
- **Tutorial targets:** UI elements Bit (and the Act II briefings) point at carry `data-tut="..."`; keep them when refactoring panels.
- **Teaching the game (v0.9):** three layers. Bit's tutorial (first 10 minutes), How to Play (`content/howToPlay.ts`: topics
  by act, the core loop, a typical day + each act's rhythm, every panel, tips; text with `- ` bullets, `1. ` steps, `> ` tips,
  `**bold**`, `[Key]`) and advisor tips (`game/tips.ts`). A new panel gets a row in `PANEL_GUIDE`; a new act a topic and an
  `ACT_RHYTHM` entry. Keep tips one-off and fixable with one click.
- **Act gating:** Act II content carries `act: 2` and/or `phase: n` (facilities, techs, events, objectives, sites, jobs,
  deals). Gate new behaviour on `s.act >= 2`. M5's balance pass retuned Act I on purpose (first hall 10 months,
  Standard $450M / Hard $380M seed): the Act I bot finishes on day 686 (v0.8.0); later changes should still be deliberate.
- **Act II prices:** Act I events use `cc(s, n)`, which scales up in Act II; Act II events (events2.ts) use `c2(s, n)`,
  written at Act II scale.
- **Act III gating:** `s.charter` exists only from Act III (null before). Act III phases live in `s.charter.phase`;
  `s.phase` stays 5 so every Act II gate stays open. Act III content uses `act: 3` and `cphase` (events, techs, sites,
  resolutions, missions, desks). Charter money is separate from company cash: `chSpend`/`chEarn` and the Charter ledger;
  Act III events price the Charter side with `ch3(s, n)` and the company side with `c2(s, n)`. New formula hooks
  (`grid:price`, `grid:carbon`, `market:hbm`, `market:pkg`, `charter:build`, `world:growth`) are modifiers that only
  exist in Act III, so Acts I–II stay byte-identical (v0.8.0 bots: Act I day 686; Act II IPO Jan 2033, 3.8 years).
- **Act IV gating:** `s.planet` exists only from Act IV (null before); `s.charter.phase` stays 6. Act IV content uses
  `act: 4` and `stage` (contract kinds, techs, resolutions, events, objectives). New hooks (`charter:space`,
  `orbit:debris`, `grid:faults`, `prov:<region>`, `heatwall:<front>`, the Act IV growth parts, gridYield in siteYield)
  only act when `s.planet` exists, so Acts I–III stay byte-identical (v0.8.0 Act III bot: renewal Jan 2043). Act IV
  partners carry `act: 4` and join the Charter at beginAct4. Act IV events price the Charter side with `ch4(s, n)`
  (2045 scale). **Autopilot takes the first enabled choice during jumps**, so put the sensible default first.
  Checklist objectives are `live` (never ticked off; shown from `o.done(s)`).
- **Act V gating:** `s.system` exists only from Act V (null before); `s.planet.stage` stays 5. Act V content uses `act: 5`
  and `vstage` (contract kinds, techs, random events) or `phase` = the system stage (objectives). New hooks
  (`foundry:growth`, `foundry:drift`, `minds:mood`, `longevity:rate`, `solarmax:<front>`, the Act V growth parts and
  wellbeing parts, waste-heat warming, the space power in K) only act when `s.system` exists, so Acts I–IV stay
  byte-identical (v0.8.0 Act IV bot: 16–18 years; Act V bot: Type I Nov 2094). Act V partners carry `act: 5`. Act V events price the Charter side with
  `ch5(s, n)` (2068 scale) and voice retired advisors through `desk(s, id)` (their successor). Big decisions go in
  `content/decisions.ts` with `big: true`; the first enabled choice is the autopilot default.
- **Company vs Charter:** while the blind trust is on, `game.*` company wrappers refuse with a toast (`locked()`); the
  sim actions stay open so advisors and the trustee can act.
- **Event cards (v0.8.0, `sim/events.ts`):** no random card while a finale runs (`finaleRunning`: the Crunch, Charter
  phases 4–5, the Heat Wall, Solar Maximum) or during Bit's Act I tutorial. Company cards are an explicit list
  (`COMPANY_EVENT_IDS` = Act I + Act II defs, never `big`): from Act III they only roll while you run the company
  (`runsCompany`), and queued ones are answered by the trustee / new owners (first enabled choice, a "🗂" news line).
  Act V's pool is its `vstage` cards plus `ACT5_EXTRA`, rolled half as often; earlier acts' leftovers carry `actOnly`.
  A card must touch something the player owns (or say "Noted" and cost nothing); the highlighted choice is the first
  enabled one; a card with every choice disabled gets a Continue button (`dismissEvent`) — never strand the player.
- **Skip-ahead (v0.9.1):** `game.skip` runs ticks in ~12 ms slices per frame until the target day; a card, a block,
  game over or any speed button ends it and the player's speed comes back. Acts I–III only, never in the tutorial.
- **Clock & time away:** anything that blocks the clock pauses it with `autoPaused` and it resumes by itself when the
  block goes away; `setSpeed` is the player's choice. Skips run in ~14 ms slices (`stepBudgeted`); jumps advance per
  1/60 s of real time. Offline catch-up (time away with the app closed) only in Acts I–III, only if the clock was running (`meta.pausedAtSave`) and
  nothing is waiting (`offlineAllowed`); research picks the cheapest project while away. Toasts: errors only during
  the tutorial (achievements held to its end).
- **Goals:** numeric objectives carry `progress(s) → { frac, text }`: the goal card shows a bar (hint in the tooltip),
  the Goals panels show it under the hint. Acts II–III list the phase's headline goals first.
- **Input & frames:** scenes implement `pointerCancel` (a cancelled press is never a tap) and `busy()` (camera
  moving). Switch scenes with `stage.setScene(scene, zoom)` (zoom 1 for the wide views, 2 for campuses: it only sizes
  the interface's `--px` hairlines). Frame pacing lives in `game/shell.ts` (60 fps cap, 30 with Battery saver or when
  calm).
- **Settings:** add the field + default in `save/settings.ts`, the control in `ui/menu/SettingsScreen.tsx`, and apply
  it in `game.updateSettings` (CSS-level ones in `applyCssSettings`).
- **Save compatibility:** adding optional fields → default them in `save/save.ts#migrate`. Breaking changes →
  bump `SAVE_VERSION` in `sim/state.ts` and migrate.
- **Numbers:** real units underneath (MW, FLOP, $), icons/short values up front, detail in `data-tip` tooltips.
- Run `npm test` after sim changes — the Act I bot test catches balance regressions (Act I should finish in ~2–4 game years).

## Releasing

1. Bump `version` in `package.json` (the game, the website and the desktop builds all read it) and add a
   `## x.y.z — Title (date)` section to `CHANGELOG.md` (it feeds What's New in game and on the website).
2. Commit and push `main` → Netlify deploys the website (`npm run build:site`). The game itself reaches players only
   through a release.
3. `git tag vx.y.z && git push origin vx.y.z` → GitHub Actions builds the installers into a **draft** release. Publish
   the draft and the website's download cards pick it up.
4. Publishing the draft also updates the installed apps: the game offers the new version in a toast (the
   `updater-json` job's `latest.json`). Updates are signed in CI from the secrets `TAURI_SIGNING_PRIVATE_KEY` and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; the key lives in `~/.config/kardashev-project/tauri/` (kardashev-updater.key +
   updater-password.txt). **Never lose or change it**: installed apps only accept updates signed with it.
   (The Android keystore in `~/.config/kardashev-project/android/` and the `ANDROID_KEYSTORE_*` repo secrets are left
   over from the retired Android app: unused, leave them alone.)

The theme song: drop an MP3 at `public/audio/theme.mp3` and the main menu plays it (the game's own menu theme is the fallback).

## Adding things (cheat sheet)

| Want | Edit |
|---|---|
| New facility type | `FacilityType` in `sim/types.ts`, `content/facilities.ts`, power/compute effect in `sim/power.ts`/`sim/ai.ts`, a builder in `render3d/campus/registry.ts` (`art3d/PIECES.md`), its globe marker in `render3d/globe/markers.ts`; UI icon in `ui/icons.ts`, `FAC_ICON` in `ui/Inspector.tsx` |
| New site | `content/sites.ts` (port must reach the world ocean — `npm test` checks every supplier→site route) |
| New tech | `content/techs.ts` (+ a `TechKey` if it needs a new multiplier, read via `techMult`) |
| New event | `content/events.ts` |
| New objective / act goal | `content/objectives.ts` |
| New Field Guide entry | `content/fieldGuide.ts` (body, in-game note, unlock rule) |
| Advisor's campus line | `content/campusLines.ts` (act range per line) |
| Achievement | `content/achievements.ts` (`done(s)` check, or `done: null` + `game.achieve(id)`; ids are for Steam later) |
| Sandbox switch or slider | `SandboxOpts` in `sim/types.ts`, read it in the sim formula, add the control in `ui/menu/SandboxControls.tsx` |
| Province governor | `GOVERNORS` in `content/planet.ts` + a look in `GOVERNOR_LOOKS` (`render/sprites/portraits.ts`) |
| Era music / place ambience | the score: `audio/tracks.ts` (a `TrackDef` per piece: key, tempo, sections, instruments) · the optional chiptune: `audio/chiptune.ts` · beds: `audio/ambience.ts` |
| Sound effect | a `SoundId` + its recipe in `audio/sfx.ts` (layers: transient, body, tail), then `sfx(id)` where it happens |
| People (models, clips, a working day) | `render3d/models.ts` (PEOPLE, TOWNSFOLK), `render3d/campus/people.ts` + `paths.ts`; `tests/render3d-people.test.ts` |
| Campus behaviour, traffic | `render3d/campus/life.ts`, `vehicles.ts` |
| New difficulty / founder perk | `content/difficulty.ts` (founder mods feed `techMult`) |
| Tutorial step | `game/tutorial.ts` (+ a `data-tut` attribute on the target) |
| Dock icon | `ui/dockIcons.ts` (keep a 9×9 icon of the same name in `icons.ts` for Classic); look with `PREVIEW_DIR=… DOCK_ZOOM=a,b npx vitest run tests/dock-icons.test.ts` |
| Menu tour shot | `game/tour.ts` (`SHOTS`; a campus shot has a `light` and a camera `move`) and, for a new campus, `game/showcase.ts` |
| A time of day's look | `KEYS` in `render3d/campus/sky.ts` (by sun altitude: sky, key, fill, haze, exposure) |
| A lamp that lights its surroundings | `lightPool(parent, x, y, z, r, poolMat(colour))` (kit.ts): it joins the lamp field |
| Re-tune the economy | `sim/model.ts` constants, `content/facilities.ts`, `content/companies.ts` |
| Facility tier / new Act II facility | `content/facilities.ts` (`tiers`, `act`, `phase`, `needs`, `slots`); art in `render3d/campus/` (`act1.ts`, `plants2.ts`, `registry.ts`) |
| Supply deal, mine | `content/stack.ts` |
| Cable system / landing station | `content/network.ts` + a `landing(...)` row in `content/sites.ts` |
| Export rule, treaty, sovereign deal | `content/politics.ts` |
| Contract customer, board/finance numbers | `content/capital.ts` |
| Startup for sale, rival build habits | `content/rivals.ts` |
| Advisor job | `content/jobs.ts` + its logic in `sim/jobs.ts` |
| Act II event / chain | `content/events2.ts` (chain with `schedule(s, id, days)`) |
| Act II briefing | `game/briefings.ts` (+ `data-tut` targets) |
| Re-tune Act II pacing | `tests/act2.test.ts` + `tests/helpers/act2bot.ts`; `ACT2_ALLOCATION`, `inferPriceTrend`, `MODEL_PLAN` in `sim/model.ts`; rival pace in `sim/ai.ts#tickRivals` |
| Partner company | `PARTNERS` in `content/charter.ts` (traits, quirk, CEO, colour, pitches) + a CEO look in `render/sprites/portraits.ts` |
| Contract kind | `CONTRACT_KINDS` in `content/charter.ts` (+ its completion effect in `sim/charter.ts#completeProject`, access gain, its pieces in `render3d/campus/plan.ts` + `sets/`) |
| Megaproject site / HVDC route / launch site | `megaSite(...)` / `launchSite(...)` in `content/sites.ts`; `HVDC_ROUTES` in `content/charter.ts` |
| Mission | `MISSIONS` (+ `MISSION_MODS`) in `content/charter.ts`, its reward in `sim/charter.ts#completeMission` |
| Council resolution | `content/council.ts` (+ its effect in `sim/council.ts#applyResolution`) |
| Charter desk job | `DESKS` + its logic in `sim/desk.ts` |
| Act III event / chain | `content/events3.ts` |
| Act III briefing | `game/briefings.ts` (`c-*`, + `data-tut` targets) |
| Re-tune Act III pacing | `tests/act3.test.ts` + `tests/helpers/act3bot.ts`; `CHARTER` numbers, contract `value`/`days`, world growth in `sim/world.ts`, world alignment drift in `sim/frontier.ts` |
| Fusion design | `FUSION_DESIGNS` in `content/planet.ts` (+ a partner in `PARTNERS` with `act: 4`, a CEO look, `DESIGN_BUILDER` in `render3d/campus/planKit.ts`, plant art in `render3d/campus/sets/fusion/`) |
| Supergrid route | `SUPERGRID_ROUTES` in `content/planet.ts` |
| AI that can run provinces | `AIS` in `content/planet.ts` + an `AiId`, a face in `portraits.ts` |
| Act IV event / chain | `content/events4.ts` (first choice = the autopilot default) |
| Act IV contract kind | `CONTRACT_KINDS` (+ `ACT4_KINDS`) in `content/charter.ts`, rules in `sim/charter.ts` (canPost, contractValue, completeProject), a planner wish in `sim/plans.ts`, a Planet tab poster |
| Re-tune Act IV pacing | `tests/act4.test.ts` + `tests/helpers/act4bot.ts`; `PLANET` numbers (growth cap, tritium, goals, stageMaxDays), planner limits in `sim/plans.ts` |
| Big decision (Act V) | `content/decisions.ts` (`big: true`, the default first; set a field in `s.system` and read it in the sim + epilogues) |
| Asteroid / seed place | `ASTEROIDS` / `SEED_PLACES` in `content/system.ts` (asteroids get a diorama site automatically) |
| Epilogue card | `EPILOGUES` in `content/epilogues.ts` (one card per topic: the first variant whose `when` holds) |
| Act V contract kind | `CONTRACT_KINDS` (+ `ACT5_KINDS`, `vstage`) in `content/charter.ts`, rules in `sim/charter.ts`, a wish in `sim/eras.ts`, a System tab poster |
| Re-tune Act V pacing | `tests/act5.test.ts` + `tests/helpers/act5bot.ts`; `SYSTEM` numbers (doubling by dial, seed size, segments, dividend, eraStopK), the reach slowdown in `sim/foundries.ts#growthMult`, planner limits in `sim/eras.ts` |

## Known gaps / next (see SPEC §12, §16, §17, §18, §19, §20)

**SPEC §27 = the Steam ideas list** (ten proposals from 2026-11-08, not agreed yet): the reference for Steam planning.

**Next:** v0.12.0 "All In" (SPEC §30) is built on the local branch `desktop-only`: ship it when the user says so
(merge, push, tag; the website and the release must go out together, because the website no longer offers the web
game and the 0.11.0 installers still open the pixel edition by default). The user played 0.11.0 on 2026-11-11 and
is happy with the look, the speed and the sound. Two questions are still unanswered (SPEC §30): redo the pixel-art
logo, app icon, portraits and end card in the 3D style or keep them; keep or drop the Chiptune soundtrack, the
Classic interface look and the Pixel text font.
**Versions (the user, 2026-11-11):** keep bumping small versions while the game is being perfected; v1.0.0 only when
they start the Steam page. Nobody else has the game, so there are no other players' saves or installs to protect.
They test Windows themselves (dual boot); there is no Mac, so macOS stays unverified.
Then, when they are fully happy with the game: their playthrough (Settings → Gameplay → Playtest notes, J to note;
Data → Log), the retune from the log and v1.0.0 (SPEC §21–22), and Steam prep (SPEC §27: controller and Steam Deck, a demo, the store page, an
Electron/Steamworks wrapper if Tauri can't do the overlay). Later: Type II as an Act VI that continues a finished save
(SPEC §20 hooks), the real theme song, code signing (Windows/macOS).

**Still open:**
- From SPEC §29: a Settings switch to run the app on the discrete GPU on hybrid laptops (today it renders on the
  integrated one; `__NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia` works by hand on Linux); Act III's
  satellite, beam and liftoff on the globe were not
  exercised; power beams in the ending only show with beam capacity; the cinematic is capped at 16 s by `tickEnding`;
  the 4K-at-150% interface survey was partial.
- M5 (SPEC §21): steps 1–7 shipped in v0.7.0; v0.8.0 (SPEC §22) is the whole-game audit and its fixes. Waiting for the
  user's full playthrough, then the retune and v1.0.0. Known numbers to watch in the retune: Act I's long wait for
  Bit-2 (~415 days with nothing to research), Act II now 3.8–5 years (the bot stopped falling into the export trap),
  Act IV's bot reaches its Heat Wall on the stage-3 limit rather than the full checklist.
- The Windows and macOS installers build in CI but have never been launched on a real machine (in-app updates and
  the `save_file` command there are untested too; CI also signs the .deb, untested). The user can test Windows. The Linux AppImage runs on the dev machine (Omarchy/Arch,
  installed to ~/Applications with a launcher entry).
- Leftovers from the phone days that still work and were left alone: the HUD's compact CSS for short or narrow
  windows, touch input, the safe-area variables. Prune only with a look at the Steam Deck.
- AppImages up to 0.8.0 crash on non-Ubuntu distros at the first click (no GStreamer plugins), so they can't update
  themselves: those users reinstall by hand. The app checks ~6 s after launch, then every 6 h (the user is happy with
  that); a launch in the first minute after publishing can miss a release (GitHub's latest/download lags), so relaunch
  to test. `check()` errors are swallowed in platform.ts. To debug the desktop page:
  `WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:9339` + the WebKit inspector protocol over
  ws://127.0.0.1:9339/socket/1/1/WebPage (Target.sendMessageToTarget → Runtime.evaluate, Page.snapshotRect).
- Desktop update test (v0.9.4): `cd src-tauri && cargo test --lib fastdl` (fake slow/stalled/broken servers on
  127.0.0.x), `-- --ignored --nocapture` fetches the real latest release and checks its signature. End to end: `npx tauri
  build --debug --no-bundle --config '{"version":"0.9.2","identifier":"com.lonefox.kardashevproject.updatetest"}'`, copy
  the binary to a scratch dir as `kp-test.AppImage` (an unbundled build installs over its own file), run it with
  scratch `XDG_DATA_HOME`/`XDG_CONFIG_HOME`/`XDG_CACHE_HOME` (the restarted real AppImage inherits them, so the real saves
  stay untouched) and the inspector env var, then `game.installAppUpdate()`. 2026-11-08: 93 MB in 5.4 s, restarted as 0.9.3.

**Balance is deliberately deferred** to a pre-launch beta (full playthrough + beta testers, then a rebalancing pass
across all acts). Until then, balance bots are guard rails only: every act must be completable with no stalls or NaNs,
and Act I must stay unchanged. Don't spend milestone time tuning numbers.
