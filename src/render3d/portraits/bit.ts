import * as THREE from 'three';
import type { Mood } from '../../content/events';
import { C } from '../../render/palette';
import { wall } from './backdrop';
import type { BitModel } from './looks';
import { geo, matte, put, type Shot } from './parts';

export function bitShot(bit: BitModel, mood: Mood): Shot {
  const root = new THREE.Group();
  wall(root, [C.ink2, C.ink3]);
  put(root, geo.box(0.2), matte(C.blu5), [0, 0, 0], { s: 1.6 });
  void bit;
  void mood;
  return { root };
}
