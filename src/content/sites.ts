import type { RegionId } from './mapcodes';
import type { SupplierId } from '../sim/types';

export type Backdrop = 'desert' | 'coast' | 'temperate' | 'boreal' | 'plains' | 'tropical' | 'mountain' | 'volcanic' | 'savanna';

export interface SiteDef {
  id: string;
  name: string;
  region: RegionId;
  lat: number;
  lon: number;
  kind: 'build' | 'supplier' | 'cloud';
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
}

const build = (d: Omit<SiteDef, 'kind'>): SiteDef => ({ ...d, kind: 'build' });

export const SITES: SiteDef[] = [
  // ── Pacific Coast ───────────────────────────────────────────────────────────────────────
  build({ id: 'bay-area', name: 'Bay Area', region: 'pac', lat: 37.4, lon: -122.0, blurb: 'Where the talent is. Tiny lots, expensive power, the San Andreas next door.', backdrop: 'coast', port: [37.6, -123.1], solarCF: 0.21, windCF: 0.24, water: 0.5, climateC: 15, talent: 2.0, gridHeadroom: 25, priceMult: 1.3, slots: 3, home: true, demand: 1.15 }),
  build({ id: 'columbia-gorge', name: 'Columbia Gorge', region: 'pac', lat: 45.6, lon: -121.2, blurb: 'Dam-fed hydro, river water and wind funnelling down the gorge.', backdrop: 'mountain', port: [46.2, -124.6], solarCF: 0.17, windCF: 0.34, water: 0.95, climateC: 12, talent: 0.8, gridHeadroom: 80, priceMult: 0.55, slots: 5 }),
  build({ id: 'mojave', name: 'Mojave Flats', region: 'pac', lat: 35.0, lon: -117.0, blurb: 'Blazing sun and cheap land. Water is the problem.', backdrop: 'desert', port: [33.4, -118.8], solarCF: 0.29, windCF: 0.3, water: 0.15, climateC: 22, talent: 0.6, gridHeadroom: 50, priceMult: 0.9, slots: 6 }),
  // ── Atlantic & Heartland ────────────────────────────────────────────────────────────────
  build({ id: 'n-virginia', name: 'Northern Virginia', region: 'atl', lat: 39.0, lon: -77.5, blurb: 'The internet’s busiest data center alley. Fibre everywhere, grid queue forever.', backdrop: 'temperate', port: [36.9, -75.6], solarCF: 0.18, windCF: 0.2, water: 0.65, climateC: 14, talent: 1.25, gridHeadroom: 30, priceMult: 1.1, slots: 4, home: true, demand: 1.3 }),
  build({ id: 'west-texas', name: 'West Texas Plains', region: 'atl', lat: 32.0, lon: -102.0, blurb: 'Wind, sun, shale gas and a permissive grid of its own.', backdrop: 'plains', port: [28.8, -94.6], solarCF: 0.26, windCF: 0.42, water: 0.25, climateC: 19, talent: 0.6, gridHeadroom: 100, priceMult: 0.8, slots: 6 }),
  build({ id: 'appalachia', name: 'Appalachian Gas Belt', region: 'atl', lat: 39.6, lon: -80.2, blurb: 'Gas wells, river water and towns that want the jobs.', backdrop: 'temperate', port: [36.9, -75.6], solarCF: 0.16, windCF: 0.27, water: 0.8, climateC: 11, talent: 0.7, gridHeadroom: 70, priceMult: 0.85, slots: 5 }),
  // ── Latin America ───────────────────────────────────────────────────────────────────────
  build({ id: 'atacama', name: 'Atacama', region: 'lat', lat: -23.5, lon: -69.0, blurb: 'The best solar resource on Earth, sitting on top of the lithium.', backdrop: 'desert', port: [-23.6, -70.8], solarCF: 0.33, windCF: 0.3, water: 0.05, climateC: 17, talent: 0.5, gridHeadroom: 40, priceMult: 0.9, slots: 6 }),
  build({ id: 'parana', name: 'Paraná Basin', region: 'lat', lat: -25.4, lon: -54.6, blurb: 'In the shadow of one of the world’s largest hydro dams.', backdrop: 'tropical', port: [-24.6, -45.8], solarCF: 0.19, windCF: 0.18, water: 1.0, climateC: 21, talent: 0.6, gridHeadroom: 120, priceMult: 0.55, slots: 5 }),
  build({ id: 'queretaro', name: 'Querétaro', region: 'lat', lat: 20.6, lon: -100.4, blurb: 'Nearshoring boomtown on a high plateau, a day’s drive from the border.', backdrop: 'plains', port: [18.6, -104.8], solarCF: 0.24, windCF: 0.2, water: 0.3, climateC: 19, talent: 0.8, gridHeadroom: 50, priceMult: 0.95, slots: 5, demand: 0.95 }),
  // ── Europe ──────────────────────────────────────────────────────────────────────────────
  build({ id: 'london', name: 'London', region: 'eur', lat: 51.5, lon: -0.1, blurb: 'World-class labs and capital. The grid can barely spare a kettle.', backdrop: 'temperate', port: [51.0, 1.9], solarCF: 0.11, windCF: 0.3, water: 0.8, climateC: 11, talent: 1.7, gridHeadroom: 10, priceMult: 1.15, slots: 3, home: true, demand: 1.2 }),
  build({ id: 'iberia', name: 'Iberian Sun', region: 'eur', lat: 38.0, lon: -5.5, blurb: 'Europe’s sunbelt: cheap solar, hot summers, thirsty rivers.', backdrop: 'plains', port: [36.4, -7.2], solarCF: 0.24, windCF: 0.28, water: 0.3, climateC: 18, talent: 0.8, gridHeadroom: 60, priceMult: 0.7, slots: 6 }),
  build({ id: 'rhone', name: 'Rhône Valley', region: 'eur', lat: 44.5, lon: 4.7, blurb: 'Reactors along the river: clean, steady, and expensive to connect.', backdrop: 'temperate', port: [42.9, 4.8], solarCF: 0.17, windCF: 0.22, water: 0.85, climateC: 13, talent: 0.9, gridHeadroom: 50, priceMult: 0.75, slots: 4 }),
  // ── Nordics & Arctic ────────────────────────────────────────────────────────────────────
  build({ id: 'lulea', name: 'Luleå', region: 'nor', lat: 65.6, lon: 22.1, blurb: 'Hydro power and air so cold the servers cool themselves.', backdrop: 'boreal', port: [57.6, 11.3], solarCF: 0.09, windCF: 0.3, water: 1.0, climateC: 2, talent: 0.7, gridHeadroom: 100, priceMult: 0.75, slots: 5 }),
  build({ id: 'reykjanes', name: 'Reykjanes', region: 'nor', lat: 63.9, lon: -22.4, blurb: 'Geothermal steam on a volcanic peninsula, linked by subsea cable.', backdrop: 'volcanic', port: [63.5, -23.2], solarCF: 0.08, windCF: 0.4, water: 1.0, climateC: 5, talent: 0.6, gridHeadroom: 40, priceMult: 0.95, slots: 4, demand: 0.75 }),
  build({ id: 'fjords', name: 'Western Fjords', region: 'nor', lat: 61.2, lon: 7.0, blurb: 'Cheap hydro tucked into fjords, cold seawater for cooling.', backdrop: 'mountain', port: [60.5, 4.2], solarCF: 0.09, windCF: 0.33, water: 1.0, climateC: 7, talent: 0.6, gridHeadroom: 70, priceMult: 0.85, slots: 4 }),
  // ── Eurasian Steppe ─────────────────────────────────────────────────────────────────────
  build({ id: 'kazakh-steppe', name: 'Kazakh Steppe', region: 'stp', lat: 50.3, lon: 72.0, blurb: 'Wind that never stops and land to the horizon.', backdrop: 'plains', port: [44.7, 37.9], solarCF: 0.18, windCF: 0.4, water: 0.3, climateC: 4, talent: 0.4, gridHeadroom: 120, priceMult: 0.9, slots: 6 }),
  build({ id: 'bratsk', name: 'Siberian Hydro', region: 'stp', lat: 56.1, lon: 101.6, blurb: 'A colossal dam, cheap power and a very long way from customers.', backdrop: 'boreal', port: [42.6, 132.0], solarCF: 0.12, windCF: 0.2, water: 1.0, climateC: -2, talent: 0.4, gridHeadroom: 150, priceMult: 0.5, slots: 5, demand: 0.6 }),
  build({ id: 'caspian', name: 'Caspian Coast', region: 'stp', lat: 40.4, lon: 49.9, blurb: 'Old oil country with gas to spare and a stiff sea breeze.', backdrop: 'coast', port: [41.8, 41.3], solarCF: 0.2, windCF: 0.35, water: 0.4, climateC: 15, talent: 0.6, gridHeadroom: 60, priceMult: 0.8, slots: 4 }),
  // ── Gulf & Sahara ───────────────────────────────────────────────────────────────────────
  build({ id: 'gulf-coast', name: 'Gulf Coast', region: 'mena', lat: 24.4, lon: 54.6, blurb: 'Sovereign wealth, sun all year and desalinated water. Air conditioning required.', backdrop: 'desert', port: [24.9, 54.0], solarCF: 0.26, windCF: 0.15, water: 0.1, climateC: 33, talent: 0.8, gridHeadroom: 200, priceMult: 0.8, slots: 6 }),
  build({ id: 'ouarzazate', name: 'Sahara Edge', region: 'mena', lat: 30.9, lon: -6.9, blurb: 'Solar-thermal towers at the gateway to the Sahara.', backdrop: 'desert', port: [33.8, -8.0], solarCF: 0.3, windCF: 0.25, water: 0.15, climateC: 21, talent: 0.5, gridHeadroom: 40, priceMult: 0.85, slots: 5 }),
  build({ id: 'red-sea', name: 'Red Sea Coast', region: 'mena', lat: 27.5, lon: 35.6, blurb: 'Purpose-built giga-projects with sun and wind in equal measure.', backdrop: 'desert', port: [27.3, 35.0], solarCF: 0.28, windCF: 0.38, water: 0.1, climateC: 28, talent: 0.5, gridHeadroom: 80, priceMult: 0.75, slots: 6 }),
  // ── Sub-Saharan Africa ──────────────────────────────────────────────────────────────────
  build({ id: 'copperbelt', name: 'Copperbelt', region: 'ssa', lat: -12.8, lon: 28.2, blurb: 'Copper and cobalt country, fed by big hydro on the Zambezi.', backdrop: 'savanna', port: [-6.8, 39.6], solarCF: 0.22, windCF: 0.15, water: 0.6, climateC: 21, talent: 0.4, gridHeadroom: 25, priceMult: 0.7, slots: 5 }),
  build({ id: 'kenyan-rift', name: 'Kenyan Rift', region: 'ssa', lat: -0.9, lon: 36.3, blurb: 'Geothermal steam in the Great Rift Valley. Clean, steady, cool highlands.', backdrop: 'savanna', port: [-4.3, 40.0], solarCF: 0.24, windCF: 0.3, water: 0.5, climateC: 18, talent: 0.7, gridHeadroom: 30, priceMult: 0.85, slots: 4 }),
  build({ id: 'namib', name: 'Namib Coast', region: 'ssa', lat: -22.9, lon: 14.8, blurb: 'Fog-desert coast with world-class sun and wind.', backdrop: 'desert', port: [-23.0, 13.9], solarCF: 0.3, windCF: 0.4, water: 0.05, climateC: 18, talent: 0.3, gridHeadroom: 20, priceMult: 0.95, slots: 6 }),
  // ── South Asia ──────────────────────────────────────────────────────────────────────────
  build({ id: 'bengaluru', name: 'Bengaluru', region: 'sas', lat: 12.97, lon: 77.6, blurb: 'India’s tech capital on a cool plateau. Brilliant engineers, thirsty city.', backdrop: 'tropical', port: [13.1, 80.6], solarCF: 0.21, windCF: 0.25, water: 0.3, climateC: 24, talent: 1.5, gridHeadroom: 35, priceMult: 0.9, slots: 3, home: true }),
  build({ id: 'mumbai', name: 'Mumbai', region: 'sas', lat: 19.1, lon: 72.9, blurb: 'Subsea cables land here. So do monsoons.', backdrop: 'coast', port: [18.9, 72.3], solarCF: 0.19, windCF: 0.2, water: 0.5, climateC: 28, talent: 1.0, gridHeadroom: 40, priceMult: 1.0, slots: 4, demand: 1.3 }),
  build({ id: 'thar', name: 'Thar Desert', region: 'sas', lat: 27.0, lon: 71.0, blurb: 'One of the world’s largest solar parks, in the sands of Rajasthan.', backdrop: 'desert', port: [22.6, 69.6], solarCF: 0.26, windCF: 0.3, water: 0.1, climateC: 28, talent: 0.4, gridHeadroom: 70, priceMult: 0.8, slots: 6 }),
  // ── Mainland East Asia ──────────────────────────────────────────────────────────────────
  build({ id: 'inner-mongolia', name: 'Inner Mongolia', region: 'eam', lat: 41.0, lon: 111.7, blurb: 'Coal country turning to wind and sun, with power to spare.', backdrop: 'plains', port: [38.9, 118.2], solarCF: 0.22, windCF: 0.4, water: 0.3, climateC: 6, talent: 0.5, gridHeadroom: 200, priceMult: 0.65, slots: 6 }),
  build({ id: 'guizhou', name: 'Guizhou Karst', region: 'eam', lat: 26.6, lon: 106.7, blurb: 'Cool mountains, cheap hydro and caves big enough to hide a data center.', backdrop: 'mountain', port: [21.4, 109.1], solarCF: 0.14, windCF: 0.2, water: 0.9, climateC: 15, talent: 0.6, gridHeadroom: 100, priceMult: 0.75, slots: 5 }),
  build({ id: 'pearl-delta', name: 'Pearl River Delta', region: 'eam', lat: 22.7, lon: 113.9, blurb: 'The world’s workshop: suppliers on every street, typhoons every summer.', backdrop: 'coast', port: [21.9, 114.2], solarCF: 0.16, windCF: 0.22, water: 0.8, climateC: 23, talent: 1.2, gridHeadroom: 60, priceMult: 1.0, slots: 4, demand: 1.2 }),
  // ── Pacific Fab Belt ────────────────────────────────────────────────────────────────────
  build({ id: 'kyushu', name: 'Kyushu', region: 'fab', lat: 32.9, lon: 130.7, blurb: 'Volcanic island turned chip hub, with geothermal under its feet.', backdrop: 'volcanic', port: [32.6, 129.6], solarCF: 0.16, windCF: 0.2, water: 0.8, climateC: 17, talent: 0.9, gridHeadroom: 40, priceMult: 0.95, slots: 4 }),
  build({ id: 'chiba', name: 'Tokyo Bay', region: 'fab', lat: 35.6, lon: 140.1, blurb: 'Japan’s data center core: huge demand, quakes, little room.', backdrop: 'coast', port: [34.6, 140.4], solarCF: 0.14, windCF: 0.22, water: 0.7, climateC: 16, talent: 1.3, gridHeadroom: 30, priceMult: 1.15, slots: 3, demand: 1.3 }),
  build({ id: 'hokkaido', name: 'Hokkaido', region: 'fab', lat: 43.1, lon: 141.6, blurb: 'Cold, windy and roomy — Japan’s answer to the Nordics.', backdrop: 'boreal', port: [42.2, 141.9], solarCF: 0.13, windCF: 0.34, water: 0.9, climateC: 8, talent: 0.6, gridHeadroom: 60, priceMult: 0.9, slots: 5 }),
  // ── SE Asia & Oceania ───────────────────────────────────────────────────────────────────
  build({ id: 'johor', name: 'Johor', region: 'seo', lat: 1.6, lon: 103.6, blurb: 'Across the causeway from Singapore. Booming, humid, and short on water.', backdrop: 'tropical', port: [1.1, 104.4], solarCF: 0.17, windCF: 0.1, water: 0.4, climateC: 28, talent: 0.9, gridHeadroom: 40, priceMult: 1.0, slots: 4, demand: 1.2 }),
  build({ id: 'pilbara', name: 'Pilbara', region: 'seo', lat: -21.5, lon: 118.5, blurb: 'Red-earth outback with sun, wind and iron ore. Isolated grid.', backdrop: 'desert', port: [-19.8, 118.4], solarCF: 0.3, windCF: 0.38, water: 0.1, climateC: 28, talent: 0.3, gridHeadroom: 15, priceMult: 1.0, slots: 6 }),
  build({ id: 'hunter-valley', name: 'Hunter Valley', region: 'seo', lat: -32.5, lon: 151.0, blurb: 'Retiring coal plants leave grid connections and skilled crews behind.', backdrop: 'temperate', port: [-33.0, 152.4], solarCF: 0.22, windCF: 0.3, water: 0.5, climateC: 18, talent: 0.7, gridHeadroom: 60, priceMult: 0.9, slots: 5 }),

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
];

export const SITE_BY_ID: Record<string, SiteDef> = Object.fromEntries(SITES.map((s) => [s.id, s]));
export const BUILD_SITES = SITES.filter((s) => s.kind === 'build');
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
