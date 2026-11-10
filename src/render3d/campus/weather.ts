/**
 * Weather that falls: rain as fine slanting streaks (moved on the GPU), snow drifting down, dust blowing along, in
 * a box that follows the camera's view of the campus. The sky (sky.ts) greys and fogs to match and wets the land.
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
  private mat: THREE.LineBasicMaterial | THREE.PointsMaterial | THREE.ShaderMaterial;

  constructor(readonly kind: Weather, seed = 1) {
    const r = rng(seed);
    if (kind === 'rain') {
      // each streak: two points at the same place; the shader lets it fall, wraps it in the box and draws the tail
      const n = 9000;
      const pos = new Float32Array(n * 6), tail = new Float32Array(n * 2), sd = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const x = (r() - 0.5) * this.size * 2, y = r() * this.top, z = (r() - 0.5) * this.size * 2, s = r();
        pos.set([x, y, z, x, y, z], i * 6);
        tail.set([0, 1], i * 2);
        sd.set([s, s], i * 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aTail', new THREE.BufferAttribute(tail, 1));
      g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
      this.mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uT: { value: 0 }, uSize: { value: this.size }, uTop: { value: this.top }, uOpacity: { value: 0.3 } },
        vertexShader: `attribute float aTail; attribute float aSeed; uniform float uT; uniform float uSize; uniform float uTop; varying float vA;
          void main() {
            float fall = 30.0 + aSeed * 16.0;
            vec3 p = position;
            p.y = mod(p.y - uT * fall, uTop);
            p.x = mod(p.x + uT * 4.5 + uSize, uSize * 2.0) - uSize;
            // the tail trails up and back along the fall
            float len = 0.9 + aSeed * 1.1;
            p.y += aTail * len; p.x -= aTail * len * 0.15;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            // nearer streaks read stronger; far ones melt into the haze
            vA = (1.0 - aTail) * (0.35 + 0.65 * aSeed) * clamp(1.4 - (-mv.z) / 260.0, 0.15, 1.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: 'uniform float uOpacity; varying float vA; void main() { gl_FragColor = vec4(vec3(0.74, 0.8, 0.9), vA * uOpacity); }',
      });
      this.n = n;
      this.pos = new Float32Array(0);
      this.vel = new Float32Array(0);
      this.obj = new THREE.LineSegments(g, this.mat);
      this.obj.frustumCulled = false;
      return;
    }
    this.n = kind === 'snow' ? 2200 : kind === 'dust' ? 1400 : 0;
    this.pos = new Float32Array(this.n * 3);
    this.vel = new Float32Array(this.n * 3);
    for (let i = 0; i < this.n; i++) {
      const x = (r() - 0.5) * this.size * 2, y = r() * this.top, z = (r() - 0.5) * this.size * 2;
      const vy = kind === 'snow' ? -(2.2 + r() * 1.6) : (r() - 0.5) * 0.8;
      const vx = kind === 'dust' ? 9 + r() * 6 : 0.6;
      this.vel.set([vx, vy, kind === 'dust' ? (r() - 0.5) * 2 : 0], i * 3);
      this.pos.set([x, y, z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({ color: kind === 'snow' ? 0xf4f7fb : 0xc9a878, size: kind === 'snow' ? 0.35 : 0.5, transparent: true, opacity: kind === 'snow' ? 0.9 : 0.35, depthWrite: false });
    this.obj = new THREE.Points(g, this.mat);
    this.obj.frustumCulled = false;
    this.obj.visible = this.n > 0;
  }

  /** Keep the box over what the camera looks at; `night` dims it. */
  update(dt: number, centre: THREE.Vector3, night: number, t: number) {
    if (!this.n) return;
    this.obj.position.set(centre.x, 0, centre.z);
    if (this.kind === 'rain') {
      const u = (this.mat as THREE.ShaderMaterial).uniforms;
      u.uT.value = t;
      u.uOpacity.value = 0.3 * (1 - night * 0.45);
      return;
    }
    const S = this.size;
    for (let i = 0; i < this.n; i++) {
      const o = i * 3;
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
    }
    (this.obj as THREE.Points).geometry.attributes.position.needsUpdate = true;
    this.mat.opacity = (this.kind === 'snow' ? 0.9 : 0.35) * (1 - night * 0.55);
  }
}
