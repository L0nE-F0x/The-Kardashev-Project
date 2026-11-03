// Generates the pixel world map rasters from Natural Earth data.
//
//   node tools/gen-worldmap.mjs [--preview <dir>]
//
// Inputs (public domain):
//   node_modules/world-atlas/countries-50m.json          country polygons (TopoJSON)
//   tools/raw/ne_50m_geography_regions_polys.geojson     deserts, ranges, basins, plains…
//   tools/raw/ne_50m_lakes.geojson                       lakes
//   tools/raw/ne_50m_rivers_lake_centerlines.geojson     rivers
//
// Output: src/content/generated/worldmap.bin — two LODs (0.5°/px and 0.25°/px), each a
// run-length-encoded byte grid where byte = biome | (region << 4).

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as topo from 'topojson-client';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'tools/raw');
const OUT = path.join(ROOT, 'src/content/generated/worldmap.bin');
const previewIdx = process.argv.indexOf('--preview');
const PREVIEW_DIR = previewIdx > 0 ? process.argv[previewIdx + 1] : null;

// ── Region + biome ids (keep in sync with src/content/mapcodes.ts) ──────────────────────────
const R = { WATER: 0, PAC: 1, ATL: 2, LAT: 3, EUR: 4, NOR: 5, STP: 6, MENA: 7, SSA: 8, SAS: 9, EAM: 10, FAB: 11, SEO: 12, ANT: 13 };
const B = {
  OCEAN: 0, ICE: 1, TUNDRA: 2, BOREAL: 3, TEMPERATE: 4, GRASS: 5, DESERT: 6, SAVANNA: 7, RAINFOREST: 8,
  MOUNTAIN: 9, ALPINE: 10, PLATEAU: 11, WETLAND: 12, FARMLAND: 13, LAKE: 14, RIVER: 15,
};

const REGION_OF = {};
const assign = (region, names) => names.split('|').forEach((n) => (REGION_OF[n.trim()] = region));
assign(R.LAT, 'Mexico|Guatemala|Belize|Honduras|El Salvador|Nicaragua|Costa Rica|Panama|Cuba|Haiti|Dominican Rep.|Jamaica|Bahamas|Puerto Rico|Trinidad and Tobago|Barbados|Grenada|St. Vin. and Gren.|Saint Lucia|Dominica|Antigua and Barb.|St. Kitts and Nevis|Montserrat|Anguilla|British Virgin Is.|U.S. Virgin Is.|Cayman Is.|Turks and Caicos Is.|Aruba|Curaçao|Sint Maarten|St-Martin|St-Barthélemy|Colombia|Venezuela|Guyana|Suriname|Ecuador|Peru|Brazil|Bolivia|Paraguay|Chile|Argentina|Uruguay|Falkland Is.|S. Geo. and the Is.');
assign(R.ATL, 'St. Pierre and Miquelon|Bermuda');
assign(R.EUR, 'United Kingdom|Ireland|Isle of Man|Guernsey|Jersey|France|Monaco|Andorra|Spain|Portugal|Germany|Netherlands|Belgium|Luxembourg|Switzerland|Liechtenstein|Austria|Italy|San Marino|Vatican|Malta|Poland|Czechia|Slovakia|Hungary|Slovenia|Croatia|Bosnia and Herz.|Serbia|Montenegro|Kosovo|Albania|Macedonia|Greece|Bulgaria|Romania|Moldova|Estonia|Latvia|Lithuania|Cyprus|N. Cyprus|Turkey');
assign(R.NOR, 'Norway|Sweden|Finland|Åland|Denmark|Faeroe Is.|Iceland|Greenland');
assign(R.STP, 'Russia|Ukraine|Belarus|Georgia|Armenia|Azerbaijan|Kazakhstan|Uzbekistan|Turkmenistan|Kyrgyzstan|Tajikistan|Mongolia');
assign(R.MENA, 'Morocco|W. Sahara|Algeria|Tunisia|Libya|Egypt|Sudan|Mauritania|Saudi Arabia|Yemen|Oman|United Arab Emirates|Qatar|Bahrain|Kuwait|Iraq|Iran|Syria|Jordan|Lebanon|Israel|Palestine');
assign(R.SSA, "Mali|Niger|Chad|Senegal|Gambia|Guinea-Bissau|Guinea|Sierra Leone|Liberia|Côte d'Ivoire|Ghana|Togo|Benin|Burkina Faso|Nigeria|Cameroon|Central African Rep.|S. Sudan|Eritrea|Djibouti|Ethiopia|Somalia|Somaliland|Kenya|Uganda|Rwanda|Burundi|Tanzania|Dem. Rep. Congo|Congo|Gabon|Eq. Guinea|São Tomé and Principe|Angola|Zambia|Malawi|Mozambique|Zimbabwe|Botswana|Namibia|South Africa|Lesotho|eSwatini|Madagascar|Comoros|Mauritius|Seychelles|Cabo Verde|Saint Helena");
assign(R.SAS, 'India|Pakistan|Bangladesh|Sri Lanka|Nepal|Bhutan|Afghanistan|Maldives|Siachen Glacier|Br. Indian Ocean Ter.');
assign(R.EAM, 'China|Hong Kong|Macao|North Korea');
assign(R.FAB, 'Japan|South Korea|Taiwan');
assign(R.SEO, 'Vietnam|Laos|Cambodia|Thailand|Myanmar|Malaysia|Singapore|Indonesia|Philippines|Brunei|Timor-Leste|Papua New Guinea|Australia|New Zealand|Solomon Is.|Vanuatu|New Caledonia|Fiji|Samoa|American Samoa|Tonga|Kiribati|Micronesia|Marshall Is.|Palau|Guam|N. Mariana Is.|Nauru|Niue|Cook Is.|Fr. Polynesia|Pitcairn Is.|Wallis and Futuna Is.|Norfolk Island|Ashmore and Cartier Is.|Indian Ocean Ter.');
assign(R.ANT, 'Antarctica|Fr. S. Antarctic Lands|Heard I. and McDonald Is.');

/** North America is split between Pacific Coast and Atlantic & Heartland by longitude. */
function northAmericaRegion(lon, lat) {
  if (lon < -150 && lat < 30) return R.PAC; // Hawaii
  const boundary = lat >= 49 ? -120 : -109.05; // BC/Alberta in Canada; AZ/NM–UT/CO line in the US
  return lon < boundary ? R.PAC : R.ATL;
}

// ── Named geography → biome ──────────────────────────────────────────────────────────────────
const ALPINE_RANGES = new Set(['HIMALAYAS', 'KARAKORAM RA.', 'PAMIRS', 'HINDU KUSH', 'KUNLUN MOUNTAINS', 'TIAN SHAN', 'ANDES', 'ALPS', 'CAUCASUS MTS.', 'ALASKA RANGE', 'SOUTHERN ALPS', 'COAST MOUNTAINS', 'CASCADE RANGE', 'ROCKY MOUNTAINS', 'SIERRA NEVADA', 'ELBURZ MTS.', 'ALTAY MOUNTAINS', 'CHUGACH MTS.', 'CORDILLERA OCCIDENTAL', 'CORDILLERA  REAL', 'CORDILLERA ORIENTAL', 'CORD. CENTRAL', 'CORD. OCCIDENTAL', 'Lesser Caucasus', 'PYRENEES', 'KJØLEN MOUNTAINS']);
const NAMED_BIOME = {
  // grassland / steppe
  'KAZAKH STEPPE': B.GRASS, 'GREAT PLAINS': B.GRASS, PAMPAS: B.GRASS, 'MONGOLIAN PLATEAU': B.GRASS, 'KAZAKH UPLAND': B.GRASS,
  PATAGONIA: B.GRASS, 'Edwards Plateau': B.GRASS, 'CASPIAN DEPRESSION': B.GRASS, 'GREAT ARTESIAN BASIN': B.GRASS, 'Murray-Darling Basin': B.FARMLAND, 'MURRAY-DARLING BASIN': B.FARMLAND, 'Ozark Plateau': B.TEMPERATE,
  // deserts
  'COLORADO PLATEAU': B.DESERT, 'GREAT BASIN': B.DESERT, 'Ustyurt Plateau': B.DESERT, 'TURAN LOWLAND': B.DESERT, 'Hexi Corridor': B.DESERT,
  'Junggar Basin': B.DESERT, 'TARIM BASIN': B.DESERT, 'Qaidam Basin': B.DESERT, BALUCHISTAN: B.DESERT, Ogaden: B.DESERT, 'NULLARBOR PLAIN': B.DESERT,
  'WESTERN PLATEAU': B.DESERT,
  // rainforest
  'AMAZON BASIN': B.RAINFOREST, 'CONGO BASIN': B.RAINFOREST, SELVAS: B.RAINFOREST, 'GUIANA SHIELD': B.RAINFOREST, 'GUIANA HIGHLANDS': B.RAINFOREST, YUNGAS: B.RAINFOREST,
  // savanna
  SAHEL: B.SAVANNA, LLANOS: B.SAVANNA, 'GRAN CHACO': B.SAVANNA, 'CHACO BOREAL': B.SAVANNA, 'CHACO AUSTRAL': B.SAVANNA, CAATINGAS: B.SAVANNA,
  'PLANALTO DO MATO GROSSO': B.SAVANNA, 'PLANALTO CENTRAL': B.SAVANNA, 'BRAZILIAN HIGHLANDS': B.SAVANNA, 'Campos Sertão': B.SAVANNA, 'KATANGA PLATEAU': B.SAVANNA,
  'Adamawa Plateau': B.SAVANNA, 'Huíla Plateau': B.SAVANNA, 'Bié Plateau': B.SAVANNA, 'Iwembere Steppe': B.SAVANNA, 'DECCAN PLATEAU': B.SAVANNA, 'KIMBERLEY PLATEAU': B.SAVANNA,
  // farmland
  'NORTH CHINA PLAIN': B.FARMLAND, 'NORTHERN EUROPEAN PLAIN': B.FARMLAND, 'MANCHURIAN PLAIN': B.FARMLAND, 'GANGES PLAIN': B.FARMLAND, 'CENTRAL LOWLAND': B.FARMLAND,
  'PONTIC STEPPE': B.FARMLAND, 'CENTRAL RUSSIAN UPLAND': B.FARMLAND, Mesopotamia: B.FARMLAND, PUNJAB: B.FARMLAND, 'Loess Plateau': B.FARMLAND, 'SICHUAN BASIN': B.FARMLAND,
  'Fergana Valley': B.FARMLAND, 'Nile Delta': B.FARMLAND, 'Central Valley': B.FARMLAND, 'Valle Longitudinal': B.FARMLAND, 'Entre Rios': B.FARMLAND, JUTLAND: B.FARMLAND,
  Riverina: B.FARMLAND, 'Khorat Plat.': B.FARMLAND,
  // tundra / boreal
  'Bol’shezemel’skaya Tundra': B.TUNDRA, 'BARREN GROUNDS': B.TUNDRA, 'NORTH SLOPE': B.TUNDRA, 'NORTH SIBERIAN LOWLAND': B.TUNDRA, 'KOLYMA LOWLAND': B.TUNDRA,
  'PUTORANA PLATEAU': B.TUNDRA, 'WESTERN SIBERIAN PLAIN': B.BOREAL, 'CENTRAL SIBERIAN PLATEAU': B.BOREAL, 'VYCHEGDA LOWLAND': B.BOREAL, 'Aldan Upland': B.BOREAL,
  'STANOVOY UPLAND': B.BOREAL, 'YUKON PLATEAU': B.BOREAL, 'FRASER PLATEAU': B.BOREAL, 'LES LAURENTIDES': B.BOREAL, 'Superior Upland': B.BOREAL, 'Yukon Flats': B.BOREAL,
  // high plateau
  'PLATEAU OF TIBET': B.PLATEAU, ALTIPLANO: B.PLATEAU,
  // wetlands
  PANTANAL: B.WETLAND, SUDD: B.WETLAND,
};
// NE classifies these as deserts, but they read better as something else.
const DESERT_EXCEPTIONS = { PUNJAB: B.FARMLAND, CAATINGAS: B.SAVANNA };

// ── Load data (downloads the Natural Earth layers into tools/raw/ on first run) ─────────────
const NE_BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
for (const name of ['ne_50m_geography_regions_polys', 'ne_50m_lakes', 'ne_50m_rivers_lake_centerlines']) {
  const file = path.join(RAW, `${name}.geojson`);
  if (fs.existsSync(file)) continue;
  console.log(`downloading ${name}…`);
  const res = await fetch(`${NE_BASE}${name}.geojson`);
  if (!res.ok) throw new Error(`download failed: ${name} (${res.status})`);
  fs.mkdirSync(RAW, { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const countriesTopo = readJson(path.join(ROOT, 'node_modules/world-atlas/countries-50m.json'));
const countries = topo.feature(countriesTopo, countriesTopo.objects.countries).features;
const geoRegions = readJson(path.join(RAW, 'ne_50m_geography_regions_polys.geojson')).features;
const lakes = readJson(path.join(RAW, 'ne_50m_lakes.geojson')).features;
const rivers = readJson(path.join(RAW, 'ne_50m_rivers_lake_centerlines.geojson')).features;

const missing = countries.map((f) => f.properties.name).filter((n) => !(n in REGION_OF) && n !== 'United States of America' && n !== 'Canada');
if (missing.length) {
  console.error('Countries without a region:', missing);
  process.exit(1);
}

// ── Polygon scanline rasteriser (lon/lat space, wraps across the antimeridian) ──────────────
function polygonsOf(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

/** Make ring longitudes continuous; close pole-encircling rings through the pole. */
function unwrapRing(ring) {
  const out = [[ring[0][0], ring[0][1]]];
  let offset = 0;
  for (let i = 1; i < ring.length; i++) {
    const prev = ring[i - 1][0];
    const cur = ring[i][0];
    if (cur - prev > 180) offset -= 360;
    else if (prev - cur > 180) offset += 360;
    out.push([cur + offset, ring[i][1]]);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (Math.abs(last[0] - first[0]) > 180) {
    const meanLat = out.reduce((s, p) => s + p[1], 0) / out.length;
    const pole = meanLat < 0 ? -90 : 90;
    out.push([last[0], pole], [first[0], pole]);
  }
  return out;
}

function makeGrid(res) {
  const W = Math.round(360 / res);
  const H = Math.round(180 / res);
  return { res, W, H, region: new Uint8Array(W * H), biome: new Uint8Array(W * H), tag: new Uint8Array(W * H) };
}

/** Calls fill(index, lon, lat) for every pixel centre inside the polygon (even-odd rule). */
function rasterPolygon(grid, rings, fill) {
  const { res, W, H } = grid;
  const urings = rings.map(unwrapRing);
  let minLat = 90;
  let maxLat = -90;
  for (const r of urings) for (const [, la] of r) {
    if (la < minLat) minLat = la;
    if (la > maxLat) maxLat = la;
  }
  const j0 = Math.max(0, Math.floor((90 - maxLat) / res - 0.5));
  const j1 = Math.min(H - 1, Math.ceil((90 - minLat) / res - 0.5));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const lat = 90 - (j + 0.5) * res;
    xs.length = 0;
    for (const r of urings) {
      for (let i = 0, n = r.length; i < n; i++) {
        const a = r[i];
        const b = r[(i + 1) % n];
        if ((a[1] > lat) !== (b[1] > lat)) xs.push(a[0] + ((lat - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.ceil((xs[k] + 180) / res - 0.5);
      const i1 = Math.ceil((xs[k + 1] + 180) / res - 0.5) - 1;
      for (let i = i0; i <= i1; i++) {
        const wi = ((i % W) + W) % W;
        const lon = -180 + (wi + 0.5) * res;
        fill(j * W + wi, lon, lat);
      }
    }
  }
}

function rasterLine(grid, coords, fill) {
  const { res, W } = grid;
  const toPx = ([lon, lat]) => [(lon + 180) / res - 0.5, (90 - lat) / res - 0.5];
  for (let s = 1; s < coords.length; s++) {
    let [x0, y0] = toPx(coords[s - 1]);
    let [x1, y1] = toPx(coords[s]);
    if (Math.abs(x1 - x0) > W / 2) continue; // skip antimeridian jumps
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      const wi = ((x0 % W) + W) % W;
      if (y0 >= 0 && y0 < grid.H) fill(y0 * W + wi);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
}

// ── Deterministic value noise for organic biome edges ────────────────────────────────────────
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}
const fbm = (x, y) => (vnoise(x, y) * 0.6 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.1);

// ── Build one LOD ────────────────────────────────────────────────────────────────────────────
function buildLod(res) {
  const grid = makeGrid(res);
  const { W, H, region, biome, tag } = grid;
  const countryName = new Array(W * H);

  // 1. Countries → land + region
  for (const f of countries) {
    const name = f.properties.name;
    const isNA = name === 'United States of America' || name === 'Canada';
    for (const poly of polygonsOf(f.geometry)) {
      rasterPolygon(grid, poly, (idx, lon, lat) => {
        region[idx] = isNA ? northAmericaRegion(lon, lat) : REGION_OF[name];
        countryName[idx] = name;
        biome[idx] = 255; // unclassified land
      });
    }
  }

  // 2. Named geography (low → high priority)
  const tier = (cls) => {
    if (cls === 'Range/mtn') return 4;
    if (cls === 'Desert') return 3;
    if (cls === 'Plateau' || cls === 'Tundra') return 2;
    return 1;
  };
  const sorted = [...geoRegions].sort((a, b) => tier(a.properties.FEATURECLA) - tier(b.properties.FEATURECLA));
  for (const f of sorted) {
    const cls = f.properties.FEATURECLA;
    const name = f.properties.NAME;
    let target = null;
    if (cls === 'Range/mtn') target = ALPINE_RANGES.has(name) ? B.ALPINE : B.MOUNTAIN;
    else if (cls === 'Desert') target = DESERT_EXCEPTIONS[name] ?? B.DESERT;
    else if (cls === 'Delta') target = name === 'Nile Delta' ? B.FARMLAND : B.WETLAND;
    else if (cls === 'Tundra') target = name === 'CANADIAN SHIELD' ? 'shield' : B.TUNDRA;
    else if (name in NAMED_BIOME) target = NAMED_BIOME[name];
    if (target === null) continue;
    for (const poly of polygonsOf(f.geometry)) {
      rasterPolygon(grid, poly, (idx, lon, lat) => {
        if (region[idx] === R.WATER) return;
        if (region[idx] === R.ANT) return;
        if (target === 'shield') biome[idx] = lat + (fbm(lon / 5, lat / 5) - 0.5) * 5 > 59 ? B.TUNDRA : B.BOREAL;
        else biome[idx] = target;
      });
    }
  }

  // 3. Coast distance on land (pixels) — used by the defaults below
  const dist = new Int16Array(W * H).fill(-1);
  const q = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const idx = j * W + i;
    if (region[idx] === R.WATER) { dist[idx] = 0; q.push(idx); }
  }
  for (let h = 0; h < q.length; h++) {
    const idx = q[h];
    const i = idx % W;
    const j = (idx / W) | 0;
    const nb = [j * W + ((i + 1) % W), j * W + ((i - 1 + W) % W), j > 0 ? idx - W : -1, j < H - 1 ? idx + W : -1];
    for (const n of nb) if (n >= 0 && dist[n] < 0) { dist[n] = dist[idx] + 1; q.push(n); }
  }
  const coastDeg = (idx) => dist[idx] * res;

  // 4. Defaults for unclassified land
  for (let j = 0; j < H; j++) {
    const lat = 90 - (j + 0.5) * res;
    for (let i = 0; i < W; i++) {
      const idx = j * W + i;
      if (region[idx] === R.WATER) { biome[idx] = B.OCEAN; continue; }
      const lon = -180 + (i + 0.5) * res;
      const n = fbm(lon / 6, lat / 6); // 0..1
      const jitter = (n - 0.5) * 4; // ±2° wobble on latitude thresholds
      const L = lat + jitter;
      const rg = region[idx];
      const name = countryName[idx];

      if (rg === R.ANT) { biome[idx] = B.ICE; continue; }
      if (name === 'Greenland') { biome[idx] = coastDeg(idx) > 1.0 + n ? B.ICE : B.TUNDRA; continue; }
      if (lat > 78) { biome[idx] = biome[idx] === 255 ? B.ICE : biome[idx]; continue; }
      if (biome[idx] !== 255) continue;
      if (name === 'Iceland') { biome[idx] = B.TUNDRA; continue; }

      let b = B.TEMPERATE;
      const absL = Math.abs(L);
      if (L > 66) b = B.TUNDRA;
      else if (L < -52) b = B.TUNDRA;
      else if (L > 50) {
        // boreal belt — Europe stays temperate until further north
        if (rg === R.EUR || (rg === R.NOR && L < 58)) b = L > 59 ? B.BOREAL : B.TEMPERATE;
        else if (rg === R.STP && lon < 60 && L < 56) b = B.FARMLAND;
        else b = B.BOREAL;
      } else if (absL <= 23.5) {
        // tropics
        if (rg === R.SEO) b = B.RAINFOREST;
        else if (rg === R.LAT) b = lat > -14 ? B.RAINFOREST : B.SAVANNA;
        else if (rg === R.SSA) b = lat > -6 && lat < 8 && lon < 31 ? B.RAINFOREST : (name === 'Madagascar' && lon > 47.5 ? B.RAINFOREST : B.SAVANNA);
        else if (rg === R.MENA) b = B.DESERT;
        else if (rg === R.SAS) b = lat < 11 || lon > 88 || name === 'Sri Lanka' || name === 'Bangladesh' ? B.RAINFOREST : B.SAVANNA;
        else if (rg === R.PAC) b = B.RAINFOREST; // Hawaii
        else b = B.TEMPERATE; // southern China, Taiwan
        if (name === 'Australia') b = coastDeg(idx) > 2.5 + n * 2 ? B.DESERT : B.SAVANNA;
        if (name === 'Somalia' || name === 'Somaliland' || name === 'Djibouti') b = B.DESERT;
      } else if (absL <= 35) {
        // subtropics
        if (rg === R.MENA) b = lat > 32.5 && coastDeg(idx) < 2.5 ? B.GRASS : B.DESERT;
        else if (name === 'Iran' || name === 'Afghanistan') b = B.GRASS;
        else if (name === 'Pakistan') b = lon < 69 ? B.DESERT : B.FARMLAND;
        else if (rg === R.PAC) b = lon > -118.5 ? B.DESERT : B.GRASS; // golden California hills
        else if (rg === R.ATL) b = lon < -100 ? B.GRASS : B.TEMPERATE;
        else if (name === 'Mexico') b = lat > 26 ? B.DESERT : B.SAVANNA;
        else if (name === 'Australia') b = coastDeg(idx) > 2.5 + n * 2 ? B.DESERT : (lon > 145 ? B.TEMPERATE : B.GRASS);
        else if (rg === R.SSA) b = lon < 20 && lat < -28 ? B.GRASS : (name === 'Namibia' || name === 'Botswana' ? B.DESERT : B.GRASS);
        else if (rg === R.EAM) b = lon < 100 ? B.DESERT : B.TEMPERATE;
        else if (rg === R.LAT) b = lon < -66 ? B.DESERT : B.TEMPERATE; // Atacama strip / Andean foothills
        else b = B.TEMPERATE;
      } else {
        // temperate 35–50
        if (rg === R.STP) b = lon > 46 ? B.GRASS : B.FARMLAND;
        else if (rg === R.PAC) b = lon < -121 ? B.TEMPERATE : B.GRASS;
        else if (rg === R.ATL) b = lon < -98 ? B.GRASS : B.TEMPERATE;
        else if (rg === R.EAM) b = lon < 100 ? B.DESERT : (lat > 40 && lon < 118 ? B.GRASS : B.TEMPERATE);
        else if (rg === R.LAT) b = lon < -71 ? B.TEMPERATE : B.GRASS;
        else if (name === 'Australia') b = coastDeg(idx) > 2.5 + n * 2 ? B.DESERT : B.TEMPERATE;
        else if (rg === R.MENA) b = B.GRASS;
        else if (name === 'Turkey') b = lon > 31 && coastDeg(idx) > 1.2 ? B.GRASS : B.TEMPERATE;
        else if (name === 'Spain') b = coastDeg(idx) > 1.5 ? B.GRASS : B.TEMPERATE;
        else b = B.TEMPERATE;
      }
      biome[idx] = b;
    }
  }

  // 5. Lakes (inland water) and rivers (drawn over land)
  for (const f of lakes) {
    for (const poly of polygonsOf(f.geometry)) {
      rasterPolygon(grid, poly, (idx) => {
        if (region[idx] === R.WATER || region[idx] === R.ANT) return;
        biome[idx] = B.LAKE;
      });
    }
  }
  const riverRank = res >= 0.5 ? 2 : 4;
  for (const f of rivers) {
    if (f.properties.scalerank > riverRank) continue;
    const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
    for (const line of lines) rasterLine(grid, line, (idx) => {
      if (region[idx] === R.WATER || biome[idx] === B.LAKE || biome[idx] === B.ICE) return;
      biome[idx] = B.RIVER;
    });
  }

  // 6. Domain-warp biome boundaries so polygon edges and latitude cut-offs read as organic.
  //    Coastlines and regions are untouched; a pixel only borrows a biome from nearby land.
  const amp = 0.7 / res; // ±0.7° of wobble
  const warped = biome.slice();
  for (let j = 0; j < H; j++) {
    const lat = 90 - (j + 0.5) * res;
    for (let i = 0; i < W; i++) {
      const idx = j * W + i;
      const b0 = biome[idx];
      if (b0 === B.OCEAN || b0 === B.RIVER || b0 === B.LAKE || b0 === B.ICE) continue;
      const lon = -180 + (i + 0.5) * res;
      const dx = Math.round((fbm(lon / 3 + 11, lat / 3) - 0.5) * 2 * amp);
      const dy = Math.round((fbm(lon / 3, lat / 3 + 23) - 0.5) * 2 * amp);
      const sj = j + dy;
      if (sj < 0 || sj >= H) continue;
      const si = (((i + dx) % W) + W) % W;
      const sidx = sj * W + si;
      const b1 = biome[sidx];
      if (b1 === B.OCEAN || b1 === B.RIVER || b1 === B.LAKE || region[sidx] !== region[idx]) continue;
      if (b1 === B.ICE && countryName[idx] !== 'Greenland') continue;
      warped[idx] = b1;
    }
  }
  biome.set(warped);

  // tag: unused for now (reserved for future overlays)
  void tag;
  return grid;
}

// ── Encode ───────────────────────────────────────────────────────────────────────────────────
function rle(bytes) {
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    const v = bytes[i];
    let run = 1;
    while (i + run < bytes.length && bytes[i + run] === v) run++;
    out.push(v);
    let r = run;
    // varint (7 bits per byte, high bit = continue)
    while (r >= 0x80) { out.push((r & 0x7f) | 0x80); r >>>= 7; }
    out.push(r);
    i += run;
  }
  return Uint8Array.from(out);
}

function encodeLod(grid) {
  const packed = new Uint8Array(grid.W * grid.H);
  for (let k = 0; k < packed.length; k++) packed[k] = (grid.biome[k] & 0x0f) | (grid.region[k] << 4);
  return { W: grid.W, H: grid.H, data: rle(packed) };
}

const lods = [buildLod(0.5), buildLod(0.25)];
const encoded = lods.map(encodeLod);

// file: "KPWM" magic, u8 version, u8 lodCount, then per LOD: u16 W, u16 H, u32 byteLength, bytes
const headerSize = 4 + 2 + encoded.length * 8;
const total = headerSize + encoded.reduce((s, e) => s + e.data.length, 0);
const buf = new Uint8Array(total);
const dv = new DataView(buf.buffer);
buf.set([0x4b, 0x50, 0x57, 0x4d], 0);
buf[4] = 1;
buf[5] = encoded.length;
let off = 6;
for (const e of encoded) {
  dv.setUint16(off, e.W, true);
  dv.setUint16(off + 2, e.H, true);
  dv.setUint32(off + 4, e.data.length, true);
  off += 8;
}
for (const e of encoded) {
  buf.set(e.data, off);
  off += e.data.length;
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buf);
console.log(`wrote ${path.relative(ROOT, OUT)} — ${(buf.length / 1024).toFixed(1)} KiB`, encoded.map((e) => `${e.W}x${e.H}: ${(e.data.length / 1024).toFixed(1)} KiB`).join(', '));

// ── Optional preview PNGs ────────────────────────────────────────────────────────────────────
if (PREVIEW_DIR) {
  const BIOME_RGB = {
    [B.OCEAN]: [22, 58, 99], [B.ICE]: [238, 244, 251], [B.TUNDRA]: [145, 150, 130], [B.BOREAL]: [38, 82, 58], [B.TEMPERATE]: [74, 138, 54],
    [B.GRASS]: [181, 170, 90], [B.DESERT]: [214, 167, 90], [B.SAVANNA]: [163, 160, 70], [B.RAINFOREST]: [31, 106, 50], [B.MOUNTAIN]: [120, 100, 90],
    [B.ALPINE]: [200, 200, 210], [B.PLATEAU]: [150, 130, 110], [B.WETLAND]: [60, 120, 110], [B.FARMLAND]: [150, 180, 70], [B.LAKE]: [58, 138, 171], [B.RIVER]: [70, 150, 190],
  };
  const REGION_RGB = [[0, 0, 0], [230, 90, 70], [240, 160, 60], [240, 220, 80], [120, 200, 90], [80, 200, 200], [90, 140, 230], [170, 110, 220], [230, 110, 180], [200, 160, 120], [140, 200, 160], [250, 120, 120], [120, 160, 240], [220, 220, 220]];
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  for (const g of lods) {
    for (const mode of ['biome', 'region']) {
      const rgb = new Uint8Array(g.W * g.H * 3);
      for (let k = 0; k < g.W * g.H; k++) {
        const c = mode === 'biome' ? BIOME_RGB[g.biome[k]] : (g.region[k] ? REGION_RGB[g.region[k]] : BIOME_RGB[B.OCEAN]);
        rgb.set(c ?? [255, 0, 255], k * 3);
      }
      const file = path.join(PREVIEW_DIR, `worldmap-${g.W}-${mode}.png`);
      fs.writeFileSync(file, encodePng(g.W, g.H, rgb));
      console.log('preview', file);
    }
  }
}

function encodePng(w, h, rgb) {
  const crcTable = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc = (bytes) => {
    let c = -1;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
