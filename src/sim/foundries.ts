/**
 * Act V: self-replicating foundries. A seed planted at the Moon, a Lagrange yard or a claimed asteroid
 * grows on its own: its doubling time is set by the growth dial and the share of output reinvested,
 * slowed when the yards run short of feed and when a strain drifts off-spec. Each doubling rolls for
 * drift (sentinels cut the odds); a drifting strain grows until it is contained, verified or sterilised.
 */
import { ASTEROID_BY_ID, SEED_PLACES, SYSTEM, TYPE_INFO } from '../content/system';
import type { GameState } from './types';

/** Where a seed can be planted right now (the Moon, the yards, claimed asteroids the Charter may use). */
export function seedPlaces(s: GameState): { id: string; name: string; note?: string }[] {
  const sy = s.system;
  if (!sy) return [];
  const here = (id: string) => sy.foundries.filter((f) => f.site === id).length;
  const out: { id: string; name: string; note?: string }[] = SEED_PLACES.map((p) => ({ id: p.id, name: p.name, note: here(p.id) ? `${here(p.id)} foundr${here(p.id) > 1 ? 'ies' : 'y'}` : p.id === 'moon' ? 'regolith' : 'needs feed' }));
  for (const [id, st] of Object.entries(sy.asteroids)) {
    if (st.status < 2 || !seedAllowed(s, id)) continue;
    const a = ASTEROID_BY_ID[id];
    out.push({ id, name: a.name, note: `${a.type}-type · ${TYPE_INFO[a.type].good}${here(id) ? ` · ${here(id)} foundr${here(id) > 1 ? 'ies' : 'y'}` : ''}` });
  }
  return out;
}

/** Whether the Charter may plant on this asteroid (its own claim, or anyone's under the Commons). */
export function seedAllowed(s: GameState, id: string): boolean {
  const st = s.system?.asteroids[id];
  if (!st || st.status < 2) return false;
  return st.owner === 'charter' || s.system?.ownership === 'commons' || s.system?.ownership === 'concessions';
}

void SYSTEM;
