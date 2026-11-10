import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../world/index.ts';
import { THEME_IDS, heightAt } from '../../world/types.ts';
import { CARPET, COMPASS_MOSAIC, MARINA_QUAY, PRISM_POOLS } from '../../content/ground-art.ts';
import { MARINA_SITE } from '../../content/themes/hq-horseshoe-site.ts';
import { groundArtUniforms, marinaUniforms } from './ground-art.ts';

/** Ground art uniforms (TASK-468): compass rays = the HQ gates' bearings, prism pools = the arches. */
describe('ground art uniforms', () => {
  const world = generateWorld(1001);
  const u = groundArtUniforms(world);

  it('centres the compass on the HQ compass district and aims one ray per gate', () => {
    const d = world.districts.find((x) => x.kind === 'compass')!;
    const c = u.uCompass.value as THREE.Vector4;
    expect([c.x, c.y, c.z]).toEqual([d.x, d.z, d.w / 2]);
    const gates = world.fixtures.filter(
      (f) => f.defId === 'cultureGate' && f.islandId === d.islandId,
    );
    const rays = (u.uCompassRay.value as THREE.Vector4[]).filter((r) => r.w > 0.5);
    expect(rays.length).toBe(Math.min(gates.length, COMPASS_MOSAIC.maxRays));
    const cols = u.uCompassCol.value as THREE.Color[];
    gates.slice(0, rays.length).forEach((g, k) => {
      const b = Math.hypot(g.x - d.x, g.z - d.z);
      expect(rays[k].x).toBeCloseTo((g.x - d.x) / b, 5);
      expect(rays[k].y).toBeCloseTo((g.z - d.z) / b, 5);
      const accent = COMPASS_MOSAIC.accents[THEME_IDS[g.variant ?? 0]];
      expect(cols[k].equals(new THREE.Color(accent))).toBe(true);
    });
  });

  it('puts a pool slot on every prism arch', () => {
    const arches = world.fixtures.filter((f) => f.defId === 'prismArch');
    const on = (u.uPrism.value as THREE.Vector4[]).filter((p) => p.w > 0.5);
    expect(on.length).toBe(Math.min(arches.length, PRISM_POOLS.maxArches));
    on.forEach((p, k) => expect([p.x, p.y]).toEqual([arches[k].x, arches[k].z]));
  });

  it('lays the Marketing carpet over the Ad Boulevard (TASK-481): centre, heading, size, height', () => {
    const d = world.districts.find((x) => x.kind === 'carpet');
    expect(d).toBeDefined();
    if (!d) return;
    const c = u.uCarpet.value as THREE.Vector4;
    const dim = u.uCarpetDim.value as THREE.Vector4;
    expect([c.x, c.y]).toEqual([d.x, d.z]);
    expect(c.z).toBeCloseTo(Math.cos(d.rotY), 6);
    expect(c.w).toBeCloseTo(Math.sin(d.rotY), 6);
    expect(dim.x).toBeCloseTo(d.w / 2 + CARPET.edge, 6);
    expect(dim.y).toBeCloseTo(d.d / 2, 6);
    expect(dim.w).toBe(1);
    expect(dim.z).toBeCloseTo(heightAt(world.height, d.x, d.z), 6);
  });
});

/** HQ harbour quay (TASK-675, D-173): the open crescent's centre line, land edge, gaps and stubs. */
describe('marina quay uniforms', () => {
  const segDist = (p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2): number => {
    const ab = b.clone().sub(a);
    const t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-9)));
    return p.distanceTo(a.clone().addScaledVector(ab, t));
  };

  it.each([1001, 1, 42])('follows the quay from horn to horn on seed %i', (seed) => {
    const w = generateWorld(seed);
    const A = w.islands.find((i) => i.anchors.marinaQuay1)!.anchors;
    const u = marinaUniforms(w);
    const info = u.uMarinaInfo.value as THREE.Vector4;
    const q = (u.uMarinaQ.value as THREE.Vector4[]).slice(0, info.x);
    let K = 0;
    while (A[`marinaQuay${K + 1}`]) K++;
    expect(info.x).toBeGreaterThan(10);
    expect(info.x).toBeLessThanOrEqual(MARINA_QUAY.maxPoints);
    expect([q[0].x, q[0].y]).toEqual([A.marinaQuay0.x, A.marinaQuay0.z]);
    expect([q[info.x - 1].x, q[info.x - 1].y]).toEqual([
      A[`marinaQuay${K}`].x,
      A[`marinaQuay${K}`].z,
    ]);
    // every anchor within a few tenths of the shader's (thinned) line
    const line = q.map((p) => new THREE.Vector2(p.x, p.y));
    for (let k = 0; k <= K; k++) {
      const p = new THREE.Vector2(A[`marinaQuay${k}`].x, A[`marinaQuay${k}`].z);
      let d = Infinity;
      for (let j = 0; j + 1 < line.length; j++) d = Math.min(d, segDist(p, line[j], line[j + 1]));
      expect(d).toBeLessThan(0.4);
    }
    const W2 = A.marinaQuaySize.x / 2;
    expect(info.y).toBe(A.marinaQuaySize.z);
    expect(info.z).toBeCloseTo(W2 + MARINA_SITE.ring.innerFlat - MARINA_QUAY.edgeInset, 6);
    // most of the quay is level deck, paved at least over the promenade, never past the house backs
    const deck = q.filter((p) => p.w === 1);
    expect(deck.length / q.length).toBeGreaterThan(0.6);
    for (const p of deck) {
      expect(p.z).toBeLessThanOrEqual(W2 - MARINA_SITE.ring.promenade + 1e-6);
      expect(p.z).toBeGreaterThanOrEqual(
        W2 - A.marinaQuaySize.x - MARINA_SITE.ring.edgeFlat - 1e-6,
      );
    }
    // the stubs: root on the quay's end, head len out
    const st = u.uMarinaStub.value as THREE.Vector4[];
    expect([st[0].x, st[0].y]).toEqual([A.marinaStubL.x, A.marinaStubL.z]);
    expect(Math.hypot(st[0].z - st[0].x, st[0].w - st[0].y)).toBeCloseTo(A.marinaStubSize.x, 5);
    expect(Math.hypot(st[1].z - st[1].x, st[1].w - st[1].y)).toBeCloseTo(A.marinaStubSize.z, 5);
  });

  it('is inert on a seed without the quay (57: the comb marina)', () => {
    const w = generateWorld(57);
    expect(w.islands.some((i) => i.anchors.marinaQuay0)).toBe(false);
    const u = marinaUniforms(w);
    expect((u.uMarinaInfo.value as THREE.Vector4).x).toBe(0);
  });
});
