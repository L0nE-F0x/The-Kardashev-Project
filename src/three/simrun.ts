/** The real Act I sim, ticking under the 3D view (the Act I bot can play it on autopilot). */
import mapUrl from '../content/generated/worldmap.bin?url';
import { decodeWorldMap } from '../world/mapData';
import { Router } from '../world/routing';
import { newGame } from '../sim/state';
import { refreshStats, tick } from '../sim/tick';
import { build } from '../sim/actions';
import type { FacilityType, GameState } from '../sim/types';
import type { SimContext } from '../sim/supply';
import { autoResolve1, botDay1 } from '../../tests/helpers/act1bot';

export class SimRun {
  /** Game days per real second (0 = paused). */
  speed = 4;
  autopilot = true;
  private acc = 0;
  private constructor(public s: GameState, readonly ctx: SimContext) {}

  static async create(seed = 7) {
    const buf = await (await fetch(mapUrl)).arrayBuffer();
    const lods = decodeWorldMap(buf);
    const s = newGame({ name: 'Little Sun Labs', homeSite: 'bay-area', seed });
    refreshStats(s);
    return new SimRun(s, { router: new Router(lods[0]) });
  }

  /** Advance by real seconds; returns true if any day passed. */
  step(dt: number) {
    if (this.speed <= 0) return false;
    this.acc += dt * this.speed;
    let n = Math.min(60, Math.floor(this.acc));
    this.acc -= Math.floor(this.acc);
    const any = n > 0;
    while (n-- > 0) this.day();
    return any;
  }

  day() {
    const s = this.s;
    if (this.autopilot) botDay1(s, this.ctx);
    else autoResolve1(s);
    tick(s, this.ctx);
  }

  build(type: FacilityType) {
    const r = build(this.s, 'west-texas', type);
    refreshStats(this.s);
    return r;
  }
}
