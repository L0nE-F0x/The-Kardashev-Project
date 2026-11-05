import { FACILITIES, HALLS } from '../content/facilities';
import { siteDef } from '../content/sites';
import type { GameState } from './types';
import { fmtMW, news } from './core';
import { installInventory } from './supply';
import { euvBlocked } from './politics';

/** Advance construction of facilities, grid connections and transmission links by a day. */
export function tickConstruction(s: GameState): void {
  for (const f of s.facilities) {
    // expansions run alongside a working facility
    if (f.upgrade) {
      f.upgrade.progress += s.meta.sandbox?.instant ? f.upgrade.buildDays : 1;
      if (f.upgrade.progress >= f.upgrade.buildDays) {
        f.tier = f.upgrade.to;
        f.upgrade = undefined;
        const label = FACILITIES[f.type].tiers?.[(f.tier ?? 2) - 2]?.label ?? `tier ${f.tier}`;
        news(s, `🏗 ${FACILITIES[f.type].name} at ${siteDef(f.siteId).name} expanded to ${label}.`, 'good');
        if (HALLS.includes(f.type)) installInventory(s, f.siteId);
      }
    }
    if (f.status !== 'building') continue;
    // a fab needs Veldt's EUV tools halfway through; export rules can hold them up
    if (f.type === 'fab' && f.progress >= f.buildDays * 0.5) {
      const blocked = euvBlocked(s, siteDef(f.siteId).region);
      if (blocked && !f.blocked) news(s, `⛔ EUV tools for ${siteDef(f.siteId).name} are held up by export licensing. Sol can apply for a licence.`, 'bad');
      f.blocked = blocked ? 'euv' : undefined;
      if (blocked) continue;
    }
    f.progress += s.meta.sandbox?.instant ? f.buildDays : 1;
    if (f.progress >= f.buildDays) {
      f.status = 'online';
      f.onlineDay = s.day;
      if (HALLS.includes(f.type)) f.racks ??= [];
      news(s, `🏗 ${FACILITIES[f.type].name} at ${siteDef(f.siteId).name} is online.`, 'good');
      if (HALLS.includes(f.type)) installInventory(s, f.siteId);
    }
  }
  for (const l of s.network?.fiber ?? []) {
    if (l.status !== 'building') continue;
    l.progress += s.meta.sandbox?.instant ? 1e6 : 1;
    if (l.progress >= l.buildDays) {
      l.status = 'online';
      news(s, `🌐 Fiber lit: ${siteDef(l.a).name} ⇄ ${siteDef(l.b).name}.`, 'good');
    }
  }
  for (const c of s.network?.own ?? []) {
    if (c.status !== 'building') continue;
    c.progress += s.meta.sandbox?.instant ? 1e6 : 1;
    if (c.progress >= c.buildDays) {
      c.status = 'online';
      news(s, `🌊 Your subsea cable ${siteDef(c.a).name} ⇄ ${siteDef(c.b).name} is carrying traffic.`, 'good');
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
    l.progress += s.meta.sandbox?.instant ? 1e6 : 1;
    if (l.progress >= l.buildDays) {
      l.status = 'online';
      news(s, `⚡ Transmission line ${siteDef(l.a).name} ⇄ ${siteDef(l.b).name} energised.`, 'good');
    }
  }
}
