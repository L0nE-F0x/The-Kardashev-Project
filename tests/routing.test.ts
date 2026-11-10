import { describe, expect, it } from 'vitest';
import { SITES } from '../src/content/sites';
import { routeBetween } from '../src/world/routing';
import { loadWorld } from './helpers/world';

describe('sea routing', () => {
  const { router } = loadWorld();

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
});
