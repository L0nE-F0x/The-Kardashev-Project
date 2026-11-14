/**
 * The garage the company started in, on its own lot: the house (Meshy), a concrete drive and front path,
 * a picket fence with its gate posts, a hedge down one side, beds by the house, a tree in the back yard,
 * the letter box, the bins, an air conditioner working overtime. At night the windows are lit and the
 * garage glows (the lab inside never sleeps).
 */
import * as THREE from 'three';
import { glowMat, Kit, lightPool, rng } from '../../kit';
import { model } from '../../models';
import type { Piece } from '../../pieces';
import { parkedCars } from '../life';
import type { Placement } from '../trees';
import { fanRotor, lampHeadMat, plants, V, warmPool } from '../plants2/parts';

const CONCRETE = '#cfc6bd', JOINT = '#a89f95', PICKET = '#efe8de';

export function hq(o: { seed: number }): Piece {
  const g = new THREE.Group();
  const house = model('garage', 17);
  house.position.z = -2;
  g.add(house);
  const k = new Kit(rng(o.seed));
  const lamps = new Kit(rng(o.seed + 1));
  const r = rng(o.seed + 2);
  // the drive from the garage bay and the path from the front door, down to the street. The lawn (the plot's pad)
  // tops out at 0.12: both lie just proud of it, or they vanish under the grass. Slabs with joints between them
  k.box(5.5, 0.08, 9, CONCRETE, -4, 0.07, 8.5, { r: 0.04, shade: 0, jitter: 0.02 });
  for (const z of [6.25, 8.5, 10.75]) k.box(5.4, 0.012, 0.06, JOINT, -4, 0.146, z, { r: 0, jitter: 0, shade: 0 });
  k.box(0.06, 0.012, 8.9, JOINT, -4, 0.146, 8.5, { r: 0, jitter: 0, shade: 0 });
  // an oil stain where the car stands, a darker apron at the garage's lip
  k.geo(new THREE.CircleGeometry(0.55, 12).rotateX(-Math.PI / 2).scale(1, 1, 1.5).translate(-4.2, 0.153, 8.2), '#a79d92', 0.02, 0);
  k.box(0.9, 0.08, 10.2, CONCRETE, 3.4, 0.07, 7.7, { r: 0.02, shade: 0, jitter: 0.02 });
  for (let z = 3.6; z < 12.6; z += 1.02) k.box(0.86, 0.012, 0.05, JOINT, 3.4, 0.146, z, { r: 0, jitter: 0, shade: 0 });
  // the letter box by the path: a post, the box with its rounded top, the flag up
  k.box(0.1, 1.05, 0.1, '#7d5232', 5.5, 0.1, 11.5, { r: 0.01, jitter: 0.03 });
  k.box(0.12, 0.08, 0.5, '#7d5232', 5.5, 1.1, 11.6, { r: 0.01, jitter: 0.03 });
  k.geo(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 10, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).translate(5.5, 1.31, 11.6), '#4e4a5a', 0.02, 0);
  k.box(0.26, 0.13, 0.5, '#4e4a5a', 5.5, 1.18, 11.6, { r: 0.01, jitter: 0.02, shade: 0 });
  k.box(0.02, 0.2, 0.03, '#c23a3f', 5.64, 1.26, 11.48, { r: 0, jitter: 0 });
  k.box(0.02, 0.09, 0.13, '#c23a3f', 5.64, 1.4, 11.52, { r: 0, jitter: 0 });
  // the picket fence along the street, open at the drive and at the path: posts, two rails, pointed pickets
  const runs: [number, number][] = [[-12, -7.05], [-0.95, 2.75], [4.05, 12]];
  for (const [x0, x1] of runs) {
    for (const y of [0.32, 0.68]) k.box(x1 - x0, 0.07, 0.04, PICKET, (x0 + x1) / 2, y, 12.56, { r: 0, jitter: 0.02, shade: 0 });
    const n = Math.round((x1 - x0) / 0.24);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      k.box(0.11, 0.72, 0.035, PICKET, x, 0.14, 12.6, { r: 0, jitter: 0.03, shade: 0.08 });
      k.geo(new THREE.ConeGeometry(0.078, 0.11, 4).rotateY(Math.PI / 4).scale(1, 1, 0.32).translate(x, 0.915, 12.6), PICKET, 0.02, 0);
    }
    for (const x of [x0, x1]) {
      k.box(0.16, 0.98, 0.16, PICKET, x, 0.1, 12.58, { r: 0.02, jitter: 0.02, shade: 0.1 });
      k.box(0.21, 0.05, 0.21, PICKET, x, 1.08, 12.58, { r: 0.01, jitter: 0, shade: 0 });
    }
  }
  // beds by the house (bark mulch inside a brick edge), the tree's ring in the back yard
  const beds: [number, number, number, number][] = [[6.9, 4.6, 5.8, 1.5], [-9.0, 4.5, 1.9, 1.5], [2.0, 4.6, 1.8, 1.5]];
  for (const [x, z, w, d] of beds) {
    k.box(w + 0.16, 0.09, d + 0.16, '#a8563a', x, 0.08, z, { r: 0.02, jitter: 0.05, shade: 0 });
    k.box(w, 0.09, d, '#5e4630', x, 0.1, z, { r: 0.02, jitter: 0.04, shade: 0 });
  }
  k.geo(new THREE.CylinderGeometry(1.1, 1.15, 0.08, 14).translate(9, 0.14, -10), '#5e4630', 0.04, 0);
  // the bins down the side of the garage, the air conditioner on the east wall, the meter by the garage door
  for (const [z, c] of [[-0.9, '#3f6b4a'], [-1.75, '#4a5a78']] as [number, string][]) {
    k.box(0.6, 0.95, 0.68, c, -9.15, 0.12, z, { r: 0.05, jitter: 0.03 });
    k.box(0.66, 0.08, 0.74, c, -9.15, 1.06, z, { r: 0.03, jitter: 0.03, shade: 0 });
    for (const dz of [-0.26, 0.26]) k.geo(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8).rotateX(Math.PI / 2).translate(-8.9, 0.22, z + dz), '#2f2a3d', 0, 0);
  }
  k.box(1.0, 0.1, 1.0, '#b9b1a6', 8.85, 0.1, -4.2, { r: 0.02, shade: 0 });
  k.box(0.8, 0.82, 0.86, '#c9c7c0', 8.85, 0.2, -4.2, { r: 0.05 });
  k.cyl(0.33, 0.33, 0.04, '#5e6670', 8.85, 1.02, -4.2, 14, { shade: 0 });
  const fan = fanRotor(0.3);
  fan.position.set(8.85, 1.08, -4.2);
  g.add(fan);
  k.box(0.07, 1.2, 0.07, '#b9b1a6', 8.3, 0.2, -4.5, { r: 0, jitter: 0 });
  k.box(0.3, 0.42, 0.1, '#9d95a6', -1.75, 1.25, 0.12, { r: 0.02 });
  k.beam(V(-1.75, 1.67, 0.12), V(-1.75, 3.3, 0.12), 0.04, '#6a6474');
  // the porch light by the front door
  lamps.box(0.16, 0.22, 0.12, '#e9e1d2', 2.2, 2.25, 0.12, { r: 0.02, jitter: 0 });
  lightPool(g, 2.9, 0, 1.4, 2.6, warmPool);
  g.add(k.build(), lamps.build(lampHeadMat));
  // the hedge along the side, shrubs in the beds, the tree in the back yard (the ground's own kinds: they are drawn
  // by the scene's plant code, and get whatever it learns)
  const hedge: Placement[] = [], bushes: Placement[] = [];
  for (let z = -10; z < 10.2; z += 0.82) hedge.push({ x: -12.2 + (r() - 0.5) * 0.12, y: 0.1, z, s: 1.25 + r() * 0.2, ry: r() * 6.3, tint: 0.82 + r() * 0.12 });
  const spots: [number, number][] = [[2, 4.6], [6, 4.4], [9, 4.8], [-9, 4.5]];
  for (const [x, z] of spots) bushes.push({ x, y: 0.15, z, s: 1.05 + r() * 0.3, ry: r() * 6.3 });
  for (const [x, z] of [[4.7, 4.75], [7.6, 4.7]]) bushes.push({ x, y: 0.15, z, s: 0.7 + r() * 0.15, ry: r() * 6.3, tint: 1.12 });
  g.add(plants('shrub', hedge), plants('shrub', bushes), plants('broadleaf', [{ x: 9, y: 0.1, z: -10, s: 1.55, ry: 1.3 }]));
  parkedCars(g, -4, 9, 1, 3, o.seed, -Math.PI / 2);
  // lit windows at night: a warm pane just in front of each window's own glass, its glazing bar over it
  const paneMat = glowMat('yel1', 0);
  paneMat.userData.nightOnly = 0.75;
  const panes = new THREE.Group();
  const bars = new Kit(rng(5));
  for (const [x, z, w] of [[0.15, -0.035, 1.5], [5.85, 1.365, 1.45]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.3), paneMat);
    p.position.set(x, 2.0, z);
    panes.add(p);
    bars.box(0.05, 1.3, 0.02, '#e9e1d2', x, 1.35, z + 0.012, { r: 0, jitter: 0, shade: 0 });
    bars.box(w, 0.04, 0.02, '#e9e1d2', x, 1.98, z + 0.012, { r: 0, jitter: 0, shade: 0 });
  }
  const barMesh = bars.build();
  barMesh.castShadow = false;
  panes.add(barMesh);
  panes.visible = false;
  g.add(panes);
  // the garage glows at night
  const light = new THREE.PointLight(0xffc27a, 0, 16, 1.6);
  light.position.set(-3.5, 2.2, 2.5);
  g.add(light);
  return {
    obj: g, w: 22, d: 24, h: 8,
    update(e) {
      light.intensity = e.night * 50;
      panes.visible = e.night > 0.05;
      fan.rotation.y += e.dt * 9;
    },
    // the front door up the path; the model stands on its own concrete apron, so the walls are 3.5 m behind its
    // front edge (the gabled wing a little less). The open garage bay is not a way in: its inside is in plain
    // view, workbench and all, and whoever walked in went through the bench and vanished in the light.
    doors: [{ x: 2.9, z: 0.8 }],
    blockers: [
      { x0: -8.6, z0: -7.1, x1: 8.6, z1: -0.4 },
      // the front wall proper (measured on the model: the pier beside the garage door, the wall with the window
      // and the door, the gabled wing), so nobody stands with a shoulder in the render
      { x0: -2.55, z0: -0.4, x1: -1.4, z1: 0.6 },
      { x0: -1.4, z0: -0.4, x1: 3.7, z1: 0.2 },
      { x0: 3.6, z0: -0.4, x1: 8.6, z1: 1.6 },
      ...spots.map(([x, z]) => ({ x0: x - 0.7, z0: z - 0.55, x1: x + 0.7, z1: z + 0.55 })),
      { x0: 3.95, z0: 3.95, x1: 9.85, z1: 5.4 },
      { x0: -12.9, z0: -10.6, x1: -11.5, z1: 10.6 },
      { x0: 8.65, z0: -10.35, x1: 9.35, z1: -9.65 },
      { x0: 5.25, z0: 11.25, x1: 5.75, z1: 11.9 },
      { x0: -12.1, z0: 12.45, x1: -6.95, z1: 12.72 }, { x0: -1.05, z0: 12.45, x1: 2.85, z1: 12.72 }, { x0: 3.95, z0: 12.45, x1: 12.1, z1: 12.72 },
      { x0: -9.55, z0: -2.2, x1: -8.6, z1: -0.5 }, { x0: 8.3, z0: -4.75, x1: 9.4, z1: -3.7 },
    ],
  };
}
