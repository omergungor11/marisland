import * as THREE from 'three';
import { unitHash } from '../core/hash.ts';
import { CATS, CAPYBARAS, CRABS, DUCKS, SHEEP } from '../content/life.ts';
import { damp, makeSpring, stepSpring, volumeXZ } from '../anim/spring.ts';
import { PROP_GEO } from '../geo/index.ts';
import { Zone } from '../world/types.ts';
import { rotYFor } from './agents.ts';
import { CritterKind, type KindOpts } from './critter-base.ts';
import type { LifeCtx } from './ctx.ts';
import {
  buildCapybara,
  buildCat,
  buildCatTail,
  buildCrab,
  buildCrabClaws,
  buildDuck,
  buildSheep,
  CAT_TAIL_PIVOT,
  CRAB_CLAW_PIVOT,
} from './geo/critters.ts';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

const isGraze = (z: number): boolean => z === Zone.field || z === Zone.meadow;
const isSand = (z: number): boolean => z === Zone.sandDry || z === Zone.sandWet;

/** Hours in the closed sleeping window [from, to) that wraps midnight. */
export const isSleepHour = (h: number): boolean => h >= CATS.sleep[0] || h < CATS.sleep[1];

const islandOf = (ctx: LifeCtx, archetype: string) =>
  ctx.world.islands.find((q) => q.archetype === archetype);

/** ---- Cats --------------------------------------------------------------------------------- */
export class Cats extends CritterKind {
  private readonly tail;
  private readonly sleep: Float32Array;
  private readonly baseYaw: Float32Array;
  readonly spot: { x: number; y: number; z: number }[] = [];

  constructor(
    o: KindOpts,
    private readonly ctx: LifeCtx,
    count: number,
    private readonly getHour: () => number,
  ) {
    const hearth = islandOf(ctx, 'hearthholm');
    const houses = hearth
      ? ctx.world.lots.filter((l) => l.islandId === hearth.id && l.kind === 'house')
      : [];
    const n =
      hearth && (houses.length > 0 || ctx.world.settlements.some((s) => s.plaza)) ? count : 0;
    super(o, 'cat', n, buildCat(), 2);
    this.sleep = new Float32Array(n);
    this.baseYaw = new Float32Array(n);
    this.tail = this.addPart('tail', buildCatTail(), CAT_TAIL_PIVOT, 'y');
    const col = new THREE.Color();
    const furs = ['#FFFFFF', '#C9CFE0', '#FFE3C2'];
    const used = new Set<number>();
    for (let i = 0; i < n; i++) {
      col.set(furs[i % furs.length]);
      this.mesh.setColorAt(i, col);
      let x: number;
      let z: number;
      let y: number;
      if (houses.length > 0) {
        let k = Math.floor(unitHash(this.seed, i, 21) * houses.length) % houses.length;
        for (let t = 0; t < houses.length && used.has(k); t++) k = (k + 1) % houses.length;
        used.add(k);
        const lot = houses[k];
        const fx = Math.cos(lot.rotY);
        const fz = Math.sin(lot.rotY);
        const rx = -fz;
        const rz = fx;
        const s1 = unitHash(this.seed, i, 22) < 0.5 ? -1 : 1;
        const s2 = unitHash(this.seed, i, 23) < 0.5 ? -1 : 1;
        x = lot.x + fx * s1 * lot.d * 0.4 + rx * s2 * lot.w * 0.4;
        z = lot.z + fz * s1 * lot.d * 0.4 + rz * s2 * lot.w * 0.4;
        const height = PROP_GEO[lot.defId]?.height ?? 3.7;
        y = ctx.h(lot.x, lot.z) + height * CATS.roofFrac;
        this.yaw[i] = rotYFor(fx * s1 + rx * s2, fz * s1 + rz * s2);
      } else {
        const pl = ctx.world.settlements.find((s) => s.plaza)?.plaza as {
          x: number;
          z: number;
          r: number;
        };
        const a = unitHash(this.seed, i, 24) * TAU;
        x = pl.x + Math.cos(a) * pl.r * 0.8;
        z = pl.z + Math.sin(a) * pl.r * 0.8;
        y = ctx.h(x, z);
        this.yaw[i] = rotYFor(-Math.cos(a), -Math.sin(a));
      }
      this.x[i] = x;
      this.y[i] = y;
      this.z[i] = z;
      this.spot.push({ x, y, z });
      this.baseYaw[i] = this.yaw[i];
      this.pendingActive[i] = 1;
      this.snap(i);
    }
  }

  private readonly pendingActive = new Uint8Array(this.capacity);
  protected onActivate(): void {
    this.active.set(this.pendingActive);
  }

  protected stepAgent(i: number, dt: number, t: number): void {
    const asleep = isSleepHour(this.getHour()) ? 1 : 0;
    this.sleep[i] = damp(this.sleep[i], asleep, CATS.sleepLambda, dt);
    const sl = this.sleep[i];
    const per = CATS.tailPeriod * (0.87 + 0.26 * this.phase[i]);
    const m = this.ctx.motion.scale;
    const wag = Math.sin(TAU * (t / per + this.phase[i])) * CATS.tailDeg * DEG * m;
    this.tail.angle[i] = wag * (1 - sl) + 70 * DEG * sl;
    const sy = 1 + (CATS.sleepScaleY - 1) * sl;
    this.sy[i] = sy;
    this.sx[i] = this.sz[i] = 1 + (1 / Math.sqrt(CATS.sleepScaleY) - 1) * sl * 0.6;
    // glance around while awake
    const look = Math.sin(
      TAU * (t / (CATS.lookPeriod * (0.9 + 0.2 * this.phase[i])) + this.phase[i] * 3),
    );
    this.yaw[i] = this.baseYaw[i] + look * CATS.lookYaw * (1 - sl) * m;
  }
}

/** ---- Sheep -------------------------------------------------------------------------------- */
const G_GRAZE = 0;
const G_HOP = 1;

export class Sheep extends CritterKind {
  private readonly hx: Float32Array;
  private readonly hz: Float32Array;
  private readonly tx: Float32Array;
  private readonly tz: Float32Array;
  private readonly sx0: Float32Array;
  private readonly sz0: Float32Array;
  private readonly jig: ReturnType<typeof makeSpring>[];
  private readonly draws: Uint32Array;
  hops = 0;

  constructor(
    o: KindOpts,
    private readonly ctx: LifeCtx,
    count: number,
  ) {
    const isl = islandOf(ctx, 'millbrook');
    const cells: number[] = [];
    if (isl) {
      const h = ctx.world.height;
      for (let iz = 0; iz < h.n; iz += 2) {
        for (let ix = 0; ix < h.n; ix += 2) {
          const k = iz * h.n + ix;
          if (ctx.world.islandMap[k] === isl.id + 1 && isGraze(ctx.world.zone[k])) {
            cells.push(h.originX + ix * h.cellSize, h.originZ + iz * h.cellSize);
          }
        }
      }
    }
    super(o, 'sheep', cells.length >= 8 ? count : 0, buildSheep(), 2);
    const n = this.capacity;
    this.hx = new Float32Array(n);
    this.hz = new Float32Array(n);
    this.tx = new Float32Array(n);
    this.tz = new Float32Array(n);
    this.sx0 = new Float32Array(n);
    this.sz0 = new Float32Array(n);
    this.draws = new Uint32Array(n);
    this.jig = Array.from({ length: n }, () => makeSpring());
    const nc = cells.length / 2;
    // flock centre, then members from nearby cells with spacing
    const c = Math.floor(unitHash(this.seed, 0, 31) * nc) % Math.max(nc, 1);
    const cx = cells[c * 2] ?? 0;
    const cz = cells[c * 2 + 1] ?? 0;
    for (let i = 0; i < n; i++) {
      let best = -1;
      for (let tries = 0; tries < 80 && best < 0; tries++) {
        const k = Math.floor(unitHash(this.seed, i * 97 + tries, 32) * nc) % nc;
        const x = cells[k * 2];
        const z = cells[k * 2 + 1];
        const near = Math.hypot(x - cx, z - cz) < 6 + tries * 0.5;
        if (near && this.clear(i, x, z)) best = k;
      }
      if (best < 0) best = Math.floor(unitHash(this.seed, i, 33) * nc) % nc;
      this.x[i] = this.hx[i] = cells[best * 2];
      this.z[i] = this.hz[i] = cells[best * 2 + 1];
      this.y[i] = ctx.h(this.x[i], this.z[i]);
      this.yaw[i] = (unitHash(this.seed, i, 34) - 0.5) * TAU;
      this.timer[i] = 1 + unitHash(this.seed, i, 35) * SHEEP.graze;
      this.state[i] = G_GRAZE;
      this.pendingActive[i] = 1;
      this.snap(i);
    }
  }

  private readonly pendingActive = new Uint8Array(this.capacity);
  protected onActivate(): void {
    this.active.set(this.pendingActive);
  }

  /** At least `SHEEP.spacing` from every other sheep (positions of 0..capacity). */
  private clear(self: number, x: number, z: number): boolean {
    for (let j = 0; j < this.capacity; j++) {
      if (j === self || !this.pendingActive[j]) continue;
      if (Math.hypot(this.x[j] - x, this.z[j] - z) < SHEEP.spacing) return false;
    }
    return true;
  }

  private rnd(i: number, salt: number): number {
    return unitHash(this.seed, i * 8191 + (this.draws[i]++ % 8191), salt);
  }

  private okPoint(x: number, z: number): boolean {
    return isGraze(this.ctx.zone(x, z));
  }

  protected stepAgent(i: number, dt: number, t: number): void {
    if (this.held(i, dt)) return;
    const m = this.ctx.motion.scale;
    const sp = this.jig[i];
    stepSpring(sp, 0, SHEEP.jiggle.k, SHEEP.jiggle.c, dt);
    let sy: number;
    let hopY = 0;
    if (this.state[i] === G_GRAZE) {
      this.timer[i] -= dt;
      // head dip: slow sine, reads as nibbling
      sy = 1 - SHEEP.dip * 0.5 * (1 - Math.cos(TAU * (t / 1.7 + this.phase[i]))) * m;
      if (this.timer[i] <= 0 && !this.beginHop(i)) this.timer[i] = 1.5;
    } else {
      this.timer[i] += dt;
      const u = Math.min(this.timer[i] / SHEEP.hop, 1);
      this.x[i] = this.sx0[i] + (this.tx[i] - this.sx0[i]) * u;
      this.z[i] = this.sz0[i] + (this.tz[i] - this.sz0[i]) * u;
      hopY = SHEEP.hopHeight * 4 * u * (1 - u) * m;
      // anticipation squash, stretch in the air, squash again on landing
      sy =
        u < 0.15
          ? 1 - (1 - SHEEP.squash) * Math.sin((u / 0.15) * Math.PI * 0.5)
          : u < 0.85
            ? 1 + (SHEEP.stretch - 1) * Math.sin(((u - 0.15) / 0.7) * Math.PI)
            : 1 - (1 - SHEEP.squash) * Math.sin(((u - 0.85) / 0.15) * Math.PI * 0.5);
      sy = 1 + (sy - 1) * m;
      if (u >= 1) {
        this.state[i] = G_GRAZE;
        this.timer[i] = SHEEP.graze * (0.8 + 0.4 * this.rnd(i, 41));
        sp.v += SHEEP.jiggle.kick;
        this.hops++;
      }
    }
    this.y[i] = this.ctx.h(this.x[i], this.z[i]) + hopY;
    const j = sp.x * 0.06 * m;
    this.sy[i] = sy * (1 + j);
    this.sx[i] = this.sz[i] = volumeXZ(sy) * (1 - j * 0.5);
  }

  private beginHop(i: number): boolean {
    const a0 = this.rnd(i, 42) * TAU;
    const far = Math.hypot(this.x[i] - this.hx[i], this.z[i] - this.hz[i]) > SHEEP.leash;
    const home = Math.atan2(this.hz[i] - this.z[i], this.hx[i] - this.x[i]);
    for (let k = 0; k < 6; k++) {
      const a = far && k < 3 ? home + (k - 1) * 0.5 : a0 + k * 1.047;
      const d = SHEEP.hopDist[0] + this.rnd(i, 43) * (SHEEP.hopDist[1] - SHEEP.hopDist[0]);
      const nx = this.x[i] + Math.cos(a) * d;
      const nz = this.z[i] + Math.sin(a) * d;
      if (!this.okPoint(nx, nz) || !this.okPoint((nx + this.x[i]) / 2, (nz + this.z[i]) / 2))
        continue;
      if (!this.clear(i, nx, nz)) continue;
      this.sx0[i] = this.x[i];
      this.sz0[i] = this.z[i];
      this.tx[i] = nx;
      this.tz[i] = nz;
      this.yaw[i] = rotYFor(Math.cos(a), Math.sin(a));
      this.pyaw[i] = this.yaw[i];
      this.state[i] = G_HOP;
      this.timer[i] = 0;
      return true;
    }
    return false;
  }
}

/** ---- Crabs -------------------------------------------------------------------------------- */
const C_PAUSE = 0;
const C_SCUTTLE = 1;

export class Crabs extends CritterKind {
  private readonly claws;
  private readonly dir: Float32Array;
  private ax = 0;
  private az = 0;
  private live = false;
  private lastTry = -1e9;
  private readonly draws: Uint32Array;
  private readonly heading: Float32Array;
  relocations = 0;

  constructor(
    o: KindOpts,
    private readonly ctx: LifeCtx,
    count: number,
  ) {
    super(o, 'crab', count, buildCrab(), 3);
    this.claws = this.addPart('claws', buildCrabClaws(), CRAB_CLAW_PIVOT, 'z');
    this.dir = new Float32Array(count).fill(1);
    this.heading = new Float32Array(count);
    this.draws = new Uint32Array(count);
    const col = new THREE.Color('#FFFFFF');
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, col);
  }

  get anchored(): boolean {
    return this.live;
  }

  private rnd(i: number, salt: number): number {
    return unitHash(this.seed, i * 8191 + (this.draws[i]++ % 8191), salt);
  }

  private sandOk(x: number, z: number): boolean {
    return isSand(this.ctx.zone(x, z));
  }

  protected onActivate(): void {
    this.activate();
  }

  /** Find sand within `CRABS.radius` of the camera, spiralling outward, and place the crabs. */
  activate(): void {
    const cam = this.ctx.cameraPos;
    this.lastTry = this.simT;
    this.live = false;
    this.active.fill(0);
    let found: { x: number; z: number } | null = null;
    const rot = unitHash(this.seed, this.relocations, 51) * TAU;
    for (let r = 4; r <= CRABS.radius && !found; r += 4) {
      const n = Math.max(8, Math.floor((TAU * r) / 4));
      for (let k = 0; k < n && !found; k++) {
        const a = rot + (k / n) * TAU;
        const x = cam.x + Math.cos(a) * r;
        const z = cam.z + Math.sin(a) * r;
        if (!this.sandOk(x, z)) continue;
        // roomy: a few neighbours also sand
        let ok = 0;
        for (let q = 0; q < 6; q++) {
          if (this.sandOk(x + Math.cos(q * 1.047) * 2.5, z + Math.sin(q * 1.047) * 2.5)) ok++;
        }
        if (ok >= 3) found = { x, z };
      }
    }
    if (!found) return;
    this.relocations++;
    this.ax = found.x;
    this.az = found.z;
    this.live = true;
    for (let i = 0; i < this.capacity; i++) {
      let x = found.x;
      let z = found.z;
      for (let tries = 0; tries < 12; tries++) {
        const a = this.rnd(i, 52) * TAU;
        const rr = 0.5 + this.rnd(i, 53) * CRABS.clusterRadius;
        const cx = found.x + Math.cos(a) * rr;
        const cz = found.z + Math.sin(a) * rr;
        if (this.sandOk(cx, cz)) {
          x = cx;
          z = cz;
          break;
        }
      }
      this.x[i] = x;
      this.z[i] = z;
      this.y[i] = this.ctx.h(x, z);
      this.heading[i] = this.rnd(i, 54) * TAU;
      this.yaw[i] = rotYFor(Math.cos(this.heading[i]), Math.sin(this.heading[i]));
      this.state[i] = C_PAUSE;
      this.timer[i] = 0.3 + this.rnd(i, 55) * CRABS.pause[1];
      this.dir[i] = this.rnd(i, 56) < 0.5 ? -1 : 1;
      this.active[i] = 1;
      this.snap(i);
    }
  }

  protected override beginStep(): void {
    if (!this.wasOn) return;
    const cam = this.ctx.cameraPos;
    if (this.live) {
      if (this.step % 60 === 0 && Math.hypot(this.ax - cam.x, this.az - cam.z) > CRABS.relocate) {
        this.activate();
      }
    } else if (this.simT - this.lastTry >= CRABS.retry) {
      this.activate();
    }
  }

  protected stepAgent(i: number, dt: number, t: number): void {
    if (this.held(i, dt)) return;
    const m = this.ctx.motion.scale;
    let sy = 1;
    let clack: number;
    if (this.state[i] === C_PAUSE) {
      this.timer[i] -= dt;
      clack = Math.max(0, Math.sin(TAU * 0.4 * t + this.phase[i] * 6)) * 0.15;
      if (this.timer[i] <= 0) {
        this.state[i] = C_SCUTTLE;
        this.timer[i] = CRABS.scuttle * (0.85 + 0.3 * this.rnd(i, 57));
        if (this.rnd(i, 58) < 0.4) this.dir[i] = -this.dir[i];
      }
    } else {
      this.timer[i] -= dt;
      const sp = (CRABS.distance / CRABS.scuttle) * this.dir[i] * dt;
      // local +z in world: (sin y, cos y) for rotation y about +y
      const y = this.yaw[i];
      const nx = this.x[i] + Math.sin(y) * sp;
      const nz = this.z[i] + Math.cos(y) * sp;
      if (this.sandOk(nx, nz)) {
        this.x[i] = nx;
        this.z[i] = nz;
      } else {
        this.dir[i] = -this.dir[i];
      }
      const tick = Math.floor(t * CRABS.legHz + this.phase[i] * 8) % 2 === 0 ? 1 : -1;
      sy = 1 + tick * CRABS.legJitter * m;
      clack = 0.5 + 0.5 * Math.sin(TAU * CRABS.clackHz * t + this.phase[i] * 6);
      if (this.timer[i] <= 0) {
        this.state[i] = C_PAUSE;
        this.timer[i] = CRABS.pause[0] + this.rnd(i, 59) * (CRABS.pause[1] - CRABS.pause[0]);
        this.heading[i] += (this.rnd(i, 60) - 0.5) * 1.2;
        this.yaw[i] = rotYFor(Math.cos(this.heading[i]), Math.sin(this.heading[i]));
      }
    }
    this.claws.angle[i] = clack * CRABS.clackDeg * DEG * m;
    this.y[i] = this.ctx.h(this.x[i], this.z[i]);
    this.sy[i] = sy;
  }
}

/** ---- Ducks (Millbrook pond) --------------------------------------------------------------- */
export class Ducks extends CritterKind {
  private readonly cx: number;
  private readonly cz: number;
  private readonly baseY: number;

  constructor(
    o: KindOpts,
    private readonly ctx: LifeCtx,
    count: number,
  ) {
    const pond = islandOf(ctx, 'millbrook')?.anchors.pond;
    super(o, 'duck', pond ? count : 0, buildDuck(), 2);
    this.cx = pond?.x ?? 0;
    this.cz = pond?.z ?? 0;
    this.baseY = pond ? ctx.h(this.cx, this.cz) + DUCKS.surface : 0;
    const col = new THREE.Color('#FFFFFF');
    for (let i = 0; i < this.capacity; i++) {
      this.mesh.setColorAt(i, col);
      this.scale[i] = i === 0 ? 1 : 0.65;
      this.pscale[i] = this.scale[i];
      this.stepAgent(i, 0, 0);
      this.snap(i);
      this.pending[i] = 1;
    }
  }

  private readonly pending = new Uint8Array(this.capacity);
  protected onActivate(): void {
    this.active.set(this.pending);
  }

  /** Closed form: a follow-chain on a wobbling circle, each duckling lags the leader by an angle. */
  protected stepAgent(i: number, _dt: number, t: number): void {
    if (this.held(i, _dt)) return;
    const w = DUCKS.speed / DUCKS.pondRadius;
    const th = w * t + this.phase[0] * TAU - i * DUCKS.follow;
    const r = DUCKS.pondRadius * (0.85 + 0.12 * Math.sin(th * 2.3 + i));
    this.x[i] = this.cx + Math.cos(th) * r;
    this.z[i] = this.cz + Math.sin(th) * r;
    // heading = tangent (counter-clockwise)
    this.yaw[i] = rotYFor(-Math.sin(th), Math.cos(th));
    const m = this.ctx.motion.scale;
    const bob = Math.sin(TAU * (t / DUCKS.paddle - i * DUCKS.bob));
    this.y[i] = this.baseY + bob * 0.02 * m;
    this.roll[i] = bob * 0.05 * m;
  }
}

/** ---- Capybaras (Emberpeak hot spring) ----------------------------------------------------- */
export class Capybaras extends CritterKind {
  private readonly cx: number;
  private readonly cz: number;
  private readonly baseY: number;

  constructor(
    o: KindOpts,
    private readonly ctx: LifeCtx,
    count: number,
  ) {
    const sp = islandOf(ctx, 'emberpeak')?.anchors.hotspring;
    super(o, 'capybara', sp ? count : 0, buildCapybara(), 2);
    this.cx = sp?.x ?? 0;
    this.cz = sp?.z ?? 0;
    this.baseY = sp ? ctx.h(this.cx, this.cz) + CAPYBARAS.surface : 0;
    const col = new THREE.Color('#FFFFFF');
    const n = this.capacity;
    for (let i = 0; i < n; i++) {
      this.mesh.setColorAt(i, col);
      const a = (i / Math.max(n, 1)) * TAU + this.phase[i] * 0.6;
      this.x[i] = this.cx + Math.cos(a) * CAPYBARAS.radius;
      this.z[i] = this.cz + Math.sin(a) * CAPYBARAS.radius;
      this.yaw[i] =
        rotYFor(Math.cos(a + Math.PI), Math.sin(a + Math.PI)) + (this.phase[i] - 0.5) * 0.8;
      this.stepAgent(i, 0, 0);
      this.snap(i);
      this.pending[i] = 1;
    }
  }

  private readonly pending = new Uint8Array(this.capacity);
  protected onActivate(): void {
    this.active.set(this.pending);
  }

  protected stepAgent(i: number, dt: number, t: number): void {
    if (this.held(i, dt)) return;
    const m = this.ctx.motion.scale;
    const per = CAPYBARAS.bobPeriod * (0.87 + 0.26 * this.phase[i]);
    this.y[i] = this.baseY + Math.sin(TAU * (t / per + this.phase[i])) * CAPYBARAS.bob * m;
    // blink every 4 s: the head squishes very slightly for 0.12 s
    const bt =
      (t + this.phase[i] * CAPYBARAS.blink * 3) % (CAPYBARAS.blink * (0.9 + 0.2 * this.phase[i]));
    this.sy[i] = bt < 0.12 ? 1 - 0.08 * Math.sin((bt / 0.12) * Math.PI) : 1;
  }
}
