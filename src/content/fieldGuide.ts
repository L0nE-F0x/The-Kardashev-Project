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
    game: 'Every site lists its ☀ solar and 🌬 wind capacity factors. Deserts, high plateaus and windy plains are worth the trip.',
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
    id: 'packaging', title: 'Advanced packaging', cat: 'chips', icon: 'packaging', unlock: (s) => (s.act ?? 1) >= 2 && s.phase >= 2,
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
];

export const GUIDE_BY_ID: Record<string, GuideEntry> = Object.fromEntries(GUIDE.map((g) => [g.id, g]));

/** Entries the given company has unlocked. */
export function unlockedFor(s: GameState | null): string[] {
  return GUIDE.filter((g) => g.unlock === 'start' || (s ? g.unlock(s) : false)).map((g) => g.id);
}
