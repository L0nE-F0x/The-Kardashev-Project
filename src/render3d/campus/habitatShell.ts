/**
 * Inside Aurora (an O'Neill-style habitat cylinder): you stand on the inside of the hull, the land
 * curves up both sides and meets overhead, in strips of farmland and woods between long windows
 * of sky, with the sun-line running down the axis.
 */
import * as THREE from 'three';
import { col, fbm, mix, withClouds } from '../kit';

export const HAB_R = 260;

/** Height of the cylinder's floor at a sideways offset z (the axis runs along x). */
export const habFloor = (z: number) => HAB_R - Math.sqrt(Math.max(0, HAB_R * HAB_R - Math.min(z * z, HAB_R * HAB_R * 0.98)));

export function habitatShell(lived: number): THREE.Group {
  const g = new THREE.Group();
  const len = 2400, segA = 180, segL = 120;
  const geo = new THREE.CylinderGeometry(HAB_R, HAB_R, len, segA, segL, true);
  geo.rotateZ(Math.PI / 2);
  // the floor (our ground) is at the bottom: y = 0 there
  geo.translate(0, HAB_R, 0);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i) - HAB_R, z = pos.getZ(i);
    const a = Math.atan2(z, -y); // 0 at the floor, ±π overhead
    // three land strips and three windows round the circumference
    const sector = ((a / (Math.PI * 2)) * 6 + 6.25) % 6;
    const window = Math.floor(sector) % 2 === 1 && Math.abs(a) > 0.7;
    let c: THREE.Color;
    if (window) c = mix('#6c9fd2', '#c4e0f2', fbm(x * 0.004, a * 2, 3, 2)).multiplyScalar(1.15);
    else {
      const n = fbm(x * 0.01, a * 8, 7, 3);
      c = mix('#5a9537', '#a6c751', n);
      if (fbm(x * 0.006 + 40, a * 3, 9, 2) > 0.6) c.lerp(col('#2c6233'), 0.6); // woods
      if (Math.abs(((x * 0.02 + a * 30) % 6)) < 0.25) c.lerp(col('#d4a862'), 0.4); // field edges
      c.lerp(col('#e9e1d2'), lived * 0.08);
    }
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const shell = new THREE.Mesh(geo, withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.BackSide })));
  shell.receiveShadow = true;
  g.add(shell);
  // the sun-line down the axis
  const line = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, len, 12).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.7, 2.2), toneMapped: true }));
  line.position.y = HAB_R;
  g.add(line);
  return g;
}
