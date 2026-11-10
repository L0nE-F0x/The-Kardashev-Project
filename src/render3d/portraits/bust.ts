/**
 * A person's bust from their `Look`: the wall and its motif, shoulders and clothes, the head with its face in a
 * mood, hair or a hat, and whatever they wear on it. Turned a little to a three-quarter view, toward the key light.
 */
import * as THREE from 'three';
import type { Mood } from '../../content/events';
import { C } from '../../render/palette';
import { geo, gloss, lit, matte, put, type Shot } from './parts';
import { motifs, wall } from './backdrop';
import { dress } from './dress';
import { earWear, face, FACES, glasses, mount, quirksOf, whiskers } from './head';
import { hair, hairTones } from './hair';
import type { Look } from './looks';

/** The figure's turn: the face looks a little to the viewer's left, into the key. */
export const TURN = -0.3;
/** How much larger a person is drawn than the studio's frame was laid out for (the frame is 3.4 head-radii tall). */
const CLOSER = 1.08;
/** Where the head nods and tilts from: the top of the neck. */
const NECK_Y = -0.82;

const GOGGLE_EL = 0.5;
/** Goggles pushed up on the forehead: a strap round the head, two lenses. */
function goggles(head: THREE.Object3D, lens: number) {
  const frame = matte(C.ink1, 0.6);
  // the strap runs level round the head at the top of the forehead
  const y = Math.sin(GOGGLE_EL);
  const r = Math.cos(GOGGLE_EL);
  put(head, geo.torus(0.07), frame, [0, y, 0], { s: [r * 0.95 + 0.04, r * 0.98 + 0.04, 0.9], r: [Math.PI / 2, 0, 0] });
  for (const side of [-1, 1]) {
    const g = mount(head, side * 0.31, GOGGLE_EL, 0.08);
    put(g, geo.cyl(), frame, [0, 0, 0.0], { s: [0.2, 0.14, 0.16], r: [Math.PI / 2, 0, 0] });
    put(g, geo.ball(), gloss(lens, 0.12), [0, 0, 0.06], { s: [0.16, 0.125, 0.05], ghost: true });
    put(g, geo.ball(), lit(C.white, 0.9), [-0.06, 0.04, 0.105], { s: [0.045, 0.026, 0.01], r: [0, 0, 0.5], ghost: true });
  }
  const bridge = mount(head, 0, GOGGLE_EL, 0.1);
  put(bridge, geo.box(0.3), frame, [0, 0, 0], { s: [0.2, 0.1, 0.08] });
}

export function personShot(L: Look, mood: Mood): Shot {
  const root = new THREE.Group();
  // people stand a little closer to the camera than Bit and the avatars: a face has to read at 40 pixels
  root.scale.setScalar(CLOSER);
  root.position.y = -0.08;
  wall(root, L.bg);
  motifs(root, L);

  const fig = new THREE.Group();
  fig.rotation.y = TURN;
  root.add(fig);
  dress(fig, L);

  const F = FACES[mood];
  const neck = new THREE.Group();
  neck.position.set(0, NECK_Y, 0);
  neck.rotation.set(F.pitch, F.turn, F.roll);
  fig.add(neck);
  const head = new THREE.Group();
  head.position.set(0, -NECK_Y, 0);
  const Q = quirksOf(L);
  head.scale.set(Q.wide, Q.long, 1);
  neck.add(head);

  face(head, L, mood);
  const tone = hairTones(L);
  whiskers(head, L, tone.main, tone.deep);
  hair(head, L);
  if (L.glasses) glasses(head, L.glasses === 'thin');
  if (L.goggles !== undefined) goggles(head, L.goggles);
  earWear(head, L);
  return { root };
}
