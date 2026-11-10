/**
 * Lakes and seas: a sheet cut from the ground's own grid, so the shore follows the land exactly. Each corner knows
 * how deep the water is under it: turquoise shallows over the sand, deep blue further out, a broken line of foam
 * where it meets the beach. Small waves ruffle the surface (the sun and the moon glint on them), and it mirrors the
 * sky more the lower you look across it (the atmosphere's own sky reflection, as on any smooth surface).
 */
import * as THREE from 'three';
import { cloudUniforms, col, grainTexture, withClouds, type Paint } from '../kit';

/** The sheet runs out to here beyond the ground's edge (the haze takes it long before). */
const FAR = 6000;

/**
 * The water's geometry: every cell of the ground grid with a corner under (or nearly under) the level, plus a
 * skirt from the grid's edge to the horizon. `heights` is the ground at each grid point, row by row.
 */
export function waterGeometry(xs: number[], zs: number[], heights: Float32Array, level: number): THREE.BufferGeometry {
  const ex = [-FAR, ...xs, FAR], ez = [-FAR, ...zs, FAR];
  const nx = ex.length, nz = ez.length, gx = xs.length, gz = zs.length;
  const depthAt = (i: number, j: number) => level - heights[Math.max(0, Math.min(gz - 1, j - 1)) * gx + Math.max(0, Math.min(gx - 1, i - 1))];
  const remap = new Int32Array(nx * nz).fill(-1);
  const pos: number[] = [], depth: number[] = [], idx: number[] = [];
  const vert = (i: number, j: number) => {
    const k = j * nx + i;
    if (remap[k] < 0) {
      remap[k] = pos.length / 3;
      pos.push(ex[i], 0, ez[j]);
      depth.push(depthAt(i, j));
    }
    return remap[k];
  };
  for (let j = 0; j + 1 < nz; j++)
    for (let i = 0; i + 1 < nx; i++) {
      // a little past the waterline, so the sheet tucks under the beach
      if (Math.max(depthAt(i, j), depthAt(i + 1, j), depthAt(i, j + 1), depthAt(i + 1, j + 1)) < -0.6) continue;
      const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** `shallow` over the sand, `deep` further out. */
export function waterMaterial(shallow: Paint, deep: Paint): THREE.MeshStandardMaterial {
  const m = withClouds(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.16, metalness: 0 }));
  const u = { uWShallow: { value: col(shallow) }, uWDeep: { value: col(deep) }, uGrain: { value: grainTexture() }, uWTime: cloudUniforms.uCloudTime };
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aDepth; varying float vWDepth; varying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWDepth = aDepth; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vWDepth; varying vec3 vWPos;
        uniform vec3 uWShallow; uniform vec3 uWDeep; uniform sampler2D uGrain; uniform float uWTime;
        float wFoam;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float d = max(vWDepth, 0.0);
          diffuseColor.rgb = mix(uWShallow, uWDeep, 1.0 - exp(-d * 0.3));
          // foam: a line that breathes in and out along the shore, broken up by the grain
          float n = texture2D(uGrain, vWPos.xz * 0.07 + vec2(uWTime * 0.021, uWTime * 0.013)).r;
          float reach = 0.42 + 0.16 * sin(uWTime * 0.7 + vWPos.x * 0.11 + vWPos.z * 0.07);
          wFoam = smoothstep(reach, reach * 0.35, vWDepth + (n - 0.5) * 0.5) * smoothstep(-0.5, -0.1, vWDepth);
          wFoam = max(wFoam, smoothstep(0.66, 0.74, n) * smoothstep(2.2, 0.3, vWDepth) * 0.45);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 0.96), wFoam * 0.85);
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // three layers of ripples sliding over each other, each turned a different way so the noise's own repeat
          // never lines up; they flatten with distance (no stripes or sparkle toward the horizon)
          float wd = distance(vWPos, cameraPosition);
          float amp = 0.5 / (1.0 + wd * 0.004 + wd * wd * 0.00002);
          vec2 p1 = mat2(0.866, 0.5, -0.5, 0.866) * vWPos.xz, p2 = mat2(0.342, -0.94, 0.94, 0.342) * vWPos.xz, p3 = mat2(-0.643, 0.766, -0.766, -0.643) * vWPos.xz;
          vec2 g = (texture2D(uGrain, p1 * 0.0213 + vec2(uWTime * 0.011, uWTime * 0.006)).rg - 0.5)
            + (texture2D(uGrain, p2 * 0.0871 - vec2(uWTime * 0.017, -uWTime * 0.012)).rg - 0.5) * 0.6
            + (texture2D(uGrain, p3 * 0.293 + vec2(-uWTime * 0.031, uWTime * 0.023)).gr - 0.5) * 0.3;
          normal = normalize((viewMatrix * vec4(normalize(vec3(g.x * amp, 1.0, g.y * amp)), 0.0)).xyz);
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.9, wFoam);');
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key() + '-water';
  return m;
}
