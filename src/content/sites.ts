import type { RegionId } from './mapcodes';
import type { ContractKind, SupplierId } from '../sim/types';

export type Backdrop = 'desert' | 'coast' | 'temperate' | 'boreal' | 'plains' | 'tropical' | 'mountain' | 'volcanic' | 'savanna';

export interface SiteDef {
  id: string;
  name: string;
  region: RegionId;
  lat: number;
  lon: number;
  /** Act III adds the Charter HQ, megaproject sites and launch-complex candidates (all view-only). */
  kind: 'build' | 'supplier' | 'cloud' | 'landing' | 'mine' | 'charter' | 'mega' | 'launch';
  blurb: string;
  backdrop: Backdrop;
  /** Seaport used for deliveries, [lat, lon] (must sit on the world ocean). */
  port: [number, number];
  /** Average capacity factors. */
  solarCF: number;
  windCF: number;
  /** 0 = parched … 1 = plenty (cooling water). */
  water: number;
  /** Mean annual temperature °C (drives cooling efficiency). */
  climateC: number;
  /** Research talent multiplier for labs. */
  talent: number;
  /** Spare grid capacity available for new connections (MW). */
  gridHeadroom: number;
  /** Multiplier on the region's grid price. */
  priceMult: number;
  slots: number;
  /** Selectable as a starting HQ. */
  home?: boolean;
  supplier?: SupplierId | 'stackwell' | 'hanbit' | 'veldt' | 'bondline' | 'cumulus';
  /** Inference demand bonus for latency-sensitive customers. */
  demand?: number;
  // ── Act II ──
  /** Hydro plants the river can take. */
  hydro?: number;
  /** Geothermal resource 0..1 (≥ 0.6 conventional; ≥ 0.3 with Enhanced Geothermal). */
  geo?: number;
  /** A retired reactor that can be restarted (MW). */
  reactorMW?: number;
  /** Big empty land that opens in Act II phase 3. */
  megasite?: boolean;
  /** Act needed before the site appears (megasites, restart sites). */
  act?: number;
  phase?: number;
  // ── Act III ──
  /** Megaproject sites: the energy contract kinds that can be built here. */
  mega?: ContractKind[];
  /** Charter phase needed before the site appears (Act III). */
  cphase?: number;
}

const build = (d: Omit<SiteDef, 'kind'>): SiteDef => ({ ...d, kind: 'build' });
const landing = (id: string, name: string, region: RegionId, lat: number, lon: number, port: [number, number]): SiteDef => ({
  id, name: `${name} Landing`, region, lat, lon, port, kind: 'landing', act: 2, backdrop: 'coast',
  blurb: 'A cable landing station: where subsea fiber comes ashore and joins the regional networks.',
  solarCF: 0, windCF: 0, water: 0, climateC: 15, talent: 1, gridHeadroom: 0, priceMult: 1, slots: 0,
});
const mine = (id: string, name: string, region: RegionId, lat: number, lon: number, port: [number, number], backdrop: Backdrop, blurb: string): SiteDef => ({
  id, name, region, lat, lon, port, kind: 'mine', act: 2, backdrop, blurb,
  solarCF: 0, windCF: 0, water: 0, climateC: 20, talent: 1, gridHeadroom: 0, priceMult: 1, slots: 0,
});

const megaSite = (id: string, name: string, region: RegionId, lat: number, lon: number, port: [number, number], backdrop: Backdrop, kinds: ContractKind[], blurb: string, solarCF = 0.25, windCF = 0.3): SiteDef => ({
  id, name, region, lat, lon, port, kind: 'mega', act: 3, backdrop, blurb, mega: kinds,
  solarCF, windCF, water: 0.3, climateC: 18, talent: 1, gridHeadroom: 0, priceMult: 1, slots: 0,
});
const launchSite = (id: string, name: string, region: RegionId, lat: number, lon: number, port: [number, number], backdrop: Backdrop, blurb: string): SiteDef => ({
  id, name, region, lat, lon, port, kind: 'launch', act: 3, cphase: 2, backdrop, blurb,
  solarCF: 0, windCF: 0, water: 0.5, climateC: 20, talent: 1, gridHeadroom: 0, priceMult: 1, slots: 0,
});

/** The Charter's headquarters (Act III). */
export const CHARTER_HQ = 'charter-hq';

export const SITES: SiteDef[] = [
  // ── Pacific Coast ───────────────────────────────────────────────────────────────────────
  build({ id: 'bay-area', name: 'Bay Area', region: 'pac', lat: 37.4, lon: -122.0, blurb: 'Where the talent is. Tiny lots, expensive power, the San Andreas next door.', backdrop: 'coast', port: [37.6, -123.1], solarCF: 0.21, windCF: 0.24, water: 0.5, climateC: 15, talent: 2.0, gridHeadroom: 25, priceMult: 1.3, slots: 3, home: true, demand: 1.15 , geo: 0.6 }),
  build({ id: 'columbia-gorge', name: 'Columbia Gorge', region: 'pac', lat: 45.6, lon: -121.2, blurb: 'Dam-fed hydro, river water and wind funnelling down the gorge.', backdrop: 'mountain', port: [46.2, -124.6], solarCF: 0.17, windCF: 0.34, water: 0.95, climateC: 12, talent: 0.8, gridHeadroom: 80, priceMult: 0.55, slots: 5 , hydro: 2, geo: 0.4 }),
  build({ id: 'mojave', name: 'Mojave Flats', region: 'pac', lat: 35.0, lon: -117.0, blurb: 'Blazing sun and cheap land. Water is the problem.', backdrop: 'desert', port: [33.4, -118.8], solarCF: 0.29, windCF: 0.3, water: 0.15, climateC: 22, talent: 0.6, gridHeadroom: 50, priceMult: 0.9, slots: 6 , geo: 0.5 }),
  // ── Atlantic & Heartland ────────────────────────────────────────────────────────────────
  build({ id: 'n-virginia', name: 'Northern Virginia', region: 'atl', lat: 39.0, lon: -77.5, blurb: 'The internet’s busiest data center alley. Fibre everywhere, grid queue forever.', backdrop: 'temperate', port: [36.9, -75.6], solarCF: 0.18, windCF: 0.2, water: 0.65, climateC: 14, talent: 1.25, gridHeadroom: 30, priceMult: 1.1, slots: 4, home: true, demand: 1.3 }),
  build({ id: 'west-texas', name: 'West Texas Plains', region: 'atl', lat: 32.0, lon: -102.0, blurb: 'Wind, sun, shale gas and a permissive grid of its own.', backdrop: 'plains', port: [28.8, -94.6], solarCF: 0.26, windCF: 0.42, water: 0.25, climateC: 19, talent: 0.6, gridHeadroom: 100, priceMult: 0.8, slots: 6 , geo: 0.35 }),
  build({ id: 'appalachia', name: 'Appalachian Gas Belt', region: 'atl', lat: 39.6, lon: -80.2, blurb: 'Gas wells, river water and towns that want the jobs.', backdrop: 'temperate', port: [36.9, -75.6], solarCF: 0.16, windCF: 0.27, water: 0.8, climateC: 11, talent: 0.7, gridHeadroom: 70, priceMult: 0.85, slots: 5 }),
  // ── Latin America ───────────────────────────────────────────────────────────────────────
  build({ id: 'atacama', name: 'Atacama', region: 'lat', lat: -23.5, lon: -69.0, blurb: 'The best solar resource on Earth, sitting on top of the lithium.', backdrop: 'desert', port: [-23.6, -70.8], solarCF: 0.33, windCF: 0.3, water: 0.05, climateC: 17, talent: 0.5, gridHeadroom: 40, priceMult: 0.9, slots: 6 , geo: 0.5 }),
  build({ id: 'parana', name: 'Paraná Basin', region: 'lat', lat: -25.4, lon: -54.6, blurb: 'In the shadow of one of the world’s largest hydro dams.', backdrop: 'tropical', port: [-24.6, -45.8], solarCF: 0.19, windCF: 0.18, water: 1.0, climateC: 21, talent: 0.6, gridHeadroom: 120, priceMult: 0.55, slots: 5 , hydro: 2 }),
  build({ id: 'queretaro', name: 'Querétaro', region: 'lat', lat: 20.6, lon: -100.4, blurb: 'Nearshoring boomtown on a high plateau, a day’s drive from the border.', backdrop: 'plains', port: [18.6, -104.8], solarCF: 0.24, windCF: 0.2, water: 0.3, climateC: 19, talent: 0.8, gridHeadroom: 50, priceMult: 0.95, slots: 5, demand: 0.95 }),
  // ── Europe ──────────────────────────────────────────────────────────────────────────────
  build({ id: 'london', name: 'London', region: 'eur', lat: 51.5, lon: -0.1, blurb: 'World-class labs and capital. The grid can barely spare a kettle.', backdrop: 'temperate', port: [51.0, 1.9], solarCF: 0.11, windCF: 0.3, water: 0.8, climateC: 11, talent: 1.7, gridHeadroom: 10, priceMult: 1.15, slots: 3, home: true, demand: 1.2 }),
  build({ id: 'iberia', name: 'Iberian Sun', region: 'eur', lat: 38.0, lon: -5.5, blurb: 'Europe’s sunbelt: cheap solar, hot summers, thirsty rivers.', backdrop: 'plains', port: [36.4, -7.2], solarCF: 0.24, windCF: 0.28, water: 0.3, climateC: 18, talent: 0.8, gridHeadroom: 60, priceMult: 0.7, slots: 6 }),
  build({ id: 'rhone', name: 'Rhône Valley', region: 'eur', lat: 44.5, lon: 4.7, blurb: 'Reactors along the river: clean, steady, and expensive to connect.', backdrop: 'temperate', port: [42.9, 4.8], solarCF: 0.17, windCF: 0.22, water: 0.85, climateC: 13, talent: 0.9, gridHeadroom: 50, priceMult: 0.75, slots: 4 , hydro: 1 }),
  // ── Nordics & Arctic ────────────────────────────────────────────────────────────────────
  build({ id: 'lulea', name: 'Luleå', region: 'nor', lat: 65.6, lon: 22.1, blurb: 'Hydro power and air so cold the servers cool themselves.', backdrop: 'boreal', port: [57.6, 11.3], solarCF: 0.09, windCF: 0.3, water: 1.0, climateC: 2, talent: 0.7, gridHeadroom: 100, priceMult: 0.75, slots: 5 , hydro: 2 }),
  build({ id: 'reykjanes', name: 'Reykjanes', region: 'nor', lat: 63.9, lon: -22.4, blurb: 'Geothermal steam on a volcanic peninsula, linked by subsea cable.', backdrop: 'volcanic', port: [63.5, -23.2], solarCF: 0.08, windCF: 0.4, water: 1.0, climateC: 5, talent: 0.6, gridHeadroom: 40, priceMult: 0.95, slots: 4, demand: 0.75 , geo: 1 }),
  build({ id: 'fjords', name: 'Western Fjords', region: 'nor', lat: 61.2, lon: 7.0, blurb: 'Cheap hydro tucked into fjords, cold seawater for cooling.', backdrop: 'mountain', port: [60.5, 4.2], solarCF: 0.09, windCF: 0.33, water: 1.0, climateC: 7, talent: 0.6, gridHeadroom: 70, priceMult: 0.85, slots: 4 , hydro: 2 }),
  // ── Eurasian Steppe ─────────────────────────────────────────────────────────────────────
  build({ id: 'kazakh-steppe', name: 'Kazakh Steppe', region: 'stp', lat: 50.3, lon: 72.0, blurb: 'Wind that never stops and land to the horizon.', backdrop: 'plains', port: [44.7, 37.9], solarCF: 0.18, windCF: 0.4, water: 0.3, climateC: 4, talent: 0.4, gridHeadroom: 120, priceMult: 0.9, slots: 6 }),
  build({ id: 'bratsk', name: 'Siberian Hydro', region: 'stp', lat: 56.1, lon: 101.6, blurb: 'A colossal dam, cheap power and a very long way from customers.', backdrop: 'boreal', port: [42.6, 132.0], solarCF: 0.12, windCF: 0.2, water: 1.0, climateC: -2, talent: 0.4, gridHeadroom: 150, priceMult: 0.5, slots: 5, demand: 0.6 , hydro: 2 }),
  build({ id: 'caspian', name: 'Caspian Coast', region: 'stp', lat: 40.4, lon: 49.9, blurb: 'Old oil country with gas to spare and a stiff sea breeze.', backdrop: 'coast', port: [41.8, 41.3], solarCF: 0.2, windCF: 0.35, water: 0.4, climateC: 15, talent: 0.6, gridHeadroom: 60, priceMult: 0.8, slots: 4 , geo: 0.3 }),
  // ── Gulf & Sahara ───────────────────────────────────────────────────────────────────────
  build({ id: 'gulf-coast', name: 'Gulf Coast', region: 'mena', lat: 24.4, lon: 54.6, blurb: 'Sovereign wealth, sun all year and desalinated water. Air conditioning required.', backdrop: 'desert', port: [24.9, 54.0], solarCF: 0.26, windCF: 0.15, water: 0.1, climateC: 33, talent: 0.8, gridHeadroom: 200, priceMult: 0.8, slots: 6 }),
  build({ id: 'ouarzazate', name: 'Sahara Edge', region: 'mena', lat: 30.9, lon: -6.9, blurb: 'Solar-thermal towers at the gateway to the Sahara.', backdrop: 'desert', port: [33.8, -8.0], solarCF: 0.3, windCF: 0.25, water: 0.15, climateC: 21, talent: 0.5, gridHeadroom: 40, priceMult: 0.85, slots: 5 }),
  build({ id: 'red-sea', name: 'Red Sea Coast', region: 'mena', lat: 27.5, lon: 35.6, blurb: 'Purpose-built giga-projects with sun and wind in equal measure.', backdrop: 'desert', port: [27.3, 35.0], solarCF: 0.28, windCF: 0.38, water: 0.1, climateC: 28, talent: 0.5, gridHeadroom: 80, priceMult: 0.75, slots: 6 }),
  // ── Sub-Saharan Africa ──────────────────────────────────────────────────────────────────
  build({ id: 'copperbelt', name: 'Copperbelt', region: 'ssa', lat: -12.8, lon: 28.2, blurb: 'Copper and cobalt country, fed by big hydro on the Zambezi.', backdrop: 'savanna', port: [-6.8, 39.6], solarCF: 0.22, windCF: 0.15, water: 0.6, climateC: 21, talent: 0.4, gridHeadroom: 25, priceMult: 0.7, slots: 5 , hydro: 1 }),
  build({ id: 'kenyan-rift', name: 'Kenyan Rift', region: 'ssa', lat: -0.9, lon: 36.3, blurb: 'Geothermal steam in the Great Rift Valley. Clean, steady, cool highlands.', backdrop: 'savanna', port: [-4.3, 40.0], solarCF: 0.24, windCF: 0.3, water: 0.5, climateC: 18, talent: 0.7, gridHeadroom: 30, priceMult: 0.85, slots: 4 , geo: 0.95 }),
  build({ id: 'namib', name: 'Namib Coast', region: 'ssa', lat: -22.9, lon: 14.8, blurb: 'Fog-desert coast with world-class sun and wind.', backdrop: 'desert', port: [-23.0, 13.9], solarCF: 0.3, windCF: 0.4, water: 0.05, climateC: 18, talent: 0.3, gridHeadroom: 20, priceMult: 0.95, slots: 6 }),
  // ── South Asia ──────────────────────────────────────────────────────────────────────────
  build({ id: 'bengaluru', name: 'Bengaluru', region: 'sas', lat: 12.97, lon: 77.6, blurb: 'India’s tech capital on a cool plateau. Brilliant engineers, thirsty city.', backdrop: 'tropical', port: [13.1, 80.6], solarCF: 0.21, windCF: 0.25, water: 0.3, climateC: 24, talent: 1.5, gridHeadroom: 35, priceMult: 0.9, slots: 3, home: true }),
  build({ id: 'mumbai', name: 'Mumbai', region: 'sas', lat: 19.1, lon: 72.9, blurb: 'Subsea cables land here. So do monsoons.', backdrop: 'coast', port: [18.9, 72.3], solarCF: 0.19, windCF: 0.2, water: 0.5, climateC: 28, talent: 1.0, gridHeadroom: 40, priceMult: 1.0, slots: 4, demand: 1.3 }),
  build({ id: 'thar', name: 'Thar Desert', region: 'sas', lat: 27.0, lon: 71.0, blurb: 'One of the world’s largest solar parks, in the sands of Rajasthan.', backdrop: 'desert', port: [22.6, 69.6], solarCF: 0.26, windCF: 0.3, water: 0.1, climateC: 28, talent: 0.4, gridHeadroom: 70, priceMult: 0.8, slots: 6 }),
  // ── Mainland East Asia ──────────────────────────────────────────────────────────────────
  build({ id: 'inner-mongolia', name: 'Inner Mongolia', region: 'eam', lat: 41.0, lon: 111.7, blurb: 'Coal country turning to wind and sun, with power to spare.', backdrop: 'plains', port: [38.9, 118.2], solarCF: 0.22, windCF: 0.4, water: 0.3, climateC: 6, talent: 0.5, gridHeadroom: 200, priceMult: 0.65, slots: 6 , geo: 0.3 }),
  build({ id: 'guizhou', name: 'Guizhou Karst', region: 'eam', lat: 26.6, lon: 106.7, blurb: 'Cool mountains, cheap hydro and caves big enough to hide a data center.', backdrop: 'mountain', port: [21.4, 109.1], solarCF: 0.14, windCF: 0.2, water: 0.9, climateC: 15, talent: 0.6, gridHeadroom: 100, priceMult: 0.75, slots: 5 , hydro: 2 }),
  build({ id: 'pearl-delta', name: 'Pearl River Delta', region: 'eam', lat: 22.7, lon: 113.9, blurb: 'The world’s workshop: suppliers on every street, typhoons every summer.', backdrop: 'coast', port: [21.9, 114.2], solarCF: 0.16, windCF: 0.22, water: 0.8, climateC: 23, talent: 1.2, gridHeadroom: 60, priceMult: 1.0, slots: 4, demand: 1.2 }),
  // ── Pacific Fab Belt ────────────────────────────────────────────────────────────────────
  build({ id: 'kyushu', name: 'Kyushu', region: 'fab', lat: 32.9, lon: 130.7, blurb: 'Volcanic island turned chip hub, with geothermal under its feet.', backdrop: 'volcanic', port: [32.6, 129.6], solarCF: 0.16, windCF: 0.2, water: 0.8, climateC: 17, talent: 0.9, gridHeadroom: 40, priceMult: 0.95, slots: 4 , geo: 0.8 }),
  build({ id: 'chiba', name: 'Tokyo Bay', region: 'fab', lat: 35.6, lon: 140.1, blurb: 'Japan’s data center core: huge demand, quakes, little room.', backdrop: 'coast', port: [34.6, 140.4], solarCF: 0.14, windCF: 0.22, water: 0.7, climateC: 16, talent: 1.3, gridHeadroom: 30, priceMult: 1.15, slots: 3, demand: 1.3 }),
  build({ id: 'hokkaido', name: 'Hokkaido', region: 'fab', lat: 43.1, lon: 141.6, blurb: 'Cold, windy and roomy — Japan’s answer to the Nordics.', backdrop: 'boreal', port: [42.2, 141.9], solarCF: 0.13, windCF: 0.34, water: 0.9, climateC: 8, talent: 0.6, gridHeadroom: 60, priceMult: 0.9, slots: 5 , geo: 0.6 }),
  // ── SE Asia & Oceania ───────────────────────────────────────────────────────────────────
  build({ id: 'johor', name: 'Johor', region: 'seo', lat: 1.6, lon: 103.6, blurb: 'Across the causeway from Singapore. Booming, humid, and short on water.', backdrop: 'tropical', port: [1.1, 104.4], solarCF: 0.17, windCF: 0.1, water: 0.4, climateC: 28, talent: 0.9, gridHeadroom: 40, priceMult: 1.0, slots: 4, demand: 1.2 }),
  build({ id: 'pilbara', name: 'Pilbara', region: 'seo', lat: -21.5, lon: 118.5, blurb: 'Red-earth outback with sun, wind and iron ore. Isolated grid.', backdrop: 'desert', port: [-19.8, 118.4], solarCF: 0.3, windCF: 0.38, water: 0.1, climateC: 28, talent: 0.3, gridHeadroom: 15, priceMult: 1.0, slots: 6 }),
  build({ id: 'hunter-valley', name: 'Hunter Valley', region: 'seo', lat: -32.5, lon: 151.0, blurb: 'Retiring coal plants leave grid connections and skilled crews behind.', backdrop: 'temperate', port: [-33.0, 152.4], solarCF: 0.22, windCF: 0.3, water: 0.5, climateC: 18, talent: 0.7, gridHeadroom: 60, priceMult: 0.9, slots: 5 }),

  // ── Act II: retired reactors (restart sites) ────────────────────────────────────────────
  build({ id: 'lakeshore', name: 'Lakeshore Station', region: 'atl', lat: 42.3, lon: -86.3, blurb: 'A shuttered reactor on Lake Michigan, its turbine hall still intact. The town wants it back.', backdrop: 'coast', port: [36.9, -75.6], solarCF: 0.15, windCF: 0.3, water: 1.0, climateC: 9, talent: 0.7, gridHeadroom: 60, priceMult: 0.9, slots: 3, reactorMW: 800, act: 2 }),
  build({ id: 'lower-elbe', name: 'Lower Elbe', region: 'eur', lat: 53.85, lon: 9.35, blurb: 'A mothballed reactor on the Elbe, an hour from Hamburg’s port. Politically radioactive.', backdrop: 'temperate', port: [53.9, 8.4], solarCF: 0.11, windCF: 0.33, water: 0.9, climateC: 9, talent: 0.9, gridHeadroom: 50, priceMult: 1.1, slots: 3, reactorMW: 800, act: 2 }),
  build({ id: 'niigata', name: 'Niigata Coast', region: 'fab', lat: 37.4, lon: 138.6, blurb: 'The world’s largest nuclear station, idle for years. Restarting a unit would light up half of Tokyo’s data centers.', backdrop: 'coast', port: [37.4, 138.0], solarCF: 0.13, windCF: 0.28, water: 0.9, climateC: 13, talent: 0.8, gridHeadroom: 80, priceMult: 1.2, slots: 3, reactorMW: 1000, act: 2 }),
  // ── Act II: megasites (open in phase 3) ─────────────────────────────────────────────────
  build({ id: 'wyoming', name: 'Wyoming High Plains', region: 'atl', lat: 42.8, lon: -106.3, blurb: 'Wind-scoured high plains with room for anything. Cold winters, few neighbours, one very long grid queue.', backdrop: 'plains', port: [28.8, -94.6], solarCF: 0.22, windCF: 0.45, water: 0.3, climateC: 7, talent: 0.4, gridHeadroom: 300, priceMult: 0.75, slots: 10, geo: 0.3, megasite: true, act: 2, phase: 3 }),
  build({ id: 'patagonia', name: 'Patagonian Steppe', region: 'lat', lat: -45.9, lon: -68.5, blurb: 'The windiest land on Earth outside Antarctica, at the far end of every supply chain.', backdrop: 'plains', port: [-46.5, -65.5], solarCF: 0.17, windCF: 0.55, water: 0.4, climateC: 8, talent: 0.4, gridHeadroom: 250, priceMult: 0.7, slots: 10, megasite: true, act: 2, phase: 3 }),
  build({ id: 'empty-quarter', name: 'Empty Quarter', region: 'mena', lat: 22.0, lon: 51.5, blurb: 'A sea of dunes with sovereign money behind it. The sun never takes a day off; neither does the heat.', backdrop: 'desert', port: [24.9, 54.0], solarCF: 0.31, windCF: 0.25, water: 0.05, climateC: 28, talent: 0.4, gridHeadroom: 400, priceMult: 0.75, slots: 10, megasite: true, act: 2, phase: 3, demand: 0.8 }),
  build({ id: 'lapland', name: 'Lapland', region: 'nor', lat: 67.4, lon: 26.6, blurb: 'Arctic forest, cheap hydro on the river grid and air that cools servers for free.', backdrop: 'boreal', port: [57.6, 11.3], solarCF: 0.08, windCF: 0.3, water: 1.0, climateC: -1, talent: 0.4, gridHeadroom: 300, priceMult: 0.7, slots: 10, hydro: 1, megasite: true, act: 2, phase: 3, demand: 0.7 }),
  build({ id: 'gobi', name: 'Gobi Edge', region: 'eam', lat: 41.5, lon: 104.0, blurb: 'Wind and sun to the horizon, coal trains to the east and a grid built for export.', backdrop: 'desert', port: [38.9, 118.2], solarCF: 0.27, windCF: 0.38, water: 0.1, climateC: 7, talent: 0.4, gridHeadroom: 400, priceMult: 0.6, slots: 10, megasite: true, act: 2, phase: 3, demand: 0.8 }),
  build({ id: 'northern-territory', name: 'Northern Territory', region: 'seo', lat: -19.6, lon: 134.2, blurb: 'The red centre: some of the best sun on Earth, and a subsea cable away from Asia.', backdrop: 'desert', port: [-12.8, 129.6], solarCF: 0.3, windCF: 0.22, water: 0.15, climateC: 26, talent: 0.3, gridHeadroom: 300, priceMult: 0.75, slots: 10, megasite: true, act: 2, phase: 3, demand: 0.7 }),
  build({ id: 'kutch', name: 'Rann of Kutch', region: 'sas', lat: 23.9, lon: 69.6, blurb: 'A salt desert being paved with the largest renewable park on the planet.', backdrop: 'desert', port: [22.6, 69.6], solarCF: 0.27, windCF: 0.33, water: 0.1, climateC: 26, talent: 0.5, gridHeadroom: 350, priceMult: 0.65, slots: 10, megasite: true, act: 2, phase: 3 }),
  build({ id: 'northern-cape', name: 'Northern Cape', region: 'ssa', lat: -28.9, lon: 21.4, blurb: 'Karoo sun, dry air and a grid hungry for investment.', backdrop: 'desert', port: [-29.5, 16.0], solarCF: 0.3, windCF: 0.3, water: 0.1, climateC: 18, talent: 0.4, gridHeadroom: 250, priceMult: 0.8, slots: 10, megasite: true, act: 2, phase: 3, demand: 0.8 }),

  // ── Suppliers (not buildable) ───────────────────────────────────────────────────────────
  { id: 'lumen-hsinchu', name: 'Lumen Foundry · Hsinchu', region: 'fab', lat: 24.8, lon: 121.0, kind: 'supplier', supplier: 'lumen', blurb: 'The leading-edge logic fab everyone queues for.', backdrop: 'coast', port: [22.6, 119.9], solarCF: 0, windCF: 0, water: 0.4, climateC: 23, talent: 1, gridHeadroom: 0, priceMult: 1, slots: 0 },
  { id: 'lumen-phoenix', name: 'Lumen Foundry · Phoenix', region: 'pac', lat: 33.6, lon: -112.1, kind: 'supplier', supplier: 'lumen', blurb: 'Lumen’s desert outpost. Smaller, slower, closer to home.', backdrop: 'desert', port: [33.4, -118.8], solarCF: 0, windCF: 0, water: 0.2, climateC: 24, talent: 1, gridHeadroom: 0, priceMult: 1, slots: 0 },
  { id: 'kestrel-ohio', name: 'Kestrel Semiconductor · Ohio', region: 'atl', lat: 40.1, lon: -82.8, kind: 'supplier', supplier: 'kestrel', blurb: 'A challenger fab: cheaper chips, a node behind.', backdrop: 'temperate', port: [36.9, -75.6], solarCF: 0, windCF: 0, water: 0.8, climateC: 11, talent: 1, gridHeadroom: 0, priceMult: 1, slots: 0 },
  { id: 'kestrel-magdeburg', name: 'Kestrel Semiconductor · Magdeburg', region: 'eur', lat: 52.1, lon: 11.6, kind: 'supplier', supplier: 'kestrel', blurb: 'Kestrel’s European fab, subsidised and still ramping.', backdrop: 'temperate', port: [53.9, 8.4], solarCF: 0, windCF: 0, water: 0.8, climateC: 10, talent: 1, gridHeadroom: 0, priceMult: 1, slots: 0 },
  { id: 'stackwell-boise', name: 'Stackwell Memory · Boise', region: 'pac', lat: 43.6, lon: -116.2, kind: 'supplier', supplier: 'stackwell', blurb: 'High-bandwidth memory stacks, eight to a chip.', backdrop: 'plains', port: [46.2, -124.6], solarCF: 0, windCF: 0, water: 0.5, climateC: 11, talent: 1, gridHeadroom: 0, priceMult: 1, slots: 0 },
  { id: 'stackwell-hiroshima', name: 'Stackwell Memory · Hiroshima', region: 'fab', lat: 34.4, lon: 132.5, kind: 'supplier', supplier: 'stackwell', blurb: 'Stackwell’s Japanese memory fab.', backdrop: 'coast', port: [33.2, 132.9], solarCF: 0, windCF: 0, water: 0.7, climateC: 16, talent: 1, gridHeadroom: 0, priceMult: 1, slots: 0 },
  { id: 'hanbit-icheon', name: 'Hanbit Memory · Icheon', region: 'fab', lat: 37.3, lon: 127.4, kind: 'supplier', supplier: 'hanbit', blurb: 'The HBM leader. When Hanbit sneezes, the AI boom catches a cold.', backdrop: 'temperate', port: [34.7, 128.6], solarCF: 0, windCF: 0, water: 0.7, climateC: 12, talent: 1, gridHeadroom: 0, priceMult: 1, slots: 0 },
  { id: 'veldt-veldhoven', name: 'Veldt Optics · Veldhoven', region: 'eur', lat: 51.4, lon: 5.4, kind: 'supplier', supplier: 'veldt', blurb: 'The only company on Earth that builds EUV lithography machines.', backdrop: 'temperate', port: [51.9, 3.6], solarCF: 0, windCF: 0, water: 0.8, climateC: 10, talent: 1, gridHeadroom: 0, priceMult: 1, slots: 0 },
  { id: 'bondline-penang', name: 'Bondline Packaging · Penang', region: 'seo', lat: 5.4, lon: 100.3, kind: 'supplier', supplier: 'bondline', blurb: 'Advanced packaging: where logic and memory become one module.', backdrop: 'tropical', port: [5.3, 99.6], solarCF: 0, windCF: 0, water: 0.5, climateC: 28, talent: 1, gridHeadroom: 0, priceMult: 1, slots: 0 },
  { id: 'cumulus-quincy', name: 'Cumulus Cloud · Quincy', region: 'pac', lat: 47.2, lon: -119.9, kind: 'cloud', supplier: 'cumulus', blurb: 'Rentable accelerators by the hour. Expensive, instant, someone else’s problem.', backdrop: 'plains', port: [46.2, -124.6], solarCF: 0, windCF: 0, water: 0.9, climateC: 10, talent: 1, gridHeadroom: 0, priceMult: 1, slots: 0 },
  // ── Act II: subsea cable landing stations ───────────────────────────────────────────────
  landing('cls-virginia', 'Virginia Beach', 'atl', 36.85, -75.98, [36.9, -75.6]),
  landing('cls-cornwall', 'Cornwall', 'eur', 50.83, -4.55, [50.5, -5.8]),
  landing('cls-marseille', 'Marseille', 'eur', 43.3, 5.37, [42.9, 4.8]),
  landing('cls-fortaleza', 'Fortaleza', 'lat', -3.72, -38.5, [-3.2, -38.2]),
  landing('cls-losangeles', 'Los Angeles', 'pac', 33.9, -118.4, [33.4, -118.8]),
  landing('cls-chikura', 'Chikura', 'fab', 34.95, 139.95, [34.6, 140.4]),
  landing('cls-sydney', 'Sydney', 'seo', -33.9, 151.25, [-33.9, 151.8]),
  landing('cls-singapore', 'Singapore', 'seo', 1.35, 103.99, [1.1, 104.4]),
  landing('cls-mumbai', 'Mumbai', 'sas', 19.05, 72.82, [18.9, 72.3]),
  landing('cls-djibouti', 'Djibouti', 'ssa', 11.6, 43.15, [12.0, 44.0]),
  // ── Act II: mines and gas works (stakes, not builds) ────────────────────────────────────
  mine('mine-atacama', 'Saltflat Lithium · Atacama', 'lat', -23.5, -68.25, [-23.6, -70.8], 'desert', 'A lithium brine field: blue-green evaporation ponds stretching across the salt flat.'),
  mine('mine-pilbara', 'Pilbara Lithium', 'seo', -21.0, 118.9, [-19.8, 118.4], 'desert', 'Hard-rock spodumene dug out of the red earth and shipped north for refining.'),
  mine('mine-copperbelt', 'Deepvein Minerals · Copperbelt', 'ssa', -12.5, 27.85, [-6.8, 39.6], 'savanna', 'Copper and cobalt from some of the richest ore bodies on Earth.'),
  mine('mine-helium', 'Ras Laffan Helium', 'mena', 25.9, 51.55, [26.2, 52.2], 'desert', 'Helium stripped from natural gas — a third of the world’s supply, one coastline.'),
  mine('mine-neon', 'Clearair Gases · Tangshan', 'eam', 39.6, 118.2, [38.9, 118.2], 'temperate', 'Neon purified from steel-mill air separation units. Lasers in every fab depend on it.'),

  // ── Act III: the Charter's headquarters ─────────────────────────────────────────────────
  {
    id: CHARTER_HQ, name: 'Charter HQ · Geneva', region: 'eur', lat: 46.2, lon: 6.15, kind: 'charter', act: 3, backdrop: 'mountain', port: [42.9, 4.8],
    blurb: 'Where the Kardashev Project meets: a Council hall for twelve blocs, a secretariat and a lakeside plaza under the Alps.',
    solarCF: 0, windCF: 0, water: 1, climateC: 11, talent: 1, gridHeadroom: 0, priceMult: 1, slots: 0,
  },
  // ── Act III: megaproject sites (one per bloc) ───────────────────────────────────────────
  megaSite('mega-cascadia', 'Cascadia Geothermal', 'pac', 43.7, -121.3, [46.2, -124.6], 'volcanic', ['geo', 'solar'], 'Hot dry rock under the high desert east of the Cascades: enhanced geothermal on a regional scale.', 0.24, 0.25),
  megaSite('mega-plains', 'Great Plains Wind', 'atl', 38.5, -99.5, [28.8, -94.6], 'plains', ['wind', 'nuclear', 'solar'], 'The windiest farmland on the continent, with room for a reactor fleet on the rivers.', 0.22, 0.45),
  megaSite('mega-patagonia', 'Patagonian Wind', 'lat', -50.3, -70.8, [-51.7, -68.5], 'plains', ['wind', 'hydro'], 'Roaring-forties wind over empty steppe, and glacial rivers for storage.', 0.15, 0.55),
  megaSite('mega-northsea', 'North Sea Wind', 'eur', 55.0, 3.5, [55.0, 3.5], 'coast', ['wind'], 'Shallow banks in the middle of the North Sea: the world’s great offshore wind field.', 0.1, 0.5),
  megaSite('mega-nordic', 'Nordic Hydro Battery', 'nor', 64.3, 13.8, [63.6, 8.0], 'mountain', ['hydro', 'wind'], 'Mountain reservoirs turned into a continental battery: pump uphill when it is windy, generate when it isn’t.', 0.08, 0.33),
  megaSite('mega-siberia', 'Yenisei Power', 'stp', 60.0, 92.0, [42.6, 132.0], 'boreal', ['hydro', 'nuclear', 'wind'], 'The Yenisei carries more water than almost any river on Earth — and the taiga has room for reactors.', 0.1, 0.28),
  megaSite('mega-sahara', 'Sahara Solar Belt', 'mena', 27.5, 8.5, [37.2, 8.0], 'desert', ['solar'], 'A belt of panels and storage across the deep Sahara, wired north to Europe and south to the Sahel.', 0.32, 0.25),
  megaSite('mega-kalahari', 'Kalahari Sun', 'ssa', -22.5, 22.5, [-23.0, 13.9], 'desert', ['solar'], 'Red sand, clear skies and a continent that needs the power more than anywhere.', 0.31, 0.22),
  megaSite('mega-deccan', 'Deccan Solar Arc', 'sas', 18.0, 76.5, [18.9, 72.3], 'plains', ['solar', 'wind', 'nuclear'], 'A crescent of solar parks across the Deccan plateau, feeding a billion people’s evening peak.', 0.25, 0.3),
  megaSite('mega-gobi', 'Gobi Wind & Storage', 'eam', 43.0, 95.5, [38.9, 118.2], 'desert', ['wind', 'solar'], 'Wind and sun at the edge of the Gobi, with storage halls the size of towns.', 0.28, 0.38),
  megaSite('mega-pacific', 'Pacific Reactor Fleet', 'fab', 35.8, 136.2, [36.0, 135.6], 'coast', ['nuclear', 'wind'], 'Reactor parks along the Sea of Japan coast, built to a single certified design.', 0.13, 0.3),
  megaSite('mega-outback', 'Outback Sun', 'seo', -26.5, 124.5, [-32.0, 115.3], 'desert', ['solar', 'wind'], 'The Great Victoria Desert: sun, space and a cable’s length from Asia.', 0.31, 0.3),
  // ── Act III: launch-complex candidates (Kip) ────────────────────────────────────────────
  launchSite('launch-guiana', 'Guiana Space Coast', 'eur', 5.2, -52.8, [5.6, -52.3], 'tropical', 'Five degrees from the equator, where the planet’s spin gives every rocket a free push.'),
  launchSite('launch-gulf', 'Gulf Coast Spaceport', 'atl', 26.6, -97.6, [27.0, -96.6], 'coast', 'Tidal flats, a heavy-lift factory next door and the whole Gulf of Mexico as a range.'),
  launchSite('launch-malindi', 'Malindi Equatorial Pad', 'ssa', -3.0, 39.9, [-3.3, 40.6], 'savanna', 'An equatorial coast with an old range offshore and a young workforce onshore.'),
  launchSite('launch-steppe', 'Steppe Cosmodrome', 'stp', 45.9, 63.3, [44.7, 37.9], 'plains', 'The oldest spaceport on Earth: pads, rails and seventy years of habit.'),
  launchSite('launch-arctic', 'Arctic Polar Pad', 'nor', 69.2, 17.0, [69.6, 16.5], 'boreal', 'A fjord-side pad for polar orbits, where satellites see every inch of the Earth.'),
];

export const SITE_BY_ID: Record<string, SiteDef> = Object.fromEntries(SITES.map((s) => [s.id, s]));
export const BUILD_SITES = SITES.filter((s) => s.kind === 'build');
export const LANDING_SITES = SITES.filter((s) => s.kind === 'landing');
export const MINE_SITES = SITES.filter((s) => s.kind === 'mine');
export const MEGA_SITES = SITES.filter((s) => s.kind === 'mega');
export const LAUNCH_SITES = SITES.filter((s) => s.kind === 'launch');

/** Whether a site exists yet in this game (Act II and III sites appear as the acts unfold). */
export function siteOpen(site: SiteDef, act: number, phase: number, cphase = 0): boolean {
  if ((site.act ?? 1) > act) return false;
  if (site.phase && act === 2 && phase < site.phase) return false;
  if (site.cphase && act >= 3 && cphase < site.cphase) return false;
  return true;
}
export const HOME_SITES = SITES.filter((s) => s.home);

export function siteDef(id: string): SiteDef {
  const s = SITE_BY_ID[id];
  if (!s) throw new Error(`unknown site ${id}`);
  return s;
}

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR;
  const dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function siteDistanceKm(a: string, b: string): number {
  const A = siteDef(a);
  const B = siteDef(b);
  return haversineKm(A.lat, A.lon, B.lat, B.lon);
}
