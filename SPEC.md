# The Kardashev Project — Game Spec v0.1

> A cozy-but-real pixel-art management sim about the AI boom. You start in 2027 as a scrappy AI
> startup and grow into the steward of Earth's whole AI stack (energy, chips, memory, data
> centers, networks, launch), guiding civilisation from **K ≈ 0.73 to Type I**, and later beyond.

Status: **M1 "First Light" is built**: Act I is playable end to end. Section 13 lists the locked
decisions and section 15 tracks what's implemented. Developer notes live in `CLAUDE.md`.

---

## 1. Pillars

1. **Real constraints, readable at a glance.** Icons first, real units on hover or tap. A turbine
   really does take years to arrive, and a fab really does need ultrapure water.
2. **Geography matters.** Every number has a place on the map: sun in the Sahara, cold in the
   Nordics, fabs on the Pacific rim, chokepoints at sea.
3. **Something is always growing.** Exponential compute, falling costs, delegation, offline
   progress. Coming back to the game should feel good.
4. **Crises are puzzles, not punishments.** Shocks force interesting trade-offs. They are not
   game overs.
5. **Charm.** Cute pixel dioramas, advisors with personality, and a world that visibly gets
   cleaner and brighter as you climb.

---

## 2. The Kardashev meter (the score)

Sagan's formula, used literally: **K = (log₁₀ P − 6) / 10**, where P is total power harnessed by
civilisation, in watts.

| K | Power | Meaning |
|---|---|---|
| 0.729 | ~19.6 TW | Earth, start of game |
| 0.75 | 31.6 TW | First milestone |
| 0.80 | 100 TW | Grid-scale abundance |
| 0.90 | 1 PW | Planetary engineering |
| **1.00** | **10 PW** | **Type I: campaign win** |

- **AI is how you climb; energy is how you're measured.** Intelligence speeds up research, research
  unlocks better energy and infrastructure, and that energy raises K.
- K is shown to 4 decimals so it ticks up constantly (the incremental itch).
- **Your score is the year you reach Type I.** The calendar never stops; "Type I in 2091" is a
  brag.
- Late-game physics wall: 10 PW dissipated on Earth's surface is about **20 W/m² of waste heat**,
  roughly 7× today's greenhouse forcing. So the last stretch to Type I *has to* move compute and
  generation into orbit. That is the bridge to Type II.

---

## 3. Your role: startup → steward

The player's role changes over the campaign. As it changes, more of the work becomes automated
(the idle layer).

| Act | Years (soft) | You are… | How you act | Automation tier |
|---|---|---|---|---|
| **I: The Garage** | 2027–29 | A tiny AI startup | Rent compute, buy chips, build a first DC | Manual |
| **II: The Scale-Up** | 2029–34 | A hyperscaler | Own power and campuses, sign supply deals | Standing orders |
| **III: The Charter** | 2034–45 | Steward of *The Kardashev Project* consortium | Post contracts, subsidise, broker between companies and blocs | Delegation |
| **IV: Planetary** | 2045–70 | Planetary operator | Global HVDC grid, fusion, orbital compute, Moon | AI-managed regions (needs Safety trust) |
| **V: Type I** | 2070+ | Civilisation steward | Thermal budget, space solar, the final push | Full autopilot plus big decisions |

**The Charter moment (Act III)** is the pivot: a global crisis leads the regional blocs to found
*The Kardashev Project*, with you as its steward. Former suppliers and rivals become partners you
broker between, and your own company becomes one actor among many. Expect conflict-of-interest
events.

---

## 4. Core loop

A blend of **tycoon/management + crisis strategy + incremental/idle**.

- **Moment to moment:** watch flows on the map, drag links, queue builds, place long-lead orders,
  answer event cards, allocate compute (revenue vs research vs safety).
- **Session (15–30 min):** hit a milestone, finish a model generation, unlock tech, open a region,
  resolve a crisis chain.
- **Long arc:** Acts → K milestones → Type I.

### The stack (resource chain)

```
⛏ Minerals ─┐
🎈 Gases ────┼─▶ 🏭 Logic Fab ──▶ 🔷 Accelerators ─┐
🔧 Litho tools┘   💾 Memory Fab ─▶ 💾 HBM ─────────┴─▶ 🖥 Data Center ──▶ 🧮 Compute
                                         ⚡ Power ──────────┘     ▲             │
                                         💧 Cooling ─────────────┘             ▼
                                                               🧪 Lab: train models
                                                                  │      │       │
                                                       🧠 Capability  🔬 Research  💰 Revenue
                                                                  │      │
                                                    🛡 Safety ◀───┘      └─▶ unlocks better ⚡ → K ↑
```

Later layers: 🚀 Launch → 🛰 Orbital DCs / space solar → 🌙 Moon industry.

### Incremental engine
- **Exponentials:** installed compute, research rate (multiplied by model capability, giving a
  recursive-improvement feel), and K itself.
- **Wright's law (real):** every doubling of cumulative production cuts cost by a fixed percentage
  (solar about 20%, batteries about 18%). Build more and things get cheaper.
- **Automation tiers** as described in section 3. Delegating to AI is gated by your Safety record:
  *you can only automate what you trust.*
- **Offline progress:** the world keeps running while you're away at **1 game month per real hour**
  (max 1 game year) with production at full efficiency. No new crises fire while you're away, and
  standing orders keep running. When you return (or come back to a backgrounded tab), **Bit** gives a
  "While you were away" report. *(Changed from the original 50%/12 h idea: at 1 game day per second, a
  real-time catch-up would skip whole decades.)*

---

## 5. Pressure systems (all four, as chosen)

| System | Meter | Examples | Levers |
|---|---|---|---|
| **Supply shocks & disasters** | Order backlogs and stockpiles | Quake near fabs, helium or neon shortage, chokepoint closure (Malacca, Suez, Panama, Hormuz, Bab-el-Mandeb), transformer and turbine backlogs, solar storm | Stockpile, diversify suppliers, rush fees, research local production |
| **Politics & opinion** | 🤝 Social License per region (0–100) | Permits, export controls between blocs, NIMBY, DCs raising local power prices, elections flipping a bloc's stance | Bring your own power, community deals, jobs, Safety reputation, diplomacy |
| **Climate & physical limits** | 🌡 Carbon budget, later Thermal budget | Heatwaves derate cooling, droughts cut hydro and water, water-stressed regions | Clean energy, dry cooling, siting, orbit (late game) |
| **AI safety / alignment** | 🛡 Safety Margin = Alignment − Capability | Capability outrunning safety raises incident risk: minor (embarrassing), regional ban, forced global pause | Spend compute on safety research. **Safety also pays off:** faster permits, trust, and unlocking automation |

**Failure:** the campaign has no hard game over by default, only setbacks (dilutive bailouts,
regional bans, forced pauses). An optional "Hard Mode" in sandbox adds real fail states.

---

## 6. The world

**Real Earth, about 12 regional blocs.** Geography and resources are real, but politics happens
between blocs rather than named countries. All companies are fictional.

| # | Region (working names) | Character |
|---|---|---|
| 1 | Pacific Coast | Talent, hydro in the north, solar in the south, quakes |
| 2 | Atlantic & Heartland | DC alley, gas, wind, Gulf launch, strained grid |
| 3 | Latin America | Lithium triangle, big hydro, equatorial launch |
| 4 | Europe | Litho-tool monopoly lives here, strict rules, nuclear, North Sea wind |
| 5 | Nordics & Arctic | Cheap hydro and geothermal, free cooling, few people |
| 6 | Eurasian Steppe | Gas, uranium, a launch heritage |
| 7 | Gulf & Sahara | Sovereign capital, huge sun, heat, desalination |
| 8 | Sub-Saharan Africa | Cobalt and copper, young workforce, vast solar |
| 9 | South Asia | Talent, demand, heat, monsoon |
| 10 | Mainland East Asia | Rare-earth and gallium processing, manufacturing scale, export controls |
| 11 | Pacific Fab Belt | The fab and HBM heartland, typhoons, quakes, a geopolitical flashpoint |
| 12 | SE Asia & Oceania | Chip packaging and assembly, Malacca, Australian lithium and sun |

Each region has **3–6 sites**, each with traits such as ☀ capacity factor, 🌬 wind, 💧 water,
🌡 climate, ⚠ hazard, 🤝 permit speed and port access. Regions also carry a bloc stance on AI
(accelerate / cautious / neutral) and a list of export rules.

**Links** (dragged between sites or regions on the map; flows then run on their own and
bottlenecks glow):
- ⚡ Transmission (AC, then HVDC for long distance with lower losses)
- 🚢 Shipping lanes via ports, through chokepoints
- 🌐 Fiber and subsea cable (Act II)
- 🚀 Launch corridors (Act IV)

### Numbers: real units, cozy front end
The UI shows icons and short values (`⚡ 3.2 GW`). Hover or tap reveals real-ish detail. Proposed
reference magnitudes (all tunable):

| Thing | Real-ish value |
|---|---|
| Accelerator | ~1.4 kW all-in, ~3 PFLOP/s, needs 8 HBM stacks |
| Frontier training run (2027) | ~10²⁷ FLOP |
| Data center build | 18–24 months |
| Solar farm build | ~12 months, 15–30% capacity factor by region |
| Gas turbine order | 3–5+ years (real 2020s backlog) |
| Large transformer | 2–4 years |
| Leading-edge fab | ~3–4 years, ~$20B |
| Large nuclear | 7–10+ years |

---

## 7. Fictional companies (placeholder names)

In Acts I–II these companies are your **suppliers and chokepoints**. From Act III they are
**partners who bid on your contracts**. Each has traits (Reliability · Speed · Cost · Ambition ·
Ethics) and a quirk.

| Sector | Companies |
|---|---|
| Logic fabs | Lumen Foundry, Kestrel Semiconductor |
| HBM / memory | Stackwell Memory, Hanbit Memory |
| Lithography tools | **Veldt Optics** (sole EUV maker, the ultimate chokepoint) |
| Packaging | Bondline Packaging |
| Cloud | Cumulus Cloud, Stratum Compute |
| AI labs (rivals, later partners) | Meridian Intelligence, Lattice Labs, Open Orchard |
| Power | Halcyon Power, Brightwater Hydro, Little Sun Reactors (SMRs), Sunforge Fusion |
| Launch | Parabola Launch, Kármán Logistics |
| Mining / shipping | Deepvein Minerals, Saltflat Lithium, Tidewater Freight |

---

## 8. Characters

**The advisors** (pixel portraits; they brief you, disagree with each other on event cards, and
react to your choices):

| Advisor | Role | Vibe |
|---|---|---|
| Juno Okafor | Chief Engineer: power and construction | Can-do, wants it built yesterday |
| Penny Ruiz | CFO: cash, rounds, burn | Frugal, bone-dry humour |
| Mira Sato | Supply Chain: chips, HBM, shipping, backlogs | Sees single points of failure everywhere |
| Sol Haddad | Diplomat: blocs, permits, opinion | Smooth, sees both sides |
| Dr. Iris Vance | Safety Lead | Calm and principled, not a doomer |
| Kip Lindqvist | Launch & Space (from Act III) | Relentless space optimist |

**Bit** is your AI, a tiny pixel robot. Its sprite visibly upgrades with every model generation
(Bit-1, Bit-2…). It narrates "While you were away", gradually becomes a co-advisor, and narrates
the Type I ending.

Company CEOs also get portraits and personalities.

---

## 9. Art direction

**Strict low-res pixel art with modern lighting**, plus a palette that **evolves with your era**.

### Rendering rules (the upgrade over Singularity City)
- The world renders to a **fixed low-res render target** (about 640×360 in landscape; the short
  side flexes between 320 and 400 px) and is **scaled to the screen by a whole number**. One pixel
  size everywhere, never mixed scales.
- **Smooth pixel camera:** the camera snaps to whole internal pixels and the leftover fraction is
  applied after upscaling, so panning is buttery without shimmer.
- **One master palette** of about 48 colours arranged as **hue-shifted ramps** (shadows lean
  cool/violet, highlights lean warm), with ordered dithering for gradients.
- **Modern lighting on top:** a night light-map (windows, lamps, beacons), low-res bloom that stays
  pixelated, weather (rain, snow, smog, heat shimmer), clouds and shadows.
- **UI stays crisp:** an HTML/DOM overlay using a pixel font at whole-number sizes and 9-slice
  pixel frames.

### Era palettes (colour grading follows K)
| Era | K range | Mood |
|---|---|---|
| Smog & Silicon | 0.72–0.74 | Grey-browns, smog haze, sodium-orange lights |
| Grid Rush | 0.74–0.78 | Clearing skies, industrial blues, LED whites |
| Solarpunk Bloom | 0.78–0.88 | Greens, gold light, clean sky blue |
| Orbital Dawn | 0.88–1.0 | Deep blue and violet, starlight, aurora teal |

### Views
- **World map:** real coastlines rasterised to pixels at build time (Natural Earth, public domain),
  equirectangular projection with horizontal wrap and whole-number zoom levels. Shows region tints,
  sites, animated links, ships crawling along lanes, and a **day/night terminator**.
- **Campus diorama:** click a site to zoom into a **side-view, three-layer parallax diorama**: a
  region-specific backdrop (desert mesas, fjords, plains, coast, jungle, mountains), facilities in
  slots, tiny workers, trucks and drones, weather, and emissive windows at night.
- **Day/night is cosmetic and follows the real clock** (a nod to Singularity City): the map shows
  the true terminator, and dioramas show each site's actual local time. The simulation uses
  averaged capacity factors, so solar at night means batteries are discharging.

### Sprite pipeline
Sprites are defined **as text pixel grids in TypeScript** that reference palette names, then baked
into a texture atlas. That means all the art can be written in code, with no asset bottleneck,
easy diffs and easy variations. The pipeline also accepts Aseprite PNGs if you want to hand-draw
anything later.

```ts
export const solarPanel = sprite(`
  ..aaaa..
  .abbbba.
  abbcbbba
`, { a: 'steel3', b: 'navy2', c: 'sky4' });
```

### Audio
Procedural SFX (zzfx-style, tiny). A theme track per project (drop in an MP3 like your other
projects).

---

## 10. UI layout

```
┌────────────────────────────────────────────────────────────────────────┐
│ ⏸ ▶ ▶▶ MAR 2028 │ 💰 $1.2B │ ⚡ 340/410 MW │ 🧮 4.1 EF │ 🧠 T2 │ 🛡 +12 │ K 0.7294 │
├─────────┬──────────────────────────────────────────────────┬───────────┤
│ BUILD   │                                                  │ INSPECTOR │
│ ☀ 🌬 ⚡  │          pixel world map / campus diorama        │ Pacific   │
│ 🔋 🖥 🧪 │   regions · sites · links · ships · terminator   │ Coast     │
│ LINKS   │                                                  │ ☀ 22% CF  │
│ ⚡ 🚢    │                                                  │ 🤝 64     │
├─────────┴──────────────────────────────────────────────────┴───────────┤
│ 📰 Helium up 40% after refinery fire · Mira: "I told you we needed a…" │
└────────────────────────────────────────────────────────────────────────┘
```
- **Mobile and touch:** the top bar condenses, the side panels become bottom sheets, and
  pinch/drag replace mouse controls. **Tap-to-inspect replaces hover** everywhere, since the
  numbers-on-hover design needs a touch equivalent.
- **Accessibility:** status is never shown by colour alone (icons and shapes too), plus UI scale,
  reduced motion, and pause at any time.

---

## 11. Tech architecture

**Vite + TypeScript (strict) + PixiJS v8**, with Preact for the DOM UI. Builds to static files and
deploys to Netlify. A Tauri wrap for Steam can come later.

```
src/
  main.ts
  sim/        pure TS, no rendering. state, tick, seeded RNG, systems:
              power · supply · compute · research · economy · politics · safety · climate · events
              offline.ts (fast-forward in coarse monthly steps)
  content/    typed data: regions, sites, facilities, techs, events, companies, advisors
  render/     pixelStage (low-res RT + whole-number scaling + smooth camera), palette + era LUTs,
              sprites/ (pixel-grid DSL → atlas), worldMap/, diorama/, lighting/, fx/
  ui/         Preact HUD, panels, event cards, advisor dialogue
  save/       versioned save schema + migrations, IndexedDB/localStorage, export/import string
tools/        coastline + region rasteriser, palette/LUT generator, sprite baker
tests/        Vitest: sim determinism, balance "autoplay bot" for pacing
```

- **Sim and render are fully separate.** The sim is deterministic and serialisable, and can move to
  a Web Worker later. 1 tick = 1 game day. At 1× speed, 1 game month ≈ 30 s (tunable), which puts
  a campaign at about 6–10 h of play counting speed-ups and idle time.
- **Saves:** autosave plus a save on tab-hide; the schema is portable for a future desktop build.
- **Performance budget:** 60 fps on a mid-range laptop, and 60 fps on phones with a 30 fps floor.
  The low-res render target keeps fill-rate tiny, which avoids the browser limits you hit with
  hyper-real 3D.
- **Balance bot:** a headless script plays the campaign so pacing regressions show up in tests.

---

## 12. Milestones

**M0: Foundations.** Project scaffold, pixel-perfect stage, palette and sprite DSL, world-map
rasteriser, save system, sim tick and clock.

**M1: "First Light" vertical slice (Act I playable).**
- Title screen → name your startup → choose a home region.
- World map with 12 regions and 3 sites each, pan and zoom, terminator, tooltips.
- **Buildable:** Solar Farm, Wind Farm, Gas Plant, Battery, Data Center, Research Lab.
- **Supplier facilities on the map** (Lumen Foundry fabs, Stackwell HBM, Veldt Optics): you place
  orders with lead times. This plants the seed of brokering.
- Links: ⚡ transmission and 🚢 shipping (with chokepoints).
- Sim loop: power balance → accelerators + HBM → DC compute → train models → capability, research
  and revenue.
- Money: seed funding, burn, revenue, a Series A milestone. About 12 techs.
- About 8 event cards covering all four pressure systems, with advisor commentary.
- Meters: K, Safety Margin, Social License, carbon.
- Advisors: Juno, Penny, Iris, plus Bit.
- **One gorgeous campus diorama** (DC + solar) with day/night and weather.
- Speed controls, offline progress and the "While you were away" report.
- **Act I goal:** train your first frontier model (Bit-2) and raise a Series A.

**The first 10 minutes (target feel):**
1. Bit boots up: *"Hello, world! I'm Bit."*
2. Rent compute from Cumulus Cloud and train Bit-1. First revenue trickles in.
3. Juno pitches your own data center: pick a site and see its power needs.
4. Build solar plus gas, drag a transmission link, then order accelerators. Mira warns about the
   HBM queue.
5. The DC comes online and you **zoom into the diorama** (the wow moment).
6. Train Bit-2 → Series A → Act I complete.

**M2: Act II, The Scale-Up.** Nuclear, hydro, geothermal, packaging plants, mines, fiber, export
controls, the HBM crunch event chain, more dioramas, standing orders.

**M3: Act III, The Charter.** The role pivot, companies bidding on contracts, the rest of the
advisor cast, deeper bloc politics.

**M4: Acts IV–V.** Fusion, HVDC global grid, launch, orbital DCs, space solar, the Moon, the
thermal budget, the Type I ending.

**M5: Polish and ship.** Full sandbox mode, audio, mobile polish, signing and store builds.
(Custom starts with seeds, Hard difficulty, music and the Tauri desktop build arrived early, in M1.5.)

**Later:** Type II (Mercury mining, Dyson swarm), then a Type III epilogue.

---

## 13. Decisions log (locked in 2026-11-03)

| Topic | Decision |
|---|---|
| View | World map + zoom-in campus dioramas |
| Genre | Tycoon + crisis strategy + incremental/idle |
| Role | Startup that grows into a steward brokering fictional companies |
| Scope | Type I for v1, eventually all the way to Type III |
| Map | Real Earth, ~12 regional blocs, fictional companies |
| Time | Real-time with pause and speeds, plus offline progress |
| Building | Map-level links + management panels (no in-campus layout) |
| Numbers | Real units underneath, cozy icons up front |
| Pressure | Supply shocks, politics/opinion, climate/physics, AI safety: all four |
| Art | Strict low-res + modern lighting; palette evolves with era |
| Stack | Vite + TypeScript + PixiJS v8 |
| Structure | Campaign + sandbox |
| Story | Cute advisor cast + Bit |
| First build | Thin vertical slice ("First Light") |
| Platforms | Desktop browser, mobile/touch, Steam/desktop later |

## 14. Open questions (defaults applied in M1)

1. Default startup name? **Applied:** player names it, defaulting to "Little Sun Labs".
2. Offline efficiency and cap? **Applied:** 1 month per hour, max 1 year (see §4).
3. Hard game-over in campaign? **Applied:** no game over. Cash crises trigger a bridge loan or emergency cuts.
4. Advisor, company and region names: still placeholders, so rename freely in `src/content/`.
5. Theme song: still open. Drop an MP3 in and it can be wired to the title screen.
6. Preact for UI panels? **Applied.**

---

## 15. Build status: M1 "First Light"

**Built**
- Vite 8 + TypeScript 7 + PixiJS 8.22 + Preact 10. Strict low-res stage with whole-number scaling and a
  smooth sub-pixel camera. Dioramas render at 2× pixel size.
- Master palette (~100 colours, hue-shifted ramps) with four era gradings. Everything re-bakes on an era change.
- Real-Earth map generated from Natural Earth: 12 blocs, biomes (warped organic edges), rivers, lakes,
  mountains and farmland patchwork; two LODs; real-time terminator and city lights; drifting clouds.
- 36 build sites, 9 supplier/cloud sites, 6 chokepoints. A* sea routing on the ocean raster with carved canals;
  shipments reroute when straits close.
- Simulation: power islands (solar/wind usable fraction depends on batteries; gas and grid fill the gap),
  grid interconnect queues and headroom, transmission links with losses, supplier queues with HBM
  sensitivity, weekly sea/air shipments, rack installs, PUE by climate and water, compute allocation,
  training runs, inference market vs rival labs and open-weights pressure, research tree (19 techs),
  safety margin with incident risk, regional social license, carbon, the K meter, monthly ledger.
- 20 events plus 3 scripted (welcome, bridge loan, Series A). 12 objectives guide Act I to the Series A.
- UI: top bar, dock, goal tracker, site/region/supplier inspector, compute, orders, research, finance,
  goals, news and settings panels, event cards with advisor portraits, toasts, tooltips (long-press on
  touch), title screen, "while you were away" and Act I complete screens. Responsive phone layout.
- Campus dioramas for every site: 9 backdrops, animated facilities (chiller fans, LEDs, wind rotors, gas
  smoke), construction states, workers and trucks, weather, real local time with night lighting, and time-lapse.
- Saves: autosave and save on hide, versioned migration, export/import codes. WebAudio SFX.
- Tests: sim determinism, Act I bot (finishes about day 800), offline progress, save round-trip, routing.

**Next (M2: Act II, The Scale-Up)**: fabs and packaging partnerships, nuclear, hydro and geothermal,
fiber, standing orders, the HBM-crunch chain, bigger campuses, Mira and Sol arcs, music.

---

## 16. M1.5 "The Front Door": built (v0.2.0)

Everything a player meets before and around the game: website, menu, onboarding, settings,
installable apps. Approved 2026-11-03 without the feedback form; built the same day.

### Decisions (locked 2026-11-03)

| Topic | Decision |
|---|---|
| Website | Landing page at `/`, the game at `/play/` |
| Address | https://thekardashevproject.netlify.app (one config value, easy to swap for a custom domain) |
| Tutorial | Bit-guided walkthrough (skippable, replayable) + Field Guide |
| Desktop | Tauri 2 now (small installers built by GitHub Actions). Game code stays wrapper-agnostic so a later switch to Electron for Steam is cheap |
| Signing | Unsigned for now, with a "how to open it" note on the download page |
| Settings | Gameplay, Display, Audio, Accessibility (+ Controls and Data) |
| New game | Save slots, difficulty presets, founder perks, custom start/seed |
| Phones | Landscape only: locked when installed, "rotate your phone" screen otherwise |
| Menu scene | Cinematic tour: globe fly-overs that cut into real campus dioramas |
| Extras | What's New, Credits & About. No feedback form for now (revisit when marketing). No analytics |
| Music | Your theme MP3 on the menu + code-made chiptune ambience in game |
| App icon | Pixel Earth |

### Numbers (as built; tweak in `content/difficulty.ts`)

**Difficulty**
| | Relaxed | Standard | Hard |
|---|---|---|---|
| Seed money | $600M | $400M | $250M |
| Random events | every 60–100 days | every 42–72 days | every 30–55 days |
| Crisis costs / incident risk | ×0.7 | ×1 | ×1.5 |
| Running out of cash | cheap bridge loan | bridge loan | **bankruptcy ends the company** (game-over screen, retry) |

**Founder perks** (a bonus with a matching flaw)
- **Safety-First**: safety research ×1.5, trust +5 everywhere / seed money −$50M.
- **Hardware Nerds**: data centers build 20% faster, PUE −0.05 / research −15%.
- **Growth Hackers**: inference revenue +20% / alignment −0.25 and trust −5.
- **Energy Natives**: solar, wind and batteries 15% cheaper, grid connections 25% sooner / training efficiency ×0.85.
- **Classic**: no perk.

**Custom start**: seed money ($100M–$2B), event frequency (off/low/normal/high), rival pace
(slow/normal/fast), and a shareable world seed. **Save slots**: up to 5 companies shown as cards
(name, home, date, K, model, difficulty, founder, playtime).

### What was built
1. **Site structure.** Multi-page Vite build (`/` landing, `/play/` game). Meta, OG and Twitter
   tags, canonical URL, robots and sitemap.
2. **Generated brand assets.** `npm run gen:assets` renders the Pixel Earth icon set (favicon,
   apple-touch, 192/512, maskable), the desktop icons (ICO/ICNS/PNG, each size drawn natively so
   nothing is resampled), the logo, the 1200×630 OG image and the hero globe from the game's own
   pixel code. Real gameplay screenshots live in `public/screenshots/`.
3. **Landing page.** Hero with a slowly spinning pixel Earth (the real map with a live day/night
   side, no game engine), Play in browser, Install/Download, feature cards, screenshots, a
   Kardashev-scale explainer, What's New, credits and footer. Fast and phone-friendly.
4. **Main menu.** A cinematic tour behind it, save-slot cards with Continue, the New Company
   setup (name, home with map preview, difficulty, founder perk, custom start), Settings,
   Field Guide, Tutorial, What's New, Credits, Get the app, and Quit on desktop.
5. **Tutorial.** 15 steps. Bit highlights the real UI (rent compute → train Bit-1 →
   allocate → research → pick a site → data center → power → chips) and waits for each action.
   Skip or replay any time.
6. **Field Guide.** About 20 short entries on the real concepts behind the game (capacity factor,
   batteries, grid queues, transformers and turbines, PUE, cooling water, accelerators, HBM, EUV,
   packaging, chokepoints, training vs inference, scaling laws, alignment, social license, carbon,
   open weights, export controls, the Kardashev scale). Entries unlock as you meet them, with a
   "new entry" toast.
7. **Settings.** Tabbed, from the menu and in game:
   - Gameplay: event frequency, auto-pause on events, offline progress and rate, autosave,
     confirm big spends, goal tracker.
   - Display: pixel scale, UI size, weather, clouds, CRT filter, day/night on/off, battery saver,
     FPS counter.
   - Audio: master/music/SFX volume, mute in background.
   - Accessibility: readable font, colour-blind-safe colours, reduced motion, high contrast.
   - Controls: shortcut list, scroll-to-zoom or scroll-to-pan.
   - Data: slots, export/import (code + file), reset.
8. **Audio.** Music player with fades and a slot for your theme MP3 (code-made theme until you
   drop one in), plus quiet chiptune ambience in game.
9. **PWA.** Installable from `/play/` with offline play, landscape orientation, Pixel Earth icons,
   iOS home-screen support, an "Install" button (or iOS instructions), and an "update ready" prompt.
10. **Desktop.** `src-tauri/` plus a GitHub Actions workflow. Pushing a `v*` tag builds a Windows
    installer (NSIS, per-user), a universal macOS `.dmg` (ad-hoc signed) and a Linux AppImage/`.deb`
    into a **draft** GitHub release; publishing it makes the website's download buttons appear. A
    local Linux build makes a 2 MB `.deb`.
11. **Docs.** `CHANGELOG.md` feeds What's New (game and website). CLAUDE.md, README and this spec
    are updated.

**Deferred:** the feedback form (until marketing), the real theme song (drop it at
`public/audio/theme.mp3`), code signing.
