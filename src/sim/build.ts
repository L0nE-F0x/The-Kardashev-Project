import { FACILITIES } from '../content/facilities';
import { siteDef } from '../content/sites';
import type { GameState } from './types';
import { fmtMW, news } from './core';
import { installInventory } from './supply';

/** Advance construction of facilities, grid connections and transmission links by a day. */
export function tickConstruction(s: GameState): void {
  for (const f of s.facilities) {
    if (f.status !== 'building') continue;
    f.progress += 1;
    if (f.progress >= f.buildDays) {
      f.status = 'online';
      f.onlineDay = s.day;
      if (f.type === 'datacenter') f.racks ??= [];
      news(s, `🏗 ${FACILITIES[f.type].name} at ${siteDef(f.siteId).name} is online.`, 'good');
      if (f.type === 'datacenter') installInventory(s, f.siteId);
    }
  }
  for (const [id, st] of Object.entries(s.sites)) {
    if (!st.grid.pending.length) continue;
    const ready = st.grid.pending.filter((p) => p.readyDay <= s.day);
    if (!ready.length) continue;
    st.grid.pending = st.grid.pending.filter((p) => p.readyDay > s.day);
    for (const p of ready) {
      st.grid.mw += p.mw;
      news(s, `🔌 Grid connection energised at ${siteDef(id).name}: +${fmtMW(p.mw)}.`, 'good');
    }
  }
  for (const l of s.links) {
    if (l.status !== 'building') continue;
    l.progress += 1;
    if (l.progress >= l.buildDays) {
      l.status = 'online';
      news(s, `⚡ Transmission line ${siteDef(l.a).name} ⇄ ${siteDef(l.b).name} energised.`, 'good');
    }
  }
}
