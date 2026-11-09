# The Kardashev Project — dev guide

Pixel-art management sim about the AI boom. Design doc: `SPEC.md` (pillars, acts, decisions log).
Current build: **v0.10.0 "Third Dimension"** (the 3D edition in beta, opt-in via Settings → Display → Edition: SPEC §28) on
top of v0.9.4 "Fast Lane" (desktop updates download in pieces over six connections: SPEC §26b) on top of
v0.9.3 "Clear Signs" (new 15×15 dock icons drawn in whole device pixels, the dock badge fix, the desktop
updater's retry on a stalled download: SPEC §26) on top of v0.9.2 "Pocket Size" (the phone pass: tutorial bubbles that fit, a two-column phone menu, no double
cutout gap in the Android app, a top bar that fits, toasts over the ticker: SPEC §25) on top of v0.9.1 "Skip Ahead"
(Coming up + skip-ahead, Act I side goals, Stats, campus moments: SPEC §24) and
v0.9.0 "Easy Start" (the modern HUD layer, How to Play, a 20-step tutorial, advisor tips: SPEC §23), v0.8.1 (the Linux AppImage sound fix) and v0.8.0 "Stakes & Polish" (a whole-game audit for fun, bugs and speed: SPEC §22) and v0.7.0 "Sandbox &
Soundtrack" (M5 steps 1–7) and v0.6 "Type I" (M4.5): the whole v1 campaign is playable end to end — Acts I (The Garage), II (The
Scale-Up), III (The Charter), IV (Planetary) and V (Type I, ending on Kardashev 1.0000) — on top of v0.2 "The Front Door" (website, main menu, tutorial, settings, save slots, PWA and
desktop builds). v0.6.1 "Signs of Life" redrew the diorama people (people.ts, life.ts), lighting and depth, decluttered the world map
and cleaned up the off-world dither. v0.4.2 "Easy Reading" added the readable font (Atkinson Hyperlegible Next), phone fullscreen and the
Android app; v0.5.1 added in-app updates for the installed desktop and Android apps (an Update toast in the game).
Live at https://thekardashevproject.netlify.app (Netlify auto-deploys `main`).

## The 3D edition (branch `3d`, SPEC §28)

A second front end on the same game: `play3d/index.html` → `src/main3d.ts` builds the same `Game` with
`render3d/stage3d.ts` (three.js) and 3D scenes behind `SceneFactory`; sim, UI, tutorial, saves and audio are shared,
so sim/UI changes land in both. Both stages meet `GameStage`/`GameScene` (render/stage.ts); keys and the frame loop are
`game/shell.ts`. Settings → Display → Edition switches between /play/ and /play3d/ (same saves) and is remembered
(`settings.edition`: the apps always open /play/, whose boot hands over to /play3d/). 3D detail = `render3d/quality.ts`
(shadows, AO at half resolution, resolution, MSAA on high only / FXAA below, plants, bevel segments). Auto = low on
phones, high only when the browser names a discrete GPU (WebKit never does), else medium, plus adaptive resolution in
`stage3d.ts` (one frame timed by GPU syncs every 0.7 s; not the frame rate: WebKit caps rAF at 30 in low-power mode).
Measured on the dev laptop's Intel iGPU on battery, ~1.1 MP: scene ~18 ms, full-res AO +24, 4× MSAA +11, bloom +3.5.
- **Scenes:** `globe/` (globeScene: Earth from `earth.ts` = biome/land/relief/region textures + shader with real-time
  sun, city lights, clouds, region tints, heat haze; `layers2/3/45.ts` = Act II cables/fiber/lanes · Act III megaproject
  patches, HVDC, satellite, liftoff · Act IV–V supergrid, fusion/rectenna glows, banners, garden/forge), `campus/`
  (campusScene: every site — build sites on plots (`layout.ts`), view-only places (`viewOnly.ts`: Act II set pieces via
  `setPiecesFor`, Act III–V via the shared planner `act3Plan` + `act3Key` rebuilds), sceneries: campus, geneva (lake),
  offshore, launch coast, moon, space (no ground), habitat (`habitatShell.ts`), asteroid (curved ground); `ground.ts` =
  ten backdrops to the horizon, `sky.ts` (real sun at the site, weather, lunar/space/habitat modes), `weather.ts`,
  `life.ts` (rigged people, advisors, Bit, traffic)), `orbit/orbitScene.ts` (Act IV–V), `system/systemScene.ts`
  (Act V + the Type I pull-back), the same TourDirector (every shot). Scenes free their GPU memory in `destroy()` via
  `disposeObject` (kit.ts: skips anything with `userData.shared`, e.g. model materials, cached kit textures, the
  Earth's textures); a campus rebuild frees the old world too.
- **Pieces:** `campus/registry.ts` maps facility types (`act1.ts`, `plants2.ts`) and set pieces (`industry.ts`,
  `act3sets.ts` → `sets/*.ts`; footprints in `act3sizes.ts`) to builders returning `Piece` (pieces.ts). Conventions
  and the lab: `art3d/PIECES.md`; lab page `/play3d/lab.html?piece=…|set=…` (dev). Art direction: `art3d/DIRECTION.md`.
- **Meshy:** `tools/meshy.mjs` (concept image first with one style brief; `--char` = rigged people), `tools/glb-tex.mjs`
  shrinks textures into `public/3d/models/` (people: the `_walk.glb`, `--size 1024`); models load on demand
  (`models.ts`: PEOPLE at boot, advisors/astronaut/TOWNSFOLK when a scene needs them; the lab's `?people=1|town`
  lines them up). The service worker caches `/3d/models/*.glb` at run time (not precached).
- **QA:** headless Chrome + `--use-angle=swiftshader`; stub Vite's `@vite/client` with a working `updateStyle` (else no
  CSS) when other edits would hot-reload the page; campus `aim(x, z, dist, yaw, pitch)`; `game.updateSettings({ dayNight:
  false })` pins local noon; `tests/render3d-layout.test.ts` checks every place's layout. Adaptive resolution is off
  under automation (`navigator.webdriver`). Real-GPU timing: Chrome with `--use-angle=gl-egl` (the Intel iGPU), or the
  desktop app (`npx tauri build --debug --no-bundle --config '{"identifier":"…test3d","build":{"beforeBuildCommand":""}}'`
  after `npm run build`, scratch XDG dirs + the WebKit inspector, see the update test below; WebKit's Runtime.evaluate
  doesn't await promises). `window.quality3d` is the live detail level. Android: the emulator's WebView renders WebGL
  but CDP screenshots leave the canvas black — use `adb exec-out screencap -p`.

## Commands

```bash
npm run dev           # Vite dev server → http://127.0.0.1:5317 (landing at /, game at /play/)
npm run build         # typecheck (tsc 7) + production build → dist/ (both pages + service worker)
BALANCE=1 npx vitest run tests/balance.test.ts   # the balance report: every act's bot × Relaxed/Standard/Hard × seeds
                      # (BALANCE_ACTS=4,5 BALANCE_SEEDS=21,7 BALANCE_DIR=…; Act I searches 24 plans per run)
npm test              # vitest: sim determinism, Act I bot, Act II bot (preset → IPO), Act III bot (preset → renewal),
                      # Act IV bot (preset → jumps → the Heat Wall), Act V bot (preset → eras → Solar Maximum → Type I),
                      # offline, saves, routing, map + diorama scenes
npm run gen:map       # rebuild src/content/generated/worldmap.bin from Natural Earth (tools/raw/)
npm run gen:assets    # re-render icons, favicon, logo, globe, OG image + src-tauri/icons from game code
npm run desktop:dev   # Tauri window on top of the dev server
npm run desktop:build # local desktop build (Linux: add `-- --bundles deb` to skip the AppImage)
PREVIEW_DIR=/some/dir npx vitest run tests/preview.test.ts tests/routing.test.ts tests/act2-preview.test.ts tests/diorama-preview.test.ts \
  tests/act3-map-preview.test.ts tests/act3-diorama-preview.test.ts tests/act4-map-preview.test.ts \
  tests/act4-orbit-preview.test.ts tests/act4-diorama-preview.test.ts tests/act4-portraits.test.ts \
  tests/act5-system-preview.test.ts tests/act5-map-preview.test.ts tests/act5-diorama-preview.test.ts tests/act5-portraits.test.ts \
  tests/people-preview.test.ts tests/map-declutter.test.ts
                      # render map / portrait / route / Act II–V map / diorama / orbit / solar-system previews to PNG,
                      # the people contact sheet and live MapScene snapshots (live-*.png, via tests/helpers/mapshot.ts)
cd android && KP_ANDROID_KEYSTORE=~/.config/kardashev-project/android/kardashev-release.p12 \
  KP_ANDROID_KEYSTORE_PASSWORD=$(cat ~/.config/kardashev-project/android/keystore-password.txt) ./gradlew assembleRelease
                      # signed Android APK → android/app/build/outputs/apk/release/ (needs JDK 17 + Android SDK:
                      # JAVA_HOME / ANDROID_HOME; CI has both). Without the KP_ vars it builds unsigned.
```

In the browser console, `window.game` is the live `Game` (state, actions, `setEraOverride(0..3)`, `enterDiorama(siteId)`,
`showMenu()`, `tutorialRestart()`, `replayBriefings()`, `startNew({ ..., act3: true })`). To fast-forward in QA, import
`/src/sim/tick.ts` in the console and call `tick(game.state, game.ctx)` in a loop (then `refreshStats` + `game.notify()`):
an automated or off-screen Chrome window throttles requestAnimationFrame to ~1 fps, which also throttles the game clock.
The test bots import fine in the console too (`await import('/tests/helpers/act3bot.ts')` → `botDay3(game.state)` before
each tick) to play an act forward on autopilot.
Gameplay screenshots for the website: in dev, the page can POST a PNG to `/__screenshot?name=<name>` (Content-Type `image/png`, same origin only) and it lands in `public/screenshots/`.

## Architecture

```
index.html          the website (landing page) → src/landing/
play/index.html     the game → src/main.ts
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
  render/     Pixi v8. stage.ts = low-res render target scaled by whole numbers (one pixel size everywhere) + fade overlay
    palette.ts    master palette + era grading (Smog & Silicon → Grid Rush → Solarpunk Bloom → Orbital Dawn → Swarmlight)
    endcard.ts    the Type I end card (480×270 PixelCanvas: the Sun, the swarm, the Earth, the run's numbers)
    pixels.ts     PixelCanvas: indexed-colour drawing (rect/line/ellipse/dither/text) baked with the era palette
    globe.ts      orthographic pixel Earth (landing hero, icons, OG image) with real sun + city lights
    worldMap/     terrain painter, night terminator + city lights, MapScene (markers, links, ships, input, cinematic glides),
                  act2Layers.ts (Act II site visibility, landing/mine/rival markers, cables, fiber, cosmetic shipping lanes),
                  act3Layers.ts (Charter HQ, megaproject markers + overlays, HVDC links, launch, bloc anchors, satellites),
                  declutter.ts (pure: label placement without overlaps, crowded markers nudged apart; mapScene's anchorPx)
    diorama/      side-view campus scenes: dioramaScene.ts (scrolling wide campuses, view-only supplier/mine/landing scenes;
                  night light pools, haze, contact shadows, the near foreground, hall fill / brownout beacons / opening flash),
                  people.ts (8×14 outlined figures: 4-frame walk with a bob, poses, looks by job and era, the advisors, Bit,
                  speech bubbles; `stampPerson` for people baked into set pieces), life.ts (the crowd: doors, chats, phones,
                  crews, carrying, reactions to toasts, named advisors you can click, the dog, cyclists, birds, drones),
                  art.ts (backdrops + the makeArt switch), plants.ts (Act II plants), industry.ts (suppliers, mines,
                  landing stations, rival campuses), sizes.ts (per-tier sizes), layout.ts (plots), campusArt.ts, draw.ts;
                  Act III: act3Pieces.ts (planner + art dispatch + `act3Key`), charterHQ.ts (Geneva), mega.ts (megaprojects
                  by stage and kind, offshore North Sea), launch.ts (pad, rocket, liftoff loop), act3kit.ts, scenery.ts (bands)
                  Act IV: moon.ts (the Moon base by stage, the mass driver, lunar light), fusion.ts (five plant designs,
                  air-capture farms); spaceports extend launch.ts
    orbit/        Act IV's orbit view: orbitScene.ts (Scene), orbitArt.ts (pure drawing), orbitSprites.ts; Act V adds the
                  L4/L5 yards, habitats, beam relays and the storm (`orbitExtras`)
    system/       Act V's solar-system view: systemScene.ts (Scene; `{ cinematic }` = the Type I pull-back,
                  `cinematicDone`), systemArt.ts (pure drawing); the Earth & Moon lens; click opens space dioramas
    sprites/      map icons, advisor + CEO portraits (procedural, with moods; Bit upgrades per model generation, up to Bit-9;
                  every partner CEO, the faction delegates, Ade and the three rival AIs have looks), charterIcons.ts
                  (Act III map sprites), act4Icons.ts (Act IV map sprites), act5Icons.ts (beam fields); worldMap/act4Layers.ts
                  and act5Layers.ts (garden/forge tints, beam fields) are the Act IV–V map layers. Portraits take an `age`
                  (0–3: greying, elder, renewed) and Bit gens 10 (co-steward) and 11 (a free mind)
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
    tour.ts       TourDirector: map glides + campus cuts behind the main menu; Act III–V shots borrow the preview
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
    modern.css    the modern HUD layer (v0.9): softer frames, accent rules, hairlines, motion; every rule is scoped
                  `:where(html:not(.ui-classic))` (zero specificity, so variant rules still win); Settings → Display →
                  Interface look → Classic adds `html.ui-classic` and turns it off
    menu/         MainMenu, NewCompany, SettingsScreen (tabs; used in menu and in game), FieldGuide, InfoScreens,
                  HowToPlay (the handbook: content/howToPlay.ts; menu item, dock ? button, ? / F1, `game.openHowTo(topic)`)
    Tutorial.tsx  spotlight + Bit bubble; Overlays.tsx: rotate-phone, FPS, update toast, decision pill, confirm
  landing/    website script + css (the 2026 redesign: the hero's logo and spinning globe, then glass panels on the starfield:
              sticky nav, a bento of pillars, one row per act, a screenshot gallery with a lightbox, the K-scale bar, install +
              GitHub-release downloads, a compact What's New). Shots live in public/screenshots/ (campus-day.png and map.png
              also feed the PWA manifest); the gallery's 2-wide shots need their order kept (see the comment in landing.css)
  platform/   platform.ts: browser vs installed PWA vs desktop app (quit, fullscreen, install prompt, service worker)
  save/       save.ts (5 slots + index, migrate(), export/import), settings.ts (+ applyCssSettings), guide.ts (Field Guide unlocks),
              achievements.ts (per-device achievement store: unlocked, advisors met, places visited)
  audio/      engine.ts (context + master/music/sfx buses), sfx.ts (blips, noise bursts: launches, the mass driver, jumps,
              stings), music.ts (menu theme MP3 or chiptune fallback; a chiptune track per era in sections, following the
              palette), ambience.ts (a sound bed per place: map, campus, night, rain, coast, lake, Moon, space, habitat)
src-tauri/    Tauri 2 desktop shell (one window loading play/index.html, the game bundled; capabilities = close, fullscreen,
              updater, restart, opener scoped to the ApexForge page). The AppImage bundles GStreamer plugins
              (`bundleMediaFramework`, plugin packages installed in CI): without them Ubuntu's bundled GStreamer finds
              none on Arch/Fedora and WebKit aborts the page when the game's audio starts (≤ 0.8.0). In-app updates: tauri-plugin-updater reads releases/latest/download/latest.json and
              only installs builds signed with the updater key (public half in tauri.conf.json plugins.updater).
              Since v0.9.4 the app downloads the file itself (src/fastdl.rs, the `update_fast` command: 2 MB pieces
              over 6 connections spread across the host's addresses, a stalled or crawling one swapped for a fresh
              one, keeping its bytes) and hands it to the updater's `install`, which checks the signature first;
              errors starting "fast download:" fall back to the updater's own download (`platform.ts#installDesktop`)
android/      the Android app: one WebView activity (LauncherActivity.java, no libraries) that runs the LIVE site at
              /play/?app=android full screen and landscape, in its own process. Not a Trusted Web Activity any more
              (v0.5.0): Xiaomi's MIUI/HyperOS silently blocks the hand-off to Chrome, so the icon did nothing. The page
              gets window.KardashevAndroid.saveFile (export a save) and .saveImage (v0.6.0: the end card as base64 PNG) and
              calls window.kpBack (the back gesture), all wrapped in platform.ts (saveTextFile, saveImage, onHostBack). In-app updates (v0.5.1): the page compares the app's
              version (user agent `KardashevAndroid/x.y.z`) with the latest GitHub release and calls installUpdate(url):
              the app downloads the APK (only from this repo's releases) into its cache, UpdateProvider serves it to the
              phone's installer (ACTION_INSTALL_PACKAGE, not PackageInstaller sessions: those fail on some Xiaomi phones),
              status comes back through window.kpUpdateStatus. Debug builds may also fetch from http://10.0.2.2 (the
              emulator's host) for testing. Version comes from package.json; web changes need no new APK.
              public/.well-known/assetlinks.json is left over from the TWA (unused, harmless).
              QA: the debug APK enables WebView debugging, so `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`
              + raw CDP (Playwright can't attach to a WebView) drives the page in the emulator (AVD `kp`, Android 15;
              `ANDROID_AVD_HOME=~/.config/.android/avd`). CDP `Page.navigate` to http://10.0.2.2:5317/play/?app=android runs the
              dev server inside the app; `adb shell cmd overlay enable com.android.internal.display.cutout.emulation.hole`
              simulates a punch-hole camera.
tools/gen-worldmap.mjs   Natural Earth → region/biome rasters (two LODs, RLE)
tools/gen-assets.ts      brand assets + desktop icons (ICO/ICNS writers in-file), all drawn natively per size
.github/workflows/desktop.yml   tag v* → Windows/macOS/Linux installers + the Android APK on a draft GitHub release
```

## Conventions

- **Pixel rules:** never draw at a different pixel size. All world art goes through `PixelCanvas` with palette
  indices (`C.ink3`, `C.yel0`…), never raw hex. Zoom = change the stage's whole-number scale, not sprite scale.
  Icons are rendered per size or scaled by whole numbers (never resampled).
- **Art is code:** sprites are text grids (`PixelCanvas.from`) or procedural drawers. Use `cachedTexture(key, fn)`
  for anything reused; `textureOf` + `releaseTexture` for per-scene textures.
- **Sim/render split:** the sim must stay runnable in Node (tests). UI reads `game.state` (or `game.view`, which is
  the showcase world during the menu tour); mutations go through `game.*` action wrappers (they refresh stats,
  play sounds, toast errors and honour the confirm-spend setting).
- **Platform split:** game code never touches Tauri/Electron APIs directly — only `src/platform/platform.ts`
  (also phone fullscreen, Android detection, the APK link, the install prompt).
- **Fonts:** `--font` (Atkinson Hyperlegible Next: all running text, buttons, numbers), `--font-label` (small labels;
  their rules set capitals + `--caps-track`), `--font-pixel` (Silkscreen: `h2` titles, the website's section titles
  and brand only). Never set a pixel font on body text. Settings → Accessibility → Text font switches `html.font-pixel`
  (the pre-0.4.2 Pixelify + Silkscreen look) or `html.font-system`. In-world text (map labels, logo) is PixelCanvas art.
- **Phones:** landscape only. Short screens (`max-height: 520px`) get the compact rules; `(max-width: 820px) and
  (min-height: 521px)` is for narrow *tall* windows. Short coarse-pointer screens get `--ui-auto: 0.88` on top of the
  player's UI size. `#ui` is inset by the safe areas (`--safe-*`; zero in the Android app, `html.native-insets`, whose
  root view already pads around the cutout). **Zoomed HUD boxes** (the `zoom: …--ui-zoom…` list in styles.css): size
  them in % of the screen, never `vh`/`vw` (zoom multiplies those; divide by `--z` if you must). Spotlight bubbles go
  through `SpotBubble`/`placeBubble` (Tutorial.tsx), which measure and keep them on screen. Phone QA: headless Chrome with phone emulation
  (Pixel-class 915×412 and 780×360 at DPR 2.6–3, plus ~863×300 for a browser tab with its address bar).
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
  1/60 s of real time. Offline catch-up only in Acts I–III, only if the clock was running (`meta.pausedAtSave`) and
  nothing is waiting (`offlineAllowed`); research picks the cheapest project while away. Toasts: errors only during
  the tutorial (achievements held to its end).
- **Goals:** numeric objectives carry `progress(s) → { frac, text }`: the goal card shows a bar (hint in the tooltip),
  the Goals panels show it under the hint. Acts II–III list the phase's headline goals first.
- **Input & frames:** touch slop and tap radius come from `dragSlop(p)` / `touchRadius(p, mouse)` (stage.ts); scenes
  implement `pointerCancel` (a cancelled press is never a tap) and `busy()` (camera moving). Switch scenes with
  `stage.setScene(scene, zoom)`. Frame pacing lives in `main.ts` (60 fps cap, 30 with Battery saver or when calm).
  Textures are RGBA buffers in a Map registry (no canvas per texture); 1×1 particle pools use `render/pixelPool.ts`.
- **Settings:** add the field + default in `save/settings.ts`, the control in `ui/menu/SettingsScreen.tsx`, and apply
  it in `game.updateSettings` (CSS-level ones in `applyCssSettings`).
- **Save compatibility:** adding optional fields → default them in `save/save.ts#migrate`. Breaking changes →
  bump `SAVE_VERSION` in `sim/state.ts` and migrate.
- **Numbers:** real units underneath (MW, FLOP, $), icons/short values up front, detail in `data-tip` tooltips.
- Run `npm test` after sim changes — the Act I bot test catches balance regressions (Act I should finish in ~2–4 game years).

## Releasing

1. Bump `version` in `package.json` (the game, website, PWA and desktop builds all read it) and add a
   `## x.y.z — Title (date)` section to `CHANGELOG.md` (it feeds What's New in game and on the website).
2. Commit and push `main` → Netlify deploys the site and the web game; installed PWAs get an "update ready" toast.
3. For desktop builds and the Android app: `git tag vx.y.z && git push origin vx.y.z` → GitHub Actions builds the
   installers and `TheKardashevProject-android.apk` into a **draft** release. Publish the draft and the website's
   Download buttons pick it up (the APK link is `releases/latest/download/TheKardashevProject-android.apk`, so the asset
   name must stay fixed). The APK is signed from the repo secrets `ANDROID_KEYSTORE_B64` and
   `ANDROID_KEYSTORE_PASSWORD`; the key itself lives in `~/.config/kardashev-project/android/` on the dev machine.
   **Never lose or change it**: a new key means phones can't update the app.
4. Publishing the draft also updates the installed apps: the game offers the new version in a toast (desktop: the
   `updater-json` job's `latest.json`; Android: the latest release vs the app's own version). Desktop updates are
   signed in CI from the secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; the key lives in
   `~/.config/kardashev-project/tauri/` (kardashev-updater.key + updater-password.txt). **Never lose or change it
   either**: installed desktop apps only accept updates signed with it.

The theme song: drop an MP3 at `public/audio/theme.mp3` and the main menu plays it (the chiptune is the fallback).

## Adding things (cheat sheet)

| Want | Edit |
|---|---|
| New facility type | `FacilityType` in `sim/types.ts`, `content/facilities.ts`, power/compute effect in `sim/power.ts`/`sim/ai.ts`, map icon in `render/sprites/mapIcons.ts`, diorama art: size in `render/diorama/sizes.ts`, drawing in `plants.ts`, wired in `art.ts#makeArt`; UI icon in `ui/icons.ts`, `FAC_ICON` in `ui/Inspector.tsx` |
| New site | `content/sites.ts` (port must reach the world ocean — `npm test` checks every supplier→site route) |
| New tech | `content/techs.ts` (+ a `TechKey` if it needs a new multiplier, read via `techMult`) |
| New event | `content/events.ts` |
| New objective / act goal | `content/objectives.ts` |
| New Field Guide entry | `content/fieldGuide.ts` (body, in-game note, unlock rule) |
| Advisor's campus line | `content/campusLines.ts` (act range per line) |
| Achievement | `content/achievements.ts` (`done(s)` check, or `done: null` + `game.achieve(id)`; ids are for Steam later) |
| Sandbox switch or slider | `SandboxOpts` in `sim/types.ts`, read it in the sim formula, add the control in `ui/menu/SandboxControls.tsx` |
| Province governor | `GOVERNORS` in `content/planet.ts` + a look in `GOVERNOR_LOOKS` (`render/sprites/portraits.ts`) |
| Era music / place ambience | `ERA_SONGS` in `audio/music.ts` (sections, instruments) · `build()` in `audio/ambience.ts` |
| Person look, pose, outfit | `render/diorama/people.ts` (`tests/people-preview.test.ts` checks sizes and the closed outline) |
| Campus behaviour, critter, vehicle | `render/diorama/life.ts` (the scene feeds it `Spot`s and a `LifeEnv` each frame) |
| New difficulty / founder perk | `content/difficulty.ts` (founder mods feed `techMult`) |
| Tutorial step | `game/tutorial.ts` (+ a `data-tut` attribute on the target) |
| Dock icon | `ui/dockIcons.ts` (keep a 9×9 icon of the same name in `icons.ts` for Classic); look with `PREVIEW_DIR=… DOCK_ZOOM=a,b npx vitest run tests/dock-icons.test.ts` |
| Menu tour shot | `game/tour.ts` (`SHOTS`) and, for a new campus, `game/showcase.ts` |
| Re-tune the economy | `sim/model.ts` constants, `content/facilities.ts`, `content/companies.ts` |
| Facility tier / new Act II facility | `content/facilities.ts` (`tiers`, `act`, `phase`, `needs`, `slots`); art in `render/diorama/` + `mapIcons.ts` |
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
| Contract kind | `CONTRACT_KINDS` in `content/charter.ts` (+ its completion effect in `sim/charter.ts#completeProject`, access gain, art) |
| Megaproject site / HVDC route / launch site | `megaSite(...)` / `launchSite(...)` in `content/sites.ts`; `HVDC_ROUTES` in `content/charter.ts` |
| Mission | `MISSIONS` (+ `MISSION_MODS`) in `content/charter.ts`, its reward in `sim/charter.ts#completeMission` |
| Council resolution | `content/council.ts` (+ its effect in `sim/council.ts#applyResolution`) |
| Charter desk job | `DESKS` + its logic in `sim/desk.ts` |
| Act III event / chain | `content/events3.ts` |
| Act III briefing | `game/briefings.ts` (`c-*`, + `data-tut` targets) |
| Re-tune Act III pacing | `tests/act3.test.ts` + `tests/helpers/act3bot.ts`; `CHARTER` numbers, contract `value`/`days`, world growth in `sim/world.ts`, world alignment drift in `sim/frontier.ts` |
| Fusion design | `FUSION_DESIGNS` in `content/planet.ts` (+ a partner in `PARTNERS` with `act: 4`, a CEO look, plant art in `render/diorama/fusion.ts`) |
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

**Next: the user's playthrough of v0.8.0** (Settings → Gameplay → Playtest notes, J to note; Data → Log), then the
retune from the log and v1.0.0 (SPEC §21–22). Later: Type II as an Act VI that continues a finished save (SPEC §20 hooks). Then the real theme song, code signing (Windows/macOS), a feedback form
(deferred until marketing), Electron/Steam wrapper if the game goes to Steam.

**Still open:**
- M5 (SPEC §21): steps 1–7 shipped in v0.7.0; v0.8.0 (SPEC §22) is the whole-game audit and its fixes (finales that can
  be lost, fewer cards, the first hour, phones, speed). Waiting for the user's full playthrough, then the retune and
  v1.0.0. The music was level-checked in headless Chrome but nobody has listened to it yet. Known numbers to watch in
  the retune: Act I's long wait for Bit-2 (~415 days with nothing to research), Act II now 3.8–5 years (the bot stopped
  falling into the export trap), Act IV's bot reaches its Heat Wall on the stage-3 limit rather than the full checklist.
- Act V (v0.6.0): Android apps older than 0.6.0 can't save the end card (they suggest updating); Act V screens checked in
  headless desktop and phone emulation only.
  The 0.6.0 APK's `saveImage` bridge compiled (local debug build) but hasn't been tried on the emulator or a phone yet.
- Local Android builds on the dev machine: `JAVA_HOME=~/.local/share/jdk/jdk-17.0.21+9 ANDROID_HOME=~/.local/share/android-sdk
  ./gradlew assembleDebug --offline` (in `android/`).
- Act IV (v0.5.0): screens checked in headless desktop and phone emulation only.
- Act III panels were checked at phone sizes only in headless Chrome phone emulation (v0.4.2), not on a real phone.
- AppImages up to 0.8.0 crash on non-Ubuntu distros at the first click (no GStreamer plugins), so they can't update
  themselves: those users reinstall 0.8.1 by hand. The dev machine (Omarchy) updated 0.8.0 → 0.8.1 in the game on
  2026-11-06 (with a temporary plugin stopgap, since removed): the first real Linux in-app update from a CI release.
  The app checks ~6 s after launch, then every 6 h (the user is happy with that); a launch in the first minute after
  publishing can miss a release (GitHub's latest/download lags), so relaunch to test. `check()` errors are swallowed in
  platform.ts. To debug the desktop page: `WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:9339` + the WebKit inspector protocol
  over ws://127.0.0.1:9339/socket/1/1/WebPage (Target.sendMessageToTarget → Runtime.evaluate, Page.snapshotRect).
- Desktop update test (v0.9.4): `cd src-tauri && cargo test --lib fastdl` (fake slow/stalled/broken servers on
  127.0.0.x), `-- --ignored --nocapture` fetches the real latest release and checks its signature. End to end: `npx tauri
  build --debug --no-bundle --config '{"version":"0.9.2","identifier":"com.lonefox.kardashevproject.updatetest"}'`, copy
  the binary to a scratch dir as `kp-test.AppImage` (an unbundled build installs over its own file), run it with
  scratch `XDG_DATA_HOME`/`XDG_CONFIG_HOME`/`XDG_CACHE_HOME` (the restarted real AppImage inherits them, so the real saves
  stay untouched) and the inspector env var, then `game.installAppUpdate()`. 2026-11-08: 93 MB in 5.4 s, restarted as 0.9.3.
- In-app updates (v0.5.1) were tested end to end with local builds (the Linux AppImage: update, restart, a bad signature
  refused; the Android app in the emulator) and on the user's real Xiaomi phone, which updated itself to v0.5.1. Not yet
  on Windows or macOS. CI also signs the .deb (latest.json has linux-x86_64-deb), untested.
- The Windows and macOS installers build in CI but have never been launched on a real machine. The Linux AppImage runs
  on the dev machine (Omarchy/Arch, installed to ~/Applications with a launcher entry).
- The Android app runs on the user's real phone (Xiaomi, v0.5.x, the WebView app). Google Play would need an `.aab`
  (`./gradlew bundleRelease`) and a Play Console account.

**Balance is deliberately deferred** to a pre-launch beta (full playthrough + beta testers, then a rebalancing pass
across all acts). Until then, balance bots are guard rails only: every act must be completable with no stalls or NaNs,
and Act I must stay unchanged. Don't spend milestone time tuning numbers.
