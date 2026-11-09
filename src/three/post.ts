/**
 * The two looks, one scene:
 *  - Model: ambient occlusion, tilt-shift blur (the miniature read), a little bloom, a vignette.
 *  - Pixel: rendered at low resolution with depth/normal outlines, snapped to the game's palette
 *    with a light ordered dither: the 3D/pixel hybrid.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { PALETTE } from '../render/palette';
import { paletteUniforms } from './models';

export type Look = 'model' | 'pixel';

const quadVS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

const TiltShift = {
  uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2(1, 0) }, amount: { value: 1.6 }, focus: { value: 0.45 }, band: { value: 0.16 }, res: { value: new THREE.Vector2(1, 1) } },
  vertexShader: quadVS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 dir; uniform float amount; uniform float focus; uniform float band; uniform vec2 res; varying vec2 vUv;
    void main(){
      float d = abs(vUv.y - focus);
      float k = smoothstep(band, band + 0.4, d) * amount;
      if (k < 0.01) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec4 sum = vec4(0.0); float ws = 0.0;
      for (int i = -6; i <= 6; i++) { float w = exp(-float(i * i) / 16.0); sum += texture2D(tDiffuse, vUv + dir * float(i) * k / res) * w; ws += w; }
      gl_FragColor = sum / ws;
    }`,
};

const Grade = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.32 }, sat: { value: 1.06 } },
  vertexShader: quadVS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vignette; uniform float sat; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, sat);
      vec2 p = vUv - 0.5; p.x *= 1.2;
      c.rgb *= 1.0 - vignette * smoothstep(0.25, 0.85, length(p));
      // a whisper of noise so the sky's gradients don't band in 8 bits
      c.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 160.0;
      gl_FragColor = c;
    }`,
};

// the snap compares colours in OKLab, so hues survive (olive scrub stays green, not brown)
function oklab(hex: string) {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const r = lin(parseInt(hex.slice(1, 3), 16) / 255), g = lin(parseInt(hex.slice(3, 5), 16) / 255), b = lin(parseInt(hex.slice(5, 7), 16) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return new THREE.Vector3(0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s);
}
const HEX = Object.values(PALETTE) as string[];
const PAL_LAB = HEX.map(oklab);
const PAL_SRGB = HEX.map((h) => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255));

const PaletteSnap = {
  uniforms: { tDiffuse: { value: null }, lab: { value: PAL_LAB }, pal: { value: PAL_SRGB }, px: { value: 3 }, dither: { value: 0.016 } },
  vertexShader: quadVS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 lab[${HEX.length}]; uniform vec3 pal[${HEX.length}]; uniform float px; uniform float dither; varying vec2 vUv;
    float bayer(vec2 p){ int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0)); int i = x + y * 4;
      int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); return float(m[i]) / 16.0 - 0.5; }
    vec3 toLab(vec3 c){
      vec3 r = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
      float l = pow(0.4122214708 * r.x + 0.5363325363 * r.y + 0.0514459929 * r.z, 1.0/3.0);
      float m = pow(0.2119034982 * r.x + 0.6806995451 * r.y + 0.1073969566 * r.z, 1.0/3.0);
      float s = pow(0.0883024619 * r.x + 0.2817188376 * r.y + 0.6299787005 * r.z, 1.0/3.0);
      return vec3(0.2104542553*l + 0.793617785*m - 0.0040720468*s, 1.9779984951*l - 2.428592205*m + 0.4505937099*s, 0.0259040371*l + 0.7827717662*m - 0.808675766*s);
    }
    void main(){
      vec3 c = toLab(clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0));
      c.x += bayer(floor(gl_FragCoord.xy / px)) * dither * 2.0;
      int bi = 0; float bd = 1e9;
      for (int i = 0; i < ${HEX.length}; i++) {
        vec3 d = (lab[i] - c) * vec3(1.0, 1.6, 1.6);
        float dd = dot(d, d);
        if (dd < bd) { bd = dd; bi = i; }
      }
      gl_FragColor = vec4(pal[bi], 1.0);
    }`,
};

export class Post {
  look: Look = 'model';
  private model: EffectComposer;
  private pixel: EffectComposer;
  private tiltH: ShaderPass;
  private tiltV: ShaderPass;
  private bloom: UnrealBloomPass;
  private pixelPass: RenderPixelatedPass;
  private snap: ShaderPass;
  readonly gtao: GTAOPass;
  pixelSize = 3;
  tiltAmount = 1.6;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const w = innerWidth, h = innerHeight;
    // ── Model ──
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    this.model = new EffectComposer(renderer, rt);
    this.model.addPass(new RenderPass(scene, camera));
    this.gtao = new GTAOPass(scene, camera, w, h);
    this.gtao.blendIntensity = 0.85;
    this.gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: 12 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.model.addPass(this.gtao);
    this.tiltH = new ShaderPass(TiltShift);
    this.tiltV = new ShaderPass(TiltShift);
    this.tiltV.uniforms.dir.value = new THREE.Vector2(0, 1);
    this.model.addPass(this.tiltH);
    this.model.addPass(this.tiltV);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.55, 1.4);
    this.model.addPass(this.bloom);
    this.model.addPass(new OutputPass());
    this.model.addPass(new ShaderPass(Grade));

    // ── Pixel ──
    this.pixel = new EffectComposer(renderer);
    this.pixelPass = new RenderPixelatedPass(this.pixelSize, scene, camera, { normalEdgeStrength: 0.45, depthEdgeStrength: 0.8 });
    this.pixel.addPass(this.pixelPass);
    this.pixel.addPass(new OutputPass());
    this.snap = new ShaderPass(PaletteSnap);
    this.pixel.addPass(this.snap);
    this.resize();
  }

  setLook(l: Look) {
    this.look = l;
    // the pixel look snaps everything at the end, so the textures don't need the pull
    paletteUniforms.uPalPull.value = l === 'pixel' ? 0 : 0.22;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const pr = Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.model.setPixelRatio(pr);
    this.model.setSize(w, h);
    for (const p of [this.tiltH, this.tiltV]) p.uniforms.res.value.set(w * pr, h * pr);
    // the pixel look works in CSS pixels × a whole number (no pixel ratio blur)
    this.pixel.setPixelRatio(1);
    this.pixel.setSize(Math.round(w * pr), Math.round(h * pr));
    this.pixelPass.setPixelSize(Math.max(2, Math.round(this.pixelSize * pr)));
    this.snap.uniforms.px.value = Math.max(2, Math.round(this.pixelSize * pr));
  }

  setPixelSize(n: number) { this.pixelSize = n; this.resize(); }

  render(dt: number, night: number) {
    if (this.look === 'pixel') {
      this.pixel.render(dt);
      return;
    }
    this.tiltH.uniforms.amount.value = this.tiltAmount;
    this.tiltV.uniforms.amount.value = this.tiltAmount;
    this.bloom.strength = 0.16 + night * 0.42;
    this.bloom.threshold = 1.5 - night * 0.7;
    this.model.render(dt);
  }
}
