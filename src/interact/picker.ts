import * as THREE from 'three';
import { PICK_DEFAULT, PICK_SPHERES } from '../content/life.ts';
import { PROP_GEO } from '../geo/index.ts';
import type { PropBatcher } from '../render/props/batcher.ts';
import type { AgentKind } from '../life/agents.ts';
import type { LifeSystem } from '../life/index.ts';
import { heightAt, SEABED_Y, type Heightfield } from '../world/types.ts';

export type BatcherGroup = PropBatcher['groups'][number];

export interface PickResult {
  kind: 'terrain' | 'water' | 'prop' | 'agent';
  /** Stable id: `terrain`, `water`, `prop:<defId>:<storeIndex>`, `agent:<kind>:<index>`. */
  id: string;
  x: number;
  y: number;
  z: number;
  /** Ray parameter (distance from the origin) of the hit. */
  t: number;
  defId?: string;
  instance?: { group: BatcherGroup; index: number };
  agent?: { kind: AgentKind; index: number };
}

export interface PickerDeps {
  height: Heightfield;
  batcher?: PropBatcher | null;
  life?: LifeSystem | null;
  /** Water plane height (default 0). */
  seaLevel?: number;
  /** Max ray length in u (default 2400). */
  maxDist?: number;
}

export interface Picker {
  /** NDC (-1..1, y up) → nearest hit or null. */
  pick(ndcX: number, ndcY: number, camera: THREE.Camera): PickResult | null;
  /** Same for an explicit ray (dir need not be normalised). */
  pickRay(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
  ): PickResult | null;
  /** Like `pick`; the caller throttles to 10 Hz. Remembers the result in `hovered`. */
  hover(ndcX: number, ndcY: number, camera: THREE.Camera): PickResult | null;
  readonly hovered: PickResult | null;
  /** Rebuild the prop spatial hash (after the batcher regenerates). */
  rebuild(): void;
  readonly stats: { entries: number; lastCandidates: number; lastMarchSteps: number };
}

const CELL = 8;
const MARCH_STEP = 2;
const BISECT = 12;
const _v = new THREE.Vector3();
const _o = new THREE.Vector3();

/** Ray vs vertical finite cylinder (axis +y from y0 to y1). Returns the entry distance or -1. */
export function rayCylinder(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  cx: number,
  cz: number,
  r: number,
  y0: number,
  y1: number,
): number {
  const px = ox - cx;
  const pz = oz - cz;
  const a = dx * dx + dz * dz;
  let best = -1;
  if (a > 1e-12) {
    const b = px * dx + pz * dz;
    const c = px * px + pz * pz - r * r;
    const disc = b * b - a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const t1 = (-b - sq) / a;
      const t2 = (-b + sq) / a;
      const t = Math.max(t1, 0);
      if (t2 >= 0) {
        const y = oy + dy * t;
        if (y >= y0 && y <= y1) best = t;
      }
    }
  }
  // top cap
  if (Math.abs(dy) > 1e-9) {
    const tc = (y1 - oy) / dy;
    if (tc >= 0 && (best < 0 || tc < best)) {
      const hx = px + dx * tc;
      const hz = pz + dz * tc;
      if (hx * hx + hz * hz <= r * r) best = tc;
    }
  }
  return best;
}

/** Ray vs sphere; entry distance or -1. */
export function raySphere(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  cx: number,
  cy: number,
  cz: number,
  r: number,
): number {
  const px = ox - cx;
  const py = oy - cy;
  const pz = oz - cz;
  const b = px * dx + py * dy + pz * dz;
  const c = px * px + py * py + pz * pz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  const t = -b - sq;
  if (t >= 0) return t;
  const t2 = -b + sq;
  return t2 >= 0 ? t2 : -1;
}

/**
 * CPU picking (ARCHITECTURE §5): heightfield march (2 u steps then bisect) for terrain and water,
 * a spatial hash of prop cylinder proxies, and pick spheres for agents. Nearest wins. No raycaster,
 * no randomness.
 */
export function createPicker(deps: PickerDeps): Picker {
  const sea = deps.seaLevel ?? 0;
  const maxDist = deps.maxDist ?? 2400;
  const stats = { entries: 0, lastCandidates: 0, lastMarchSteps: 0 };
  let hovered: PickResult | null = null;

  // ---- prop hash (SoA entries)
  let groups: readonly BatcherGroup[] = [];
  let eGroup = new Int32Array(0);
  let eIndex = new Int32Array(0);
  let eX = new Float32Array(0);
  let eY = new Float32Array(0);
  let eZ = new Float32Array(0);
  let eR = new Float32Array(0);
  let eH = new Float32Array(0);
  let stamp = new Uint32Array(0);
  let stampN = 0;
  let cells = new Map<number, number[]>();
  let built = false;

  const key = (cx: number, cz: number): number => (cx + 4096) * 8192 + (cz + 4096);

  function rebuild(): void {
    built = true;
    cells = new Map();
    groups = deps.batcher?.groups ?? [];
    const gx: number[] = [];
    const gi: number[] = [];
    const ex: number[] = [];
    const ey: number[] = [];
    const ez: number[] = [];
    const er: number[] = [];
    const eh: number[] = [];
    for (let g = 0; g < groups.length; g++) {
      const grp = groups[g];
      if (grp.groundCover) continue;
      const geo = PROP_GEO[grp.def.geo];
      const gR = geo?.footprint ?? grp.def.footprint;
      const gH = geo?.height ?? 1;
      const m = grp.mesh.instanceMatrix.array as Float32Array;
      for (let k = 0; k < grp.members.length; k++) {
        if (grp.members[k] < 0) continue; // synthetic cluster proxies
        const o = k * 16;
        const sc = Math.hypot(m[o], m[o + 1], m[o + 2]) || 1;
        const idx = ex.length;
        gx.push(g);
        gi.push(k);
        ex.push(m[o + 12]);
        ey.push(m[o + 13]);
        ez.push(m[o + 14]);
        er.push(Math.max(gR * sc * 0.7, 0.35));
        eh.push(Math.max(gH * sc, 0.5));
        const cx = Math.floor(m[o + 12] / CELL);
        const cz = Math.floor(m[o + 14] / CELL);
        const kk = key(cx, cz);
        let arr = cells.get(kk);
        if (!arr) cells.set(kk, (arr = []));
        arr.push(idx);
      }
    }
    eGroup = Int32Array.from(gx);
    eIndex = Int32Array.from(gi);
    eX = Float32Array.from(ex);
    eY = Float32Array.from(ey);
    eZ = Float32Array.from(ez);
    eR = Float32Array.from(er);
    eH = Float32Array.from(eh);
    stamp = new Uint32Array(ex.length);
    stampN = 0;
    stats.entries = ex.length;
  }

  function terrainHit(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
  ): number {
    // first t where ray y falls below the heightfield; Infinity if none
    let steps = 0;
    let prevT = 0;
    let prevF = oy - heightAt(deps.height, ox, oz);
    if (prevF <= 0) return 0;
    for (let t = MARCH_STEP; t <= maxDist; t += MARCH_STEP) {
      steps++;
      const y = oy + dy * t;
      const f = y - heightAt(deps.height, ox + dx * t, oz + dz * t);
      if (f <= 0) {
        let lo = prevT;
        let hi = t;
        for (let i = 0; i < BISECT; i++) {
          const mid = (lo + hi) * 0.5;
          const fm = oy + dy * mid - heightAt(deps.height, ox + dx * mid, oz + dz * mid);
          if (fm > 0) lo = mid;
          else hi = mid;
        }
        stats.lastMarchSteps = steps;
        return (lo + hi) * 0.5;
      }
      prevT = t;
      prevF = f;
      // leaving the world while heading further down/outwards can never come back up
      if (y < SEABED_Y - 1 && dy < 0) break;
    }
    void prevF;
    stats.lastMarchSteps = steps;
    return Infinity;
  }

  function pickRay(
    ox: number,
    oy: number,
    oz: number,
    rdx: number,
    rdy: number,
    rdz: number,
  ): PickResult | null {
    if (!built) rebuild();
    const len = Math.hypot(rdx, rdy, rdz) || 1;
    const dx = rdx / len;
    const dy = rdy / len;
    const dz = rdz / len;
    // ---- terrain / water
    const tg = terrainHit(ox, oy, oz, dx, dy, dz);
    const tw = dy < 0 && oy > sea ? (sea - oy) / dy : Infinity;
    let best: PickResult | null = null;
    let tBest = Infinity;
    if (tw < tg && tw <= maxDist) {
      tBest = tw;
      best = { kind: 'water', id: 'water', x: ox + dx * tw, y: sea, z: oz + dz * tw, t: tw };
    } else if (Number.isFinite(tg)) {
      tBest = tg;
      const x = ox + dx * tg;
      const z = oz + dz * tg;
      best = { kind: 'terrain', id: 'terrain', x, y: heightAt(deps.height, x, z), z, t: tg };
    }
    const tLimit = Math.min(tBest, maxDist);

    // ---- props: walk the ray through the hash
    let nCand = 0;
    if (stats.entries > 0) {
      const xz = Math.hypot(dx, dz);
      const reach = Math.min(tLimit, maxDist);
      const total = xz * reach;
      const n = Math.min(Math.ceil(total / (CELL * 0.5)) + 1, 800);
      const dt = xz > 1e-6 ? reach / Math.max(n - 1, 1) : 0;
      stampN++;
      let lastC = NaN;
      let lastZ = NaN;
      let bestE = -1;
      let bestT = tBest;
      for (let s = 0; s < n; s++) {
        const t = s * dt;
        const cx = Math.floor((ox + dx * t) / CELL);
        const cz = Math.floor((oz + dz * t) / CELL);
        if (cx === lastC && cz === lastZ) continue;
        lastC = cx;
        lastZ = cz;
        for (let ax = -1; ax <= 1; ax++) {
          for (let az = -1; az <= 1; az++) {
            const list = cells.get(key(cx + ax, cz + az));
            if (!list) continue;
            for (let q = 0; q < list.length; q++) {
              const e = list[q];
              if (stamp[e] === stampN) continue;
              stamp[e] = stampN;
              const grp = groups[eGroup[e]];
              if (!grp.visible || !grp.mesh.visible) continue;
              nCand++;
              const th = rayCylinder(
                ox,
                oy,
                oz,
                dx,
                dy,
                dz,
                eX[e],
                eZ[e],
                eR[e],
                eY[e],
                eY[e] + eH[e],
              );
              if (th >= 0 && th < bestT) {
                bestT = th;
                bestE = e;
              }
            }
          }
        }
      }
      if (bestE >= 0) {
        const grp = groups[eGroup[bestE]];
        const k = eIndex[bestE];
        tBest = bestT;
        best = {
          kind: 'prop',
          id: `prop:${grp.def.id}:${grp.members[k]}`,
          x: ox + dx * bestT,
          y: oy + dy * bestT,
          z: oz + dz * bestT,
          t: bestT,
          defId: grp.def.id,
          instance: { group: grp, index: k },
        };
      }
    }
    stats.lastCandidates = nCand;

    // ---- agents
    const life = deps.life;
    if (life) {
      life.forEachAgent((kind, index, cx, cy, cz, r) => {
        const th = raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r);
        if (th >= 0 && th < tBest) {
          tBest = th;
          best = {
            kind: 'agent',
            id: `agent:${kind.name}:${index}`,
            x: ox + dx * th,
            y: oy + dy * th,
            z: oz + dz * th,
            t: th,
            agent: { kind, index },
          };
        }
      });
    }
    return best;
  }

  function ray(ndcX: number, ndcY: number, camera: THREE.Camera): PickResult | null {
    camera.updateMatrixWorld();
    _o.setFromMatrixPosition(camera.matrixWorld);
    _v.set(ndcX, ndcY, 0.5).unproject(camera).sub(_o);
    return pickRay(_o.x, _o.y, _o.z, _v.x, _v.y, _v.z);
  }

  return {
    pick: ray,
    pickRay,
    hover(ndcX, ndcY, camera) {
      hovered = ray(ndcX, ndcY, camera);
      return hovered;
    },
    get hovered() {
      return hovered;
    },
    rebuild,
    stats,
  };
}

export const pickSphereOf = (kindName: string): { y: number; r: number } =>
  PICK_SPHERES[kindName] ?? PICK_DEFAULT;
