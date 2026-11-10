import * as THREE from 'three';
import type { Mood } from '../../content/events';
import { C } from '../../render/palette';
import { wall } from './backdrop';
import type { AvatarId } from './looks';
import { geo, matte, put, type Shot } from './parts';

export function avatarShot(id: AvatarId, mood: Mood): Shot {
  const root = new THREE.Group();
  wall(root, [C.ink2, C.ink3]);
  put(root, geo.gem(), matte(C.red3), [0, 0, 0], { s: 1.2 });
  void id;
  void mood;
  return { root };
}
