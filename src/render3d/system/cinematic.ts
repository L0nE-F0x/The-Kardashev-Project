/**
 * The Type I ending's camera, directed as one unbroken pull-back:
 *   0 s   the Earth's night side fills the frame, city lights under a thin blue rim
 *   2 s   the Sun breaks over the limb
 *   4 s   back past the Moon, the Earth shrinking to a marble
 *   6 s   up out of the ecliptic; behind the Earth the swarm turns to the Sun and catches fire,
 *         the light running both ways round the ring
 *  11 s   the two fronts meet beyond the Sun
 *  13 s   the whole inner system, held: then a slow drift for as long as the epilogues take
 * The game moves on by itself 16 s in (game.ts), so the move is timed to land with a few seconds to
 * look at it. Everything is laid out in a frame that turns with the Earth (x from the Sun out through
 * the Earth, z ahead along its orbit), so the shot composes the same whatever the date.
 */
import * as THREE from 'three';

/** Seconds from the first frame to the held one. */
export const CINE_LENGTH = 13;
/** When the scene tells the game the cinematic is over (the game also has its own 16 s limit). */
export const CINE_DONE = 15.6;

type Key = [t: number, v: number];
/** A smooth curve through keys (Catmull–Rom over uneven times, flat past the ends). */
function track(keys: Key[]) {
  return (t: number) => {
    if (t <= keys[0][0]) return keys[0][1];
    const n = keys.length - 1;
    if (t >= keys[n][0]) return keys[n][1];
    let i = 0;
    while (t > keys[i + 1][0]) i++;
    const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
    const slope = (a: Key, b: Key) => (b[1] - a[1]) / (b[0] - a[0]);
    const m0 = i > 0 ? (slope(keys[i - 1], keys[i]) + slope(keys[i], keys[i + 1])) / 2 : 0;
    const m1 = i + 1 < n ? (slope(keys[i], keys[i + 1]) + slope(keys[i + 1], keys[i + 2])) / 2 : 0;
    const h = t1 - t0, u = (t - t0) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * h * m1;
  };
}
const smoother = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * t * (t * (t * 6 - 15) + 10); };

// near the Earth: the camera's bearing from the anti-sun line (radians, towards the way the Earth is going), its
// height, and its distance in Earth radii (as a logarithm: a steady pull-back covers ground like "Powers of Ten")
const az = track([[0, 0.2], [2.2, 0.36], [4.5, 0.62], [8, 0.9]]);
const el = track([[0, 0.07], [2.5, 0.1], [5, 0.2], [8, 0.34]]);
const logD = track([[0, Math.log(2.75)], [1.6, Math.log(2.95)], [3.2, Math.log(3.9)], [5, Math.log(7.5)], [8, Math.log(34)]]);
// the frame starts on the limb the Sun will rise over, then finds the Earth's middle
const side = track([[0, 0.92], [2.6, 0.7], [5, 0]]);

export interface CineShot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  /** The swarm's ignition front, in radians round the ring from the Earth (π = all of it). */
  wave: number;
  /** 0..1: orbit lines and the far planets' presence. */
  system: number;
  /** Bloom on top of the scene's own (the sunrise, the ring closing). */
  glow: number;
}

/** The held frame: where the camera ends up, in the Earth's turning frame (distance from the Sun, bearing, height). */
const END = { dist: 930, az: 0.62, el: 0.4 };

/** The way the held frame looks, given the Earth's angle round its orbit by then (the sky is composed for it). */
export function cineEndView(earthAngle: number) {
  const a = earthAngle + END.az;
  return new THREE.Vector3(-Math.cos(END.el) * Math.cos(a), -Math.sin(END.el), -Math.cos(END.el) * Math.sin(a));
}

/**
 * The shot at `t` seconds. `earth`: where the Earth is. `re`: its radius. Fills and returns `out`.
 */
export function cineShot(t: number, earth: THREE.Vector3, re: number, out: CineShot): CineShot {
  const x = new THREE.Vector3(earth.x, 0, earth.z).normalize(), y = new THREE.Vector3(0, 1, 0), z = new THREE.Vector3().crossVectors(x, y);
  const at = (a: number, e: number, d: number) => new THREE.Vector3().addScaledVector(x, Math.cos(e) * Math.cos(a) * d).addScaledVector(y, Math.sin(e) * d).addScaledVector(z, Math.cos(e) * Math.sin(a) * d);
  // by the Earth
  const near = at(az(t), el(t), Math.exp(logD(t)) * re).add(earth);
  const nearLook = earth.clone().addScaledVector(z, side(t) * re);
  // the held frame, drifting on round the Sun for as long as it is watched
  const drift = Math.max(0, t - CINE_LENGTH + 2);
  const far = at(END.az + drift * 0.011, END.el + Math.sin(drift * 0.05) * 0.02, END.dist - Math.min(120, drift * 1.6));
  const farLook = new THREE.Vector3(0, -34, 0).addScaledVector(x, 26);
  const w = smoother(4.4, CINE_LENGTH, t);
  out.pos.copy(near).lerp(far, w);
  out.look.copy(nearLook).lerp(farLook, smoother(4.8, CINE_LENGTH - 1.2, t));
  out.wave = Math.PI * 1.04 * smoother(6.2, 11.4, t) - 0.04;
  out.system = smoother(5, 10, t);
  // the sunrise at ~2 s, the fronts meeting at ~11 s
  out.glow = Math.exp(-Math.pow((t - 2.3) / 0.9, 2)) * 0.35 + Math.exp(-Math.pow((t - 11.3) / 1.1, 2)) * 0.4;
  return out;
}
