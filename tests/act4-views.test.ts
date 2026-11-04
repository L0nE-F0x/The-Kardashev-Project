import { describe, expect, it } from 'vitest';
import { act4PreviewState } from '../src/sim/planetPreview';
import { moonView, orbitView, planetMapView, siteFusion } from '../src/sim/planetView';
import { megaView } from '../src/sim/charterView';

describe('Act IV views', () => {
  it('the preview world has something of everything to draw', () => {
    const s = act4PreviewState();
    const map = planetMapView(s);
    expect(map.active).toBe(true);
    expect(map.links.length).toBe(10);
    expect(map.links.filter((l) => l.status === 'online').length).toBe(4);
    expect(map.links.some((l) => l.status === 'planned')).toBe(true);
    expect(map.fusion.length).toBe(6);
    expect(map.dac.length).toBe(2);
    expect(map.rectennas.length).toBe(2);
    expect(map.provinces.filter((p) => p.ai).length).toBe(4);
    expect(map.provinces.every((p) => Number.isFinite(p.wasteHeat) && p.wasteHeat > 0)).toBe(true);
    const orbit = orbitView(s);
    expect(orbit.odcGW).toBe(3);
    expect(orbit.sps.length).toBe(2);
    expect(orbit.pads).toBe(4);
    expect(moonView(s).stage).toBe(2);
    expect(moonView(s).building?.kind).toBe('massdriver');
    expect(siteFusion(s, 'mega-plains').tokamak).toBe(150);
    expect(megaView(s, 'mega-plains').online).toContain('ffleet');
    expect(Number.isFinite(s.stats.K)).toBe(true);
  });
  it('a Moon-less, stage-1 preview is still valid', () => {
    const s = act4PreviewState({ stage: 1, moon: 0 });
    expect(moonView(s).stage).toBe(0);
    expect(moonView(s).building?.kind).toBe('moonbase');
  });
});
