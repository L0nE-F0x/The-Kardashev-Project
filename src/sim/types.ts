import type { RegionId } from '../content/mapcodes';
import type { Difficulty, EventRate, FounderId, RivalPace } from '../content/difficulty';

export type FacilityType =
  | 'hq'
  | 'solar'
  | 'wind'
  | 'gas'
  | 'battery'
  | 'datacenter'
  | 'lab'
  // ── Act II ──
  | 'hydro'
  | 'geothermal'
  | 'restart'
  | 'smr'
  | 'reactor'
  | 'packaging'
  | 'fab'
  | 'campus';
/** 'own' = accelerators from your fab joint venture (Act II). */
export type SupplierId = 'lumen' | 'kestrel' | 'own';
export type TechId = string;
export type AdvisorId = 'juno' | 'penny' | 'mira' | 'sol' | 'iris' | 'kip' | 'bit' | 'lena';

/** A batch of identical accelerators. */
export interface Batch {
  qty: number;
  /** PFLOP/s per accelerator (peak FP8 dense). */
  perf: number;
  /** kW per accelerator (IT load, server share included). */
  kw: number;
  supplier: SupplierId;
}

export interface Facility {
  id: string;
  type: FacilityType;
  siteId: string;
  status: 'building' | 'online';
  /** Days of construction completed. */
  progress: number;
  buildDays: number;
  startedDay: number;
  onlineDay?: number;
  /** Data centers: installed accelerator batches. */
  racks?: Batch[];
  /** Size tier 1..3 (Act II). Missing = 1. */
  tier?: number;
  /** An expansion under way; the facility keeps running at its old tier meanwhile. */
  upgrade?: { to: number; progress: number; buildDays: number };
  /** Why construction is paused (e.g. waiting on an export licence for EUV tools). */
  blocked?: string;
}

export interface GridConnection {
  /** MW available from the public grid. */
  mw: number;
  pending: { mw: number; readyDay: number; requestedDay: number }[];
}

export interface SiteState {
  grid: GridConnection;
  /** Delivered accelerators waiting for rack space. */
  inventory: Batch[];
  /** Plots added by buying land (Act II). */
  extraSlots?: number;
}

export interface PowerLink {
  id: string;
  a: string;
  b: string;
  km: number;
  status: 'building' | 'online';
  progress: number;
  buildDays: number;
  capacityMW: number;
  lossPct: number;
}

export interface Order {
  id: string;
  supplier: SupplierId;
  /** Supplier site the order ships from. */
  fromSite: string;
  qty: number;
  produced: number;
  shipped: number;
  dest: string;
  mode: 'sea' | 'air';
  placedDay: number;
  unitPrice: number;
  perf: number;
  kw: number;
  done: boolean;
  /** Units produced but waiting for the next weekly shipment. */
  pendingShip: number;
}

export interface Shipment {
  id: string;
  orderId: string;
  batch: Batch;
  from: string;
  dest: string;
  mode: 'sea' | 'air';
  departDay: number;
  /** Day the sea/air leg ends at the destination port (overland follows). */
  portDay: number;
  arriveDay: number;
  /** Sea or air path as [lon, lat] points, then the overland leg to the site. */
  route: [number, number][];
  overland: [number, number][];
  chokepoints: string[];
  delayed: boolean;
}

export interface TrainingRun {
  name: string;
  gen: number;
  target: number;
  done: number;
  startDay: number;
}

export interface Model {
  name: string;
  gen: number;
  flop: number;
  capability: number;
  day: number;
}

export interface Rival {
  id: string;
  name: string;
  capability: number;
  nextRelease: number;
  open: boolean;
  modelGen: number;
  /** Act II: war chest for building campuses. */
  cash?: number;
  /** Act II: next day the rival considers a new campus. */
  nextBuild?: number;
}

/** A rival lab's campus on the map (Act II). Takes plots and grid headroom like yours would. */
export interface RivalBuild {
  id: string;
  owner: string;
  siteId: string;
  slots: number;
  itMW: number;
  status: 'building' | 'online';
  startDay: number;
  readyDay: number;
}

export interface Modifier {
  id: string;
  key: string;
  mult?: number;
  add?: number;
  until: number;
  label: string;
}

export interface Ledger {
  revenue: number;
  /** Loan interest and repayments (Act II). */
  debt: number;
  rental: number;
  power: number;
  fuel: number;
  opex: number;
  staff: number;
  capex: number;
  chips: number;
  shipping: number;
  funding: number;
  other: number;
}

export interface MonthRecord extends Ledger {
  label: string;
  cashEnd: number;
}

export interface ActiveEvent {
  id: string;
  ctx: Record<string, string | number>;
  day: number;
}

export interface NewsItem {
  day: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'event';
}

export interface SitePower {
  load: number;
  solar: number;
  wind: number;
  /** Firm clean output (hydro, geothermal, nuclear), average MW. */
  firm: number;
  gas: number;
  gridUsed: number;
  gasUsed: number;
  battery: number;
  served: number;
  /** 0..1 fraction of load that was served. */
  frac: number;
  curtailed: number;
  imported: number;
  exported: number;
}

// ── Act II: networks ────────────────────────────────────────────────────────────────────────
/** Overland fiber between two of your sites. */
export interface FiberLink {
  id: string;
  a: string;
  b: string;
  km: number;
  status: 'building' | 'online';
  progress: number;
  buildDays: number;
}

/** A subsea cable you laid yourself between two landing stations. */
export interface OwnCable {
  id: string;
  a: string;
  b: string;
  status: 'building' | 'online';
  progress: number;
  buildDays: number;
}

export interface NetworkState {
  fiber: FiberLink[];
  /** Cable systems (content ids) you lease capacity on. */
  leases: string[];
  own: OwnCable[];
  /** Cable id (content or own) → day the repair ship finishes. */
  cuts: Record<string, number>;
}

// ── Act II: the chip stack ──────────────────────────────────────────────────────────────────
export type DealKind = 'reserve' | 'cofund' | 'hbm' | 'packaging';

export interface SupplyDeal {
  id: string;
  kind: DealKind;
  partner: string;
  /** Accelerators per month this deal covers. */
  units: number;
  startDay: number;
  /** Day the capacity starts (co-funded lines take time to build). */
  readyDay: number;
  endDay: number;
}

export interface StackState {
  deals: SupplyDeal[];
  /** Mine id → your stake (0..1). */
  stakes: Record<string, number>;
}

export interface Materials {
  lithium: number;
  copper: number;
  helium: number;
  neon: number;
}

// ── Act II: politics ────────────────────────────────────────────────────────────────────────
export interface BlocState {
  /** The bloc government's view of you (0..100). Social license stays the people's view. */
  relation: number;
  stance: 'accelerate' | 'neutral' | 'cautious';
  nextElection: number;
  /** −1..1: which way the next election is leaning (−1 cautious, +1 accelerate). */
  poll: number;
  /** Export rules you hold licences for here. */
  licences: string[];
  /** Recent lobbying; drives scandal risk. */
  lobby: number;
}

export interface PoliticsState {
  /** Active export rules (content ids). */
  rules: string[];
  treaties: string[];
  pending: { rule: string; region: RegionId; readyDay: number }[];
  nextSummit: number;
}

// ── Act II: capital ─────────────────────────────────────────────────────────────────────────
export interface Loan {
  id: string;
  label: string;
  principal: number;
  balance: number;
  /** Annual interest rate. */
  rate: number;
  /** Monthly payment (interest + principal). */
  monthly: number;
  startDay: number;
  endDay: number;
}

export interface ComputeContract {
  id: string;
  customer: string;
  region: RegionId;
  /** Accelerator-equivalents of serving you guarantee. */
  units: number;
  monthly: number;
  /** Monthly penalty at a 100% shortfall. */
  penalty: number;
  months: number;
  startDay: number;
  endDay: number;
  /** Offers only: when the customer walks away. */
  expires?: number;
  /** Fraction delivered over the last 30 days (for the UI). */
  delivered?: number;
}

export interface SovereignDeal {
  id: string;
  def: string;
  region: RegionId;
  status: 'offer' | 'active' | 'done' | 'failed';
  /** MW of IT capacity you must have online in the bloc. */
  needMW: number;
  byDay: number;
  expires: number;
  /** IT MW you already had in the bloc when you accepted (only new capacity counts toward needMW). */
  baseMW?: number;
}

export interface Board {
  confidence: number;
  nextReview: number;
  /** Monthly revenue at the last review. */
  baseline: number;
  misses: number;
  /** Target growth for the current quarter (e.g. 0.15 = +15%). */
  target: number;
  /** Inference price trend when the baseline was set: reviews measure growth in volume (falling prices don't count). */
  baseTrend?: number;
  /** Extra target points promised for the current quarter only. */
  stretch?: number;
}

export interface CapitalState {
  board: Board | null;
  loans: Loan[];
  contracts: ComputeContract[];
  offers: ComputeContract[];
  sovereign: SovereignDeal[];
  /** `lastRound`: the private valuation before listing; `parts`: why the bankers priced it so (see ipoBreakdown). */
  ipo: { day: number; valuation: number; raised: number; lastRound?: number; base?: number; parts?: [string, number][]; floor?: boolean } | null;
}

// ── Act II: rivals, talent, acquisitions ────────────────────────────────────────────────────
export interface StartupOffer {
  id: string;
  def: string;
  price: number;
  expires: number;
}

// ── Act II: advisor jobs ────────────────────────────────────────────────────────────────────
export interface Job {
  on: boolean;
  /** Main slider (meaning depends on the advisor). */
  a: number;
  /** Optional second setting. */
  b?: number;
  /** Day the job last acted (for reports / pacing). */
  last?: number;
  /** Act III: Bit's co-pilot desk, paused until the margins recover (it resumes on its own). */
  paused?: boolean;
}

// ── Act II: the finale ──────────────────────────────────────────────────────────────────────
export type FrontId = 'grid' | 'supply' | 'safety';

export interface FinaleState {
  startDay: number;
  endDay: number;
  /** 0..100 pressure per front; ≥ 100 means the front is lost. */
  fronts: Record<FrontId, { pressure: number; lost: boolean }>;
  regions: RegionId[];
  rival: string;
  done: boolean;
  /** Fronts held at the end (0..3). */
  standing?: number;
}

// ── Act III: the Charter ────────────────────────────────────────────────────────────────────
/** What a Charter contract builds. */
export type ContractKind =
  | 'solar' | 'wind' | 'nuclear' | 'hydro' | 'geo'
  | 'hvdc'
  | 'fab' | 'hbm' | 'pkg' | 'euv'
  | 'compute' | 'cable'
  | 'evals' | 'interp'
  | 'launch' | 'orbital' | 'spacesolar'
  | 'fusion'
  // Act IV
  | 'link' | 'fpilot' | 'ffleet' | 'dac' | 'desal'
  | 'spaceport' | 'odc' | 'sps' | 'cleanup'
  | 'moonbase' | 'moonmine' | 'massdriver'
  // Act V
  | 'seed' | 'survey' | 'sentinel' | 'beam' | 'rewild' | 'clinic' | 'habitat' | 'harden' | 'mercury';

/** S / M / L. */
export type ContractSize = 1 | 2 | 3;

/** A partner's offer on a tender. `partner` is a partner id, or 'you' for your own company. */
export interface Bid {
  partner: string;
  /** The Charter's share the partner asks for ($). */
  price: number;
  /** Promised build time (days). */
  days: number;
  pitch: string;
}

/** A contract you posted that partners are bidding on. */
export interface Tender {
  id: string;
  kind: ContractKind;
  size: ContractSize;
  /** Where it is built: a megaproject or launch site id, a region id, an HVDC route id, or 'global'. */
  where: string;
  region: RegionId;
  /** Total project value (partners and private capital raise everything above the Charter's share). */
  value: number;
  postedDay: number;
  closesDay: number;
  bids: Bid[];
  /** Partners still working on a bid, and the day it arrives. */
  pending: { partner: string; day: number }[];
  /** Act IV: an option the contract carries (a fusion fleet's design). */
  opt?: string;
}

/** An awarded contract being built (or finished). */
export interface Project {
  id: string;
  kind: ContractKind;
  size: ContractSize;
  where: string;
  region: RegionId;
  /** Partner id, or 'you'. */
  builder: string;
  value: number;
  /** The Charter's share as agreed (grows with overruns). */
  price: number;
  paid: number;
  /** Payments that fell due but the treasury couldn't cover. */
  arrears: number;
  startDay: number;
  /** Days of work needed (grows with delays). */
  days: number;
  /** Days the builder promised (for lateness and damages). */
  promised: number;
  /** Days of work done. */
  progress: number;
  status: 'building' | 'done' | 'cancelled';
  doneDay?: number;
  troubles: number;
  /** Damages already claimed on this project. */
  claimed?: boolean;
  /** Energy projects: average GW delivered once online. */
  gw?: number;
  /** Act IV: the option the contract carried (a fusion fleet's design). */
  opt?: string;
  /** Act IV: offline until this day (a supergrid link fault). */
  downUntil?: number;
}

export interface PartnerState {
  /** Relationship with the Charter (0..100). */
  rel: number;
  won: number;
  done: number;
  /** Times this partner was the cheapest bid and lost (it remembers). */
  snubs: number;
}

export interface CharterLedger {
  dues: number;
  /** Donations, levies, refunds. */
  income: number;
  payments: number;
  programmes: number;
  favours: number;
  other: number;
}

export interface CharterMonth extends CharterLedger {
  label: string;
  budgetEnd: number;
}

export type FactionId = 'atlantic' | 'eastern' | 'nonaligned';

export interface CouncilState {
  /** Resolutions in force. */
  passed: string[];
  /** Tabled for the next session. */
  agenda: string[];
  nextSession: number;
  sessions: number;
  /** Vote boosts bought for the next session (whips, favours), per bloc. */
  sway: Partial<Record<RegionId, number>>;
  factions: Record<FactionId, { tension: number }>;
  /** Blocs that walked out: since when, and the concession that brings them back. */
  walkouts: Partial<Record<RegionId, { since: number; demand: string }>>;
  /** Blocs paying late (arrears, $). */
  late: Partial<Record<RegionId, number>>;
  /** The rival Concord Initiative, if it formed. */
  concord: { formed: number; members: RegionId[] } | null;
  history: { day: number; id: string; passed: boolean; yes: number; no: number }[];
}

export interface WorldBloc {
  /** Average power used (TW), Charter projects excluded. */
  tw: number;
  /** Clean fraction of it. */
  clean: number;
}

export interface WorldState {
  /** Baseline world power (TW avg) without Charter projects or your own plants. */
  tw: number;
  /** Current annual growth rate of the baseline. */
  growth: number;
  /** Charter clean energy online (TW average). */
  charterTW: number;
  blocs: Record<RegionId, WorldBloc>;
  /** What is left of the 2 °C carbon budget (Gt CO₂). */
  carbonGt: number;
  /** Emissions this year (Gt CO₂ / yr). */
  co2Gt: number;
  /** Clean share of newly built energy worldwide. */
  newClean: number;
}

export interface FrontierRegime {
  /** World alignment: how well the field as a whole can check its strongest models. */
  alignment: number;
  /** Days in a row the world safety margin has been ≥ 0. */
  marginDays: number;
  /** Your own training licence above the cap: the generation it covers and when it is ready. */
  ownLicence: { gen: number; readyDay: number } | null;
  incidents: number;
  lastIncident: number;
}

export type ThresholdFront = 'grid' | 'frontier' | 'council';

export interface ThresholdState {
  startDay: number;
  endDay: number;
  fronts: Record<ThresholdFront, { pressure: number; lost: boolean }>;
  /** The lab whose model nears the threshold. */
  lab: string;
  /** The faction that walks out. */
  faction: FactionId;
  done: boolean;
  /** Fronts held at the end (0..3) — the Planetary Mandate. */
  held?: number;
}

export interface CharterState {
  /** 1 Founding · 2 Build-Out · 3 Frontier · 4 Threshold · 5 Renewal · 6 done. */
  phase: number;
  founded: number;
  budget: number;
  month: CharterLedger;
  monthKey: number;
  history: CharterMonth[];
  /** Dues level: 0.7 low, 1 standard, 1.4 high (resolutions move it). */
  dues: number;
  legitimacy: number;
  /** Political capital: the Council currency. */
  capital: number;
  /** Charter Standing carried over from the Crunch (0..3). */
  standing: number;
  partners: Record<string, PartnerState>;
  tenders: Tender[];
  projects: Project[];
  /** Mission id → day completed. */
  missions: Record<string, number>;
  /** Compute access per bloc (0..100). */
  access: Record<RegionId, number>;
  blindTrust: boolean;
  /** Day the blind trust started or ended (cooldowns). */
  trustDay: number;
  /** Charter desk jobs (delegation). */
  desk: Partial<Record<AdvisorId, Job>>;
  world: WorldState;
  council: CouncilState;
  regime: FrontierRegime;
  threshold: ThresholdState | null;
  renewal: { day: number; yes: number; no: number; outcome: 'planetary' | 'limited' | 'caretaker' } | null;
}

// ── Act IV: Planetary ───────────────────────────────────────────────────────────────────────
/** The AIs that can run provinces: yours and the three rival labs' models. */
export type AiId = 'bit' | 'apex' | 'weft' | 'sapling';
export type FusionDesignId = 'tokamak' | 'stellarator' | 'laser' | 'pinch' | 'dhe3';
/** What a five-year plan puts first. */
export type Priority = 'grid' | 'fusion' | 'space' | 'provinces' | 'climate' | 'safety';
export type HeatFront = 'heat' | 'cascade' | 'controls';
/** Orbital shells: low Earth orbit, geostationary, cislunar. */
export type Shell = 'leo' | 'geo' | 'cis';

/** A bloc as a province of the planet (Act IV). */
export interface Province {
  /** People, billions. */
  pop: number;
  /** Heat index (0..100): how hard the hot season bites. */
  heat: number;
  /** Water stress (0..100). */
  water: number;
  /** Wellbeing (0..100). */
  wellbeing: number;
  /** The AI running it, if delegated. */
  ai: AiId | null;
  aiSince: number;
}

export interface FusionDesignState {
  status: 'idle' | 'pilot' | 'won' | 'partial' | 'failed';
  /** Pilots funded so far. */
  tries: number;
  resolvedDay?: number;
}

export interface AiState {
  /** Trust (0..100): how much the blocs and you rely on it. */
  trust: number;
  incidents: number;
  lastIncident: number;
}

export interface FivePlan {
  /** Years the jump covers (3..5). */
  years: number;
  /** Up to three priorities. */
  priorities: Priority[];
  /** Treasury kept in reserve during the jump (share of a year of dues). */
  reserve: number;
  /** Let Bit run the plan (needs trust). */
  bitRuns: boolean;
}

export interface PlanetSnap {
  day: number;
  K: number;
  tw: number;
  warming: number;
  wellbeing: number;
  fusionGW: number;
  links: number;
  orbitGW: number;
  budget: number;
  legitimacy: number;
}

export interface JumpRecord {
  from: number;
  to: number;
  /** The stage the jump led into. */
  stage: number;
  plan: FivePlan;
  before: PlanetSnap;
  after: PlanetSnap;
  /** Projects finished during the jump (names). */
  built: string[];
  /** The biggest news of the years skipped. */
  highlights: string[];
  /** Decisions taken on autopilot during the jump. */
  auto: string[];
  /** How many decisions autopilot took (`auto` lists the first few). */
  autoTotal?: number;
  /** Why the jump stopped before the plan's end (the treasury ran dry, Legitimacy crashed, a walkout), if it did. */
  cut?: string;
  /** Bit's diary for the chapter. */
  diary: string[];
}

export interface HeatWallState {
  startDay: number;
  endDay: number;
  fronts: Record<HeatFront, { pressure: number; lost: boolean }>;
  /** The AI that reaches for the controls. */
  ai: AiId;
  /** The hottest provinces. */
  regions: RegionId[];
  done: boolean;
  /** Fronts held at the end (0..3). */
  held?: number;
}

export interface PlanetState {
  /** 0 The Mandate · 1 The Supergrid · 2 The Fusion Age · 3 The High Frontier · 4 The Heat Wall · 5 done. */
  stage: number;
  begun: number;
  /** Day the current stage began. */
  stageDay: number;
  /** Powers from Act III's renewal vote (a resolution can upgrade them). */
  powers: 'planetary' | 'limited' | 'caretaker';
  /** What you did with your company at the Mandate. */
  company: 'keep' | 'sell' | 'utility' | null;
  /** The next five-year plan (being drafted). */
  plan: FivePlan | null;
  /** A stage gate is reached: the plan screen is waiting for you. */
  planOpen: boolean;
  /** A jump in progress (the UI runs it in chunks for the time-lapse). */
  jump: { from: number; to: number; plan: FivePlan; before: PlanetSnap; stage: number; auto: string[]; log: string[] } | null;
  jumps: JumpRecord[];
  provinces: Record<RegionId, Province>;
  /** Cooling masked by solar geoengineering (°C). */
  mask: number;
  /** GW of D-T fusion the tritium supply can fuel. */
  tritium: number;
  fusion: Record<FusionDesignId, FusionDesignState>;
  ais: Record<AiId, AiState>;
  /** −100..100: how your bargains with Bit went. */
  bitBond: number;
  /** Steps of Bit's arc done. */
  bitArc: number;
  /** Debris per shell (0..100). */
  debris: Record<Shell, number>;
  collisions: number;
  lastCollision: number;
  heatwall: HeatWallState | null;
}

// ── Act V: Type I ───────────────────────────────────────────────────────────────────────────
/** Asteroid composition: C (carbon, water), S (stone, silicon), M (metal). */
export type AsteroidType = 'C' | 'S' | 'M';
/** Solar Maximum's three fronts. */
export type MaxFront = 'storm' | 'thermal' | 'minds';
/** What an era plan puts first. */
export type EraPriority = 'swarm' | 'foundries' | 'asteroids' | 'minds' | 'people' | 'earth' | 'safety' | 'longevity';
export type SkyOwnership = 'commons' | 'concessions' | 'claims';
export type EarthFate = 'garden' | 'provinces' | 'workshop';
export type LongevityPlan = 'everyone' | 'need' | 'market';
export type MindsSeat = 'advisory' | 'full' | 'none';
export type SettlementPlan = 'settle' | 'stations' | 'private';
export type BitFate = 'costeward' | 'free' | 'leash';
/** What became of an advisor in Act V: renewed by the treatments and staying, or retired with a successor. */
export type CastFate = 'renewed' | 'retired';
/** The Mercury question at the end: plan the full swarm (Type II), or rest at Type I. */
export type NextStep = 'swarm' | 'rest';

/** A self-replicating foundry: a seed that grows on its own. */
export interface Foundry {
  id: string;
  /** System site: 'moon', 'l4', 'l5' or an asteroid id. */
  site: string;
  /** Output capacity, megatonnes of product a year. */
  cap: number;
  founded: number;
  /** Who owns what it makes: 'charter', a partner id or a bloc (claims). */
  owner: string;
  /** A strain drifting off-spec here (0 none … 100 out of hand). */
  drift: number;
  /** Halted (sterilising, verifying) until this day. */
  haltedUntil: number;
  /** The drift level when its strain last got a card (unset: no card yet, so one comes). */
  carded?: number;
}

export interface AsteroidState {
  /** 0 unknown · 1 surveyed · 2 claimed · 3 a foundry works it. */
  status: 0 | 1 | 2 | 3;
  /** 'charter', a partner id or a bloc id once claimed. */
  owner: string | null;
}

export interface EraPlan {
  /** Years the jump covers (5, 7 or 10). */
  years: number;
  /** Up to three priorities. */
  priorities: EraPriority[];
  /** The growth dial (1 safe … 5 fast). */
  dial: number;
  /** Share of foundry output reinvested in more foundries (0.2 … 0.7). */
  reinvest: number;
  /** Share of the swarm's power for minds (compute rings); the rest for people (habitats, industry, beams). */
  minds: number;
  /** Treasury kept in reserve during the jump (share of a year of dues). */
  reserve: number;
  /** Let Bit run the era (needs trust). */
  bitRuns: boolean;
}

export interface SystemSnap {
  day: number;
  K: number;
  /** All power civilisation uses, TW. */
  tw: number;
  /** Used on Earth's surface (incl. beams), TW. */
  earthTW: number;
  /** Collected and used in space, TW. */
  spaceTW: number;
  /** Foundry output, Mt a year. */
  foundryMt: number;
  segments: number;
  lifeExp: number;
  warming: number;
  wellbeing: number;
  spacePop: number;
  budget: number;
  legitimacy: number;
}

export interface EraRecord {
  from: number;
  to: number;
  stage: number;
  plan: EraPlan;
  before: SystemSnap;
  after: SystemSnap;
  built: string[];
  highlights: string[];
  auto: string[];
  diary: string[];
  /** The last climb (the jump that stops at K 1.0000). */
  last?: boolean;
}

export interface SolarMaxState {
  startDay: number;
  endDay: number;
  fronts: Record<MaxFront, { pressure: number; lost: boolean }>;
  /** The AI that reaches for authority over the foundries. */
  ai: AiId | 'chorus';
  /** The foundry where the strain breaks loose. */
  foundry: string | null;
  done: boolean;
  held?: number;
}

export interface SystemState {
  /** 0 The Thermal Line · 1 The Foundries · 2 The Swarm · 3 The Last Climb · 4 Solar Maximum · 5 Type I. */
  stage: number;
  begun: number;
  stageDay: number;
  // ── the big decisions (null until taken) ──
  /** W/m² over the whole Earth the surface may shed as waste heat. */
  thermalLine: number | null;
  ownership: SkyOwnership | null;
  earth: EarthFate | null;
  longevity: LongevityPlan | null;
  seat: MindsSeat | null;
  settlement: SettlementPlan | null;
  bitFate: BitFate | null;
  next: NextStep | null;
  // ── the levers in force (era plans set them; the System panel can change them between eras) ──
  dial: number;
  reinvest: number;
  minds: number;
  // ── space ──
  foundries: Foundry[];
  asteroids: Record<string, AsteroidState>;
  /** Swarm collectors, TW of electric capacity. */
  collectors: number;
  /** Compute rings (minds), TW they can use. */
  rings: number;
  /** Habitats and space industry for people, TW they can use. */
  habitat: number;
  /** Beam capacity to Earth's rectennas, TW. */
  beams: number;
  /** Share of the collectors knocked out (storms), recovering. */
  damage: number;
  /** People living in space, millions. */
  spacePop: number;
  /** Storm hardening (0..1): how much of a storm's hit the swarm shrugs off. */
  hardening: number;
  /** Drift sentinels (0..1): verification that catches strains early. */
  sentinels: number;
  /** Mercury: 0 nothing · 1 the probe is on its way · 2 surveyed. */
  mercury: number;
  // ── Earth and people ──
  /** Garden (+100) ↔ forge (−100) per province. */
  garden: Record<RegionId, number>;
  /** Extra warming from waste heat (°C), lagging the heat itself. */
  heatWarming: number;
  /** Healthy life expectancy, world average (years). */
  lifeExp: number;
  /** Years of life expectancy gained per year (≥ 1 = escape velocity). */
  lifeRate: number;
  /** Day longevity escape velocity was reached. */
  escape: number | null;
  /** Treatment coverage per province (0..100). */
  treated: Record<RegionId, number>;
  // ── minds ──
  /** The orbital minds' mood (0..100). */
  mindsMood: number;
  /** Steps of Bit's last arc done. */
  bitArc: number;
  /** What became of the original cast. */
  cast: Partial<Record<AdvisorId, { fate: CastFate; day: number }>>;
  // ── plans and jumps ──
  plan: EraPlan | null;
  planOpen: boolean;
  jump: { from: number; to: number; plan: EraPlan; before: SystemSnap; stage: number; auto: string[]; log: string[]; last?: boolean } | null;
  eras: EraRecord[];
  solarmax: SolarMaxState | null;
  /** The day K first reached 1.0000 (the score), or null. */
  typeI: number | null;
}

export interface ScheduledEvent {
  id: string;
  day: number;
  ctx: Record<string, string | number>;
}

/** Derived numbers refreshed every tick for the UI. Saved, but always recomputed. */
export interface Stats {
  ownedAccel: number;
  installedAccel: number;
  rentedAccel: number;
  computeEF: number;
  trainPFd: number;
  powerLoad: number;
  powerServed: number;
  playerGenMW: number;
  revenueMonth: number;
  costMonth: number;
  rpPerDay: number;
  capability: number;
  frontier: number;
  alignment: number;
  margin: number;
  K: number;
  worldTW: number;
  inferQuality: number;
  inferDemand: number;
  carbonMtYear: number;
  sitePower: Record<string, SitePower>;
  // ── Act II ──
  /** MW of data hall IT capacity online. */
  itMW: number;
  /** Your generation nameplate-weighted average MW, and the carbon-free part of it. */
  genAvgMW: number;
  cleanGenMW: number;
  /** Inference accelerator-equivalents served per region (Act II markets). */
  served: Partial<Record<RegionId, number>>;
  demandByRegion: Partial<Record<RegionId, number>>;
  /** Accelerators per month you can get from each supplier right now, and what limits it. */
  pools: Partial<Record<SupplierId, { logic: number; hbm: number; pkg: number; rate: number }>>;
}

/** How this company was set up, plus bookkeeping that isn't part of the simulation itself. */
export interface GameMeta {
  /** The clock was stopped when the game last saved (paused, or a decision waiting): no offline catch-up. */
  pausedAtSave?: boolean;
  difficulty: Difficulty;
  founder: FounderId;
  eventRate: EventRate;
  rivalPace: RivalPace;
  startCash: number;
  /** Seconds of play (menu time excluded). */
  playtime: number;
  /** Index of the current tutorial step, or -1 when the tutorial is off or finished. */
  tutorialStep: number;
  /** Real-world ms when the company was founded. */
  createdAt: number;
  /** Hard mode: the company went bankrupt. */
  gameOver?: boolean;
  /** Unlock briefings already shown (Act II). */
  briefings?: string[];
  /** Advisor tips already shown (game/tips.ts; the sim never reads it). */
  tipsSeen?: string[];
  /** Started from the "Start at Act II" preset. */
  act2Start?: boolean;
  /** Started from the "Start at Act III" preset. */
  act3Start?: boolean;
  /** Started from the "Start at Act IV" preset. */
  act4Start?: boolean;
  /** Started from the "Start at Act V" preset. */
  act5Start?: boolean;
  /** Real play time per act and playtest notes (written by the game layer; the sim never reads it). */
  log?: PlayLog;
  /** A sandbox company (no campaign unlocks); its switches can change any time. */
  sandbox?: SandboxOpts;
}

/** Sandbox switches and scenario sliders. */
export interface SandboxOpts {
  /** Money never runs out: company cash (and, from Act III, the Charter's treasury) are topped up. */
  unlimited: boolean;
  /** Research at the normal pace, four times as fast, or everything you can reach already known. */
  research: 'normal' | 'fast' | 'all';
  /** Construction (facilities, upgrades, links, grid hook-ups, Charter projects) finishes overnight. */
  instant: boolean;
  /** Scenario sliders, 1 = as designed: how touchy bloc politics is, how hard the climate responds,
   *  how hard crises and supply shocks hit, and what accelerators cost. */
  politics: number;
  climate: number;
  shocks: number;
  chips: number;
}

/** How a company was played, in real time (for the balance pass and playtest feedback). */
export interface PlayLog {
  acts: Partial<Record<number, ActPlay>>;
  notes: PlayNote[];
}

export interface ActPlay {
  /** Real seconds spent in the act, all told. */
  seconds: number;
  /** ...of which paused (or waiting on a card, a plan, a report). */
  paused: number;
  /** ...of which watching a time-lapse jump (Acts IV–V). */
  jump: number;
  /** ...and running, by speed (1, 2, 4, 8). */
  bySpeed: Partial<Record<number, number>>;
  /** Game days the act began and (once it's over) ended. */
  fromDay: number;
  toDay?: number;
  /** Event cards seen and answered. */
  events: number;
  decisions: number;
}

export interface PlayNote {
  /** Real-world ms. */
  at: number;
  /** Seconds of play at the time. */
  playtime: number;
  act: number;
  day: number;
  /** What was on screen (mode, open panel, selection). */
  where: string;
  text: string;
}

export interface GameState {
  version: number;
  meta: GameMeta;
  seed: number;
  rng: number;
  day: number;
  company: { name: string; homeSite: string };
  finance: {
    cash: number;
    round: 'seed' | 'A' | 'B' | 'IPO';
    valuation: number;
    month: Ledger;
    monthKey: number;
    history: MonthRecord[];
    bridgeLoans: number;
  };
  facilities: Facility[];
  sites: Record<string, SiteState>;
  links: PowerLink[];
  orders: Order[];
  shipments: Shipment[];
  rental: { units: number };
  alloc: { train: number; infer: number; research: number; safety: number };
  training: TrainingRun | null;
  models: Model[];
  research: { current: TechId | null; progress: number; done: TechId[]; pool: number };
  safety: { cumFlop: number; incidents: number; lastIncidentDay: number };
  regions: Record<RegionId, { license: number }>;
  market: { rivals: Rival[]; hbm: number; gasPrice: number; pkg: number; materials: Materials };
  modifiers: Modifier[];
  events: { active: ActiveEvent | null; queue: ActiveEvent[]; history: { id: string; day: number; choice: number }[]; last: Record<string, number>; nextRoll: number; scheduled: ScheduledEvent[] };
  objectives: { done: string[] };
  flags: Record<string, number | boolean | string>;
  news: NewsItem[];
  carbon: { cumMt: number };
  built: Partial<Record<FacilityType, number>>;
  stats: Stats;
  nextId: number;
  savedAt?: number;
  // ── Act II ─────────────────────────────────────────────────────────────────────────────
  /** 1 = The Garage, 2 = The Scale-Up, 3 = The Charter, 4 = Planetary, 5 = Type I. */
  act: number;
  /** Act II phase: 1 Gigawatts · 2 The Stack · 3 The Race · 4 The Crunch · 5 done. */
  phase: number;
  network: NetworkState;
  stack: StackState;
  blocs: Record<RegionId, BlocState>;
  politics: PoliticsState;
  capital: CapitalState;
  rivalBuilds: RivalBuild[];
  /** Regional talent pools (0..1, 1 = untapped). */
  talent: Record<RegionId, number>;
  startups: { offers: StartupOffer[]; bought: string[]; nextOffer: number };
  jobs: Partial<Record<AdvisorId, Job>>;
  finale: FinaleState | null;
  // ── Act III ────────────────────────────────────────────────────────────────────────────
  /** The Kardashev Project (null until Act III begins). */
  charter: CharterState | null;
  // ── Act IV ─────────────────────────────────────────────────────────────────────────────
  /** The planet as one system (null until Act IV begins). */
  planet: PlanetState | null;
  // ── Act V ──────────────────────────────────────────────────────────────────────────────
  /** Earth, the Moon, the foundries and the swarm as one system (null until Act V begins). */
  system: SystemState | null;
}
