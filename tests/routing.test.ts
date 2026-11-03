import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITES } from '../src/content/sites';
import { routeBetween } from '../src/world/routing';
import { renderTerrain } from '../src/render/worldMap/terrain';
import { C } from '../src/render/palette';
import { pixelCanvasToPng } from '../tools/lib/png';
import { loadWorld } from './helpers/world';

describe('sea routing', () => {
  const { lods, router } = loadWorld();

  it('routes Hsinchu → Northern Virginia through Panama', () => {
    const r = routeBetween(router, 'lumen-hsinchu', 'n-virginia', 'sea', new Set());
    expect(r.chokepoints).toContain('panama');
    expect(r.km).toBeGreaterThan(14000);
    expect(r.km).toBeLessThan(26000);
  });

  it('reroutes when Panama closes', () => {
    const r = routeBetween(router, 'lumen-hsinchu', 'n-virginia', 'sea', new Set(['panama']));
    expect(r.chokepoints).not.toContain('panama');
    const open = routeBetween(router, 'lumen-hsinchu', 'n-virginia', 'sea', new Set());
    expect(r.km).toBeGreaterThan(open.km);
  });

  it('routes Hsinchu → London via Malacca and Suez', () => {
    const r = routeBetween(router, 'lumen-hsinchu', 'london', 'sea', new Set());
    expect(r.chokepoints).toEqual(expect.arrayContaining(['malacca', 'suez']));
  });

  it('finds a sea route between every supplier and every build site', () => {
    const suppliers = SITES.filter((s) => s.kind === 'supplier');
    const builds = SITES.filter((s) => s.kind === 'build');
    for (const sup of suppliers) {
      for (const b of builds) {
        const r = routeBetween(router, sup.id, b.id, 'sea', new Set());
        expect(r.km, `${sup.id} → ${b.id}`).toBeGreaterThan(0);
        expect(r.km, `${sup.id} → ${b.id}`).toBeLessThan(40000);
      }
    }
  });

  it.skipIf(!process.env.PREVIEW_DIR)('draws routes for eyeballing', () => {
    const lod = lods[0];
    const pc = renderTerrain(lod);
    const draw = (pts: [number, number][], col: number) => {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        pc.line(((a[0] + 180) / lod.res + lod.W) % lod.W, (90 - a[1]) / lod.res, ((b[0] + 180) / lod.res + lod.W) % lod.W, (90 - b[1]) / lod.res, col);
      }
    };
    const pairs: [string, string][] = [
      ['lumen-hsinchu', 'n-virginia'], ['lumen-hsinchu', 'london'], ['lumen-hsinchu', 'mojave'], ['kestrel-ohio', 'bengaluru'],
      ['lumen-hsinchu', 'gulf-coast'], ['hanbit-icheon', 'atacama'], ['lumen-phoenix', 'lulea'], ['kestrel-magdeburg', 'pilbara'],
      ['lumen-hsinchu', 'kazakh-steppe'], ['lumen-hsinchu', 'hunter-valley'], ['kestrel-ohio', 'namib'],
    ];
    for (const [a, b] of pairs) {
      const r = routeBetween(router, a, b, 'sea', new Set());
      // skip wrap artefacts in this quick preview
      if (r.path.some((p) => Math.abs(p[0]) > 180)) continue;
      draw(r.path, C.yel1);
      draw(r.overland, C.org1);
    }
    fs.writeFileSync(path.join(process.env.PREVIEW_DIR!, 'routes.png'), pixelCanvasToPng([pc], 2));
  });
});
