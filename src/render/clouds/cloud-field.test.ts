import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CLOUDS, PUFFS } from '../../content/anim.ts';
import { Scope } from '../../core/scope.ts';
import { createRng } from '../../core/rng.ts';
import {
  MEAN_ALT,
  cloudField,
  cloudShadowMask,
  cloudsAt,
  coverThresholds,
  fieldForSeed,
  hash32,
  windOffset,
  type CloudFieldParams,
  type CloudFrame,
} from './cloud-field.ts';
import { buildCloudGeometry } from './cloud-geometry.ts';
import { CLOUD_SHADOW_GLSL } from '../shaders/chunks/cloud-shadow.glsl.ts';
import {
  createPuffs,
  PUFF_CHIMNEY,
  PUFF_RING,
  PUFF_SPRING,
  PUFF_STEAM,
} from '../particles/puffs.ts';

/* ---------- float32 port of `marCloudShadow` (cloud-shadow.glsl.ts), line by line ---------- */
const F = Math.fround;
const u32 = (x: number): number => x >>> 0;
function gH32(x: number): number {
  x = u32(x);
  x = u32(x ^ (x >>> 16));
  x = u32(Math.imul(x, 0x7feb352d));
  x = u32(x ^ (x >>> 15));
  x = u32(Math.imul(x, 0x846ca68b));
  x = u32(x ^ (x >>> 16));
  return x;
}
const gLat = (X: number, Z: number, salt: number): number =>
  F((gH32(u32(gH32(u32(Z + Math.imul(salt, 4096))) ^ X)) >>> 8) / 16777216);
const gSS = (a: number, b: number, x: number): number => {
  const t = F(Math.min(1, Math.max(0, F(F(x - a) / F(b - a)))));
  return F(F(t * t) * F(3 - F(2 * t)));
};
function gVN(px: number, pz: number, salt: number): number {
  const ix = Math.floor(px);
  const iz = Math.floor(pz);
  const fx = F(px - ix);
  const fz = F(pz - iz);
  const ux = F(F(fx * fx) * F(3 - F(2 * fx)));
  const uz = F(F(fz * fz) * F(3 - F(2 * fz)));
  const X = u32(ix + 1024);
  const Z = u32(iz + 1024);
  const a = gLat(X, Z, salt);
  const b = gLat(X + 1, Z, salt);
  const c = gLat(X, Z + 1, salt);
  const d = gLat(X + 1, Z + 1, salt);
  return F(a + F(b - a) * ux + F(c - a) * uz + F(a - b - c + d) * F(ux * uz));
}
/** uniforms as the CPU writes them */
interface U {
  shadow: [number, number, number, number];
  sun: [number, number, number, number];
  seed: [number, number, number, number];
  /** uCloudCover (TASK-172): partial threshold, partial scale. */
  cover: [number, number];
}
function glslShadow(u: U, x: number, z: number): number {
  if (u.shadow[2] <= 0) return 0;
  const cell = F(u.seed[2]);
  const cells = F(u.seed[3]);
  const tile = F(cell * cells);
  const salt = u32(Math.floor(u.seed[0] + 0.5));
  const qx = F(
    F(F(F(x - F(u.shadow[0])) - F(u.sun[2])) - F(F(u.sun[0]) * MEAN_ALT)) / cell + 0.5 * cells,
  );
  const qz = F(
    F(F(F(z - F(u.shadow[1])) - F(u.sun[3])) - F(F(u.sun[1]) * MEAN_ALT)) / cell + 0.5 * cells,
  );
  const bx = Math.floor(qx - 0.5);
  const bz = Math.floor(qz - 0.5);
  let m = 0;
  for (let k = 0; k < 4; k++) {
    const cx = bx + (k & 1);
    const cz = bz + (k >> 1);
    const wx = F(cx - cells * Math.floor(cx / cells));
    const wz = F(cz - cells * Math.floor(cz / cells));
    const ix = u32(Math.floor(wx + 0.5));
    const iz = u32(Math.floor(wz + 0.5));
    const h = gH32(u32(ix + Math.imul(iz, 16) + Math.imul(salt, 256)));
    const cu = F((gH32(h) >>> 8) / 16777216);
    if (cu >= Math.max(F(u.seed[1]), F(u.cover[0]))) continue;
    const cs = cu < F(u.seed[1]) ? 1 : F(u.cover[1]);
    if (cs <= 0) continue;
    const pk = gH32(u32(h + 1));
    const cb = [pk & 255, (pk >>> 8) & 255, (pk >>> 16) & 255, pk >>> 24].map((b) =>
      F(F(b + 0.5) / 256),
    );
    const j0 = CLOUDS.jitter[0];
    const jr = CLOUDS.jitter[1] - CLOUDS.jitter[0];
    const jx = F(j0 + F(jr * cb[0]));
    const jz = F(j0 + F(jr * cb[1]));
    const width = F(CLOUDS.width[0] + F((CLOUDS.width[1] - CLOUDS.width[0]) * cb[2]));
    const yaw = F(cb[3] * 6.283185307);
    const alt = F(
      CLOUDS.altitude[0] +
        F((CLOUDS.altitude[1] - CLOUDS.altitude[0]) * F((gH32(u32(h + 5)) >>> 8) / 16777216)),
    );
    const rx = F(F(F(cx + jx) - 0.5 * cells) * cell + F(u.shadow[0]));
    const rz = F(F(F(cz + jz) - 0.5 * cells) * cell + F(u.shadow[1]));
    const edge = F(
      1 - gSS(0.5 * tile - CLOUDS.edgeFade, 0.5 * tile, Math.max(Math.abs(rx), Math.abs(rz))),
    );
    if (edge <= 0) continue;
    const dx = F(x - F(F(u.sun[2] + rx) + F(u.sun[0] * alt)));
    const dz = F(z - F(F(u.sun[3] + rz) + F(u.sun[1] * alt)));
    const cy = F(Math.cos(yaw));
    const sy = F(Math.sin(yaw));
    const lx = F(F(cy * dx) - F(sy * dz));
    const lz = F(F(sy * dx) + F(cy * dz));
    const ax = F(F(0.5 * width * CLOUDS.shadowFit * u.shadow[2]) * cs);
    const az = F(ax * CLOUDS.aspect);
    const dn = F(Math.hypot(F(lx / ax), F(lz / az)));
    let sd = F(F(dn - 1) * F(Math.sqrt(F(ax * az))));
    const wob = F(
      0.65 * gVN(F(lx * 0.11 + ix * 17), F(lz * 0.11 + iz * 17), salt) +
        0.35 * gVN(F(lx * 0.23 + 5), F(lz * 0.23 + 5), salt),
    );
    sd = F(sd + F(F(wob - 0.5) * 2 * CLOUDS.wobble));
    m = Math.max(m, F(F(1 - gSS(-CLOUDS.shadowBlur / 2, CLOUDS.shadowBlur / 2, sd)) * edge));
  }
  return m;
}

function frameFor(p: CloudFieldParams, t: number, sun: THREE.Vector3): CloudFrame {
  const off = windOffset(p, Math.cos(0.7), Math.sin(0.7), t, { x: 0, z: 0 });
  const sy = Math.max(sun.y, CLOUDS.minSunY);
  return { ox: off.x, oz: off.z, sunX: -sun.x / sy, sunZ: -sun.z / sy, coverage: 1 };
}
const uniformsFor = (p: CloudFieldParams, f: CloudFrame): U => ({
  shadow: [f.ox, f.oz, f.coverage, 0.18],
  sun: [f.sunX, f.sunZ, p.centreX, p.centreZ],
  seed: [p.salt, p.threshold, p.cellSize, p.cells],
  cover: [p.partialThreshold ?? 0, p.partialScale ?? 0],
});
const SUN = new THREE.Vector3(0.45, 0.75, -0.48).normalize();

describe('cloud field', () => {
  it('hash32 matches known lowbias32 values', () => {
    expect(hash32(0)).toBe(0);
    expect(hash32(1)).toBe(gH32(1));
    expect(hash32(0xffffffff)).toBe(gH32(0xffffffff));
  });

  it('GLSL shadow formula matches the TS twin to 1e-3 (seed cover and weather cover)', () => {
    let worst = 0;
    let lit = 0;
    for (const [seed, extra] of [
      [1001, 0],
      [42, 0],
      [3003, 3.4],
      [7, 6.7],
    ] as const) {
      const base = fieldForSeed(seed, 12, -8);
      const table = coverThresholds(base.salt, base.cells);
      const n0 = table.indexOf(base.threshold);
      expect(n0).toBeGreaterThanOrEqual(CLOUDS.count[0]);
      const c = Math.min(base.cells * base.cells, n0 + extra);
      const full = Math.floor(c);
      const p: CloudFieldParams =
        extra === 0
          ? base
          : {
              ...base,
              threshold: table[full],
              partialThreshold: table[Math.min(full + 1, table.length - 1)],
              partialScale: c - full,
            };
      for (const t of [0, 13.7, 500]) {
        const f = frameFor(p, t, SUN);
        const u = uniformsFor(p, f);
        // sample around every projected cloud and on a coarse grid
        const pts: [number, number][] = [];
        for (const c of cloudsAt(p, f.ox, f.oz)) {
          const gx = c.x + f.sunX * c.alt;
          const gz = c.z + f.sunZ * c.alt;
          for (let a = -24; a <= 24; a += 3)
            for (let b = -24; b <= 24; b += 6) pts.push([gx + a, gz + b]);
        }
        for (let x = -380; x <= 380; x += 23)
          for (let z = -380; z <= 380; z += 29) pts.push([x, z]);
        for (const [x, z] of pts) {
          const a = cloudShadowMask(p, x, z, f);
          const b = glslShadow(u, x, z);
          if (a > 0.5) lit++;
          worst = Math.max(worst, Math.abs(a - b));
        }
      }
    }
    expect(lit).toBeGreaterThan(50);
    expect(worst).toBeLessThan(1e-3);
  });

  it('GLSL chunk carries the same constants', () => {
    expect(CLOUD_SHADOW_GLSL).toContain('0x7feb352du');
    expect(CLOUD_SHADOW_GLSL).toContain('0x846ca68bu');
    expect(CLOUD_SHADOW_GLSL).toContain(MEAN_ALT.toFixed(6));
    expect(CLOUD_SHADOW_GLSL).toContain(CLOUDS.aspect.toFixed(6));
  });

  it('has 6–10 peaks over the window for 20 seeds, stable over time', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const p = fieldForSeed(seed * 7919, 0, 0);
      for (const t of [0, 37, 250, 1e4]) {
        const f = frameFor(p, t, SUN);
        const clouds = cloudsAt(p, f.ox, f.oz);
        expect(clouds.length).toBeGreaterThanOrEqual(CLOUDS.count[0]);
        expect(clouds.length).toBeLessThanOrEqual(CLOUDS.count[1]);
        for (const c of clouds) {
          expect(Math.abs(c.x)).toBeLessThanOrEqual(CLOUDS.tile / 2);
          expect(Math.abs(c.z)).toBeLessThanOrEqual(CLOUDS.tile / 2);
          if (c.edge < 1) continue;
          // the cloud sits on a field peak
          const v = cloudField(p, c.x, c.z, f);
          expect(v).toBeCloseTo(1, 4);
          for (const [dx, dz] of [
            [4, 0],
            [-4, 0],
            [0, 4],
            [0, -4],
          ])
            expect(cloudField(p, c.x + dx, c.z + dz, f)).toBeLessThan(v);
        }
      }
    }
  });

  it('shadows sit under the clouds (projected along the sun) and nowhere else', () => {
    const p = fieldForSeed(1001, 0, 0);
    for (const t of [5, 15]) {
      const f = frameFor(p, t, SUN);
      const all = cloudsAt(p, f.ox, f.oz);
      const clouds = all.filter((c) => c.edge >= 1);
      expect(clouds.length).toBeGreaterThan(0);
      for (const c of clouds) {
        const gx = c.x + f.sunX * c.alt;
        const gz = c.z + f.sunZ * c.alt;
        expect(cloudShadowMask(p, gx, gz, f)).toBeGreaterThan(0.95);
        // directly below is NOT the shadow when the sun is low-ish (offset > 2 widths)
        if (Math.hypot(f.sunX * c.alt, f.sunZ * c.alt) > c.width * 2)
          expect(cloudShadowMask(p, c.x, c.z, f)).toBeLessThan(0.05);
      }
      // far from every projected cloud → no shadow
      let far = 0;
      for (let x = -340; x <= 340; x += 17)
        for (let z = -340; z <= 340; z += 17) {
          const near = all.some(
            (c) => Math.hypot(x - c.x - f.sunX * c.alt, z - c.z - f.sunZ * c.alt) < 60,
          );
          if (near) continue;
          far++;
          expect(cloudShadowMask(p, x, z, f)).toBe(0);
        }
      expect(far).toBeGreaterThan(100);
    }
  });

  it('coverage 0 disables the shadow', () => {
    const p = fieldForSeed(5, 0, 0);
    const f = { ...frameFor(p, 0, SUN), coverage: 0 };
    for (let x = -300; x <= 300; x += 10) expect(cloudShadowMask(p, x, 0, f)).toBe(0);
  });
});

describe('cloud geometry', () => {
  it('is normalised, flat-bottomed and finite', () => {
    for (let v = 0; v < 3; v++) {
      const g = buildCloudGeometry(createRng(9).fork('geo', v));
      const pos = g.getAttribute('position');
      const nrm = g.getAttribute('normal');
      const shade = g.getAttribute('aShade');
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      for (let i = 0; i < pos.count; i++) {
        for (const a of [pos.getX(i), pos.getY(i), pos.getZ(i), nrm.getX(i), shade.getX(i)])
          expect(Number.isFinite(a)).toBe(true);
        x0 = Math.min(x0, pos.getX(i));
        x1 = Math.max(x1, pos.getX(i));
        y0 = Math.min(y0, pos.getY(i));
        expect(Math.abs(pos.getZ(i))).toBeLessThanOrEqual(CLOUDS.aspect / 2 + 1e-6);
      }
      expect(x1 - x0).toBeCloseTo(1, 5);
      expect(y0).toBeCloseTo(0, 6);
      // spheres: 5–9 icospheres of detail 2 (180 triangles each)
      const tris = pos.count / 3;
      expect(tris % 180).toBe(0);
      expect(tris / 180).toBeGreaterThanOrEqual(5);
      expect(tris / 180).toBeLessThanOrEqual(9);
      g.dispose();
    }
  });
});

describe('puffs', () => {
  it('writes finite per-slot attributes within capacity', () => {
    const scope = new Scope('t');
    const puffs = createPuffs(scope, 'medium');
    puffs.addEmitter(1, 20, 2, PUFF_STEAM);
    puffs.addEmitter(5, 1, 5, PUFF_SPRING);
    puffs.addEmitter(-3, 4, 0, PUFF_CHIMNEY);
    puffs.finalize();
    const want = PUFFS.steam.slots + PUFFS.burp.ring + PUFFS.spring.slots + PUFFS.chimney.slots;
    expect(puffs.mesh.count).toBe(want);
    expect(puffs.stats().capacity).toBeLessThanOrEqual(600);
    const g = puffs.mesh.geometry;
    const seed = g.getAttribute('aSeed');
    const kind = g.getAttribute('aKind');
    const shape = g.getAttribute('aShape');
    const origin = g.getAttribute('aOrigin');
    let rings = 0;
    for (let i = 0; i < want; i++) {
      expect(seed.getX(i)).toBeGreaterThanOrEqual(0);
      expect(seed.getX(i)).toBeLessThan(1);
      for (const a of [origin.getX(i), origin.getY(i), origin.getZ(i), shape.getW(i)])
        expect(Number.isFinite(a)).toBe(true);
      if (kind.getX(i) === PUFF_RING) rings++;
      else expect(shape.getW(i)).toBeGreaterThan(0);
    }
    expect(rings).toBe(PUFFS.burp.ring);
    // steam: spawn interval = life / slots = 0.6 s (ART_BIBLE §7 #21)
    expect(shape.getW(0) / PUFFS.steam.slots).toBeCloseTo(0.6, 6);
    // continuous column: rise ≥ 15 u
    expect(shape.getZ(0)).toBeGreaterThanOrEqual(15);
    scope.dispose();
  });

  it('setEmitter moves an emitter and switches it off / on (flooded chimneys, D1)', () => {
    const scope = new Scope('t');
    const puffs = createPuffs(scope, 'medium');
    puffs.addEmitter(1, 20, 2, PUFF_STEAM);
    const e = puffs.addEmitter(-3, 4, 0, PUFF_CHIMNEY);
    puffs.finalize();
    expect(e).toBe(1);
    const g = puffs.mesh.geometry;
    const shape = g.getAttribute('aShape');
    const origin = g.getAttribute('aOrigin');
    const first = PUFFS.steam.slots + PUFFS.burp.ring;
    const slots = Array.from({ length: PUFFS.chimney.slots }, (_, k) => first + k);
    puffs.setEmitter(e, -3, 9, 0, false);
    for (const i of slots) {
      expect(origin.getY(i)).toBe(9);
      expect(shape.getX(i)).toBe(0);
      expect(shape.getY(i)).toBe(0);
    }
    expect(shape.getX(0)).toBeCloseTo(PUFFS.steam.size[0], 6); // other emitters untouched
    puffs.setEmitter(e, -3, 4, 0, true);
    for (const i of slots) {
      expect(origin.getY(i)).toBe(4);
      expect(shape.getX(i)).toBeCloseTo(PUFFS.chimney.size[0], 6);
      expect(shape.getY(i)).toBeCloseTo(PUFFS.chimney.size[1], 6);
    }
    puffs.setEmitter(99, 0, 0, 0, false); // unknown: ignored
    expect(puffs.mesh.count).toBe(first + PUFFS.chimney.slots);
    scope.dispose();
  });

  it('drops emitters beyond capacity instead of overflowing', () => {
    const scope = new Scope('t');
    const puffs = createPuffs(scope, 'low');
    for (let i = 0; i < 200; i++) puffs.addEmitter(i, 0, 0, PUFF_CHIMNEY);
    puffs.finalize();
    expect(puffs.mesh.count).toBe(PUFFS.capacity.low);
    expect(puffs.stats().dropped).toBeGreaterThan(0);
    scope.dispose();
  });
});
