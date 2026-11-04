# The Kardashev Project — dev guide

Pixel-art management sim about the AI boom. Design doc: `SPEC.md` (pillars, acts, decisions log).
Current build: **v0.5 "Planetary"** (M4): Acts I (The Garage), II (The Scale-Up), III (The Charter) and IV (Planetary)
are playable end to end, on top of v0.2 "The Front Door" (website, main menu, tutorial, settings, save slots, PWA and
desktop builds). v0.4.2 "Easy Reading" added the readable font (Atkinson Hyperlegible Next), phone fullscreen and the
Android app.
Live at https://thekardashevproject.netlify.app (Netlify auto-deploys `main`).

## Commands

```bash
npm run dev           # Vite dev server → http://127.0.0.1:5317 (landing at /, game at /play/)
npm run build         # typecheck (tsc 7) + production build → dist/ (both pages + service worker)
npm test              # vitest: sim determinism, Act I bot, Act II bot (preset → IPO), Act III bot (preset → renewal),
                      # Act IV bot (preset → jumps → the Heat Wall),
                      # offline, saves, routing, map + diorama scenes
npm run gen:map       # rebuild src/content/generated/worldmap.bin from Natural Earth (tools/raw/)
npm run gen:assets    # re-render icons, favicon, logo, globe, OG image + src-tauri/icons from game code
npm run desktop:dev   # Tauri window on top of the dev server
npm run desktop:build # local desktop build (Linux: add `-- --bundles deb` to skip the AppImage)
PREVIEW_DIR=/some/dir npx vitest run tests/preview.test.ts tests/routing.test.ts tests/act2-preview.test.ts tests/diorama-preview.test.ts \
  tests/act3-map-preview.test.ts tests/act3-diorama-preview.test.ts tests/act4-map-preview.test.ts \
  tests/act4-orbit-preview.test.ts tests/act4-diorama-preview.test.ts tests/act4-portraits.test.ts
                      # render map / portrait / route / Act II + III map / diorama previews to PNG without a browser
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
    plans.ts      five-year plans and time jumps (real daily ticks with `flags.offline = 'jump'`), the planner that
                  posts/awards contracts by priority, autopilot for events (first enabled choice), the report + Bit's diary
    supergrid.ts / provinces.ts / climate.ts / fusion.ts / orbit.ts (+ the Moon) / airegions.ts / heatwall.ts
                  the Act IV systems; planetInit.ts (starting state), planetView.ts (read-only views for map, orbit,
                  dioramas), planetPreview.ts (a ready-made ~2062 world for previews and tests)
    network.ts    regional inference markets: private graph (fiber, leased/own cables), serve efficiency, contracts first
    stack.ts / politics.ts / capital.ts / rivals.ts / jobs.ts / finale.ts   (see SPEC §17)
  content/    data: regions, sites, facilities (with tiers), techs, companies, events (+ events2.ts for Act II), objectives,
              advisors, cities, difficulty.ts, fieldGuide.ts, changelog.ts (parses CHANGELOG.md)
              Act II: network.ts (cables), stack.ts (deals, mines, materials), politics.ts (export rules, treaties,
              sovereign deals), capital.ts (customers, Series B, board, finance), rivals.ts (rival prefs, startups), jobs.ts
              Act III: charter.ts (partners, contract kinds, HVDC routes, missions, bloc economics, factions, access,
              CHARTER numbers), council.ts (resolutions), events3.ts; sites.ts adds the Charter HQ, 12 megaproject
              sites (kind 'mega') and 5 launch candidates (kind 'launch')
              Act IV: planet.ts (PLANET numbers, provinces, the AIs, fusion designs, supergrid routes, priorities, the
              cast), events4.ts; the 12 Act IV contract kinds live in charter.ts (ACT4_KINDS); MOON_SITE (kind 'moon')
              is in SITE_BY_ID but not in SITES (no map marker, no sea route)
  world/      map raster decode + sea router (A* over 0.5° ocean, carved canals, closable chokepoints) + sun position
  render/     Pixi v8. stage.ts = low-res render target scaled by whole numbers (one pixel size everywhere) + fade overlay
    palette.ts    master palette + era grading (Smog & Silicon → Grid Rush → Solarpunk Bloom → Orbital Dawn)
    pixels.ts     PixelCanvas: indexed-colour drawing (rect/line/ellipse/dither/text) baked with the era palette
    globe.ts      orthographic pixel Earth (landing hero, icons, OG image) with real sun + city lights
    worldMap/     terrain painter, night terminator + city lights, MapScene (markers, links, ships, input, cinematic glides),
                  act2Layers.ts (Act II site visibility, landing/mine/rival markers, cables, fiber, cosmetic shipping lanes),
                  act3Layers.ts (Charter HQ, megaproject markers + overlays, HVDC links, launch, bloc anchors, satellites)
    diorama/      side-view campus scenes: dioramaScene.ts (scrolling wide campuses, view-only supplier/mine/landing scenes),
                  art.ts (backdrops + the makeArt switch), plants.ts (Act II plants), industry.ts (suppliers, mines,
                  landing stations, rival campuses), sizes.ts (per-tier sizes), layout.ts (plots), campusArt.ts, draw.ts;
                  Act III: act3Pieces.ts (planner + art dispatch + `act3Key`), charterHQ.ts (Geneva), mega.ts (megaprojects
                  by stage and kind, offshore North Sea), launch.ts (pad, rocket, liftoff loop), act3kit.ts, scenery.ts (bands)
                  Act IV: moon.ts (the Moon base by stage, the mass driver, lunar light), fusion.ts (five plant designs,
                  air-capture farms); spaceports extend launch.ts
    orbit/        Act IV's orbit view: orbitScene.ts (Scene), orbitArt.ts (pure drawing), orbitSprites.ts
    sprites/      map icons, advisor + CEO portraits (procedural, with moods; Bit upgrades per model generation, up to Bit-9;
                  every partner CEO, the faction delegates, Ade and the three rival AIs have looks), charterIcons.ts
                  (Act III map sprites), act4Icons.ts (Act IV map sprites); worldMap/act4Layers.ts is the Act IV map layer
  game/
    game.ts       orchestrator: state, clock, scenes, slots, settings, tutorial, menu/tour, UI subscriptions, sound
    tutorial.ts   Bit's guided steps: text, target (`data-tut` attribute or `site:<id>`), done(g) check
    briefings.ts  Act II (`b-*`), Act III (`c-*`) and Act IV (`d-*`) unlock briefings: the owning advisor's 1–3 step
                  spotlight, shown once (each act's briefings only fire in that act)
    showcase.ts   the fake "day 900" world the menu tour flies over
    tour.ts       TourDirector: map glides + campus cuts behind the main menu
  ui/         Preact DOM overlay (crisp text). components.tsx has useGame()/Icon/Portrait/Bar/Panel/Toggle/Choice/Window
    panels/Act2Panels.tsx  Team (advisor jobs), Deals (supply · customers · companies), Blocs, Board & debt, Crunch tracker
    panels/Act3Panels.tsx  Charter (overview · contracts · missions · partners · world), Council, Charter desk,
                           own-run licence box, Threshold tracker, Charter HQ / megaproject / launch inspectors
    panels/Act4Panels.tsx  the Planet panel (overview · provinces · grid · fusion · space · climate), the plan screen,
                           the jump time-lapse overlay and report, the Heat Wall tracker, Act IV complete
    base.css      fonts, palette vars, frames, buttons — shared by the game and the website
    menu/         MainMenu, NewCompany, SettingsScreen (tabs; used in menu and in game), FieldGuide, InfoScreens
    Tutorial.tsx  spotlight + Bit bubble; Overlays.tsx: rotate-phone, FPS, update toast, decision pill, confirm
  landing/    website script + css: spinning globe canvas, install button, GitHub-release downloads, What's New
  platform/   platform.ts: browser vs installed PWA vs desktop app (quit, fullscreen, install prompt, service worker)
  save/       save.ts (5 slots + index, migrate(), export/import), settings.ts (+ applyCssSettings), guide.ts (Field Guide unlocks)
  audio/      engine.ts (context + master/music/sfx buses), sfx.ts (blips), music.ts (menu theme MP3 or chiptune fallback, game ambience)
src-tauri/    Tauri 2 desktop shell (one window loading play/index.html, the game bundled; capabilities = close, fullscreen,
              updater, restart). In-app updates: tauri-plugin-updater reads releases/latest/download/latest.json and
              only installs builds signed with the updater key (public half in tauri.conf.json plugins.updater)
android/      the Android app: one WebView activity (LauncherActivity.java, no libraries) that runs the LIVE site at
              /play/?app=android full screen and landscape, in its own process. Not a Trusted Web Activity any more
              (v0.5.0): Xiaomi's MIUI/HyperOS silently blocks the hand-off to Chrome, so the icon did nothing. The page
              gets window.KardashevAndroid.saveFile (export a save) and calls window.kpBack (the back gesture), both
              wrapped in platform.ts (saveTextFile, onHostBack). In-app updates (v0.5.1): the page compares the app's
              version (user agent `KardashevAndroid/x.y.z`) with the latest GitHub release and calls installUpdate(url):
              the app downloads the APK (only from this repo's releases) into its cache, UpdateProvider serves it to the
              phone's installer (ACTION_INSTALL_PACKAGE, not PackageInstaller sessions: those fail on some Xiaomi phones),
              status comes back through window.kpUpdateStatus. Debug builds may also fetch from http://10.0.2.2 (the
              emulator's host) for testing. Version comes from package.json; web changes need no new APK.
              public/.well-known/assetlinks.json is left over from the TWA (unused, harmless).
              QA: the debug APK enables WebView debugging, so `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`
              + raw CDP (Playwright can't attach to a WebView) drives the page in the emulator (AVD `kp`, Android 15).
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
  player's UI size. `#ui` is inset by the safe areas (camera cutouts). Phone QA: headless Chrome with phone emulation
  (Pixel-class 915×412 and 780×360 at DPR 2.6–3, plus ~863×300 for a browser tab with its address bar).
- **Content first:** new facilities/techs/events/sites/objectives are data in `src/content/`. Events are
  `EventDef`s with `weight`/`setup`/`choices[].apply` — keep choices to real trade-offs, give 2 advisor lines, and
  price crises with `cc(s, n)` so difficulty scales them.
- **Tutorial targets:** UI elements Bit (and the Act II briefings) point at carry `data-tut="..."`; keep them when refactoring panels.
- **Act gating:** Act II content carries `act: 2` and/or `phase: n` (facilities, techs, events, objectives, sites, jobs,
  deals). Act I must stay byte-identical: gate new behaviour on `s.act >= 2` and keep the Act I bot at ~day 812.
- **Act II prices:** Act I events use `cc(s, n)`, which scales up in Act II; Act II events (events2.ts) use `c2(s, n)`,
  written at Act II scale.
- **Act III gating:** `s.charter` exists only from Act III (null before). Act III phases live in `s.charter.phase`;
  `s.phase` stays 5 so every Act II gate stays open. Act III content uses `act: 3` and `cphase` (events, techs, sites,
  resolutions, missions, desks). Charter money is separate from company cash: `chSpend`/`chEarn` and the Charter ledger;
  Act III events price the Charter side with `ch3(s, n)` and the company side with `c2(s, n)`. New formula hooks
  (`grid:price`, `grid:carbon`, `market:hbm`, `market:pkg`, `charter:build`, `world:growth`) are modifiers that only
  exist in Act III, so Acts I–II stay byte-identical (Act I bot: day 812; Act II bot: IPO after 5.6 years).
- **Act IV gating:** `s.planet` exists only from Act IV (null before); `s.charter.phase` stays 6. Act IV content uses
  `act: 4` and `stage` (contract kinds, techs, resolutions, events, objectives). New hooks (`charter:space`,
  `orbit:debris`, `grid:faults`, `prov:<region>`, `heatwall:<front>`, the Act IV growth parts, gridYield in siteYield)
  only act when `s.planet` exists, so Acts I–III stay byte-identical (Act III bot: renewal on 31 Dec 2043). Act IV
  partners carry `act: 4` and join the Charter at beginAct4. Act IV events price the Charter side with `ch4(s, n)`
  (2045 scale). **Autopilot takes the first enabled choice during jumps**, so put the sensible default first.
  Checklist objectives are `live` (never ticked off; shown from `o.done(s)`).
- **Company vs Charter:** while the blind trust is on, `game.*` company wrappers refuse with a toast (`locked()`); the
  sim actions stay open so advisors and the trustee can act.
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
| New difficulty / founder perk | `content/difficulty.ts` (founder mods feed `techMult`) |
| Tutorial step | `game/tutorial.ts` (+ a `data-tut` attribute on the target) |
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

## Known gaps / next (see SPEC §12, §16, §17, §18, §19)

**Next: Act V "Type I"** (SPEC §12 M4.5), to be planned in its own session; Act IV's hooks for it close SPEC §19. Then the real theme song, code signing (Windows/macOS), a feedback form
(deferred until marketing), Electron/Steam wrapper if the game goes to Steam.

**Still open:**
- The main menu's background tour (`game/tour.ts` `SHOTS`, `game/showcase.ts`) only flies over Acts I–II: no Charter
  HQ, megaproject, launch, orbit-view or Moon shots yet.
- Act IV (v0.5.0): no province governor portraits, no Act IV audio (ambience, launches, mass driver), the Moon's crew
  lander doesn't take off; Act IV screens checked in headless desktop and phone emulation only.
- Act III panels were checked at phone sizes only in headless Chrome phone emulation (v0.4.2), not on a real phone.
- In-app updates (v0.5.1) were tested end to end with local builds: the Linux AppImage (update, restart, a bad
  signature refused) and the Android app in the emulator (permission, download, installer). Not yet on Windows,
  macOS or a real phone; a .deb install may not update itself (the AppImage does).
- The Windows and macOS installers build in CI but have never been launched on a real machine. The Linux AppImage runs
  on the dev machine (Omarchy/Arch, installed to ~/Applications with a launcher entry).
- The Android app (v0.4.2) builds and is signed, but hasn't been installed on a real phone yet. Google Play would need
  an `.aab` (`./gradlew bundleRelease`) and a Play Console account.

**Balance is deliberately deferred** to a pre-launch beta (full playthrough + beta testers, then a rebalancing pass
across all acts). Until then, balance bots are guard rails only: every act must be completable with no stalls or NaNs,
and Act I must stay unchanged. Don't spend milestone time tuning numbers.
