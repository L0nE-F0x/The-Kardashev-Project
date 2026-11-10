/**
 * The Earth for the space views: the globe's own surface, clouds and air (globe/earth.ts, through
 * the same calls the globe makes, so it looks exactly as it does there) on a sphere of any size that
 * can be placed, tilted and spun. `light` turns the Sun's direction into the sphere's own frame.
 */
import * as THREE from 'three';
import type { Game } from '../../game/game';
import { atmosphereMaterial, cloudMaterial, earthMaterial, earthTextures } from '../globe/earth';

export const SHELL = 1.1;

export class SpaceEarth {
  /** Place and tilt this. */
  readonly object = new THREE.Group();
  /** The sphere itself (turn it about y for the day). */
  readonly globe: THREE.Mesh;
  private mats: THREE.ShaderMaterial[];
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();

  constructor(game: Game, radius: number, segs: number) {
    const lod = game.world.lods[game.world.lods.length - 1];
    const tex = earthTextures(lod);
    const surface = earthMaterial(tex, lod.W, lod.H), clouds = cloudMaterial(tex), air = atmosphereMaterial(SHELL);
    this.mats = [surface, clouds, air];
    this.globe = new THREE.Mesh(new THREE.SphereGeometry(radius, segs, segs / 2), surface);
    const c = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.009, Math.round(segs * 0.75), Math.round(segs * 0.375)), clouds);
    const a = new THREE.Mesh(new THREE.SphereGeometry(radius * SHELL, Math.round(segs / 2), Math.round(segs / 4)), air);
    c.renderOrder = 2;
    a.renderOrder = 3;
    this.globe.add(c, a);
    this.object.add(this.globe);
  }

  /** `toSun`: the world direction to the Sun. `cloudShift`: how far the weather has drifted (0..1 round the globe). */
  light(toSun: THREE.Vector3, cloudShift: number, time: number) {
    const local = this.v.copy(toSun).applyQuaternion(this.globe.getWorldQuaternion(this.q).invert()).normalize();
    for (const m of this.mats) {
      const u = m.uniforms;
      (u.sunDir?.value as THREE.Vector3 | undefined)?.copy(local);
      if (u.cloudShift) u.cloudShift.value = cloudShift;
      if (u.time) u.time.value = time;
    }
  }
}
