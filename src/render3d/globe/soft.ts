/**
 * The globe's lines: cables, fiber, power links, shipping routes. Each is a crisp core whose last pixel fades
 * (without MSAA a fat line's edges are drawn all-or-nothing per pixel and crawl as the globe turns), a soft glow
 * beside it, and, on the ones that carry something, comets of light running along it. All in one draw per line.
 */
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { quality } from '../quality';

/** Seconds, for the light running along the lines: the globe ticks it once a frame. */
export const lineClock = { value: 0 };
/** The view's size in CSS px, shared by every line (their widths are in those pixels): the globe sets it on resize. */
export const lineRes = { value: new THREE.Vector2(1280, 720) };

/** Lines, halos and markers are drawn after the clouds and the air (they're the map, not the planet). */
export const OVER_CLOUDS = 5;

export interface LineLook {
  color: THREE.ColorRepresentation;
  /** The core's width in CSS px. */
  width: number;
  opacity?: number;
  dashed?: boolean;
  dashSize?: number;
  gapSize?: number;
  /** How strong the glow beside the core is (0 = none; default a whisper). */
  glow?: number;
  /** Light running along it: world units between comets, units per second (negative runs it backwards). */
  pulse?: { gap: number; speed: number };
}

/** LineMaterial's fragment shader with the soft edges, the glow and the running light worked in (built once). */
let softFragment = '';
function soften(src: string) {
  return src
    .replace('uniform float linewidth;', 'uniform float linewidth; uniform float lineTime; uniform vec2 soft; uniform vec4 pulse;')
    // dashes: fade their ends over a pixel instead of cutting them (a line dashed only to carry pulses has no gap)
    .replace(
      /if \( mod\( vLineDistance \+ dashOffset, dashSize \+ gapSize \) > dashSize \) discard;[^\n]*/,
      `float dashM = mod( vLineDistance + dashOffset, dashSize + gapSize );
				float dashW = max( fwidth( vLineDistance ), 1e-5 );
				if ( gapSize > 0.0 ) alpha *= clamp( ( dashSize - dashM ) / dashW + 0.5, 0.0, 1.0 ) * clamp( dashM / dashW + 0.5, 0.0, 1.0 );
				// comets of light: bright at the head, a tail fading behind it
				if ( pulse.x > 0.0 ) {
					float ph = fract( ( vLineDistance - lineTime * pulse.y ) / pulse.x + pulse.z );
					if ( pulse.y < 0.0 ) ph = 1.0 - ph;
					float behind = ( 1.0 - ph ) * pulse.x;
					float comet = ( exp( -behind * 1.6 ) * 0.7 + exp( -behind * 0.4 ) * 0.3 ) * clamp( behind / dashW, 0.0, 1.0 );
					diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0 ), comet * 0.5 ) * ( 1.0 + comet * pulse.w );
				}`,
    )
    // the sides: a core whose outermost pixel fades, and the glow beyond it. No round caps: on the globe's paths
    // consecutive segments are all but straight, and caps overlapping at every join drew hard-edged, doubly
    // blended beads along the line
    .replace(
      'gl_FragColor = vec4( diffuseColor.rgb, alpha );',
      `#ifndef WORLD_UNITS
				if ( abs( vUv.y ) > 1.0 ) discard;
				float across = abs( vUv.x );
				float core = clamp( ( soft.x - across ) / max( fwidth( vUv.x ), 1e-5 ) + 0.5, 0.0, 1.0 );
				float halo = 1.0 - smoothstep( soft.x * 0.6, 1.0, across );
				alpha *= max( core, halo * halo * soft.y );
			#endif
			gl_FragColor = vec4( diffuseColor.rgb, alpha );`,
    );
}

/** A screen-space line material: anti-aliased core and dash ends, a glow, optional running light. */
export function softLineMaterial(p: LineLook) {
  // the low detail level keeps the bare line (fewer pixels to blend)
  const glow = quality.level === 'low' ? 0 : p.glow ?? 0.28;
  const core = p.width + 0.9; // a pixel wider than asked: the outermost one fades, so the line looks as wide as before
  const halo = glow > 0 ? 2.2 + p.width * 0.9 : 0;
  const m = new LineMaterial({
    color: new THREE.Color(p.color).getHex(),
    linewidth: core + halo * 2,
    transparent: true,
    opacity: p.opacity ?? 1,
    // (the line distance the pulses ride on only exists on dashed lines)
    dashed: !!p.dashed || !!p.pulse,
    dashSize: p.dashSize ?? 0.8,
    gapSize: p.dashed ? p.gapSize ?? 0.6 : 0,
    worldUnits: false,
    depthWrite: false,
  });
  m.fragmentShader = softFragment ||= soften(m.fragmentShader);
  m.uniforms.lineTime = lineClock;
  m.uniforms.resolution = lineRes;
  m.uniforms.soft = { value: new THREE.Vector2(core / (core + halo * 2), glow) };
  // gap, speed, a phase of its own (so neighbouring lines don't beat together), how far past white the head burns
  m.uniforms.pulse = { value: new THREE.Vector4(p.pulse?.gap ?? 0, p.pulse?.speed ?? 0, Math.random(), 1.8) };
  return m;
}

/** A soft line along points on the globe. */
export function softLine(pts: THREE.Vector3[], p: LineLook) {
  const g = new LineGeometry();
  g.setPositions(pts.flatMap((v) => [v.x, v.y, v.z]));
  const l = new Line2(g, softLineMaterial(p));
  if (p.dashed || p.pulse) l.computeLineDistances();
  l.renderOrder = OVER_CLOUDS;
  return l;
}
