# The Kardashev Project — dev guide

Pixel-art management sim about the AI boom. Design doc: `SPEC.md` (pillars, acts, decisions log).
Current build: **v0.4 "The Charter"** (M3): Acts I (The Garage), II (The Scale-Up) and III (The Charter) are playable
end to end, on top of v0.2 "The Front Door" (website, main menu, tutorial, settings, save slots, PWA and desktop builds).
Live at https://thekardashevproject.netlify.app (Netlify auto-deploys `main`).

## Commands

```bash
npm run dev           # Vite dev server → http://127.0.0.1:5317 (landing at /, game at /play/)
npm run build         # typecheck (tsc 7) + production build → dist/ (both pages + service worker)
npm test              # vitest: sim determinism, Act I bot, Act II bot (preset → IPO), Act III bot (preset → renewal),
                      # offline, saves, routing, map + diorama scenes
npm run gen:map       # rebuild src/content/generated/worldmap.bin from Natural Earth (tools/raw/)
npm run gen:assets    # re-render icons, favicon, logo, globe, OG image + src-tauri/icons from game code
npm run desktop:dev   # Tauri window on top of the dev server
npm run desktop:build # local desktop build (Linux: add `-- --bundles deb` to skip the AppImage)
PREVIEW_DIR=/some/dir npx vitest run tests/preview.test.ts tests/routing.test.ts tests/act2-preview.test.ts tests/diorama-preview.test.ts \
  tests/act3-map-preview.test.ts tests/act3-diorama-preview.test.ts
                      # render map / portrait / route / Act II + III map / diorama previews to PNG without a browser
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
    network.ts    regional inference markets: private graph (fiber, leased/own cables), serve efficiency, contracts first
    stack.ts / politics.ts / capital.ts / rivals.ts / jobs.ts / finale.ts   (see SPEC §17)
  content/    data: regions, sites, facilities (with tiers), techs, companies, events (+ events2.ts for Act II), objectives,
              advisors, cities, difficulty.ts, fieldGuide.ts, changelog.ts (parses CHANGELOG.md)
              Act II: network.ts (cables), stack.ts (deals, mines, materials), politics.ts (export rules, treaties,
              sovereign deals), capital.ts (customers, Series B, board, finance), rivals.ts (rival prefs, startups), jobs.ts
              Act III: charter.ts (partners, contract kinds, HVDC routes, missions, bloc economics, factions, access,
              CHARTER numbers), council.ts (resolutions), events3.ts; sites.ts adds the Charter HQ, 12 megaproject
              sites (kind 'mega') and 5 launch candidates (kind 'launch')
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
                  landing stations, rival campuses), sizes.ts (per-tier sizes), layout.ts (plots), campusArt.ts, draw.ts
    sprites/      map icons, advisor + CEO portraits (procedural, with moods; Bit upgrades per model generation, up to Bit-5)
  game/
    game.ts       orchestrator: state, clock, scenes, slots, settings, tutorial, menu/tour, UI subscriptions, sound
    tutorial.ts   Bit's guided steps: text, target (`data-tut` attribute or `site:<id>`), done(g) check
    briefings.ts  Act II unlock briefings: the owning advisor's 1–3 step spotlight, shown once (meta.briefings)
    showcase.ts   the fake "day 900" world the menu tour flies over
    tour.ts       TourDirector: map glides + campus cuts behind the main menu
  ui/         Preact DOM overlay (crisp text). components.tsx has useGame()/Icon/Portrait/Bar/Panel/Toggle/Choice/Window
    panels/Act2Panels.tsx  Team (advisor jobs), Deals (supply · customers · companies), Blocs, Board & debt, Crunch tracker
    panels/Act3Panels.tsx  Charter (overview · contracts · missions · partners · world), Council, Charter desk,
                           own-run licence box, Threshold tracker, Charter HQ / megaproject / launch inspectors
    base.css      fonts, palette vars, frames, buttons — shared by the game and the website
    menu/         MainMenu, NewCompany, SettingsScreen (tabs; used in menu and in game), FieldGuide, InfoScreens
    Tutorial.tsx  spotlight + Bit bubble; Overlays.tsx: rotate-phone, FPS, update toast, decision pill, confirm
  landing/    website script + css: spinning globe canvas, install button, GitHub-release downloads, What's New
  platform/   platform.ts: browser vs installed PWA vs desktop app (quit, fullscreen, install prompt, service worker)
  save/       save.ts (5 slots + index, migrate(), export/import), settings.ts (+ applyCssSettings), guide.ts (Field Guide unlocks)
  audio/      engine.ts (context + master/music/sfx buses), sfx.ts (blips), music.ts (menu theme MP3 or chiptune fallback, game ambience)
src-tauri/    Tauri 2 desktop shell (one window loading play/index.html; capabilities = close + fullscreen only)
tools/gen-worldmap.mjs   Natural Earth → region/biome rasters (two LODs, RLE)
tools/gen-assets.ts      brand assets + desktop icons (ICO/ICNS writers in-file), all drawn natively per size
.github/workflows/desktop.yml   tag v* → Windows/macOS/Linux installers on a draft GitHub release
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
- **Platform split:** game code never touches Tauri/Electron APIs directly — only `src/platform/platform.ts`.
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
3. For desktop builds: `git tag vx.y.z && git push origin vx.y.z` → GitHub Actions builds the installers into a
   **draft** release. Publish the draft and the website's Download buttons pick it up.

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

## Known gaps / next (see SPEC §12, §16, §17)

**Next: Acts IV–V** (SPEC §12 M4: Planetary — the global grid, fusion, orbital compute, the Moon — then Type I; Act III's
hooks for them are at the end of SPEC §18). Then the real theme song, code signing (Windows/macOS), a feedback form
(deferred until marketing), Electron/Steam wrapper if the game goes to Steam.

**Balance is deliberately deferred** to a pre-launch beta (full playthrough + beta testers, then a rebalancing pass
across all acts). Until then, balance bots are guard rails only: every act must be completable with no stalls or NaNs,
and Act I must stay unchanged. Don't spend milestone time tuning numbers.
