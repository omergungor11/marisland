import { describe, expect, it } from 'vitest';
import { DEVOPS_M25_MOTION, DEVOPS_M25_SITE } from '../content/themes/devops-m25-site.ts';
import { appendSettlementProps } from '../render/props/settlement-props.ts';
import { PROP_DEF_INDEX } from '../content/props.ts';
import { carPose, newCarPose, planRail, railEarthworks, railFromLevels } from './funicular.ts';
import { generateWorld } from './index.ts';
import { heightAt, type Heightfield, type XZ } from './types.ts';

const R = DEVOPS_M25_SITE.rail;
const C = DEVOPS_M25_MOTION.car;

/** A heightfield over x ∈ [0, 60] (z ignored) from `f(x)`, 0.5 u cells. */
function field(f: (x: number) => number): Heightfield {
  const n = 121;
  const data = new Float32Array(n * n);
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) data[iz * n + ix] = f(ix * 0.5);
  return { data, n, cellSize: 0.5, originX: 0, originZ: 0 };
}

/** A two-leg zig-zag up the +x slope. */
const ZIG: XZ[] = [
  { x: 4, z: 20 },
  { x: 22, z: 32 },
  { x: 40, z: 20 },
];

describe('funicular rail (TASK-507)', () => {
  it('cuts legs into whole pieces; stored levels must match the piece count', () => {
    const pts = [
      { x: 0, z: 0 },
      { x: 9, z: 0 },
    ];
    expect(railFromLevels(pts, [0, 0, 0, 0])?.pieces.length).toBe(3);
    expect(railFromLevels(pts, [0, 0, 0])).toBeNull();
    // shorter than one 0.75-scale piece
    expect(railFromLevels([pts[0], { x: 2, z: 0 }], [0, 0])).toBeNull();
  });

  it('grade line on an even 0.3 slope: one pitch step per piece, every pivot on the ground', () => {
    const h = field((x) => 2 + 0.3 * x);
    const pts = [
      { x: 4, z: 30 },
      { x: 34, z: 30 },
    ];
    const y0 = heightAt(h, 4, 30) + R.clearance;
    const y1 = heightAt(h, 34, 30) + R.clearance;
    const L = planRail(h, pts, y0, y1);
    expect(L).not.toBeNull();
    for (const p of L!.pieces) {
      expect(p.variant).toBe(1);
      expect(Math.abs(p.y - heightAt(h, p.x, p.z))).toBeLessThan(0.05);
    }
    expect(Math.abs(L!.pts[L!.pts.length - 1].y - y1)).toBeLessThan(0.05);
  });

  it('a steep cone is climbed at ≤ 0.6 by the zig-zag; the earthworks bring the ground to it', () => {
    const h = field((x) => 1 + 0.8 * x);
    const y0 = heightAt(h, ZIG[0].x, ZIG[0].z) + R.clearance;
    const y1 = heightAt(h, ZIG[2].x, ZIG[2].z) + R.clearance;
    const L = planRail(h, ZIG, y0, y1)!;
    for (const p of L.pieces) {
      const run = R.piece * p.scale;
      expect(Math.abs(p.yb - p.ya) / run).toBeLessThanOrEqual(R.pitchStep * R.maxStep + 1e-9);
    }
    railEarthworks(h, L, R.core, R.fall, (i, target, w) => {
      h.data[i] += (target - h.data[i]) * w;
    });
    for (const p of L.pieces) expect(Math.abs(p.y - heightAt(h, p.x, p.z))).toBeLessThan(0.1);
  });

  it('car: dwells at the ends, climbs, turns at the vertex; the counter car starts at the top', () => {
    const h = field((x) => 1 + 0.3 * x);
    const L = planRail(
      h,
      ZIG,
      heightAt(h, 4, 20) + R.clearance,
      heightAt(h, 40, 20) + R.clearance,
    )!;
    const pose = newCarPose();
    // the cycle starts `C.phase` early (tuned for a preset): shift every probe back by it
    const t0 = -C.phase * 2 * (C.oneWay + C.dwell);
    carPose(L, t0 + 1, 0, pose);
    expect(Math.hypot(pose.x - ZIG[0].x, pose.z - ZIG[0].z)).toBeLessThan(1e-6);
    carPose(L, t0 + C.dwell + C.oneWay + 1, 0, pose);
    expect(Math.hypot(pose.x - ZIG[2].x, pose.z - ZIG[2].z)).toBeLessThan(1e-6);
    carPose(L, t0 + 1, 0.5, pose);
    expect(Math.hypot(pose.x - ZIG[2].x, pose.z - ZIG[2].z)).toBeLessThan(1e-6);
    // somewhere in the climb it turns at the vertex, standing on it
    let turned = false;
    for (let t = t0; t < t0 + C.dwell + C.oneWay; t += 0.1) {
      carPose(L, t, 0, pose);
      if (pose.turning === 0) {
        turned = true;
        expect(Math.hypot(pose.x - ZIG[1].x, pose.z - ZIG[1].z)).toBeLessThan(1e-6);
      }
    }
    expect(turned).toBe(true);
    // continuous: no jump between frames over a whole cycle
    const prev = newCarPose();
    carPose(L, 0, 0, prev);
    for (let t = 0.05; t < 2 * (C.oneWay + C.dwell); t += 0.05) {
      carPose(L, t, 0, pose);
      expect(Math.hypot(pose.x - prev.x, pose.y - prev.y, pose.z - prev.z)).toBeLessThan(0.5);
      Object.assign(prev, pose);
    }
  });

  it('seed 1001: the rail pieces in the prop store are the stored levels, deterministic', () => {
    const a = generateWorld(1001);
    const b = generateWorld(1001);
    const fa = a.fences.filter((f) => f.kind === 'funicular');
    expect(fa.length).toBeGreaterThan(0);
    expect(JSON.stringify(fa)).toBe(JSON.stringify(b.fences.filter((f) => f.kind === 'funicular')));
    const { props } = appendSettlementProps(a);
    const rail = PROP_DEF_INDEX.funicularRail;
    let n = 0;
    for (let i = 0; i < props.count; i++) if (props.defId[i] === rail) n++;
    const want = fa.reduce(
      (s, f) => s + (railFromLevels(f.points, f.levels ?? [])?.pieces.length ?? 0),
      0,
    );
    expect(n).toBe(want);
  });
});
