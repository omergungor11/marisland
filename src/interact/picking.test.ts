import { describe, expect, it } from 'vitest';
import {
  ClickFilter,
  makeRay,
  marchTerrain,
  Picker,
  PropHash,
  rayCylinder,
  raySphere,
  screenRay,
  type AgentSource,
  type PickCamera,
  type PropProxies,
  type Ray,
} from './picking.ts';
import { PICK } from '../content/anim.ts';

/** Synthetic world: a 60 u wide cosine hill (peak 20) at the origin, sea elsewhere. */
const hill = (x: number, z: number): number => {
  const d = Math.hypot(x, z);
  return d > 30 ? -2 : 20 * 0.5 * (1 + Math.cos((d / 30) * Math.PI));
};
const MARCH = { ...PICK.march, heightAt: hill, maxY: 25 };

const ray = (o: [number, number, number], to: [number, number, number]): Ray => {
  const d = [to[0] - o[0], to[1] - o[1], to[2] - o[2]];
  const l = Math.hypot(d[0], d[1], d[2]);
  return { ox: o[0], oy: o[1], oz: o[2], dx: d[0] / l, dy: d[1] / l, dz: d[2] / l };
};

function proxies(
  list: Array<{ id: number; def: number; x: number; y: number; z: number; r: number; h: number }>,
): PropProxies {
  return {
    count: list.length,
    id: Int32Array.from(list.map((p) => p.id)),
    def: Uint16Array.from(list.map((p) => p.def)),
    x: Float32Array.from(list.map((p) => p.x)),
    y: Float32Array.from(list.map((p) => p.y)),
    z: Float32Array.from(list.map((p) => p.z)),
    r: Float32Array.from(list.map((p) => p.r)),
    h: Float32Array.from(list.map((p) => p.h)),
  };
}

const BOUNDS = { minX: -100, minZ: -100, maxX: 100, maxZ: 100 };

function picker(
  props: PropProxies,
  agents: AgentSource[] = [],
  visible?: (id: number) => boolean,
): Picker {
  return new Picker({
    march: MARCH,
    hash: new PropHash(props, BOUNDS, PICK.cell),
    defNames: ['palm', 'cottage', 'rock'],
    agents,
    propVisible: visible,
    near: 0.5,
    far: 600,
  });
}

describe('rayCylinder / raySphere', () => {
  it('hits a cylinder from the side and from above, misses outside it', () => {
    const side = ray([-10, 1, 0], [0, 1, 0]);
    expect(rayCylinder(side, 0, 0, 0, 2, 4, 0)).toBeCloseTo(8, 5);
    const top = ray([0.5, 10, 0], [0.5, 0, 0]);
    expect(rayCylinder(top, 0, 0, 0, 2, 4, 0)).toBeCloseTo(6, 5);
    expect(rayCylinder(ray([-10, 6, 0], [0, 6, 0]), 0, 0, 0, 2, 4, 0)).toBe(-1);
    expect(rayCylinder(ray([-10, 1, 3], [0, 1, 3]), 0, 0, 0, 2, 4, 0)).toBe(-1);
  });
  it('hits a sphere', () => {
    expect(raySphere(ray([0, 0, -10], [0, 0, 0]), 0, 0, 0, 1, 0)).toBeCloseTo(9, 5);
    expect(raySphere(ray([0, 2, -10], [0, 2, 0]), 0, 0, 0, 1, 0)).toBe(-1);
  });
});

describe('marchTerrain', () => {
  it('finds the hill surface by march + bisect', () => {
    const r = ray([0, 60, 0.001], [0, 0, 0]);
    const t = marchTerrain(r, { ...MARCH, near: 0.5, far: 600 });
    expect(r.oy + r.dy * t).toBeCloseTo(20, 1);
  });
  it('falls back to the sea plane and reports a miss for sky rays', () => {
    const r = ray([80, 40, 0], [60, 0, 0]);
    const t = marchTerrain(r, { ...MARCH, near: 0.5, far: 600 });
    expect(r.oy + r.dy * t).toBeCloseTo(0, 1);
    expect(marchTerrain(ray([0, 40, 0], [0, 80, 100]), { ...MARCH, near: 0.5, far: 600 })).toBe(
      Infinity,
    );
  });
});

describe('Picker', () => {
  const props = proxies([
    { id: 7, def: 0, x: 0, y: 20, z: 0, r: 1, h: 5 }, // palm on the hilltop
    { id: 9, def: 1, x: 40, y: 0, z: 0, r: 2, h: 3 }, // cottage on the sea plane
    { id: 11, def: 2, x: 0, y: 12, z: 18, r: 1, h: 2 }, // rock on the flank
  ]);

  it('returns the prop under the ray (id, def name, point)', () => {
    const hit = picker(props).pick(ray([0, 40, -30], [0, 22, 0]));
    expect(hit?.kind).toBe('prop');
    expect(hit?.id).toBe(7);
    expect(hit?.name).toBe('palm');
    expect(hit?.instanceIndex).toBe(7);
    expect(hit?.z).toBeCloseTo(-1, 0);
  });

  it('returns the terrain when nothing stands on the ray, flagging water', () => {
    const land = picker(props).pick(ray([10, 40, -20], [10, 14, -5]));
    expect(land?.kind).toBe('terrain');
    expect(land?.water).toBe(false);
    const sea = picker(props).pick(ray([-60, 30, -60], [-50, 0, -50]));
    expect(sea?.kind).toBe('terrain');
    expect(sea?.water).toBe(true);
  });

  it('nearest hit along the ray wins: terrain occludes a prop behind the hill', () => {
    // from the north looking south across the hill at the cottage (east, sea level): the
    // ridge blocks it; from above the cottage it is hit
    const behind = picker(props).pick(ray([-45, 8, 0], [40, 1, 0]));
    expect(behind?.kind).toBe('terrain');
    const above = picker(props).pick(ray([40, 30, -10], [40, 1.5, 0]));
    expect(above?.kind).toBe('prop');
    expect(above?.id).toBe(9);
  });

  it('prefers the nearer of two overlapping props', () => {
    const two = proxies([
      { id: 1, def: 0, x: 0, y: 20, z: 0, r: 2, h: 4 },
      { id: 2, def: 1, x: 0, y: 20, z: -5, r: 2, h: 4 },
    ]);
    expect(picker(two).pick(ray([0, 22, -30], [0, 22, 0]))?.id).toBe(2);
    expect(picker(two).pick(ray([0, 22, 30], [0, 22, 0]))?.id).toBe(1);
  });

  it('skips invisible props (tier / LOD gating)', () => {
    const hit = picker(props, [], (id) => id !== 7).pick(ray([0, 40, -30], [0, 22, 0]));
    expect(hit?.kind).toBe('terrain');
  });

  it('hits agents (sphere records) in front of the terrain', () => {
    const recs = new Float32Array([5, 19, -3, 0.6]);
    const src: AgentSource = {
      name: 'sheep',
      capacity: 1,
      fill: (out, ids) => {
        out.set(recs);
        ids[0] = 3;
        return 1;
      },
    };
    const hit = picker(props, [src]).pick(ray([5, 40, -3], [5, 19, -3]));
    expect(hit).toMatchObject({ kind: 'agent', id: 3, name: 'sheep', instanceIndex: 3 });
    const miss = picker(props, [src]).pick(ray([9, 40, -3], [9, 19, -3]));
    expect(miss?.kind).toBe('terrain');
  });

  it('is deterministic (same ray, same hit)', () => {
    const p = picker(props);
    const r = ray([3, 50, -35], [0, 21, 0]);
    expect(p.pick(r)).toEqual(p.pick(r));
  });

  it('matches a brute-force scan over many random-ish props', () => {
    const list = Array.from({ length: 400 }, (_, i) => ({
      id: i,
      def: i % 3,
      x: ((i * 37) % 180) - 90,
      y: 0,
      z: ((i * 91) % 180) - 90,
      r: 0.5 + (i % 4) * 0.4,
      h: 1 + (i % 5),
    }));
    const P = proxies(list);
    const p = picker(P);
    for (let k = 0; k < 40; k++) {
      const o: [number, number, number] = [-80 + k * 4, 30, -70 + ((k * 13) % 50)];
      const r = ray(o, [o[0] + 3, 0, o[2] + ((k * 7) % 11) - 5]);
      let best = -1;
      let bestT = Infinity;
      for (const c of list) {
        const t = rayCylinder(r, c.x, c.y, c.z, c.r, c.h, 0);
        if (t >= 0 && t < bestT) {
          bestT = t;
          best = c.id;
        }
      }
      const hit = p.pick(r);
      const tTerrain = marchTerrain(r, { ...MARCH, near: 0.5, far: 600 });
      if (best >= 0 && bestT < tTerrain) expect(hit?.id).toBe(best);
      else expect(hit?.kind).not.toBe('prop');
    }
  });
});

describe('screenRay', () => {
  const cam: PickCamera = {
    px: 0,
    py: 10,
    pz: 0,
    rx: 1,
    ry: 0,
    rz: 0,
    ux: 0,
    uy: 1,
    uz: 0,
    fx: 0,
    fy: 0,
    fz: -1,
    tanHalf: Math.tan((35 * Math.PI) / 360),
    aspect: 16 / 9,
  };
  it('centre looks along forward; corners fan out symmetrically', () => {
    const o = makeRay();
    screenRay(o, cam, 0, 0);
    expect([o.dx, o.dy, o.dz]).toEqual([0, 0, -1]);
    const a = { ...screenRay(makeRay(), cam, 1, 1) };
    const b = { ...screenRay(makeRay(), cam, -1, 1) };
    expect(a.dx).toBeCloseTo(-b.dx, 6);
    expect(a.dy).toBeCloseTo(b.dy, 6);
    expect(Math.hypot(a.dx, a.dy, a.dz)).toBeCloseTo(1, 6);
  });
});

describe('ClickFilter (jitter filter)', () => {
  const f = new ClickFilter(6, 300);
  it('counts a still, quick press', () => {
    f.down(1, 100, 100, 1000);
    expect(f.up(1, 102, 101, 1120)).toBe(true);
  });
  it('rejects a drag of 6 px or more', () => {
    f.down(1, 100, 100, 1000);
    expect(f.up(1, 106, 100, 1100)).toBe(false);
    f.down(1, 100, 100, 1000);
    expect(f.up(1, 100, 94, 1100)).toBe(false);
  });
  it('rejects a press held 300 ms or longer', () => {
    f.down(1, 100, 100, 1000);
    expect(f.up(1, 100, 100, 1300)).toBe(false);
    f.down(1, 100, 100, 1000);
    expect(f.up(1, 100, 100, 1299)).toBe(true);
  });
  it('rejects a second pointer / a cancelled press', () => {
    f.down(1, 100, 100, 1000);
    expect(f.up(2, 100, 100, 1050)).toBe(false);
    f.down(1, 100, 100, 1000);
    f.cancel();
    expect(f.up(1, 100, 100, 1050)).toBe(false);
  });
});
