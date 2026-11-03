# The Kardashev Project — dev guide

Pixel-art management sim about the AI boom. Design doc: `SPEC.md` (pillars, acts, decisions log).
Current build: **M1 "First Light"** — Act I (The Garage) is playable end to end.

## Commands

```bash
npm run dev        # Vite dev server → http://127.0.0.1:5317
npm run build      # typecheck (tsc 7) + production build → dist/
npm test           # vitest: sim determinism, Act I bot, offline, save round-trip, sea routing
npm run gen:map    # rebuild src/content/generated/worldmap.bin from Natural Earth (tools/raw/)
PREVIEW_DIR=/some/dir npx vitest run tests/preview.test.ts tests/routing.test.ts
                   # render map / portrait / route previews to PNG without a browser
```

In the browser console, `window.game` is the live `Game` (state, actions, `setEraOverride(0..3)`, `enterDiorama(siteId)`).

## Architecture

```
src/
  sim/        PURE game logic — no DOM, no Pixi. Deterministic (seeded RNG in state).
    types.ts      GameState and friends (everything serialisable)
    tick.ts       one game day: construction → supply → power → compute → economy → license → rivals → objectives → events
    model.ts      shared formulas (costs, build times, chip specs, capability, K) — UI previews use these too
    actions.ts    player actions; validate → spend → mutate → Result {ok | reason}
    power.ts      daily power balance per grid island (solar needs batteries to count fully)
    supply.ts     chip orders → weekly shipments over real sea routes → rack installs
    ai.ts         compute → training / inference revenue / research / safety; rival labs
    events.ts     event engine (random pool, incidents, scripted); content lives in content/events.ts
    offline.ts    "while you were away" catch-up (1 game month per real hour, max 1 year, no events)
  content/    data: regions, sites, facilities, techs, companies, events, objectives, advisors, cities
  world/      map raster decode + sea router (A* over 0.5° ocean, carved canals, closable chokepoints) + sun position
  render/     Pixi v8. stage.ts = low-res render target scaled by whole numbers (one pixel size everywhere)
    palette.ts    master palette + era grading (Smog & Silicon → Grid Rush → Solarpunk Bloom → Orbital Dawn)
    pixels.ts     PixelCanvas: indexed-colour drawing (rect/line/ellipse/dither/text) baked with the era palette
    textures.ts   bake PixelCanvas → Texture; re-bakes automatically on era change
    worldMap/     terrain painter, night terminator + city lights, MapScene (markers, links, ships, input)
    diorama/      side-view campus scenes: art.ts (procedural facility/backdrop sprites) + dioramaScene.ts
    sprites/      map icons, advisor portraits (procedural, with moods; Bit upgrades per model generation)
  ui/         Preact DOM overlay (crisp text). components.tsx has useGame()/Icon/Portrait/Bar/Panel
  game/game.ts  orchestrator: owns state, clock, scenes, UI subscriptions, saves, sound
  save/       localStorage save (versioned, migrate()), settings, export/import string
  audio/sfx.ts  tiny WebAudio chiptune blips (no audio files)
tools/gen-worldmap.mjs   Natural Earth → region/biome rasters (two LODs, RLE)
```

## Conventions

- **Pixel rules:** never draw at a different pixel size. All world art goes through `PixelCanvas` with palette
  indices (`C.ink3`, `C.yel0`…), never raw hex. Zoom = change the stage's whole-number scale, not sprite scale.
- **Art is code:** sprites are text grids (`PixelCanvas.from`) or procedural drawers. Use `cachedTexture(key, fn)`
  for anything reused; `textureOf` + `releaseTexture` for per-scene textures.
- **Sim/render split:** the sim must stay runnable in Node (tests). UI reads `game.state`; mutations go through
  `game.*` action wrappers (they refresh stats, play sounds and toast errors).
- **Content first:** new facilities/techs/events/sites/objectives are data in `src/content/`. Events are
  `EventDef`s with `weight`/`setup`/`choices[].apply` — keep choices to real trade-offs and give 2 advisor lines.
- **Save compatibility:** adding optional fields → default them in `save/save.ts#migrate`. Breaking changes →
  bump `SAVE_VERSION` in `sim/state.ts` and migrate.
- **Numbers:** real units underneath (MW, FLOP, $), icons/short values up front, detail in `data-tip` tooltips.
- Run `npm test` after sim changes — the Act I bot test catches balance regressions (Act I should finish in ~2–4 game years).

## Adding things (cheat sheet)

| Want | Edit |
|---|---|
| New facility type | `FacilityType` in `sim/types.ts`, `content/facilities.ts`, power/compute effect in `sim/power.ts`/`sim/ai.ts`, map icon in `render/sprites/mapIcons.ts`, diorama art in `render/diorama/art.ts`, UI icon in `ui/icons.ts` |
| New site | `content/sites.ts` (port must reach the world ocean — `npm test` checks every supplier→site route) |
| New tech | `content/techs.ts` (+ a `TechKey` if it needs a new multiplier, read via `techMult`) |
| New event | `content/events.ts` |
| New objective / act goal | `content/objectives.ts` |
| Re-tune the economy | `sim/model.ts` constants, `content/facilities.ts`, `content/companies.ts` |

## Known gaps / next (see SPEC §12)

Acts II–V (fabs, packaging, nuclear/fusion, the Charter role pivot, orbit), company contracts/bidding,
Kip's space arc, more dioramas per backdrop detail, theme music, Tauri desktop build.
