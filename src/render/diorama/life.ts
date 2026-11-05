/**
 * Life on campus: the people, the advisors and Bit, a dog, cyclists on the road, birds and
 * delivery drones. People don't just pace: they go in and out of doors, phone, stop to chat,
 * hammer on building sites, carry boxes off the truck, cheer and show little speech bubbles when
 * something happens. Pure Pixi sprites over the diorama; the scene feeds it an environment each
 * frame (plots, ground line, lights, the night tint) and asks it what's under the pointer.
 */
import { Container, Sprite, type Texture } from 'pixi.js';
import { C } from '../palette';
import { hash2, PixelCanvas } from '../pixels';
import { cachedTexture, labelTexture } from '../textures';
import { advisorLook, bitFrames, CARRY, emoteArt, FIG_BODY_X, FIG_FEET, FIG_W, figure, lookFor, shade, WALK, type Emote, type PersonLook, type Pose, type Role } from './people';
import type { AdvisorId } from '../../sim/types';
import { sfx } from '../../audio/sfx';

/** What the crowd knows about one plot. */
export interface Spot {
  x: number;
  w: number;
  /** Scene x of a door people can walk into. */
  door: number | null;
  /** A building site (crews hammer here). */
  building: boolean;
}

export interface LifeEnv {
  groundY: number;
  sceneW: number;
  /** People stay left of this (the shore, the quay). */
  walkLimit: number;
  camX: number;
  vw: number;
  era: number;
  /** 0 (day) … 1 (deep night). */
  darkness: number;
  /** The lit world's tint (night grading), 0xRRGGBB. */
  tint: number;
  /** Ground lights (street lamps, lit doors) people brighten under at night. */
  lights: number[];
  /** Scene x of a truck standing at a dock, if any. */
  truckDock: number | null;
  /** A road for cyclists. */
  road: boolean;
  /** Air: birds and drones. */
  air: boolean;
  rainy: boolean;
  /** Ground row (below groundY) the people's feet land on, give or take two (the pavement: 7). */
  lane: number;
}

/** An advisor (or Bit) out on campus. */
export interface NamedSpec {
  id: AdvisorId;
  name: string;
  /** Portrait age in Act V (0–3). */
  age: number;
  /** Bit's form (model generation, 10 co-steward, 11 free). */
  bitForm: number;
  /** Wears a spacesuit (the Moon, an asteroid). */
  suited: boolean;
}

export interface LifeSpec {
  count: number;
  /** Lunar and asteroid crews wear suits. */
  suited: boolean;
  named: NamedSpec[];
  /** Workers in hard hats when there are building sites. */
  crews: number;
  dog: boolean;
}

type State = 'walk' | 'idle' | 'inside' | 'chat' | 'phone' | 'work' | 'cheer' | 'wait' | 'wave';
type Then = 'idle' | 'enter' | 'work' | 'chat' | 'pickup';

interface Walker {
  sprite: Sprite;
  shadow: Sprite;
  look: PersonLook | null;
  key: string;
  /** Bit's form when this is Bit. */
  bot: number | null;
  named: NamedSpec | null;
  role: Role;
  x: number;
  lane: number;
  dir: 1 | -1;
  speed: number;
  target: number;
  then: Then;
  state: State;
  timer: number;
  carry: boolean;
  partner: Walker | null;
  phase: number;
  bubble: Sprite | null;
  bubbleT: number;
}

interface Dog {
  sprite: Sprite;
  owner: Walker;
  x: number;
  dir: 1 | -1;
  colour: number;
  sit: boolean;
}

interface Rider {
  sprite: Sprite;
  key: string;
  look: PersonLook;
  x: number;
  dir: 1 | -1;
  speed: number;
}

interface Bird {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  phase: number;
}

interface Drone {
  sprite: Sprite;
  light: Sprite;
  x: number;
  y: number;
  dir: 1 | -1;
  /** Dock to drop a parcel at, then leave. */
  dock: number | null;
  stage: 'cruise' | 'down' | 'hover' | 'up';
  t: number;
  cruiseY: number;
}

const rand = Math.random;
const choose = <T>(a: T[]): T => a[Math.floor(rand() * a.length)];

export class Life {
  readonly shadowL = new Container();
  readonly actorL = new Container();
  readonly skyL = new Container();
  private walkers: Walker[] = [];
  private dog: Dog | null = null;
  private riders: Rider[] = [];
  private birds: Bird[] = [];
  private drones: Drone[] = [];
  private label: Sprite | null = null;
  private hover: Walker | null = null;
  private riderTimer = 4;
  private birdTimer = 6;
  private droneTimer = 8;
  private ambientTimer = 4;
  private carrier: Walker | null = null;
  private spots: Spot[] = [];
  private time = 0;
  private env: LifeEnv | null = null;

  constructor(private readonly glowL: Container) {
    this.actorL.sortableChildren = true;
  }

  /** Everyone out on campus (tests count them). */
  get people(): readonly { x: number; named: NamedSpec | null }[] {
    return this.walkers;
  }

  // ── setup ─────────────────────────────────────────────────────────────────────────────────
  setSpots(spots: Spot[]) {
    this.spots = spots;
  }

  private specKey = '';

  /**
   * Fill the campus. If the cast is the same as last time (the campus only changed a little, say
   * a building site moved on), everyone stays where they are and just learns the new plots.
   */
  spawn(spec: LifeSpec, env: LifeEnv) {
    const key = `${spec.count}|${spec.crews}|${spec.suited}|${spec.dog}|${spec.named.map((n) => `${n.id}${n.age}${n.bitForm}`).join(',')}|${env.era}`;
    if (key === this.specKey && this.walkers.length) {
      this.env = env;
      const limit = Math.max(30, Math.min(env.sceneW - 20, env.walkLimit));
      for (const w of this.walkers) {
        if (w.x > limit) w.x = limit;
        if (w.target > limit) w.target = limit;
      }
      return;
    }
    this.clear();
    this.specKey = key;
    this.env = env;
    const limit = Math.max(30, Math.min(env.sceneW - 20, env.walkLimit));
    const at = (i: number) => 20 + hash2(i, 1, 9) * (limit - 20);
    let i = 0;
    for (const n of spec.named) {
      const w = this.addWalker(at(i + 50), n.bitForm >= 0 && n.id === 'bit' ? 'staff' : n.suited ? 'astronaut' : 'staff', i, n);
      w.speed *= 0.85;
      i++;
    }
    for (let k = 0; k < spec.crews; k++, i++) this.addWalker(at(i), 'worker', i, null);
    for (let k = 0; k < spec.count; k++, i++) {
      const role: Role = spec.suited ? 'astronaut' : hash2(i, 4, 9) < 0.22 ? 'tech' : 'staff';
      this.addWalker(at(i), role, i, null);
    }
    if (spec.dog) {
      const owners = this.walkers.filter((w) => !w.named && w.role === 'staff');
      if (owners.length) {
        const owner = owners[0];
        const colour = choose([C.snd4, C.ink2, C.snd6, C.rck3]);
        const sprite = new Sprite(this.dogTex(colour, 0));
        this.actorL.addChild(sprite);
        this.dog = { sprite, owner, x: owner.x - 8, dir: 1, colour, sit: false };
      }
    }
  }

  private addWalker(x: number, role: Role, i: number, named: NamedSpec | null): Walker {
    const env = this.env!;
    let look: PersonLook | null = null;
    let key: string;
    let bot: number | null = null;
    if (named?.id === 'bit') {
      bot = named.bitForm;
      key = `bit:${bot}`;
    } else if (named) {
      look = advisorLook(named.id as Exclude<AdvisorId, 'bit'>, named.age);
      if (named.suited) look = { ...look, hat: 'helmet', outfit: 'spacesuit', shirt: named.id === 'kip' ? C.org1 : C.white, accent: C.yel0, shoes: C.ink6 };
      key = `adv:${named.id}:${named.age}:${named.suited ? 1 : 0}:${env.era}`;
    } else {
      look = lookFor(i * 37 + 11, role, env.era);
      key = `${role}:${i}:${env.era}`;
    }
    const sprite = new Sprite();
    const shadow = new Sprite(cachedTexture('dio:figshadow', shadowArt));
    shadow.alpha = 0.35;
    this.actorL.addChild(sprite);
    this.shadowL.addChild(shadow);
    const w: Walker = {
      sprite,
      shadow,
      look,
      key,
      bot,
      named,
      role,
      x,
      lane: Math.floor(hash2(i, 6, 9) * 3),
      dir: hash2(i, 7, 9) < 0.5 ? 1 : -1,
      speed: 7 + hash2(i, 2, 9) * 5,
      target: x,
      then: 'idle',
      state: 'idle',
      timer: hash2(i, 3, 9) * 3,
      carry: false,
      partner: null,
      phase: hash2(i, 8, 9),
      bubble: null,
      bubbleT: 0,
    };
    if (role === 'astronaut') w.speed *= 0.7;
    this.walkers.push(w);
    this.setPose(w, 'stand');
    return w;
  }

  clear() {
    for (const w of this.walkers) {
      w.sprite.destroy();
      w.shadow.destroy();
      w.bubble?.destroy();
    }
    this.walkers = [];
    this.dog?.sprite.destroy();
    this.dog = null;
    for (const r of this.riders) r.sprite.destroy();
    this.riders = [];
    for (const b of this.birds) b.sprite.destroy();
    this.birds = [];
    for (const d of this.drones) {
      d.sprite.destroy();
      d.light.destroy();
    }
    this.drones = [];
    this.label?.destroy();
    this.label = null;
    this.hover = null;
    this.carrier = null;
    this.specKey = '';
  }

  destroy() {
    this.clear();
  }

  // ── textures ──────────────────────────────────────────────────────────────────────────────
  private poseTex(w: Walker, pose: Pose): Texture {
    if (w.bot !== null) {
      const f = Math.floor(this.time * 2.5 + w.phase * 2) % 2;
      return cachedTexture(`dio:bit:${w.bot}:${f}`, () => bitFrames(w.bot!)[f]);
    }
    return cachedTexture(`dio:fig:${w.key}:${pose}`, () => figure(w.look!, pose));
  }

  private setPose(w: Walker, pose: Pose) {
    w.sprite.texture = this.poseTex(w, pose);
  }

  private dogTex(colour: number, f: number): Texture {
    return cachedTexture(`dio:dog:${colour}:${f}`, () => dogArt(colour, f));
  }

  // ── reactions ─────────────────────────────────────────────────────────────────────────────
  /** Something happened (a toast): a few people react with a bubble, good news gets a cheer. */
  react(kind: 'good' | 'bad' | 'info') {
    const env = this.env;
    if (!env) return;
    const seen = this.walkers.filter((w) => w.sprite.visible && w.x > env.camX - 10 && w.x < env.camX + env.vw + 10 && w.state !== 'inside');
    const n = Math.min(seen.length, kind === 'info' ? 1 : 3);
    if (n > 0) sfx('bubble');
    for (let k = 0; k < n; k++) {
      const w = seen.splice(Math.floor(rand() * seen.length), 1)[0];
      if (kind === 'bad') this.emote(w, rand() < 0.6 ? 'alert' : 'ask', 3);
      else if (kind === 'good') {
        this.emote(w, rand() < 0.5 ? 'heart' : 'star', 3);
        if (w.bot === null && rand() < 0.6 && w.state !== 'walk') {
          w.state = 'cheer';
          w.timer = 2.4;
        }
      } else this.emote(w, 'ask', 2.2);
    }
  }

  private emote(w: Walker, kind: Emote, secs: number) {
    if (!w.bubble) {
      w.bubble = new Sprite();
      w.bubble.zIndex = 10_000;
      this.actorL.addChild(w.bubble);
    }
    w.bubble.texture = cachedTexture(`dio:emote:${kind}`, () => emoteArt(kind));
    w.bubble.visible = true;
    w.bubbleT = secs;
  }

  // ── pointer ───────────────────────────────────────────────────────────────────────────────
  /** The advisor (or Bit) under a scene point, if any. */
  namedAt(sx: number, sy: number): Walker | null {
    const env = this.env;
    if (!env) return null;
    let best: Walker | null = null;
    let bestD = 99;
    for (const w of this.walkers) {
      if (!w.named || !w.sprite.visible) continue;
      const foot = this.footY(w);
      if (sy < foot - 15 || sy > foot + 3) continue;
      const d = Math.abs(sx - w.x);
      if (d <= 5 && d < bestD) {
        best = w;
        bestD = d;
      }
    }
    return best;
  }

  /** Hover a name tag over an advisor (or nothing). */
  setHover(w: Walker | null) {
    if (w === this.hover) return;
    this.hover = w;
    if (!w) {
      if (this.label) this.label.visible = false;
      return;
    }
    if (!this.label) {
      this.label = new Sprite();
      this.label.zIndex = 20_000;
      this.actorL.addChild(this.label);
    }
    this.label.texture = labelTexture(w.named!.name.toUpperCase(), C.white, C.ink0);
    this.label.visible = true;
  }

  /** Clicked: they stop, turn to you and wave. Returns who it was. */
  greet(w: Walker): NamedSpec | null {
    if (!w.named) return null;
    const env = this.env!;
    w.state = 'wave';
    w.timer = 2.6;
    w.dir = w.x < env.camX + env.vw / 2 ? 1 : -1;
    this.emote(w, w.bot !== null ? 'note' : choose<Emote>(['heart', 'note', 'star']), 2.6);
    sfx('hello');
    return w.named;
  }

  // ── per frame ─────────────────────────────────────────────────────────────────────────────
  private footY(w: Walker): number {
    return this.env!.groundY + this.env!.lane + w.lane;
  }

  update(dt: number, env: LifeEnv, reducedMotion: boolean) {
    this.env = env;
    this.time += dt;
    const lightsOn = Math.max(0, Math.min(1, (env.darkness - 0.25) * 2.4));
    const base = rgb(env.tint);
    const litAt = (x: number) => {
      if (lightsOn <= 0) return env.tint;
      let k = 0;
      for (const lx of env.lights) {
        const d = Math.abs(lx - x);
        if (d < 16) k = Math.max(k, 1 - d / 16);
      }
      if (k <= 0) return env.tint;
      k *= lightsOn * 0.85;
      return hexOf([base[0] + (1 - base[0]) * k, base[1] + (0.92 - base[1]) * k, base[2] + (0.76 - base[2]) * k]);
    };
    for (const w of this.walkers) this.stepWalker(w, dt, env);
    for (const w of this.walkers) {
      const foot = this.footY(w);
      const flip = w.dir < 0;
      const top = foot - FIG_FEET - (w.bot !== null ? 4 + Math.round(Math.sin(this.time * 2 + w.phase * 6)) : 0);
      const cx = Math.round(w.x);
      w.sprite.scale.x = flip ? -1 : 1;
      w.sprite.position.set(flip ? cx + FIG_W / 2 : cx - FIG_W / 2, top);
      w.sprite.zIndex = foot;
      w.sprite.tint = litAt(w.x);
      w.shadow.visible = w.sprite.visible;
      w.shadow.position.set(cx - 4, foot + 1);
      w.shadow.alpha = 0.35 * (1 - env.darkness * 0.6) * (w.bot !== null ? 0.6 : 1);
      if (w.bubble) {
        w.bubbleT -= dt;
        w.bubble.visible = w.bubbleT > 0 && w.sprite.visible;
        w.bubble.position.set(cx - 2, top - 9);
        w.bubble.tint = litAt(w.x) === env.tint && lightsOn > 0 ? hexOf(base.map((v) => 0.5 + v * 0.5) as [number, number, number]) : 0xffffff;
      }
    }
    if (this.label && this.hover) {
      const w = this.hover;
      this.label.visible = w.sprite.visible;
      this.label.position.set(Math.round(w.x) - Math.floor(this.label.texture.width / 2), this.footY(w) - FIG_FEET - (w.bubble?.visible ? 16 : 8));
    }
    this.stepDog(dt, env, litAt);
    if (!reducedMotion) {
      this.stepRiders(dt, env, litAt);
      this.stepBirds(dt, env);
      this.stepDrones(dt, env, lightsOn);
    }
    // now and then someone hums, sips a coffee or mutters
    this.ambientTimer -= dt;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = 5 + rand() * 6;
      const seen = this.walkers.filter((w) => w.sprite.visible && !w.bubbleT && w.x > env.camX && w.x < env.camX + env.vw);
      const w = seen.length ? choose(seen) : null;
      if (w && rand() < 0.6) this.emote(w, w.state === 'chat' ? choose<Emote>(['dots', 'heart', 'dots']) : w.state === 'phone' ? 'dots' : w.bot !== null ? 'bolt' : choose<Emote>(['note', 'coffee', 'note']), 2.2);
    }
    for (const w of this.walkers) if (w.bubbleT < 0) w.bubbleT = 0;
  }

  // ── people ────────────────────────────────────────────────────────────────────────────────
  private goTo(w: Walker, x: number, then: Then) {
    const env = this.env!;
    w.target = Math.max(8, Math.min(env.walkLimit, env.sceneW - 8, x));
    w.then = then;
    w.state = 'walk';
  }

  private decide(w: Walker) {
    const env = this.env!;
    const limit = env.walkLimit;
    const r = rand();
    const doors = this.spots.filter((s) => s.door !== null && s.door < limit);
    if (w.role === 'worker') {
      // crews stick to their site: a few steps along it, then back to work (now and then another site)
      const sites = this.spots.filter((s) => s.building && s.x < limit);
      const here = sites.find((s) => w.x >= s.x - 2 && w.x <= s.x + s.w + 2);
      if (sites.length && r < 0.85) {
        const s = here && rand() < 0.85 ? here : choose(sites);
        return this.goTo(w, s.x + s.w * (0.15 + rand() * 0.7), 'work');
      }
    }
    if (env.truckDock !== null && !this.carrier && w.role !== 'worker' && !w.named && r < 0.5) {
      this.carrier = w;
      return this.goTo(w, env.truckDock + 2, 'pickup');
    }
    if (r < 0.22 && doors.length) return this.goTo(w, choose(doors).door!, 'enter');
    if (r < 0.32 && w.bot === null && w.role !== 'astronaut') {
      w.state = 'phone';
      w.timer = 4 + rand() * 6;
      return;
    }
    if (r < 0.46 && w.bot === null) {
      const near = this.walkers.filter((o) => o !== w && o.bot === null && !o.partner && (o.state === 'idle' || o.state === 'walk') && Math.abs(o.x - w.x) < 70);
      if (near.length) {
        const o = choose(near);
        o.state = 'wait';
        o.timer = 14;
        o.partner = w;
        w.partner = o;
        return this.goTo(w, o.x + (o.x > w.x ? -7 : 7), 'chat');
      }
    }
    const solid = this.spots.filter((s) => s.x < limit);
    const s = solid.length ? choose(solid) : null;
    this.goTo(w, s ? s.x + s.w * (0.2 + rand() * 0.6) : 20 + rand() * (env.sceneW - 40), 'idle');
  }

  private arrive(w: Walker) {
    switch (w.then) {
      case 'enter':
        w.state = 'inside';
        w.sprite.visible = false;
        w.timer = w.named ? 4 + rand() * 6 : 6 + rand() * 14;
        w.carry = false;
        if (this.carrier === w) this.carrier = null;
        return;
      case 'work':
        w.state = 'work';
        w.timer = 6 + rand() * 8;
        if (rand() < 0.5) w.dir = w.dir > 0 ? -1 : 1;
        return;
      case 'pickup': {
        w.carry = true;
        const doors = this.spots.filter((s) => s.door !== null && s.door < this.env!.walkLimit);
        if (doors.length) {
          const near = doors.reduce((a, b) => (Math.abs(a.door! - w.x) < Math.abs(b.door! - w.x) ? a : b));
          w.state = 'idle';
          w.timer = 0.8;
          w.then = 'enter';
          w.target = near.door!;
          return;
        }
        w.state = 'idle';
        w.timer = 2;
        this.carrier = null;
        return;
      }
      case 'chat': {
        const o = w.partner;
        if (o && o.partner === w && o.state === 'wait') {
          const t = 4 + rand() * 5;
          w.state = o.state = 'chat';
          w.timer = o.timer = t;
          w.dir = o.x > w.x ? 1 : -1;
          o.dir = w.x > o.x ? 1 : -1;
          return;
        }
        w.partner = null;
        w.state = 'idle';
        w.timer = 1;
        return;
      }
      default:
        w.state = 'idle';
        w.timer = 2 + rand() * 5;
    }
  }

  private stepWalker(w: Walker, dt: number, env: LifeEnv) {
    w.timer -= dt;
    switch (w.state) {
      case 'walk': {
        const d = w.target - w.x;
        if (Math.abs(d) < 0.6) {
          w.x = w.target;
          this.arrive(w);
          break;
        }
        w.dir = d > 0 ? 1 : -1;
        w.x += w.dir * Math.min(Math.abs(d), w.speed * dt);
        const f = Math.floor(Math.abs(w.x) / 2) % 4;
        this.setPose(w, (w.carry ? CARRY : WALK)[f]);
        return;
      }
      case 'inside':
        if (w.timer <= 0) {
          w.sprite.visible = true;
          w.state = 'idle';
          w.timer = 0.6 + rand();
          w.dir = rand() < 0.5 ? 1 : -1;
        }
        return;
      case 'chat':
        this.setPose(w, Math.floor(this.time * 1.6 + w.phase * 3) % 2 ? 'talk' : 'stand');
        if (w.timer <= 0) {
          if (w.partner) w.partner.partner = null;
          w.partner = null;
          w.state = 'idle';
          w.timer = 0.5;
        }
        return;
      case 'wait':
        this.setPose(w, 'stand');
        if (w.partner) w.dir = w.partner.x > w.x ? 1 : -1;
        if (w.timer <= 0) {
          if (w.partner) w.partner.partner = null;
          w.partner = null;
          w.state = 'idle';
        }
        return;
      case 'work':
        this.setPose(w, Math.floor(this.time * 3 + w.phase * 2) % 2 ? 'work0' : 'work1');
        if (w.timer <= 0) this.decide(w);
        return;
      case 'cheer':
        this.setPose(w, Math.floor(this.time * 4) % 2 ? 'cheer' : 'stand');
        if (w.timer <= 0) w.state = 'idle';
        return;
      case 'wave':
        this.setPose(w, Math.floor(this.time * 3) % 2 ? 'wave' : 'stand');
        if (w.timer <= 0) {
          w.state = 'idle';
          w.timer = 1;
        }
        return;
      case 'phone':
        this.setPose(w, 'phone');
        if (w.timer <= 0) {
          w.state = 'idle';
          w.timer = 0.5;
        }
        return;
      default:
        this.setPose(w, 'stand');
        if (w.timer <= 0) {
          // a pending hop (box in hand → the nearest door)
          if (w.then === 'enter' && w.carry) return this.goTo(w, w.target, 'enter');
          this.decide(w);
        }
    }
    void env;
  }

  // ── the dog ───────────────────────────────────────────────────────────────────────────────
  private stepDog(dt: number, env: LifeEnv, litAt: (x: number) => number) {
    const d = this.dog;
    if (!d) return;
    const o = d.owner;
    const goal = o.state === 'inside' ? o.x + 6 : o.x - o.dir * 9;
    const gap = goal - d.x;
    const moving = Math.abs(gap) > 1.5;
    if (moving) {
      d.dir = gap > 0 ? 1 : -1;
      d.x += d.dir * Math.min(Math.abs(gap), (Math.abs(gap) > 14 ? 18 : 9) * dt);
    }
    d.sit = !moving && o.state !== 'walk';
    const f = d.sit ? 2 : Math.floor(Math.abs(d.x) / 2) % 2;
    d.sprite.texture = this.dogTex(d.colour, f);
    const cx = Math.round(d.x);
    d.sprite.scale.x = d.dir < 0 ? -1 : 1;
    const foot = env.groundY + env.lane + 2;
    d.sprite.position.set(d.dir < 0 ? cx + 4 : cx - 4, foot - 6);
    d.sprite.zIndex = foot;
    d.sprite.tint = litAt(d.x);
  }

  // ── cyclists ──────────────────────────────────────────────────────────────────────────────
  private stepRiders(dt: number, env: LifeEnv, litAt: (x: number) => number) {
    if (env.road && !env.rainy) {
      this.riderTimer -= dt;
      if (this.riderTimer <= 0 && this.riders.length < 2) {
        this.riderTimer = (env.era >= 2 ? 5 : 11) + rand() * (env.era >= 2 ? 6 : 14);
        const dir: 1 | -1 = rand() < 0.5 ? 1 : -1;
        const seed = Math.floor(rand() * 500);
        const look = lookFor(seed + 900, 'staff', env.era);
        const key = `rider:${seed}:${env.era}`;
        const sprite = new Sprite(cachedTexture(`dio:${key}:0`, () => bikeArt(look, 0)));
        this.actorL.addChild(sprite);
        this.riders.push({ sprite, key, look, x: dir > 0 ? env.camX - 16 : env.camX + env.vw + 16, dir, speed: 24 + rand() * 12 });
      }
    }
    for (let i = this.riders.length - 1; i >= 0; i--) {
      const r = this.riders[i];
      r.x += r.dir * r.speed * dt;
      const f = Math.floor(Math.abs(r.x) / 3) % 2;
      r.sprite.texture = cachedTexture(`dio:${r.key}:${f}`, () => bikeArt(r.look, f));
      const cx = Math.round(r.x);
      r.sprite.scale.x = r.dir;
      // riders keep to the far lane (the trucks use the near one)
      const bottom = env.groundY + 17;
      r.sprite.position.set(r.dir > 0 ? cx - 7 : cx + 7, bottom - 13);
      r.sprite.zIndex = bottom + 20;
      r.sprite.tint = litAt(r.x);
      if (r.x < env.camX - 40 || r.x > env.camX + env.vw + 40) {
        r.sprite.destroy();
        this.riders.splice(i, 1);
      }
    }
  }

  // ── birds ─────────────────────────────────────────────────────────────────────────────────
  private stepBirds(dt: number, env: LifeEnv) {
    if (env.air && !env.rainy && env.darkness < 0.45) {
      this.birdTimer -= dt;
      if (this.birdTimer <= 0) {
        this.birdTimer = 14 + rand() * 22;
        const n = 3 + Math.floor(rand() * 4);
        const dir = rand() < 0.5 ? 1 : -1;
        const y0 = 18 + rand() * Math.max(10, env.groundY * 0.4);
        const vx = dir * (14 + rand() * 8);
        const x0 = dir > 0 ? env.camX - 20 : env.camX + env.vw + 20;
        for (let k = 0; k < n; k++) {
          const sprite = new Sprite();
          this.skyL.addChild(sprite);
          // a loose V: each bird a little behind and to the side of the one before
          this.birds.push({ sprite, x: x0 - dir * (k * 6 + rand() * 3), y: y0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 3 + rand() * 2, vx, phase: rand() * 6 });
        }
      }
    }
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      b.x += b.vx * dt;
      const f = Math.floor(this.time * 5 + b.phase) % 2;
      b.sprite.texture = cachedTexture(`dio:bird:${f}`, () => birdArt(f));
      b.sprite.position.set(Math.round(b.x), Math.round(b.y + Math.sin(this.time * 1.5 + b.phase) * 1.5));
      b.sprite.tint = env.tint;
      if (b.x < env.camX - 60 || b.x > env.camX + env.vw + 60) {
        b.sprite.destroy();
        this.birds.splice(i, 1);
      }
    }
  }

  // ── delivery drones (Solarpunk Bloom onwards) ─────────────────────────────────────────────
  private stepDrones(dt: number, env: LifeEnv, lightsOn: number) {
    if (env.air && env.era >= 2 && !env.rainy) {
      this.droneTimer -= dt;
      if (this.droneTimer <= 0 && this.drones.length < 2) {
        this.droneTimer = 9 + rand() * 16;
        const dir: 1 | -1 = rand() < 0.5 ? 1 : -1;
        const doors = this.spots.filter((s) => s.door !== null && s.door! > env.camX + 20 && s.door! < env.camX + env.vw - 20);
        const cruiseY = env.groundY - 50 - rand() * 30;
        const sprite = new Sprite();
        const light = new Sprite();
        light.blendMode = 'add';
        this.skyL.addChild(sprite);
        this.glowL.addChild(light);
        this.drones.push({ sprite, light, x: dir > 0 ? env.camX - 12 : env.camX + env.vw + 12, y: cruiseY, cruiseY, dir, dock: doors.length && rand() < 0.6 ? choose(doors).door! : null, stage: 'cruise', t: 0 });
      }
    }
    for (let i = this.drones.length - 1; i >= 0; i--) {
      const d = this.drones[i];
      d.t += dt;
      if (d.stage === 'cruise') {
        d.x += d.dir * 30 * dt;
        if (d.dock !== null && Math.abs(d.x - d.dock) < 1.5) {
          d.stage = 'down';
          d.x = d.dock;
        }
      } else if (d.stage === 'down') {
        d.y += 18 * dt;
        if (d.y >= env.groundY - 4) {
          d.stage = 'hover';
          d.t = 0;
        }
      } else if (d.stage === 'hover') {
        if (d.t > 1.6) {
          d.stage = 'up';
          d.dock = null;
        }
      } else {
        d.y -= 20 * dt;
        if (d.y <= d.cruiseY) d.stage = 'cruise';
      }
      const parcel = d.stage === 'cruise' && d.dock !== null ? 1 : d.stage === 'down' || (d.stage === 'hover' && d.t < 0.8) ? 1 : 0;
      const f = Math.floor(this.time * 10) % 2;
      d.sprite.texture = cachedTexture(`dio:drone:${f}:${parcel}`, () => droneArt(f, !!parcel));
      d.sprite.position.set(Math.round(d.x) - 4, Math.round(d.y) - 3);
      d.sprite.tint = env.tint;
      const blink = Math.floor(this.time * 1.5 + i) % 2 === 0;
      d.light.texture = cachedTexture(`dio:dronelight`, () => {
        const pc = new PixelCanvas(3, 3);
        pc.set(1, 1, C.red3);
        pc.set(0, 1, C.red1);
        pc.set(2, 1, C.red1);
        pc.set(1, 0, C.red1);
        pc.set(1, 2, C.red1);
        return pc;
      });
      d.light.visible = blink && lightsOn > 0.05;
      d.light.alpha = lightsOn;
      d.light.position.set(Math.round(d.x) - 1, Math.round(d.y) - 4);
      if (d.x < env.camX - 40 || d.x > env.camX + env.vw + 40) {
        d.sprite.destroy();
        d.light.destroy();
        this.drones.splice(i, 1);
      }
    }
  }
}

// ── art ────────────────────────────────────────────────────────────────────────────────────
function shadowArt(): PixelCanvas {
  const pc = new PixelCanvas(8, 2);
  pc.hline(1, 0, 6, C.ink0);
  pc.hline(2, 1, 4, C.ink0);
  return pc;
}

/** A small dog (8×6): two trot frames and a sit. */
export function dogArt(colour: number, f: number): PixelCanvas {
  const pc = new PixelCanvas(8, 6);
  const sh = shade(colour);
  if (f === 2) {
    // sitting, looking up
    pc.rect(2, 2, 3, 2, colour);
    pc.set(5, 1, colour);
    pc.set(6, 1, colour);
    pc.set(5, 0, sh);
    pc.set(6, 2, C.ink1);
    pc.set(1, 3, sh);
    pc.hline(2, 4, 4, sh);
  } else {
    pc.rect(1, 2, 5, 2, colour);
    pc.set(6, 1, colour);
    pc.set(6, 2, colour);
    pc.set(5, 1, sh);
    pc.set(6, 0, sh);
    pc.set(0, 1, colour);
    pc.set(1, 4, sh);
    pc.set(5, 4, sh);
    if (f === 1) {
      pc.set(2, 4, sh);
      pc.set(4, 4, sh);
      pc.set(1, 4, 0);
      pc.set(5, 4, 0);
    }
  }
  pc.outline(C.ink1);
  return pc;
}

/** A cyclist (14×14): an outlined rider on a thin-framed bike, two pedalling frames. */
export function bikeArt(L: PersonLook, f: number): PixelCanvas {
  const pc = new PixelCanvas(14, 14);
  // wheels: dark tyres, a light hub
  for (const cx of [3, 10]) {
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      pc.set(Math.round(cx + Math.cos(ang) * 2.4), Math.round(10 + Math.sin(ang) * 2.4), C.ink2);
    }
    pc.set(cx, 10, C.ink7);
  }
  const frame = L.shirt === C.red3 ? C.blu4 : C.red3;
  pc.line(3, 10, 6, 10, frame);
  pc.line(6, 10, 9, 7, frame);
  pc.line(5, 7, 9, 7, frame);
  pc.line(5, 7, 6, 10, frame);
  pc.line(9, 7, 10, 10, frame);
  pc.set(9, 6, C.ink4);
  pc.set(10, 6, C.ink4);
  pc.set(4, 6, C.ink2);
  pc.set(5, 6, C.ink2);
  // the rider, outlined on its own so the wheels stay thin
  const r = new PixelCanvas(14, 14);
  const S = L.shirt;
  const sk = L.skin;
  const hat = L.hat !== 'none' && L.hat !== 'helmet' ? L.hatCol : L.hair;
  r.set(5, 0, hat);
  r.set(6, 0, hat);
  r.set(5, 1, L.hair);
  r.set(6, 1, sk);
  r.set(6, 2, sk);
  r.set(5, 2, sk);
  r.rect(4, 3, 3, 2, S);
  r.set(4, 5, shade(S));
  r.set(5, 5, S);
  r.set(7, 4, S);
  r.set(8, 5, sk);
  const P = L.outfit === 'dress' ? sk : L.outfit === 'jumpsuit' ? S : L.pants;
  r.set(4, 6, shade(P));
  r.set(5, 6, P);
  r.set(6, 6, P);
  if (f === 0) {
    r.set(7, 7, P);
    r.set(7, 8, P);
    r.set(7, 9, L.shoes);
  } else {
    r.set(7, 6, P);
    r.set(7, 7, P);
    r.set(6, 8, P);
    r.set(6, 9, L.shoes);
  }
  r.outline(C.ink1);
  pc.blit(r, 0, 0);
  return pc;
}

function birdArt(f: number): PixelCanvas {
  return f === 0 ? PixelCanvas.from(`a...a\n.a.a.\n..a..`, { a: 'ink2' }) : PixelCanvas.from(`.....\naaaaa\n..a..`, { a: 'ink2' });
}

/** A delivery quadcopter (9×7), rotors blurring, a parcel slung underneath. */
function droneArt(f: number, parcel: boolean): PixelCanvas {
  const pc = new PixelCanvas(9, 7);
  pc.hline(f ? 0 : 1, 0, 3, C.ink6);
  pc.hline(f ? 6 : 5, 0, 3, C.ink6);
  pc.set(1, 1, C.ink4);
  pc.set(7, 1, C.ink4);
  pc.hline(1, 2, 7, C.ink4);
  pc.rect(3, 1, 3, 2, C.white);
  pc.set(4, 2, C.cyn4);
  if (parcel) {
    pc.set(4, 3, C.ink5);
    pc.rect(3, 4, 3, 2, C.snd5);
    pc.hline(3, 4, 3, C.snd6);
  }
  return pc;
}

// ── colour maths for tints ─────────────────────────────────────────────────────────────────
function rgb(t: number): [number, number, number] {
  return [((t >> 16) & 255) / 255, ((t >> 8) & 255) / 255, (t & 255) / 255];
}
function hexOf([r, g, b]: [number, number, number]): number {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}

/** Body centre of a figure canvas (for callers placing figures by hand). */
export const FIG_CENTRE = FIG_BODY_X + 2;
