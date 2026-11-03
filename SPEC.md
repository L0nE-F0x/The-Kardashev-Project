# The Kardashev Project — Game Spec v0.1

> A cozy-but-real pixel-art management sim about the AI boom. You start in 2027 as a scrappy AI
> startup and grow into the steward of Earth's whole AI stack (energy, chips, memory, data
> centers, networks, launch), guiding civilisation from **K ≈ 0.73 to Type I**, and later beyond.

Status: **M2 "The Scale-Up" is built and shipped** (v0.3.0) on top of M1 "First Light" and M1.5 "The Front Door":
Acts I and II are playable end to end. Section 17 is the Act II plan with as-built notes. **M3, Act III — The Charter,
is planned in section 18** (being built for v0.4.0). Section 13 lists the
locked decisions and section 15 tracks what's implemented. Developer notes live in `CLAUDE.md`.

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
controls, the HBM crunch event chain, more dioramas, standing orders. **Full plan: section 17.**

**M3: Act III, The Charter.** The role pivot, companies bidding on contracts, the rest of the
advisor cast, deeper bloc politics.

**M4: Acts IV–V.** Fusion, HVDC global grid, launch, orbital DCs, space solar, the Moon, the
thermal budget, the Type I ending.

**M5: Polish and ship.** Full sandbox mode, audio, mobile polish, signing and store builds. **The balance pass
happens here**: a full playthrough plus beta testers, then rebalancing across all acts before launch and marketing.
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

---

## 17. M2 "The Scale-Up": built (v0.3.0)

Act II, about 2029–34. You go from a Series-A startup to a hyperscaler: gigawatt campuses, your own
firm power, a hand on the chip pipeline, bloc politics, a race with Meridian and a board to answer to.
The act ends in a crisis on every front at once ("The Crunch"), then the IPO, then a cliffhanger
into the Charter. Planned 2026-11-03 in four Q&A rounds.

### Decisions (locked 2026-11-03)

| Topic | Decision |
|---|---|
| Feel | An even blend of empire builder, supply-chain chess, and story and crises |
| Shipping | **One big release (v0.3.0)**. Every system is in before it ships |
| Act goal | All four combined: an IPO checklist, a frontier race with Meridian, the multi-step finale crisis "The Crunch" whose outcome sets up Act III, and a cliffhanger into the Charter |
| Finale | "The Crunch": heat-dome grid emergencies, a strait blockade that halts chips, and a rival's safety incident, all within about 90 days. Each front you hold earns standing for the Charter |
| Chips | All four layers: three capacity pools (logic, HBM, packaging), supply deals, your own packaging plant plus a fab joint venture, and raw materials with mine stakes |
| Scale | All four: facility tiers, buying land for slots, new megasites, and a late-act Gigawatt Campus |
| Nuclear | Three paths on three timescales: restart a retired reactor (an event deal, about 2 years), order SMRs (a 4–5-year queue), or start a big reactor (8+ years, finishes in Act III) |
| Automation | Delegate to advisors: each advisor runs one job, with a toggle and a slider, and reports in the news |
| Money | All four: Series B and IPO with a board, project finance and debt, enterprise compute contracts, and government and bloc deals |
| Fiber | All three: regional inference markets, fiber and subsea cables you draw, and cable landing stations that can be cut |
| Rivals | Physical rivals that build on the map, talent wars, and acquisitions (including a takeover attempt before the IPO) |
| Visuals | All four: a gigawatt campus skyline, set-piece plants, a busier map, and dioramas for supplier sites |
| Entry | Finished Act I saves continue into Act II, plus a **"Start at Act II"** option in New Company |
| Onboarding | Unlock briefings: the advisor who owns a system gives a 1–3-step spotlight tour when it unlocks, plus new Field Guide entries |
| Pacing | About 5 game years (2029–34), roughly 2–3 hours of play. A balance bot checks it |
| Politics | Bloc relations and export rules, **plus a Blocs diplomacy screen** (treaties, lobbying, summits, elections) |

**Calls I made inside those decisions (change any):**
- **Two meters per bloc.** *Trust* (today's Social License: local people, permits, NIMBY) and a new
  *Relations* meter (the bloc government: export licences, nuclear approval, sovereign deals). Both
  appear side by side on the Blocs screen.
- **The era palette follows the act as well as K.** Act II won't move K much (a few GW against about
  20 TW of world power), so the world re-grades to *Grid Rush* when Act II starts. The rule is
  "the act's era or K's era, whichever is later".
- **Rivals share the supply pools with you.** When Meridian orders 200k chips, everyone's queue grows.
  Rival capability depends partly on the compute they actually build, so outbuilding them slows them down.
- **The capability curve gets retuned.** Rivals currently gain about +0.55 per year and would reach
  "Superintelligence" by 2034. Act II slows the drift, extends the model plan (Bit-3 … Bit-6) and
  checks that the tiers land sensibly: Bit-4 is "Scientist" at about the end of the act.
- **The v0.2.0 follow-ups ship in v0.3.0** (fullscreen counted as installed; fallback to the Releases
  link when the GitHub API fails), unless you want them sooner as a quick fix.

### How the act unfolds

| Phase | Roughly | What opens | Gate to the next phase |
|---|---|---|---|
| **1 · Gigawatts** | Year 1 after the Series A | Tier-2 facilities, buying land, hydro and geothermal, regional markets and fiber, the Blocs screen, Juno's and Mira's jobs, the first chain events | 250 MW of IT online, Bit-3 trained, $150M/month → **Series B** |
| **2 · The Stack** | Years 2–3 | The three supply pools in the UI, supply deals, packaging plant, fab JV, mines, export rules, SMR orders, the board, project finance, enterprise contracts, sovereign deals, all advisor jobs | Board formed, first deals signed |
| **3 · The Race** | Years 3–4 | Meridian announces the race, tier-3 facilities, megasites, the Gigawatt Campus, big reactors, acquisitions, the talent wars heat up, summits | The IPO checklist (below) is met, or mid-2034 arrives |
| **4 · The Crunch** | About 90 days | The finale on three fronts | Finale resolved → **IPO** → act complete and the cliffhanger |

**Act II goals (the IPO checklist):** raise the Series B · 1 GW of IT capacity online · 1 GW of your
own generation, at least 60% carbon-free · train Bit-4 · $1B/month revenue · reach the frontier (at
least match Meridian) at least once · safety margin ≥ −0.25 with no major incident in the last
12 months · come through The Crunch. All numbers are first guesses for the balance bot to tune.

### Systems

**1. Scale.** Facilities gain **tiers**. An upgrade is a construction overlay: the old capacity keeps
running and the new capacity switches on when the upgrade finishes. Proposed sizes (2029 prices, before
learning-curve discounts):

| Facility | Tier 1 → 2 → 3 | Notes |
|---|---|---|
| Data Hall | 10 → 50 → 200 MW IT | Tier 3 needs liquid cooling |
| Solar | 50 → 250 → 1,000 MW | |
| Wind | 50 → 200 → 600 MW | |
| Battery | 100 → 400 → 1,600 MWh | |
| Gas | 60 → 300 (CCGT) → 600 MW | |
| Research Lab | 50 → 200 → 500 researchers | Talent-limited per region (see Rivals) |
| **Gigawatt Campus** (new) | 1 GW IT, takes 4 slots, ~30 months | Late act, needs a tech and the Series B |

**Buy land:** +1 slot per purchase at a site, at most +3, each costing ×1.6 more and gated by trust.
**Megasites:** 6–8 new big, empty sites that open in phase 3, with 10 slots, lots of grid headroom and
long interconnect queues. Candidates: Wyoming High Plains, Patagonia Wind, Rub' al Khali, Lapland,
Gobi Edge, Northern Territory, Rajasthan Solar Park, Pampas.

**2. Firm power.** These plants run ahead of gas in the power stack.

| Plant | Size, capacity factor | Build | Where |
|---|---|---|---|
| Hydro | 150 MW, CF ~0.5 (seasonal, cut by drought) | ~3 yr | River sites only (new `hydroMW` site trait): Columbia Gorge, Paraná, Fjords, Luleå, Siberian Hydro, Copperbelt, Guizhou |
| Geothermal | 50 MW, CF ~0.9 | ~2.5 yr | Volcanic and rift sites (Reykjanes, Kenyan Rift, Kyushu). The *Enhanced Geothermal* tech opens hot-rock sites |
| Reactor restart | ~800 MW, CF 0.92 | ~2 yr | Event deal at 3–4 retired-reactor markers on the map. Needs Relations ≥ 50 |
| SMR pack (Little Sun Reactors) | 300 MW, CF 0.93 | 4–5 yr supplier queue | Any site with water ≥ 0.4 and Trust ≥ 55 |
| Large reactor | 1.1 GW | 8–10 yr, ~$10B | Usually financed with project debt. Finishes in Act III |

**3. The chip stack.** An accelerator order is produced at the slowest of three pools:
**logic** (Lumen/Kestrel wafers), **HBM** (Stackwell/Hanbit) and **packaging** (Bondline, or your own
plant). The Orders panel shows three bars per supplier, and the bottleneck glows. The existing `market.hbm`
number becomes the HBM pool, and the pools are shared with rivals.
- **Deals (Mira):** reserve capacity (pay up front for a guaranteed share and a locked price), co-fund
  a new line (about $1–3B, extra capacity for you after ~18 months), HBM allocation contracts, and
  Bondline packaging slots.
- **Packaging plant** (new facility): about 2 years to build. It adds packaging capacity that only you
  use, and you can sell what you don't need.
- **Fab JV with Kestrel:** about $8B over ~4 years, at a site with water, firm power (~200 MW) and
  talent. It needs EUV tools from Veldt, which have their own queue and fall under export rules. Your
  own chips at cost arrive near the end of the act.
- **Raw materials:** lithium (battery costs), copper (every build, transmission), and helium and neon
  (fab output) become market prices with shocks. A **mine stake** (Atacama and Pilbara lithium,
  Copperbelt copper, Gulf helium) shields you from part of the price swings and pays a little income.
  No mine logistics.

**4. Regional markets and fiber.** Inference demand lives in regions, sized by each region's existing
`demand` weight and growing over time. A data center serves its own region at full quality. To sell
into other regions it needs **fiber**: overland fiber is drawn like power lines (cheap, quick to build),
and **subsea cables** run between about 10 **cable landing stations** (Virginia Beach, Cornwall,
Marseille, Mumbai, Singapore, Fortaleza, Sydney, Tokyo Bay, Djibouti, Los Angeles). You can lease
capacity on an existing cable or lay your own (~$1B, ~2 years). Serving across an ocean costs about 30%
in latency. Anchor-drag and sabotage events can **cut a cable**, and having a second route pays off.
Training doesn't care where it runs, so "train in the cold north, serve near users" happens on its own.
Cumulus rentals serve everywhere.

**5. Advisor jobs (standing orders).** A new **Team** panel. Each advisor has one job with a toggle and
one or two sliders, and reports in the news with their portrait:
- **Mira:** keeps N months of chips on order for free rack space (preferred supplier, monthly budget cap).
- **Juno:** keeps power headroom ≥ X% at your sites (clean-first or cheapest-first) and requests grid connections.
- **Penny:** holds a cash floor. Below it, discretionary automatic spending pauses and she can draw on credit lines.
- **Sol:** renews licences and accepts routine community deals.
- **Iris:** keeps the safety margin above a target by shifting the compute split.
- **Bit:** starts the next training run when one finishes. Bit's job needs a safety margin ≥ 0
  (*you can only automate what you trust*).

**6. Money.**
- **Series B** at the end of phase 1 (about +$8B at roughly a $60B valuation). A **board** forms: quarterly
  revenue and burn targets and a **Board Confidence** meter (0–100). Misses bring pressure events
  (growth over safety, cost cuts, a CEO-review scare); hits raise the IPO valuation.
- **Project finance:** borrow against power plants and campuses (up to 70% of their value) at 6–9%
  depending on the bloc. Covenants (cash floor, coverage ratio) trigger events if you breach them.
- **Enterprise contracts:** offers on a contract board ("a pharma group wants 20k accelerators' worth
  of serving in ATL for 24 months"). Guaranteed monthly revenue, with an SLA penalty if outages or
  shortages leave you under-delivering.
- **Sovereign deals:** a bloc offers subsidies, cheap power or fast permits if you build X MW there,
  with strings attached (data residency, local hiring, model access).
- **IPO** at the end of the act. The valuation comes from revenue, growth, frontier position, Board
  Confidence, safety record and how the finale went. It is shown as a headline number on the
  act-complete screen.

**7. Blocs, export rules and the diplomacy screen (Sol).** A new **Blocs** screen with one card per
bloc: stance, Relations, Trust, active export rules, election countdown and open offers.
- **Export rules** block some supplier→region flows (for example leading-edge accelerators into
  Mainland East Asia, HBM caps to the Steppe, Veldt EUV tools needing a licence). Ways around them:
  a licence (time plus Relations), building locally, or transshipment through a third bloc, which risks
  seizure, fines and a hit to Relations.
- **Elections** every ~4 years per bloc. Stances can flip. Polls are shown in advance, and lobbying
  can nudge them (with a risk of scandal).
- **Lobbying** spends cash to raise Relations.
- **Treaties:** sign onto accords such as a safety-evaluation pact or a compute-sharing accord.
  Each comes with modifiers and obligations.
- **Summits:** periodic events where you take positions (safety commitments, compute caps, open
  weights) that shift Relations with several blocs at once. A preview of the Charter.

**8. Rivals.**
- **On the map:** Meridian, Lattice and Orchard get headquarters and campuses that take slots and grid
  headroom at real sites, order chips from the shared pools and show up as markers in their own colours.
  A small build AI per rival with its own preferences: Meridian builds big and fast, Lattice goes where
  the talent is, Orchard is cheap and anywhere.
- **The race:** in phase 3 Meridian publicly races you to the next tier. Being at or above the frontier
  when Bit-4 ships boosts the IPO. Falling behind isn't fatal, it just costs revenue and valuation.
- **Talent wars:** each region has a talent pool that rival labs draw down. Poaching events cut a lab's
  output unless you pay retention. Labs in crowded regions slow down.
- **Acquisitions:** startups show up for sale (a cooling startup that brings a tech, a small lab that
  brings talent and a slot, a grid-software outfit that speeds up interconnects). Late in the act,
  Meridian attempts a **takeover** before your IPO, as a board-vote event chain.

**9. Story: event chains, arcs and the finale.** Events gain follow-ups: a choice can schedule the next
step N days later. There are about 20 new random events, plus advisor arcs of 3–4 steps:
- **Mira, "The HBM Crunch":** a Hanbit yield problem → an allocation war → Stackwell's expansion offer → the outcome.
- **Sol, "Lines on the Map":** new export rules → a licence fight → a summit → a treaty.
- **Juno, "The Restart":** bringing a retired reactor back, from the town hall to first power.
- **Penny, "The Board":** board targets → a CEO-review scare → the takeover attempt → IPO prep.
- **Iris, "Race Dynamics":** the race pushes corner-cutting → an evals pact → a whistleblower choice.
- **Bit:** grows up (Bit-3 and Bit-4 sprites) and starts asking bigger questions.

**The Crunch** starts once the rest of the checklist is met (or by mid-2034 at the latest). It is a
90-day crisis on three fronts:
- **Grid:** a heat dome over two or more of your regions brings grid emergencies and derating.
- **Supply:** a blockade in the Fab Belt halts chips and HBM.
- **Safety:** a rival's rushed model causes an incident, and the blocs vote on a pause.

Each front shows *holding / at risk / lost*. You triage with cash, compute, batteries, stockpiles
and Relations. The number of fronts you hold (0–3) becomes **Charter Standing**, which sets your
seat in Act III and feeds the IPO.

**Ending:** the IPO event → the Act II complete screen (IPO valuation, Charter Standing, year) → the
cliffhanger: the blocs call an emergency summit and ask who could run the whole thing.

### Visuals and audio
- **Gigawatt campus skyline:** campus dioramas widen and scroll as a site tiers up, with rows of halls,
  substations, cooling towers, cranes during construction, and a sea of lights at night.
- **Set-piece plants:** an SMR cluster, a big reactor with steaming cooling towers, a dam with its
  spillway, geothermal vents and pipework, the packaging plant, the fab (cleanroom block and exhaust
  stacks), and a mine pit with haul trucks.
- **Busier map:** animated power flows and fiber glow along links, subsea cable lines and landing
  stations, rival campus markers, more cargo traffic (rival and supplier ships), and construction cranes
  on map icons.
- **Supplier dioramas:** Lumen's fab, Veldt's cleanroom, Bondline's lines, the Stackwell and Hanbit HBM
  fabs, mines, and Cumulus. You can visit them but not build there.
- **Characters:** Bit-3 and Bit-4 sprites, plus CEO portraits for Meridian, Lattice, Orchard, Kestrel,
  Little Sun and Veldt (for deals and rival events) and a board chair.
- **Era:** the Grid Rush grading starts with Act II.
- **Audio:** Act II in-game ambience gets a fuller variant, plus new sounds for upgrades, deals and
  cable cuts. The theme MP3 is still yours to drop in.

### UI
- **New panels:** **Team** (advisor jobs), **Deals** (tabs: Supply · Customers · Companies),
  **Blocs** (the diplomacy screen), and a **Board** section in Finance (confidence, targets, debt).
- **Map tools:** a fiber tool next to the power-line tool. Upgrade and buy-land buttons in the site
  inspector. Pool bars in Orders.
- **Act II goal tracker and Goals panel** (phase-aware), and a Grid Rush title card at the start of Act II.
- Keyboard shortcuts and phone layout for all of it (the dock gets an overflow on phones).
  `data-tut` targets on everything the briefings point at.

### Entry and onboarding
- A finished Act I save rolls into Act II after the Act I complete screen.
- **New Company → "Start at Act II"**: a ready-made company (Series A closed, a home campus with two
  data halls, solar, batteries and a grid connection, Bit-2, about $2B, a handful of techs). It works
  with every difficulty and founder.
- **Unlock briefings:** a 1–3-step spotlight tour from the owning advisor the first time each system
  opens, using the tutorial engine. Briefings can be skipped and replayed from the Field Guide.
- **About 15 new Field Guide entries:** reactor restarts, SMRs, large reactors, hydro, geothermal and
  EGS, advanced packaging, fab construction, critical minerals, subsea cables and landing stations,
  latency, PPAs and project finance, boards and IPOs, export controls, sovereign AI, talent markets.

### Under the hood
- **New sim modules:** `stack.ts` (pools, deals, materials), `network.ts` (fiber, cables, regional
  demand), `politics.ts` (Relations, rules, elections, treaties), `capital.ts` (board, debt,
  contracts, IPO), `rivals.ts` (rival builds, talent, acquisitions), `delegation.ts` (advisor jobs),
  `finale.ts`. The tick order grows to cover them. The sim stays pure and runs in Node.
- **State:** `act`, facility `tier`, new facility types (`hydro`, `geothermal`, `restart`, `smr`,
  `reactor`, `packaging`, `fab`, `campus`), land purchases, fiber links, cable leases, pools, deals,
  stakes, bloc Relations, rules, elections and treaties, the board, debt, contracts, rival facilities,
  talent, chain schedules and finale state. **SAVE_VERSION bump** with a migration from v0.2 saves.
- **Content first:** facilities, megasites, cable stations, techs (~15 new ones: tier unlocks, EGS,
  campus design, the reactor techs, packaging, EUV licensing and more), events and chains, deals,
  startups and treaties are all data in `src/content/`.
- **Tests:** an Act II bot plays from the "Start at Act II" preset to the IPO and should take 4–6
  game years. The Act I bot must still pass. Also determinism with the new systems, migrating a v0.2
  save, and routing checks for the new sites and cable stations.

### Build order (inside the one release)
1. Foundations: state and migration, act framework and goals, "Start at Act II", event chains with
   delayed follow-ups, the briefing engine.
2. Scale and firm power: tiers, land, megasites, the campus, hydro, geothermal and the three nuclear paths.
3. Regional markets, fiber, cables and landing stations.
4. The chip stack: pools, deals, packaging plant, fab JV, materials and stakes.
5. Blocs: Relations, export rules, elections, treaties, summits, and the Blocs screen.
6. Money: Series B, the board, project finance, contracts, sovereign deals, the IPO.
7. Rivals: map builds, the race, talent, acquisitions, the takeover.
8. Advisor jobs (Team panel).
9. Story: arcs, the new events, The Crunch, Act II complete and the cliffhanger.
10. Visuals: skyline, set pieces, busier map, supplier dioramas, Bit-3/4 and CEO portraits, Grid Rush.
11. Onboarding: briefings, Field Guide, tutorial targets.
12. Balance with the bot, QA in the browser (desktop and phone), docs (CHANGELOG, CLAUDE.md, README,
    this spec), and the v0.2 follow-ups.

**Release:** v0.3.0 "The Scale-Up". As always: ask before pushing `main`, before tagging, and
before publishing the draft release.

### As built (2026-11-04)

Everything above is in, with these numbers and adjustments from the balance bot (`tests/act2.test.ts`):
- **Series B gate** lowered to 100 MW of IT, Bit-3 and $75M/month (from 150 MW / $100M). Model plan: Bit-3 10²⁷,
  Bit-4 2×10²⁸, Bit-5 2×10²⁹, Bit-6 1.5×10³⁰ FLOP. Capability tiers now run to 9 (… Polymath, Architect, Oracle,
  Superintelligence) so Act II tops out around Polymath.
- **Rivals in Act II** improve at ~0.18–0.27 capability a year (0.32× the Act I pace, up to +50% from campuses they
  actually build), so Bit-4 lands within reach of Meridian around 2033.
- **Chip allocations** are 4× bigger in Act II (you're a real customer now), shrinking as rival campuses compete.
  The packaging pool only exists in Act II, so Act I is unchanged (the Act I bot still finishes on day 812).
- **Inference prices** fall 20% a year in Act II as everyone's chips get faster; contracts are priced the same way.
- **Mineral Counter-Controls** became a 15% slowdown for every fab outside Mainland East Asia, not a ban.
- **Penny's credit line** is open from phase 1; project finance lends up to 70% of what you own.
- **Juno** provisions power for your halls' full capacity (not just the chips installed), builds quick renewables
  first, tops batteries up to ~8 hours behind solar, then grid requests and land.
- **Act I crisis prices** scale ×2.5 at the start of Act II and grow 40% a year; Act II events are priced at Act II scale.
- **The Crunch** starts when the IPO checklist is done, or by 1 July 2034 at the latest (after at least 180 days of
  phase 3). Finale fronts lose pressure from batteries, firm power, stockpiles, your own fab, HBM/packaging deals,
  a healthy safety margin, treaty membership and good relations, plus event choices.
- **Balance (deferred by decision, 2026-11-04):** the bot is a cautious, single-campus player and reaches the IPO via
  the 2034 deadline (~5.6 years). We are building every act first; balance, full playthroughs and tuning happen in the
  pre-launch beta (see M5). Until then the bots are guard rails only: each act must be completable without stalls.

### Hooks left for Act III (The Charter)
- **Charter Standing** (`finale.standing`, 0–3 fronts held in The Crunch) should set your seat and leverage at the Charter.
- **IPO choices:** `flags.dualClass` (you kept control) vs one share, one vote; `capital.ipo` (valuation, cash raised).
- **Story flags:** `flags.broker` (you ran the Geneva channel between the Atlantic bloc and Mainland East Asia),
  `flags.investorSeat` (a Meridian-friendly investor sits on your board), `flags.bitDispatch` (Bit already runs dispatch).
- **Long builds that finish in Act III:** large reactors (8–10 years), co-funded fab and HBM lines, own subsea cables.
- **Cast and art ready to use:** Kip (Launch & Space advisor, defined but unused), CEO portraits for Meridian, Lattice,
  Orchard, Kestrel, Little Sun, Veldt and the board chair (`ceoPortraitUrl`), rival campuses on the map.
- **The cliffhanger:** the Act II complete screen ends with the blocs calling an emergency summit and asking who could
  coordinate power, chips and compute for the whole planet.

---

## 18. M3 "The Charter": plan (v0.4.0)

Act III, about 2035–44. After the Crunch, the blocs found **The Kardashev Project** in Geneva and make you its
**Steward**. You now wear two hats: you run the Charter (a planetary consortium with its own treasury, a Council of
twelve blocs and every company on Earth as a partner) *and* your own company, which is now one bidder among many.
The world's energy finally moves: Charter megaprojects add terawatts and Kardashev 0.75 is in reach. Planned
2026-11-04 in two Q&A rounds; the user approved building straight through overnight (plan → build → ship).

### Decisions (locked 2026-11-04)

| Topic | Decision |
|---|---|
| Your role | **Two hats + a blind trust.** You run the Charter and your company. Your company bids on Charter contracts like any member; favouring it costs Legitimacy (conflict-of-interest events). At any time you can put it in a blind trust: your advisors run it on standing orders, you can't touch it, Legitimacy rises |
| Contracts | **Post → bid → award → build** (2–4 companies bid a price and a timeline shaped by their traits; the winner builds it on the map, with overruns and scandals), **missions made of contracts** (big Charter missions open chains of contracts and pay off with permanent world-wide boosts), and **partner relationships** (awards, cancellations and penalties move them; burned companies lobby against you, loyal ones give discounts and favours). *Not* subsidies or price signals |
| Act goal | All four: **Kardashev 0.75**, a **Charter Mandate** checklist, a multi-front **finale crisis**, then a **renewal vote** and a cliffhanger into Act IV |
| AI & safety | All four: a **Charter safety regime** (licensing, compute caps, global evals, a world safety margin across every lab), **the race goes on** inside the Charter (defection and cheating events), **Bit grows up** (a co-advisor who can run Charter desks as trust builds), **open vs closed weights** policy |
| Politics | All four: **the Council votes** (12 weighted seats, resolutions, lobbying, favours, concessions), **dues and the budget** (blocs pay by economy and trust; unhappy ones pay late, cut dues or walk out), **factions and flashpoints** (Atlantic, Eastern, Non-aligned; sanctions; a rival project), **access and fairness** (a compute-access meter per bloc; the Mandate needs it) |
| Space | **Seeds of space:** Kip joins with an arc — a launch complex, an orbital compute test satellite, a space-solar demo. The big orbital systems wait for Act IV; the cliffhanger is Kip's first real orbital launch |
| World & art | All four: **megaprojects on the map** (region-scale builds that grow in stages, in the builder's colours), **world energy + a carbon budget** (every bloc's generation, clean share and emissions; overshoot makes heatwaves and droughts likelier), **first intercontinental HVDC links**, **Charter HQ + new dioramas** (Geneva, megaprojects, Kip's launch pad) and the **Solarpunk Bloom** palette from the start of the act |
| Shipping | One big release, **v0.4.0 "The Charter"**, built overnight and shipped end to end (commit, push, tag, publish) |

**Calls I made inside those decisions (change any):**
- **Act III phases live in `s.charter.phase`**; `s.phase` stays 5 so every Act II gate stays open. Act II systems keep running for your company.
- **The Charter has its own treasury**, separate from your company's cash. Contract prices are the Charter's *share* of a
  much bigger project (partners and private capital raise the rest); the full project value is in the tooltip.
- **K moves two ways:** Charter-built clean energy adds directly, and every completed project and mission speeds up the
  world's own growth (spillovers: cheaper kit, trained crews, better grids). World energy becomes a stateful system in
  Act III (Acts I–II keep the old formula, so they are unchanged).
- **Legitimacy** (0–100) is the blocs' confidence in your stewardship — the Charter's Board Confidence. **Political capital**
  is the Council currency (tabling resolutions, whipping votes, emergency sessions). Charter Standing from the Crunch sets
  the starting Legitimacy and capital; `dualClass`, `broker`, `investorSeat` and `bitDispatch` each tweak the start.
- **Conflict of interest:** awarding your own company costs Legitimacy unless its bid is clearly the best, more with
  dual-class shares; journalists may dig. In the blind trust the cost is small, your advisors (plus a trustee that
  expands halls, picks research and takes safe contracts) run the company, and the company buttons are locked.
- **Megaprojects are places:** twelve megaproject sites, one per bloc, each suited to its resource (Sahara Solar Belt,
  North Sea Wind, Gobi Wind & Storage, Pacific Reactor Fleet…). Every energy contract is built at one; the site grows
  through three stages as gigawatts complete.
- **New cast:** partner CEOs for Halcyon, Brightwater, Sunforge, Spanwire (HVDC), Tidewater, Deepvein, Saltflat, Lumen,
  Stackwell, Hanbit, Bondline, Cumulus, Stratum, Parabola and Kármán, plus three faction delegates. Kip finally speaks.
- **Charter HQ is in Geneva** (the old "Geneva channel" from Act II pays off if you ran it).

### How the act unfolds

| Phase | Roughly | What opens | Gate to the next phase |
|---|---|---|---|
| **1 · The Founding** | Year 1 | The founding chain (summit, your seat, the first budget), the Charter panel (treasury, contracts, missions, partners), the Council, the blind trust, Kip joins, missions *Clean Power for All* and *Compute for Everyone* | First contract awarded, first resolution passed (or 360 days) |
| **2 · The Build-Out** | Years 2–4 | *The Chip Commons*, HVDC links (*The Global Backbone*), the World screen and the carbon budget, factions and flashpoints, Kip's launch complex (*First Steps Off-World*), Charter desk jobs | 6 contracts completed and K ≥ 0.738 (or 900 days) |
| **3 · The Frontier** | Years 4–7 | *A Safe Frontier* (compute caps, licensing, open-weights policy), Bit's co-pilot desk, the rival project threat, the Oracle race, the orbital test and space-solar demo | The Mandate checklist is met, or 1 Jan 2044 arrives (after ≥ 365 days of phase 3) |
| **4 · The Threshold** | 120 days | The finale on three fronts | Finale resolved |
| **5 · Renewal** | Days | The Council votes on renewing the Charter with planetary powers → the cliffhanger → Act III complete | — |

**The Charter Mandate (Act III goals):** reach **K 0.75** · complete *Clean Power for All* · complete *The Chip Commons* ·
every bloc's compute access ≥ 40 · a working safety regime (licensing in force, an evals programme done, world safety
margin ≥ 0) · Legitimacy ≥ 50 · Kip's orbital compute test · come through The Threshold · the renewal vote.

### Systems

**1. The treasury.** Dues come in monthly from each bloc: its economy share × the dues level × its willingness
(relations, Legitimacy, walkouts, arrears). Founding budget ~$25B; standard dues ~$12B/month in 2035, growing with
the world economy. Spending: contract payments (20% on award, the rest spread over the build), mission programmes,
favours and concessions. If the treasury can't pay, contracts fall into arrears: they slow down and partners sour.
Your company can donate to the Charter (Legitimacy up). Monthly Charter ledger with history.

**2. Partners.** Every company is a partner with five traits (Reliability · Speed · Cost · Ambition · Ethics, 1–5),
a quirk, a CEO, sectors it bids in, a home bloc, a capacity (concurrent contracts, from Ambition) and a
relationship (0–100). Cheap partners bid low; fast ones bid short; unreliable ones overrun; low-Ethics ones cause
scandals; ambitious ones over-promise. Relationship moves with awards (+), on-time payments (+), being passed over
when best (−), penalties (−), cancellations (−−). Below 30 they stop bidding and lobby their home bloc against you;
above 70 they discount (−8%) and offer favours (events). Your own company bids too, in the sectors it knows.

**3. Contracts.** Post a contract from a menu, choose where (a megaproject site, a bloc, an HVDC route, a launch site)
and a size (S/M/L). A tender stays open 21 days while eligible partners bid; award any bid. The builder's project
appears on the map and progresses daily; monthly trouble rolls (delay, overrun, scandal, strike) come from its traits.
Actions: award, expedite (+25% price, −20% time left), claim damages on a late project, cancel (refund, relationship
and Legitimacy hit). Kinds (value per unit, Charter share, typical build):
- **Energy** at megaproject sites: solar & storage park, wind field, reactor fleet, pumped hydro, enhanced
  geothermal (S/M/L ≈ 25/75/200 GW average for solar; ~$2/W-average and falling). Adds world power and clean share.
- **HVDC link** on one of six intercontinental routes (Sahara–Europe, Outback–Asia, Gobi–Fab Belt, North Sea–Nordic
  ring, Gulf–Subcontinent, Plains–Pacific). Megaprojects behind it deliver more; cheaper, cleaner grid power at both ends.
- **Chips:** logic fab line (Lumen, Kestrel), HBM line (Stackwell, Hanbit), packaging line (Bondline), EUV tool line
  (Veldt, who names its price). Raise everyone's chip pools (yours included), soften export frictions, raise access.
- **Access:** public compute campus (Cumulus, Stratum, the labs, your company), open subsea cable. Raise a bloc's access.
- **Safety:** frontier evals programme, interpretability consortium (Lattice, Meridian, Orchard, your company). Raise
  world alignment.
- **Space (Kip):** launch complex, orbital compute test, space-solar demonstrator (Parabola, Kármán).
- **Fusion:** a pilot-plant grant to Sunforge (Act IV hook; feeds the cliffhanger).

**4. Missions.** Six missions, each a chain of contract goals with a permanent world-wide reward:
*Clean Power for All* (Charter clean energy at three megaprojects → cleaner, cheaper grids everywhere, faster world
growth), *The Chip Commons* (fab, HBM and packaging lines in three blocs → bigger chip pools, softer shortages),
*Compute for Everyone* (every bloc's access ≥ 50 → new markets, Global South goodwill), *A Safe Frontier* (licensing,
evals and interpretability, a positive world margin for a year → incidents less severe everywhere, Bit's co-pilot),
*The Global Backbone* (two HVDC links → megaprojects deliver more, softer grid emergencies), *First Steps Off-World*
(launch complex, orbital test, space-solar demo → Act IV hooks).

**5. World energy and the carbon budget.** Each bloc has generation (TW), a clean share and emissions. The world grows
1.6%/yr on its own, faster as Charter energy, missions and HVDC links pile up (capped ~5%/yr). New energy gets
cleaner as missions complete. A 2°C carbon budget (~500 Gt CO₂ in 2035) burns down with emissions; past zero,
heatwaves and droughts are likelier and the finale's grid front starts harder. The World screen shows all of it,
plus K's progress to 0.75.

**6. The Council.** Twelve seats with weighted votes (ATL 12, EAM 11, EUR 10, SAS 8, PAC 7, FAB 7, LAT 6, SEO 6, MENA 6,
SSA 6, STP 5, NOR 4). Sessions every 90 days vote on up to three tabled resolutions; you table with political capital
and see each bloc's forecast vote. Before a session you can whip a leaning bloc (capital), offer a favour (treasury)
or a concession. Resolutions (pass/fail, some repealable): raise dues, dues relief for developing blocs, frontier compute
cap, frontier run licensing, three open-weights policies (open / staged / closed, mutually exclusive), export-rule
harmony, no new fossil power, the Access Pledge, emergency powers, the orbital commons protocol, mandatory incident
reporting, an AI windfall levy (your company pays too). A bloc's vote comes from the resolution's appeal to its
stance, faction and wealth, plus relations, Legitimacy, whips and favours.

**7. Factions and flashpoints.** Atlantic (ATL, PAC, EUR, NOR, FAB), Eastern (EAM, STP), Non-aligned (LAT, SSA, SAS, SEO,
MENA). Tension rises when votes go against a faction, when Charter spending skips it, and with flashpoint events
(a Fab Belt standoff, sanctions, a contested HVDC link); it falls with concessions, projects and harmony resolutions.
High tension → a member bloc walks out (no dues, no vote) until a demand is met; very high → the rival
*Concord Initiative* forms and pulls dues away.

**8. Access and fairness.** Each bloc's compute access (0–100) starts unequal (SSA ~12, the Atlantic ~80). Public compute,
cables, megaprojects, HVDC endpoints and your own halls there raise it; the Access Pledge speeds it up. Projects in
poorer blocs earn extra relations and Legitimacy.

**9. The safety regime.** A **world safety margin** = world alignment − the frontier (the best model of any lab,
yours included). World alignment grows with Charter evals and interpretability programmes, your company's safety
research, licensing and the labs' own work. Below zero, rival labs have incidents that dent Legitimacy and trust.
The compute cap slows every lab (yours too: runs above the cap need a Charter licence — the evals route takes 90 days,
the fast track costs Legitimacy). Licence requests, inspections, a lab running a secret run, a lab threatening to
move to a non-member bloc, whistleblowers. Open-weights policy shifts Orchard, research, access and incident risk.
**Bit grows up:** Bit-5 (Architect) and Bit-6 (Oracle) sprites, an arc about what Bit is, and a co-pilot desk once
your margin and the world's are healthy (the Act IV autopilot seed).

**10. Two hats.** Your company runs on as in Act II. The **blind trust** toggle hands it to your advisors (all jobs
on) plus a trustee; company buttons lock; conflicts cost much less and Legitimacy drifts up. Leaving it costs
Legitimacy and has a one-year cooldown. Conflict-of-interest events: a journalist's exposé, a rival's complaint,
an ethics probe, the investor on your board leaking tender details to Meridian.

**11. Charter desk (delegation).** Standing orders for the Charter in the Team panel: Mira's tender desk (awards the
best-value bid, never your own company), Juno's project oversight (expedites late projects), Sol's Council whip
(spends capital on leaning votes for what you tabled), Penny's treasury reserve, and Bit's co-pilot (posts the next
mission contract and awards it; needs trust).

**12. Kip and space.** Kip's arc: the pitch → a launch complex contract at one of five candidate sites (Guiana coast,
Gulf coast, Malindi, the Steppe, the Arctic) → the orbital compute test (a satellite crosses the map) → the space-solar
demo → the heavy lifter. The orbital commons protocol resolution smooths the later steps.

**13. The finale: The Threshold.** 120 days, three fronts, each *holding / at risk / lost*:
- **The Grid** ("The Long Summer"): a planetary heatwave. Pressure from the carbon budget, low firm clean power and
  storage; relief from HVDC links, megaprojects, emergency powers and your company lending power.
- **The Frontier**: a lab's model approaches superintelligence and fails an eval. Pressure from a negative world
  margin and missing licensing; relief from evals, a trusted Bit, halting the run, safety pledges.
- **The Council**: a faction walks out and threatens the Concord Initiative. Pressure from tension, low Legitimacy,
  arrears and access gaps; relief from concessions, emergency sessions and access projects.
Fronts held (0–3) become the **Planetary Mandate** carried into Act IV.

**14. Renewal and the ending.** The Council votes on renewing the Charter with planetary powers. Every bloc's vote
comes from relations, Legitimacy, access, fronts held and walkouts, plus a closing speech you choose. ≥ ⅔: *the
Planetary Charter*; > ½: *renewed with limits*; otherwise *a caretaker term* (no game over). Then the cliffhanger:
Parabola's heavy lifter carries the first orbital compute module, and Sunforge reports ignition if you funded it →
the Act III complete screen (K, year, renewal, fronts, Legitimacy, missions, clean share, carbon budget) → sandbox.

### Visuals and audio
- **Era:** Solarpunk Bloom from the start of Act III (the act's era or K's, whichever is later).
- **Map:** the Charter HQ marker in Geneva, twelve megaproject sites that grow in stages with cranes in the builder's
  colours, glowing HVDC links with flowing pulses, launch-site candidates and the launch complex, public compute
  campuses in the blocs, the orbital test satellite crossing the map.
- **Dioramas:** the Charter HQ (a Council hall with twelve bloc banners, a secretariat, a lakeside plaza, the Alps), the
  megaprojects (a solar sea to the horizon, an onshore and an offshore wind field, a reactor fleet, a pumped-hydro
  reservoir, geothermal well pads, storage yards), and Kip's launch complex (pad, tower, rocket, assembly hall).
- **Characters:** Kip in events, fifteen partner CEOs, three faction delegates, Bit-5/6/7 sprites. CEOs speak on event
  cards and appear on partner cards.
- **Audio:** an Act III ambience variant; sounds for awards, votes and launches.

### UI
- **Charter** panel (tabs: Overview · Contracts · Missions · Partners · World) and **Council** panel (Agenda · Blocs &
  factions). Team panel gains the **Charter desk**. Top bar gains the treasury and Legitimacy in Act III.
- Site inspector for the Charter HQ, megaproject and launch sites. **Threshold tracker** for the finale.
- Act III goal tracker and Goals panel, the Solarpunk Bloom title card, the Act III complete screen.
- `data-tut` targets on everything the briefings point at; phone layout and keyboard shortcuts.

### Entry and onboarding
- A finished Act II save rolls into Act III after the Act II complete screen (v0.3 saves in the post-IPO sandbox too).
- **New Company → "Start at Act III"**: a ready-made public company in early 2035 (gigawatt campus, ~1.5 GW of IT,
  its own clean power, Bit-4, ~$25B, Act II techs) with Charter Standing 2.
- **Briefings** for the Charter, contracts, the Council, the blind trust, missions, the World screen, the safety regime,
  Kip and the Charter desk. **About 14 new Field Guide entries** (consortia, procurement, conflicts of interest,
  megaprojects, supergrids, the carbon budget, energy access, compute governance, frontier evals, open weights, launch
  economics, space solar, orbital data centres, fusion).

### Under the hood
- **New sim modules:** `charter.ts` (treasury, partners, contracts, missions, access, desk jobs), `world.ts` (world energy,
  clean share, carbon budget), `council.ts` (resolutions, sessions, votes, factions, walkouts, the rival project),
  `frontier.ts` (world safety margin, caps, licensing, open weights), `trustee.ts` (blind trust), `act3.ts` (founding,
  phases, the preset), `threshold.ts` (finale, renewal). The sim stays pure and runs in Node.
- **State:** `charter` (phase, treasury and ledger, Legitimacy, capital, partners, tenders, projects, missions, access,
  desk jobs, blind trust), `world` (TW, growth, blocs, carbon), `council` (resolutions, agenda, next session, factions,
  walkouts), `frontierRegime` (alignment, caps, licences). **SAVE_VERSION 4** with a migration.
- **Content first:** partners, contract kinds, megaprojects, HVDC routes, launch sites, missions, resolutions, factions,
  techs, events (`events3.ts`), objectives, briefings and Field Guide entries are all data.
- **Tests:** an Act III bot from the "Start at Act III" preset to the renewal vote (no stalls, no NaNs, within the
  deadline); the Act I and Act II bots unchanged; determinism; migrating a v3 save; routing for the new sites.

### Build order (inside the one release)
1. SPEC, types, content and view helpers (the contract the art agents code against).
2. Two background art agents with disjoint files: dioramas (`render/diorama/*`) and map + portraits + icons
   (`render/worldMap/*`, `render/sprites/*`, `ui/icons.ts`).
3. Sim: act framework and preset, treasury, partners and contracts, missions, world energy, council, frontier, trustee,
   desk jobs, finale and renewal.
4. Events and arcs, objectives, techs.
5. UI: panels, top bar, inspector, tracker, modals, New Company, briefings, Field Guide.
6. Tests and the Act III bot; browser QA (desktop and phone); docs; release v0.4.0.
