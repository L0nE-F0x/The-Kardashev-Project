/**
 * The photo studio: one small WebGL renderer of its own (the only context the portraits add to the game's), made on
 * the first portrait asked for. A shot goes in, a picture comes out as a data URL, at once: the interface puts it
 * straight into an `<img>` while a panel renders. Where there is no DOM or no WebGL (Node, tests) it returns ''.
 *
 * The light is the game's: a soft warm key from the upper left with a soft shadow, a cool rim from behind on the
 * right, sky and bounce fill. The camera is a long lens, level with the chin.
 *
 * The picture never touches the WebGL canvas: the scene renders at twice the size into an HDR target, a second pass
 * develops it (2×2 box filter, tone curve, sRGB) into an 8-bit target, and `readPixels` brings that back. Reading
 * the canvas itself (`toDataURL`) is not safe here: with an antialiased buffer Chrome was seen handing back
 * frames with whole meshes still missing (2026-11, ANGLE on the dev laptop's RTX).
 */
import * as THREE from 'three';
import type { Shot } from './parts';

/** The picture's size in pixels (shown at 40–120 CSS px, so twice the largest at 1×). */
export const PORTRAIT_PX = 240;
/**
 * How the picture is packed into its URL. JPEG at high quality: a 240 px PNG takes Chrome about 9 ms to encode, the
 * JPEG under 3, and at the sizes the interface shows them the two cannot be told apart.
 */
const FORMAT = 'image/jpeg';
const QUALITY = 0.95;
/** The scene is rendered this many times larger and filtered down (the antialiasing). */
const SUPER = 2;

/** The frame at the bust's depth: this many head-radii tall, centred a little under the head's middle. */
export const FRAME = { height: 3.4, centreY: -0.2 };

interface Studio {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The scene as lit: linear, HDR, at SUPER × the size. */
  raw: THREE.WebGLRenderTarget;
  /** The developed picture, 8 bits, top row first. */
  print: THREE.WebGLRenderTarget;
  develop: THREE.Mesh;
  developCam: THREE.OrthographicCamera;
  pixels: Uint8Array;
  paper: HTMLCanvasElement;
  ink: CanvasRenderingContext2D;
  lost: boolean;
}

let studio: Studio | null | undefined;

const DEVELOP = /* glsl */ `
  uniform sampler2D uRaw; uniform vec2 uTexel; varying vec2 vUv;
  // Khronos PBR Neutral: colours keep their hue, only the brightest highlights roll off
  vec3 neutral( vec3 c ) {
    float x = min( c.r, min( c.g, c.b ) );
    float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
    c -= offset;
    float peak = max( c.r, max( c.g, c.b ) );
    if ( peak < 0.76 ) return c;
    float d = 0.24;
    float newPeak = 1.0 - d * d / ( peak + d - 0.76 );
    c *= newPeak / peak;
    float g = 1.0 - 1.0 / ( 0.15 * ( peak - newPeak ) + 1.0 );
    return mix( c, vec3( newPeak ), g );
  }
  void main() {
    // the print is read back top row first
    vec2 uv = vec2( vUv.x, 1.0 - vUv.y );
    vec3 c = vec3( 0.0 );
    for ( int j = 0; j < ${SUPER}; j++ ) for ( int i = 0; i < ${SUPER}; i++ )
      c += texture2D( uRaw, uv + ( vec2( float( i ), float( j ) ) - ${((SUPER - 1) / 2).toFixed(1)} ) * uTexel ).rgb;
    c = neutral( c * ${(1.1 / (SUPER * SUPER)).toFixed(4)} );
    c = clamp( c, 0.0, 1.0 );
    c = mix( c * 12.92, 1.055 * pow( c, vec3( 0.41666 ) ) - 0.055, step( 0.0031308, c ) );
    gl_FragColor = vec4( c, 1.0 );
  }`;

function open(): Studio | null {
  if (studio !== undefined) return studio;
  studio = null;
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 4;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false });
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x000000, 1);

    const big = PORTRAIT_PX * SUPER;
    const raw = new THREE.WebGLRenderTarget(big, big, { type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    const print = new THREE.WebGLRenderTarget(PORTRAIT_PX, PORTRAIT_PX, { type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: false });
    const develop = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { uRaw: { value: raw.texture }, uTexel: { value: new THREE.Vector2(1 / big, 1 / big) } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
        fragmentShader: DEVELOP,
        depthTest: false,
        depthWrite: false,
      }),
    );
    develop.frustumCulled = false;
    const developCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const scene = new THREE.Scene();
    const fov = 17;
    const dist = FRAME.height / 2 / Math.tan((fov * Math.PI) / 360);
    const camera = new THREE.PerspectiveCamera(fov, 1, dist - 6, dist + 14);
    camera.position.set(0, FRAME.centreY, dist);
    camera.lookAt(0, FRAME.centreY, 0);

    // sky above, a warm bounce from below
    scene.add(new THREE.HemisphereLight(0xe6edff, 0x8a6f60, 1.9));
    // the key: warm, from the upper left, the only light that casts a shadow
    const key = new THREE.DirectionalLight(0xfff0dc, 2.1);
    key.position.set(-4.2, 5.2, 6.4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -3.2;
    sc.right = sc.top = 3.2;
    sc.near = 1;
    sc.far = 22;
    key.shadow.bias = -0.0015;
    key.shadow.normalBias = 0.035;
    key.shadow.radius = 5;
    key.shadow.intensity = 0.7;
    scene.add(key);
    // the rim: cool, from behind on the right, drawing the far edge of the head and shoulder
    const rim = new THREE.DirectionalLight(0xb4dcff, 3.2);
    rim.position.set(4.6, 2.6, -5);
    scene.add(rim);
    // a little fill from the front right so the shadow side keeps its colour
    const fill = new THREE.DirectionalLight(0xcfd8ff, 0.5);
    fill.position.set(4, 0.5, 6);
    scene.add(fill);

    const paper = document.createElement('canvas');
    paper.width = paper.height = PORTRAIT_PX;
    // read back often and never shown: keep it in memory, off the GPU
    const ink = paper.getContext('2d', { willReadFrequently: true });
    if (!ink) return null;

    const s: Studio = { renderer, scene, camera, raw, print, develop, developCam, pixels: new Uint8Array(PORTRAIT_PX * PORTRAIT_PX * 4), paper, ink, lost: false };
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); s.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { s.lost = false; });
    studio = s;
  } catch {
    studio = null;
  }
  return studio;
}

/**
 * Photograph a shot: a PNG data URL, or '' when there is nothing to photograph with (the caller should not cache '').
 */
export function shoot(make: () => Shot): string {
  const s = open();
  if (!s || s.lost || s.renderer.getContext().isContextLost()) return '';
  const shot = make();
  s.scene.add(shot.root);
  try {
    const r = s.renderer;
    r.setRenderTarget(s.raw);
    r.clear();
    r.render(s.scene, s.camera);
    r.setRenderTarget(s.print);
    r.render(s.develop, s.developCam);
    r.readRenderTargetPixels(s.print, 0, 0, PORTRAIT_PX, PORTRAIT_PX, s.pixels);
    r.setRenderTarget(null);
    const img = s.ink.createImageData(PORTRAIT_PX, PORTRAIT_PX);
    img.data.set(s.pixels);
    s.ink.putImageData(img, 0, 0);
    return s.paper.toDataURL(FORMAT, QUALITY);
  } catch {
    return '';
  } finally {
    s.scene.remove(shot.root);
  }
}

/** Whether a studio can be opened here (false in Node and where WebGL is off). */
export function studioReady(): boolean {
  return !!open();
}
