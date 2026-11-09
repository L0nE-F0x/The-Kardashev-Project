/**
 * A working day on a 3D campus. Everyone out there has a reason to be: staff park, walk in by the door and come out
 * again for a coffee and a chat beside it, a phone call pacing the forecourt, an errand to another building or lunch
 * on the benches, and go home in the evening; technicians walk the fence lines and the solar rows; crews work round
 * a building going up and fetch from the stacks; at night a guard walks the rounds and the halls' night shift steps
 * out for air. The clock is the campus's real local time (the scene's sun).
 *
 * Everyone walks the walk map (paths.ts): pavements first, never through a building, a fence or a parked car.
 * Indoors means hidden and asleep, so only the people outside cost anything; far and off-screen ones animate less often.
 */
import * as THREE from 'three';
import { isWalking, person, type Act, type Figure, type PersonName } from '../models';
import { Kit, lightPool, poolMat, rng } from '../kit';
import { person as boxPerson, type Env, type Piece } from '../pieces';
import { hitGeo, hitMat } from './life';
import {
  accessPavementX, bayRect, campusWalkMap, COST, frontPavementZ, grow, inRect, placeGate,
  type Bay, type Door, type P2, type PieceShape, type Place, type Rect, type Roads, type WalkMap,
} from './paths';

type Role = 'staff' | 'night' | 'guard' | 'crew' | 'advisor';

type Task =
  | { k: 'go'; to: P2; act?: Act; speed?: number }
  | { k: 'in'; door: Door; place: string }
  | { k: 'out'; door: Door }
  | { k: 'appear'; at: P2; face?: number }
  | { k: 'vanish' }
  | { k: 'stand'; secs: number; act?: Act; acts?: Act[]; slot?: Slot; face?: number }
  | { k: 'box'; on: boolean };

interface Spot {
  x: number;
  z: number;
  slots: Slot[];
  /** Who's talking (the rest listen), and till when. */
  talker: Agent | null;
  talkUntil: number;
}
interface Slot { spot: Spot; x: number; z: number; face: number; sit?: boolean; by: Agent | null }

interface Car { obj: THREE.Object3D; bay: Bay; place: string; owner: Agent | null; stand: P2 }

interface Agent {
  key: string;
  role: Role;
  kind: PersonName;
  height: number;
  fig: Figure | null;
  obj: THREE.Object3D;
  home: string;
  /** The place they're inside (or last went into). */
  at: string;
  state: 'away' | 'inside' | 'out';
  /** On site from `arrive` to `leave` (local hours; leave < arrive = overnight). */
  arrive: number;
  leave: number;
  car: Car | null;
  tasks: Task[];
  route: P2[] | null;
  ri: number;
  pos: THREE.Vector3;
  heading: number;
  wait: number;
  step: number;
  slot: Slot | null;
  lunch: number;
  /** When they go for lunch (local hour). */
  lunchAt: number;
  pick: number;
  /** The guard: which stop of the round is next. */
  beat: number;
  act: Act;
  advisor?: string;
  hit?: THREE.Mesh;
  acc: number;
  box?: THREE.Object3D;
  r: () => number;
  /** Dismissed (their place went): finish and go. */
  done?: boolean;
  /** Bit's trail: where they've been lately. */
  trail?: { x: number; z: number; t: number }[];
}

/** Who works where (figure, role); the first ones stay when there are too many people. */
const STAFF: Partial<Record<Place['kind'], [PersonName, Role][]>> = {
  hq: [['office', 'staff'], ['researcher', 'staff'], ['engineer', 'staff'], ['scientist', 'staff']],
  hall: [['engineer', 'staff'], ['engineer', 'night'], ['office', 'staff'], ['engineer', 'staff']],
  lab: [['researcher', 'staff'], ['scientist', 'staff'], ['researcher', 'staff'], ['scientist', 'staff'], ['office', 'staff']],
  plant: [['worker', 'staff'], ['office', 'staff'], ['worker', 'night']],
  set: [['office', 'staff'], ['engineer', 'staff']],
};
/** Everyone on a campus's payroll (a big Act II campus doesn't get a crowd: the first ones of each place stay). */
const MAX_STAFF = 34;

/** What each advisor tends to do standing about. */
const PERSONA: Record<string, Act[]> = {
  juno: ['talk', 'look', 'idle', 'chat'], penny: ['phone', 'phone', 'talk', 'idle'], mira: ['phone', 'idle', 'talk'],
  sol: ['talk', 'chat', 'chat', 'idle'], iris: ['idle', 'talk', 'look'], kip: ['talk', 'chat', 'look'], lena: ['idle', 'talk', 'phone'],
};

const TAU = Math.PI * 2;
/** How far someone walks into a door before they're inside (doors stand ~0.6–0.75 m out from the wall). */
const STEP_IN = 0.55;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const faceTo = (from: P2, to: P2) => Math.atan2(to.x - from.x, to.z - from.z);
/** Is local hour h within [a, b) (wrapping past midnight)? */
const within = (h: number, a: number, b: number) => (a <= b ? h >= a && h < b : h >= a || h < b);
/** An hour difference folded into −12..12. */
const wrapHours = (d: number) => ((((d + 12) % 24) + 24) % 24) - 12;

export interface CarObj { obj: THREE.Object3D; bay: Bay; place: string }

export class CampusPeople {
  readonly group = new THREE.Group();
  private decor = new THREE.Group();
  private agents: Agent[] = [];
  private byKey = new Map<string, Agent>();
  private places = new Map<string, Place>();
  map!: WalkMap;
  private roads!: Roads;
  private breaks = new Map<string, Spot>();
  private lunchSpots: Spot[] = [];
  private work = new Map<string, Spot>();
  private stacks = new Map<string, P2>();
  private loops = new Map<string, P2[]>();
  private patrol: P2[] = [];
  private cars: Car[] = [];
  private gate: P2 = { x: 0, z: 0 };
  private hour = 12;
  private day = 0;
  private frame = 0;
  private time = 0;
  private torch = poolMat('#ffe9c0', 0.9);
  private frustum = new THREE.Frustum();
  private sphere = new THREE.Sphere(new THREE.Vector3(), 1.3);
  private debugOn = false;
  private debugGroup = new THREE.Group();

  constructor(private readonly h: (x: number, z: number) => number) {
    this.group.add(this.decor, this.debugGroup);
  }

  // ── the places ─────────────────────────────────────────────────────────────────────────────
  /**
   * (Re)build the walk map from the places, then make the people fit: new places get staff (and crews while they're
   * built), people of places that went finish what they're doing and leave. `hour` = local time now.
   */
  setPlaces(bounds: Rect, roads: Roads, places: Place[], cars: CarObj[], extra: Rect[], hour: number) {
    this.hour = hour;
    this.roads = roads;
    this.places = new Map(places.map((p) => [p.id, p]));
    // benches and the forecourt paths are laid first, then the map is built with the benches in it
    this.decor.clear();
    const benches = this.planBenches(places, bounds, roads, extra);
    this.map = campusWalkMap(bounds, roads, places, [...extra, ...benches.map((b) => b.rect)]);
    this.gate = this.map.nearestFree(accessPavementX(roads), roads.highwayZ - 9) ?? { x: accessPavementX(roads), z: roads.highwayZ - 9 };
    this.layPaths(places);
    this.buildBenches(benches);
    this.planSpots(places);
    this.planLoops(places);
    this.planPatrol(places);
    // cars: keep owners where the same car is still there
    const old = new Map(this.cars.map((c) => [c.obj, c]));
    // (where a driver gets out: the open ground by the car that leads somewhere, not a gap between two cars)
    this.cars = cars.flatMap((c) => {
      const o = old.get(c.obj);
      const p = this.places.get(c.place);
      const stand = p ? this.anchor(c.bay, placeGate(p, roads), 5) : null;
      return stand ? [{ obj: c.obj, bay: c.bay, place: c.place, owner: o?.owner ?? null, stand }] : [];
    });
    for (const a of this.agents) if (a.car && !this.cars.some((c) => c.obj === a.car!.obj)) a.car = null;
    // who should be here
    const want: { key: string; kind: PersonName; role: Role; home: string }[] = [];
    let n = 0;
    const staffed = places.filter((p) => STAFF[p.kind] && !p.building);
    for (let round = 0; round < 5; round++) for (const p of staffed) {
      const list = STAFF[p.kind]!;
      if (round >= list.length || n >= MAX_STAFF) continue;
      const [kind, role] = p.kind === 'set' && /pit|crusher|brine|salt|gas/i.test(p.id) ? (['worker', 'staff'] as [PersonName, Role]) : list[round];
      want.push({ key: `${p.id}#${round}`, kind, role, home: p.id });
      n++;
    }
    for (const p of places) if (p.building && p.site) {
      const crew = (p.rect.x1 - p.rect.x0) * (p.rect.z1 - p.rect.z0) > 1000 ? 6 : 4;
      for (let i = 0; i < crew; i++) want.push({ key: `${p.id}~crew${i}`, kind: 'worker', role: 'crew', home: p.id });
    }
    if (staffed.length) want.push({ key: 'guard', kind: 'office', role: 'guard', home: staffed[0].id });
    const keys = new Set(want.map((w) => w.key));
    for (const a of [...this.agents]) {
      if (a.role === 'advisor') { if (!this.places.has(a.home)) a.home = staffed[0]?.id ?? ''; continue; }
      if (!keys.has(a.key)) this.dismiss(a);
      else { a.route = null; if (!this.places.has(a.at)) a.at = a.home; }
    }
    for (const w of want) if (!this.byKey.has(w.key)) this.spawn(w.key, w.kind, w.role, w.home);
    if (this.debugOn) this.drawDebug();
  }

  /** People whose place went: crews walk off, staff head home. */
  private dismiss(a: Agent) {
    if (a.done) return;
    a.done = true;
    if (a.state !== 'out') { this.remove(a); return; }
    this.release(a);
    a.tasks = [{ k: 'box', on: false }, { k: 'go', to: a.car?.stand ?? this.gate }, { k: 'vanish' }];
    a.route = null;
  }

  private remove(a: Agent) {
    this.release(a);
    if (a.car?.owner === a) a.car.owner = null;
    this.group.remove(a.obj);
    this.agents.splice(this.agents.indexOf(a), 1);
    this.byKey.delete(a.key);
  }

  // ── people ─────────────────────────────────────────────────────────────────────────────────
  private makeFigure(kind: PersonName, height: number, seed: number): { fig: Figure | null; obj: THREE.Object3D } {
    const fig = person(kind, height);
    if (fig) {
      // people cast shadows, but don't need their own shadow pass culled per bone
      return { fig, obj: fig.obj };
    }
    return { fig: null, obj: boxPerson(seed, kind === 'worker') };
  }

  private spawn(key: string, kind: PersonName, role: Role, home: string, advisor?: string): Agent {
    const r = rng(hashKey(key));
    const height = role === 'advisor' ? 1.75 : 1.75 * (0.93 + r() * 0.13);
    const { fig, obj } = this.makeFigure(kind, height, hashKey(key));
    obj.visible = false;
    this.group.add(obj);
    // shifts: office hours with a spread; the night shift and the guard overnight; crews early
    const [arrive, leave] = role === 'night' ? [18.6 + r() * 0.8, 6.8 + r() * 0.8]
      : role === 'guard' ? [18.2 + r() * 0.5, 6.4 + r() * 0.4]
      : role === 'crew' ? [6.4 + r() * 0.8, 16.4 + r() * 1.0]
      : role === 'advisor' ? [7.2 + r() * 1.2, 20.8 + r() * 1.4]
      : [7.0 + r() * 2.4, 16.6 + r() * 2.4];
    const a: Agent = {
      key, role, kind, height, fig, obj, home, at: home, state: 'away', arrive, leave, car: null, tasks: [], route: null, ri: 0,
      pos: new THREE.Vector3(), heading: 0, wait: 0, step: 0, slot: null, lunch: -1, lunchAt: 11.8 + r() * 1.5, pick: 0, beat: 0, act: 'walk', acc: 0, r, advisor,
    };
    this.agents.push(a);
    this.byKey.set(key, a);
    if (advisor) this.addHit(a);
    this.claimCar(a);
    this.settle(a);
    return a;
  }

  /**
   * Where someone is when the scene opens (or the clock jumps): the day already under way, so some are out on their
   * business, the rest indoors; off shift, away.
   */
  private settle(a: Agent) {
    this.release(a);
    a.tasks = [];
    a.route = null;
    a.step = 0;
    a.obj.visible = false;
    a.state = 'away';
    a.at = a.home;
    this.carry(a, false);
    if (a.role === 'staff' || a.role === 'night') a.lunch = this.hour > a.lunchAt + 1.2 ? this.day : -1;
    if (!this.onShift(a)) { a.wait = a.r() * 10; return; }
    if (a.role === 'crew') this.crewNext(a, true);
    else if (a.role === 'advisor') this.advisorNext(a, true);
    else if (a.role === 'guard') this.guardNext(a, true);
    else if (a.r() < 0.4 && this.breakStart(a)) { /* standing at the break spot */ }
    else { a.state = 'inside'; a.wait = a.r() * 50; }
  }

  /** The clock jumped (a time-lapse, a QA hop): everyone where they'd be by now, the car parks with it. */
  private resettle() {
    for (const a of [...this.agents]) {
      if (a.done) { this.remove(a); continue; }
      this.settle(a);
    }
    this.parked = false;
  }

  private addHit(a: Agent) {
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.userData.advisor = a.advisor;
    a.obj.add(hit);
    hit.scale.setScalar(1 / a.obj.scale.x);
    a.hit = hit;
  }

  /** The advisors out on this campus today (they walk between the places, and you can click them). */
  setAdvisors(list: { id: string; kind: PersonName }[]) {
    const keys = new Set(list.map((l) => `adv:${l.id}`));
    for (const a of [...this.agents]) if (a.role === 'advisor' && !keys.has(a.key)) this.remove(a);
    for (const l of list) if (!this.byKey.has(`adv:${l.id}`)) this.spawn(`adv:${l.id}`, l.kind, 'advisor', this.firstPlace(), l.id);
  }

  /** Give an advisor their own figure once it has loaded. */
  reskin(id: string, kind: PersonName) {
    const a = this.byKey.get(`adv:${id}`);
    if (!a) return;
    const fig = person(kind, a.height);
    if (!fig) return;
    fig.obj.position.copy(a.obj.position);
    fig.obj.rotation.copy(a.obj.rotation);
    fig.obj.visible = a.obj.visible;
    if (a.hit) { a.obj.remove(a.hit); fig.obj.add(a.hit); a.hit.scale.setScalar(1 / fig.obj.scale.x); }
    this.group.remove(a.obj);
    this.group.add(fig.obj);
    a.obj = fig.obj;
    a.fig = fig;
    a.kind = kind;
    fig.play(a.act, 0);
  }

  hitTargets(): THREE.Object3D[] {
    return this.agents.filter((a) => a.hit && a.obj.visible).map((a) => a.hit!);
  }

  private firstPlace() {
    for (const p of this.places.values()) if (p.kind === 'hq') return p.id;
    for (const p of this.places.values()) if (STAFF[p.kind]) return p.id;
    return '';
  }

  /** Drive in: staff park in their own place's bays first, then anywhere free nearby; the rest come on foot. */
  private claimCar(a: Agent) {
    if (a.role !== 'staff' && a.role !== 'night') return;
    const home = this.places.get(a.home);
    if (!home) return;
    const free = this.cars.filter((c) => !c.owner && !this.places.get(c.place)?.building);
    free.sort((p, q) => (p.place === a.home ? 0 : 1) - (q.place === a.home ? 0 : 1) || Math.hypot(p.bay.x - home.cx, p.bay.z - home.cz) - Math.hypot(q.bay.x - home.cx, q.bay.z - home.cz));
    const c = free[0];
    if (c && (c.place === a.home || Math.hypot(c.bay.x - home.cx, c.bay.z - home.cz) < 70)) { c.owner = a; a.car = c; }
  }

  private onShift(a: Agent) {
    if (a.done) return false;
    if (a.role === 'crew') return !!this.places.get(a.home)?.building && within(this.hour, a.arrive, a.leave);
    return within(this.hour, a.arrive, a.leave);
  }

  // ── what to do next ────────────────────────────────────────────────────────────────────────
  private think(a: Agent) {
    if (a.role === 'advisor') return this.advisorNext(a, false);
    if (a.role === 'crew') return this.crewNext(a, false);
    if (a.role === 'guard') return this.guardNext(a, false);
    const on = this.onShift(a);
    if (a.state === 'away') {
      if (!on) { a.wait = 20 + a.r() * 40; return; }
      if (a.done) { this.remove(a); return; }
      const home = this.places.get(a.home);
      if (!home) { a.wait = 30; return; }
      const door = this.doorOf(home, a);
      const start = a.car ? a.car.stand : this.gate;
      a.tasks = [{ k: 'appear', at: start, face: faceTo(start, door) }, { k: 'go', to: door }, { k: 'in', door, place: home.id }];
      a.state = 'out';
      return;
    }
    if (a.state === 'inside') {
      const here = this.places.get(a.at) ?? this.places.get(a.home);
      if (!here) { this.remove(a); return; }
      const door = this.doorOf(here, a);
      if (!on) {
        // home time: out of the door and away to the car (or the gate)
        a.tasks = [{ k: 'out', door }, { k: 'go', to: a.car?.stand ?? this.gate }, { k: 'vanish' }];
        a.state = 'out';
        return;
      }
      if (a.at !== a.home && a.r() < 0.7) {
        // an errand done: back to their own building
        const home = this.places.get(a.home)!;
        const hd = this.doorOf(home, a);
        a.tasks = [{ k: 'out', door }, { k: 'go', to: hd }, { k: 'in', door: hd, place: home.id }];
        a.state = 'out';
        return;
      }
      a.tasks = this.outing(a, here, door);
      a.state = 'out';
    }
  }

  /** A trip out of the building and back: coffee, lunch, a call, an errand, a round of the fence. */
  private outing(a: Agent, here: Place, door: Door): Task[] {
    const h = this.hour, night = a.role === 'night';
    const lunchtime = !night && h >= a.lunchAt && h < a.lunchAt + 1.2 && a.lunch !== this.day;
    const out: Task[] = [{ k: 'out', door }];
    const back = (): Task[] => [{ k: 'go', to: door }, { k: 'in', door, place: here.id }];
    if (lunchtime) {
      // lunch: a seat on a bench, or a group standing by it (some eat at their desks)
      a.lunch = this.day;
      const seat = a.r() < 0.8 ? this.freeSlot(this.lunchSpots, a, here) : null;
      if (seat) return [...out, { k: 'go', to: seat }, { k: 'stand', secs: 300 + a.r() * 600, slot: seat, acts: seat.sit ? ['sit'] : ['chat', 'listen', 'drink'] }, ...back()];
    }
    const techy = a.kind === 'engineer' || a.kind === 'worker' || night;
    const loopAt = techy ? this.loopFor(a, here) : null;
    const others = [...this.places.values()].filter((p) => p.id !== here.id && STAFF[p.kind] && !p.building);
    const w = {
      break: night ? 3 : h >= 9.8 && h < 11.4 ? 6 : h >= 14.5 && h < 16.2 ? 6 : 3,
      phone: night ? 0 : a.kind === 'office' || a.kind === 'researcher' ? 2 : 1,
      errand: night || !others.length ? 0 : 2.5,
      inspect: loopAt ? (night ? 4 : 3) : 0,
    };
    let pick = a.r() * (w.break + w.phone + w.errand + w.inspect);
    if ((pick -= w.break) < 0) {
      const slot = this.freeSlot([this.breaks.get(here.id)!].filter(Boolean), a, here);
      if (slot) return [...out, { k: 'go', to: slot }, { k: 'stand', secs: 80 + a.r() * 200, slot }, ...back()];
    } else if ((pick -= w.phone) < 0) {
      // a call, pacing up and down in front of the building
      const p1 = this.near(door, 3.5, a), p2 = this.near(door, 3.5, a);
      if (p1 && p2) {
        const call: Task[] = [];
        for (let i = 0; i < 2 + Math.floor(a.r() * 3); i++) call.push({ k: 'go', to: i % 2 ? p2 : p1, act: 'walkphone', speed: 0.85 }, { k: 'stand', secs: 6 + a.r() * 14, act: 'phone' });
        return [...out, ...call, ...back()];
      }
    } else if ((pick -= w.errand) < 0) {
      const to = others[Math.floor(a.r() * others.length)];
      const td = this.doorOf(to, a);
      return [...out, { k: 'go', to: td, act: a.r() < 0.25 ? 'walkphone' : 'walk' }, { k: 'in', door: td, place: to.id }];
    } else if (loopAt) {
      // a round: the fence line, the rows, the containers; a look at a few things on the way
      const tasks: Task[] = [...out];
      const start = Math.floor(a.r() * loopAt.length);
      for (let i = 0; i <= loopAt.length; i++) {
        const p = loopAt[(start + i) % loopAt.length];
        tasks.push({ k: 'go', to: p, speed: 1.05 });
        if (a.r() < 0.35) tasks.push({ k: 'stand', secs: 3 + a.r() * 5, acts: [a.r() < 0.5 ? 'inspect' : 'look'] });
      }
      return [...tasks, ...back()];
    }
    // nothing better: a breath of fresh air by the door
    const p = this.near(door, 2.5, a);
    return p ? [...out, { k: 'go', to: p }, { k: 'stand', secs: 30 + a.r() * 60, acts: ['idle', 'phone', 'look'] }, ...back()] : [{ k: 'stand', secs: 0 }, ...back()];
  }

  /** The open ground nearest `p` that can be walked to from `from` (null if none within reach). */
  private anchor(p: P2, from: P2, reach = 6, within?: Rect): P2 | null {
    for (let rad = 0; rad <= reach; rad += 0.5) {
      const n = rad === 0 ? 1 : Math.max(8, Math.round(rad * 6));
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU;
        const x = p.x + Math.cos(ang) * rad, z = p.z + Math.sin(ang) * rad;
        if (within && !inRect(within, x, z)) continue;
        if (this.map.free(x, z) && this.map.roomAt(x, z, 0.3) && this.map.route(from, { x, z })) return { x, z };
      }
    }
    return null;
  }

  /** Start the scene with someone already out at their break spot. */
  private breakStart(a: Agent): boolean {
    const here = this.places.get(a.home);
    const spot = here && this.breaks.get(here.id);
    if (!here || !spot) return false;
    const slot = this.freeSlot([spot], a, here);
    if (!slot) return false;
    const door = this.doorOf(here, a);
    a.tasks = [{ k: 'appear', at: slot, face: slot.face }, { k: 'stand', secs: 10 + a.r() * 60, slot }, { k: 'go', to: door }, { k: 'in', door, place: here.id }];
    a.state = 'out';
    return true;
  }

  /** The crew's day: work at a spot round the building, fetch from the stacks, lunch by the site office. */
  private crewNext(a: Agent, first: boolean) {
    const p = this.places.get(a.home);
    const office = this.siteDoors.get(a.home);
    const spot = this.work.get(a.home);
    if (!p || !office || !spot || !this.onShift(a)) {
      if (a.state === 'out') { a.tasks = [{ k: 'box', on: false }, { k: 'go', to: office ?? this.gate }, { k: 'vanish' }]; return; }
      if (a.done || !p?.building) { this.remove(a); return; }
      a.wait = 30;
      return;
    }
    const slot = this.freeSlot([spot], a, p);
    if (a.state !== 'out') {
      // clocking on at the site office
      a.state = 'out';
      a.tasks = [{ k: 'appear', at: first && slot ? slot : office, face: first && slot ? slot.face : a.r() * TAU }];
      return;
    }
    const h = this.hour;
    if (h >= 12 && h < 12.9 && a.lunch !== this.day) {
      // lunch together by the site office (the work spot is someone else's meanwhile)
      a.lunch = this.day;
      this.release(a);
      const s = this.near(office, 2.5, a, this.yards.get(a.home));
      if (s) { a.tasks = [{ k: 'go', to: s }, { k: 'stand', secs: 600 + a.r() * 600, acts: ['drink', 'chat', 'listen', 'idle'] }]; return; }
    }
    const stack = this.stacks.get(a.home);
    if (stack && slot && a.r() < 0.35) {
      a.tasks = [{ k: 'go', to: stack }, { k: 'stand', secs: 3.2, acts: ['pickup'], face: faceTo(stack, { x: p.cx, z: p.cz }) + Math.PI }, { k: 'box', on: true },
        { k: 'go', to: slot, act: 'carry', speed: 1.0 }, { k: 'stand', secs: 2.6, acts: ['collect'], slot }, { k: 'box', on: false },
        { k: 'stand', secs: 12 + a.r() * 20, acts: ['hammer', 'collect', 'pickup'], slot }];
      return;
    }
    if (slot) { a.tasks = [{ k: 'go', to: slot }, { k: 'stand', secs: 30 + a.r() * 60, acts: ['hammer', 'collect', 'pickup', 'look'], slot }]; return; }
    const s = this.near(office, 3, a, this.yards.get(a.home));
    a.tasks = s ? [{ k: 'go', to: s }, { k: 'stand', secs: 20 + a.r() * 20, acts: ['chat', 'listen', 'drink'] }] : [{ k: 'stand', secs: 5, acts: ['idle'] }];
  }

  /** The night guard: in from the gate, the rounds with a look at each stop, out at dawn. */
  private guardNext(a: Agent, first: boolean) {
    const on = this.onShift(a) && this.patrol.length > 1;
    if (a.state !== 'out') {
      if (!on) { a.wait = 30; return; }
      a.state = 'out';
      a.beat = Math.floor(a.r() * this.patrol.length);
      a.tasks = [{ k: 'appear', at: first ? this.patrol[a.beat] : this.gate }];
      return;
    }
    if (!on) { a.tasks = [{ k: 'go', to: this.gate, speed: 1.1 }, { k: 'vanish' }]; return; }
    a.beat = (a.beat + 1) % this.patrol.length;
    const p = this.patrol[a.beat];
    a.tasks = [{ k: 'go', to: p, speed: 0.95 }, { k: 'stand', secs: 3 + a.r() * 6, acts: ['look'] }];
  }

  /** The advisors: out and about all day between the buildings, the site, the break spots; home at night. */
  private advisorNext(a: Agent, first: boolean) {
    const on = this.onShift(a);
    const homeP = this.places.get(a.home) ?? this.places.get(this.firstPlace());
    const hd = homeP ? this.doorOf(homeP, a) : null;
    if (a.state !== 'out') {
      if (!on) { a.wait = 30; return; }
      a.state = 'out';
      if (!first && hd) { a.tasks = [{ k: 'out', door: hd }]; return; }
      const s = this.advisorStation(a);
      a.tasks = [{ k: 'appear', at: s ?? this.gate, face: a.r() * TAU }];
      return;
    }
    if (!on) { a.tasks = hd && homeP ? [{ k: 'go', to: hd }, { k: 'in', door: hd, place: homeP.id }] : [{ k: 'go', to: this.gate }, { k: 'vanish' }]; return; }
    const s = this.advisorStation(a);
    const acts = PERSONA[a.advisor ?? ''] ?? ['idle', 'talk'];
    if (!s) { a.tasks = [{ k: 'stand', secs: 10, acts }]; return; }
    a.tasks = [{ k: 'go', to: s, speed: 1.15 }, { k: 'stand', secs: 25 + a.r() * 45, acts, slot: 'spot' in s ? (s as Slot) : undefined }];
  }

  /** Somewhere an advisor has business: a break group, the site, a building's forecourt. */
  private advisorStation(a: Agent): P2 | Slot | null {
    const sites = [...this.siteDoors.values()];
    if (a.advisor === 'juno' && sites.length && a.r() < 0.6) {
      const n = this.near(sites[Math.floor(a.r() * sites.length)], 4, a);
      if (n) return n;
    }
    const pref = a.advisor === 'iris' || a.advisor === 'lena' ? 'lab' : a.advisor === 'mira' ? 'hall' : a.advisor === 'penny' ? 'hq' : null;
    const staffed = [...this.places.values()].filter((p) => STAFF[p.kind] && !p.building);
    const mine = staffed.filter((p) => p.kind === pref);
    const pool = mine.length && a.r() < 0.55 ? mine : staffed;
    const p = pool[Math.floor(a.r() * pool.length)];
    if (!p) return null;
    if (a.r() < 0.5) {
      const slot = this.freeSlot([this.breaks.get(p.id)!].filter(Boolean), a, p);
      if (slot) return slot;
    }
    return this.near(this.doorOf(p, a), 4.5, a);
  }

  // ── spots ──────────────────────────────────────────────────────────────────────────────────
  private doorOf(p: Place, a: Agent): Door {
    return p.doors[Math.abs(hashKey(a.key)) % p.doors.length] ?? p.doors[0];
  }

  /** A free spot within `r` of a point (open ground, reachable), or null. */
  private near(c: P2, rad: number, a: Agent, within?: Rect): P2 | null {
    for (let i = 0; i < 12; i++) {
      const ang = a.r() * TAU, d = rad * (0.5 + a.r() * 0.5);
      const x = c.x + Math.cos(ang) * d, z = c.z + Math.sin(ang) * d;
      if (within && !inRect(within, x, z)) continue;
      const k = this.map.costAt(x, z);
      if (k && k <= COST.ground && this.map.roomAt(x, z, 0.5)) return { x, z };
    }
    return null;
  }

  /** A free slot at one of the spots (nearest to `p` first); the agent reserves it. */
  private freeSlot(spots: Spot[], a: Agent, p: Place): Slot | null {
    const order = [...spots].sort((s, q) => Math.hypot(s.x - p.cx, s.z - p.cz) - Math.hypot(q.x - p.cx, q.z - p.cz));
    // (whatever they held is free again: they're moving on)
    this.release(a);
    for (const s of order) {
      const free = s.slots.filter((x) => !x.by);
      if (!free.length) continue;
      const slot = free[Math.floor(a.r() * free.length)];
      slot.by = a;
      a.slot = slot;
      return slot;
    }
    return null;
  }

  private release(a: Agent) {
    if (a.slot) { if (a.slot.by === a) a.slot.by = null; if (a.slot.spot.talker === a) a.slot.spot.talker = null; }
    a.slot = null;
  }

  /**
   * Where a building's people stand about on a break: open ground near the door with room for a group, on their own
   * plot if it can be, a step off the way in (the doorway clear), never in a parking bay or a car park's aisle.
   */
  private breakSpot(p: Place, places: Place[]): P2 | null {
    const d = p.doors[0];
    const tx = -d.nz, tz = d.nx;
    const gate = placeGate(p, this.roads);
    const cands: { x: number; z: number; score: number }[] = [];
    for (let rad = 2.5; rad <= 10; rad += 1.25) {
      for (let k = 0; k < 20; k++) {
        const ang = (k / 20) * TAU;
        const x = d.x + Math.cos(ang) * rad, z = d.z + Math.sin(ang) * rad;
        const along = (x - d.x) * d.nx + (z - d.z) * d.nz, side = (x - d.x) * tx + (z - d.z) * tz;
        if (along < -0.3 || (Math.abs(side) < 1.8 && along < 7)) continue;
        const c = this.map.costAt(x, z);
        if (!c || c > COST.ground || !this.map.roomAt(x, z, 1.1)) continue;
        // on this side of the road (a group across the street from its door reads wrong)
        const lc = this.map.lineCost(d, { x, z });
        if (!lc || lc > COST.ground) continue;
        if (places.some((q) => q.bays.some((b) => Math.hypot(b.x - x, b.z - z) < 4))) continue;
        // not on the straight way from the gate to the door
        const gx = d.x - gate.x, gz = d.z - gate.z, gl = Math.hypot(gx, gz) || 1;
        const off = Math.abs(((x - gate.x) * gz - (z - gate.z) * gx) / gl);
        if (off < 2) continue;
        cands.push({ x, z, score: rad + (inRect(p.rect, x, z) ? 0 : 4) });
      }
    }
    cands.sort((a, b) => a.score - b.score);
    for (const c of cands.slice(0, 12)) if (this.map.route(d, c)) return { x: c.x, z: c.z };
    return null;
  }

  /** A ring of standing places round a point (facing in). */
  private ring(x: number, z: number, n: number, rad: number, turn = 0): Spot {
    const spot: Spot = { x, z, slots: [], talker: null, talkUntil: 0 };
    for (let i = 0; i < n; i++) {
      const ang = turn + (i / n) * TAU;
      const sx = x + Math.cos(ang) * rad, sz = z + Math.sin(ang) * rad;
      if (!this.map.free(sx, sz)) continue;
      spot.slots.push({ spot, x: sx, z: sz, face: faceTo({ x: sx, z: sz }, { x, z }), by: null });
    }
    return spot;
  }

  /** Break spots beside each door; work spots round each building site; the site's stacks. */
  private planSpots(places: Place[]) {
    const keep = new Map(this.breaks);
    this.breaks.clear();
    this.work.clear();
    this.stacks.clear();
    for (const p of places) {
      if (!STAFF[p.kind] || !p.doors.length || p.building) continue;
      const best = this.breakSpot(p, places);
      if (!best) continue;
      const old = keep.get(p.id);
      const spot = this.ring(best.x, best.z, 4, 0.72, 0.4);
      if (old) for (const s of old.slots) if (s.by) { const ns = spot.slots[old.slots.indexOf(s)]; if (ns) { ns.by = s.by; s.by.slot = ns; } }
      if (spot.slots.length >= 2) {
        this.breaks.set(p.id, spot);
        // others give a chatting group a little room
        this.map.surface({ x0: best.x - 1.1, z0: best.z - 1.1, x1: best.x + 1.1, z1: best.z + 1.1 }, 3.4);
      }
    }
    this.siteDoors.clear();
    this.yards.clear();
    for (const p of places) {
      if (!p.building || !p.site) continue;
      // the crew clock on by the site office (on whichever side has room: a fenced yard's office backs onto the fence)
      // (and the site's people stay on the site: inside a fenced yard's fence)
      const gate = placeGate(p, this.roads);
      const yard = p.fence ? grow(p.fence.rect, -0.4) : p.rect;
      const office = this.anchor(p.site.door, gate, 8, yard) ?? this.anchor(p.site.door, gate, 7);
      if (!office) continue;
      this.siteDoors.set(p.id, office);
      this.yards.set(p.id, yard);
      const body = p.solids[0];
      const spot: Spot = { x: p.cx, z: p.cz, slots: [], talker: null, talkUntil: 0 };
      // work along every side of the building going up (the front first, where it shows), facing it
      const add = (x: number, z: number, face: number) => {
        if (spot.slots.some((s) => Math.hypot(s.x - x, s.z - z) < 2) || !inRect(yard, x, z)) return;
        if (this.map.free(x, z) && this.map.route(office, { x, z })) spot.slots.push({ spot, x, z, face, by: null });
      };
      for (const m of [1.35, 2.4]) {
        const ring = grow(body, m);
        for (let x = ring.x0 + 1.5; x <= ring.x1 - 1.5; x += 2.6) add(x, ring.z1, Math.PI);
        for (let z = ring.z0 + 1.5; z <= ring.z1 - 1.5; z += 2.6) { add(ring.x0, z, Math.PI / 2); add(ring.x1, z, -Math.PI / 2); }
        for (let x = ring.x0 + 1.5; x <= ring.x1 - 1.5; x += 2.6) add(x, ring.z0, 0);
      }
      this.work.set(p.id, spot);
      const st = this.anchor(p.site.stack, office, 4, yard);
      if (st) this.stacks.set(p.id, st);
    }
  }
  private siteDoors = new Map<string, P2>();
  private yards = new Map<string, Rect>();

  /** Rounds: inside a fence's line, or round a field's edge (points a few metres apart, every one reachable). */
  private planLoops(places: Place[]) {
    this.loops.clear();
    for (const p of places) {
      if (!['hall', 'plant', 'yard', 'field'].includes(p.kind) || p.building) continue;
      const ring = p.fence ? grow(p.fence.rect, -1.3) : grow(p.rect, -0.9);
      const pts: P2[] = [];
      const per = (x: number, z: number) => { const f = this.map.nearestFree(x, z, 1.2); if (f && !pts.some((q) => Math.hypot(q.x - f.x, q.z - f.z) < 2.5)) pts.push(f); };
      for (let x = ring.x0; x <= ring.x1; x += 5) per(x, ring.z1);
      for (let z = ring.z1; z >= ring.z0; z -= 5) per(ring.x1, z);
      for (let x = ring.x1; x >= ring.x0; x -= 5) per(x, ring.z0);
      for (let z = ring.z0; z <= ring.z1; z += 5) per(ring.x0, z);
      const gate = placeGate(p, this.roads);
      const ok = pts.filter((q) => this.map.route(gate, q));
      if (ok.length >= 3) this.loops.set(p.id, ok);
    }
  }

  private loopFor(a: Agent, here: Place): P2[] | null {
    const own = this.loops.get(here.id);
    if (own && a.r() < 0.6) return own;
    const near = [...this.loops.entries()].map(([id, l]) => ({ id, l, p: this.places.get(id)! })).filter((x) => x.p)
      .sort((x, y) => Math.hypot(x.p.cx - here.cx, x.p.cz - here.cz) - Math.hypot(y.p.cx - here.cx, y.p.cz - here.cz));
    return near.length ? near[Math.floor(a.r() * Math.min(3, near.length))].l : own ?? null;
  }

  /** The guard's round: up the pavement past every gate and door, round the back lane, down the access road. */
  private planPatrol(places: Place[]) {
    const R = this.roads, pz = frontPavementZ(R), ax = accessPavementX(R);
    const stops: P2[] = [{ x: ax, z: pz }];
    for (const p of [...places].filter((q) => STAFF[q.kind]).sort((q, s) => q.cx - s.cx)) stops.push(p.doors[0]);
    stops.push({ x: R.east + 3, z: pz });
    if (R.laneZ !== null) stops.push({ x: R.east + 2, z: R.laneZ }, { x: ax, z: R.laneZ });
    this.patrol = stops.map((s) => this.map.nearestFree(s.x, s.z, 3)).filter((s): s is P2 => !!s && !!this.map.route(stops[0], s));
  }

  // ── benches and paths ──────────────────────────────────────────────────────────────────────
  /** Where the lunch benches go: open ground near the HQ and the labs, clear of doors and the way in. */
  private planBenches(places: Place[], bounds: Rect, roads: Roads, extra: Rect[]) {
    const out: { x: number; z: number; ry: number; rect: Rect }[] = [];
    const solid = (r: Rect) => places.some((p) => p.solids.some((s) => overlap(grow(s, 0.9), r)) || p.bays.some((b) => overlap(grow(bayRect(b), 0.8), r)) || (p.fence && overlap(r, p.fence.rect) && !insideRect(r, grow(p.fence.rect, -0.8)))) || extra.some((s) => overlap(grow(s, 0.9), r));
    const hosts = places.filter((p) => (p.kind === 'hq' || p.kind === 'lab') && !p.building);
    if (!hosts.length) { const h = places.find((p) => STAFF[p.kind] && !p.building); if (h) hosts.push(h); }
    for (const p of hosts.slice(0, 3)) {
      let n = 0;
      const pz = frontPavementZ(roads);
      for (const [dx, dz] of [[0.32, 0.42], [-0.34, 0.42], [0.4, 0.3], [-0.4, 0.3], [0.25, 0.36], [-0.25, 0.36]] as [number, number][]) {
        if (n >= 2) break;
        const w = p.rect.x1 - p.rect.x0, d = p.rect.z1 - p.rect.z0;
        const x = p.cx + dx * w, z = p.cz + dz * d;
        const rect = { x0: x - 1.0, z0: z - 0.35, x1: x + 1.0, z1: z + 0.35 };
        const clearance = grow(rect, 1.2);
        if (!inRect(p.rect, clearance.x0, clearance.z0) || !inRect(p.rect, clearance.x1, clearance.z1) || z > pz - 2.5) continue;
        if (solid(clearance) || p.doors.some((dr) => Math.hypot(dr.x - x, dr.z - z) < 4)) continue;
        if (out.some((b) => overlap(grow(b.rect, 1.5), rect))) continue;
        out.push({ x, z, ry: 0, rect });
        n++;
      }
    }
    void bounds;
    return out;
  }

  private buildBenches(benches: { x: number; z: number; ry: number; rect: Rect }[]) {
    this.lunchSpots = [];
    const k = new Kit(rng(31));
    for (const b of benches) {
      const y = this.h(b.x, b.z);
      for (const lx of [-0.8, 0.8]) k.box(0.1, 0.42, 0.46, '#433c52', b.x + lx, y, b.z, { r: 0, jitter: 0 });
      k.box(1.9, 0.07, 0.48, '#9c6c3d', b.x, y + 0.42, b.z, { r: 0.02 });
      k.box(1.9, 0.42, 0.06, '#9c6c3d', b.x, y + 0.5, b.z - 0.23, { r: 0.02 });
      // two seats, facing out (+z); the sitter's feet are in front of the seat
      const spot: Spot = { x: b.x, z: b.z + 0.6, slots: [], talker: null, talkUntil: 0 };
      for (const sx of [-0.45, 0.45]) spot.slots.push({ spot, x: b.x + sx, z: b.z + 0.42, face: 0, sit: true, by: null });
      this.lunchSpots.push(spot);
      // and a pair standing to chat beside it
      const side: Spot = { x: b.x, z: b.z + 2, slots: [], talker: null, talkUntil: 0 };
      for (const [sx, sz, f] of [[-0.5, 1.9, Math.PI / 2], [0.5, 1.9, -Math.PI / 2]] as [number, number, number][]) side.slots.push({ spot: side, x: b.x + sx, z: b.z + sz, face: f, by: null });
      this.lunchSpots.push(side);
    }
    if (benches.length) this.decor.add(k.build());
  }

  /** A paved path from the pavement (or the gate) to each building's door, so the way in reads. */
  private layPaths(places: Place[]) {
    const k = new Kit(rng(17));
    let any = false;
    for (const p of places) {
      if (!STAFF[p.kind] || p.kind === 'hq' || p.building) continue;
      const g = placeGate(p, this.roads);
      for (const d of p.doors) {
        const r = this.map.route(g, d);
        if (!r) continue;
        for (let i = 1; i < r.length; i++) {
          const a = r[i - 1], b = r[i];
          const len = Math.hypot(b.x - a.x, b.z - a.z);
          if (len < 0.05) continue;
          const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
          k.box(1.2, 0.06, len + 0.6, '#d6cec2', mx, this.h(mx, mz) + 0.02, mz, { r: 0, ry: Math.atan2(b.x - a.x, b.z - a.z), jitter: 0.02, shade: 0 });
          this.map.strip(a, b, 1.1, COST.path);
          any = true;
        }
      }
    }
    if (any) { const m = k.build(); m.castShadow = false; this.decor.add(m); }
  }

  // ── the frame ──────────────────────────────────────────────────────────────────────────────
  update(e: Env, hour: number, cam: THREE.Camera) {
    if (hour < this.hour - 12) this.day++;
    const jump = Math.abs(wrapHours(hour - this.hour)) > 0.5;
    this.hour = hour;
    if (jump) this.resettle();
    this.time += e.dt;
    this.frame++;
    this.frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    // cars come and go with their drivers (only where nobody's looking)
    if (this.frame % 15 === 1) this.parkCars(cam);
    for (const a of [...this.agents]) {
      if (a.state !== 'out') {
        a.wait -= e.dt;
        if (a.wait <= 0) this.think(a);
        if ((a.state as Agent['state']) !== 'out') continue;
      }
      if (this.byKey.get(a.key) !== a) continue;
      if (!a.tasks.length) this.think(a);
      this.run(a, e);
      this.animate(a, e, cam);
    }
  }

  /** Drivers' cars are there while they are (unowned bays: visitors in office hours). */
  private parkCars(cam: THREE.Camera) {
    const camPos = cam.position;
    const first = !this.parked;
    this.parked = true;
    for (const c of this.cars) {
      // a building site's car park stays empty till it opens
      if (this.places.get(c.place)?.building) { c.obj.visible = false; continue; }
      const want = c.owner ? c.owner.state !== 'away' || within(this.hour, c.owner.arrive - 0.15, c.owner.leave) : within(this.hour, 7.4 + (hashKey(String(c.bay.x)) % 7) * 0.15, 18.2);
      if (c.obj.visible === want) continue;
      this.sphere.center.set(c.bay.x, 0.8, c.bay.z);
      const seen = this.frustum.intersectsSphere(this.sphere) && camPos.distanceTo(this.sphere.center) < 150;
      if (!seen || first) c.obj.visible = want;
    }
  }
  private parked = false;

  private run(a: Agent, e: Env) {
    const t = a.tasks[0];
    if (!t) return;
    switch (t.k) {
      case 'appear': {
        a.pos.set(t.at.x, this.h(t.at.x, t.at.z), t.at.z);
        a.heading = t.face ?? a.heading;
        a.obj.visible = true;
        this.setAct(a, 'idle', 0);
        a.tasks.shift();
        return;
      }
      case 'vanish': {
        a.obj.visible = false;
        a.state = 'away';
        a.tasks = [];
        this.release(a);
        a.wait = 20 + a.r() * 30;
        if (a.done) this.remove(a);
        return;
      }
      case 'box': {
        this.carry(a, t.on);
        a.tasks.shift();
        return;
      }
      case 'out': {
        // from just inside the door out onto its step
        if (a.step === 0) {
          a.obj.visible = true;
          a.heading = Math.atan2(t.door.nx, t.door.nz);
          this.setAct(a, 'walk', 0);
        }
        a.step = Math.min(1, a.step + e.dt / 0.6);
        a.pos.set(t.door.x - t.door.nx * STEP_IN * (1 - a.step), 0, t.door.z - t.door.nz * STEP_IN * (1 - a.step));
        a.pos.y = this.h(a.pos.x, a.pos.z);
        if (a.step >= 1) { a.step = 0; a.tasks.shift(); }
        return;
      }
      case 'in': {
        if (a.step === 0) { a.heading = Math.atan2(-t.door.nx, -t.door.nz); this.setAct(a, 'walk'); }
        a.step = Math.min(1, a.step + e.dt / 0.6);
        a.pos.set(t.door.x - t.door.nx * STEP_IN * a.step, 0, t.door.z - t.door.nz * STEP_IN * a.step);
        a.pos.y = this.h(a.pos.x, a.pos.z);
        if (a.step >= 1) {
          a.step = 0;
          a.obj.visible = false;
          a.state = 'inside';
          a.at = t.place;
          a.tasks = [];
          this.release(a);
          // a while at their desk (till lunch, if it's nearly time)
          const toLunch = (a.lunchAt - this.hour) * 3600;
          a.wait = a.role === 'night' ? 200 + a.r() * 400 : a.lunch !== this.day && toLunch > -1800 && toLunch < 600 ? Math.max(5, toLunch) + a.r() * 60 : 110 + a.r() * 300;
          if (a.done) this.remove(a);
        }
        return;
      }
      case 'go': {
        if (!a.route) {
          const r = this.map.route(a.pos, t.to);
          if (!r) {
            // nowhere to go from here (the ground changed under them): slip away rather than walk through anything
            a.obj.visible = false;
            a.tasks = [{ k: 'vanish' }];
            return;
          }
          a.route = keepRight(r, this.map, a.r() < 0.5 ? 0.28 : 0.18);
          a.ri = 0;
        }
        const speed = (t.speed ?? (a.role === 'advisor' ? 1.15 : 1.25)) * (0.92 + (hashKey(a.key) % 17) / 100);
        this.setAct(a, t.act ?? 'walk');
        a.fig?.pace(speed);
        let left = speed * e.dt;
        while (left > 0 && a.ri < a.route.length - 1) {
          const b = a.route[a.ri + 1];
          const dx = b.x - a.pos.x, dz = b.z - a.pos.z, d = Math.hypot(dx, dz);
          if (d <= left) { a.pos.x = b.x; a.pos.z = b.z; a.ri++; left -= d; continue; }
          a.pos.x += (dx / d) * left;
          a.pos.z += (dz / d) * left;
          left = 0;
          a.heading = turn(a.heading, Math.atan2(dx, dz), e.dt * 7);
        }
        a.pos.y = this.h(a.pos.x, a.pos.z);
        if (a.ri >= a.route.length - 1) { a.route = null; a.tasks.shift(); }
        return;
      }
      case 'stand': {
        if (a.step === 0) {
          a.step = 1;
          a.pick = 0;
          if (t.slot) { a.pos.set(t.slot.x, this.h(t.slot.x, t.slot.z), t.slot.z); }
        }
        const face = t.slot ? t.slot.face : t.face;
        if (face !== undefined) a.heading = turn(a.heading, face, e.dt * 5);
        // home time cuts a chat short
        if (t.secs > 4 && (this.frame & 31) === 0 && !this.onShift(a)) t.secs = 2 + a.r() * 4;
        t.secs -= e.dt;
        a.pick -= e.dt;
        if (a.pick <= 0) {
          a.pick = 4 + a.r() * 6;
          this.setAct(a, t.act ?? this.standAct(a, t), 0.45);
        }
        if (t.secs <= 0) {
          a.step = 0;
          if (t.slot && a.tasks[1]?.k !== 'stand') this.release(a);
          a.tasks.shift();
        }
        return;
      }
    }
  }

  /** What someone standing does: a group takes turns to talk; alone, a drink, the phone, a look round. */
  private standAct(a: Agent, t: { acts?: Act[]; slot?: Slot }): Act {
    if (t.acts?.length === 1) return t.acts[0];
    // a break group (or a lunch chat) takes turns to talk; work is work
    const spot = t.slot && (!t.acts || t.acts.includes('chat')) ? t.slot.spot : undefined;
    const company = spot ? spot.slots.filter((s) => s.by && s.by !== a && s.by.state === 'out' && s.by.tasks[0]?.k === 'stand').length : 0;
    if (spot && company > 0 && !t.slot?.sit) {
      if (!spot.talker || spot.talkUntil < this.time || spot.talker.slot?.spot !== spot) {
        spot.talker = a;
        spot.talkUntil = this.time + 4 + a.r() * 6;
      }
      if (spot.talker === a) return a.r() < 0.5 ? 'talk' : 'chat';
      return a.r() < 0.7 ? 'listen' : 'drink';
    }
    if (t.slot?.sit) return 'sit';
    const acts = t.acts ?? ['drink', 'phone', 'idle', 'look'];
    return acts[Math.floor(a.r() * acts.length)];
  }

  private setAct(a: Agent, act: Act, fade = 0.3) {
    if (a.act === act && a.fig?.act === a.fig?.resolve(act)) return;
    a.act = act;
    a.fig?.play(act, fade);
  }

  /** A box carried in both arms (the carry clip holds them out). */
  private carry(a: Agent, on: boolean) {
    if (on && !a.box) {
      const k = new Kit(rng(5));
      k.box(0.55, 0.36, 0.42, '#c08850', 0, 0, 0, { r: 0.03 });
      k.box(0.56, 0.05, 0.12, '#e9e1d2', 0, 0.33, 0, { r: 0, jitter: 0 });
      const m = k.build();
      m.scale.setScalar(1 / a.obj.scale.x);
      m.position.set(0, 0.95 / a.obj.scale.x, 0.36 / a.obj.scale.x);
      a.box = m;
      a.obj.add(m);
    }
    if (a.box) a.box.visible = on;
  }

  private animate(a: Agent, e: Env, cam: THREE.Camera) {
    const o = a.obj;
    o.position.copy(a.pos);
    o.rotation.y = a.heading;
    // the guard's torch at night
    if (a.role === 'guard' && e.night > 0.3 && !o.userData.torch) {
      o.userData.torch = true;
      const g = new THREE.Group();
      g.scale.setScalar(1 / o.scale.x);
      lightPool(g, 0, 0, 3.2, 1.5, this.torch, 0.8);
      o.add(g);
    }
    if (!a.fig) {
      if (isWalking(a.act)) o.position.y += Math.abs(Math.sin(this.time * 9)) * 0.06;
      return;
    }
    // animate less often when far or off-screen
    a.acc += e.dt;
    this.sphere.center.set(a.pos.x, a.pos.y + 0.9, a.pos.z);
    const onScreen = this.frustum.intersectsSphere(this.sphere);
    const far = cam.position.distanceTo(this.sphere.center);
    const every = !onScreen ? 0.25 : far > 170 ? 1 / 15 : far > 90 ? 1 / 30 : 0;
    if (a.acc >= every) { a.fig.update(a.acc); a.acc = 0; }
    // Bit's trail
    if (a.role === 'advisor' || a.role === 'guard') {
      a.trail ??= [];
      const last = a.trail[a.trail.length - 1];
      if (!last || Math.hypot(last.x - a.pos.x, last.z - a.pos.z) > 0.3) a.trail.push({ x: a.pos.x, z: a.pos.z, t: this.time });
      while (a.trail.length > 40) a.trail.shift();
    }
  }

  /**
   * Where Bit goes: a little behind an advisor who's out (on the way they came, so never into anything), or the guard
   * at night; beside them (on open ground) when they stand still, not on their head.
   */
  bitTarget(): { x: number; z: number; heading: number } | null {
    const outs = this.agents.filter((a) => a.role === 'advisor' && a.state === 'out' && a.obj.visible);
    const buddy = outs[Math.floor(this.time / 45) % Math.max(1, outs.length)] ?? this.agents.find((a) => a.role === 'guard' && a.state === 'out' && a.obj.visible);
    if (buddy) {
      const tr = buddy.trail ?? [];
      const back = tr.find((p) => this.time - p.t < 1.4) ?? tr[tr.length - 1] ?? buddy.pos;
      if (Math.hypot(back.x - buddy.pos.x, back.z - buddy.pos.z) > 1) return { x: back.x, z: back.z, heading: buddy.heading };
      const rx = Math.cos(buddy.heading), rz = -Math.sin(buddy.heading);
      for (const s of [1, -1]) {
        const x = buddy.pos.x + rx * 1.1 * s, z = buddy.pos.z + rz * 1.1 * s;
        if (this.map.free(x, z)) return { x, z, heading: buddy.heading };
      }
      return { x: back.x, z: back.z, heading: buddy.heading };
    }
    const s = this.breaks.values().next().value as Spot | undefined;
    return s ? { x: s.x, z: s.z, heading: 0 } : null;
  }

  /** Counts for QA: who's out, inside, away. */
  get census() {
    const c = { out: 0, inside: 0, away: 0, walking: 0, standing: 0 };
    for (const a of this.agents) {
      c[a.state]++;
      if (a.state === 'out') { if (a.tasks[0]?.k === 'go') c.walking++; else if (a.tasks[0]?.k === 'stand') c.standing++; }
    }
    return c;
  }

  /** QA: every route someone outside is walking right now (world points). */
  get routes(): P2[][] {
    return this.agents.filter((a) => a.state === 'out' && a.route).map((a) => a.route!.slice(a.ri));
  }

  /** QA: everyone outside: where, who, doing what (`door` = stepping through a door). */
  get outside() {
    return this.agents.filter((a) => a.state === 'out' && a.obj.visible).map((a) => ({
      key: a.key, role: a.role, x: a.pos.x, z: a.pos.z, task: a.tasks[0]?.k ?? '', act: a.act, door: a.tasks[0]?.k === 'in' || a.tasks[0]?.k === 'out',
    }));
  }

  // ── debug ──────────────────────────────────────────────────────────────────────────────────
  /** QA: show the solids (red), doors (green), spots (blue), rounds (yellow) and the guard's patrol. */
  debug(on: boolean) {
    this.debugOn = on;
    this.drawDebug();
  }

  private drawDebug() {
    for (const c of [...this.debugGroup.children]) { this.debugGroup.remove(c); (c as THREE.Mesh).geometry?.dispose(); }
    if (!this.debugOn || !this.map) return;
    const k = new Kit(rng(1));
    const y = (x: number, z: number) => this.h(x, z) + 0.15;
    for (const s of this.map.solids) k.box(s.x1 - s.x0, 0.1, s.z1 - s.z0, '#ff3030', (s.x0 + s.x1) / 2, y((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2), (s.z0 + s.z1) / 2, { r: 0, jitter: 0, shade: 0 });
    for (const [a, b] of this.map.fences) { const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2; k.box(Math.max(0.15, Math.abs(b.x - a.x)), 0.4, Math.max(0.15, Math.abs(b.z - a.z)), '#ff8030', mx, y(mx, mz), mz, { r: 0, jitter: 0, shade: 0 }); }
    for (const p of this.places.values()) for (const d of p.doors) k.box(0.5, 1.2, 0.5, '#30ff60', d.x, y(d.x, d.z), d.z, { r: 0, jitter: 0, shade: 0 });
    for (const s of [...this.breaks.values(), ...this.lunchSpots, ...this.work.values()]) for (const q of s.slots) k.box(0.3, 0.6, 0.3, '#3080ff', q.x, y(q.x, q.z), q.z, { r: 0, jitter: 0, shade: 0 });
    for (const l of [...this.loops.values(), this.patrol]) for (const q of l) k.box(0.35, 0.35, 0.35, '#ffe030', q.x, y(q.x, q.z), q.z, { r: 0, jitter: 0, shade: 0 });
    const m = k.build();
    m.castShadow = false;
    this.debugGroup.add(m);
  }

  destroy() {
    this.group.clear();
    this.agents = [];
    this.byKey.clear();
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────────────────────
/**
 * A piece as the walk map needs it: its doors and blockers (piece-local) and the cars its builder parked (found by
 * their `userData.bay`; bays piece-local in the shape, world in `cars`). The root stands on the plot unrotated.
 */
export function shapeOf(piece: Piece, root: THREE.Object3D): { shape: PieceShape; cars: { obj: THREE.Object3D; bay: Bay }[] } {
  root.updateMatrixWorld(true);
  const cars: { obj: THREE.Object3D; bay: Bay }[] = [];
  const bays: Bay[] = [];
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), eu = new THREE.Euler();
  const origin = new THREE.Vector3();
  root.getWorldPosition(origin);
  piece.obj.traverse((o) => {
    const b = o.userData.bay as { len: number; wid: number } | undefined;
    if (!b) return;
    o.getWorldPosition(v);
    o.getWorldQuaternion(q);
    const ry = eu.setFromQuaternion(q, 'YXZ').y;
    bays.push({ x: v.x - origin.x, z: v.z - origin.z, ry, len: b.len, wid: b.wid });
    cars.push({ obj: o, bay: { x: v.x, z: v.z, ry, len: b.len, wid: b.wid } });
  });
  return { shape: { w: piece.w, d: piece.d, doors: piece.doors, blockers: piece.blockers, bays }, cars };
}

function hashKey(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 1000003;
}

const overlap = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const insideRect = (a: Rect, b: Rect) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.z0 >= b.z0 && a.z1 <= b.z1;

function turn(from: number, to: number, k: number) {
  return from + wrap(to - from) * Math.min(1, k);
}

/**
 * Keep to the right on long straight stretches (people passing each other on a pavement don't walk through each
 * other), wherever the shifted line is still open ground.
 */
function keepRight(r: P2[], map: WalkMap, off: number): P2[] {
  if (r.length < 2) return r;
  const out: P2[] = [r[0]];
  for (let i = 1; i < r.length; i++) {
    const a = r[i - 1], b = r[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len > 5) {
      const rx = -(b.z - a.z) / len * off, rz = (b.x - a.x) / len * off;
      const a2 = { x: a.x + (b.x - a.x) * (1.5 / len) + rx, z: a.z + (b.z - a.z) * (1.5 / len) + rz };
      const b2 = { x: b.x - (b.x - a.x) * (1.5 / len) + rx, z: b.z - (b.z - a.z) * (1.5 / len) + rz };
      const base = Math.max(map.costAt(a.x, a.z), map.costAt(b.x, b.z));
      const lc = map.lineCost(a2, b2);
      if (lc && lc <= base + 0.05 && map.lineCost(a, a2) && map.lineCost(b2, b)) { out.push(a2, b2); }
    }
    out.push(b);
  }
  return out;
}
