/**
 * Anti-aliased lines and stars for the globe. Without MSAA (the medium and low detail levels) a fat line's
 * edges and a 1–2 pixel star are drawn all-or-nothing per pixel, so they crawl and twinkle as the globe turns;
 * these fade their last pixel instead, which keeps them steady at any speed.
 */
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { rng } from '../kit';

function softenLine(sh: THREE.WebGLProgramParametersWithUniforms) {
  sh.fragmentShader = sh.fragmentShader
    // dashes: fade their ends over a pixel instead of cutting them
    .replace(
      /if \( mod\( vLineDistance \+ dashOffset, dashSize \+ gapSize \) > dashSize \) discard;[^\n]*/,
      `float dashM = mod( vLineDistance + dashOffset, dashSize + gapSize );
				float dashW = max( fwidth( vLineDistance ), 1e-5 );
				alpha *= clamp( ( dashSize - dashM ) / dashW + 0.5, 0.0, 1.0 ) * clamp( dashM / dashW + 0.5, 0.0, 1.0 );`,
    )
    // the sides: the outermost pixel fades out
    .replace(
      'gl_FragColor = vec4( diffuseColor.rgb, alpha );',
      `#ifndef WORLD_UNITS
				alpha *= clamp( ( 1.0 - abs( vUv.x ) ) / max( fwidth( vUv.x ), 1e-5 ), 0.0, 1.0 );
			#endif
			gl_FragColor = vec4( diffuseColor.rgb, alpha );`,
    );
}

/** A screen-space line material whose edges (and dash ends) are anti-aliased. `width` is the look's width in CSS px. */
export function softLineMaterial(p: { color: THREE.ColorRepresentation; width: number; opacity?: number; dashed?: boolean; dashSize?: number; gapSize?: number }) {
  const m = new LineMaterial({
    color: new THREE.Color(p.color).getHex(),
    // a pixel wider than asked: the outermost one fades, so the line looks as wide as before
    linewidth: p.width + 0.9,
    transparent: true,
    opacity: p.opacity ?? 1,
    dashed: !!p.dashed,
    dashSize: p.dashSize ?? 0.8,
    gapSize: p.gapSize ?? 0.6,
    worldUnits: false,
    depthWrite: false,
  });
  m.onBeforeCompile = softenLine;
  return m;
}

/** A soft line along points on the globe. */
export function softLine(pts: THREE.Vector3[], p: Parameters<typeof softLineMaterial>[0]) {
  const g = new LineGeometry();
  g.setPositions(pts.flatMap((v) => [v.x, v.y, v.z]));
  const l = new Line2(g, softLineMaterial(p));
  if (p.dashed) l.computeLineDistances();
  return l;
}

/**
 * The starfield: round, soft stars (a small Gaussian per star, the same brightness wherever it falls between
 * pixels), a scatter of faint ones thickening along a Milky Way band. `pixelRatio` keeps them the same size on
 * screen whatever the 3D resolution.
 */
export function starField() {
  const r = rng(42);
  const pos: number[] = [];
  const col: number[] = [];
  const size: number[] = [];
  // the band's pole (a tilted great circle)
  const pole = new THREE.Vector3(0.35, 0.82, -0.45).normalize();
  const v = new THREE.Vector3();
  for (let i = 0; i < 4200; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, k = Math.sqrt(1 - u * u);
    v.set(Math.cos(a) * k, u, Math.sin(a) * k);
    const band = Math.exp(-((v.dot(pole) / 0.16) ** 2));
    // most stars are faint; the band keeps more of its faint ones
    const mag = Math.pow(r(), 2.6);
    if (i >= 2200 && r() > band) continue;
    pos.push(v.x * 2500, v.y * 2500, v.z * 2500);
    const b = 0.22 + mag * 0.62, warm = r();
    col.push(b * (0.92 + warm * 0.08), b * (0.92 + warm * 0.04), b * (0.9 + (1 - warm) * 0.12));
    size.push(0.75 + mag * 0.75);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: 1 } },
    vertexShader: `attribute float size; attribute vec3 color; uniform float pixelRatio; varying vec3 vC; varying float vK;
      void main(){ vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // a sprite five sigmas wide; sigma = size × 0.6 CSS px, never under 0.65 device px (or it would alias)
        float sig = max(size * 0.6 * pixelRatio, 0.65);
        gl_PointSize = ceil(sig * 5.0) + 1.0; vK = gl_PointSize / sig; }`,
    fragmentShader: `varying vec3 vC; varying float vK;
      void main(){ vec2 q = (gl_PointCoord - 0.5) * vK; float g = exp(-dot(q, q) * 0.5); if (g < 0.01) discard;
        gl_FragColor = vec4(vC * g, 1.0); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}
