/** The two slabs and everything on them that doesn't come from the sim. */
import * as THREE from 'three';
import { BAY, buildSlab, flatDist, scatter, TEXAS, type Slab } from './terrain';
import { Kit, rng, glowMat, lightPool, poolMat } from './kit';
import { model, modelParts } from './models';
import { blinkBeacons, cow, instanced, pumpjack, stockPond, Walkers, windpump, pylon, scrub, streetLamp, utilityPole, wires, type Env } from './pieces';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

interface Mover { obj: THREE.Object3D; speed: number; lane: number; x: number; len: number }

export class World {
  texas: Slab;
  bay: Slab;
  private updaters: ((e: Env) => void)[] = [];
  private movers: Mover[] = [];
  private beaconRoots: THREE.Object3D[] = [];
  garageLight: THREE.PointLight;
  private porchLights: THREE.PointLight[] = [];

  constructor(scene: THREE.Scene) {
    this.texas = buildSlab(TEXAS);
    this.bay = buildSlab(BAY);
    scene.add(this.texas.group, this.bay.group);
    this.dressTexas();
    this.garageLight = new THREE.PointLight(0xffc27a, 0, 18, 1.6);
    this.dressBay();
  }

  private dressTexas() {
    const { group: g, h, def } = this.texas;
    // substation where the grid comes in, the water tower
    const sub = model('substation', 16);
    sub.position.set(-47, 0, 25);
    g.add(sub);
    const wt = model('watertower', 5.5);
    wt.position.set(-58, h(-58, 11), 11);
    wt.rotation.y = 0.5;
    g.add(wt);

    // the high-voltage line from the back left into the substation
    const pyl: THREE.Vector3[] = [];
    for (const [x, z] of [[-67, -44], [-67, -21], [-66, 1], [-60, 19]] as const) {
      const p = pylon(Math.abs(x * z) | 0);
      const y = h(x, z);
      p.position.set(x, y, z);
      p.rotation.y = x === -60 ? 0.6 : 0;
      g.add(p);
      pyl.push(V(x, y + 11 * 0.72 - 0.6, z));
    }
    pyl.push(V(-52, 5, 23));
    const line = (dx: number) => pyl.map((p, i) => p.clone().add(V(i === pyl.length - 1 ? dx * 0.6 : dx, 0, 0)));
    g.add(wires([line(-3), line(0), line(3)], 1.1));

    // wooden poles along the internal road carrying power to the plots, and along the highway
    const pk = new Kit(rng(5));
    const poles: THREE.Vector3[] = [], hwy: THREE.Vector3[] = [];
    for (let x = -27; x <= 66; x += 13) { utilityPole(pk, x, 0, -2.6, 6.5, 0); poles.push(V(x, 6, -2.6)); }
    for (let x = -70; x <= 70; x += 14) { const z = 44.5; utilityPole(pk, x, h(x, z), z, 6, 0); hwy.push(V(x, h(x, z) + 5.5, z)); }
    g.add(pk.build());
    g.add(wires([poles.map((p) => p.clone().add(V(0, 0, -0.9))), poles.map((p) => p.clone().add(V(0, 0, 0.9)))], 0.45));
    g.add(wires([hwy.map((p) => p.clone().add(V(0, 0, -0.9))), hwy.map((p) => p.clone().add(V(0, 0, 0.9)))], 0.5));

    // street lamps up the access road
    const lk = new Kit(rng(8));
    for (let z = -28; z <= 30; z += 12) streetLamp(g, lk, -26.6, 0, z, -1);
    g.add(lk.build());

    // the oil field: pumpjacks, a tank battery
    for (const [i, [x, z, ry]] of ([[-52, -15, 0.4], [-60, -29, -0.3], [-38, -42, 0.1], [62, -41, 0.9], [33, -45, -0.2], [-18, -42, 0.3]] as const).entries()) {
      const pj = pumpjack(i * 13 + 3);
      pj.obj.position.set(x, h(x, z), z);
      pj.obj.rotation.y = ry;
      g.add(pj.obj);
      this.updaters.push(pj.update);
    }
    const tk = new Kit(rng(12));
    for (const [x, z] of [[54, -44], [57.6, -44], [61.2, -44.6]]) tk.cyl(1.5, 1.5, 3.4, '#d8cfc3', x, h(x, z) - 0.1, z, 16);
    tk.box(9, 0.2, 4, '#c4b8a6', 57.6, h(57.6, -44) - 0.15, -44.2, { r: 0.04, shade: 0 });
    g.add(tk.build());

    // mesquites in clusters, scrub, grass, rocks
    const r = rng(77);
    const trees: { x: number; y: number; z: number; s: number; ry: number }[] = [];
    const centres = scatter(def, 16, 31, 7);
    for (const [cx, cz] of centres) {
      const n = 2 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const x = cx + (r() - 0.5) * 9, z = cz + (r() - 0.5) * 7;
        if (flatDist(def, x, z) < 3 || Math.abs(x) > def.w / 2 - 2 || Math.abs(z) > def.d / 2 - 2) continue;
        trees.push({ x, y: h(x, z) - 0.1, z, s: 0.7 + r() * 0.6, ry: r() * 6.3 });
      }
    }
    const mq = modelParts('mesquite');
    g.add(instanced(mq.parts, mq.size, trees, 6.5));
    const at = (pts: [number, number][]) => pts.map(([x, z]) => [x, h(x, z), z] as [number, number, number]);
    g.add(scrub(at(scatter(def, 700, 3, 1.5)), 4, 'scrub'));
    g.add(scrub(at(scatter(def, 500, 6, 0.8)), 5, 'grass'));
    g.add(scrub(at(scatter(def, 140, 9, 1)), 7, 'rock'));

    // the ranch corner: a stock pond with a windpump, a few head of cattle
    const pond = stockPond(4.2, 3);
    pond.position.set(8, h(8, -42), -41.5);
    g.add(pond);
    const wp = windpump(5);
    wp.obj.position.set(14.5, h(14.5, -43), -43);
    wp.obj.rotation.y = -0.5;
    g.add(wp.obj);
    this.updaters.push(wp.update);
    for (const [i, [x, z, ry]] of ([[2, -38.5, 0.4], [3.6, -44.5, 2.2], [13, -39, -1.2], [-1.5, -43, 1.6], [17, -37.5, 3.6]] as const).entries()) {
      const c = cow(i + 40);
      c.obj.position.set(x, h(x, z), z);
      c.obj.rotation.y = ry;
      g.add(c.obj);
      this.updaters.push(c.update);
    }

    // highway traffic: semis and pickups both ways, spaced out per lane, headlights at night
    const headMat = glowMat('yel2', 0);
    headMat.userData.nightOnly = 4;
    const tailMat = glowMat('red3', 0);
    tailMat.userData.nightOnly = 3;
    const beamMat = poolMat('#ffe9c0', 0.7);
    for (const lane of [-1, 1]) {
      const n = 4;
      const speed = lane > 0 ? 9 : 7.5;
      for (let i = 0; i < n; i++) {
        const semi = (i + (lane > 0 ? 1 : 0)) % 3 !== 2;
        const len = semi ? 11 : 4.4;
        const o = new THREE.Group();
        const body = model(semi ? 'semitruck' : 'pickup', len);
        o.add(body);
        // the cab is at the model's -x end; lights at both ends
        const hy = semi ? 0.9 : 0.6, hw = semi ? 0.75 : 0.6;
        for (const sz of [-hw, hw]) {
          const hl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), headMat);
          hl.position.set(-len / 2 - 0.02, hy, sz);
          const tl = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 4), tailMat);
          tl.position.set(len / 2 + 0.02, hy, sz);
          o.add(hl, tl);
        }
        lightPool(o, -len / 2 - 4.5, 0, 0, 3.2, beamMat, 1.8);
        g.add(o);
        this.movers.push({ obj: o, speed: speed + (r() - 0.5) * 0.3, lane, x: -72 + (i + r() * 0.3) * (148 / n), len });
      }
    }
    this.beaconRoots.push(g);
  }

  private dressBay() {
    const { group: g, h, def } = this.bay;
    const garage = model('garage', 15);
    garage.position.set(0, 0, -1);
    g.add(garage);
    this.garageLight.position.set(2.5, 2.2, 3);
    g.add(this.garageLight);
    const folk = new Walkers();
    folk.add([[3.2, 3.5], [3.4, 3.6]], 1);
    folk.add([[0.5, 2.8], [0.6, 2.6]], 2);
    folk.add([[1, 6.5], [-3, 6.8], [-3, 9.8], [8, 9.9], [8, 7], [1, 6.5]], 3);
    folk.add([[-40, 15.8], [40, 15.8]], 4);
    folk.add([[30, 8.3], [-34, 8.3]], 5);
    g.add(folk.group);
    this.updaters.push((e) => folk.update(e));
    const b1 = model('bungalow', 12.5);
    b1.position.set(-23, 0, -1.5);
    g.add(b1);
    const b2 = model('bungalow', 12);
    b2.position.set(23.5, 0, -1);
    b2.rotation.y = 0.04;
    g.add(b2);
    // porch lights at night
    const porch = poolMat('#ffcf8a', 0.75);
    for (const x of [-25, 21]) {
      const l = new THREE.PointLight(0xffc27a, 0, 9, 1.8);
      l.position.set(x, 2.4, 4.6);
      g.add(l);
      this.porchLights.push(l);
      lightPool(g, x, 0, 5.6, 3.4, porch);
    }
    // parked pickups, a picket fence line, lamps
    for (const [x, z, ry] of [[-8, 8.4, Math.PI / 2], [14, 8.4, Math.PI / 2], [-30, 15.6, -Math.PI / 2]] as const) {
      const c = model('pickup', 4.6);
      c.position.set(x, 0, z);
      c.rotation.y = ry;
      g.add(c);
    }
    const k = new Kit(rng(4));
    for (const x0 of [-31, 15]) for (let x = x0; x < x0 + 16; x += 0.5) k.box(0.12, 0.8, 0.05, '#efe8de', x, 0, 7.6, { r: 0, jitter: 0.02 });
    for (let x = -36; x <= 36; x += 14) streetLamp(g, k, x, 0, 17.2, -1);
    // a small park across the street
    k.box(3, 0.45, 0.8, '#7d5232', -6, 0.3, 22, { r: 0.08 });
    k.box(3, 0.45, 0.8, '#7d5232', 8, 0.3, 22, { r: 0.08 });
    k.box(28, 0.05, 1.4, '#d9c08e', 1, 0, 24.5, { r: 0.02, shade: 0 });
    g.add(k.build());

    // coast live oaks on the hill and along the street
    const r = rng(5);
    const oaks: { x: number; y: number; z: number; s: number; ry: number }[] = [];
    for (const [x, z] of scatter(def, 34, 21, 2, (_x, z) => z < -9)) oaks.push({ x, y: h(x, z) - 0.15, z, s: 0.6 + r() * 0.7, ry: r() * 6.3 });
    for (const x of [-36, -16, 30, 38]) oaks.push({ x, y: 0, z: 25, s: 0.8 + r() * 0.3, ry: r() * 6.3 });
    oaks.push({ x: -12, y: 0, z: -9.5, s: 0.75, ry: 1 }, { x: 12, y: 0, z: -10, s: 0.7, ry: 2 });
    const oak = modelParts('oak');
    g.add(instanced(oak.parts, oak.size, oaks, 7));
    const at = (pts: [number, number][]) => pts.map(([x, z]) => [x, h(x, z), z] as [number, number, number]);
    g.add(scrub(at(scatter(def, 160, 13, 1.2, (_x, z) => z < -8)), 14, 'scrub'));
    g.add(scrub(at(scatter(def, 300, 15, 1.2, (_x, z) => z < -8)), 16, 'grass'));
    this.beaconRoots.push(g);
  }

  update(e: Env) {
    for (const u of this.updaters) u(e);
    for (const m of this.movers) {
      m.x += m.speed * e.dt * m.lane;
      if (m.x > 74) m.x = -74;
      if (m.x < -74) m.x = 74;
      // vehicles shrink into the slab's cut edge instead of popping
      const edge = Math.min(1, (74 - Math.abs(m.x)) / 3);
      m.obj.position.set(m.x, 0.05, 39 + m.lane * 2);
      m.obj.rotation.y = m.lane > 0 ? Math.PI : 0;
      m.obj.visible = edge > 0.02;
      m.obj.scale.setScalar(Math.max(0.01, edge));
    }
    this.garageLight.intensity = e.night * 60;
    for (const l of this.porchLights) l.intensity = e.night * 14;
    for (const b of this.beaconRoots) blinkBeacons(b, e);
  }
}
