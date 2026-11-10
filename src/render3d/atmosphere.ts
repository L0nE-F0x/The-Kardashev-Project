/**
 * The campus atmosphere, given to every material through three's own shader chunks (so the 150-odd materials the
 * pieces make need no changes):
 * - aerial haze in place of the linear fog: an exponential height fog integrated along the view ray, tinted toward
 *   the sun (warm in-scatter when you look sunward, the cool sky colour away from it);
 * - the lamp field: the campus's lamps drawn from straight above into a texture, which lights the ground, walls,
 *   cars and people near them at night (hundreds of lamps for the price of one texture read);
 * - the sky mirrored in anything smooth (glass, solar panels, water).
 * Both only act in scenes with `scene.fog` set (the campuses); the globe, orbit and system views compile them out.
 */
import * as THREE from 'three';

/** Shared uniforms: the sky sets the haze and the sun each frame, the scene owns the lamp field. */
export const atmo = {
  /** Unit vector to the light the haze scatters (the sun, the moon at night), world space. */
  uAtmoSun: { value: new THREE.Vector3(0, 1, 0) },
  /** The haze's colour looking toward that light (the scene's fog colour is what it is looking away). */
  uAtmoGlow: { value: new THREE.Color(0xffffff) },
  /** x: 1 / the distance the haze takes hold at (at the base height), y: falloff with height (1/m), z: base height, w: the most it may hide. */
  uAtmoHaze: { value: new THREE.Vector4(0, 0.01, 0, 1) },
  /** How wet the land is (rain: 1): level ground darkens and turns glossy, so it mirrors the sky. */
  uAtmoWet: { value: 0 },
  /** The sky as water and glass see it: its zenith and horizon colours as lit now. */
  uAtmoSkyTop: { value: new THREE.Color(0x3a7fd8) },
  uAtmoSkyHor: { value: new THREE.Color(0xcfe6f6) },
  uLampTex: { value: null as THREE.Texture | null },
  /** The lamp field's footprint: x0, z0, 1/width, 1/depth. */
  uLampBox: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** x: strength (0 by day), y: ground height, z: how far above it the lamps still reach. */
  uLampK: { value: new THREE.Vector3(0, 0, 12) },
};

/** Lamp pools live on this layer: the main camera doesn't draw them, the lamp field's camera draws nothing else. */
export const LAMP_LAYER = 5;

// Patched as this module loads: kit.ts imports it before it makes its first material.
{
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = /* glsl */ `#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;
  // world position from the view position (the view matrix is a rotation and a translation)
  C.fog_vertex = /* glsl */ `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorld = ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix );
#endif`;
  C.fog_pars_fragment = /* glsl */ `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  uniform vec3 uAtmoSun;
  uniform vec3 uAtmoGlow;
  uniform vec4 uAtmoHaze;
  uniform vec3 uAtmoSkyTop;
  uniform vec3 uAtmoSkyHor;
  uniform float uAtmoWet;
  uniform sampler2D uLampTex;
  uniform vec4 uLampBox;
  uniform vec3 uLampK;
#endif`;
  C.fog_fragment = /* glsl */ `#ifdef USE_FOG
  {
    vec3 hv = vFogWorld - cameraPosition;
    float hd = length( hv );
    vec3 hdir = hv / max( hd, 1e-4 );
    // density falls off with height: integrate it along the ray from the camera to the surface
    float hk = uAtmoHaze.y * hv.y;
    float hint = abs( hk ) > 1e-3 ? ( 1.0 - exp( - hk ) ) / hk : 1.0;
    float hod = uAtmoHaze.x * hd * exp( - uAtmoHaze.y * max( cameraPosition.y - uAtmoHaze.z, 0.0 ) ) * hint;
    // squared: the campus itself stays clear, the far land goes quickly (and the edge of the world is never seen)
    float hf = min( uAtmoHaze.w, 1.0 - exp( - hod * hod ) );
    float hsun = max( dot( hdir, uAtmoSun ), 0.0 );
    // the same sum the sky dome makes at the horizon, so land and sky meet without a seam
    vec3 hcol = fogColor + uAtmoGlow * ( pow( hsun, 5.0 ) * 0.42 );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, hcol, hf );
  }
#endif`;
  // rain: whatever lies level is wet (darker, and glossy where the water stands in patches)
  C.lights_physical_fragment += /* glsl */ `
#if defined( USE_FOG )
  if ( uAtmoWet > 0.0 ) {
    float wetUp = inverseTransformDirection( normal, viewMatrix ).y;
    float wetK = uAtmoWet * smoothstep( 0.8, 0.97, wetUp );
    // water only stands on what is truly level (roads, yards, roofs): rough ground and grass just darken
    float wetPatch = smoothstep( 0.1, 0.6, sin( vFogWorld.x * 0.21 + sin( vFogWorld.z * 0.13 ) * 2.0 ) * sin( vFogWorld.z * 0.17 + sin( vFogWorld.x * 0.09 ) * 2.0 ) );
    material.diffuseColor *= 1.0 - 0.3 * wetK;
    material.roughness = mix( material.roughness, 0.16, uAtmoWet * smoothstep( 0.992, 0.9995, wetUp ) * ( 0.25 + 0.75 * wetPatch ) );
  }
#endif`;
  // the lamps join the indirect light
  C.lights_fragment_end = /* glsl */ `#if defined( USE_FOG ) && defined( RE_IndirectDiffuse )
  if ( uLampK.x > 0.001 ) {
    vec3 lampN = inverseTransformDirection( geometryNormal, viewMatrix );
    vec3 lamp = texture2D( uLampTex, ( vFogWorld.xz - uLampBox.xy ) * uLampBox.zw ).rgb;
    float lampH = 1.0 - smoothstep( uLampK.z * 0.35, uLampK.z, vFogWorld.y - uLampK.y );
    // floors take it all, walls most of it, undersides none; the surface's colour tints it only half way (a warm
    // lamp on grass reads as lamplight, not as lime green)
    vec3 lampAlbedo = mix( material.diffuseColor, vec3( dot( material.diffuseColor, vec3( 0.3333 ) ) ), 0.5 );
    reflectedLight.indirectDiffuse += lamp * lampAlbedo * ( RECIPROCAL_PI * uLampK.x * lampH * smoothstep( -0.3, 0.15, lampN.y ) * mix( 0.6, 1.0, max( lampN.y, 0.0 ) ) );
  }
#endif
#if defined( USE_FOG ) && defined( STANDARD )
  // smooth things mirror the sky (glass, solar panels, water, polished metal): the dome's own gradient along the
  // reflected ray, by the surface's Fresnel; it fades out as the surface gets rougher
  if ( material.roughness < 0.6 ) {
    vec3 skyV = normalize( cameraPosition - vFogWorld );
    vec3 skyN = inverseTransformDirection( geometryNormal, viewMatrix );
    vec3 skyR = reflect( - skyV, skyN );
    vec3 sky = mix( uAtmoSkyHor, uAtmoSkyTop, 1.0 - pow( 1.0 - clamp( skyR.y, 0.0, 1.0 ), 5.0 ) );
    // a ray that dips under the horizon meets the land, not the sky
    sky *= mix( 0.3, 1.0, smoothstep( -0.25, 0.04, skyR.y ) );
    reflectedLight.indirectSpecular += sky * F_Schlick( material.specularColor, material.specularF90, max( dot( skyN, skyV ), 0.0 ) ) * ( 1.0 - material.roughness / 0.6 );
  }
#endif
` + C.lights_fragment_end;
  // Every material gets the shared uniforms, whatever hook a piece gives it: assigning `onBeforeCompile` wraps the
  // hook (its text still keys the program cache, as three's default key expects).
  type Hook = THREE.Material['onBeforeCompile'];
  const hooks = new WeakMap<THREE.Material, Hook>();
  const plain: Hook = (sh) => { Object.assign(sh.uniforms, atmo); };
  plain.toString = () => '';
  Object.defineProperty(THREE.Material.prototype, 'onBeforeCompile', {
    configurable: true,
    get(this: THREE.Material) { return hooks.get(this) ?? plain; },
    set(this: THREE.Material, fn: Hook) {
      const wrapped: Hook = (sh, r) => { fn.call(this, sh, r); Object.assign(sh.uniforms, atmo); };
      wrapped.toString = () => fn.toString();
      hooks.set(this, wrapped);
    },
  });
}

/**
 * The lamps of a campus as a texture: every light pool (see `lightPool` in kit.ts) drawn additively from above.
 * The scene re-draws it now and then (lamps appear as buildings finish); materials read it through `atmo`.
 */
export class LampField {
  private readonly rt: THREE.WebGLRenderTarget;
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
  private readonly clear = new THREE.Color(0, 0, 0);
  private readonly prev = new THREE.Color();

  constructor(size = 1024) {
    this.rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.cam.layers.set(LAMP_LAYER);
    this.cam.up.set(0, 0, -1);
  }

  /** Cover this footprint (plus a margin so no pool is cut off at the edge). */
  fit(x0: number, z0: number, x1: number, z1: number, margin = 60) {
    x0 -= margin; z0 -= margin; x1 += margin; z1 += margin;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    this.cam.position.set(cx, 1000, cz);
    this.cam.lookAt(cx, 0, cz);
    this.cam.left = -w / 2; this.cam.right = w / 2; this.cam.top = d / 2; this.cam.bottom = -d / 2;
    this.cam.updateProjectionMatrix();
    // the camera's up is −z: the texture's v runs from the south edge (z1) to the north edge (z0)
    atmo.uLampBox.value.set(x0, z1, 1 / w, -1 / d);
    atmo.uLampTex.value = this.rt.texture;
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    const target = renderer.getRenderTarget();
    const auto = renderer.shadowMap.autoUpdate, alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.prev);
    const bg = scene.background;
    scene.background = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(this.clear, 1);
    renderer.clear();
    renderer.render(scene, this.cam);
    renderer.setRenderTarget(target);
    renderer.setClearColor(this.prev, alpha);
    renderer.shadowMap.autoUpdate = auto;
    scene.background = bg;
  }

  dispose() {
    if (atmo.uLampTex.value === this.rt.texture) atmo.uLampTex.value = null;
    this.rt.dispose();
  }
}
