/**
 * Pipe run levels (TASK-461): the tube heights of a run of 2 u pipe pieces over the ground, so a
 * run climbs a slope as a pitched line instead of level pieces stepping up. Pure data (no three).
 *
 * Every piece starts at the height the previous one ended (joints continuous) unless a vertical
 * riser stands at that joint; its rise is a multiple of `pitchStep`, at most `maxRise` either way
 * (0 for elbows). The tube centre keeps `clearance` over the ground under the whole piece (never
 * buried) and hugs it otherwise: a climb steeper than `maxRise` takes a riser up before the
 * piece, a run left floating more than `float` drops by a riser (both whole `riserUnit`s).
 */
import { heightAt, type Heightfield, type XZ } from './types.ts';

export interface PipeRunParams {
  clearance: number;
  pitchStep: number;
  maxRise: number;
  riserUnit: number;
  float: number;
}

/** One piece: its centre-line from `from` to `to` (through `via`: an elbow's corner). */
export interface PipeSpan {
  from: XZ;
  to: XZ;
  via?: XZ;
  /** No rise allowed (elbows). */
  level: boolean;
  /** Starts where the previous piece ended (false: a new run). */
  joined: boolean;
}

export interface PipeLevel {
  /** Tube centre height at the start / end. */
  a: number;
  b: number;
  /** Riser at the start: a − the previous piece's end (0 = none or a new run). */
  riser: number;
}

/** Ground samples per piece (every ≈ 0.25 u of a 2 u piece). */
const SAMPLES = 8;

export function levelPipeRun(
  h: Heightfield,
  spans: readonly PipeSpan[],
  P: PipeRunParams,
): PipeLevel[] {
  const q = P.pitchStep;
  const u = P.riserUnit;
  const out: PipeLevel[] = [];
  let y = NaN;
  for (const sp of spans) {
    // the lowest the tube centre may pass at t ∈ [0, 1] along the piece
    const lo: number[] = [];
    for (let k = 0; k <= SAMPLES; k++) {
      const p = along(sp, k / SAMPLES);
      lo.push(heightAt(h, p.x, p.z) + P.clearance);
    }
    const R = sp.level ? 0 : P.maxRise;
    // the lowest start from which some rise ≤ R clears the ground
    let aMin = -Infinity;
    for (let k = 0; k <= SAMPLES; k++) aMin = Math.max(aMin, lo[k] - (R * k) / SAMPLES);
    let a: number;
    if (!sp.joined || Number.isNaN(y)) a = aMin;
    else if (y < aMin - 1e-6) a = y + u * Math.ceil((aMin - y) / u - 1e-3);
    else if (y - aMin > P.float) a = y - u * Math.floor((y - aMin) / u + 1e-3);
    else a = y;
    // the lowest rise (whole pitch steps) that clears the ground from `a`
    let need = -R;
    for (let k = 1; k <= SAMPLES; k++) need = Math.max(need, (lo[k] - a) / (k / SAMPLES));
    const rise = Math.min(R, q * Math.ceil(need / q - 1e-3));
    const riser = sp.joined && !Number.isNaN(y) ? a - y : 0;
    out.push({ a, b: a + rise, riser });
    y = a + rise;
  }
  return out;
}

/**
 * Elbow at vertex `a` of a pipe polyline (prev → a → next): both legs ≥ 2 u and a bend within
 * `tol` rad of a right angle. Returns the signed turn (rad), NaN when no elbow.
 */
export function elbowTurn(prev: XZ, a: XZ, next: XZ, tol: number): number {
  const li = Math.hypot(a.x - prev.x, a.z - prev.z);
  const lo = Math.hypot(next.x - a.x, next.z - a.z);
  if (li < 2 || lo < 2) return NaN;
  const [ux, uz] = [(a.x - prev.x) / li, (a.z - prev.z) / li];
  const [ox, oz] = [(next.x - a.x) / lo, (next.z - a.z) / lo];
  const turn = Math.atan2(ux * oz - uz * ox, ux * ox + uz * oz);
  return Math.abs(Math.abs(turn) - Math.PI / 2) > tol ? NaN : turn;
}

/**
 * Snap a pipe polyline so whole pieces fill every leg (TASK-461): each vertex slides ≤ 2.5 u
 * along its incoming leg (the last one only onward) until the leg holds whole `piece`-long
 * pieces besides the 1 u elbow arms at its ends, so the pieces of two legs meet AT the vertex
 * (no overshoot, no gap). A slide is kept only when `ok` accepts both legs it changes and the
 * next leg keeps its way (the end: no farther from `into`, the centre it feeds); else the vertex
 * stays. Pure.
 */
export function snapPipeLine(
  pts: readonly XZ[],
  piece: number,
  tol: number,
  ok: (a: XZ, b: XZ) => boolean,
  into?: XZ,
): XZ[] {
  const out = pts.map((p) => ({ ...p }));
  for (let i = 0; i + 1 < out.length; i++) {
    const a = out[i];
    const b = out[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1e-6) continue;
    const d = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
    const elbowIn = i > 0 && !Number.isNaN(elbowTurn(out[i - 1], a, b, tol)) ? 1 : 0;
    const lens: number[] = [];
    // (the run's end only reaches on, into the building / tower it feeds)
    const last = i + 2 === out.length;
    for (let l = Math.max(1, Math.ceil(last ? L - 1e-6 : L - 2.5)); l <= L + 2.5; l++) lens.push(l);
    lens.sort((x, y) => Math.abs(x - L) - Math.abs(y - L) || x - y);
    for (const l of lens) {
      const q = { x: a.x + d.x * l, z: a.z + d.z * l };
      const next = out[i + 2];
      // the next leg keeps its way (≤ 25° off, ≥ 1 u): no slide past a short leg's end
      if (next) {
        const [nx, nz] = [next.x - q.x, next.z - q.z];
        const [ox, oz] = [next.x - b.x, next.z - b.z];
        const ln = Math.hypot(nx, nz);
        const lo = Math.hypot(ox, oz);
        if (ln < 1 || (nx * ox + nz * oz) / (ln * lo) < Math.cos((25 * Math.PI) / 180)) continue;
      }
      const elbowOut = next && !Number.isNaN(elbowTurn(a, q, next, tol)) ? 1 : 0;
      const rest = l - elbowIn - elbowOut;
      if (rest < 0 || Math.abs(rest / piece - Math.round(rest / piece)) > 1e-6) continue;
      if (!ok(a, q) || (next && !ok(q, next))) continue;
      if (
        last &&
        into &&
        Math.hypot(q.x - into.x, q.z - into.z) > Math.hypot(b.x - into.x, b.z - into.z)
      )
        continue;
      out[i + 1] = q;
      break;
    }
  }
  return out;
}

/** Point at fraction `t` of a piece's centre-line (an elbow: half per arm). */
function along(sp: PipeSpan, t: number): XZ {
  if (!sp.via) return lerp(sp.from, sp.to, t);
  return t < 0.5 ? lerp(sp.from, sp.via, t * 2) : lerp(sp.via, sp.to, t * 2 - 1);
}

const lerp = (a: XZ, b: XZ, t: number): XZ => ({
  x: a.x + (b.x - a.x) * t,
  z: a.z + (b.z - a.z) * t,
});
