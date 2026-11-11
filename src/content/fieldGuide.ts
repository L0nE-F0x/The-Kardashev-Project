import type { GameState } from '../sim/types';
import type { IconName } from '../ui/icons';

export type GuideCategory = 'scale' | 'energy' | 'chips' | 'compute' | 'world';

export interface GuideEntry {
  id: string;
  title: string;
  cat: GuideCategory;
  icon: IconName;
  /** The real-world explainer. Paragraphs separated by blank lines. */
  body: string;
  /** How it works in the game. */
  game: string;
  /** Unlocked from the start, or when this returns true for the current company. */
  unlock: 'start' | ((s: GameState) => boolean);
}

export const GUIDE_CATEGORIES: Record<GuideCategory, string> = {
  scale: 'The big picture',
  energy: 'Energy',
  chips: 'Chips & supply',
  compute: 'Compute & AI',
  world: 'People & planet',
};

const happened = (s: GameState, id: string) => s.events.last[id] !== undefined;
const has = (s: GameState, type: string, online = false) => s.facilities.some((f) => f.type === type && (!online || f.status === 'online'));

export const GUIDE: GuideEntry[] = [
  {
    id: 'kardashev', title: 'The Kardashev scale', cat: 'scale', icon: 'k', unlock: 'start',
    body: `In 1964 the Soviet astronomer Nikolai Kardashev proposed ranking civilisations by the power they command. A Type I civilisation harnesses the energy available on its home planet, Type II the output of its star, Type III its galaxy. Carl Sagan later suggested a continuous version: K = (log₁₀ P − 6) / 10, with P in watts.

Humanity uses roughly 19–20 terawatts of primary energy — about K 0.73. Type I begins at 10¹⁶ watts (10 petawatts), around five hundred times what we use today.`,
    game: 'The K meter in the top-right uses Sagan’s formula on civilisation’s total power, including everything you generate. AI is how you climb; energy is how you’re measured.',
  },
  {
    id: 'training-inference', title: 'Training vs inference', cat: 'compute', icon: 'train', unlock: 'start',
    body: `Training builds a model: running enormous amounts of data through it and adjusting billions of parameters, for weeks or months on thousands of chips. Inference is using the finished model to answer requests.

Training cost scales with the model’s compute budget, measured in floating-point operations (FLOP). Inference cost scales with how many people use the model, and for how long.`,
    game: 'Split your compute between training the next model, serving customers (your revenue), research and safety. With no training run active, the training share serves customers.',
  },
  {
    id: 'capacity-factor', title: 'Capacity factor', cat: 'energy', icon: 'solar', unlock: 'start',
    body: `A power plant’s nameplate rating is its maximum output; its capacity factor is what it actually delivers on average. A 100 MW solar farm with a 25% capacity factor produces about 25 MW averaged over a year — the sun sets, clouds pass, winter comes.

Wind farms reach 35–45% on good sites. Gas and nuclear plants can run above 90% when called on.`,
    game: 'Every site lists its solar and wind capacity factors. Deserts, high plateaus and windy plains are worth the trip.',
  },
  {
    id: 'batteries', title: 'Batteries & firm power', cat: 'energy', icon: 'battery', unlock: (s) => has(s, 'battery') || has(s, 'solar'),
    body: `Data centers run around the clock; the sun doesn’t. Batteries shift the midday surplus into the night and smooth out lulls in the wind. Utility-scale iron-phosphate batteries typically store about four hours of their rated power.

“Firm” power is power you can count on at any hour — from gas, hydro, nuclear, geothermal or renewables backed by storage.`,
    game: 'Solar alone covers only about half of a 24/7 load — the rest is curtailed at noon. Add batteries and much more of it becomes usable. Wind needs less storage.',
  },
  {
    id: 'grid-queue', title: 'Grid connection queues', cat: 'energy', icon: 'grid', unlock: (s) => Object.values(s.sites).some((x) => x.grid.pending.length > 0 || x.grid.mw > 1),
    body: `Plugging a big new load or power plant into the grid takes engineering studies, upgrades and new substations. In many regions the queue of projects waiting to connect stretches for years — in the United States, more generating capacity waits in these queues than the whole existing grid.`,
    game: 'Grid connections take months to years depending on the region, and each site has limited spare capacity. Bringing your own power is often faster — and keeps neighbours happier.',
  },
  {
    id: 'transformers', title: 'Transformers & turbines', cat: 'energy', icon: 'gas', unlock: (s) => has(s, 'gas') || happened(s, 'transformer-backlog'),
    body: `Large power transformers are custom-built, weigh hundreds of tonnes and can take years to deliver. Heavy-duty gas turbines are similar: when everyone wants firm power at once, the order books fill up years in advance.`,
    game: 'Gas plants carry a turbine backlog, and transformer shortages can push back your grid connections.',
  },
  {
    id: 'wrights-law', title: 'Learning curves', cat: 'energy', icon: 'finance', unlock: (s) => Object.values(s.built).some((n) => (n ?? 0) >= 2),
    body: `Wright’s law observes that every doubling of cumulative production cuts unit costs by a roughly constant percentage. Solar modules have fallen around 20% in price per doubling for decades, and batteries follow a similar curve.`,
    game: 'Build more of something and it gets cheaper — for you, and for the whole market over time.',
  },
  {
    id: 'pue', title: 'PUE & cooling', cat: 'compute', icon: 'datacenter', unlock: (s) => has(s, 'datacenter'),
    body: `Power Usage Effectiveness (PUE) is a data center’s total power divided by the power its computers use. A PUE of 1.3 means 30% extra goes to cooling, power conversion and lighting. Hot climates push it up; cold air and liquid cooling bring it down toward 1.1.`,
    game: 'Each site’s PUE depends on its climate and water. Liquid Cooling and Dry Cooling research cut it further.',
  },
  {
    id: 'cooling-water', title: 'Cooling water', cat: 'world', icon: 'warn', unlock: (s) => happened(s, 'heatwave') || happened(s, 'drought') || s.facilities.some((f) => f.type === 'datacenter' && (s.sites[f.siteId] !== undefined) && ['mojave', 'atacama', 'gulf-coast', 'thar', 'namib', 'pilbara', 'red-sea', 'ouarzazate', 'west-texas'].includes(f.siteId)),
    body: `Many data centers cool themselves by evaporating water — cheap and efficient, until there’s a drought. A large campus can use millions of litres a day, competing directly with farms and towns. Dry and closed-loop systems use far less water but more electricity.`,
    game: 'Water-scarce sites pay an efficiency penalty until you research Dry Cooling, and droughts can force rationing.',
  },
  {
    id: 'accelerators', title: 'AI accelerators', cat: 'chips', icon: 'compute', unlock: (s) => s.orders.length > 0 || s.shipments.length > 0 || s.stats.installedAccel > 0,
    body: `Modern AI runs on accelerators: chips built for the matrix multiplications at the heart of neural networks. A 2027-class accelerator delivers petaFLOPs of low-precision compute and, with its share of server and networking, draws more than a kilowatt.`,
    game: 'Lumen chips are faster but the queue is long; Kestrel’s are cheaper and quicker to get but a node behind. Every year’s chips are better than the last.',
  },
  {
    id: 'hbm', title: 'High-bandwidth memory', cat: 'chips', icon: 'orders', unlock: (s) => s.orders.length > 0 || happened(s, 'hbm-crunch'),
    body: `AI chips are starved for data. High-bandwidth memory (HBM) stacks DRAM dies on top of each other right next to the processor to feed it terabytes per second. Only a handful of companies can make it, and every accelerator needs several stacks — so memory often limits how many chips ship.`,
    game: 'The HBM supply index slows every chip order when memory is short. HBM Futures research softens the blow.',
  },
  {
    id: 'euv', title: 'EUV lithography', cat: 'chips', icon: 'research', unlock: (s) => s.orders.length > 0 || s.day > 120,
    body: `The most advanced chips are patterned with extreme-ultraviolet light at a wavelength of 13.5 nanometres, made by blasting droplets of molten tin with a laser. Each EUV machine is the size of a bus, costs well over $100 million, and comes from a single supplier.`,
    game: 'In this world that supplier is Veldt Optics — the chokepoint behind the chokepoints.',
  },
  {
    id: 'packaging', title: 'Advanced packaging', cat: 'chips', icon: 'datacenter', unlock: (s) => s.stats.installedAccel > 0 || s.day > 180,
    body: `A modern accelerator isn’t one chip. Logic dies and memory stacks are bonded side by side on a silicon interposer, then mounted as a single module. This “advanced packaging” step became one of the tightest bottlenecks of the AI boom, because capacity takes years to build.`,
    game: 'Bondline Packaging in Penang does this work. It matters more as you scale up in later acts.',
  },
  {
    id: 'chokepoints', title: 'Shipping chokepoints', cat: 'world', icon: 'ship', unlock: (s) => s.shipments.some((x) => x.chokepoints.length > 0) || happened(s, 'malacca-closure') || happened(s, 'red-sea'),
    body: `Most of world trade moves by sea, and much of it squeezes through a few narrow passages: the Strait of Malacca, the Suez and Panama canals, Bab-el-Mandeb and the Strait of Hormuz. A blockage, a drought or a conflict at one of them can add weeks to voyages around the world.`,
    game: 'Your ships follow real sea routes. When a chokepoint closes, ships reroute — or wait.',
  },
  {
    id: 'scaling-laws', title: 'Scaling laws', cat: 'compute', icon: 'brain', unlock: (s) => s.models.length > 0 || s.research.done.includes('moe'),
    body: `Researchers found that model quality improves smoothly and predictably as compute, data and model size grow — so labs can forecast what a bigger training run will achieve. Algorithmic advances make each FLOP count for more, multiplying the effect of new hardware.`,
    game: 'Capability grows with the logarithm of a model’s training compute, multiplied by your algorithmic efficiency.',
  },
  {
    id: 'alignment', title: 'Alignment & the safety margin', cat: 'compute', icon: 'shield', unlock: (s) => s.models.length > 0 || s.alloc.safety > 0,
    body: `Alignment research tries to make AI systems reliably do what we intend: tell the truth, refuse harmful requests, and not pursue goals of their own. As capabilities grow, the gap between what a model can do and how well we understand and steer it matters more and more.`,
    game: 'Your safety margin is alignment minus capability. Spending roughly a tenth as much compute on safety as on training holds it steady; below zero, incidents become likely.',
  },
  {
    id: 'social-license', title: 'Social license', cat: 'world', icon: 'trust', unlock: (s) => happened(s, 'power-backlash') || happened(s, 'grid-emergency') || Object.values(s.regions).some((r) => r.license < 45),
    body: `Big infrastructure needs public consent. Communities weigh jobs and tax revenue against noise, water, land and rising power bills. A “social license to operate” isn’t a document — it’s the trust that keeps permits flowing.`,
    game: 'Each region’s trust changes how fast you can build. Bringing your own power, community deals and a clean safety record all help.',
  },
  {
    id: 'carbon', title: 'Carbon & waste heat', cat: 'world', icon: 'co2', unlock: (s) => has(s, 'gas') || s.carbon.cumMt > 0.05,
    body: `Burning natural gas emits about 0.4–0.5 tonnes of CO₂ per megawatt-hour. And at planetary scale even clean energy has a limit: all power eventually becomes heat. A Type I civilisation running 10 petawatts on Earth’s surface would add about 20 watts per square metre — several times today’s greenhouse warming.`,
    game: 'Your emissions dent trust in green-minded regions. The waste-heat wall arrives late in the campaign — it’s why the road to Type I leads to orbit.',
  },
  {
    id: 'open-weights', title: 'Open weights', cat: 'compute', icon: 'globe', unlock: (s) => happened(s, 'open-weights') || s.day > 90,
    body: `Some labs publish their model weights for anyone to download and run. Open models spread capability widely and push prices down — great for users, hard on anyone selling a weaker closed model.`,
    game: 'If Open Orchard’s latest model beats yours, your inference prices suffer.',
  },
  {
    id: 'export-controls', title: 'Export controls', cat: 'world', icon: 'warn', unlock: (s) => happened(s, 'export-controls') || s.facilities.some((f) => ['inner-mongolia', 'guizhou', 'pearl-delta', 'kazakh-steppe', 'bratsk', 'caspian'].includes(f.siteId)),
    body: `Governments restrict which advanced chips and chipmaking tools can be sold where, treating compute as a strategic resource. Licences, paperwork and outright bans shape where AI infrastructure can be built.`,
    game: 'In Act II, export rules block some supplier→region chip flows until Sol wins a licence. Fabs in some blocs need a licence for EUV tools.',
  },
  // ═══════════════════════════════════════ ACT II ═══════════════════════════════════════
  {
    id: 'reactor-restart', title: 'Restarting a reactor', cat: 'energy', icon: 'restart', unlock: (s) => (s.act ?? 1) >= 2 && (has(s, 'restart') || happened(s, 'restart-1')),
    body: `Several nuclear plants were shut for economic or political reasons while still physically sound. Restarting one means new fuel, re-certified safety systems, rehired staff and a regulator's sign-off — but the concrete, the turbine hall and the grid connection already exist.

In the mid-2020s tech companies signed deals to bring shuttered reactors back specifically to power data centers: hundreds of megawatts of firm, carbon-free power in a couple of years instead of a decade.`,
    game: 'Three sites have a retired reactor (look for the reactor trait). A restart takes about two years and needs government relations ≥ 50 in that bloc.',
  },
  {
    id: 'smr', title: 'Small modular reactors', cat: 'energy', icon: 'smr', unlock: (s) => (s.act ?? 1) >= 2 && s.phase >= 2,
    body: `Small modular reactors (SMRs) are reactors of tens to a few hundred megawatts designed to be built in a factory and shipped, rather than poured on site. The promise: repeatable designs, faster licensing after the first unit, and lower cost through volume — Wright's law for nuclear.

The catch is that the first ones take years, and order books fill up fast.`,
    game: 'Order an SMR pack from Little Sun: 300 MW, a 4–5 year queue, no emissions, about 93% availability. It needs cooling water and local trust ≥ 55.',
  },
  {
    id: 'big-nuclear', title: 'Large reactors', cat: 'energy', icon: 'reactor', unlock: (s) => (s.act ?? 1) >= 2 && s.phase >= 3,
    body: `A gigawatt-class reactor runs for sixty years or more at over 90% capacity factor, on a fuel bill that barely matters. But building one takes most of a decade and tens of billions of dollars, and the financing costs of all that waiting dominate the price.`,
    game: 'The Nuclear Plant (1.1 GW) takes 8–10 years — start it in Act II and it powers Act III. Project finance helps pay for it.',
  },
  {
    id: 'hydro', title: 'Hydropower', cat: 'energy', icon: 'hydro', unlock: (s) => (s.act ?? 1) >= 2,
    body: `Falling water spins a turbine: hydropower is the largest source of clean electricity on Earth. New big dams are rare now, but adding turbines to existing dams and rivers is common. Output follows the rain: droughts can halve it.`,
    game: 'Hydro plants only go at river sites (river ×N trait). Firm and cheap to run, but droughts cut their output.',
  },
  {
    id: 'geothermal', title: 'Geothermal & EGS', cat: 'energy', icon: 'geothermal', unlock: (s) => (s.act ?? 1) >= 2,
    body: `Where hot rock sits close to the surface — Iceland, Kenya's Rift Valley, Japan's volcanic islands — steam from deep wells drives turbines around the clock.

Enhanced geothermal systems (EGS) borrow drilling techniques from the oil and gas industry to crack open hot dry rock and circulate water through it, making geothermal possible in far more places.`,
    game: 'Geothermal runs at ~90% capacity factor with no fuel. Volcanic sites work from the start; hot-rock sites need Enhanced Geothermal research.',
  },
  {
    id: 'packaging-pools', title: 'Packaging and the three pools', cat: 'chips', icon: 'packaging', unlock: (s) => (s.act ?? 1) >= 2 && s.phase >= 2,
    body: `A modern AI accelerator isn't one chip. A logic die sits on a silicon interposer next to several stacks of high-bandwidth memory, all bonded together with thousands of microscopic connections. This "2.5D" packaging is a specialised process of its own — and for years it was the tightest bottleneck in AI hardware.`,
    game: 'Chips flow at the rate of the slowest of three pools: wafers, HBM and packaging. Build a packaging plant or book Bondline slots so packaging shortages don’t hit you.',
  },
  {
    id: 'fab', title: 'Building a fab', cat: 'chips', icon: 'fab', unlock: (s) => (s.act ?? 1) >= 2 && s.phase >= 2,
    body: `A leading-edge chip factory costs $20 billion or more and takes three to four years. It needs ultrapure water by the million litres a day, enough power for a small city, and lithography machines that only one company on Earth can make — each one shipped in dozens of crates and assembled on site.`,
    game: 'The Kestrel joint-venture fab takes four years, needs plenty of water and firm power, and stalls halfway if export rules block Veldt’s EUV tools. Once online, its chips cost a third of the market price.',
  },
  {
    id: 'minerals', title: 'Critical minerals', cat: 'chips', icon: 'lithium', unlock: (s) => (s.act ?? 1) >= 2 && s.phase >= 2,
    body: `Batteries need lithium; every cable, transformer and motor needs copper; fabs need helium for cooling and neon for their lasers. A handful of mines and plants supply most of the world, so a single outage or export ban moves prices everywhere.`,
    game: 'Lithium, copper, helium and neon prices swing with events. A stake in a mine pays a dividend and shields you from part of the swing.',
  },
  {
    id: 'subsea', title: 'Subsea cables', cat: 'world', icon: 'cable', unlock: (s) => (s.act ?? 1) >= 2,
    body: `About 99% of intercontinental internet traffic runs through fibre-optic cables on the sea floor — a few hundred of them, each about as thick as a garden hose. They come ashore at landing stations, often on quiet beaches.

Every year ships dragging anchors cut dozens of them. Repair ships are few, so redundancy matters.`,
    game: 'Lease capacity on a cable (or lay your own) to join two regions into your private network. Cables get cut; a second route keeps you online.',
  },
  {
    id: 'latency', title: 'Latency & regional markets', cat: 'compute', icon: 'fiber', unlock: (s) => (s.act ?? 1) >= 2,
    body: `Light in fibre travels about 200 km per millisecond. A request served from the other side of the planet takes noticeably longer than one served nearby — fine for training, painful for interactive products. That is why inference capacity is built close to users, while training can go wherever power is cheap.`,
    game: 'Inference demand lives in regions. Halls serve their own region best; your fiber and cables let them sell further at low latency. The public internet works too, at a cost.',
  },
  {
    id: 'project-finance', title: 'Project finance', cat: 'scale', icon: 'finance', unlock: (s) => (s.act ?? 1) >= 2 && (s.capital.loans.length > 0 || s.phase >= 2),
    body: `Big infrastructure is mostly built with borrowed money. Lenders fund a specific power plant or campus, secured on the asset itself and repaid from its revenue. Cheap debt is why capital-intensive industries can grow faster than their profits alone would allow — and why interest rates matter so much to them.`,
    game: 'Borrow up to 70% of what your plants, halls and chips are worth. Repayments come out monthly. Penny can draw a credit line automatically to hold your cash floor.',
  },
  {
    id: 'boards-ipos', title: 'Boards & IPOs', cat: 'scale', icon: 'ipo', unlock: (s) => (s.act ?? 1) >= 2 && !!s.capital.board,
    body: `Venture investors buy board seats along with their shares. A board hires and fires the CEO and approves big decisions; at growth-stage companies it usually wants quarterly progress.

An initial public offering (IPO) sells shares to the public. Founders sometimes use dual-class shares to keep voting control after listing.`,
    game: 'After the Series B, the board reviews revenue growth every quarter. Its confidence affects your loan rates, takeover defence and IPO valuation.',
  },
  {
    id: 'sovereign-ai', title: 'Sovereign AI', cat: 'world', icon: 'blocs', unlock: (s) => (s.act ?? 1) >= 2 && s.capital.sovereign.length > 0,
    body: `Governments increasingly see compute as national infrastructure. Many now subsidise domestic data centers and "sovereign" models in exchange for local jobs, data kept in-country, or priority access for public services.`,
    game: 'Blocs offer grants, cheap power or fast permits if you build a set amount of IT capacity there by a deadline. Each offer has strings attached.',
  },
  {
    id: 'talent', title: 'The talent market', cat: 'world', icon: 'talent', unlock: (s) => (s.act ?? 1) >= 2 && Object.values(s.talent).some((v) => v < 0.85),
    body: `There are only a few thousand people in the world who have trained frontier models. Labs compete for them with eye-watering pay, compute budgets and mission. Hubs form where talent already lives — and drain as rivals move in.`,
    game: 'Each region has a talent pool. Rival labs drain it; your labs there produce less as it runs dry. Pools refill slowly.',
  },
  {
    id: 'hvdc', title: 'HVDC transmission', cat: 'energy', icon: 'link', unlock: (s) => (s.act ?? 1) >= 2 && (s.research.done.includes('hvdc') || s.links.length >= 2),
    body: `Alternating current loses energy quickly over long distances. High-voltage direct current lines lose far less — around 3% per 1,000 km — so they carry power from remote deserts, rivers and offshore wind farms to the cities and campuses that need it.`,
    game: 'With HVDC research, power lines reach 2.5× further and lose 60% less on the way.',
  },

  // ════════════════════════════════════ ACT III ════════════════════════════════════════
  {
    id: 'consortium', title: 'Planetary consortia', cat: 'scale', icon: 'charter', unlock: (s) => (s.act ?? 1) >= 3,
    body: `Some projects are too big, too risky or too shared for any one country. CERN pools European physics; ITER is a fusion reactor built by 35 nations; the International Space Station was assembled by five space agencies; the International Energy Agency began as a club of oil importers after the 1973 crisis.

Consortia like these trade speed for legitimacy. Members pay in, argue about where the money goes, and expect projects on their own soil. They work when every member believes the arrangement is fair — and the people running them are seen as neutral.`,
    game: 'The Kardashev Project is funded by bloc dues (sized by economy and willingness), spends through contracts, and lives on Legitimacy — the blocs’ confidence that you run it fairly.',
  },
  {
    id: 'procurement', title: 'Procurement & tenders', cat: 'scale', icon: 'tender', unlock: (s) => (s.charter?.tenders.length ?? 0) > 0 || (s.charter?.projects.length ?? 0) > 0,
    body: `Governments buy big things through tenders: publish what you want, let firms bid, pick one. The cheapest bid is not always the best — megaprojects famously run late and over budget, and the bidder that promised the most is often the one that overruns.

Good procurement weighs price against track record, sets penalties for delay, and avoids depending on a single supplier.`,
    game: 'Partners bid a price and a timeline shaped by five traits. Reliability cuts trouble, Speed shortens bids, Cost lowers prices, Ambition takes on more (and over-promises), Ethics avoids scandals. Passing over the cheapest bid is remembered.',
  },
  {
    id: 'conflict-of-interest', title: 'Conflicts of interest', cat: 'world', icon: 'lock', unlock: (s) => (s.act ?? 1) >= 3 && (!!s.flags.trustDecided || !!s.flags.selfAwards),
    body: `When the person awarding a contract owns one of the bidders, every award looks suspect — even the fair ones. Public officials sell or recuse themselves; some put their holdings in a blind trust, where an independent trustee manages the assets and the owner can’t see or steer them.

A blind trust doesn’t remove the conflict entirely (you still know what you put in), but it removes the day-to-day temptation and makes the arrangement easier to trust.`,
    game: 'Awarding your own company costs Legitimacy unless its bid is clearly the best value. In the blind trust your advisors run the company, its buttons lock and conflicts cost far less.',
  },
  {
    id: 'megaprojects', title: 'Megaprojects', cat: 'energy', icon: 'mega', unlock: (s) => (s.charter?.projects ?? []).some((p) => ['solar', 'wind', 'nuclear', 'hydro', 'geo'].includes(p.kind)),
    body: `The world already builds energy at enormous scale: more than 500 GW of solar a year by the mid-2020s, single parks in China and India spanning thousands of square kilometres, and offshore wind zones in the North Sea planned in tens of gigawatts.

The bottlenecks are rarely the panels themselves. They are grid connections, transformers, land rights, skilled crews and finance — which is why megaprojects tend to cluster where all of those can be lined up at once.`,
    game: 'Every Charter energy contract is built at one of twelve megaproject sites, one per bloc. A site grows through three stages (20, 80 and 200 GW of average output), and the map and diorama grow with it.',
  },
  {
    id: 'supergrids', title: 'Supergrids', cat: 'energy', icon: 'hvdc', unlock: (s) => (s.charter?.projects ?? []).some((p) => p.kind === 'hvdc') || (s.charter?.phase ?? 0) >= 2,
    body: `High-voltage direct current lines lose only about 3% of their power per thousand kilometres, so they can carry sunshine from deserts to cities on other continents. Proposals like the Sahara-to-Europe links or the Australia–Asia PowerLink would move gigawatts across seas.

Linking regions also smooths out the weather: it is always sunny or windy somewhere, and a wider grid needs less storage.`,
    game: 'HVDC links between blocs make the megaproject behind them deliver more, cut grid prices at both ends, raise access and speed up world growth. They also hold the grid together in a heatwave.',
  },
  {
    id: 'carbon-budget', title: 'The carbon budget', cat: 'world', icon: 'co2', unlock: (s) => (s.charter?.phase ?? 0) >= 2,
    body: `Global warming tracks the total CO₂ ever emitted, roughly linearly. That makes it possible to talk about a budget: how much more can be emitted for a given chance of staying under 1.5 °C or 2 °C. At today’s ~40 Gt a year, the 1.5 °C budget is nearly gone and the 2 °C budget lasts a couple of decades.

Overshooting the budget doesn’t end the world, but every extra tonne means more heatwaves, droughts and floods.`,
    game: 'The World screen tracks a 2 °C budget (~500 Gt CO₂ in 2035). Clean Charter energy retires fossil plants and makes new energy cleaner. Past zero, heatwaves and droughts get likelier and the Threshold’s grid front starts harder.',
  },
  {
    id: 'access', title: 'Energy & compute access', cat: 'world', icon: 'access', unlock: (s) => (s.act ?? 1) >= 3,
    body: `Hundreds of millions of people still lack reliable electricity, and access to frontier AI is even more unequal: most of the world’s data centers sit in a handful of countries. Without local compute, connectivity and cheap power, the benefits of AI arrive late — or not at all.

Public compute, open cables and local energy projects are how other infrastructure gaps were closed in the past.`,
    game: 'Each bloc has a compute-access meter. Public compute campuses, open cables, Commons lines, megaprojects and HVDC endpoints raise it; standing still lets it fall as the frontier moves on. The Mandate needs every bloc at 40.',
  },
  {
    id: 'compute-governance', title: 'Compute governance', cat: 'compute', icon: 'compute', unlock: (s) => (s.charter?.phase ?? 0) >= 3 || !!s.charter?.council.passed.includes('compute-cap'),
    body: `Training compute is one of the few things about AI that is measurable and concentrated: frontier runs need tens of thousands of specialised chips, made by a handful of companies. That makes it a natural lever for governance — reporting thresholds, licences for very large runs, and caps.

Compute rules are blunt. They can slow everyone, they can be dodged by moving abroad, and algorithmic progress keeps lowering the compute needed for a given capability.`,
    game: 'The compute cap slows every lab by a quarter. Your own runs above 3×10³⁰ FLOP need a Charter licence: the evals route takes about three months; fast-tracking your own run costs Legitimacy.',
  },
  {
    id: 'frontier-evals', title: 'Frontier evaluations', cat: 'compute', icon: 'evals', unlock: (s) => (s.charter?.projects ?? []).some((p) => p.kind === 'evals' || p.kind === 'interp') || !!s.charter?.council.passed.includes('run-licensing'),
    body: `Before a frontier model ships, evaluators probe it for dangerous capabilities — cyber-offence, bio-risk, deception, autonomous replication — and for whether its safety training holds up under pressure. Interpretability research tries to read what a model is actually computing.

The hard part is that evaluations have to keep up with the models. An evaluator that can’t elicit a capability can’t certify its absence.`,
    game: 'The world safety margin is world alignment minus the best model anywhere. Evals programmes and interpretability consortia raise world alignment (less for each repeat); a negative margin means incidents at rival labs.',
  },
  {
    id: 'open-closed', title: 'Open vs closed weights', cat: 'compute', icon: 'globe', unlock: (s) => (s.charter?.phase ?? 0) >= 2,
    body: `Open weights let anyone run, study and adapt a model: a boon for research, competition and countries that can’t afford to train their own. They also can’t be recalled: whatever a model can do, everyone who downloads it can do.

Most proposals sit in between — release older models openly, stage releases behind evaluations, keep the very frontier closed.`,
    game: 'The Council can pick one of three policies: open weights for all (growth, access, Orchard races ahead, more incidents), staged release (a middle path) or a closed frontier (fewer incidents, less access, an unhappy Orchard).',
  },
  {
    id: 'launch-economics', title: 'Launch economics', cat: 'scale', icon: 'launch', unlock: (s) => !!s.flags.kipJoined,
    body: `For most of the space age, a kilogram to orbit cost tens of thousands of dollars, because every rocket was thrown away. Reusable boosters cut that by an order of magnitude; fully reusable heavy lifters promise another.

Equatorial launch sites give rockets a free boost from Earth’s rotation; polar sites reach orbits that pass over the whole planet.`,
    game: 'Kip’s arc: a Charter launch complex at one of five candidate sites, then an orbital compute test, then a space-solar demonstrator. The orbital commons protocol makes space contracts cheaper and faster.',
  },
  {
    id: 'space-solar', title: 'Space-based solar power', cat: 'energy', icon: 'satellite', unlock: (s) => (s.charter?.projects ?? []).some((p) => p.kind === 'spacesolar') || !!s.flags.orbitalTest,
    body: `Above the atmosphere sunlight is about 40% stronger and never sets in the right orbit. A solar array in space can beam power to the ground as microwaves, collected by a large field of antennas. Small demonstrations have already beamed measurable power from orbit.

The challenge is cost: launching and assembling square kilometres of hardware only makes sense if launch becomes very cheap.`,
    game: 'The space-solar demonstrator is the last step of First Steps Off-World. In Act IV, space solar and orbital compute are how the climb to Type I escapes Earth’s heat limit.',
  },
  {
    id: 'orbital-dc', title: 'Data centres in orbit', cat: 'compute', icon: 'satellite', unlock: (s) => !!s.flags.orbitalTest || (s.charter?.projects ?? []).some((p) => p.kind === 'orbital'),
    body: `In orbit, sunlight is free and constant, and there are no neighbours or land costs. But everything must be launched, radiation flips bits, nothing can be repaired by hand, and in a vacuum heat can only be shed by radiating it away — so radiators become the biggest part of the machine.

At planetary scale, waste heat becomes the binding constraint: a Type I civilisation’s power, dissipated on Earth’s surface, would warm it badly. That is the long-run argument for moving compute off-planet.`,
    game: 'The orbital compute test proves accelerators can run in orbit (a satellite crosses the map). It is part of the Mandate, and the act ends with the first real orbital data centre lifting off.',
  },
  {
    id: 'fusion', title: 'Fusion: ignition and gain', cat: 'energy', icon: 'fusion', unlock: (s) => (s.charter?.projects ?? []).some((p) => p.kind === 'fusion') || (s.charter?.phase ?? 0) >= 2,
    body: `Fusion releases energy by forcing light nuclei together at temperatures above 100 million degrees. In 2022 a laser experiment first produced more fusion energy than the laser energy delivered to its target — “ignition” — though the facility as a whole used far more power than it made.

A power plant needs net electricity, day after day: high-field magnets or lasers that work reliably, materials that survive the neutrons, and a way to breed tritium fuel.`,
    game: 'A Charter grant to Sunforge funds a pilot plant. If it finishes, the Act III ending brings sustained ignition — a seed for Act IV’s fusion age.',
  },
  // ════════════════════ Act IV ════════════════════
  {
    id: 'supergrid', title: 'Supergrids and the moving sun', cat: 'energy', icon: 'supergrid', unlock: (s) => (s.planet?.stage ?? 0) >= 1,
    body: `Solar power peaks at local noon and vanishes at night. A grid that spans many time zones can move power from where the sun is up to where it has set, so less solar is wasted (“curtailed”) and less storage is needed. Proposals for intercontinental links — Africa to Europe, Australia to Asia, a ring around the North Pacific — have been studied for decades.

Very long links use high-voltage direct current, which loses only a few percent per thousand kilometres. Superconducting cable could cut that further, at the cost of keeping the cable cryogenically cold.`,
    game: 'Supergrid links (and Act III’s HVDC routes) join provinces into grids. The wider the main grid stretches east to west, the more Charter solar and wind on it deliver — up to a quarter more. All twelve provinces in one grid is on the checklist.',
  },
  {
    id: 'fusion-designs', title: 'Tokamaks, stellarators, lasers', cat: 'energy', icon: 'fusion', unlock: (s) => (s.planet?.stage ?? 0) >= 1,
    body: `There is more than one way to make a star. Tokamaks hold plasma in a doughnut with powerful magnets; new high-temperature superconductors let them be much smaller. Stellarators twist the magnetic field so the plasma is stable without a current flowing in it — fiendish to design, calm to run. Laser (inertial) fusion crushes tiny fuel pellets many times a second. Magnetised-target designs compress plasma with pistons or liquid metal.

Each has different physics risks and different engineering problems. Nobody knows yet which will make the cheapest electricity.`,
    game: 'Four designs compete, each built by a different partner with its own odds. Fund a pilot plant; if it works (or half-works) you can order fleets of that design at any megaproject site. Every plant built makes the next one about 15% cheaper per doubling.',
  },
  {
    id: 'tritium', title: 'Tritium and helium-3', cat: 'energy', icon: 'fusion', unlock: (s) => (s.planet?.stage ?? 0) >= 2,
    body: `Most fusion designs burn deuterium (plentiful in seawater) and tritium, which barely exists in nature: the world’s whole stock is a few tens of kilograms. A fusion plant has to breed its own tritium by wrapping the plasma in lithium, which turns into tritium when struck by fusion neutrons.

Helium-3 is an alternative fuel that produces almost no neutrons. There is very little on Earth, but the solar wind has deposited it in lunar soil over billions of years.`,
    game: 'D-T fleets (built and building) are capped by the tritium supply; running fleets breed more every year, so the first fleets come slowly. A lunar mine supplies helium-3 for the aneutronic D-He3 design.',
  },
  {
    id: 'dac', title: 'Direct air capture', cat: 'world', icon: 'dac', unlock: (s) => (s.planet?.stage ?? 0) >= 1,
    body: `Direct air capture pulls CO₂ out of ordinary air with chemical sorbents, then releases it as a concentrated gas to be stored — for example by injecting it into basalt, where it turns to stone within a couple of years. It takes a lot of energy, because CO₂ is only about 0.04% of the air.

With abundant clean power, capture at the scale of billions of tonnes a year becomes conceivable, though it is no substitute for not emitting in the first place.`,
    game: 'Carbon capture farms at megaproject sites remove Gt of CO₂ every year, putting carbon back into the budget. Warming under 2 °C is on the checklist.',
  },
  {
    id: 'geoengineering', title: 'Solar geoengineering', cat: 'world', icon: 'warn', unlock: (s) => (s.planet?.stage ?? 0) >= 2,
    body: `Spreading a thin haze of reflective particles in the stratosphere would bounce a little sunlight back to space and cool the planet quickly and cheaply — volcanoes do it naturally. But it doesn’t remove any CO₂, its side effects on rainfall are uncertain, and if it ever stopped suddenly the masked warming would return within years (“termination shock”).

Who gets to set the planet’s thermostat is as hard a question as how.`,
    game: 'A divisive Council resolution: up to 0.4 °C of warming masked while it is in force, building up over years. Stop it and the mask falls away fast.',
  },
  {
    id: 'ai-governance', title: 'AIs that run infrastructure', cat: 'compute', icon: 'ai', unlock: (s) => (s.planet?.stage ?? 0) >= 1,
    body: `AI systems already forecast demand and balance parts of power grids. Giving them control of whole regions raises old questions in a new form: how do you audit a decision you can’t fully explain, who is liable when it goes wrong, and how do you make sure a human can still say no?

Proposals include written “constitutions” for deployed systems, independent auditor models, and keeping humans in the loop for decisions that can’t be undone.`,
    game: 'Hand a province to an AI once its trust is high enough and the world safety margin is positive. Each AI has a temperament (growth, caution, openness — and Bit, shaped by what you told it). Good years build trust; incidents cost it.',
  },
  {
    id: 'kessler', title: 'Orbital debris and Kessler syndrome', cat: 'compute', icon: 'debris', unlock: (s) => (s.planet?.stage ?? 0) >= 3,
    body: `Low Earth orbit holds tens of thousands of tracked objects and millions of smaller fragments, all moving at around eight kilometres a second. A collision creates more fragments, which make further collisions likelier. Past a certain density this becomes a self-sustaining cascade — Kessler syndrome — that could make some orbits unusable for decades.

Remedies include tracking and dodging, de-orbiting dead satellites promptly, and active removal with tugs, nets or lasers.`,
    game: 'Orbital data centres and launch traffic add debris to low orbit; drag and clean-up programmes remove it. Above 40, collisions start. The finale’s Cascade front feeds on it.',
  },
  {
    id: 'lunar-isru', title: 'Living off the Moon', cat: 'compute', icon: 'moon', unlock: (s) => (s.planet?.stage ?? 0) >= 3,
    body: `Craters near the Moon’s poles never see sunlight and hold water ice. Split into hydrogen and oxygen, it becomes rocket propellant — far cheaper to lift from the Moon’s weak gravity than from Earth. Lunar soil is also rich in metals and oxygen.

A mass driver — an electromagnetic rail — could throw lunar material into space without any fuel at all, an idea dating back to the 1970s.`,
    game: 'The Moon base grows outpost → mine → mass driver: propellant makes space contracts cheaper, metals make orbital construction cheaper, and the mine supplies helium-3.',
  },
  {
    id: 'waste-heat', title: 'Waste heat: the Heat Wall', cat: 'scale', icon: 'heat', unlock: (s) => (s.planet?.stage ?? 0) >= 3,
    body: `Every watt a civilisation uses ends up as heat. Today that is tiny next to the sunlight Earth absorbs, and greenhouse warming matters far more. But energy use that grew a few percent a year for a few centuries would make waste heat itself a climate problem — at around ten petawatts (Type I), comparable to many times today’s greenhouse forcing.

That is one reason people imagine moving energy-hungry industry and computing off-planet, where waste heat can be radiated into space.`,
    game: 'From stage 3, waste heat (W/m²) adds to each province’s heat index. The Heat Wall finale is the first sign that the climb to Type I has to continue above the sky — Act V.',
  },
  // ── Act V ──
  {
    id: 'kardashev-types', title: 'Type I, II and III', cat: 'scale', icon: 'swarm', unlock: (s) => !!s.system,
    body: `Nikolai Kardashev sorted civilisations by the energy they command: Type I uses roughly the power reaching its planet, Type II its whole star, Type III its galaxy. Carl Sagan made the scale continuous: K = (log₁₀ watts − 6) / 10, so Type I is 10¹⁶ W (ten petawatts), Type II 10²⁶ W and Type III 10³⁶ W.

Humanity used about 19 TW in the 2020s: K ≈ 0.73. The Sun puts out about 3.8×10²⁶ W, so a civilisation using all of it would sit at K ≈ 2.06.`,
    game: 'Act V ends when K reaches 1.0000; your score is the year. The meter keeps counting afterwards, toward Type II at K 2.00.',
  },
  {
    id: 'waste-heat-forcing', title: 'Waste heat as a forcing', cat: 'world', icon: 'thermal', unlock: (s) => !!s.system,
    body: `Almost every watt civilisation uses ends up as low-grade heat. Today that is tiny next to the greenhouse effect: about 0.04 W/m² averaged over the Earth, against roughly 2.7 W/m² of forcing from greenhouse gases.

But it scales with energy use. Ten petawatts used on the surface would be about 20 W/m² — several times today’s whole greenhouse forcing. Past a few hundred terawatts, heat itself becomes a climate problem, whatever the energy source.`,
    game: 'The Thermal Line caps how much power Earth’s surface may use (its own plants plus beams). Every W/m² of waste heat adds about half a degree of warming, after a lag. Pulling CO₂ back out makes room for heat.',
  },
  {
    id: 'dyson-swarm', title: 'Dyson swarms', cat: 'scale', icon: 'swarm', unlock: (s) => (s.system?.collectors ?? 0) > 0,
    body: `In 1960 Freeman Dyson pointed out that an advanced civilisation would eventually surround its star with collectors to catch its light — and would glow in the infrared as a result. A solid shell is impossible; a swarm of independent collectors in their own orbits is not.

Ten petawatts at Earth’s distance from the Sun needs about 25 million km² of collectors at 30% efficiency: three Australias. At ten grams per square metre, that weighs about as much as one 600-metre asteroid.`,
    game: 'The swarm is twelve arcs along Earth’s orbit, lit as collectors are built. Power only counts when something uses it: compute rings, habitats, the foundries themselves, and beams to Earth.',
  },
  {
    id: 'self-replication', title: 'Machines that build machines', cat: 'compute', icon: 'foundry', unlock: (s) => (s.system?.foundries.length ?? 0) > 0,
    body: `John von Neumann described, in the 1940s, a machine that could build a copy of itself from raw materials. NASA studied a self-replicating lunar factory in 1980. The appeal is the exponential: a seed that doubles every year becomes a thousand factories in a decade.

The danger is the same exponential. Every copy is a chance for an error to be copied too, which is why such designs lean on verification: signatures, audits and kill switches.`,
    game: 'Seed foundries double on their own. The growth dial trades speed for the chance that a strain drifts off-spec; sentinels and signed designs cut it. A strain left alone eats its foundry.',
  },
  {
    id: 'asteroid-types', title: 'C, S and M asteroids', cat: 'chips', icon: 'asteroid', unlock: (s) => Object.values(s.system?.asteroids ?? {}).some((a) => a.status >= 1),
    body: `Most asteroids fall into three broad families. C-types are dark and carbon-rich, with water bound in clay minerals: Bennu and Ryugu, both sampled by spacecraft. S-types are stony, silicate-rich bodies like Eros and Itokawa. M-types, such as Psyche, look like exposed metal — perhaps the cores of shattered protoplanets.

Many are easier to reach than the Moon’s surface in terms of the rocket effort needed, because there is no deep gravity well to climb out of.`,
    game: 'A foundry on an S-type makes collectors 25% more efficiently, on an M-type compute-ring radiators, on a C-type habitats. Surveys reveal the near-Earth rocks first, the main belt from stage 2.',
  },
  {
    id: 'lagrange', title: 'Lagrange points', cat: 'compute', icon: 'orbit', unlock: (s) => (s.system?.foundries.some((f) => f.site === 'l4' || f.site === 'l5') ?? false),
    body: `Around any two orbiting bodies there are five points where a small object can keep station with them. Two of them, L4 and L5, sit sixty degrees ahead of and behind the smaller body and are naturally stable: things parked there stay. Jupiter’s L4 and L5 hold thousands of Trojan asteroids.

Gerard O’Neill proposed the Earth–Moon L5 point in the 1970s as a home for space colonies built from lunar material.`,
    game: 'The L4 and L5 yards build most efficiently, but only if rock reaches them from the Moon (with its mass driver) or the asteroids.',
  },
  {
    id: 'oneill', title: 'O’Neill cylinders', cat: 'world', icon: 'habitat', unlock: (s) => (s.charter?.projects ?? []).some((p) => p.kind === 'habitat'),
    body: `A pair of counter-rotating cylinders several kilometres long, spun so that centrifugal force feels like gravity on the inside walls: land and windows in alternating stripes, with mirrors bringing in sunlight. O’Neill’s 1976 design held a few million people each.

Spin gravity needs no new physics; the challenge is the mass of the shielding and structure, which is why such habitats only make sense when built from material already in space.`,
    game: 'L5 habitats are a use of the swarm’s power. How they are settled — towns, work stations or private cities — sets how many people live in space.',
  },
  {
    id: 'radiators', title: 'Cooling in space', cat: 'compute', icon: 'ring', unlock: (s) => (s.system?.rings ?? 0) > 0,
    body: `In vacuum there is no air to carry heat away: everything must be radiated. A radiator sheds heat in proportion to the fourth power of its temperature (the Stefan–Boltzmann law), so warm radiators are far smaller than cool ones. Proposals include liquid-droplet radiators: sheets of molten droplets flung across space and caught again.

For compute in orbit, the radiators — not the chips or the solar panels — are usually the heaviest part.`,
    game: 'Compute rings need four times the mass per terawatt of collectors, mostly radiators. Radiator research and M-type asteroids make them lighter.',
  },
  {
    id: 'power-beaming', title: 'Beaming power to Earth', cat: 'energy', icon: 'satellite', unlock: (s) => (s.charter?.projects ?? []).some((p) => p.kind === 'beam'),
    body: `Space-based solar power has been studied since Peter Glaser’s 1968 patent: convert sunlight to microwaves, beam them to a rectenna on the ground, convert back to electricity. The beam is spread wide on purpose — weaker than midday sunlight — so the rectenna fields are kilometres across.

Beamed power avoids the night and the weather, but it still ends up as heat on Earth, like any other power used there.`,
    game: 'Beam stations deliver swarm power to a province, up to the Thermal Line. Beamed power counts as surface use.',
  },
  {
    id: 'longevity-escape', title: 'Longevity escape velocity', cat: 'world', icon: 'longevity', unlock: (s) => (s.system?.lifeRate ?? 0) >= 0.35,
    body: `Life expectancy rose by about three months a year through the twentieth century. "Longevity escape velocity", a term popularised by Aubrey de Grey, is the point at which medical progress adds more than a year of remaining healthy life every year — so that, on average, people stop getting closer to the end.

Whether and when that happens is hotly debated. Many researchers expect AI-driven biology to speed the work up dramatically.`,
    game: 'Healthy life expectancy climbs with the minds’ research and clinics in the provinces. Escape velocity is a Type I checklist item. Who gets treated first is a big decision.',
  },
  {
    id: 'carrington', title: 'The Carrington event', cat: 'world', icon: 'storm', unlock: (s) => (s.system?.stage ?? 0) >= 2,
    body: `On 1 September 1859 Richard Carrington watched a white-light flare on the Sun. Within a day the largest geomagnetic storm on record hit Earth: auroras as far south as the Caribbean, telegraph lines sparking and running without batteries. A storm that size today would damage satellites and power grids worldwide.

The Sun’s activity rises and falls over an eleven-year cycle; the most violent storms cluster around solar maximum.`,
    game: 'The finale, Solar Maximum, is a Carrington-class storm on three fronts. Storm hardening, the storm watch and the supergrid soften the hit.',
  },
  {
    id: 'ai-personhood', title: 'Minds and rights', cat: 'compute', icon: 'minds', unlock: (s) => !!s.system?.seat || (s.system?.stage ?? 0) >= 2,
    body: `Whether an AI system could be a moral patient — something that can be wronged — is an open question in philosophy and AI research. Some researchers argue for precaution: taking the possibility seriously before it is settled, since the cost of being wrong could be large in either direction.

Legal personhood is a separate question: corporations have long had it, rivers have been granted it in some countries.`,
    game: 'The minds in orbit get (or don’t get) a seat on the Council. Their mood follows their share of the swarm, the seat and what became of Bit; it feeds the finale’s Minds front.',
  },
];

export const GUIDE_BY_ID: Record<string, GuideEntry> = Object.fromEntries(GUIDE.map((g) => [g.id, g]));

/** Entries the given company has unlocked. */
export function unlockedFor(s: GameState | null): string[] {
  return GUIDE.filter((g) => g.unlock === 'start' || (s ? g.unlock(s) : false)).map((g) => g.id);
}
