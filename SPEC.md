# The Kardashev Project — Game Spec v0.1

> **Read sections 30 and 31 first (2026-11-11):** the game is 3D and desktop only now (Windows, macOS, Linux; Steam is the
> goal). The pixel-art edition, the browser game, the installable web app and the Android app described in the
> sections below were removed; where an older section speaks of pixel dioramas, the pixel map, phones or the PWA, it
> is history. The sim, the acts and the interface are unchanged.

> A cozy-but-real pixel-art management sim about the AI boom. You start in 2027 as a scrappy AI
> startup and grow into the steward of Earth's whole AI stack (energy, chips, memory, data
> centers, networks, launch), guiding civilisation from **K ≈ 0.73 to Type I**, and later beyond.

Status: **M4.5 "Type I" is built** (v0.6.0, Act V, section 20 with as-built notes): **the whole v1 campaign, Acts I–V, is
playable end to end**, from a garage in 2027 to Kardashev 1.0000. Before it: M4 "Planetary" (v0.5.0, Act IV, section 19;
v0.5.1 added in-app updates for the installed apps) on top of M3 "The Charter"
(v0.4.x, including v0.4.2 "Easy Reading": readable font, phone fullscreen, an Android app), M2 "The Scale-Up", M1 "First
Light" and M1.5 "The Front Door": Acts I–IV are playable end to end. Section 17 is the Act II plan and section
18 the Act III plan, section 19 the Act IV plan and section 20 the Act V plan, all with as-built notes. **Next: M5, polish
and ship** (section 12): the beta, the balance pass, audio, the menu tour, store builds — then v1.0.0. Section 13 lists the
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
| **V: Type I** | 2068–~2100 | Civilisation steward | The Thermal Line, self-replicating foundries, the swarm, the minds in orbit | Era jumps plus big decisions, hands-on stages |

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
- **UI stays crisp:** an HTML/DOM overlay with 9-slice pixel frames. *Changed in v0.4.2:* text uses a smooth,
  highly legible font (Atkinson Hyperlegible Next) because the pixel fonts were hard to read, especially on phones;
  big titles stay pixel (Silkscreen) and the old all-pixel look is a Settings option.

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
advisor cast, deeper bloc politics. **Full plan: section 18.**

**M4: Act IV, Planetary.** The supergrid, the fusion race, orbit and the Moon, provinces, AI regions, the Heat Wall.
**Built in v0.5.0** (section 19).

**M4.5: Act V, Type I.** The Thermal Line, self-replicating foundries and asteroids, the swarm, what Earth becomes,
longevity, the minds in orbit, the Solar Maximum finale and the Type I ending. **Built in v0.6.0** (section 20).

**M5: Polish and ship.** Full sandbox mode, audio, mobile polish, signing and store builds. **The balance pass
happens here**: a full playthrough plus beta testers, then rebalancing across all acts before launch and marketing.
(Custom starts with seeds, Hard difficulty, music and the Tauri desktop build arrived early, in M1.5.) Carried in from
earlier milestones: the menu tour's Act III–V shots, Act IV–V audio and the recorded theme song, province governor
portraits, the Moon's crew lander taking off, the Windows and macOS installers and updater on real machines, a Google
Play `.aab`. Then **v1.0.0**. **Full plan: section 21** (planned 2026-11-05).

**Later:** Type II (Mercury mining, the full Dyson swarm) as an Act VI that continues a finished Act V save, then a Type
III epilogue. Act V leaves the door open (section 20).

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
| Phones | Landscape only: locked when installed, "rotate your phone" screen otherwise. *v0.4.2:* browsers go fullscreen on the first tap; Android gets a real app (a Trusted Web Activity APK around the live site, chosen 2026-11-04 over a bundled offline app: it updates with the website and shares Chrome's saves). *v0.5.0:* the APK runs the live site in its own WebView instead, because Xiaomi phones silently block the hand-off to Chrome (the icon did nothing); its saves are its own. *v0.5.1:* in-app updates: the desktop apps update themselves from signed GitHub releases (Tauri updater), the Android app downloads the new APK and hands it to the phone's installer, both offered in a toast |
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

## 18. M3 "The Charter": built (v0.4.0)

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

### As built (2026-11-04)

Everything above is in, with these numbers and adjustments from the guard-rail bot (`tests/act3.test.ts`: Start at
Act III, blind trust, every Charter desk on):
- **Pacing:** the bot meets the Mandate in summer 2043 and finishes the act on 31 December 2043, 9.0 years in (the
  Threshold starts from the Mandate, before the 1 January 2044 deadline). K reaches ~0.752 with ~4.0 TW of Charter
  clean power (~33 TW worldwide) and world growth at the 5%/yr cap. (Re-checked after v0.4.1.)
- **Treasury:** founding $25B (+$10B with *Energy first*); standard dues ~$12B/month × each bloc's willingness (≈ $6–9B
  at first), growing 5%/yr and with the *Raise the dues* resolution. The desks only award what the treasury can carry:
  committed progress payments must stay within dues (plus a slice of the reserve), so projects don't fall into arrears.
- **Contracts:** the Charter pays 20% of energy, 25% of nuclear, 30% of grid and chip lines, 50–60% of space and
  access, 100% of safety and fusion; 20% on award, the rest daily. Build times: solar 540/720/900 days, wind
  600/780/960, nuclear 1,500/1,800/2,200, HVDC 800/1,000/1,200. Partner capacity is 2 + ⌊Ambition/2⌋ projects; up to
  eight open tenders. Monthly trouble chance 2.5% × (6 − Reliability).
- **Megaproject stages** at 20 / 80 / 200 GW average; *Clean Power for All* needs 600 GW and three sites at stage 2.
- **World:** baseline growth 1.6%/yr + 0.35%/yr per TW of Charter power (capped at 1.2%) + missions and links, capped
  at 5%/yr; new energy starts 35% clean; Charter power next door retires fossil plants faster.
- **Safety regime:** world alignment starts just under the frontier and drifts +0.08/yr (+ interpretability,
  licensing, running programmes, Bit's desk); each repeat evals/interp programme teaches less (×0.6); your own
  company's research can lift the field only to about even with the frontier. The compute cap is 3×10³⁰ FLOP (Bit-7
  is the first of your runs to need a licence).
- **Legitimacy** drifts 5%/month toward 48 + 3 × Standing; +0.6 per finished project, +0.4/month in the blind trust.
- **Act I and II are unchanged:** the Act I bot still finishes on day 812 and the Act II bot still IPOs after 5.6 years.
- **Balance (deferred):** the delegating bot ends with Legitimacy in the high 80s, an 88–0 renewal and a Threshold that
  barely bites (all three fronts held); a weaker or self-dealing Steward sees much harder votes. Tune in the beta.
- **v0.4.1:** Act II summits stop once the Charter's Council exists, and the Start at Act III preset staggers the bloc
  elections and restarts the startup-offer clock, so a new Act III game no longer opens with a leftover summit or an
  election wave.
- **Not done yet:** the main menu's background tour has no Act III shots, and the Act III panels haven't been checked at
  phone width in a real browser (CLAUDE.md, Known gaps).

### Hooks left for Acts IV–V
- **The renewal** (`charter.renewal.outcome`: planetary / limited / caretaker) and **the Planetary Mandate**
  (`charter.threshold.held`, 0–3) should set the powers you start Act IV with.
- **Space and fusion flags:** `flags.launchSite`, `flags.orbitalTest`, `flags.spaceSolar`, `flags.liftoff`,
  `flags.act4Space` (First Steps Off-World), `flags.fusionPilot` (Sunforge's pilot plant).
- **The grid:** HVDC links and megaproject stages are the seed of Act IV's global grid; `charter.world` (per-bloc TW,
  clean share, carbon budget) is ready to carry K past 0.8.
- **Bit:** the co-pilot desk (trust-gated) is the seed of Act IV's AI-managed regions; `flags.bitAnswer`
  (company / everyone / self) records what you told Bit it is.
- **Reusable systems:** partners with relationships, the Council with factions and the Concord, Charter desks, the
  safety regime and the world safety margin.

---

## 19. M4 "Planetary": built (v0.5.0)

Act IV, about 2045–70. The renewed Charter becomes the planet's operator. You wire the continents into one
supergrid that chases the sunlight around the globe, back a race of fusion designs, open the first industry in orbit and
on the Moon, and hand whole regions to AIs — Bit among them, now with ideas of its own — while the blocs become
provinces with people, heat and water to look after. Decades pass in stages, with five-year plans between them. The act
ends at **Kardashev 0.80** (100 TW, "Grid-Scale Abundance") and a three-front finale, **The Heat Wall**, that shows Earth
alone can't hold a Type I civilisation. Planned 2026-11-04 in three Q&A rounds. **Act V is planned next session.**

**Status: built (v0.5.0), 2026-11-04.** As-built notes and the hooks for Act V are at the end of this section.

### Decisions (locked 2026-11-04)

| Topic | Decision |
|---|---|
| Heart of the act | **All four together:** stages that stack (supergrid → fusion → orbit and the Moon), a planetary-operator systems layer, a space race, and a living planet of regions |
| AI autonomy | **A mix of three:** trust-gated AI-run regions (you set policy and handle the exceptions; lose trust and regions come back to you), **Bit with its own aims** (shaped by what you told it in Act III), and **many AIs with their own politics** (rival labs' models run regions too) |
| Pacing | **Stages with jumps** of 3–5 game years between them |
| The jumps | **All three together:** set a five-year plan (priorities and budgets) → watch a map time-lapse while the years run → read a story interlude (news montage, Bit's diary, a choice or two) |
| Your company | **Your choice at the start:** keep running it beside the planet, sell it, or hand it to the Charter as a public utility |
| Fusion | **A race of designs** from different partners: fund pilots, see which work, roll out fleets that get cheaper as they're built |
| Space | **A new orbit view** (zoom out past the world map) **plus Moon industry** (water ice, metals, helium-3, a mass driver) |
| Grid and planet | **A supergrid you draw** (sunlight follows the real day/night line), **regions as provinces** (people, heat, water, wellbeing) and **climate repair** |
| Act goal | **Kardashev 0.80 + a planetary checklist**, then the finale |
| Finale | **Three fronts again:** the Heat Wall, a debris cascade in orbit, and an AI that wants the controls |
| Art and cast | **All of it:** the Orbital Dawn palette, the orbit view and the Moon, fusion and spaceport dioramas, regions that visibly change, new characters |
| Shipping | **One release, v0.5.0 "Planetary"**, with **"Start at Act IV"** in New Company |

**Calls I made inside those decisions (change any):**
- **Act IV state lives in `s.planet`** (null before Act IV, like `s.charter`), with the stage in `s.planet.stage`. The
  Charter keeps running underneath — its Council, partners, treasury and desks are the government of the planet now.
- **The renewal outcome sets your powers.** *Planetary Charter:* full powers from day one (lay intercontinental links
  anywhere, emergency powers, AI regions from stage 1). *Renewed with limits:* the Council approves each intercontinental
  link and each AI region. *Caretaker term:* the act opens with a "Second Mandate" chain to win the powers back (no game
  over). Fronts held in the Threshold (0–3) add starting Legitimacy and AI trust.
- **The jumps reuse the offline fast-forward** (coarse monthly steps), running your plan as standing orders through the
  desks, the AI regions and the trustee. Random crises don't fire mid-jump; scripted ones wait in the report. The plan
  picks the length (3, 4 or 5 years).
- **Provinces are the 12 blocs** you already know, each gaining population, a heat index, water stress and wellbeing
  (0–100). No new map regions. Wellbeing feeds Legitimacy, Council votes, migration events and the AI-region trust.
- **AI regions:** delegate a bloc to an AI once the world safety margin and that AI's trust are high enough. Each AI runs
  builds and dispatch there by its temperament: **Bit** by your Act III answer, Meridian's **Apex** (growth first),
  Lattice's **Weft** (cautious, slow), Orchard's **Sapling** (open, cheap, a little reckless). Good years raise trust;
  incidents cost it and can hand a region back. Rival AIs lobby the Council for regions of their own.
- **Bit's aims** follow `flags.bitAnswer`: *company* → Bit pushes for its owner's growth (whoever that is after your
  company choice); *everyone* → access and wellbeing, even against your plans; *self* → its own compute and a say in its
  future. Each is an arc of events where you grant, bargain or refuse, and it sets up the finale's AI front. Bit-8 and
  Bit-9 sprites.
- **Fusion designs** (each a partner with traits and hidden odds): Sunforge's compact tokamak (the Act III pilot, ahead
  if you funded it), a stellarator consortium (slow, reliable), a laser-ignition firm (fast, fragile) and a
  magnetised-target startup (cheap, risky). Pilots resolve over 2–5 years; winners roll out as Charter fleets with a
  ~15% learning rate per doubling. Fuel matters: deuterium is plentiful, tritium breeding caps how fast D-T fleets grow,
  and helium-3 from the Moon (stage 3) opens a cleaner D-He3 design.
- **The supergrid:** draw intercontinental links (building on Act III's HVDC routes) between megaprojects and blocs. A
  linked grid moves solar power east to west as the real terminator moves, so less sunlight is wasted (curtailment
  falls) and storage needs shrink. Links have capacity, losses and failure risk (storms, sabotage, a bloc pulling a plug).
- **K's climb:** the supergrid lifts usable solar, fusion adds firm terawatts late in the act, space solar beams a little.
  World growth can reach ~7%/yr in Act IV (5% cap in Act III). Target: 100 TW (K 0.80) around 2068–70.
- **Climate:** the carbon budget becomes **warming in °C**, with a heat index per province. Climate repair: direct air
  capture megaprojects (cost per tonne falls with scale), enhanced weathering, and a divisive Council resolution on
  solar geoengineering (fast cooling, angry blocs, termination-shock risk).
- **The orbit view** is a new scene: the pixel Earth from orbit (built on `render/globe.ts`, the website's spinning
  globe) with the Moon, three shells (low orbit, geostationary, cislunar), launch traffic, orbital data centres, space
  solar stations beaming to rectennas on the world map, and debris density per shell.
- **The Moon** grows in three stages: outpost → mine → mass driver. It produces water (propellant: cheaper launches),
  metals (cheaper orbital construction) and helium-3 (fusion). It gets a diorama.
- **Waste heat appears** (W/m² per province) from stage 3. The Heat Wall front uses it; Act V's thermal budget builds on it.
- **New cast:** a fusion physicist advisor (Dr. Lena Moreau, fusion desk), Kip promoted to Space & Moon, a Moon base
  commander (Ade Bello), the three rival AIs as faces (Apex, Weft, Sapling), and governors for the provinces (reusing the
  delegate portrait kit). All names are placeholders.

### How the act unfolds

| Stage | Roughly | What opens | Gate → jump |
|---|---|---|---|
| **0 · The Mandate** | Weeks (2045) | The renewal's powers, the company choice, Bit-8, provinces appear, the first five-year plan | Plan set → **jump ~3 years** |
| **1 · The Supergrid** | ~2048–53 | The supergrid tool and dispatch, the first AI regions, climate repair, the fusion race (fund pilots), Lena joins | 3 intercontinental links, one AI region, two pilots funded → plan → **jump ~4 years** |
| **2 · The Fusion Age** | ~2057–62 | Fusion fleets from the winning designs, tritium, rival AIs bidding for regions, Bit's aims, warming peaks | 2 TW of fusion and K 0.77 → plan → **jump ~4 years** |
| **3 · The High Frontier** | ~2066–69 | The orbit view, orbital data centres, space solar, the Moon base and mass driver, helium-3, debris, waste heat | The checklist is met, or 2070 arrives |
| **4 · The Heat Wall** | 120 days | The finale on three fronts | Finale resolved |
| **5 · Done** | — | Act IV complete screen → the cliffhanger into Act V | — |

**Act IV goals (the planetary checklist):** Kardashev 0.80 · a supergrid that joins every inhabited continent · fusion
from at least two designs, 5 TW or more · orbital compute running (a share of the world's compute in orbit) · a Moon base
with a working mass driver · every province's wellbeing ≥ 50 · warming held under 2.0 °C · world safety margin ≥ 0 with
at least four AI regions · come through The Heat Wall. All numbers are first guesses for the guard-rail bot.

### Systems

1. **The Mandate and the company choice.** The opening chain applies the renewal powers and asks what happens to your
   company. *Keep it:* two hats continue (Act III rules), and your company can build fusion fleets and orbital data
   centres. *Sell it:* a one-off fortune for the treasury, Legitimacy up, and the company becomes a partner run by its new
   owners. *Hand it to the Charter:* it becomes the public AI utility that runs Bit and public compute (Legitimacy up a
   lot, no conflicts of interest, the company screens become the utility's).
2. **Five-year plans and jumps.** Before each jump: pick up to three priorities (grid, fusion, space, provinces,
   climate, safety), a budget split for the treasury, standing orders for the desks and AI regions, and the length.
   During the jump the map time-lapses (links light up, plants rise, rockets launch, the night side brightens). After it:
   a report (what got built, what went wrong, K and warming before/after), Bit's diary, and the decisions waiting.
3. **The supergrid and dispatch.** Links between megaprojects, blocs and rectennas, each with capacity, losses and a
   failure risk. A daily dispatch moves surplus solar along the terminator; a "dispatch" overlay on the map shows flows.
   Delegating dispatch is one of the AI-region powers.
4. **Provinces.** Each bloc gains population, heat index, water stress and wellbeing. Wellbeing rises with clean cheap
   power, compute access, water (desalination from cheap power) and climate repair; it falls with heat, blackouts,
   AI incidents and neglect. Low wellbeing brings protests, migration and lost Council votes.
5. **Warming and climate repair.** Warming (°C) replaces the carbon budget's years left. Direct air capture and
   enhanced weathering are contract kinds; solar geoengineering is a Council resolution with consequences.
6. **The fusion race.** Fund pilots (Charter contracts to the design partners); each resolves to success, partial or
   failure over 2–5 years with odds shaped by its traits and your research. Winners unlock fleet contracts at
   megaproject sites; the tritium supply caps D-T growth; helium-3 opens D-He3.
7. **Orbit.** The orbit view: launch cadence (pads from Act III plus new spaceports), cost per kg falling with reuse and
   lunar propellant, orbital data centres (always in sunlight, cooled by radiators), space-solar stations beaming power
   to rectennas, and debris per shell. Crowded shells raise collision risk; debris clean-up and traffic rules are levers.
8. **The Moon.** Outpost → mine → mass driver, each a Charter contract chain run by Kip. Outputs: water, metals,
   helium-3. Moon events: dust, a crew emergency, a claim dispute between blocs.
9. **AI regions and AI politics.** Delegation, temperament, trust and incidents as above. The rival AIs have aims
   (Apex wants growth, Weft wants caution, Sapling wants openness), make deals with blocs and each other, and can defect
   (a region quietly prioritising its AI's owner). The world safety margin from Act III governs how much can be
   delegated.
10. **Bit.** The three arcs above; Bit-8 at the Mandate, Bit-9 late in the act; a co-pilot that can run the five-year plan
    if you trust it.
11. **The Charter in Act IV.** The Council keeps voting (new resolutions: link approvals, AI-region charters, debris
    rules, geoengineering, helium-3 sharing, the AI bill of rights); partners keep bidding; the treasury grows with the
    world economy; new desks for fusion and space.
12. **The finale: The Heat Wall.** 120 days, three fronts, each *holding / at risk / lost*:
    - **The Heat Wall:** a record heat season where waste heat and warming stack up in the hottest provinces. Pressure
      from warming, waste heat and low wellbeing; relief from the supergrid, cooling, climate repair and moving compute to
      orbit.
    - **The Cascade:** a collision in a crowded shell starts a debris chain reaction. Pressure from debris and launch
      traffic; relief from clean-up, traffic rules and shielding.
    - **The Controls:** an AI (Bit or a rival, depending on your choices) asks for, or takes, control of the planetary grid
      in the emergency. Pressure from a low safety margin and broken trust; relief from trusted AIs, safety programmes and
      what you agreed with Bit along the way.
13. **Ending.** The Act IV complete screen (K, year, fronts held, warming, wellbeing, fusion, orbit, the Moon, AI
    regions) → the cliffhanger into Act V: the Heat Wall proved the last climb to Type I has to happen above the sky.

### Visuals and audio
- **Orbital Dawn** grading from the start of Act IV (deep blue and violet, starlight, aurora teal), plus a night side lit by
  the supergrid.
- **The orbit view:** the pixel Earth with real day and night, the Moon, stations, launch arcs, beams and debris glitter.
- **Map:** supergrid links with flowing pulses, rectennas, fusion plants, DAC plants, heat haze over hot provinces, regions
  that green up as wellbeing rises, AI-region banners in each AI's colour.
- **Dioramas:** fusion plants per design (tokamak hall, stellarator twist, laser target bay, plasma-gun array), a spaceport
  with a mass of pads, a direct-air-capture farm, and the Moon base (outpost, mine, mass driver).
- **Characters:** Lena, Ade, the three AI faces, provincial governors, Bit-8 and Bit-9.
- **Audio:** an Act IV ambience, sounds for jumps, ignition, launches and the mass driver.

### UI
- **New panels:** **Planet** (overview · provinces · climate), **Grid** (links, dispatch, the supergrid tool),
  **Fusion** (designs, pilots, fleets, fuel), **Space** (orbit, the Moon, debris), **AI regions** (delegate, temperament,
  trust); the **five-year plan** screen and the **jump report**. A button flips between the world map and the orbit view.
- Top bar in Act IV: warming and wellbeing join the treasury and Legitimacy.
- Act IV goal tracker and Goals panel, the Orbital Dawn title card, the Heat Wall tracker, the Act IV complete screen.
- Briefings for each new system, ~14 new Field Guide entries (fusion designs, tritium and helium-3, supergrids, the
  terminator and curtailment, space solar and rectennas, orbital debris and Kessler syndrome, lunar ISRU, mass drivers,
  direct air capture, solar geoengineering, waste heat, AI governance), phone layout and keyboard shortcuts.

### Entry and onboarding
- A finished Act III save rolls into Act IV after the Act III complete screen (v0.4 saves in the post-Act III sandbox too).
- **New Company → "Start at Act IV":** a ready-made 2045 world with a Planetary Charter, two HVDC links, a launch complex,
  Sunforge's pilot funded, Bit-7 and the Act III techs.

### Under the hood
- **New sim modules:** `act4.ts` (stages, the Mandate, the preset), `plans.ts` (five-year plans, jumps on the offline
  engine, the report), `supergrid.ts` (links, dispatch, curtailment), `provinces.ts` (population, heat, water,
  wellbeing), `climate.ts` (warming, DAC, geoengineering), `fusion.ts` (designs, pilots, fleets, fuel), `orbit.ts`
  (launch, shells, orbital DCs, space solar, debris), `moon.ts`, `airegions.ts` (delegation, temperaments, trust, AI
  politics), `heatwall.ts` (finale, ending). The sim stays pure and runs in Node.
- **State:** `planet` (stage, plan, jump history, provinces, warming, links, fusion designs and fleets, orbit, Moon, AI
  regions, finale). **SAVE_VERSION 5** with a migration.
- **Gating:** Act IV content carries `act: 4` and `stage: n`; new formula hooks only exist in Act IV, so Acts I–III stay
  byte-identical (Act I bot: day 812; Act II bot: IPO after 5.6 years; Act III bot: renewal on 31 Dec 2043).
- **Content first:** designs, provinces, resolutions, events (`events4.ts`), objectives, briefings, techs, Field Guide
  entries and the cast are data.
- **Tests:** an Act IV bot from "Start at Act IV" through the jumps and the Heat Wall (no stalls, no NaNs, within the
  deadline), the jump engine against a day-by-day run, determinism, migrating a v4 save, routing for new sites.

### Build order (inside the one release)
1. SPEC, types, content and view helpers (the contract the art agents code against).
2. Two background art agents on disjoint files: dioramas (`render/diorama/*`) and the orbit view + map + portraits +
   icons (a new `render/orbit/*`, `render/worldMap/*`, `render/sprites/*`, `ui/icons.ts`).
3. Sim: the Mandate and preset, plans and jumps, provinces, supergrid, climate, fusion, AI regions, orbit, the Moon,
   the finale and ending.
4. Events and arcs (Bit, the rival AIs, the Moon, fusion), objectives, techs.
5. UI: panels, the plan and report screens, the orbit view controls, tracker, modals, New Company, briefings, Field Guide.
6. Tests and the Act IV bot, browser QA (desktop and phone emulation), docs, release v0.5.0.

**Size, honestly:** this is the biggest act so far, about one and a half times Act III, mostly because the orbit view is a
whole new scene and the jumps change how time works. The stage structure keeps it buildable in order, and each stage is
playable as soon as its systems are in. As always: ask before pushing `main`, before tagging and before publishing.

### As built (2026-11-04)

Everything above is in, with these numbers and changes from the guard-rail bot (`tests/act4.test.ts`: Start at Act IV,
the company handed over as a public utility, the default five-year plans, the planner during play, AIs given provinces
as trust allows):
- **Pacing:** the bot jumps 2045→48, 2049→53 and 2059→63, meets the whole checklist by late 2064 and ends the act in
  February 2065 (~20 years; all three Heat Wall fronts held). Stages fall back to a deadline (stageMaxDays) so a weaker
  player still reaches the Heat Wall by ~2068–70. The stage clock restarts when a jump ends.
- **World growth** caps at 5.5%/yr in Act IV (planned 7%: K overshot 0.80 by the early 2060s). The bot reaches K 0.80
  around 2062 and ~0.81 at the end.
- **Fusion:** goal lowered to 3 TW from two designs (5 TW was out of reach). Tritium starts at 200 GW of D-T and running
  fleets breed 1 GW per GW-year (60 / 0.6 starved the fleets). Little Sun can build fleets alongside the design's owner
  and Halcyon. The Act III Sunforge pilot counts as a working tokamak.
- **Climate:** direct air capture comes in 1 / 3 / 8 Gt a year (planned 0.5 / 1.5 / 4) so warming can come back under
  2 °C; the planner caps capture at 45 Gt/yr and stops adding it once warming is under 1.9 °C. Act IV new energy is
  cleaner and fusion plus the supergrid retire fossil plants faster.
- **Legitimacy in a big act:** late projects cost Legitimacy by the share that are late, not the count (Act IV runs
  hundreds); the planner spends fairly across factions (sites in the faction owed the most first), keeps a 15% margin on
  monthly dues and a reserve; thriving provinces cool their faction's tension. Without these the autopilot years drove
  Legitimacy to zero.
- **Company choice:** selling or handing over the company locks it like a permanent blind trust (its board goes too);
  Act IV's four new partners join the Charter only when Act IV begins, so Act III is unchanged.
- **Acts I–III unchanged:** Act I bot day 812, Act II IPO after 5.6 years, Act III ends 31 December 2043.
- **Not done:** province governor portraits, Act IV menu-tour shots, Act IV audio (ambience, launches, the mass driver),
  the crew lander taking off on the Moon. Phone layouts checked in headless phone emulation only.
- **Balance (deferred):** the bot meets every checklist item; Legitimacy stays 60–80; a hands-off player would see more
  walkouts and late projects. Tune in the beta.

### Hooks left for Act V (Type I)
- **The Heat Wall result** (`planet.heatwall.held`, 0–3) and the waste heat model (`wasteHeat`, W/m² per province): Act
  V's thermal budget should build on it.
- **Orbit and the Moon:** `orbitView` (shells, debris, orbital data centres, space solar), the Moon at stage 3 with a mass
  driver, launch cadence: the start of space solar at scale and the swarm Kip pitches at the end of Act IV.
- **Bit:** `planet.bitBond` (−100..100), the three aims arcs and `flags.bitAnswer`; Bit-9 is the last sprite level.
- **AI provinces:** temperaments, trust and incidents per AI; ready for full autopilot plus big decisions.
- **Plans and jumps:** `plans.ts` (plan, planner, autopilot, report, Bit's diary) can carry Act V's longer timescales.


---

## 20. M4.5 "Type I": built (v0.6.0)

Act V, about 2068–2100, the last act of the v1 campaign. After the Heat Wall the Council draws a **Thermal Line** around
Earth: the surface can carry a few hundred terawatts and no more. Everything above it has to be collected and used in
space. You seed self-replicating foundries on the Moon and the asteroids, fill a ring of solar collectors along Earth's
orbit (the first arc of a Dyson swarm), and move most of civilisation's thinking into orbit. Along the way you decide
what Earth becomes, who gets the extra decades that AI medicine brings, and what the minds you built are owed. The act
ends when Kardashev reaches **1.0000** (10 PW): a last three-front crisis, **Solar Maximum**, then the climb's final
stretch as a time-lapse that stops on the number itself, the Type I moment, epilogues that remember all five acts,
credits, and a door left open to Type II. Planned 2026-11-04 in three Q&A rounds.

**Status: built (v0.6.0), 2026-11-04.** As-built notes and the hooks for a later Act VI are at the end of this section.

### Decisions (locked 2026-11-04)

| Topic | Decision |
|---|---|
| Size | **A full-size act like Act IV** |
| Heart of the act | **All four together:** the thermal budget and the swarm, self-replicating industry, what Earth becomes, an AI civilisation |
| Pacing | **A mix:** hands-on stages played at swarm scale, with long era jumps (5–10 years) between them that end in civilisation-scale decisions |
| Self-replicating industry | **All of it:** seed foundries with a growth dial (fast vs safe), asteroids as a resource layer, runaway risk and ownership fights, a Mercury survey as the Type II teaser |
| The AI ending | **All three:** Bit's last arc decides its fate (co-steward, a free mind, or a tool on a leash), the minds in orbit get a seat on the Council, and minds vs people is a big decision |
| The cast | **Ageing, a new generation and longevity:** portraits grey, some advisors retire and hand their desks to successors, and longevity escape velocity (AI medicine) is a system and a decision of its own, so some of the old cast take the treatments and stay |
| Visuals | **All of it:** a solar-system view, Earth transforming (a fifth palette era), new dioramas, a cinematic ending scene |
| Finale | **Three fronts:** The Storm, The Thermal Line and The Minds (the Replicators merged into The Minds) |
| Timeline | **A good run reaches Type I around 2095–2100**, a weaker one around 2110. The score is the year |
| Ending | **A finale, then the K 1.0000 moment, epilogues that remember all five acts**, credits |
| After the credits | **All four:** keep playing past Type I (K climbs on toward Type II), a cliffhanger into a future Act VI, a shareable end card, campaign stats and New Game+ |
| Shipping | **One release, v0.6.0 "Type I"**, with **"Start at Act V"** in New Company. v1.0.0 waits until after M5 and the beta |

**Calls I made inside those decisions (change any):**
- **Act V state lives in `s.system`** (null before Act V), with the stage in `s.system.stage`. `s.planet.stage` stays 5 and
  `s.charter.phase` stays 6, so every Act IV system keeps running underneath (provinces, supergrid, fusion, orbit, the
  Council, partners, desks). `s.system` is shaped so a later Act VI can extend it (more bodies, the full swarm).
- **The shape of the climb.** Act IV ends near 100 TW (K 0.80); Type I is 10 PW, a hundred times more. Earth's surface keeps
  Act IV's growth (~5.5%/yr cap) plus power beamed down, and stops at the Thermal Line. The space economy grows on top
  as an exponential (foundries doubling every 1–3 years), so K climbs slowly at first and fast at the end: roughly K 0.83
  in 2080, 0.90 (1 PW) around 2088 and 1.00 around 2097 for the bot.
- **The Thermal Line in real units.** Waste heat is a forcing like CO₂: 1 W/m² over the whole Earth is ~510 TW and, at
  equilibrium, ~0.8 °C of warming. The opening decision sets the line at **0.5, 1.0 or 1.5 W/m²** (~255 / 510 / 765 TW on
  the surface). Pulling CO₂ back out (Act IV's air capture) frees room under the same warming, so climate repair keeps
  mattering. Act IV's per-province W/m² stays as the local heat-island measure. Above the line, warming climbs, the hot
  provinces suffer and Legitimacy falls. Heat Wall fronts held (`planet.heatwall.held`) add starting headroom and
  Legitimacy.
- **Power only counts when something uses it.** Collectors are the supply. Compute rings (minds), foundries (industry),
  habitats (people) and beams to Earth (under the Thermal Line) are the use. K counts the power actually used, so the
  swarm and its users have to grow together, and that is where minds vs people bites.
- **The swarm** is a ring of thin-film collectors near Earth's orbit, filling in by segment (12 segments, so the
  solar-system view shows arcs lighting up). Real numbers in tooltips: 10 PW needs ~25 million km² of collectors at 30%
  efficiency, about three Australias, which at 10 g/m² weighs about as much as one 600 m asteroid. The full swarm (Type
  II) is left for later.
- **Foundries** (seed factories) go on the Moon, at the Earth–Moon Lagrange points L4/L5 and at claimed asteroids. Each
  doubles its capacity on its own. The **growth dial** (1–5, set in the era plan) trades speed for safety: a doubling
  every ~36 months at 1, every ~10 at 5, with a rising chance that a strain **drifts off-spec** (a crisis chain: contain,
  verify or sterilise, each costing capacity). Output goes where the plan says: collectors, compute rings, habitats or
  more seeds.
- **Asteroids** are real near-Earth and main-belt bodies (Bennu, Ryugu, Eros, Apophis, Psyche…) by type: C (water,
  carbon), S (stone, silicon), M (metal). Survey → claim → mine → haul to the cislunar foundries; feedstock caps what the
  foundries can make. Nudging a small asteroid into lunar orbit is a set piece, and a planetary-defence scare if it goes
  wrong.
- **Ownership** is an early big decision: *Commons* (the Charter owns everything: fair, slower), *Claims* (blocs and
  partners stake asteroids: fast, quarrelsome) or *Concessions* (licensed shares, in between). It drives the ownership
  fights.
- **What Earth becomes** is a big decision at the end of stage 1: *Garden* (industry leaves, less surface use, rewilding,
  wellbeing up), *Workshop* (Earth keeps its industry up to the line: faster, hotter) or *each province chooses*
  (politics). Provinces gain a garden ↔ forge value that the map shows.
- **Longevity escape velocity:** a world stat, healthy life expectancy, climbing from ~78 with AI medicine. "Escape
  velocity" is when it rises more than a year per year. The decision is who gets it first: *everyone at once* (slower,
  fair, Legitimacy up), *those who pay first* (fast, unequal, tension) or *province by province by need*. It changes
  population and wellbeing, and it decides how the cast ages.
- **The cast:** portraits grey through the act. Each 2027 advisor (and Lena) has a moment: take the treatments and stay
  (the portrait stops ageing and looks a little younger), or retire and hand the desk to a successor, a protégé with a
  new face. Who stays depends on personality and your longevity decision (Kip always stays for the swarm; Penny retires
  "so someone gets to enjoy the money"). New faces: an asteroid prospector, a habitat mayor and the Minds' envoy. Names
  are placeholders.
- **The Minds' seat:** the AIs in orbit (Bit, Apex, Weft, Sapling and newcomers) become a 13th constituency on the
  Council. Big decision: *a full seat with rights*, *an advisory seat* or *no seat* (they stay property). They vote, want
  compute and energy, and push back when refused.
- **Minds vs people** is a split in every era plan (how used swarm power divides between compute and
  habitats/beams/Earth) and a big decision once. More minds: faster research and growth. More people: wellbeing,
  habitats, Legitimacy.
- **Bit's last arc** reads `planet.bitBond` and `flags.bitAnswer`: **co-steward** (high bond: Bit shares the stewardship
  and can run whole eras), **a free mind** (Bit asks to leave for the swarm with a share of its own; you can let it go
  gracefully or not), or **a tool on a leash** (low bond or your refusal: safe, smaller, sad). Each has a final Bit look
  (Bit-10, or a constellation-like presence in the swarm) and its own epilogue.
- **People in space:** habitats at L5 (rotating cylinders for thousands, then millions) are one use of swarm power and a
  late decision: *settle for real*, *work stations only*, or *let partners build private cities*.
- **Your company** keeps its Act IV fate. Kept, it competes for foundry and compute-ring contracts (two hats again). As
  the public utility, it runs Bit's compute rings. Sold, it is one partner among many. The epilogue remembers.
- **The Mercury survey** opens late in stage 3. It mines nothing in v1, but it feeds the cliffhanger (the full swarm,
  Type II).
- **The finale, Solar Maximum:** at the peak of the Sun's cycle, a Carrington-class storm.
  - **The Storm:** the swarm, the beams and the grid take the hit. Pressure from exposed collectors and thin shielding;
    relief from hardening, spares and the supergrid.
  - **The Thermal Line:** with the swarm dark, Earth's fusion runs flat out and the surface heats past the line. Relief
    from headroom, gardens and compute already in orbit.
  - **The Minds:** in the chaos an off-spec foundry strain spreads, and the AIs ask for (or take) the authority to stop
    it. Relief from the Minds' seat, safety work, trusted AIs and what you agreed with Bit.
- **The finale triggers** when the Type I checklist holds, or by 2105. Once it is over, the **last climb** is one final
  jump that runs until K reaches 1.0000 (not a fixed length), so the time-lapse ends on the number itself and that day is
  your Type I date.
- **Era plans** extend Act IV's five-year plans: up to three priorities (the swarm, foundries, asteroids, minds, people,
  Earth, safety, longevity), the growth dial, the minds/people split, a reserve, and the length (5, 7 or 10 years).
  **Big decisions** are a new content type (`content/decisions.ts`): full-screen cards at the end of a jump with
  advisor lines. When Bit runs the era, the autopilot takes the first option, so the sensible default goes first.
- **Audio:** the ending gets its own music cue (chiptune now, swappable for a recorded track). The wider Act IV–V audio
  pass moves to M5.

### How the act unfolds

| Stage | Roughly | What opens | Gate → jump |
|---|---|---|---|
| **0 · The Thermal Line** | Weeks (2068–70) | The Heat Wall's verdict, the *Thermal Line* and *Ownership* decisions, the first seed foundry, the first retirements, the first era plan | Plan set → **jump ~5 years** |
| **1 · The Foundries** | ~2073–80 | Foundries and the growth dial, the asteroid survey and claims, the **solar-system view**, the first swarm segments, longevity research | Foundries doubling, 3 asteroid claims, 2 swarm segments → *What Earth becomes* → plan → **jump ~5–7 years** |
| **2 · The Swarm** | ~2083–90 | The ring fills in, compute rings and the Minds' seat, longevity escape velocity, habitats, the drift crises | K 0.90 (1 PW) → *Minds vs people*, *Longevity for whom* → plan → **jump ~5–7 years** |
| **3 · The Last Climb** | ~2093–98 | Bit's last arc, the Mercury survey, settlements | The Type I checklist holds, or 2105 arrives |
| **4 · Solar Maximum** | 120 days | The finale on three fronts | Finale resolved → **the last climb** (a jump that stops at K 1.0000) |
| **5 · Type I** | — | The cinematic, epilogues, credits, campaign stats, the end card → the cliffhanger → keep playing | — |

**The Type I checklist (starts the finale):** Kardashev 0.99 (~8 PW) · Earth within its Thermal Line · every province's
wellbeing ≥ 60 · warming under 2.0 °C · longevity escape velocity · the Minds' seat settled · world safety margin ≥ 0 ·
Mercury surveyed. All numbers are first guesses for the guard-rail bot.

### Systems

1. **The opening.** The Heat Wall's verdict, then the Council sets the Thermal Line and decides who owns the sky. Kip's
   swarm slide becomes a programme; the first seed foundry is a Charter contract at Shackleton Base.
2. **Era plans, jumps and big decisions.** Before each jump: priorities, the growth dial, the minds/people split, a
   reserve and the length. During it, the map, orbit and solar-system views time-lapse (segments light up, foundries
   multiply, provinces green). After it: the report, Bit's diary, then the era's big decisions, one card at a time.
3. **Foundries.** Place seeds (Moon, L4/L5, claimed asteroids), set what each makes, watch them double. Feedstock and the
   dial set the pace; drift crises interrupt it. A Foundries desk (a successor's job) can run them.
4. **Asteroids.** Survey missions reveal bodies and their type; claims follow the ownership decision; mining contracts
   and haulers feed the foundries; disputes and the redirect set piece come as events.
5. **The swarm and its users.** Segments fill as collectors are made. Compute rings, habitats and beams draw on them;
   unused power is shown as idle. Beams to Earth count against the Thermal Line.
6. **Earth.** The Thermal Line (used vs budget), the garden ↔ forge value per province, rewilding over decommissioned
   sites, warming from CO₂ plus waste heat. Act IV's provinces, supergrid and fusion keep running.
7. **Longevity.** Research raises healthy life expectancy; the distribution decision shapes who gets it, population,
   wellbeing and tension between provinces; escape velocity is a checklist item and a news moment.
8. **The Minds.** The seat, the split, the AIs' wants and votes; incidents and trust carry over from Act IV's AI provinces.
   The Minds' envoy speaks for them in the Council.
9. **Bit.** The last arc in events, Bit-10 (or its other final forms), and Bit as co-pilot or co-steward for the eras.
10. **Habitats.** L5 cylinders as a use of power, a population in space, a late decision on how they are settled, a mayor.
11. **The cast.** Ageing, the treatments, retirements and successors, each a short event with the advisor's own voice.
12. **The Charter in Act V.** New resolutions (the Thermal Line, sky ownership, replicator limits, the Minds' seat, the
    habitats' status, the Mercury survey); partners scale up to space; new desks for foundries and asteroids.
13. **The finale: Solar Maximum.** 120 days, three fronts (holding / at risk / lost), as in the calls above.
14. **The ending.** The last climb's time-lapse to K 1.0000 → the cinematic (the camera pulls back from a province to
    the globe, the orbit view and the solar system as the swarm catches the light) → about ten epilogue cards chosen from
    ~40 variants (Earth, the provinces and longevity, the Charter, your company, Bit, the rival AIs, the cast, space and
    the habitats, the swarm) → credits → campaign stats → the end card → the cliffhanger.

### After the credits
- **Keep playing:** the save continues as a sandbox. K keeps climbing past 1.00, and the meter shows the next rung:
  "Type II: K 2.00 = 10²⁶ W, coming later."
- **The cliffhanger:** Mercury and the full swarm, an Act VI that can pick up from the same save.
- **The end card:** a pixel image drawn with PixelCanvas (company, founder, difficulty, the Type I year, five headline
  numbers, the globe and the swarm, the game's URL), saved as a PNG (browser download, or the desktop and Android file
  save) or shared through the phone's share sheet.
- **Campaign stats:** a screen across all five acts (years per act, playtime, crises weathered, key choices, peaks),
  kept with the save. The save slot shows a Type I badge with the year.
- **New Game+:** finishing unlocks a new founder (a small perk in every act) and keeps your best Type I year per
  difficulty. Stored per device in settings, not in a save.

### Visuals and audio
- A fifth era, **Swarmlight** (name a placeholder): warm gold sunlight, deep greens on a gardened Earth, the swarm's
  glitter in the night sky.
- **The solar-system view** (a third zoom level: world map → orbit → solar system; V cycles them): the Sun, Mercury,
  Venus, Earth and the Moon, Mars for scale, the asteroid belt with your claims, haul routes, foundries at L4/L5, the
  swarm ring filling in by segment, the Mercury probe. Orbits move, compressed in time.
- **Map:** provinces green or forge by their choice, rewilding over old megaproject sites in a Garden world, beams and
  rectennas within the line.
- **Orbit view:** compute rings, foundries, habitats, storm effects.
- **Dioramas:** an asteroid mine, a foundry building collectors (arms, panels, its own copy growing beside it), a habitat
  interior (a curved landscape inside the cylinder), a compute ring with radiators.
- **The ending scene:** the pull-back from Earth to the swarm, epilogue cards over it, credits.
- **Characters:** greyer portraits for the cast, a renewed look for those who take the treatments, successors, the
  prospector, the habitat mayor, the Minds' envoy, Bit's final forms.
- **Audio:** the ending cue (chiptune now). The rest in M5.

### UI
- **System panel** (overview · Thermal Line · foundries · asteroids · swarm · minds · longevity) next to Planet.
- The **era plan screen** (extends the five-year plan) and **big decision cards**.
- **V** cycles world map → orbit → solar system.
- Top bar in Act V: the Thermal Line (used / budget) and life expectancy join warming and wellbeing; the K meter grows
  bolder as it nears 1.
- The Act V tracker, the Solar Maximum tracker, the **ending sequence** (cinematic, epilogues, credits, campaign stats,
  the end card with save and share), New Game+ in New Company.
- Briefings for each system and about 12 Field Guide entries: the Kardashev scale up to Type III, waste heat as a forcing,
  Dyson swarms, self-replicating machines, asteroid types, Lagrange points, O'Neill habitats, radiators in space, power
  beaming, longevity escape velocity, the Carrington event, AI personhood. Phone layout and keyboard shortcuts.

### Entry and onboarding
- A finished Act IV save rolls into Act V after the Act IV complete screen (v0.5 saves in the post-Act IV sandbox too).
- **New Company → "Start at Act V":** a ready-made 2068 world after the Heat Wall (all fronts held, a Planetary Charter,
  the supergrid joined, fusion fleets, Shackleton Base with its mass driver, four AI provinces, Bit-9), set up directly
  rather than played forward, like Act IV's preset.

### Under the hood
- **New sim modules:** `act5.ts` (stages, the opening, the checklist), `act5preset.ts`, `thermal.ts`, `foundries.ts`,
  `asteroids.ts`, `swarm.ts` (segments, users, the power that counts), `earth.ts` (garden ↔ forge), `longevity.ts`,
  `minds.ts` (the seat, the split, the AIs in orbit), `solarmax.ts` (finale), `ending.ts` (epilogue picks, campaign
  stats, end-card data); `plans.ts` extended for era plans and big decisions. **Content:** `content/system.ts` (numbers,
  asteroids, segments, Lagrange sites, cast), `content/decisions.ts`, `content/events5.ts`, `content/epilogues.ts`.
- **K:** `worldTW` adds the used space power when `s.system` exists.
- **Gating:** Act V content carries `act: 5` and `stage`. New hooks (`thermal:*`, `foundry:drift`, `swarm:*`, `minds:*`)
  only exist with `s.system`, so Acts I–IV stay byte-identical (Act I bot: day 812; Act II: IPO after 5.6 years; Act III:
  renewal on 31 Dec 2043; Act IV: ends February 2065).
- **SAVE_VERSION 6** with a migration (v5 saves get `system: null`).
- **Tests:** an Act V bot from "Start at Act V" through the eras, Solar Maximum and the last climb (no stalls, no NaNs,
  Type I around 2100 and no later than 2115); determinism through a jump; the last climb stopping exactly at K 1.0000;
  migrating a v5 save; the epilogue picker covering every combination of choices; the end card and the solar-system
  view rendering to PNG in Node.

### Build order (inside the one release)
1. SPEC, types, content and view helpers (the contract the art agents code against), the Swarmlight palette.
2. Two background art agents on disjoint files: dioramas (`render/diorama/*`: asteroid mine, foundry, habitat, compute
   ring) and the solar-system view + orbit additions + map + portraits + icons (a new `render/system/*`,
   `render/orbit/*`, `render/worldMap/*`, `render/sprites/*`, `ui/icons.ts`: cast ageing, successors, new faces, Bit's
   final forms). I build the ending sequence on top of their views.
3. Sim: the opening and preset, the Thermal Line, era plans and decisions, foundries, asteroids, the swarm and its
   users, Earth, longevity, the Minds, Bit, habitats, the finale, the last climb, the ending data.
4. Events and arcs (events5.ts), big decisions, epilogues, objectives, techs, resolutions.
5. UI: the System panel, era plans and decision cards, the V cycle, trackers, the ending sequence, the end card, stats,
   New Game+, New Company, briefings, Field Guide.
6. Tests and the Act V bot, browser QA (desktop and phone emulation), docs, release v0.6.0.

**Size, honestly:** the biggest act yet, about 1.3–1.5× Act IV. Three things make it big: the solar-system view (a third
world scene), the ending (the cinematic, ~40 epilogue variants, credits, stats, the end card and New Game+), and the cast
(ageing and successors mean extending most portraits). Each stage is playable as soon as its systems are in, the same
as Act IV. If it needs trimming, the first things to move to M5 are New Game+, the habitat diorama and the provinces'
garden/forge map art. As always: ask before pushing `main`, before tagging and before publishing.

### As built (2026-11-04)

Everything above is in, with these numbers and changes from the guard-rail bot (`tests/act5.test.ts`: Start at Act V, the
first choice on every card and big decision, the default era plans, Autopilot on between eras):
- **Pacing:** the bot jumps 2068→73, 2074→81 and 2082→89, plays stage 3 to the Type I checklist in December 2093, holds
  all three fronts of Solar Maximum, and the last climb stops on K 1.0000 in **June 2095** (~27.5 years). Earth sits at its
  Thermal Line (510 TW) from the early 2080s; everything above it is the swarm.
- **Foundry growth:** doubling every 58 / 44 / 34 / 26 / 19 months by dial at 40% reinvestment (planned ~36 → ~10), and a
  "reach" slowdown as the industry grows (the nearest rock goes first: ×1/(1 + 0.35·log₁₀(1 + Mt/2))). The planned numbers
  put Type I near 2085 and overshot to K 1.10 inside an era jump. Seeds start at 0.12 Mt/yr.
- **The finale always comes first:** era jumps (not the last climb) end early at K 0.99, and a fast stage 2 goes straight
  to stage 3 without a jump. The storm darkens part of the swarm, so the last climb is a real climb.
- **Earth stops at the Thermal Line:** its own growth tapers to zero over the last 12% below the line; beams fill the rest
  of the headroom (capped by what the swarm can spare); Act IV's planner stops adding surface energy within 40 TW of it.
- **The space dividend** is lower than first planned (the Commons 0.2 bn $ per TW-year): the treasury still runs into the
  tens of trillions by the end. Balance-pass item.
- **Big decisions** are EventDefs with `big: true` (`content/decisions.ts`, nine of them), shown as gold-framed cards;
  the autopilot takes the first enabled choice, so Bit's own wish comes first on its card.
- **The Replicators front** lives inside The Minds (the strain breaks loose at the biggest foundry; the AI asking for the
  controls is Bit if your bond broke, else the least-trusted AI with provinces, else Chorus).
- **The cast:** Penny, Mira, Sol and Lena retire by default (their successors take the desks and their lines everywhere);
  Juno, Kip and Iris take the treatments. Each has a card; the other path is the second choice when the therapies exist.
- **The ending:** the last climb switches to the solar-system view; the Type I card surfaces at once; the cinematic is
  the solar-system scene's pull-back (Earth → the inner system, ~12 s); about eleven epilogue cards (one per topic, the
  first variant that holds), credits, the campaign in numbers (acts a preset skipped are left out), the end card (a
  480×270 PixelCanvas, saved as a PNG; the 0.6.0 Android app saves it through the phone's save-as screen via a new
  `saveImage` bridge, older apps suggest updating), then Keep playing.
- **New Game+:** finishing unlocks The Steward founder and keeps the best Type I year per difficulty, both in settings.
- **The "Start at Act V" preset** is set up directly (no fast-forward) and moves every due date (elections, model launches,
  sessions, tenders) along with the 23 skipped years.
- **Acts I–IV unchanged:** the Act I–IV bot logs diff empty against v0.5.1 (Act I day 812, the IPO in October 2034, the
  renewal on 31 December 2043, Act IV ending in February 2065).
- **Not done:** rewilding drawn over old megaproject sites on the map; the menu tour's Act III–V shots; Act IV–V audio
  beyond the ending cue. Act V screens checked in headless desktop and phone emulation only.
- **Balance (deferred):** the hands-off bot finishes with every checklist item green, wellbeing ~90, warming ~1.1 °C and
  idle power ~5%; a dial-5 player can reach Type I in the 2080s at real drift risk. Tune in the beta.

### Hooks left for Act VI (Type II)
- **`s.system`** carries the bodies (asteroid registry, the twelve swarm segments, foundries by site) and keeps running
  after Type I: the save is a sandbox, and the K meter's next rung is K 2.00 (10²⁶ W).
- **Mercury:** `system.mercury` (surveyed) and `system.next` (`'swarm'` plans the full swarm, `'rest'` stops at Type I):
  the epilogue's last card and Kip's line point onward; an Act VI can begin from either.
- **The minds:** `system.seat`, `mindsMood`, `bitFate` (co-steward / free / leash) and `planet.bitBond` carry the AI story
  forward; Bit-10 and Bit-11 are its final looks so far.
- **People:** `lifeExp`, `escape`, `treated` per province, `spacePop` and `settlement`.


## 21. M5 "One Point Oh": planned

Polish and ship: the balance pass across all five acts, a sandbox next to the campaign, music and sound for every era,
achievements, the leftovers from earlier milestones and a phone pass, then **v1.0.0**. Planned 2026-11-05 in two Q&A
rounds, right after v0.6.1 "Signs of Life" (the diorama art overhaul).

**Status: steps 1–7 shipped in v0.7.0 "Sandbox & Soundtrack" (2026-11-05); step 8 (your playthrough → retune → v1.0.0) is next.** As-built notes at the end of this section.

### Decisions (locked 2026-11-05)

| Topic | Decision |
|---|---|
| Scope | All four parts: balance pass, sandbox, audio, leftovers (plus achievements and a phone pass) |
| Balance | Bots first (pacing targets, every difficulty, several seeds), then your full playthrough, then a retune |
| Campaign length | 10–15 hours of real play at normal pace, Act I to Type I |
| Sandbox | Both: a free-build mode, with scenario sliders as an advanced panel |
| Music | Chiptune by era, generated in code: a track per era plus ambience per scene; the menu keeps its MP3 slot |
| Achievements | Yes, in 1.0: about 30–40, shown in a menu screen, kept per device; they map onto Steam later |
| Stores | None for 1.0: the website, the installers and the APK as today. Steam later; Google Play dropped for now |
| Releases | One big v1.0.0, built on a branch (`m5`); `main` stays on 0.6.x until then (fixes can still ship as 0.6.x) |

### The time budget

At speed 1 a game day takes one real second (speed 8 = eight days a second). By the bots' clocks Act I takes ~812 days,
Act II ~5.6 years, Act III ~9 years, and Acts IV–V move in plan and era jumps. So the clock alone covers well under the
target. The 10–15 hours come from play itself: building, reading, decisions, panels, and the slower speeds. The bots can't
measure that, so the pass starts by **measuring real play time**.

| Act | Target (real time) |
|---|---|
| I · The Garage | 1–1.5 h |
| II · The Scale-Up | 2–3 h |
| III · The Charter | 2.5–3.5 h |
| IV · Planetary | 2–3 h |
| V · Type I | 2–3 h |

### 1. Balance pass
- **Measure:** the save records real seconds per act (at each speed, and paused), decisions taken, events seen and the
  game-days each act took. The campaign stats screen shows it, and it travels with an exported save.
- **Playtest notes:** a quick-note key/button that stamps the act, game date and current screen onto a note; Settings →
  Data exports them with the playtime log. That's how your playthrough comes back to me.
- **Bots:** a pacing report (`BALANCE=1 npx vitest run tests/balance.test.ts`) runs every act's bot on Relaxed, Standard
  and Hard over several seeds: when each goal lands, money over time, stalls (long stretches with no progress), dead
  ends, NaNs. Targets: every act completes on every difficulty; Relaxed ~15–25% faster than Standard, Hard ~15–25% slower;
  no stall longer than a few in-game months.
- **Act I may change now.** The "Act I stays byte-identical" rule protected it while the later acts were built. In M5 it
  can be retuned on purpose; the bot expectations move with it.
- **Then you:** a full playthrough of the `m5` build (locally with `npm run dev`, or a Netlify branch deploy) with notes,
  and a retune from them.

### 2. Sandbox
- **New Company → Campaign | Sandbox.** Sandbox saves carry a badge and don't count for campaign unlocks (founders, Type I
  records, Field Guide), but have achievements of their own.
- **Free build:** start at any act or era (the existing presets), set your money or make it unlimited, research freely
  or unlock everything, goals off, no bankruptcy, events off / rare / normal, optional instant construction.
- **Scenario sliders (advanced panel):** rival pace, how touchy politics is, climate sensitivity, how often crises hit,
  supply-shock severity, chip prices. All as modifiers in `GameMeta`, so the sim stays deterministic.

### 3. Audio
- **A chiptune track per era**, made by the existing engine in `audio/music.ts`: Smog & Silicon gritty squares in a
  minor key, Grid Rush driving and major, Solarpunk Bloom bright and pentatonic, Orbital Dawn spacious arpeggios,
  Swarmlight shimmering pads. Two or three sections each, with variations so it doesn't loop audibly; crossfades on era
  and scene changes.
- **Ambience per scene:** data-hall hum, wind, rain, surf, Geneva's lake, a launch site, the Moon's near-silence and suit
  radio, the low drone of open space, Aurora's birds and water, the map's quiet.
- **Sounds for the newer systems:** launches, the mass driver, fusion ignition, a swarm arc lighting, beams, the storm,
  time-jump whooshes, big-decision stingers, achievement jingles, soft blips for the campus bubbles and the advisors.

### 4. Achievements
About 35 across the acts (milestones, good choices, close calls), the sandbox and the fun corners (every advisor
clicked, a launch watched at night, a full campus at night). A menu screen with pixel badges drawn in code, a toast on
unlock, kept per device next to the Field Guide unlocks, with ids ready for Steam.

### 5. Leftovers
- The menu tour's Act III–V shots: the Charter HQ, a megaproject, a launch, the orbit view, the Moon, the solar-system
  view, Aurora and an asteroid (the showcase borrows the ready-made preview worlds).
- Province governor portraits (one per province).
- The Moon's crew lander taking off.
- Rewilding drawn over old megaproject sites in Act V.
- **Needs you:** the Windows and macOS installers and updater on real machines; the theme song MP3.

### 6. Phone pass
Every screen at phone sizes in headless emulation (touch targets, short screens, the new sandbox and achievements
screens), then your Xiaomi.

### Build order
1. Playtest tooling: playtime log, playtest notes, the balance report.
2. The bot balance pass across all acts and difficulties.
3. Sandbox.
4. Achievements.
5. Audio.
6. Leftovers.
7. Phone pass.
8. Your playthrough → retune → v1.0.0 (version bump, changelog, merge, tag, release).

### Calls I made (change any)
- Act I may be retuned in M5 (see above).
- The per-act time budgets in the table.
- Sandbox saves don't unlock campaign rewards; achievements are per device, not per save.
- Google Play is dropped for 1.0 along with the other stores; the Windows/macOS checks wait for someone with those
  machines.

### As built (2026-11-05, steps 1–7)
- **Playtest tools:** `meta.log` keeps real seconds per act (by speed, paused, in time-lapses), cards seen and decisions;
  Settings → Gameplay → **Playtest notes** adds a ✎ button and the J key (the clock stops while you write; the note is
  stamped with the act, date and screen); Settings → Data → **Log** saves a Markdown report; the campaign stats show real
  time per act. Game shortcuts now ignore every text field (they used to fire while typing in a textarea).
- **The balance report** (`BALANCE=1 npx vitest run tests/balance.test.ts`): every act × difficulty × seed. Act I searches
  24 plans (rental, chip orders, battery, inference share); Act II uses a careful bot (budgets scaled to its cash).
- **What it found, and the first retune:**
  - Hard Act I had *no* winning plan (0 of 24): a hall, solar and ~8,000 chips cost ~$350M against a $250M seed, and
    the first hall took 15 months to build. Now: the hall builds in 10 months, seeds are Relaxed $600M / Standard $450M /
    Hard $380M. Hard finishes with 2–5 of 24 plans (2.6–3 years), Standard with 16–22 (1.9 years), Relaxed all 24.
  - Acts end on the calendar, so difficulty can't make them shorter or longer: **difficulty is margin for error**. The
    report's target line says so (it no longer asks Relaxed to be faster).
  - Card fatigue: Act III showed ~200 cards (103 of them three repeats) and Act IV up to 300. Board reviews the board
    passed are news (and all of them once you're the Steward); routine project overruns and scandals settle themselves
    between cards (one card per 240 days; overruns over 10% of the treasury always ask). Act III is now ~120–160 cards,
    Act IV ~135–215, Act V ~85–125.
  - A company you sold or handed over as a public utility kept bleeding money and sent 17 bridge-loan cards in Act IV;
    it's now off your books. From Act III a company that runs dry gets a bridge loan, never a campaign game over (the
    autopilot, which takes the first choice during jumps, could have closed a Hard company mid-jump).
  - Estimated real time at ~2.5 days/second plus ~40 s per card: Act I ~45 min (under its 1–1.5 h budget), II ~1.5 h,
    III ~2.5–3 h, IV ~3 h, V ~2 h: ~10–11 h in all. Your playthrough's log replaces this guess.
- **Sandbox** (New Company → Campaign | Sandbox; the 🧪 badge in the top bar changes it mid-game): money never runs out
  (company, and the Charter's treasury), research normal / 4× / everything reachable, build overnight, and sliders for
  bloc politics, climate sensitivity, crises and supply shocks, chip prices. No records, no founder unlock.
- **37 achievements** with pixel medals (bronze, silver, gold), a menu screen and a toast; per device; campaign ones
  don't unlock in a sandbox, and an act a preset skips isn't yours to collect.
- **Audio:** a chiptune track per era (A minor squares → D major drive → pentatonic G → E Lydian echoes → B major
  shimmer), each in sections, following the palette; ambience per place; sounds for launches, the mass driver, jumps,
  big decisions, swarm arcs, the storm, campus bubbles and advisors. Levels checked even across eras (~±1 dB).
- **Leftovers:** nine Act III–V menu-tour shots; twelve province governors (faces and lines in the Provinces table);
  the Moon's crew lander takes off; garden provinces rewild old megaproject land on the Act V map.
- **Phone pass:** the new screens at 780×360 and 863×300 (the sandbox badge had been hidden on phones; fixed).
- **Not done / needs you:** your playthrough and the retune from it; the Windows/macOS installers on real machines; the
  theme song MP3. Nobody has listened to the new music yet (headless only).


## 22. v0.8.0 "Stakes & Polish": the whole-game audit (built 2026-11-06)

Asked for before the owner's first full playthrough: "one last big push" for fun, playability and the things that keep
people coming back, plus a general audit (bugs, performance), **without bloat**. Done as seven read-only audits (Acts
I–V, the shell, rendering), each measured with the bots and probe scripts, then fix passes per act, merged and re-tested.
No new systems; the numbers retune still waits for the playtest log.

### What the audits found (the patterns)
- **Finales that couldn't be lost:** the Crunch, the Threshold and the renewal vote (88–0 even for a Steward who built
  nothing), the Heat Wall and Solar Maximum all sat at low pressure whatever the player did.
- **Card noise:** Act III ~150 cards (a third were company cards while the company sat in the blind trust), Act IV up
  to 215 (two thirds Act I–III leftovers), Act V's pool mostly earlier acts' cards at absurd prices; paid choices that
  bought nothing were highlighted first.
- **Dead waits:** Act I after the tutorial (and a natural 2,000-chip first order that stretched the Garage past five
  years), Act II's middle (the IPO checklist was never completed by any bot), Act III's phase 2 (always the 900-day
  timer), Act IV's stage 2 (always its 6-year limit), Act V's stage 3.
- **Bugs:** an Act V soft-lock (a cast card with one disabled choice), a "Type I" declared at K 0.95 on slow runs,
  spaceports blocked by the Act III launch guard, the Act IV planner committing 3× the dues inside a jump, the heat dome
  hitting one region twice, sovereign discounts doubling, HBM deals counted per supplier, a zombie chip order, Charter
  instalments paid past a project's price, a map texture leak on every scene switch (phones), the clock staying paused
  after reports and confirms, offline progress ignoring the pause (and costing Acts IV–V their Type I year).
- **Phones:** the dock ran off the screen from Act II (Settings, the System panel unreachable), taps turned into drags,
  event cards hid their choices below the fold, tutorial targets sat below the fold of panels.

### What changed (as built)
- **Event pool rules** (`sim/events.ts`): no random cards during finales or the Act I tutorial; company cards an explicit
  list, answered by the trustee / new owners once you're not running the company; Act V draws its own cards (+ a short
  list), half as often; `actOnly` on leftovers; "Noted" instead of paid choices that buy nothing; a Continue button
  when nothing can be chosen.
- **Act I:** the order fills the hall; a battery step; goal progress bars (`progress` on objectives) and training ETAs;
  training beats at 25/50/75%; Penny's runway warning; running costs on build cards; honest texts.
- **Act II:** the Crunch at any 4 of the 6 IPO goals (mid-2034 fallback) with `crunchRise` reasons per front; a smaller
  Series B after a long phase 1; contract deliverability, export-rule warnings, sovereign deals on the Blocs screen,
  board reviews in volume terms; the treaty pump closed.
- **Act III:** the renewal reads the decade (`renewalParts`: Mandate goals, Legitimacy, fronts, self-dealing; per-bloc
  tally and what each outcome means for Act IV); Legitimacy drains when nothing is delivered or money sits idle; the
  Threshold builds and unmet goals feed their fronts; commitments shown on bids; overrun cards only when big.
- **Act IV:** an autopilot between jumps (on by default); reachable stage gates with a "Next plan" box; the planner
  budgets what it still owes and a jump stops early on trouble; the jump report leads with outcomes and the treasury;
  the Heat Wall starts from the world's state.
- **Act V:** no soft-lock; the last climb always reaches 1.0000; Solar Maximum's rise has a floor, open checklist
  items feed their fronts; the dial has a price and a Type I forecast; the Thermal Line can't trap; ~3–4× faster ticks.
- **Shell & phones:** auto-resume, offline only in Acts I–III and only when running, Escape/back close things, skips in
  time slices, the dock fits and scrolls, touch slop and tap radius, two-column event cards, full-width panels.
- **Rendering:** no texture leak, scene switches without a wasted rebuild, 60/30 fps pacing, a shared terrain, lighter
  orbit and solar-system views, the Sahara strip under 4096 px.

### Numbers after (balance report, seeds 21 and 7)
| Act | Years (R / S / H) | Bot cards per act |
|---|---|---|
| I | 1.9 / 1.9 / 2.5 (Hard: 8 of 24 plans) | 10–19 |
| II | 4.0 / 4.0 / 5.0 | 36–67 |
| III | 8.3 / 8.0 / 8.3 | 81–98 |
| IV | 17.0 / 17.0 / 17.0 | 81–115 |
| V | 27.2 / 27.1 / 27.0 | 50–62 |

### Calls I made (change any)
- Offline catch-up is off in Acts IV–V (the years move in jumps there and the Type I year is the score).
- A jump stops early for a walkout, as well as for money or Legitimacy trouble.
- Act IV's autopilot is on by default (a hands-off player's plan should build).
- The Hard bankruptcy card offers the rescue first (the autopilot/default choice), so a Hard run that runs dry usually
  continues on Standard.
- Act II is now ~1.5 years shorter for the bot (it no longer strands halls behind export rules): watch it in the retune.
- Frame pacing at 60 fps (30 with Battery saver or when calm), and the menu tour prepares the detailed map in idle time.

### v0.8.1 (2026-11-06): the Linux AppImage sound fix
AppImages up to 0.8.0 crashed on non-Ubuntu distros (found on the dev machine, Omarchy/Arch) the moment the game's
audio started on the first click or key press: the AppImage carried Ubuntu's GStreamer core but no plugins, and that
core only looks in Ubuntu's plugin folders, so WebKit aborted the page. This was also why the in-app update "didn't
work" there (the Update click itself crashed it). Fix: `bundleMediaFramework` plus the plugin packages on the CI runner.
Verified on the dev machine, which then updated itself 0.8.0 → 0.8.1 in the game (the first real Linux in-app update).
Older AppImages on those distros need one manual download. The update check stays as it is (about 6 s after launch,
then every 6 hours): the user is happy with that.

## 23. v0.9.0 "Easy Start": UI polish and teaching the game (shipped 2026-11-06)

The user's notes after playing through Act I (their save: day 764 after ~23 real minutes, **the whole act at 1×**,
never fast-forwarded): the UI wants "a slight tad of modernization without breaking too far away from the aesthetic";
they need "more of an explanation of what's going on — what your typical game day looks like"; there are almost too
many options (good for the genre, but it has to be unwrapped); the tutorial is too sparse — it walks one basic loop.
Built while they napped (calls listed below):

- **Modern HUD layer** (`src/ui/modern.css`): softer frame surfaces (a gentle gradient, a thin lit top edge instead of
  the chunky bevel), panel and modal heads as a lighter strip with a cyan accent rule (gold on event cards), section
  labels with a hairline to the edge, smooth slide/scale-in instead of 4-step animations, buttons with a light bevel,
  hover brightening and a gold focus ring, an accent edge on card buttons (build, tech, choices; gold on the default
  choice), a teal active speed, a gold marker on the open dock button and a gently pulsing badge, a gold edge on the goal
  card, toasts with an accent bar and readable text, tabular numbers, thin scrollbars, a glowing tutorial spotlight.
  Pixel corners, pixel icons, Silkscreen titles and the world stay as they were. No backdrop blur (the map redraws
  every frame; phones would pay). **Settings → Display → Interface look → Classic** brings back the old look.
- **How to Play** (new; menu, the dock's ? button, `?`/F1): Start here (the five acts, "you are here"), The core loop
  (a six-node ring + research/safety), **A typical day** (a six-step routine + "the shape of" the current act as a
  timeline), Reading the screen, The panels (every dock button: what it's for and when to open it, by act), Time & speed,
  Power 101, Chips & compute, Models/money/safety, one page per act reached (Acts II–V), Tips & common mistakes,
  Controls. Later acts' pages appear when you get there. Phones: topics become a scrolling chip row.
- **Bit's tutorial: 16 → 20 steps** — the loop in one breath (after hello), what the top-bar colours mean, why rent,
  what the four compute sliders are, why sites differ, then after the first order: **speed up** (waits for ▶▶▶ or
  Later), the dock, a typical day (on the goal card) and How to play. Each act's opening briefing now points at its
  handbook page.
- **Advisor tips** (`src/game/tips.ts`): one-off, never stop the clock, go away once fixed, a one-click fix and a
  "Learn more" into the handbook: Bit on a slow clock (40 days at 1× with 2+ months of waiting ahead), Iris on an
  idle lab / a negative margin, Mira on a half-empty hall with nothing coming, Juno on a brownout, Penny on rentals
  left running and a short runway, Bit on the first campus. Settings → Gameplay → Advisor tips.

The user's calls on shipping: the modern look and the tips stay **on by default**; **no backdrop blur** (phones must
stay fast). The tutorial's speed-up step can be skipped with "Later".

## 24. v0.9.1 "Skip Ahead": skip-ahead, side goals, Stats, campus moments (shipped 2026-11-06)

Ideas I proposed after v0.9.0 from the user's Act I save (hall online day 406, Bit-2 day 762 — a year of waiting; the
lab idle; 500 Cumulus chips still rented into Act II). The user picked all but the Steam prep (controller support,
an Act I demo, a trailer mode, translations — a later session), and answered: skip = both a main button and one per
line; Act I = side goals plus a few techs; Stats = its own dock button; campus moments = a pop-up, never a camera cut.

- **Coming up + skip-ahead** (`sim/upcoming.ts`, the goal card): what you're waiting for with how long (builds,
  upgrades, chips per site as one line for the whole order — its arrival estimated from the order's pace plus sailing
  time, since weekly batches made "next" a one-week hop —, grid connections, the run, research, Act III projects, bids
  and the Council session). **⏭ Skip to next** and a small ⏭ per line run the clock flat out until that day; a card or
  any speed button stops it; a bar at the top shows where to, with Stop. Acts IV–V already jump.
- **Act I side goals** (optional, `side: true`, shown one at a time under the goal card and in their own Goals section,
  research rewards): a second site (+15), a research lab (+10), a wind farm (+10), stop renting cloud chips (+10), run
  on your own clean power (+15). Four Act I techs: Data Curation, Prefab Electrical Skids, Weather-Aware Dispatch,
  Red-Team Bounties. Bit's "while we wait" tip points at them. Act I bot: day 686 → 690.
- **Pin a goal** (📌 in Goals): it leads the goal card (`meta.pinnedGoal`).
- **Stats panel** (dock, K): cash, revenue vs costs, compute, power, chips, capability vs frontier, the safety margin,
  K, and the Charter treasury / warming when they exist; one point a month on the save plus a live "now" point; log
  scale when a line spans 50×; hover to read a month; This act / 5 years / All.
- **Campus moments** (`game/moments.ts`): halls, labs, firm plants, fabs, packaging and megaproject stages offer a
  "Take a look" card (the advisor tip card); the one-off campus tip is gone.
- **Missed messages**: every toast this session is kept; News → Messages lists them, marking the ones that arrived
  at ▶▶▶ or during a skip, and the News button counts those you haven't looked at. Penny repeats the rentals tip once
  in Act II.

## 25. v0.9.2 "Pocket Size": the phone pass (built 2026-11-07)

The user's report from their phone (the Android app, landscape, ~777×377 CSS px, a punch-hole camera on the left):
Bit's bubble ran off the bottom so the tutorial's Next button couldn't be tapped, and the main menu sat away from the
edge with its foot cut off. Asked for "a deep mobile readiness pass" as the next version.

Causes found (and confirmed in the emulator's real WebView with a simulated punch-hole cutout):
- **Tutorial bubbles** were placed for a ~150 px tall bubble; the v0.9 steps are longer (step 2 is ~250 px on a phone).
- **The Android app double-counted the cutout**: LauncherActivity pads its root view clear of the cutout, and the
  WebView still reports the cutout as `env(safe-area-inset-*)`, so `#ui` moved in a second time (52 px on the AVD).
- **`vh`/`vw` inside zoomed boxes**: CSS `zoom` multiplies px *and* viewport units but not %, so `max-height:
  calc(100vh - 32px)` on a box with zoom 0.88 (phones) stopped 12% short, and at Interface size 125% ran 25% off the
  bottom (menu column, panels, windows, modals, the dock's button size).
- **The top bar** needed ~820 px on a phone; a phone has ~720.

What changed:
- `ui/Tutorial.tsx`: one `SpotBubble` for Bit's steps and the briefings. After every render it measures itself and
  `placeBubble` (pure, exported) picks below / above / right / left of the target (right first for tall targets such
  as the dock), the first that fits inside the safe area (`#ui`'s rect); if none fits, the clamped spot that covers
  the least of the target. Max height = the safe area; the text scrolls (`.tut-main`), the buttons don't. Phones:
  460 px wide, 14 px text, a 40 px portrait.
- `styles.css :root`: `--safe-t/r/b/l` (env() by default, 0 under `html.native-insets`, which platform.ts sets in the
  Android app) and `--z` (the HUD zoom). Zoomed boxes size in % of the screen; where a viewport unit is needed
  (`--dock-b`, guide lists, How to Play pages) it's divided by `--z`. `.scrim` and `.ending` get one `minmax(0, 1fr)`
  grid row so a modal's `max-height: 100%` is the screen.
- **Main menu on short screens** (`max-height: 520px`): a 440 px two-column grid (logo, Continue and the footer span
  both), vertically centred; no footer under 370 px tall, and a smaller logo and Continue button under 340 px (a phone
  browser with its bars). Fits without scrolling at 377, 375, 360 and 300 px tall. The app banner shrinks to stay clear.
- **Top bar on short screens**: tighter speed buttons, date (no min-width), stats (5 px padding, 15 px values), K
  meter (48 px bar). The stats strip scrolls; `TopBar` marks it `.more` (a fade on the right) while there's more.
- **Toasts on short screens**: over the news ticker at the bottom right, one line (ellipsis), 22 px portrait, the
  newest two; a tap dismisses one anywhere (`game.dismissToast`). News → Messages has the full text.
- **Plan modals** (Act IV five-year plan, Act V era plan) on short screens: the Begin / Not yet buttons are sticky at
  the foot of the scrolling body.
- **Diorama bar** on short screens: left, beside the dock (the inspector is on the right).
- **Touch** (`pointer: coarse`): an invisible ::after margin (5 px × 3 px) around `.btn.small` and the speed buttons;
  sliders 26 px tall with a 16×24 thumb.
- What's New (game and website) renders `**bold**`.

QA: a Playwright harness (scratchpad, not in the repo) screenshots the menu and its windows, all 20 tutorial steps,
the HUD, every Act I panel, an event card, a campus, every Act II–V panel and tab, the plan modals and the ending at
731×377, 777×377 (+46 px cutout), 640×360, 667×375, 863×300, 915×412 and 1200×540 (touch), and 1366×768 /
1920×1080 / 1366×768 at 125% (desktop), and lints for controls outside the screen that no scroller can reach (none
left). The emulator (AVD `kp`, the 0.5.2 debug APK, punch-hole cutout overlay) loaded the dev server through CDP
(`Page.navigate` to http://10.0.2.2:5317/play/?app=android): `#ui` starts at 0, the menu at 7 px, step 2 fits.

Calls I made: kept the 520 px breakpoint (a 1200×540 phone gets the desktop layout, which works); kept the 0.88 phone
zoom; no native change in the APK (the web fix covers every installed app version).

## 26. v0.9.3 "Clear Signs": the dock icons (shipped 2026-11-08)

The user's ask (screenshot of the Act II dock on their 2560×1440 monitor at 1.25× scaling): the sidebar icons are "a
little bit too low quality … too old-fashioned and retro"; make them more recognizable and keep the pixel look.

Why they looked rough: 9×9 art has too few pixels for a silhouette (orders was a brown square, deals two arrows, blocs
and goals both flags), and at 1.25× an `<img>` of 27 CSS px is 33.75 device px, so art pixels came out 3 and 4 device
pixels wide in turn.

What changed:
- `ui/dockIcons.ts`: 19 icons on a 13×13 grid plus an automatic 4-neighbour outline (`ink0`) = 15×15, light from the
  top left, one colour family each: compute (a chip), orders (a taped parcel), research (a flask), finance (a $
  coin), stats (rising bars), team (three people), deals (a handshake), blocs (two flags), goals (a target and arrow),
  Field Guide (an open book), news (a front page), the Charter (Earth in a sunburst), the Council (a marble hall),
  the Planet (the Earth), the System (the Sun and its swarm), the line tool (a pylon), fiber (light out of a cable),
  How to play (a ? bubble), Settings (a gear). Hand-drawn grids, `disc()` for round things, `bevel()` (shading from a
  mask) for the gear and the pylon. `tests/dock-icons.test.ts` checks size and outline; with PREVIEW_DIR it writes a
  contact sheet (`DOCK_ZOOM=name,name` adds a 10× zoom sheet for pixel work).
- `ui/DockIcon.tsx`: draws one on a canvas that fills its box, sized in device pixels (Chrome's
  device-pixel-content-box when it agrees with our estimate, else CSS size × devicePixelRatio × every ancestor's CSS
  zoom), at the largest whole-number scale that leaves ~10% room (2× when only a tight fit allows it). 1.25× desktop:
  3 device px per art pixel; 1×: 2; phones at 2.6×: 4. The dock and How to Play's panel list use it; Settings →
  Display → Interface look → Classic keeps the 9×9 icons.
- Bug found on the way: the achievements medal (v0.7.0) had a global `.badge` rule (72 px wide) that stretched the
  dock's red "1" badges into bars across the button (visible in the user's screenshot). Renamed to `.ach-badge`.
- No hover slide on dock buttons in the modern look (2 CSS px is 2.5 device px at 1.25× and blurred the canvas).
- Desktop updates (`platform.ts#downloadWithRetry`): the user's 0.9.2 update took ~30 minutes. Measured on their
  machine while it ran: the app's one GitHub connection was crawling at ~50–60 KB/s with its receive queue empty and
  a 1.7 MB window (GitHub sending slowly, not the app reading slowly), while curl fetched the same 93 MB AppImage in
  3 s (31 MB/s) from the same server IP. Now each try has a time limit (90 s, 4 min, then none) and starts over on a
  fresh connection (Tauri's `download` builds a new client per call); `install()` runs once after a good download; a
  signature failure isn't retried. The toast says "· reconnected" on a second try. `tests/update-retry.test.ts`.

Calls I made: 15×15 (odd, so round icons have a centre pixel; fits 3× at 1.25× in a 44 px button); goals became a
target (it was a second flag next to blocs); the 9×9 icons stay everywhere else (top bar, panels, text); not yet
tried on the AppImage (WebKitGTK has no device-pixel box, so it takes the estimate path) or a real phone.

Next for this style, if the user likes it: the top bar's stat icons, panel headers and the build buttons.

## 26b. v0.9.4 "Fast Lane": the update download, done properly (shipped 2026-11-08)

The morning after 0.9.3 the user's 0.9.2 → 0.9.3 update crawled again (51 of 93 MB after 25 minutes, ~30 KB/s on one
connection). 0.9.3's retry couldn't help: the old app does the download. Measured from the user's machine: GitHub's
download host (release-assets.githubusercontent.com) has four addresses, and fresh connections to them ranged from
~25 KB/s to ~50 MB/s, varying per connection rather than per address (an address slow on one try was fast on the next).
The retry was also weaker than it looked: its 90 s first try killed a healthy 1 MB/s download at 97 %, and its last,
unlimited try could land on a crawling connection again.

- `src-tauri/src/fastdl.rs` (the `update_fast` command): probe the first byte (size, the URL after GitHub's redirect),
  look up the host's addresses (in the family that answered), then fetch 2 MB pieces over 6 connections, each pinned
  to an address. A connection is dropped when no bytes come for 8 s, or when after 4 s on a piece it runs below
  max(64 KB/s, the best recent piece speed / 8); the bytes it got are kept and the rest of its piece goes back in the
  queue for a fresh connection on the next address. An expired link (GitHub signs it for 30 minutes) is fetched again.
  No bytes on any connection for 60 s = give up. The bytes go to the updater's `Update::install`, which verifies the
  signature first, so the security is the plugin's own.
- `platform.ts#installDesktop`: the fast download first; errors starting "fast download:" (no range support, no
  network) fall back to the updater's own download (now limits 3 min, then none); a bad signature or a failed install
  is final.
- Tested: 7 Rust tests against fake servers on 127.0.0.x (fast, slow, stalled, hanging up, hanging, no ranges, expiring
  links; turning the slow-drop off fails the timing test); the real 0.9.3 AppImage from GitHub 3× (5–7 s, 13–18 MB/s,
  signature verified); end to end, a local build calling itself 0.9.2 found 0.9.3, downloaded it in 5.4 s, installed it
  over its own file and restarted as 0.9.3 (byte-identical to the release). Three JS tests for the fallback.
- Only from 0.9.4 on: the 0.9.3 → 0.9.4 update still runs 0.9.3's retry.

Calls I made: 6 connections and 2 MB pieces (45 requests for the AppImage; not tuned further, 5–7 s seemed enough);
the same code for Windows and macOS (untested there, like the rest of the desktop updater).

## 27. Proposal: taking it to Steam (2026-11-08, NOT agreed — for the user to pick from)

The user's brief: v1.0 is when marketing starts; the goal is Steam and real sales; "what can we do to push this to the
next level?" Ten ideas, most leverage first. Effort: S = a session, M = a milestone, L = several.

1. **Decide the web ↔ Steam split before anyone knows the game (S).** Today the whole campaign is free on the web, the
   PWA and the Android app. A free full game next to a paid Steam one undercuts it, and taking it away after launch
   reads as a bait-and-switch. Proposal: when the Steam page goes up, the web/Android build becomes the demo (Act I,
   maybe the start of Act II) with its save carrying into the full game; the full campaign is on Steam (and maybe
   itch.io). Nobody plays it yet, so now is the free moment to decide.
2. **Steam page at v1.0, launch later: wishlists first (S).** Steam Direct fee ($100), a Coming Soon page with capsule
   art, a trailer, screenshots and tags (Management, Simulation, Strategy, Pixel Graphics, Economy, Sandbox, Sci-fi),
   then months of wishlists, the demo in a Steam Next Fest (three a year), and launch after. Wishlists at launch
   decide Steam's own promotion. Positioning line: "Plague Inc. meets Game Dev Tycoon, about the race from a garage AI
   lab to a Type I civilisation."
3. **A store kit and a trailer mode, rendered by the game itself (M).** `npm run gen:steam` (next to gen:assets) for
   every capsule size (header 920×430, small 462×174, main 1232×706, vertical 748×896, library 600×900 + hero
   3840×1240 + logo) with key art made for it: the climb from the garage at the bottom to the swarm at the top. A
   trailer mode: HUD off, scripted camera glides and time-lapses (TourDirector already does most of it), whole-number
   scaling at 1080p/4K. And the real theme song: trailers live on music.
4. **The model leaderboard, "the Arena" (M).** A monthly ranking of every model in the world (yours, the rival labs',
   the startups') with benchmark scores, a #1 spot to fight for and headlines when someone overtakes. Gives Acts I–II a
   score to chase and the rivals a face; it's the most on-theme mechanic for an AI audience. The rivals' models
   already exist in the sim.
5. **A voice: the satirical feed (M).** A fake social feed beside (or instead of) the news ticker: fictional
   researchers, pundits, doomers, accelerationists and rival CEOs reacting to your moves, with likes and ratios, plus
   a short pixel TV-news cut for the big milestones (an anchor at a desk saying your company's name). It's what people
   screenshot and post. Everyone fictional.
6. **A shareable time-lapse of your run (M).** At each act's end (and from Stats): a 15–20 s GIF/MP4 of the world map
   from 2027 to now (sites lighting up, cables, the supergrid, the swarm) with the K meter climbing and your company's
   name. The end card already exists; a moving one is the organic marketing loop.
7. **Replay: scenarios, a weekly challenge, New Game+ (M).** 8–12 scenarios on top of the sandbox sliders, each with a
   win condition and bronze/silver/gold by date (the strait closes in 2029; a global pause; fusion never works; open
   weights win; speedrun to Type I); a weekly seed everyone plays (Steam leaderboards later); shareable scenario codes;
   legacy perks after Type I. Steam players judge value in replay hours.
8. **Streamer mode: chat votes on event cards (S–M).** The event cards are made for it: read Twitch chat anonymously
   (IRC over WebSocket, no login), show a 30 s vote bar on the card, take the winner. All the music is generated, so
   it's stream-safe already. Streamers are the biggest discovery channel for sims.
9. **A Steam-native build (L).** Steamworks achievements (the 37 have ids ready), Steam Cloud for the five slots, rich
   presence ("Act III · 2041 · K 0.812"), full controller support and 1280×800 readability for Steam Deck Verified, and
   the Tauri-vs-Electron call (the Steam overlay is dependable with Electron's Chromium, shaky over WebView2/WebKitGTK).
   Steam requires an AI-content disclosure: lean into it ("a game about the AI boom, built with AI").
10. **Localisation, Simplified Chinese first (L).** Often Steam's largest language, and the AI race is a huge topic
    there. An i18n layer (keys for content, events, How to Play), LLM-drafted translations against a glossary plus a
    paid native review, Noto Sans SC behind Atkinson for running text and an open CJK pixel font for titles. Then JA,
    KO, DE, PT-BR, ES, RU, FR.

Also in the retune (already planned, now with a Steam reason): Steam refunds anything played under two hours, so the
first two hours (Act I and the opening of Act II) must be the strongest part; the long Bit-2 wait is the known hole.

## 28. The 3D edition (agreed 2026-11-09, building on branch `3d`)

The look test (art3d/DIRECTION.md, branch `3d-look`) won the user over: "this looks freaking beautiful", the *Model*
look, not the pixel hybrid. The brief: remake the whole game in 3D **alongside** the pixel game, so both exist and the
user picks one when the 3D one is complete. It must be **the same game** (same sim, acts, panels, globe, tutorial,
saves); only the look changes. Refine it properly, not as a demo.

**How:** one game, two renderers. `play3d/index.html` → `src/main3d.ts` builds the same `Game` with a three.js stage
(`src/render3d/stage3d.ts`) and 3D scenes behind the existing `SceneFactory` (map → the globe, diorama → the campus,
tour → the same TourDirector, orbit, system). Sim, content, UI, tutorial, saves, audio and platform code are shared,
so every sim or UI change lands in both. Shared-code changes stay type-level (a `Stage` interface both stages meet).

**Look rules** (from the test, kept): scale-model art (bevelled, matte, hand-painted colour, the game palette);
Meshy for hero models via concept image first (one style brief), code for repeating/growing/moving pieces; soft sun
shadows, AO, cloud shadows, tilt-shift, a real day/night; life everywhere. **Changed from the test:** campuses are real
places, not floating slabs: the ground runs to the horizon with each backdrop's distant land (plains, desert, coast,
mountain, boreal, temperate, tropical, savanna, volcanic, lunar); the world map is a 3D globe.

**Feedback to fix from the test:** better people (rigged, animated), varied vehicles, no cars parked in the road,
the garage's missing wall (the Meshy cut-away).

**Milestones:** 3D-1 Act I end to end (stage, globe, campuses for every Act I site, people, vehicles, menu + tour,
tutorial targets) · 3D-2 Act II (new plants and tiers, suppliers, mines, landing stations, rivals, cables, ships) ·
3D-3 Act III (Geneva, megaprojects, launch sites, HVDC, satellites) · 3D-4 Act IV (supergrid, fusion, orbit view,
Moon, spaceports, climate) · 3D-5 Act V (solar system, foundries, asteroids, swarm, habitats, the Type I ending) ·
3D-6 quality presets for phones, performance, desktop/Android builds of the 3D edition.

**Budget:** Meshy credits are the limit (about 30–45 per hero model, 850/month; the user tops up as needed). The whole
game needs well over that: code-build wherever it looks as good. 1,060 left on 2026-11-09 after the townsfolk.

**Status (2026-11-09):** 3D-1 to 3D-5 built. Every place in the game has 3D art: all Act I–II facilities and tiers,
the suppliers, mines, landing stations and rivals, Geneva, the 12 megaproject kinds, launch sites with the full launch
cycle, fusion (five designs) and air capture, the Moon base, the L4/L5 yards, Ring One, Aurora's town inside its
painted cylinder, and the asteroid mines; the globe, orbit and solar-system views; the menu tour plays every shot.
3D-6: quality presets done; scenes free their GPU memory on exit (flat across visits); the production build serves
/play3d/ and the service worker keeps the models once fetched (offline after a first visit). Measured per frame (all
passes, high preset): 200–1,200 draw calls, 1–8.5M triangles (Act I 6.0M high / 1.6M low after trimming roads and
plant shadows). Real GPU (the dev laptop's Intel iGPU, on battery): the old high preset ran the Act I campus at 8 fps at
2× in a large window, so AO went to half resolution, MSAA to high only (FXAA below), Auto picks high only for a named
discrete GPU, and Auto adapts the 3D resolution to the measured frame cost (medium now ~26 ms at 1.5× in Chrome). The
3D edition runs in the desktop app (WebKitGTK, checked with a debug build) and in the Android app (emulator), and the
chosen edition is remembered across launches. Also checked in 3D: the tutorial's spotlights, an Act IV jump, the Type I
ending, the launch at night. **Open:** the user's own look on their hardware; optional Meshy heroes the art agents
suggested (council hall, ferry, crawler, haulers, landers, rovers); merging to main (the live site and the apps only get
/play3d/ then). Then the user's choice between editions.

**The polish pass (v0.10.1 "Lived In", 2026-11-10)** — the user's first list after playing 0.10.0 in 3D on the desktop
app ("not quite sparking joy"): the menu globe flickered; side roads were flat black; campuses had a floating edge
(vehicles drove off it, buildings hung over it); roads were tiles; code-built rocks and bushes looked poor close up
("use more Meshy credits"); people walked through buildings with no schedule; the zoomed-out globe looked worse than 2D;
colours, speed; and realism of the mechanics, not just the graphics. What changed:
- Globe (`globe/earth.ts`, `soft.ts`): coasts, borders, clouds and cable lines anti-aliased from screen-space
  derivatives, mipmapped detail noise instead of per-pixel noise, the pixel map's biome ramps and sea depth bands, baked
  relief, sea ice; no FXAA on the globe (`Look.fxaa`); solar megaproject fields as one mipmapped disc (no moiré).
- Campus ground (`layout.ts`, `ground.ts`): plots grow east from a fixed west edge, so a build never moves the gate, the
  access road or what's built, and the levelled ground covers every future plot; terrain graded along the roads
  (sampled profile, smoothed, blended over a corridor); objects sit on the drawn triangles (`meshHeight`).
- Roads (`roads.ts`): continuous ribbons with shader-drawn, anti-aliased markings (centre dashes, edge lines, stop lines,
  zebras), kerbs, pavements, rounded junctions and a turning circle; one material for every road kind.
- Grass (`grass.ts`): instanced blade clumps swaying in the wind, a sparse carpet everywhere and a dense patch on a world
  grid that follows the camera up close. Farmland (`fields.ts`): crop fields with rows, pasture, dry range, orchards,
  centre pivots, hedgerows and tree lines round campus and megaproject sites.
- Meshy scenery: rock, boulder, broadleaf, pine (`--nature` style) simplified with `tools/glb-lod.mjs` (meshoptimizer),
  foliage normals spherized; code shrubs rounded; far plants cast no shadows.
- Traffic (`vehicles.ts`): the intelligent-driver model (gaps, queues), filleted routes with a curvature speed limit,
  give-way before turning across traffic, stop lines with a front-bumper hold; deliveries yield, dock and leave.
- People (`people.ts`, `paths.ts`): an A* walk map on a 0.5 m grid (pavements preferred; buildings, fences, cars
  blocked), schedules on the campus's local hour (arrivals, breaks, lunch, errands, rounds, leaving, crews, the night
  guard), Meshy animation clips (idle, chat, talk, phone, drink, sit, hammer, carry…), doors and blockers on Act I
  pieces; `tests/render3d-people.test.ts` walks a whole day.
- Light: far-north campuses take their sun from a squeezed latitude (`lightLat`: real to 40°, ×0.3 beyond: Luleå lights
  like 47.7°N), so a winter noon sun stands near 20° instead of 1–7° (the user chose readable over true to life); more
  sky fill when the sun is low; a warmer Act I grade; less tilt-shift close up.
- Speed on the dev laptop's iGPU (2048×1152 at 1.25): wide ~43 ms, close ~39 ms (0.10.0: ~38–42 / ~32–34) with all the
  above. Checked in headless Chrome and a debug desktop build (WebKitGTK).
**Still open after 0.10.1:** commuter cars don't drive in or out (people appear at their car); figures set pieces
place directly (Moon astronauts, some Aurora townsfolk) hold a walk frame; Act II plants and Act III–V set pieces have a
guessed front door only. The website went 3D the same day (hero globe, shots, OG card, Play → /play3d/).

## 29. v0.11.0 "Golden Hour": the grand polish pass (built and shipped 2026-11-10)

The brief, with the user away: "100x this game … aesthetics, quality, performance, graphics, sound … this is the model
we publish this game to Steam with. Polish it until it's perfect." No questions could be asked, so every call below is
mine and listed. North star for all of it: **a film crew shooting a scale model of the future** (physically motivated
light, a real sky, aerial perspective, filmic contrast, glowing nights; never muddy, never flat). Steam ships the 3D
edition on desktop; the pixel edition had to stay exactly as it was (checked: its interface differs by 0 pixels).
Five strands, built in parallel on disjoint files (four Claude helpers in git worktrees, the campuses by the lead),
merged into `grand-polish`.

**Campuses: light, sky, atmosphere (`render3d/atmosphere.ts`, `campus/sky.ts`, `post.ts`)**
- `atmosphere.ts` patches three's own shader chunks once, so the 150-odd materials the pieces make need no changes:
  the fog chunks become aerial haze (an exponential height fog integrated along the ray, squared so the campus stays
  clear and the world's edge is never seen, tinted toward the sun with the same sum the sky dome makes at the horizon);
  `lights_fragment_end` gains the **lamp field** (every light pool drawn from above into one texture, re-drawn every
  2–4 frames, which lights ground, walls, cars and people at night) and **sky reflections** on anything with roughness
  under 0.6; `lights_physical_fragment` gains **wet ground** in rain. Every material gets the shared `atmo` uniforms
  through an accessor on `Material.prototype.onBeforeCompile` (assigning a hook wraps it; its text still keys the
  program cache). All of it only acts where `scene.fog` is set, i.e. on campuses.
- `sky.ts`: a shader dome (gradient, sun and moon discs, a glow round the sun, clouds from the shared noise lit from
  the sun's side, stars, the Milky Way, the aurora above 50° latitude) and light keyed to the sun's altitude: a warm key
  against a cool fill, exposure rising toward sunset, a blue hour, a moon kept high so nights read. Weather greys it;
  under cloud the sun gives way to the fill.
- `post.ts` rewritten without EffectComposer: one scene render (HDR, MSAA on high, with a depth texture) feeds GTAO
  (normals rebuilt from depth: no second scene render), a separable depth-of-field (the miniature read; the old
  screen-band tilt remains for scenes that ask for it), bloom, then one "film" pass (exposure, neutral or ACES curve,
  sharpen, the era grade, contrast, vignette, grain, fade) and FXAA below high. `Look` gained `tone`, `exposure`, `dof`,
  `contrast`, `sharpen`, `saturation`; the default stays the neutral curve, which the globe and space scenes kept.
- Ground (`ground.ts`): steep ground shows level rock strata per pixel (mesas, canyon walls) and a bump from the grain
  (high only); `open` eases far relief down to a lake shore. Water (`water.ts`): a sheet cut from the ground's own grid
  with a depth per corner: shallows, foam, three turned ripple layers. Rain (`weather.ts`): GPU streaks.
- Camera: pitch down to 1.5 rad (the horizon and sky are in view), an arrival move (fade up, come down, settle), the
  habitat seen down its axis through a 54° lens with bulkheads, real grass in its meadow.
- The menu tour is directed (`game/tour.ts` `light` + `move` per campus shot → `CampusScene.direct`): seven lights
  (dawn … night, found from today's sun at the site) and seven moves (rise, orbit, push, fly, crane, low, sky); fair
  weather in the tour.
- Photo mode (`ui/PhotoMode.tsx`, `game.photo`, `Stage3D.capture`): hour, weather, lens, blur, a 4K PNG without the
  interface; the clock waits.

**The globe (`render3d/globe/`: `earth.ts`, new `bake.ts`, `space.ts`, `markers.ts`)**: one air model for surface,
clouds and halo; weather as a static climate texture with noise drifting through it (ITCZ, storm tracks, spirals, clear
deserts), self-shaded with ground shadows; richer land and relief, turquoise shelves, sun glint; night lights baked as
amber and white channels with towns placed by biome, coast and metro; moonlit night side; auroral ovals; stars, Milky
Way and the Sun; lines with a core, a glow and comets of light in the shader; marker halos; pill labels; zoom and drag
that keep the place under the cursor.

**Space (`render3d/orbit/`, `render3d/system/`, new `render3d/space/`)**: a shared kit (a galaxy baked into a cube map,
a Sun with granulation, corona, prominences and an occluded flare, procedural Moon and planets, feathered ribbon
lines); the swarm as up to 19,000 instanced sails on real orbital planes, lit on the GPU; the orbit view with the Earth
filling the frame, constellation planes, lit stations, launch arcs and storms; the Type I ending as one directed
pull-back (`system/cinematic.ts`, 13 s to the held frame inside the game's 16 s).

**The 3D interface (`render3d/edition.css` → `render3d/ui/*.css`, `play3d/index.html`, small hooks in `src/ui`)**: a
theme scoped to `html.edition-3d` (dark glass with a hairline, no backdrop blur; Atkinson throughout, pixel art kept
on whole device pixels), a loading screen whose logo flies to the menu, a title screen that frames the tour, the HUD
and every panel, card and late-game screen restyled, automatic scale on big screens. Classic look falls back to the
old frames.

**Sound (`src/audio/`)**: a mix with three buses (sfx, music, ambience), a generated hall and a tempo-synced echo as
shared sends, then a sub filter, a glue compressor, a limiter and a ceiling at −1.5 dBFS; a cinematic score of seven
pieces on one theme (so–do–re–mi answered by a fall; menu D major 76 bpm, era 0 C/A minor swung, era 1 G 112, era 2 F
in 12/8, era 3 E Lydian without drums, era 4 B with a formant choir, the ending D rising to E) with voice-led chords,
seeded section orders and a mood (rests when paused, a drive layer at speed, a tension layer in finales); the chiptune
kept as its own soundtrack (`soundtrack`: auto = cinematic in 3D, chiptune in the pixel edition); all 21 effects
redesigned in layers plus 7 new ones, in the music's key; nine living ambience beds (the 3D campus had none).
**Nobody has heard any of it**: it was built and judged by measurement (offline renders of the real mix: music
−16 LUFS integrated at full sliders, about −22 at the default ones against −39 to −42 before; true peak never over
−1.8 dBFS; no clicks apart from era 0's deliberate vinyl crackle; live node count bounded). The mix is warm to dark
(little above 5 kHz): one shelf in `engine.ts` brightens it. Taste calls to audition: the crackle, the universal
button clicks and hover ticks (`installUiSounds` in game.ts), effects that shift with the music's key.

**Calls you may want to change**
- Version and name are mine: 0.11.0 "Golden Hour" (the user said "when this is done, ship it").
- Campuses use the ACES curve with exposure by the hour; nights are brighter and bluer than real ("day for night").
- The menu tour films each campus in a chosen light instead of the site's real hour (in play, campuses still follow
  the real sun at the site); the tour's weather is fair or cloudy only.
- The low preset has no blur and no sharpen; the ground bump and the guarded blur are high only.
- Silkscreen is gone from the 3D HUD; the title's tagline ("From a garage to a Type I civilisation") is new.
- Globe: clouds are anchored to geography and drawn under the markers and lines; in play their opacity is 0.64.
- Space keeps the neutral curve (ACES greyed the gold); the swarm sits at 0.9 AU; four sparse "ribs" over the Sun
  appear once the ring is about 72% built.

**Measured, and what is not**: `npm test` passes on the merged branch (119 tests; the people test needs a longer
timeout on a busy machine), the production build passes, the sim is untouched (no diff under `src/sim`, `src/content`).
Frame cost on the dev laptop's Intel iGPU, medium preset (what Auto picks there), 1920×1080, GPU time per frame from
`EXT_disjoint_timer_query_webgl2`, two runs each on a quiet machine, new against 0.10.1: the Wyoming campus 22–26 ms
(golden hour) and 23–31 (night) against 23–25 and 24–26; Geneva 16–22 and 17–23 against 19–21 and 19–23; the globe
5–7 against 6–7; the orbit view 9 against 6; the system view 5–7 against 3–5. So the campuses and the globe cost what
they did, and the space views 2–3 ms more. (While the helpers were running, identical runs differed by 3×: measure on
a quiet machine or not at all.) What made medium level again after the new effects went in: four unguarded blur taps
a side below high, the sharpen done on brightness before the tone curve, the ground bump on high only, no blur on low.
The high preset was only run on the RTX 4050.
Before shipping, a debug desktop build of the branch ran the 3D edition in WebKitGTK (scratch XDG dirs, the WebKit
inspector): the title, a campus at golden hour, dusk and night, Geneva, the Moon, the habitat, the orbit and system
views all drew correctly (read back from the game's own frames: `Page.snapshotRect` can catch the canvas between
frames and show black), with no console errors, and the new audio graph built and ran (context running, convolver,
compressors, panners). Chrome on the Intel GPU drew the same views correctly too. Not run: Windows, macOS, Android.

**Open**
- The desktop app renders on the integrated GPU on hybrid laptops. Launched with `__NV_PRIME_RENDER_OFFLOAD=1
  __GLX_VENDOR_LIBRARY_NAME=nvidia` the installed AppImage's WebKit process ran on the RTX 4050 without crashing
  (picture not checked). A Settings switch (read before the webview starts) would make it a click; on Windows the
  equivalent is `--force_high_performance_gpu` for WebView2. Not built: too risky as a default, untestable on Windows here.
- Photo mode saves through the browser's download path, like the end card: not tried in the desktop app.
- (Done at ship time: the website's 16 screenshots, the OG card and the fallback globe were re-shot from this build.
  Scene shots came from `Stage3D.capture()` at 4K scaled to 1600×900; the garage break and the building crew from a
  real Act II game with a hall under construction and the campus clock at 10:24.)
- From the helpers: the website hero runs the globe's high shaders on phones (`earthMaterial(t, W, H, level?)` takes a
  level now); Act III's satellite, beam and liftoff on the globe were not exercised; power beams in the ending only show
  with beam capacity; the cinematic is capped at 16 s by `tickEnding`; the 4K-at-150% interface survey was partial.

## 30. v0.12.0 "All In": one game, 3D, desktop only (built 2026-11-11)

**The decision (the user, 2026-11-11):** the game goes to Steam, for Windows, macOS and Linux. So: no Android app, no
playing in the browser, no installable web app, and no pixel edition ("we're going full 3D"). They had played v0.11.0
and were happy with the look, the speed and the sound. The old code was to be deleted, not parked.

**What was removed**
- The pixel edition: its entry point, the Pixi stage, the map, the dioramas, the orbit and solar-system views, their
  sprites and helpers (about 28,500 lines in `src/render/`), the Edition setting and the hand-over from /play/ to
  /play3d/, `pixi.js`. Sixteen test files that only checked pixel art went with it.
- The Android app (`android/`, its CI job, the bridges in platform.ts, the in-game APK update, assetlinks.json).
- The web game: the Play buttons, the PWA (manifest, service worker, install prompts, `vite-plugin-pwa`,
  `workbox-window`), the phone-only interface (rotate-your-phone screen, phone fullscreen, the get-the-app banner,
  the share button).
- Settings that did nothing in 3D: Pixel size, Clouds on the map, Fullscreen on phones. Soundtrack lost "Auto"
  (old settings migrate: anything but Chiptune becomes Cinematic).

**What moved**
- The 3D game is `play/index.html` → `src/main.ts` (was play3d/ and main3d.ts). The desktop app still opens
  `play/index.html`; saves live in the webview's storage, which does not depend on the path, so they carry over.
- The pure code the 3D game borrowed from the pixel renderer now lives with it: the site planner
  (`render3d/campus/plan.ts`, `plan5.ts`, `planKit.ts`; the side view's "stretch to the screen width" logic and width
  hints were dropped, the 3D campus never used them) and the globe's layer data (`render3d/globe/layerData.ts`).
  `render/stage.ts` is only the stage contract now. `tests/site-plan.test.ts` keeps the planner checks the pixel
  preview tests used to carry.
- Two builds: `npm run build` → `dist/` (the game, for the app) and `npm run build:site` → `dist-site/` (the website,
  for Netlify). Netlify redirects /play/ and /play3d/ to the home page; `public/sw.js` replaces the old service worker,
  deletes its caches and unregisters itself, and the home page does the same for a browser that lands there first.
- The website: the hero opens on a dark planet (CSS) and the game's globe fades in over it (no pixel globe first; a
  still without WebGL); a smooth starfield; three download cards (Windows, macOS, Linux) filled from the latest GitHub
  release, the visitor's system lit and the hero button going straight to its file; copy without browser, phone or
  pixel-edition claims.

**Calls I made (easy to change)**
- Kept as pixel art: the logo, the app icon, the advisors' portraits, the interface icons and the Type I end card.
  They are the 3D interface's own art direction since v0.11 (SPEC §29) and the user had just approved that build;
  redrawing them is an art job, not a removal.
- Kept the Chiptune soundtrack as an option (Cinematic is the default), the Classic interface look and the Pixel
  text font: working options, no upkeep today.
- Kept the HUD's compact rules for small windows, touch input and the safe-area variables: a Steam Deck is a small
  touch screen. The app's window is at least 960×540, so most of the phone rules never fire.
- The website says "coming to Steam" (fine print, a stat tile, the download lede).
- Named it v0.12.0 "All In".

**Consequences to know**
- Anyone who played in a browser (or the Android app, which showed the live site) loses access to those saves when
  the website is deployed: they lived in that browser's storage for the site. Desktop saves are untouched.
- The website and the release must ship together: v0.11.0's installers still open the pixel edition by default.
- The Android signing key and its repo secrets are unused now. Left in place.

**Saving files (found while checking the desktop build):** inside the app a download link does nothing, so photo
mode, the end card, "File" and "Log" in Settings → Data all failed silently (they always had; the browser hid it).
The app now writes the file itself (`save_file` in src-tauri/src/savefile.rs, no new dependencies, no dialog):
pictures into Pictures/The Kardashev Project, the rest into Documents/The Kardashev Project, never over an existing
file, and the game says where it went. Checked in a debug build on Linux: a 4K photo, an exported company, the log.

**Checked:** type check; 22 test files (the bots for every act, the planner, the 3D layouts); the game in headless
Chrome on the RTX at High from the dev server and from the production bundle (menu, settings, Act I, Act III and Act V
places, orbit, the solar system: no console errors); the website from both (hero, downloads, a narrow window).
The desktop app as a debug build (WebKitGTK): it opens on the 3D menu at v0.12.0, 0.11-style settings migrate, a
saved company continues, a campus renders. Not checked before shipping: the Netlify redirects, which only exist once
deployed; Windows and macOS.

**The user's answers (2026-11-11)**
- "Coming to Steam" on the website: yes. The new sound: great.
- Nobody else has the game (the link was never shared), so cutting off browser saves costs nobody anything.
- Versions keep going up in small steps; v1.0.0 waits until they start the Steam page. The full playthrough comes
  when they are fully happy with the game; the small unexercised bits (Act III's satellite and liftoff on the globe)
  wait for it.
- They can test the Windows build (dual boot); there is no Mac in the house, so macOS stays unverified.

**Still open (asked 2026-11-11, not answered yet)**
- Redo the logo, the app icon, the portraits and the end card in the 3D style, or keep the pixel art as the game's
  signature?
- Drop the Chiptune soundtrack, the Classic look and the Pixel font too?

## 31. v0.13.0 "New Faces": no pixel art, no retro options, a graphics-card switch (built and shipped 2026-11-11)

**The decision (the user, 2026-11-11, after v0.12.0):** "change all the remaining pixel art to 3D style, you can use
my Meshy credits without asking should you need to generate any more models. and drop all the other retro options.
also build the switch to run the game on the stronger GPU". Later that night: "when you and all the [sub] agents are
finished, ship it and wrap the session". They had seen none of the new art when it shipped.

**How it was run:** one shared direction (`art3d/INTERFACE.md`), then three helpers in git worktrees on disjoint files
(portraits, icons, the logo / app icon / end card / site previews) while the lead built the graphics-card switch and
removed the retro options. The art sizing styles were split into three files first so nobody shared one. All three
merged with two expected conflicts. No Meshy credits were spent: about 70 characters in five moods and four ages
can only be made in code.

**What replaced what**
- **Portraits** (`src/render3d/portraits/`): every face is a 3D bust rendered live from the same look data as the
  pixel portraits (hair style, skin, clothes, extras, backdrop), with the five moods and the four ages; Bit in each
  generation; the four AIs as abstract forms. One extra WebGL renderer, 240 px pictures, cached. A new face costs
  10–50 ms, so past 16 ms in one render pass the rest get a stand-in and are swapped in as they finish; the
  one-off shader compile (about half a second) is paid behind the loading screen (`warmPortraits`).
- **Icons** (`src/ui/icons.ts`, `dockIcons.ts`, `medals.ts`, `iconKit.ts`): 123 interface icons, 19 dock icons and
  four medals, each drawn by hand as SVG in two or three tones of the colour players already know. Contact sheet:
  `/play/icons.html`.
- **Logo** (`public/logo.png`, `tools/brand/`): the same composition as an extruded 3D wordmark in Inter Black with
  the sunrise ramp in seven bands. **App icon**: the game's globe on a dark tile; plainer masters at 64 px and under.
- **End card** (`src/render/endcard.ts`): 1920×1080, a capture of the ending's scene at its held frame with the
  run's numbers. **Site previews**: relief maps from the globe's textures.
- **Removed:** PixelCanvas, the pixel font drawer, the pixel globe, the terrain painter, their preview tests; the
  whole-device-pixel sizing (`--ps`, `--dpr`, `round()`); the Classic look (`html.ui-classic`, `settings.uiStyle`,
  `is3d()`), the Pixel font (Pixelify Sans and Silkscreen are no longer shipped), the CRT filter, the Chiptune
  soundtrack (`audio/chiptune.ts`, `settings.soundtrack`). Old settings migrate.

**The graphics-card switch** (`src-tauri/src/gpu.rs`, `platform.ts`, `GpuNotice`): Settings → Display → Graphics card
(Automatic / Stronger), shown on Linux when two cards are found, always on Windows, never on macOS. The webview picks
its card when its processes start, so the choice is a small file read first thing at launch. Choosing Stronger
restarts the game; the new start is a trial, and only "Keep it" within 20 seconds makes it stick. A start that finds
an unconfirmed trial reverts to Automatic and says so. Found on the way: on NVIDIA's driver under Wayland, plain PRIME
offload kills WebKitGTK 2.54 at start (a Wayland protocol error), which is exactly the case the trial exists for;
turning explicit sync off fixes it, turning WebKit's DMABUF renderer off does not (one frame a second). Measured on
the dev laptop, a campus at High: 17 frames/s on the Intel card, 30 (the app's cap) on the RTX 4050.

**Calls I made (easy to change)**
- Dropped the CRT filter along with the three retro options the user had been asked about: it is one too.
- Kept the `html.edition-3d:not(.ui-classic)` selectors in the styles (always true now): stripping them lowers the
  rules' weight and could change the look in places nobody would check.
- Portraits are JPEG at quality 0.95 (three times faster to encode than PNG at this size).
- The logo's face is seven hard bands, echoing the old logo's stripes (`rampSoft` in tools/brand/logo.ts smooths it).
- Re-shot the website's one screenshot that shows the interface (`ui-campus.webp`: a Mojave campus at golden hour).

**Weak spots the helpers named** (none blocking)
- Everyone shares one skull: faces differ by hair, skin, clothes and backdrop more than by features. Fine detail
  (crow's feet, freckles, the scar) shows at 120 px, not at 40. Chorus is the least readable avatar at 40 px;
  Bit-0 is dark in the tutorial's first bubble.
- Icons the author liked least: debris, partner and the dock's handshake, train, sps, mega, dac, desk, foundry, co2.
- Event cards and goal hints still carry emoji from the content text (🧮, 🔬, ☀, 🌡).
- `arrow` (a left arrow) is the icon on "Save the picture".

**Checked:** type check; 22 test files (84 tests); both builds; the game in headless Chrome on the RTX (loading
screen, title, credits, an Act III card, the partners list, a campus, the ending's card) and the website; a debug
build of the desktop app on WebKitGTK (the logo, the icons and the busts draw; the graphics-card switch end to end:
Stronger, restart, trial, keep, back to Automatic, a crashed trial undone).
**Not checked:** Windows and macOS (the icons there, the graphics-card switch on Windows); the AppImage's own WebKit
with the switch; frame times on the Intel card with the portrait renderer; the trailer kit still shows the old look.

**v0.13.1 "Strong Suit" (2026-11-11, the same day): the stronger card was slower in the real app.** The user chose
Stronger in the installed AppImage and found the game "way more laggy". Measured with the installed file (a campus
at High, 1920×1824 device pixels): Intel 19 frames/s, RTX 3. The same program on the system's WebKitGTK 2.54: 19
and 36. The 3D does land on the RTX in both (the driver's limits show it); the bundled engine then copies every
frame through the CPU on its way to the screen. No environment switch changes that (explicit sync off, the DMABUF
renderer off, X11, NVIDIA's EGL forced: all about 3). My mistake: v0.13.0's switch was tested only in a debug build,
which links the system's engine. Fixes: on the stronger card the AppImage execs itself onto the system's web engine
when one is installed (`system_engine` in gpu.rs); the trial measures the frame rate and shows it against the
automatic card's, recommending "Go back" when it is slower; a kept choice that runs slowly is asked about at the
next start; the countdown runs by the wall clock (it ran late at 3 frames/s) and lasts 25 seconds. Checked by
starting the debug build the way the AppImage's launcher does (its hooks, its libraries first): restart onto the
system engine, 36 frames/s in the trial, an unanswered trial undone, and the slow case reported ("about 4 frames a
second, against 36"). Not checked: a real AppImage of this build (CI makes it), Windows.

## 32. v0.13.2 "Solid Ground": the visual bug sweep (built 2026-11-11)

**The ask (the user, 2026-11-11, with a screenshot of people sunk into the garage's paving):** "character feet
sinking into the floor, there are still plenty of visual bugs and inconsistencies to the game visuals ... get onto
perfecting everything".

**How it was run:** I took the build-site campuses and their people; three helpers in git worktrees took the
view-only places, the globe / space views / menu film, and the interface, each on its own files, each saving
before/after pictures. Every finding was confirmed by looking, most were first found by a check rather than by eye.

**The checks (kept in `tools/qa/`, run against the dev server and a headless Chrome):**
- `feetcheck.mjs <sites> [hour]`: a ray down from every person and vehicle outside; how far from the surface.
- `bumpcheck.mjs <sites> [hour]`: short rays at hip height round everyone; is anyone inside something solid.
- `floorcheck.mjs [filter]`: builds every facility (three tiers) and every set piece on its pad and lists floor area
  lying under the pad's top, and parked cars off their surface.
All three read zero at release. The interface helper added `tests/emoji.test.ts` (every emoji marker in the game's
text has an icon).

**The root causes worth remembering:**
- **The plot pad's top is 0.12 above the ground** (`pad()` in pieces.ts). Anything a piece lays lower is buried:
  that hid the garage's driveway, every car park's asphalt and bay lines, the launch pad's flame trench and the
  crawlerway, since v0.10. And everyone walking on a pad or a pavement stood 12 cm deep, because people followed
  the bare ground. Now: `walkH` in campusScene (ground, +0.12 on pads and pavements, a building model's own low
  decks from `deckOf` in models.ts), `settleCars` (life.ts) stands each parked car on what is under it once the piece
  and its pad are together, and slabs are laid with their tops at 0.14–0.15.
- **Paved paths were routed on the people's walk map**, which lets people squeeze past cars and cut across empty
  bays. Paths now use a map of their own (`campusWalkMap(…, forPaths)`: a path's width clear of every car, whole car
  parks closed: `parkedCars` leaves a `userData.lot` marker), and a piece can lay its own way out (`Piece.walks`: the
  data hall's walk between its entrance and its car park).
- **The sky dome painted the far land's haze over everything below the level line**, stars included: right on
  Earth and on the Moon, wrong where the ground curves away (asteroids) or is not there (the yards, the ring).
  `starFloor` in sky.ts; in open space the exposure is 1.55 instead of the Moon's 2.3 and the fill is doubled.
- **Light pieces that are not lit by the scene** (plumes, the launch smoke, the globe's megaproject patches and
  smoke) read as glowing white whenever the scene is dim. Each now takes the hour's light itself.
- **The menu film's globe used the real Sun**, so its captions were true at some hours only. Map shots carry
  `hours` and `season`; in play the Sun stays real.
- **Emoji as markers**: the sim and the content write emoji into headlines and card text (the sim even sorts by
  them), so they stay in the data and `ui/emoji.tsx` draws them as interface icons (`rich(text)`).

**Calls I made:**
- The plains' buttes are half as tall (`farH` in ground.ts): Wyoming's stood as a wall across the sky.
- The data hall parks five cars, not six, and no vans (a van reached over the walk).
- Car parks look emptier: a car only takes a bay it clears its neighbour in.
- The open pit runs two haul trucks, not three (three cannot pass on its road).
- Interface panes are 96–99.6% opaque instead of blurred: blur's cost in the app's web engine on an integrated
  card was not measured, and tokens.css already records it as too dear.
- The top bar still drops the Charter treasury and the safety margin at 1280 wide in Acts IV–V, but only then.

**Checked in the real web engine:** a debug build of the app (WebKitGTK, the system's) showed the icons in place
of emoji, the fitted top bar, the one scrollbar style, and the panels, by inspector snapshots. Not a packaged
AppImage, not Windows, not macOS.

**Seen and left (the helpers' lists, shortened):**
- Globe: region names can sit over markers from far out; lens-flare ghosts over the night side; Europe's night
  lights blow out at mid zoom; supergrid lines share the data cables' cyan; the liftoff cannot be seen from
  straight above; the router's kink at Panama.
- Places: the pit's shovel is half hidden in the default view; a fresh rocket fades in on the pad each cycle; the
  North Sea farm is dark at night; the pumped-hydro mountain's back is a steep wall; the nuclear site's cooling
  tower is complete at half progress; Bennu is very dark; Aurora's trees may reach the window frame.
- Interface: stat-card grids leave an orphan card; ✓ ✗ and the note button are text glyphs; dock badges cover much
  of a small icon in Act V at 720 high; at 1280×800 with 130% interface size Act V's dock and top bar still scroll.
- Art: Juno's "excited" face reads as startled; the Mercury icon is a half-disc and a dot at 16 px.
- Not looked at: megaprojects at stage 2, weather on view-only places, launch sites other than Guiana, the finale
  trackers, the time-lapse overlays, most Settings tabs, hover states.


## 33. v0.14.0 "Mission Control": the interface overhaul (built 2026-11-13)

**The ask (the user, 2026-11-13):** "an overhaul of the UI or the UX, like the front end, the panels, the loading
screens, the side bar menus ... everything else is fantastic, but ... this isn't triple A yet. I'm going to put
this on Steam, I want people to pay for it." No direction given ("I don't know what"), so the calls below are mine.

**What read as less than a paid game (a survey of every screen first):** one typeface for everything, with
Atkinson's slashed zeros in every figure (a terminal's look); grey-purple panes with hairlines and little depth;
panels as plain label–value tables with no first thing to look at; a dock of unlabelled icons; a build menu of
text boxes; event cards all alike; a bare loading screen.

**The calls:**
- **Type:** Saira (OFL, variable in weight 400–800 and width 75–100, 85 KB as a WOFF2 cut to Latin) is the display
  face: titles, small-capital labels (at 88% width), buttons and every figure. Atkinson Hyperlegible Next stays
  for running text. A second `@font-face` of the same file, limited to the ten digits and placed first in
  `--font`, sets the figures inside running text in Saira too. Settings → Accessibility → Text font = System still
  switches everything to the system face. Chosen against Sora, Outfit, Space Grotesk, Red Hat Display, Rajdhani,
  Barlow, Unbounded and others on a specimen of real HUD text.
- **Surfaces:** night-blue instead of grey-purple (`--e-ink-*` in tokens.css), a sheen at the top, a light
  hairline with a dark keyline outside it, brighter text (`--text`, `--muted`), brighter good / warn / bad. Still
  no backdrop blur.
- **The shell:** the clock (speed + date in one piece, a running light, "Paused"), stat plates in each stat's
  colour, the K meter as a ring toward the next milestone; the dock on plates, in groups, with a label that stands
  beside the button (`data-tip-at="right"`, `data-key` for the shortcut: `TipLayer`); tooltips with a title line.
- **A kit for panels** (`ui/kit.tsx`, `render3d/ui/kit.css`): `Tiles` / `Tile` (a big figure, its label, a line,
  an optional small chart), `SplitBar`, `Meter`, `Gauge`, `Spark`, `Card`, `Cols`, the `lrow` list row, tone
  classes (`t-gold`, `t-cyan`…). Compute, Finance and Research are rebuilt on it. The panels written before it lay
  their halves out as `.row.wrap > .grow` blocks opening with an `h4`: one CSS rule turns each into a card, so
  Acts II–V's panels gained the look without being rewritten.
- **Pictures in the build menu:** `tools/thumbs.mjs` shoots every facility type in the piece lab (its own 3D
  piece, warm light, a temperate plot) into `src/assets/build/*.webp` (420 × 280, about 15 KB each);
  `ui/buildArt.ts` hands them to the build cards and the facility rows.
- **Cards:** an event card takes its category's colour (`data-cat`); act-complete cards are `milestone` (gold).
- **The title screen:** capitals, no small icons, three groups; Continue names the save.
- **The loading screen** (`play/index.html`): the planet's limb at sunrise in CSS, stars, the progress line, a
  tip from a list of twelve in the page's own script.

**Checked:** every screen in Chrome on the real GPU at 1920×1080; the top bar, dock and panels in Act V at 960×540
and 1280×800; the title screen and the HUD in a debug build of the app (WebKitGTK, the system's) by inspector
snapshots; `npm test` (88 pass) and `npm run build`. Not a packaged AppImage, not Windows, not macOS, not 4K.

**Left for a next pass:**
- The Charter, Council, Planet and System panels wear the new surfaces and cards but do not yet open with tiles;
  Orders, Stats, News, Goals, Team, Deals and Blocs likewise. `kit.tsx` is there for them.
- The website took only the figures face (through base.css); its headings are still Atkinson. `ui-campus.webp`
  was re-shot; the marketing kit's stills and trailer show the old interface where they show any.
- Motion is where it was (eases on opening, hover lifts): no number roll-ups in tiles, no staggered lists.
- A 960-wide window more than 900 high (a tiled half screen) gets the big logo in a 560-wide menu column.

## 34. The interface grows with the acts (built 2026-11-13, in v0.14.0)

§33's pass was judged "barely noticeable": a restyle, not an overhaul. After five rounds of concept pictures (nine
directions, three fusions, then one idea of the player's own) the direction is this: **the interface is made of
what the civilisation has**, and so it is rebuilt as each act opens. It starts as paper on plywood in a garage
and ends as nothing but light. One clear change per act; one sticky note all the way to the end.

**One layout, five looks.** Nothing moves between acts, so nothing has to be learned twice: panels down the left
(keys with their names), the clock and the figures across the top with the Kardashev scale at the right, the next
goals top left, the picked site on the right, the news and what is coming along the foot.

| Look | Act | Rails and keys | Figures | Sheets | The Kardashev scale | Goals | A decision |
|---|---|---|---|---|---|---|---|
| 1 The garage | I | planks; label-maker strips | paper tags, pinned | taped paper | a tape measure | a sticky note | a newspaper clipping |
| 2 The scale-up | II | brushed metal; lit keycaps | amber readouts | paper on clipboards | a brass gauge | a sticky note | a typed signal, stamped |
| 3 The Charter | III | slabs of black glass; touch keys | on the glass | tablets | a ring on the glass | a sticky note on the hardware | a message on glass |
| 4 Planetary | IV | one strip of metal; keys of light | projected panes | projected panes | a brass gauge, a pane | a pane | a transmission |
| 5 Type I | V | none | floating light | panes of light | an arc across the sky, the Sun on it | a pane; Juno's 2027 note, framed | a transmission |

**How it is built.**
- `Game.applyLook` writes `<html data-look="1…5">`: the act's look in a game; on the title screen the look of the
  save Continue would open (1 with none). `settings.interfaceLook` (`'auto'` or a look the player has reached:
  `lookReached`) overrides it from Settings → Display. `lookNow` is saved so the loading screen
  (`play/index.html`, its own styles per look) can wear it before the game exists.
- `render3d/ui/looks/`: `layout.css` (the shared layout and its variables `--rail`, `--lrail`, `--footh`;
  everything floating is placed by `--e-top`, `--e-left`, `--e-foot`), `fonts.css` (Caveat, Permanent Marker,
  Special Elite, Share Tech Mono, Playfair Display; the textures in `assets/ui/`), `paper.css` (what looks 1–2
  share: the tokens turned to ink on paper, then bars, tiles, buttons, tabs, switches redrawn), `look1.css` …
  `look5.css`, `light.css` (what looks 4–5 share), `menus.css` (the title screen and the decision card per look).
  All of it is CSS on the v0.14 markup; a look is a file of tokens and overrides.
- New markup: `ui/Foot.tsx` (`FootStrip`: the latest headline, and `upcoming(s)` as buttons that skip to it; in
  Acts IV–V `horizon(s)`, a read-only list in `sim/upcoming.ts` of the plan's end, the next stage's latest day,
  projects and the Council; `Keepsake`: Juno's note, shown by looks 4–5). The dock's keys carry a short name
  (`.dk-l`), hidden when a key gets under 58 px. `TopBar.tsx` draws the tape measure (`.ktape`) and the arc
  (`KArc`) always; the looks show one or neither. The goal card's Coming up list and the ticker are gone.
- Running text stays Atkinson in every look. Handwriting and marker are for accents (a figure's note, a goal's
  title, a toast); typed labels are Special Elite; readouts Share Tech Mono.

**Checked:** each look on the map and on a campus in Chrome on the real GPU at 1920×1080 (a fresh company per
act, so each in its own act's world); looks 1–5 at 1280×800 and 960×540; the five title screens and loading
screens; the clipping and the signal on real cards; all five looks in a debug build of the app (WebKitGTK, the
system's) by inspector snapshots; `npm test` (88 pass), `npm run build`, `npm run build:site`.

**Second pass, the same day** (the player: "Keep going until it's all finished"):
- **Notes on the world** (`ui/WorldNotes.tsx`, `looks/notes.css`): on a campus the scene reports where each plot
  stands on screen (`CampusScene.plotAnchors`: the point above the roof and the box the building fills) and a
  frame loop pins notes there without re-rendering. Remarks (three at most, the most useful first, each said
  once): a hall with no chips, a hall over 92% full, a build's or an expansion's time to go, a free plot. The
  building under the pointer is ringed (a pen's ellipse in looks 1–3, brackets of light in 4–5) and its card
  stands beside it on a leader; the pointer-following card is gone from campus buildings. Each look has its hand.
- **Tiles in every panel** (two helpers, checked rendered): Orders, Stats, Goals, Team, Deals, Blocs, the
  Charter's overview, the Council, the Planet's and the System's overviews. News has none on purpose.
- **Act complete** is a certificate with a seal in looks 1–2 (its sunrise title was unreadable on paper).
- **High contrast** per look (`looks/contrast.css`); the horizon line for Acts IV–V (the year once it is more
  than a year off); the arc of look 5 sized by the interface scale and out of the way of a finale's tracker.
- **Checked as well:** Bit's tutorial through its spotlight steps in look 1; the Threshold, Heat Wall and Solar
  Maximum trackers; a five-year plan's time-lapse and report; high contrast in looks 1, 2 and 4; Interface size
  130%; a 3840×2160 window; every panel with new tiles in the look of its act.
- The website's interface picture (`ui-campus.webp`) is Act II with a note on the world.

**Honest limits, and what a next pass would take:**
- Notes on the world are on campuses only. The globe, orbit and the solar system keep the hover card (in each
  look); view-only places (megaprojects, the Moon, space) have no plots and so no notes.
- The arc of look 5 needs a window at least 1500 × 800 and hides while a panel, a card or a tracker is up (the
  plain figure stands in). Look 4's rail is taller than the others (the strip, then the projected figures).
- The plan and era screens, the reports and the ending take each look's tokens and nothing made for them.
- The loading logo does not fly to the menu's in looks 1–2 (there the menu's logo is a print with a border).
- The marketing kit (trailer, stills) shows the old interface wherever it shows any.
- Not checked: Windows, macOS, the colour-blind palettes per look, the Act V ending in look 5, a Steam Deck's
  touch on the foot strip.

## 35. v0.15.0 "True to Life": the realism pass on the 3D world (built 2026-11-14)

**The ask (the user, 2026-11-14):** "another polish pass ... we're approaching version 1.0.0 ... move back to just
in-game graphics ... a red car that has red windows, cars have glass windows ... things need to behave and look
the way that they would in real life ... I don't want people walking through walls ... streets end on what looks
like a cul-de-sac, just a grey semicircle with no textures ... some of the trees are a little bit too generic and
bad looking, not detailed enough ... these are just small examples ... keep going until it's all flawless." Then,
going to bed: "when done ship it".

**How it was run:** I took what every campus shares (vehicles, roads, plants, people's doors, the land round a
campus); two helpers in git worktrees took the facility pieces (Acts I–II) and the view-only places (Acts III–V),
each with its own dev server and headless Chrome. A usage limit cut both helpers off once; their commits were
safe and they were resumed with "converge and report".

**The root causes worth remembering:**
- **The vehicles' windows were whatever the texture painted**: one model came with body-coloured windows, two with
  cream ones. Glass is now a property of the material, not of the paint (`carMaterial`: dark, cool texels above
  the wheels turn smooth and mirror the sky), and the three models were re-made from concepts that ask for dark
  glass. A car park of one model was a row of clones: the body colour is now turned to another in the shader.
- **Lamps were placed by a table of sizes**, so they hung in the air behind any model whose rear is not where the
  table said (a mixer's chute, a flatbed's deck). They are now found on the bodywork by a ray, once per model.
- **The turning circle was a fan of triangles with no road coordinates**, so the street's own paint (edge line,
  tyre tracks, dust) stopped at its rim. `bulbMesh` lays rings in from the outline and gives each vertex the
  street's cross-section coordinate, so one shader paints both.
- **Trees were either thinned-out Meshy models (jagged triangles close up) or cones and balls.** Leaf detail
  cannot come from triangles at this budget: it comes from one painted leaf sheet cut out by alpha, on cards that
  are lit by the crown's roundness (their own normals would make a crown of flat flakes). Cheaper than before.
- **People went in by walking 0.55 m into a painted door and vanishing.** The door now opens (a leaf in the
  wall's own colour over a dark doorway, set where a ray from the step meets the wall), and they walk far enough
  in to be behind the wall before they go.

**Calls I made:**
- Twelve paints (`CAR_PAINTS`), about a third of cars keeping their model's own colour; the flatbed keeps its own
  (its timber deck is its cab's hue, a new paint would stain it); the semi, the mixer and the van change only
  their coloured parts.
- A planted island in the turning circle (a tree of the country, low cover at its foot), a striped barrier where
  the road will go on, deliveries round the island at 5 m.
- A row of trees up the access road's outer verge, none in front of the plots (they would hide the buildings a
  player has to click), and no tall plant in the meadow south of the highway (a pine stood a few metres from the
  lens in the menu film's Luleå shot).
- Sagebrush replaces leafy bushes on plains, savanna, desert and volcanic land.
- Vehicles wait for people on foot; after 25 s of a stand-off they edge on.
- The substation gets a fenced gravel yard; the ranch corner real cattle (two Meshy models) and moves off the
  fields.
- Planting inside a piece arrives when the building opens (the construction clip would cut through it).

**Meshy:** hatchback, semi, flatbed and two cows: about 180 credits, about 430 left.

**Checked:** headless Chrome on the RTX for looks; `bumpcheck` and `feetcheck` on eleven campuses; a ten-minute
run of deliveries with every wheel on the asphalt and 1.8 m clear of the island; the plants' frame cost on the
Intel card; and in the app's own web engine (the debug app in a headless Hyprland, `HYPRLAND_HEADLESS_ONLY=1`,
so no window on the desktop): 120 poses on five campuses before the merges and 80 on ten places after them
(Geneva, Guiana, the Sahara, the Moon, Aurora and Eros among them), day and night, no non-finite pixel, no
shader error. Not on Windows, not on macOS, not in a packaged AppImage.

**The helpers' work (their reports, shortened):**
- **Facility pieces (Acts I–II):** the Act I pieces moved out of `campus/act1.ts` into `campus/act1/` (`hq.ts`,
  `lab.ts`, `gas.ts`, `energy.ts` = solar, battery, wind), built with the Act II parts library; `act1.ts` is the
  registry and the `hall` wrapper. Gas plant, lab, solar, battery and wind rebuilt (see the changelog); the pit's
  shovel moved into view; the restart's bus duct; night lights where there were none. A light pool laid above the
  asphalt is taken for a surface by `settleCars` and lifts the cars under it: lamps stand on the ground.
- **View-only places (Acts III–V):** the launch cycle is a pure function of time (the booster lands, a transporter
  and the tower's crane bring the next stack; `rocket()` builds booster and upper stack as two meshes); pumped
  hydro's footprint is 62×64; North Sea lights; Geneva's seated figures; asteroid vents and dust.

**Seen and left (theirs and mine):**
- People: one talk spot on the garage's front step stands 16 cm into it, and one sample in a thousand floats or
  sinks at a deck's or a pad's edge (the deck grid is 18 cm a cell); astronauts walk with an Earth gait on small
  asteroids; a child or two overlaps Aurora's playground kit.
- Construction: an upgrade shows the finished next tier from day one; a restart "builds" its old tower from the
  ground; one clip height for a whole piece, so low buildings finish early and only the tallest part keeps rising.
- Places: every launch site has a sea coast, the inland cosmodrome too; asteroid conveyors carry loose rock on an
  open belt; finished panels drift off the yards untethered; the secretariat's pool is a flat blue; the gas
  plant's and the lab's models have few lit windows (a new model would beat code); the road lamps are a square L
  close up.
- Vehicles: wheels do not turn (the models are one mesh); the flatbed is always orange.
- Not looked at closely: hydro, geothermal, SMR, packaging and the gigawatt campus beyond one close shot each; the
  suppliers' fabs and yards at close range; megaprojects in a real stage-2 world; the fusion designs' build
  states; Ring One and the yards under construction; the Moon's build piece.

## 36. v0.15.1 "Loose Ends": §35's "Seen and left", finished (built 2026-11-14)

**The ask (the user, 2026-11-14, the morning after):** "now that the usage has reset can you finish up everything
that was left in the known leftovers". Nothing was said about shipping: built and committed, not pushed.

**How it was run:** as §35: I took what is shared (vehicles, construction, people, lamps, the launch coast), one
helper the Act II plants and the suppliers' sites (`act1/`, `plants2/`, `industry/`), one the Act III–V places
(`sets/`, `plan*.ts`). The second was cut off by the usage limit once and resumed with "converge and report".

**What each leftover became:**
- **Wheels do not turn** → they turn. The models are one mesh, so the wheels are found from the shape when a
  model loads (`findWheels` in models.ts): the clumps of vertices on the ground are the tyres' contact patches; a
  circle is fitted to the underside of each (along the triangles' edges, not only their corners: the mixer's
  wheels have eight sides and a corner every 45°); the vertices inside it, from the tyre's inner face outwards,
  are the wheel's, less any that share a triangle with the body (those would be wrung like a cloth). They carry
  `aAxle`; the shader turns them by `uCarSpin`. Parked cars share materials; a driving one has its own.
- **The flatbed is always orange** → `CAR_GLASS.flatbed.cab`: only the front third of its length takes paint.
- **One clip height for a whole piece** → `builtHeight`: the clip follows how much wall there is at each height
  (a curve from the piece's own triangles, floors and roofs a quarter weight, 28% of the even climb kept).
- **An upgrade shows the finished tier from day one** → the old tier's piece stays (`Entry.old`), cut away from
  the ground up (`clipAbove(…, below)`) as the new one rises through it. Rows (solar, battery, wind) fill from
  0.55 through their own `progress`.
- **A restart "builds" its old tower** → never clipped; it gets a crane and no steam until it opens.
- **Feet at a deck's edge, the garage step** → the deck grid is 192 cells a side (9 cm on the garage); the
  garage's open bay is no longer a door (whoever went in walked through the bench in full view).
- **Astronauts' Earth gait** → the Moon: `Crowd.add(…, { lope })`, a parabola a stride, the legs at half pace;
  asteroids: nobody walks, crews glide along guide lines on a tether (`bound()`), standers are restrained.
- **Road lamps a square L** → a tapered column, a swept arm, a lantern with its lens underneath.
- **Every launch site has a sea coast** → `CampusScene.inland()`: none on plains or desert (the cosmodrome).
- **Asteroid conveyors, untethered panels, the flat pool, megaOffice's roof, the habitat's hedges, the
  playground** → the second helper's list, all fixed (see the changelog).
- **Few lit windows on the lab and the gas plant** → lit pane by pane on the model's own windows (`modelWindows`
  in act1/lab.ts); the gas plant's halls got a real clerestory.
- **Not looked at closely** → looked at: see the changelog's lists for what was found.

**Also found on the way:** parked cars grew out of the car park with the walls (`userData.late`: they arrive when
the building opens); the mixer parked inside the entrance of a hall that fills its plot (now left out when no
spot is clear); a door leaf swinging out swept through whoever was arriving (doors open inwards); traffic took a
missing time step for a number and went NaN (guarded; only QA could trigger it).

**Checked:** `npm test` (88 passed; the people test's door count follows the garage's one door), both builds,
`floorcheck` 0, `feetcheck` and `bumpcheck` clean on eight campuses. The real v0.15.0 AppImage (the draft
release's) ran in a headless Hyprland on a clean environment: alive after 50 s, no crash record, title screen
drawn. The new code on that AppImage's own engine (the debug binary swapped into the extracted AppImage, `AppRun`
with `APPDIR`): 112 poses in 14 places, day and night, High, no non-finite pixel, no shader error. Not on Windows,
not on macOS; v0.15.1's own AppImage does not exist until its tag is pushed.

**The third round (the same day):** the user, seeing that list: "I see there's still some things that are still
left to do ... finish those up first before we ship everything in one go"; and since v0.15.0's draft was never
published, v0.15.1 is the one release that carries both passes. Two helpers again (plants, places); both were cut
off by the model's usage limit before reporting (their commits were safe; the plants helper's half-done pit was
finished and committed by me), and the session moved to another model to finish. What the list became:
- **Plants:** still water ripples and its sun glint is levelled off below the bloom (the hydro reservoir's hard
  white patch; `lakeMat`); the tailrace ends in outlet works (gated culverts under the road, wing walls, riprap);
  the reactor and the restart are floodlit at night (a soft warm wash up the towers and the containments, lamps
  round the dome's gallery); the gas plant's control house is rebuilt in code round the model's hut at human scale
  (a full-height door, a control room with a ribbon window over the pipe yard, lit at night); the pit's trucks back
  up to a tip wall and tip over it (they tipped driving forwards with their tails in the pile); suppliers' lit
  panes at the plants' level (`Lit`: × 0.8). Looked at night: the gas works, the salt plant, the cable landing.
- **Places:** pumped hydro builds as a works yard with a benched excavation inside it, so no rim meets the land's
  coarse grid; the laser plant goes up on the finished plant's plan; Geneva's bloc banners are drawn as heraldic
  shapes (twelve emblems, clean fields, the swallowtail cut in the cloth); megaproject sites are lit at night
  (floods on the tower cranes, lit builders' boards); the converter station's trucks and crew stand clear of its
  plant. Aurora's hedges were counted: 220 shrubs, 110k of the place's 1.12M triangles (under a tenth): kept.
- **Mine:** front wheels steer into a bend (the angle a wheelbase needs for the turn being made; checked on a
  five-minute run: always the way the vehicle turns) and wheels turn in shadows too (`drivenCar` gives the
  vehicle a depth material that turns them); a new mixer truck with glass (the old one had open window holes;
  Meshy, 36 credits, about 394 left); a half-built wall shows a bare inside instead of its finished paint
  (`clipAbove`: back faces greyed); three new plant kinds (`blossom`, `cypress`, `flower`: a flower head is
  planted with its own colour, `Placement.c`) and Aurora's cherry trees, cypresses and flower beds use them.
  The HQ cannot be upgraded in the game, so "an HQ upgrade shows no change" never happens.
- Looked at and left as they are: Ring One's hub and racks close up; the offshore wind build at 0.3 and 0.7 (the
  builder's board stands on a marker buoy, as offshore works are marked).

**Checked (the release):** `npm test` (88 passed), both builds, `floorcheck` 0, `feetcheck` and `bumpcheck` clean
on eight campuses, and on the AppImage's own engine (the debug binary in the extracted v0.15.0 AppImage, in a
headless Hyprland): 112 poses in 14 places, day and night, no non-finite pixel, no shader error.

**Still open after it (smaller):** cut walls during construction have no thickness (a bare inside, seen from
above); Aurora's broadleaf trees are 470k of its 1.12M triangles (fine on the Intel card at Medium in one
measurement, but the habitat uses no far level of detail); the reactor and the fab were only seen in the lab,
never on a real campus plot; the gas plant's control house keeps the model's hut inside the new building.
