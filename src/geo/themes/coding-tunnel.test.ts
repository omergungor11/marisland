/** TASK-498: Coding wind tunnel + fan: defs, tiers, budgets, spin / sock tags, the plan places both on the anchor. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SOCK_LIFT } from '../../content/activity.ts';
import { cultureCapOverride } from '../../content/budgets.ts';
import { CODING_CULTURE } from '../../content/cultures/coding.ts';
import { validateCultures } from '../../content/cultures/validate.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { CODING_TUNNEL_PROP_DEFS } from '../../content/props-themes/coding-tunnel.ts';
import { WIND_TUNNEL } from '../../content/themes/coding-tunnel.ts';
import { isLargeStructure } from '../../render/props/batcher.ts';
import { generateWorld } from '../../world/index.ts';
import { buildProp } from '../registry.ts';

const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;
const size = (g: THREE.BufferGeometry): THREE.Vector3 =>
  (g.boundingBox as THREE.Box3).getSize(new THREE.Vector3());

describe('TASK-498 wind tunnel defs', () => {
  it('two defs at the very end of PROP_DEFS: tunnel tier 1, fan tier 2; Coding cap 22 / 2 (M33 +10)', () => {
    expect(CODING_TUNNEL_PROP_DEFS.map((d) => d.id)).toEqual(['windTunnel', 'tunnelFan']);
    expect(PROP_DEF_INDEX.tunnelFan).toBe(PROP_DEF_INDEX.windTunnel + 1);
    expect(PROP_DEF_INDEX.windTunnel).toBeGreaterThan(PROP_DEF_INDEX.dropTower);
    expect(PROP_DEFS[PROP_DEF_INDEX.windTunnel].tier).toBe(1);
    expect(PROP_DEFS[PROP_DEF_INDEX.tunnelFan].tier).toBe(2);
    expect(cultureCapOverride.coding).toEqual({ defs: 22, tier1: 2 }); // M33 TASK-543 (D-117): 12 + 10
    expect(CODING_CULTURE.kit).toHaveLength(22);
    expect(CODING_CULTURE.kit[11].id).toBe('tunnelFan');
    expect(validateCultures([CODING_CULTURE])).toEqual([]);
  });

  it('the tunnel is a 14 u half tube drawn from T0 by size, under its triangle budget', () => {
    const g = buildProp('windTunnel', 1001, 0, 0);
    const s = size(g);
    expect(s.x).toBeGreaterThanOrEqual(14);
    expect(s.x).toBeLessThanOrEqual(15.5);
    expect(s.y).toBeGreaterThan(2.5);
    expect(isLargeStructure(PROP_DEFS[PROP_DEF_INDEX.windTunnel], s)).toBe(true);
    expect(tris(g)).toBeLessThanOrEqual(4500);
    expect(tris(buildProp('windTunnel', 1001, 0, 1))).toBeLessThanOrEqual(0.3 * tris(g));
  });

  it('five windsocks carry the lift tag 5 + k / 16, each about its ring', () => {
    const g = buildProp('windTunnel', 1001, 0, 0);
    const sp = g.getAttribute('aSpin').array as Float32Array;
    const wind = g.getAttribute('wind').array as Float32Array;
    const tags = new Set<number>();
    for (let i = 0; i < sp.length / 4; i++) {
      const w = sp[i * 4 + 3];
      if (w === 0) continue;
      tags.add(Math.round(((w - 5) / SOCK_LIFT.step) * 1e3) / 1e3);
      expect(wind[i]).toBe(0);
    }
    expect([...tags].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(WIND_TUNNEL.socks.xs).toHaveLength(5);
  });

  it('the fan spins on the shared tag (1), 3 u wide, with a hub hook', () => {
    const g = buildProp('tunnelFan', 1001, 0, 0);
    const sp = g.getAttribute('aSpin').array as Float32Array;
    let spun = 0;
    for (let i = 0; i < sp.length / 4; i++) if (sp[i * 4 + 3] === 1) spun++;
    expect(spun).toBeGreaterThan(0);
    expect(g.userData.hubs).toHaveLength(1);
    const s = size(g);
    expect(s.x).toBeGreaterThanOrEqual(3);
    expect(s.x).toBeLessThanOrEqual(3.6);
  });
});

describe('TASK-498 placement', () => {
  it('seed 1001: the tunnel stands on the anchor, the fan at the upwind mouth', () => {
    const w = generateWorld(1001);
    const isl = w.islands.find((i) => i.theme === 'coding')!;
    const a = isl.anchors.windTunnel;
    const t = w.fixtures.find((f) => f.defId === 'windTunnel' && f.islandId === isl.id)!;
    const fan = w.fixtures.find((f) => f.defId === 'tunnelFan' && f.islandId === isl.id)!;
    expect(t.x).toBe(a.x);
    expect(t.z).toBe(a.z);
    // tunnel local +x is the axis (cos a, sin a); the fan sits upwind of the centre on that axis
    const ax = { x: Math.cos(a.rotY), z: Math.sin(a.rotY) };
    expect(Math.cos(t.rotY - Math.PI / 2)).toBeCloseTo(ax.x, 6);
    expect((fan.x - a.x) * ax.x + (fan.z - a.z) * ax.z).toBeLessThan(-6);
  });
});
