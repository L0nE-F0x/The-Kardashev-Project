/** The West Texas campus, kept in step with the sim: facilities on plots, rising while they're built. */
import * as THREE from 'three';
import type { Facility, GameState } from '../sim/types';
import { TEXAS, type Rect, type Slab } from './terrain';
import { Kit, rng } from './kit';
import { batteryYard, clipAbove, crane, dataHall, fence, fenceMesh, gasPlant, pad, researchLab, scaffold, siteClutter, solarFarm, Walkers, windFarm, type Env, type Piece } from './pieces';

interface Entry {
  f: Facility;
  plot: number;
  root: THREE.Group;
  piece: Piece & { setLoad?(f: number): void };
  /** Buildings rise behind a clip plane; farms grow row by row. */
  clip: boolean;
  site?: THREE.Group;
  crane?: THREE.Group;
  crew?: Walkers;
  staff?: Walkers;
  online: boolean;
}

const center = (r: Rect) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2] as const;

export class Campus {
  private entries = new Map<string, Entry>();
  private plots: (string | null)[] = TEXAS.plots.map(() => null);
  private stakes: THREE.Object3D[] = [];
  /** Fired when something finishes (for a little camera nudge or a toast). */
  onOpened?: (f: Facility, at: THREE.Vector3) => void;

  constructor(private slab: Slab) {
    TEXAS.plots.forEach((r, i) => {
      const s = emptyPlot(r, i);
      slab.group.add(s);
      this.stakes.push(s);
    });
  }

  sync(s: GameState) {
    const here = s.facilities.filter((f) => f.siteId === 'west-texas');
    const ids = new Set(here.map((f) => f.id));
    for (const [id, e] of this.entries) if (!ids.has(id)) this.remove(id, e);
    for (const f of here) {
      let e = this.entries.get(f.id);
      if (!e) e = this.add(f);
      if (!e) continue;
      e.f = f;
      const p = f.status === 'online' ? 1 : Math.min(1, f.progress / Math.max(1, f.buildDays));
      if (f.status === 'online' && !e.online) this.open(e);
      if (!e.online) {
        if (e.clip) clipAbove(e.piece.obj, this.slab.group.position.y + 0.05 + Math.max(0.02, p) * e.piece.h);
        e.piece.progress?.(Math.max(0.02, p));
      }
      if (e.piece.setLoad) {
        const qty = (f.racks ?? []).reduce((a, b) => a + b.qty, 0);
        e.piece.setLoad(f.status === 'online' ? Math.min(1, qty / 8300) : 0);
      }
    }
  }

  private add(f: Facility): Entry | undefined {
    const plot = this.plots.indexOf(null);
    if (plot < 0) return;
    const piece = makePiece(f, plot);
    if (!piece) return;
    this.plots[plot] = f.id;
    this.stakes[plot].visible = false;
    const r = TEXAS.plots[plot];
    const [cx, cz] = center(r);
    const root = new THREE.Group();
    root.position.set(cx, 0, cz);
    root.add(pad(r.x1 - r.x0 - 0.6, r.z1 - r.z0 - 0.6, f.type === 'solar' || f.type === 'wind' ? '#c8b48e' : '#c4b8a6', plot + 1));
    root.add(piece.obj);
    if (f.type === 'datacenter' || f.type === 'battery' || f.type === 'gas') {
      // a security fence round the plot
      const fw = r.x1 - r.x0 - 1.2, fd = r.z1 - r.z0 - 1.2;
      const fk = new Kit(rng(plot + 30));
      fence(fk, fw, fd, 7);
      const fm = fk.build();
      fm.castShadow = false;
      const fg = new THREE.Group();
      fg.add(fm);
      fenceMesh(fg, fw, fd, 7);
      // the gate faces the internal road (behind the front row, in front of the back row)
      if (plot < 3) fg.rotation.y = Math.PI;
      root.add(fg);
    }
    this.slab.group.add(root);
    const clip = f.type === 'datacenter' || f.type === 'gas' || f.type === 'lab';
    const e: Entry = { f, plot, root, piece, clip, online: f.status === 'online' };
    if (!e.online) this.construction(e);
    else piece.progress?.(1);
    this.entries.set(f.id, e);
    return e;
  }

  private construction(e: Entry) {
    const site = new THREE.Group();
    const big = e.clip;
    if (big) site.add(scaffold(e.piece.w - 1.2, e.piece.h, e.piece.d - 4, e.plot));
    site.add(siteClutter(26, 24, e.plot + 3));
    if (big || e.f.type === 'wind') {
      const c = crane(e.f.type === 'wind' ? 24 : 15, e.f.type === 'wind' ? 12 : 16, e.plot + 5);
      c.position.set(e.piece.w / 2 - 1, 0, -e.piece.d / 2 + 1);
      site.add(c);
      e.crane = c;
    }
    // a crew in hi-vis wandering the site
    const crew = new Walkers();
    const w = e.piece.w / 2 + 1, d = e.piece.d / 2;
    for (let i = 0; i < 4; i++) crew.add([[-w + i * 2, d + 1], [w - i, d + 1.5], [w, -d + i], [-w + i, -d]], e.plot * 10 + i, 0.08, true);
    site.add(crew.group);
    e.crew = crew;
    e.root.add(site);
    e.site = site;
  }

  private open(e: Entry) {
    e.online = true;
    if (e.site) { e.root.remove(e.site); disposeTree(e.site); }
    e.site = e.crane = e.crew = undefined;
    if (e.f.type === 'datacenter' || e.f.type === 'lab') {
      // staff between the car park and the door, a tech walking the generator row
      const st = new Walkers();
      if (e.f.type === 'datacenter') {
        st.add([[-7.5, 9], [-7.5, 11], [-11, 11.2], [-7.5, 9]], e.plot * 3 + 1, 0.08);
        st.add([[-6, 8.8], [-2, 11.1], [-6, 8.8]], e.plot * 3 + 2, 0.08);
        st.add([[-9, -9], [9, -9]], e.plot * 3 + 3, 0.08, true);
      } else {
        st.add([[-3, 5.5], [-4, 8], [2, 8]], e.plot * 3 + 4, 0.08);
        st.add([[1, 5.5], [5, 6.4], [1, 5.5]], e.plot * 3 + 5, 0.08);
      }
      e.root.add(st.group);
      e.staff = st;
    }
    if (e.clip) clipAbove(e.piece.obj, null);
    e.piece.progress?.(1);
    this.onOpened?.(e.f, e.root.getWorldPosition(new THREE.Vector3()));
  }

  private remove(id: string, e: Entry) {
    this.slab.group.remove(e.root);
    disposeTree(e.root);
    this.plots[e.plot] = null;
    this.stakes[e.plot].visible = true;
    this.entries.delete(id);
  }

  update(env: Env) {
    for (const e of this.entries.values()) {
      e.piece.update?.(env);
      e.crew?.update(env);
      e.staff?.update(env);
      if (e.crane) e.crane.userData.top.rotation.y = Math.sin(env.t * 0.25 + e.plot) * 1.1;
    }
  }

  /** World position of a facility's plot (for the camera). */
  plotCenter(i: number) {
    const [x, z] = center(TEXAS.plots[i]);
    return new THREE.Vector3(x, 0, z).add(this.slab.group.position);
  }
}

function makePiece(f: Facility, plot: number): Piece | undefined {
  switch (f.type) {
    case 'datacenter': return dataHall(plot * 11 + 1);
    case 'solar': return solarFarm(plot * 7 + 2);
    case 'battery': return batteryYard(plot * 5 + 3);
    case 'wind': return windFarm(plot * 3 + 4);
    case 'gas': return gasPlant();
    case 'lab': return researchLab();
    default: return undefined;
  }
}

/** An empty plot: survey stakes with flags and a string line. */
function emptyPlot(r: Rect, i: number) {
  const k = new Kit(rng(i + 90));
  const [cx, cz] = center(r);
  const w = r.x1 - r.x0 - 2, d = r.z1 - r.z0 - 2;
  const corners: [number, number][] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  for (const [x, z] of corners) {
    k.box(0.12, 1.1, 0.12, '#c08850', x, 0, z, { r: 0, jitter: 0 });
    k.box(0.5, 0.3, 0.03, 'org0', x + 0.25, 0.75, z, { r: 0, jitter: 0 });
  }
  for (let i2 = 0; i2 < 4; i2++) {
    const [ax, az] = corners[i2], [bx, bz] = corners[(i2 + 1) % 4];
    k.beam(new THREE.Vector3(ax, 0.5, az), new THREE.Vector3(bx, 0.5, bz), 0.025, 'yel1');
  }
  // a "plot for sale" sign at the road side
  k.box(0.12, 1.4, 0.12, '#7d5232', -w / 2 + 2, 0, (i >= 3 ? -1 : 1) * (-d / 2) - (i >= 3 ? -0.5 : 0.5));
  k.box(1.6, 0.9, 0.08, '#efe8de', -w / 2 + 2, 1.2, (i >= 3 ? -1 : 1) * (-d / 2) - (i >= 3 ? -0.5 : 0.5));
  const m = k.build();
  m.position.set(cx, 0, cz);
  return m;
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && m.geometry && !(m as THREE.InstancedMesh).isInstancedMesh) {
      // shared Meshy geometry stays loaded; code-built geometry is per piece
      if (!m.geometry.userData.shared) m.geometry.dispose();
    }
  });
}
