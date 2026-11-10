/**
 * Anti-aliased lines for the globe. Without MSAA (the medium and low detail levels) a fat line's edges are drawn
 * all-or-nothing per pixel, so they crawl as the globe turns; these fade their last pixel instead, which keeps
 * them steady at any speed.
 */
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

function softenLine(sh: THREE.WebGLProgramParametersWithUniforms) {
  sh.fragmentShader = sh.fragmentShader
    // dashes: fade their ends over a pixel instead of cutting them
    .replace(
      /if \( mod\( vLineDistance \+ dashOffset, dashSize \+ gapSize \) > dashSize \) discard;[^\n]*/,
      `float dashM = mod( vLineDistance + dashOffset, dashSize + gapSize );
				float dashW = max( fwidth( vLineDistance ), 1e-5 );
				alpha *= clamp( ( dashSize - dashM ) / dashW + 0.5, 0.0, 1.0 ) * clamp( dashM / dashW + 0.5, 0.0, 1.0 );`,
    )
    // the sides: the outermost pixel fades out. No round caps: on the globe's paths consecutive segments are all
    // but straight, and caps overlapping at every join drew hard-edged, doubly blended beads along the line
    .replace(
      'gl_FragColor = vec4( diffuseColor.rgb, alpha );',
      `#ifndef WORLD_UNITS
				if ( abs( vUv.y ) > 1.0 ) discard;
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
