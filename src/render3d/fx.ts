/**
 * Shared effects for 3D pieces: steam and smoke plumes (cooling towers, geothermal wells, stacks),
 * text signs (company names on buildings, in the UI's font) and lathe shapes (cooling towers,
 * tanks, domes).
 */
import * as THREE from 'three';
import { col, rng, type Paint } from './kit';
import type { Env } from './pieces';

// ── plumes ───────────────────────────────────────────────────────────────────────────────────
let puffTex: THREE.Texture | null = null;
function puffTexture() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}

export interface PlumeOpts {
  /** Puffs alive at once. */
  count?: number;
  /** Seconds a puff lives. */
  life?: number;
  /** Rise speed (units/s) and spread. */
  rise?: number;
  spread?: number;
  /** Puff size at birth and at death (world units). */
  size0?: number;
  size1?: number;
  /** Day colour (steam: white; smoke: grey). */
  color?: Paint;
  opacity?: number;
  /** Mouth radius (puffs start anywhere inside it). */
  radius?: number;
  /** Drift with the wind (units/s along +x). */
  wind?: number;
}

/**
 * A plume of soft puffs rising from a point: steam from a cooling tower or a well, exhaust from a
 * stack. Lit by the time of day (dim and blue at night). `strength` 0..1 thins it out (a plant
 * running at half load, or switched off).
 */
/** Point sizes are in device pixels: the scene sets this from the viewport (height × pixel ratio). */
export const plumeUniforms = { scale: { value: 600 } };

export class Plume {
  readonly obj: THREE.Points;
  strength = 1;
  private age: Float32Array;
  private seeds: Float32Array;
  private o: Required<PlumeOpts>;
  private mat: THREE.ShaderMaterial;

  constructor(opts: PlumeOpts = {}, seed = 1) {
    this.o = { count: 26, life: 7, rise: 2.2, spread: 0.9, size0: 2.2, size1: 7, color: '#f4f1ec', opacity: 0.85, radius: 1, wind: 0.8, ...opts };
    const n = this.o.count;
    const pos = new Float32Array(n * 3);
    const extra = new Float32Array(n * 2);
    this.age = new Float32Array(n);
    this.seeds = new Float32Array(n);
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      this.age[i] = (i / n) * this.o.life;
      this.seeds[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('extra', new THREE.BufferAttribute(extra, 2));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: {
        map: { value: puffTexture() }, color: { value: col(this.o.color).clone() }, opacity: { value: this.o.opacity }, scale: plumeUniforms.scale,
        fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 2000 },
      },
      vertexShader: `attribute vec2 extra; varying float vA; uniform float scale;
        #include <fog_pars_vertex>
        void main(){ vA = extra.y; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_PointSize = extra.x * scale / -mvPosition.z; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 color; uniform float opacity; varying float vA;
        #include <fog_pars_fragment>
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color, t.a * opacity * vA);
          #include <fog_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.obj = new THREE.Points(g, this.mat);
    this.obj.frustumCulled = false;
    this.obj.renderOrder = 5;
  }

  update(e: Env) {
    const o = this.o;
    const pos = this.obj.geometry.attributes.position as THREE.BufferAttribute;
    const ex = this.obj.geometry.attributes.extra as THREE.BufferAttribute;
    for (let i = 0; i < o.count; i++) {
      this.age[i] += e.dt;
      if (this.age[i] > o.life) { this.age[i] -= o.life; this.seeds[i] = (this.seeds[i] * 9301 + 0.49297) % 1; }
      const t = this.age[i] / o.life;
      const s = this.seeds[i];
      const a = s * Math.PI * 2;
      const rr = o.radius * Math.sqrt((s * 7.13) % 1);
      const lift = o.rise * this.age[i] * (1 - t * 0.35);
      pos.setXYZ(i, Math.cos(a) * rr + o.wind * this.age[i] + Math.sin(e.t * 0.4 + s * 6) * o.spread * t, lift, Math.sin(a) * rr + Math.cos(e.t * 0.3 + s * 9) * o.spread * t);
      const fadeIn = Math.min(1, t * 6);
      ex.setXY(i, o.size0 + (o.size1 - o.size0) * t, fadeIn * (1 - t) * this.strength);
    }
    pos.needsUpdate = true;
    ex.needsUpdate = true;
    // dim and cool at night; through sunset and dusk a dim warm grey (the plume is not lit by the scene: left white
    // it was the brightest thing in the picture when the sun was low)
    const k = (a: number, b: number, v: number) => Math.min(1, Math.max(0, (v - a) / (b - a)));
    const dusk = k(0.015, 0.11, e.night) * (1 - k(0.5, 0.85, e.night));
    this.mat.uniforms.color.value.copy(col(this.o.color)).lerp(col('#6a7090'), e.night * 0.75).lerp(col('#b9a39a'), dusk * 0.8);
  }
}

// ── signs ────────────────────────────────────────────────────────────────────────────────────
/**
 * A flat sign with text (a company name on a façade, a gate sign). `w` world units wide; the
 * height follows the text. Faces +z; place and rotate it like any mesh.
 */
export function sign(text: string, w: number, fg: Paint = '#fbf7f0', bg: Paint | null = null, opts: { font?: string; glow?: boolean } = {}) {
  const font = opts.font ?? `700 72px 'Atkinson Hyperlegible Next', system-ui, sans-serif`;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = font;
  const tw = Math.ceil(g.measureText(text).width) + 48;
  c.width = Math.min(2048, tw);
  c.height = 112;
  g.font = font;
  if (bg) {
    g.fillStyle = `#${col(bg).getHexString(THREE.SRGBColorSpace)}`;
    g.fillRect(0, 0, c.width, c.height);
  }
  g.fillStyle = `#${col(fg).getHexString(THREE.SRGBColorSpace)}`;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(text, c.width / 2, c.height / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const h = (w * c.height) / c.width;
  const mat = opts.glow
    ? new THREE.MeshBasicMaterial({ map: tex, transparent: !bg, toneMapped: false })
    : new THREE.MeshStandardMaterial({ map: tex, transparent: !bg, roughness: 0.7 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.userData.signHeight = h;
  return m;
}

// ── lathe shapes ─────────────────────────────────────────────────────────────────────────────
/** A hyperbolic natural-draft cooling tower, `h` tall, base radius `r` (open at the top). */
export function coolingTowerGeometry(h: number, r: number, seg = 32) {
  const pts: THREE.Vector2[] = [];
  const throat = 0.62, throatY = 0.78;
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const y = t * h;
    // a hyperbola-ish profile: wide base, narrow throat at ~78%, a slight flare at the lip
    const k = t < throatY ? 1 - (1 - throat) * Math.sin((t / throatY) * Math.PI / 2) : throat + (t - throatY) / (1 - throatY) * 0.06;
    pts.push(new THREE.Vector2(r * k, y));
  }
  const g = new THREE.LatheGeometry(pts, seg);
  return g;
}

/** A dome (containment buildings, observatories): a cylinder with a hemispherical cap, base at y = 0. */
export function domeGeometry(r: number, wall: number, seg = 28) {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0.001, 0), new THREE.Vector2(r, 0), new THREE.Vector2(r, wall)];
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * Math.PI / 2;
    pts.push(new THREE.Vector2(Math.cos(a) * r, wall + Math.sin(a) * r));
  }
  return new THREE.LatheGeometry(pts, seg);
}
