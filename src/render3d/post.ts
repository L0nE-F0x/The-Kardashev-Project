/**
 * The 3D edition's look, per scene: ambient occlusion and tilt-shift (the miniature read) where a
 * scene asks for them, bloom for lights, then a grade (vignette, the stage fade, a whisper of noise
 * so gradients don't band).
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';

/** What a scene wants from the post pipeline (it may change these every frame). */
export interface Look {
  /** Ambient occlusion (campuses). */
  ao: boolean;
  /** Tilt-shift blur strength (0 = off). */
  tilt: number;
  /** Where the sharp band sits (0 = bottom of the screen, 1 = top). */
  focus: number;
  bloom: number;
  bloomThreshold: number;
  vignette: number;
  /**
   * FXAA when there's no MSAA (default on). A scene that anti-aliases its own edges can turn it off: FXAA's
   * per-frame edge guesses flicker on thin lines as the camera moves, and it softens fine texture.
   */
  fxaa?: boolean;
}

export const defaultLook = (): Look => ({ ao: false, tilt: 0, focus: 0.45, bloom: 0.2, bloomThreshold: 1.4, vignette: 0.3 });

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

/**
 * The eras' grades (the pixel game re-tints its palette per era): Smog & Silicon a little grey and
 * hazy, Grid Rush neutral, Solarpunk Bloom lush and warm, Orbital Dawn clean and cool, Swarmlight gold.
 */
export const ERA_GRADES: { tint: [number, number, number]; sat: number; lift: number }[] = [
  { tint: [1.025, 1.0, 0.955], sat: 1.0, lift: 0.006 },
  { tint: [1, 1, 1], sat: 1.0, lift: 0 },
  { tint: [1.02, 1.03, 0.95], sat: 1.12, lift: 0 },
  { tint: [0.97, 1.0, 1.05], sat: 1.04, lift: 0 },
  { tint: [1.06, 1.01, 0.92], sat: 1.08, lift: 0.01 },
];

const Grade = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.3 }, fade: { value: 0 }, fadeColor: { value: new THREE.Color(0x05050c) }, tint: { value: new THREE.Vector3(1, 1, 1) }, sat: { value: 1 }, lift: { value: 0 } },
  vertexShader: quadVS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vignette; uniform float fade; uniform vec3 fadeColor; uniform vec3 tint; uniform float sat; uniform float lift; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, sat) * tint + lift;
      vec2 p = vUv - 0.5; p.x *= 1.2;
      c.rgb *= 1.0 - vignette * smoothstep(0.25, 0.85, length(p));
      c.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 160.0;
      c.rgb = mix(c.rgb, fadeColor, fade);
      gl_FragColor = vec4(c.rgb, 1.0);
    }`,
};

export class Post {
  private composer: EffectComposer;
  private gtao: GTAOPass | null = null;
  private tiltH: ShaderPass;
  private tiltV: ShaderPass;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private fxaa: FXAAPass | null = null;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, ao: boolean, samples = 4) {
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    if (ao) {
      this.gtao = new GTAOPass(scene, camera, size.x, size.y);
      // at half resolution: a quarter of the pixels for the costliest effect (+24 ms → ~6 on an iGPU); denoised and
      // blended back up it looks the same
      const setAo = this.gtao.setSize.bind(this.gtao);
      this.gtao.setSize = (w: number, h: number) => setAo(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
      this.gtao.blendIntensity = 0.85;
      this.gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: 12 });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.composer.addPass(this.gtao);
    }
    this.tiltH = new ShaderPass(TiltShift);
    this.tiltV = new ShaderPass(TiltShift);
    this.tiltV.uniforms.dir.value = new THREE.Vector2(0, 1);
    this.composer.addPass(this.tiltH);
    this.composer.addPass(this.tiltV);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.2, 0.55, 1.4);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // no MSAA (the low preset): a cheap FXAA pass keeps edges from stair-stepping
    if (!samples) this.composer.addPass((this.fxaa = new FXAAPass()));
    this.grade = new ShaderPass(Grade);
    this.composer.addPass(this.grade);
    this.resize();
  }

  resize() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(size.x, size.y);
    for (const p of [this.tiltH, this.tiltV]) p.uniforms.res.value.set(size.x * pr, size.y * pr);
  }

  render(dt: number, look: Look, fade: number, era = 1) {
    const gr = ERA_GRADES[Math.max(0, Math.min(4, era))];
    this.grade.uniforms.tint.value.set(...gr.tint);
    this.grade.uniforms.sat.value = gr.sat;
    this.grade.uniforms.lift.value = gr.lift;
    const tilt = look.tilt > 0.01;
    this.tiltH.enabled = this.tiltV.enabled = tilt;
    for (const p of [this.tiltH, this.tiltV]) {
      p.uniforms.amount.value = look.tilt;
      p.uniforms.focus.value = look.focus;
    }
    if (this.gtao) this.gtao.enabled = look.ao;
    if (this.fxaa) this.fxaa.enabled = look.fxaa !== false;
    this.bloom.enabled = look.bloom > 0.01;
    this.bloom.strength = look.bloom;
    this.bloom.threshold = look.bloomThreshold;
    this.grade.uniforms.vignette.value = look.vignette;
    this.grade.uniforms.fade.value = Math.max(0, Math.min(1, fade));
    this.composer.render(dt);
  }

  dispose() {
    this.composer.dispose();
    this.gtao?.dispose();
    this.bloom.dispose();
  }
}
