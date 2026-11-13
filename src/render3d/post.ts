/**
 * The picture's look, per scene. One scene render (HDR, with its depth) feeds everything:
 * ambient occlusion from the depth buffer, depth of field (the miniature read: sharp where the camera looks, soft
 * before and behind it), bloom for lights, then the "film": exposure, a tone curve, a grade (the era's tint,
 * contrast, vignette, the stage fade, a whisper of grain so gradients don't band) and a light sharpen.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { quality } from './quality';

/** What a scene wants from the post pipeline (it may change these every frame). */
export interface Look {
  /** Ambient occlusion (campuses). */
  ao: boolean;
  /** Tilt-shift blur strength (0 = off): a sharp band across the screen. Scenes with `dof` don't use it. */
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
  /** The tone curve: 'neutral' (the default: colours as lit) or 'filmic' (ACES: deeper shadows, highlights roll off). */
  tone?: 'neutral' | 'filmic';
  /** Exposure before the tone curve (default 1). */
  exposure?: number;
  /**
   * Depth of field from the depth buffer: `focus` = the distance from the camera that's sharp (world units),
   * `range` = how far either side stays sharp, as a share of it, `max` = the most blur (pixels on a 1080p screen).
   */
  dof?: { focus: number; range: number; max: number };
  /** An S-curve on the finished picture (0 = none, the default). */
  contrast?: number;
  /** Sharpening of the finished picture (0 = none, the default). */
  sharpen?: number;
  /** Saturation on top of the era's own (1 = as is, the default). */
  saturation?: number;
}

export const defaultLook = (): Look => ({ ao: false, tilt: 0, focus: 0.45, bloom: 0.2, bloomThreshold: 1.4, vignette: 0.3 });

const quadVS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

/**
 * A separable blur (run across, then down) whose radius comes from the depth buffer (`dof`) or from the screen band
 * (`tilt`); the first run also lays the ambient occlusion in.
 */
const BLUR_FS = /* glsl */ `
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tAO;
uniform float aoK; uniform vec2 dir; uniform vec2 res; uniform vec2 clip;
// x: focus distance, y: 1 / (the sharp range in world units), z: the most blur in pixels, w: on
uniform vec4 dof;
// x: strength, y: focus (0 bottom .. 1 top)
uniform vec2 tilt;
varying vec2 vUv;
// a colour that can be trusted: one non-finite pixel (NaN or Inf, from any shader or a driver's quirk) would be
// smeared over every pixel the blur reaches. (Lookups at level 0: the taps sit in branches that differ per pixel,
// where implicit derivatives are undefined.)
// (tested on the bits: a fast-math compiler may fold a float comparison as if NaN couldn't happen)
bool finite3(vec3 c) { uvec3 e = floatBitsToUint(c) & 0x7f800000u; return all(notEqual(e, uvec3(0x7f800000u))); }
vec4 fin(vec4 c) { return finite3(c.rgb) ? c : vec4(0.0, 0.0, 0.0, 1.0); }
vec4 tap(vec2 uv) { return fin(textureLod(tColor, uv, 0.0)); }
float viewDist(vec2 uv) { float d = textureLod(tDepth, uv, 0.0).x; return clip.x * clip.y / (clip.y - d * (clip.y - clip.x)); }
float coc(float z) {
  // the sky stays crisp (its stars and the sun's disc are points)
  if (z > clip.y * 0.9) return 0.0;
  return smoothstep(1.0, 3.4, abs(z - dof.x) * dof.y) * dof.z;
}
void main() {
  vec4 c = tap(vUv);
  if (dof.w > 0.5) {
    float z0 = viewDist(vUv);
    float r0 = coc(z0);
    if (r0 > 0.4) {
      vec3 sum = c.rgb; float ws = 1.0;
      for (int i = 1; i <= TAPS; i++) {
        float w0 = exp(-float(i * i) / (float(TAPS * TAPS) * 0.25));
        for (int s = -1; s <= 1; s += 2) {
          vec2 uv = vUv + dir * (float(i * s) * r0 / float(TAPS)) / res;
          #if GUARD == 1
            // something sharp in front keeps its edge: it doesn't smear over the blur behind it
            float zs = viewDist(uv);
            float w = w0 * (zs < z0 ? clamp(coc(zs) / r0, 0.0, 1.0) : 1.0);
          #else
            float w = w0;
          #endif
          sum += tap(uv).rgb * w; ws += w;
        }
      }
      c.rgb = sum / ws;
    }
  } else if (tilt.x > 0.01) {
    float k = smoothstep(0.16, 0.56, abs(vUv.y - tilt.y)) * tilt.x;
    if (k > 0.01) {
      vec4 sum = vec4(0.0); float ws = 0.0;
      for (int i = -6; i <= 6; i++) { float w = exp(-float(i * i) / 16.0); sum += tap(vUv + dir * float(i) * k / res) * w; ws += w; }
      c = sum / ws;
    }
  }
  if (aoK > 0.0) {
    float ao = textureLod(tAO, vUv, 0.0).r;
    if ((floatBitsToUint(ao) & 0x7f800000u) == 0x7f800000u) ao = 1.0;
    c.rgb *= mix(1.0, ao, aoK);
  }
  gl_FragColor = c;
}`;

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

/** Exposure, tone curve, display encoding, then the grade. */
const FILM_FS = /* glsl */ `
uniform sampler2D tColor; uniform vec2 res;
uniform float exposure; uniform int tone; uniform float sharpen; uniform float contrast;
uniform float vignette; uniform float fade; uniform vec3 fadeColor; uniform vec3 tint; uniform float sat; uniform float lift;
varying vec2 vUv;
#include <tonemapping_pars_fragment>
vec3 develop(vec3 hdr) {
  hdr = max(hdr, 0.0) * exposure;
  vec3 c = clamp(tone == 1 ? ACESFilmicToneMapping(hdr) : NeutralToneMapping(hdr), 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main(){
  vec3 hdr = texture2D(tColor, vUv).rgb;
  if (sharpen > 0.0) {
    // sharpen the brightness before the picture is developed, never past the neighbourhood's own range (crisp
    // edges, no halos)
    vec2 px = 1.0 / res;
    const vec3 W = vec3(0.299, 0.587, 0.114);
    float l0 = dot(hdr, W);
    float a = dot(texture2D(tColor, vUv + vec2(px.x, 0.0)).rgb, W), b = dot(texture2D(tColor, vUv - vec2(px.x, 0.0)).rgb, W);
    float u = dot(texture2D(tColor, vUv + vec2(0.0, px.y)).rgb, W), d = dot(texture2D(tColor, vUv - vec2(0.0, px.y)).rgb, W);
    float lo = min(l0, min(min(a, b), min(u, d))), hi = max(l0, max(max(a, b), max(u, d)));
    hdr *= clamp(l0 + (l0 - (a + b + u + d) * 0.25) * sharpen * 1.6, lo, hi) / max(l0, 1e-4);
  }
  vec3 c = develop(hdr);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, sat) * tint + lift;
  c = mix(c, c * c * (3.0 - 2.0 * c), contrast);
  vec2 p = vUv - 0.5; p.x *= 1.2;
  c *= 1.0 - vignette * smoothstep(0.25, 0.85, length(p));
  c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 160.0;
  c = mix(c, fadeColor, fade);
  gl_FragColor = vec4(c, 1.0);
}`;

export class Post {
  /** The scene as lit: HDR colour (multisampled on the high preset) and its depth. */
  private rtScene: THREE.WebGLRenderTarget;
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  /** The finished picture, when FXAA still has to run over it. */
  private rtOut: THREE.WebGLRenderTarget | null = null;
  private gtao: GTAOPass | null = null;
  private bloom: UnrealBloomPass;
  private fxaa: FXAAPass | null = null;
  private quad = new FullScreenQuad();
  private blur: THREE.ShaderMaterial;
  private film: THREE.ShaderMaterial;
  private size = new THREE.Vector2();

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, ao: boolean, private samples = 4) {
    const hdr = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: false };
    this.rtScene = new THREE.WebGLRenderTarget(1, 1, { ...hdr, depthBuffer: true, samples, depthTexture: new THREE.DepthTexture(1, 1) });
    this.rtA = new THREE.WebGLRenderTarget(1, 1, hdr);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, hdr);
    if (ao) {
      // from the scene's own depth (normals rebuilt from it): no second render of the scene. At half resolution,
      // a quarter of the pixels for the costliest effect; denoised and blended back up it looks the same.
      this.gtao = new GTAOPass(scene, camera, 1, 1);
      this.gtao.setGBuffer(this.rtScene.depthTexture!);
      this.gtao.output = GTAOPass.OUTPUT.Off;
      this.gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: 12 });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      // three's GTAO takes sqrt(1 - cos²) and acos(cos) of horizon cosines that are dot products of unit vectors:
      // they round past ±1 where a normal rebuilt from depth stands square to the view (silhouettes, far ground at a
      // grazing angle), and the NaN that gives would be spread by the denoiser into a dark blot
      const gm = this.gtao.gtaoMaterial;
      const horizon = 'vec2 sinHorizons = sqrt(1. - cosHorizons * cosHorizons);';
      if (gm.fragmentShader.includes(horizon)) {
        gm.fragmentShader = gm.fragmentShader.replace(horizon, 'cosHorizons = clamp(cosHorizons, -1., 1.);\n\t\t\t\tvec2 sinHorizons = sqrt(max(1. - cosHorizons * cosHorizons, 0.));');
        gm.needsUpdate = true;
      } else console.warn('post: the GTAO shader changed shape; its horizon clamp is not in');
    }
    this.blur = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tDepth: { value: this.rtScene.depthTexture }, tAO: { value: null }, aoK: { value: 0 }, dir: { value: new THREE.Vector2(1, 0) },
        res: { value: new THREE.Vector2(1, 1) }, clip: { value: new THREE.Vector2(1, 1000) }, dof: { value: new THREE.Vector4() }, tilt: { value: new THREE.Vector2() },
      },
      // high: six taps a side, each checked against the depth; below it four, unchecked (half the texture reads)
      defines: { TAPS: quality.level === 'high' ? 6 : 4, GUARD: quality.level === 'high' ? 1 : 0 },
      vertexShader: quadVS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false,
    });
    this.film = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, res: { value: new THREE.Vector2(1, 1) }, toneMappingExposure: { value: 1 }, exposure: { value: 1 }, tone: { value: 0 }, sharpen: { value: 0 }, contrast: { value: 0 },
        vignette: { value: 0.3 }, fade: { value: 0 }, fadeColor: { value: new THREE.Color(0x05050c) }, tint: { value: new THREE.Vector3(1, 1, 1) }, sat: { value: 1 }, lift: { value: 0 },
      },
      vertexShader: quadVS, fragmentShader: FILM_FS, depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.55, 1.4);
    // The bloom blurs its input through five ever coarser levels, so a single non-finite pixel (NaN or Inf, from any
    // shader or a driver's quirk) comes out as a large flashing square: on the globe in v0.14.1, through WebKitGTK,
    // that was one pixel of the sky's reflection on the sea. The causes are fixed where they were; its way in drops
    // any such pixel as well, so one bad pixel stays one pixel.
    const hp = this.bloom.materialHighPassFilter;
    const read = 'vec4 texel = texture2D( tDiffuse, vUv );';
    if (hp.fragmentShader.includes(read)) {
      // (tested on the bits: a fast-math compiler may fold a float comparison as if NaN couldn't happen)
      const test = 'any( equal( floatBitsToUint( texel.rgb ) & 0x7f800000u, uvec3( 0x7f800000u ) ) )';
      hp.fragmentShader = hp.fragmentShader.replace(read, `${read}\n\t\t\tif ( ${test} ) texel = vec4( 0.0 );`);
      hp.needsUpdate = true;
    } else console.warn('post: the bloom high-pass changed shape; its non-finite guard is not in');
    // no MSAA (the medium and low presets): a cheap FXAA pass keeps edges from stair-stepping
    if (!samples) {
      this.fxaa = new FXAAPass();
      this.fxaa.renderToScreen = true;
      this.rtOut = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: false });
    }
    this.resize();
  }

  resize() {
    const size = this.renderer.getSize(this.size);
    const pr = this.renderer.getPixelRatio();
    const w = Math.max(1, Math.round(size.x * pr)), h = Math.max(1, Math.round(size.y * pr));
    this.rtScene.setSize(w, h);
    this.rtA.setSize(w, h);
    this.rtB.setSize(w, h);
    this.rtOut?.setSize(w, h);
    this.gtao?.setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
    this.bloom.setSize(w, h);
    this.fxaa?.setSize(w, h);
    this.blur.uniforms.res.value.set(w, h);
    this.film.uniforms.res.value.set(w, h);
  }

  private pass(mat: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(to);
    this.quad.render(this.renderer);
  }

  render(dt: number, look: Look, fade: number, era = 1) {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.render(this.scene, this.camera);
    let src = this.rtScene;
    const ao = !!this.gtao && look.ao;
    if (ao) this.gtao!.render(r, this.rtA, this.rtScene, dt, false);
    // the blur: by depth where the scene gives a focus distance, else the screen band (if it wants one)
    const bu = this.blur.uniforms;
    const dof = look.dof && look.dof.max > 0.01 ? look.dof : null;
    // (the low preset skips the blur and the sharpen: two full-screen passes fewer)
    const blurry = quality.level !== 'low' && (!!dof || look.tilt > 0.01);
    if (ao || blurry || this.samples > 0) {
      const h = this.film.uniforms.res.value.y;
      bu.clip.value.set(this.camera.near, this.camera.far);
      if (dof) bu.dof.value.set(dof.focus, 1 / Math.max(0.01, dof.range * dof.focus), (dof.max * h) / 1080, 1);
      else bu.dof.value.set(0, 0, 0, 0);
      bu.tilt.value.set(look.tilt, look.focus);
      bu.tColor.value = src.texture;
      bu.tAO.value = ao ? this.gtao!.pdRenderTarget.texture : null;
      bu.aoK.value = ao ? 0.85 : 0;
      bu.dir.value.set(1, 0);
      this.pass(this.blur, this.rtA);
      src = this.rtA;
      if (blurry) {
        bu.tColor.value = src.texture;
        bu.aoK.value = 0;
        bu.dir.value.set(0, 1);
        this.pass(this.blur, this.rtB);
        src = this.rtB;
      }
    }
    if (look.bloom > 0.01) {
      this.bloom.strength = look.bloom;
      this.bloom.threshold = look.bloomThreshold;
      // adds its glow onto the picture in place
      this.bloom.render(r, this.rtA, src, dt, false);
    }
    const gr = ERA_GRADES[Math.max(0, Math.min(4, era))];
    const fu = this.film.uniforms;
    fu.tColor.value = src.texture;
    fu.exposure.value = look.exposure ?? 1;
    fu.tone.value = look.tone === 'filmic' ? 1 : 0;
    fu.sharpen.value = quality.level === 'low' ? 0 : look.sharpen ?? 0;
    fu.contrast.value = look.contrast ?? 0;
    fu.tint.value.set(...gr.tint);
    fu.sat.value = gr.sat * (look.saturation ?? 1);
    fu.lift.value = gr.lift;
    fu.vignette.value = look.vignette;
    fu.fade.value = Math.max(0, Math.min(1, fade));
    if (this.fxaa && this.rtOut && look.fxaa !== false) {
      this.pass(this.film, this.rtOut);
      this.fxaa.render(r, this.rtA, this.rtOut, dt, false);
    } else this.pass(this.film, null);
  }

  dispose() {
    this.rtScene.depthTexture?.dispose();
    for (const t of [this.rtScene, this.rtA, this.rtB, this.rtOut]) t?.dispose();
    this.gtao?.dispose();
    this.bloom.dispose();
    this.fxaa?.dispose();
    this.blur.dispose();
    this.film.dispose();
    this.quad.dispose();
  }
}
