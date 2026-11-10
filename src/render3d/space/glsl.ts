/** Shader building blocks the space views share: hashes, value noise, fbm, cell noise. */

export const NOISE = /* glsl */ `
  float hash13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  vec3 hash33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
  float vnoise(vec3 p){
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p, int oct){
    float s = 0.0, a = 0.5, n = 0.0;
    for (int i = 0; i < oct; i++) { s += a * vnoise(p); n += a; a *= 0.5; p = p * 2.03 + 17.1; }
    return s / n;
  }
  /** Distances to the nearest and second-nearest feature point (points drift with w, so cells boil). */
  vec2 cells(vec3 p, float w){
    vec3 i = floor(p), f = fract(p); vec2 d = vec2(8.0);
    for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
      vec3 g = vec3(x, y, z), o = hash33(i + g);
      o = 0.5 + 0.42 * sin(w + 6.2831 * o);
      float l = length(g + o - f);
      if (l < d.x) { d.y = d.x; d.x = l; } else if (l < d.y) d.y = l;
    }
    return d;
  }`;

/** Ends a fragment shader the way three's own materials do (tone mapping only when drawn straight to the screen). */
export const OUTPUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;
