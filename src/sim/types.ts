import type { RegionId } from '../content/mapcodes';

export type FacilityType = 'hq' | 'solar' | 'wind' | 'gas' | 'battery' | 'datacenter' | 'lab';
export type SupplierId = 'lumen' | 'kestrel';
export type TechId = string;
export type AdvisorId = 'juno' | 'penny' | 'mira' | 'sol' | 'iris' | 'kip' | 'bit';

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
}

export interface GameState {
  version: number;
  seed: number;
  rng: number;
  day: number;
  company: { name: string; homeSite: string };
  finance: {
    cash: number;
    round: 'seed' | 'A' | 'B';
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
  market: { rivals: Rival[]; hbm: number; gasPrice: number };
  modifiers: Modifier[];
  events: { active: ActiveEvent | null; queue: ActiveEvent[]; history: { id: string; day: number; choice: number }[]; last: Record<string, number>; nextRoll: number };
  objectives: { done: string[] };
  flags: Record<string, number | boolean | string>;
  news: NewsItem[];
  carbon: { cumMt: number };
  built: Partial<Record<FacilityType, number>>;
  stats: Stats;
  nextId: number;
  savedAt?: number;
}
