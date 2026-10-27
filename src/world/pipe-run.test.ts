import { describe, expect, it } from 'vitest';
import { PIPE_RUN } from '../content/props-themes/devops.ts';
import { PROP_DEFS } from '../content/props.ts';
import { appendSettlementProps } from '../render/props/settlement-props.ts';
import { generateWorld } from './index.ts';
import { levelPipeRun, type PipeSpan } from './pipe-run.ts';
import { heightAt, type Heightfield } from './types.ts';

/** A heightfield over x ∈ [0, 40] (z ignored) from `f(x)`, 0.5 u cells. */
function field(f: (x: number) => number): Heightfield {
  const n = 81;
  const data = new Float32Array(n * n);
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) data[iz * n + ix] = f(ix * 0.5);
  return { data, n, cellSize: 0.5, originX: 0, originZ: 0 };
}

/** Straight 2 u pieces from x = 1 along +x at z = 20. */
const run = (count: number): PipeSpan[] =>
  Array.from({ length: count }, (_, k) => ({
    from: { x: 1 + 2 * k, z: 20 },
    to: { x: 3 + 2 * k, z: 20 },
    level: false,
    joined: k > 0,
  }));

/** Every piece clears the ground; joints continuous up to the risers; rises quantised. */
function check(h: Heightfield, spans: PipeSpan[]) {
  const L = levelPipeRun(h, spans, PIPE_RUN);
  const q = PIPE_RUN.pitchStep;
  L.forEach((l, k) => {
    const rise = l.b - l.a;
    expect(Math.abs(rise)).toBeLessThanOrEqual(PIPE_RUN.maxRise + 1e-6);
    expect(Math.abs(rise / q - Math.round(rise / q))).toBeLessThan(1e-6);
    if (k > 0) expect(l.a - l.riser).toBeCloseTo(L[k - 1].b, 6);
    expect(
      Math.abs(l.riser / PIPE_RUN.riserUnit - Math.round(l.riser / PIPE_RUN.riserUnit)),
    ).toBeLessThan(1e-6);
    const sp = spans[k];
    for (let t = 0; t <= 1; t += 0.05) {
      const x = sp.from.x + (sp.to.x - sp.from.x) * t;
      const g = heightAt(h, x, 20);
      expect(l.a + rise * t, `piece ${k} t ${t}`).toBeGreaterThanOrEqual(
        g + PIPE_RUN.clearance - 1e-4,
      );
    }
  });
  return L;
}

describe('pipe runs (TASK-461)', () => {
  it('flat ground: level pieces at the clearance, no risers', () => {
    const L = check(
      field(() => 3),
      run(6),
    );
    for (const l of L) {
      expect(l.a).toBeCloseTo(3 + PIPE_RUN.clearance, 5);
      expect(l.b).toBeCloseTo(l.a, 6);
      expect(l.riser).toBe(0);
    }
  });

  it('a moderate slope is one pitched line hugging the ground (no steps, no risers)', () => {
    const L = check(
      field((x) => 2 + 0.3 * x),
      run(10),
    );
    for (const l of L) {
      expect(l.riser).toBe(0);
      expect(l.b - l.a).toBeCloseTo(0.6, 6);
    }
    // never more than a pitch step above its clearance line
    for (const [k, l] of L.entries())
      expect(l.a - (2 + 0.3 * (1 + 2 * k) + PIPE_RUN.clearance)).toBeLessThan(
        PIPE_RUN.pitchStep + 1e-6,
      );
    // downhill the same, pieces falling
    const D = check(
      field((x) => 14 - 0.3 * x),
      run(10),
    );
    for (const l of D) expect(l.b - l.a).toBeCloseTo(-0.6, 6);
  });

  it('a terrace wall takes a riser at the joint before it (up) / after it (down)', () => {
    const wall = (x: number) => (x < 10 ? 2 : 4.4);
    const L = check(field(wall), run(10));
    const up = L.filter((l) => l.riser !== 0);
    expect(up.length).toBeGreaterThanOrEqual(1);
    expect(up.every((l) => l.riser > 0)).toBe(true);
    const D = check(
      field((x) => 6.4 - wall(x)),
      run(10),
    );
    expect(D.some((l) => l.riser < 0)).toBe(true);
    // no run floats more than `float` + a riser unit above its clearance line at a joint
    for (const [k, l] of D.entries()) {
      const g = 6.4 - wall(1 + 2 * k) + PIPE_RUN.clearance;
      expect(l.a - g).toBeLessThan(PIPE_RUN.float + PIPE_RUN.maxRise + 1e-6);
    }
  });

  it('a steep climb steps up by risers between pitched pieces at the max rise', () => {
    const L = check(
      field((x) => 1 + 0.9 * x),
      run(8),
    );
    for (const l of L.slice(1)) expect(l.b - l.a).toBeLessThanOrEqual(PIPE_RUN.maxRise + 1e-6);
    expect(L.filter((l) => l.riser > 0).length).toBeGreaterThan(2);
  });

  it('elbows stay level', () => {
    const spans: PipeSpan[] = [
      ...run(2),
      {
        from: { x: 5, z: 20 },
        via: { x: 6, z: 20 },
        to: { x: 6, z: 21 },
        level: true,
        joined: true,
      },
    ];
    const L = check(
      field((x) => 2 + 0.3 * x),
      spans,
    );
    expect(L[2].b).toBe(L[2].a);
  });
});

describe('DevOps pipes in the world (TASK-461)', () => {
  /** Tube centre-line ends of every straight / pitched piece vs the other ends, elbow arms, knuckles. */
  it(
    'runs are continuous, clear the ground, posts reach it (seeds 1001, 2024, 42)',
    { timeout: 120_000 },
    () => {
      const pipeDef = PROP_DEFS.findIndex((d) => d.id === 'pipe');
      for (const seed of [1001, 2024, 42]) {
        const w = generateWorld(seed);
        const { props: s } = appendSettlementProps(w);
        const ends: { x: number; y: number; z: number }[] = [];
        const joints: { x: number; y: number; z: number }[] = [];
        let pieces = 0;
        for (let i = 0; i < s.count; i++) {
          if (s.defId[i] !== pipeDef) continue;
          const v = s.variant[i];
          if (v === PIPE_RUN.knuckle) joints.push({ x: s.x[i], y: s.y[i] + 0.5, z: s.z[i] });
          if (v === 1) {
            // elbow arm ends: local (−1, 0, 0) and (0, 0, 1)
            const [c, sn] = [Math.cos(s.rotY[i]), Math.sin(s.rotY[i])];
            for (const [lx, lz] of [
              [-1, 0],
              [0, 1],
            ])
              joints.push({
                x: s.x[i] + lx * c + lz * sn,
                y: s.y[i] + 0.5,
                z: s.z[i] - lx * sn + lz * c,
              });
          }
          if (v === 1 || v === PIPE_RUN.riser || v === PIPE_RUN.knuckle) continue;
          pieces++;
          const k = (PIPE_RUN.pitched as readonly number[]).indexOf(v) + 1;
          const g = (k * PIPE_RUN.pitchStep) / 2;
          // local +x in the world: (cos yaw, −sin yaw)
          const [cx, cz] = [Math.cos(s.rotY[i]), -Math.sin(s.rotY[i])];
          const at = `seed ${seed} pipe ${i} v${v}`;
          for (const t of [-1, -0.5, 0, 0.5, 1]) {
            const x = s.x[i] + cx * t;
            const z = s.z[i] + cz * t;
            const y = s.y[i] + 0.5 + g * t;
            expect(y - heightAt(w.height, x, z), `${at} t ${t} buried`).toBeGreaterThan(
              PIPE_RUN.clearance - 0.05,
            );
            // the support posts (±0.55) reach the ground (4.2 u below the piece origin)
            if (Math.abs(t) === 0.5)
              expect(s.y[i] - 4.2, `${at} post floats`).toBeLessThan(heightAt(w.height, x, z));
          }
          for (const t of [-1, 1])
            ends.push({ x: s.x[i] + cx * t, y: s.y[i] + 0.5 + g * t, z: s.z[i] + cz * t });
        }
        expect(pieces, `seed ${seed}`).toBeGreaterThan(5);
        // every piece end meets another piece end, an elbow arm or a riser / bend knuckle at the
        // same point (the run ends and a rare bend the snap could not fit aside)
        const near = (a: { x: number; y: number; z: number }, b: typeof a) =>
          Math.hypot(a.x - b.x, a.z - b.z) < 0.05 && Math.abs(a.y - b.y) < 0.05;
        let open = 0;
        for (const [k, e] of ends.entries())
          if (!ends.some((o, j) => j !== k && near(e, o)) && !joints.some((o) => near(e, o)))
            open++;
        // TASK-503 re-roll (Emberpeak moved): the old code spans 0.03–0.20 over 12 seeds (7, 1007,
        // 4004, 6006 at 0.15–0.20); seed 42 now 0.167
        expect(open / ends.length, `seed ${seed} open ends`).toBeLessThan(0.2);
      }
    },
  );
});
