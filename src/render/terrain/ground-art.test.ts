import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../world/index.ts';
import { THEME_IDS, heightAt } from '../../world/types.ts';
import { CARPET, COMPASS_MOSAIC, PRISM_POOLS } from '../../content/ground-art.ts';
import { groundArtUniforms } from './ground-art.ts';

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
