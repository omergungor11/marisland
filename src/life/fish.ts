import * as THREE from 'three';
import { FISH, LIFE_COLORS, LIFE_PLAN } from '../content/life.ts';
import type { Quality } from '../core/params.ts';
import { swellY } from '../shared/fields.ts';
import { Zone } from '../world/types.ts';
import { AgentKind, rotYFor, wrapAngle, type AgentKindOpts } from './agents.ts';
import type { LifeCtx } from './ctx.ts';
import { buildFish } from './geo/creatures.ts';
import { litCreatureMaterial } from './boats.ts';

const DEG = Math.PI / 180;
const isShallow = (z: number): boolean => z === Zone.shallow || z === Zone.lagoon;

export function fishGeometry(): THREE.BufferGeometry {
  return buildFish(LIFE_COLORS.fishTop, LIFE_COLORS.fishBelly, 0.6 * FISH.size);
}

interface School {
  first: number;
  count: number;
  ax: number;
  az: number;
  gx: number;
  gz: number;
  goalT: number;
  fleeT: number;
  live: boolean;
}

/** Boid schools in the shallow band near the camera; alive at T3 only. */
export class FishSchools extends AgentKind {
  readonly schools: School[] = [];
  private readonly hd: Float32Array;
  private readonly blocked: Uint16Array;
  private repel: { x: number; z: number } | null = null;
  private wasT3 = false;
  private readonly schoolOf: Uint8Array;

  constructor(
    o: Omit<AgentKindOpts, 'name' | 'capacity' | 'geometry' | 'material'>,
    private readonly ctx: LifeCtx,
    quality: Quality,
  ) {
    const plan = LIFE_PLAN[quality];
    const rng = ctx.rngFor('fish:plan');
    const sizes: number[] = [];
    for (let s = 0; s < plan.schools; s++)
      sizes.push(rng.int(plan.fishPerSchool[0], plan.fishPerSchool[1]));
    const total = sizes.reduce((a, b) => a + b, 0);
    super({
      ...o,
      name: 'fish',
      capacity: total,
      geometry: fishGeometry(),
      material: litCreatureMaterial('life:fish'),
    });
    this.hd = new Float32Array(total);
    this.blocked = new Uint16Array(total);
    this.schoolOf = new Uint8Array(total);
    let first = 0;
    for (const n of sizes) {
      this.schoolOf.fill(this.schools.length, first, first + n);
      this.schools.push({
        first,
        count: n,
        ax: 0,
        az: 0,
        gx: 0,
        gz: 0,
        goalT: 0,
        fleeT: 0,
        live: false,
      });
      first += n;
    }
    const col = new THREE.Color();
    for (let i = 0; i < total; i++) {
      col.set(FISH.colors[Math.floor(this.phase[i] * FISH.colors.length) % FISH.colors.length]);
      this.mesh.setColorAt(i, col);
    }
  }

  setRepel(x: number | null, z: number | null): void {
    this.repel = x === null || z === null ? null : { x, z };
  }

  /** Cell test for moving/spawning. depth in [lo, hi] and shallow/lagoon zone. */
  ok(x: number, z: number, lo: number, hi: number): boolean {
    if (!isShallow(this.ctx.zone(x, z))) return false;
    const d = -this.ctx.h(x, z);
    return d >= lo && d <= hi;
  }

  /** Find an anchor with a roomy shallow patch around it, spiralling out from the camera. */
  private findAnchor(
    minSep: number,
    avoid: { x: number; z: number }[],
  ): { x: number; z: number } | null {
    const cam = this.ctx.cameraPos;
    const [lo, hi] = FISH.spawnDepth;
    const rot = this.rng.range(0, Math.PI * 2);
    for (let r = 6; r <= FISH.searchRadius; r += 6) {
      const n = Math.max(8, Math.floor((2 * Math.PI * r) / 6));
      for (let k = 0; k < n; k++) {
        const a = rot + (k / n) * Math.PI * 2;
        const x = cam.x + Math.cos(a) * r;
        const z = cam.z + Math.sin(a) * r;
        if (!this.ok(x, z, lo, hi)) continue;
        let room = true;
        for (let q = 0; q < 6 && room; q++) {
          const b = (q / 6) * Math.PI * 2;
          room = this.ok(
            x + Math.cos(b) * 3,
            z + Math.sin(b) * 3,
            FISH.moveDepth[0],
            FISH.moveDepth[1],
          );
        }
        if (!room) continue;
        if (avoid.some((p) => Math.hypot(p.x - x, p.z - z) < minSep)) continue;
        return { x, z };
      }
    }
    return null;
  }

  /** (Re)anchor all schools around the camera and respawn their fish. */
  activate(): void {
    const used: { x: number; z: number }[] = [];
    for (const s of this.schools) {
      const a = this.findAnchor(14, used);
      s.live = a !== null;
      for (let m = 0; m < s.count; m++) this.active[s.first + m] = s.live ? 1 : 0;
      if (!a) continue;
      used.push(a);
      s.ax = a.x;
      s.az = a.z;
      s.gx = a.x;
      s.gz = a.z;
      s.goalT = 0;
      s.fleeT = 0;
      for (let m = 0; m < s.count; m++) {
        const i = s.first + m;
        let x = a.x;
        let z = a.z;
        for (let tries = 0; tries < 8; tries++) {
          const ang = this.rng.range(0, Math.PI * 2);
          const rr = this.rng.range(0.5, 2.5);
          const cx = a.x + Math.cos(ang) * rr;
          const cz = a.z + Math.sin(ang) * rr;
          if (this.ok(cx, cz, FISH.moveDepth[0], FISH.moveDepth[1])) {
            x = cx;
            z = cz;
            break;
          }
        }
        this.x[i] = x;
        this.z[i] = z;
        this.hd[i] = this.rng.range(-Math.PI, Math.PI);
        this.blocked[i] = 0;
        this.placeY(i, this.simT);
        this.yaw[i] = rotYFor(Math.cos(this.hd[i]), Math.sin(this.hd[i]));
        this.snap(i);
      }
    }
  }

  deactivate(): void {
    this.active.fill(0);
    for (const s of this.schools) s.live = false;
  }

  syncTier(tier: number): void {
    const t3 = tier >= 3;
    if (t3 && !this.wasT3) this.activate();
    else if (!t3 && this.wasT3) this.deactivate();
    this.wasT3 = t3;
  }

  private placeY(i: number, t: number): void {
    this.y[i] = swellY(this.x[i], this.z[i], t, this.ctx.swell) - FISH.depthBelowSurface;
  }

  protected override beginStep(dt: number, t: number): void {
    if (!this.wasT3) return;
    const cam = this.ctx.cameraPos;
    for (const s of this.schools) {
      if (!s.live) continue;
      s.goalT -= dt;
      if (this.repel) {
        // any fish near the cursor starts the scatter timer
        for (let m = 0; m < s.count; m++) {
          const i = s.first + m;
          if (Math.hypot(this.x[i] - this.repel.x, this.z[i] - this.repel.z) < FISH.repelRadius) {
            s.fleeT = FISH.regroupAfter;
            break;
          }
        }
      }
      if (s.fleeT > 0) s.fleeT -= dt;
      if (s.goalT <= 0) {
        s.goalT = this.rng.range(FISH.goalTime[0], FISH.goalTime[1]);
        for (let tries = 0; tries < 8; tries++) {
          const a = this.rng.range(0, Math.PI * 2);
          const r = this.rng.range(4, FISH.goalRadius);
          const gx = s.ax + Math.cos(a) * r;
          const gz = s.az + Math.sin(a) * r;
          if (this.ok(gx, gz, FISH.spawnDepth[0], FISH.spawnDepth[1])) {
            s.gx = gx;
            s.gz = gz;
            break;
          }
        }
      }
    }
    // far from the camera patch every 2 s → move the school to a patch near the camera
    if (this.step % 60 === 0) {
      for (const s of this.schools) {
        if (s.live && Math.hypot(s.ax - cam.x, s.az - cam.z) > FISH.reanchorDistance) {
          this.activate();
          break;
        }
      }
    }
    void t;
  }

  protected stepAgent(i: number, dt: number, t: number): void {
    const s = this.schools[this.schoolOf[i]];
    if (!s || !s.live) return;
    // neighbour terms
    let cx = 0;
    let cz = 0;
    let ax = 0;
    let az = 0;
    let sx = 0;
    let sz = 0;
    let n = 0;
    for (let m = 0; m < s.count; m++) {
      const j = s.first + m;
      cx += this.x[j];
      cz += this.z[j];
      if (j === i) continue;
      ax += Math.cos(this.hd[j]);
      az += Math.sin(this.hd[j]);
      const dx = this.x[i] - this.x[j];
      const dz = this.z[i] - this.z[j];
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.8 * 0.8) {
        const w = 1 / (d2 + 0.05);
        sx += dx * w;
        sz += dz * w;
      }
      n++;
    }
    cx /= s.count;
    cz /= s.count;
    const fleeing = s.fleeT > 0;
    let dxv = 0;
    let dzv = 0;
    const add = (vx: number, vz: number, w: number): void => {
      const l = Math.hypot(vx, vz);
      if (l > 1e-6) {
        dxv += (vx / l) * w;
        dzv += (vz / l) * w;
      }
    };
    add(s.gx - this.x[i], s.gz - this.z[i], 1);
    if (!fleeing) add(cx - this.x[i], cz - this.z[i], 0.8);
    if (n > 0) add(ax, az, fleeing ? 0.2 : 0.6);
    add(sx, sz, 1.5);
    add(
      Math.cos(this.hd[i] + Math.sin(t * 1.3 + this.phase[i] * 6.28) * 0.8),
      Math.sin(this.hd[i]),
      0.2,
    );
    let speed = FISH.speed * (0.9 + 0.2 * this.phase[i]);
    if (this.repel) {
      const rx = this.x[i] - this.repel.x;
      const rz = this.z[i] - this.repel.z;
      if (Math.hypot(rx, rz) < FISH.repelRadius) {
        add(rx, rz, 4);
        speed = FISH.fleeSpeed;
      }
    }
    if (fleeing) speed = Math.max(speed, FISH.fleeSpeed * 0.6);
    const want = Math.atan2(dzv, dxv);
    const maxTurn = FISH.maxTurnDeg * DEG * dt;
    const delta = wrapAngle(want - this.hd[i]);
    this.hd[i] += Math.max(-maxTurn, Math.min(maxTurn, delta));
    const nx = this.x[i] + Math.cos(this.hd[i]) * speed * dt;
    const nz = this.z[i] + Math.sin(this.hd[i]) * speed * dt;
    if (this.ok(nx, nz, FISH.moveDepth[0], FISH.moveDepth[1])) {
      this.x[i] = nx;
      this.z[i] = nz;
      this.blocked[i] = 0;
    } else {
      // turn toward the school anchor; if stuck for ~0.7 s, hop back to the anchor patch
      const back = Math.atan2(s.az - this.z[i], s.ax - this.x[i]);
      this.hd[i] += Math.max(-maxTurn, Math.min(maxTurn, wrapAngle(back - this.hd[i])));
      if (++this.blocked[i] > 20) {
        this.x[i] = s.ax + (this.phase[i] - 0.5);
        this.z[i] = s.az;
        this.blocked[i] = 0;
        this.snap(i);
      }
    }
    this.placeY(i, t);
    // tail wobble = small yaw/roll sway
    const wob = Math.sin(t * 9 * (0.8 + 0.4 * this.phase[i]) + this.phase[i] * 6.28);
    this.yaw[i] =
      rotYFor(Math.cos(this.hd[i]), Math.sin(this.hd[i])) + wob * 0.12 * this.ctx.motion.scale;
    this.roll[i] = wob * 0.08 * this.ctx.motion.scale;
  }
}
