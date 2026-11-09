/**
 * Weather that falls: rain as streaks, snow drifting down, dust blowing along, in a box that
 * follows the camera's view of the campus. The sky (sky.ts) greys and fogs to match.
 */
import * as THREE from 'three';
import { rng } from '../kit';
import type { Weather } from './sky';

export class Precip {
  readonly obj: THREE.Object3D;
  private pos: Float32Array;
  private vel: Float32Array;
  private n: number;
  private size = 110;
  private top = 70;
  private mat: THREE.LineBasicMaterial | THREE.PointsMaterial;

  constructor(readonly kind: Weather, seed = 1) {
    const r = rng(seed);
    this.n = kind === 'rain' ? 2600 : kind === 'snow' ? 2200 : kind === 'dust' ? 1400 : 0;
    const per = kind === 'rain' ? 2 : 1;
    this.pos = new Float32Array(this.n * 3 * per);
    this.vel = new Float32Array(this.n * 3);
    for (let i = 0; i < this.n; i++) {
      const x = (r() - 0.5) * this.size * 2, y = r() * this.top, z = (r() - 0.5) * this.size * 2;
      const vy = kind === 'rain' ? -(34 + r() * 10) : kind === 'snow' ? -(2.2 + r() * 1.6) : (r() - 0.5) * 0.8;
      const vx = kind === 'dust' ? 9 + r() * 6 : kind === 'rain' ? 4 : 0.6;
      this.vel.set([vx, vy, kind === 'dust' ? (r() - 0.5) * 2 : 0], i * 3);
      for (let k = 0; k < per; k++) this.pos.set([x, y, z], (i * per + k) * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    if (kind === 'rain') {
      this.mat = new THREE.LineBasicMaterial({ color: 0xc8d4e6, transparent: true, opacity: 0.45, depthWrite: false });
      this.obj = new THREE.LineSegments(g, this.mat);
    } else {
      this.mat = new THREE.PointsMaterial({ color: kind === 'snow' ? 0xf4f7fb : 0xc9a878, size: kind === 'snow' ? 0.35 : 0.5, transparent: true, opacity: kind === 'snow' ? 0.9 : 0.35, depthWrite: false });
      this.obj = new THREE.Points(g, this.mat);
    }
    this.obj.frustumCulled = false;
    this.obj.visible = this.n > 0;
  }

  /** Keep the box over what the camera looks at; `night` dims it. */
  update(dt: number, centre: THREE.Vector3, night: number, t: number) {
    if (!this.n) return;
    this.obj.position.set(centre.x, 0, centre.z);
    const per = this.kind === 'rain' ? 2 : 1;
    const S = this.size;
    for (let i = 0; i < this.n; i++) {
      const o = i * per * 3;
      let x = this.pos[o], y = this.pos[o + 1], z = this.pos[o + 2];
      const vx = this.vel[i * 3], vy = this.vel[i * 3 + 1], vz = this.vel[i * 3 + 2];
      const sway = this.kind === 'snow' ? Math.sin(t * 1.3 + i) * 0.6 : 0;
      x += (vx + sway) * dt;
      y += vy * dt;
      z += vz * dt;
      if (y < 0) y += this.top;
      if (this.kind === 'dust' && (y > 12 || y < 0.2)) y = 0.5 + ((i * 7.31) % 1) * 10;
      if (x > S) x -= 2 * S;
      if (x < -S) x += 2 * S;
      if (z > S) z -= 2 * S;
      if (z < -S) z += 2 * S;
      this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
      if (per === 2) {
        // the streak's tail, a frame of fall behind
        this.pos[o + 3] = x - vx * 0.03; this.pos[o + 4] = y - vy * 0.03; this.pos[o + 5] = z;
      }
    }
    (this.obj as THREE.Points).geometry.attributes.position.needsUpdate = true;
    this.mat.opacity = (this.kind === 'rain' ? 0.45 : this.kind === 'snow' ? 0.9 : 0.35) * (1 - night * 0.55);
  }
}
