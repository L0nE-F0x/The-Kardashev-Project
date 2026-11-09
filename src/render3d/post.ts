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

const Grade = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.3 }, fade: { value: 0 }, fadeColor: { value: new THREE.Color(0x05050c) } },
  vertexShader: quadVS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vignette; uniform float fade; uniform vec3 fadeColor; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
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

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, ao: boolean) {
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    if (ao) {
      this.gtao = new GTAOPass(scene, camera, size.x, size.y);
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

  render(dt: number, look: Look, fade: number) {
    const tilt = look.tilt > 0.01;
    this.tiltH.enabled = this.tiltV.enabled = tilt;
    for (const p of [this.tiltH, this.tiltV]) {
      p.uniforms.amount.value = look.tilt;
      p.uniforms.focus.value = look.focus;
    }
    if (this.gtao) this.gtao.enabled = look.ao;
    this.bloom.enabled = look.bloom > 0.01;
    this.bloom.strength = look.bloom;
    this.bloom.threshold = look.bloomThreshold;
    this.grade.uniforms.vignette.value = look.vignette;
    this.grade.uniforms.fade.value = fade;
    this.composer.render(dt);
  }

  dispose() {
    this.composer.dispose();
    this.gtao?.dispose();
    this.bloom.dispose();
  }
}
