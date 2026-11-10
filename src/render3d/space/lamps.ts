/**
 * Lamps: running lights, strobes, beacons and lit windows on things that fly, all drawn in one call
 * as soft points bright enough for the bloom to find. A lamp rides an object (its place is given in
 * that object's own space) and may blink.
 */
import * as THREE from 'three';
import { OUTPUT } from './glsl';

interface Lamp { on: THREE.Object3D; at: THREE.Vector3; color: THREE.Color; size: number; period: number; duty: number; phase: number }

export class Lamps {
  readonly object: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private items: Lamp[] = [];
  private pos: THREE.BufferAttribute;
  private col: THREE.BufferAttribute;
  private size: THREE.BufferAttribute;
  private v = new THREE.Vector3();

  constructor(readonly cap: number) {
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.size = new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('color', this.col);
    g.setAttribute('aSize', this.size);
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 1000 }, uPx: { value: 1 } },
      vertexShader: /* glsl */ `attribute vec3 color; attribute float aSize; uniform float uScale, uPx; varying vec3 vCol;
        void main(){
          vec4 mv = viewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          // a lamp's glow has a size in the world, but never shrinks below a couple of pixels (it dims instead)
          float want = aSize * uScale / max(-mv.z, 0.01), s = clamp(want, 2.5 * uPx, 26.0 * uPx);
          gl_PointSize = s;
          vCol = color * min(1.0, (want * want) / (s * s) + 0.25);
        }`,
      fragmentShader: /* glsl */ `varying vec3 vCol;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vCol * (exp(-d * d * 5.0) - 0.007) * step(d, 1.0), 1.0);
          ${OUTPUT} }`,
    });
    this.object = new THREE.Points(g, m);
    this.object.frustumCulled = false;
    this.object.renderOrder = 6;
  }

  clear() { this.items = []; }

  /**
   * A lamp on `on` at (x, y, z) in its space. `period` > 0 blinks: lit for `duty` of each period (a short
   * duty is a strobe), starting `phase` of the way through.
   */
  add(on: THREE.Object3D, x: number, y: number, z: number, color: THREE.Color, size: number, period = 0, duty = 1, phase = 0) {
    if (this.items.length < this.cap) this.items.push({ on, at: new THREE.Vector3(x, y, z), color, size, period, duty, phase });
  }

  /** Call after the things the lamps ride have been moved this frame. `heightPx`: the view's height in device pixels. */
  update(time: number, camera: THREE.PerspectiveCamera, heightPx: number, pixelRatio: number, gain = 1) {
    const seen = new Set<THREE.Object3D>();
    let n = 0;
    for (const l of this.items) {
      // (a lamp on something hidden is out)
      let shown = true;
      for (let o: THREE.Object3D | null = l.on; o; o = o.parent) if (!o.visible) { shown = false; break; }
      if (!shown) continue;
      if (!seen.has(l.on)) { seen.add(l.on); l.on.updateWorldMatrix(true, false); }
      const p = this.v.copy(l.at).applyMatrix4(l.on.matrixWorld);
      // a blink has a soft edge (filaments and capacitors take a moment)
      let k = gain;
      if (l.period > 0) {
        const u = (((time / l.period + l.phase) % 1) + 1) % 1;
        k *= Math.max(0, Math.min(1, Math.min(u, l.duty - u) * 14 / Math.max(0.02, l.duty) + 0.5)) * (u < l.duty ? 1 : 0);
      }
      this.pos.setXYZ(n, p.x, p.y, p.z);
      this.col.setXYZ(n, l.color.r * k, l.color.g * k, l.color.b * k);
      this.size.setX(n, l.size);
      n++;
    }
    this.object.geometry.setDrawRange(0, n);
    this.pos.needsUpdate = this.col.needsUpdate = this.size.needsUpdate = true;
    const u = this.object.material.uniforms;
    u.uScale.value = heightPx / (2 * Math.tan((camera.fov * Math.PI) / 360));
    u.uPx.value = pixelRatio;
  }
}
