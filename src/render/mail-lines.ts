import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import { createRng } from '../core/rng.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../content/props.ts';
import { mailAnchorWorld, type Vec3Like } from '../content/props-themes/m20.ts';
import { DEVOPS_M25 } from '../content/themes/devops-m25.ts';
import { oreAnchorWorld } from '../content/themes/devops-m25-site.ts';
import { buildMailCable } from '../geo/themes/culture-m20-hq.ts';
import { buildOreCable } from '../geo/themes/devops-m25.ts';
import { PropFlag, type PropStore } from '../world/prop-store.ts';
import type { PropMaterials } from './materials/prop-materials.ts';

/**
 * HQ mail lines (TASK-466): the cable between a mail line's two pylons (`mailLine` v0 = high end,
 * v1 = low end, paired per island by distance) as one static merged mesh of the world scope, on
 * the prop lit program's merged twin (TASK-407 `uMarMerged`: every vertex carries its own origin
 * in `aSpin.xyz`, so the dither fade works per vertex). The same pairs feed the sack mover
 * (render/culture-movers.ts `mailScene`) through `mailLinePairs`.
 * TASK-507 (D13): the DevOps ore cableway (`mailLine` v2 mid pylons between two v3 end stations)
 * strings its spans into the same mesh (`oreLines`; render/movers.ts runs the buckets on them).
 */

export interface MailLinePair {
  islandId: number;
  /** Cable anchors in world space: high end → low end (the sacks slide a → b). */
  a: Vec3Like;
  b: Vec3Like;
  /** Store indices of the two pylons. */
  hi: number;
  lo: number;
}

/** Every high pylon paired with the nearest low pylon of its island (unpaired ones are skipped). */
export function mailLinePairs(store: PropStore): MailLinePair[] {
  const def = PROP_DEF_INDEX.mailLine;
  if (def === undefined) return [];
  const his: number[] = [];
  const los: number[] = [];
  for (let i = 0; i < store.count; i++) {
    if (store.defId[i] !== def || (store.flags[i] & PropFlag.removed) !== 0) continue;
    // v2 / v3 are the DevOps ore pylons (oreLines)
    if (store.variant[i] >= DEVOPS_M25.ore.pylonVariants[0]) continue;
    (store.variant[i] % 2 === 0 ? his : los).push(i);
  }
  const out: MailLinePair[] = [];
  const used = new Set<number>();
  for (const hi of his) {
    let best = -1;
    let bd = Infinity;
    for (const lo of los) {
      if (used.has(lo) || store.islandId[lo] !== store.islandId[hi]) continue;
      const d = Math.hypot(store.x[lo] - store.x[hi], store.z[lo] - store.z[hi]);
      if (d < bd) {
        bd = d;
        best = lo;
      }
    }
    if (best < 0) continue;
    used.add(best);
    const at = (i: number, v: number): Vec3Like =>
      mailAnchorWorld(v, { x: store.x[i], y: store.y[i], z: store.z[i] }, store.rotY[i]);
    out.push({ islandId: store.islandId[hi], a: at(hi, 0), b: at(best, 1), hi, lo: best });
  }
  return out;
}

/** An ore cableway: its spans quarry → furnace (world cable seats), the furnace hopper. */
export interface OreLine {
  islandId: number;
  spans: { a: Vec3Like; b: Vec3Like }[];
}

/**
 * The ore cableways of the store: per island the mailLine v3 end stations and the v2 pylons
 * between them in order along the line (the furnace end = the one nearer a `foundry` hall).
 */
export function oreLines(store: PropStore): OreLine[] {
  const def = PROP_DEF_INDEX.mailLine;
  const hall = PROP_DEF_INDEX.foundry;
  const [v2, v3] = DEVOPS_M25.ore.pylonVariants;
  if (def === undefined) return [];
  const by = new Map<number, number[]>();
  for (let i = 0; i < store.count; i++) {
    if (store.defId[i] !== def || (store.flags[i] & PropFlag.removed) !== 0) continue;
    if (store.variant[i] !== v2 && store.variant[i] !== v3) continue;
    const l = by.get(store.islandId[i]) ?? [];
    l.push(i);
    by.set(store.islandId[i], l);
  }
  const out: OreLine[] = [];
  for (const [islandId, idx] of by) {
    const ends = idx.filter((i) => store.variant[i] === v3);
    if (ends.length !== 2) continue;
    // the furnace end: nearer a foundry hall of the island
    const near = (i: number): number => {
      let d = Infinity;
      for (let j = 0; j < store.count; j++)
        if (store.defId[j] === hall && store.islandId[j] === islandId)
          d = Math.min(d, Math.hypot(store.x[j] - store.x[i], store.z[j] - store.z[i]));
      return d;
    };
    const [q, f] = near(ends[0]) <= near(ends[1]) ? [ends[1], ends[0]] : ends;
    const ux = store.x[f] - store.x[q];
    const uz = store.z[f] - store.z[q];
    const along = (i: number): number =>
      (store.x[i] - store.x[q]) * ux + (store.z[i] - store.z[q]) * uz;
    const chain = [
      q,
      ...idx.filter((i) => store.variant[i] === v2).sort((a, b) => along(a) - along(b)),
      f,
    ];
    // store yaw → worldgen heading (local +z = (cos rotY, sin rotY))
    const seat = (i: number, back: boolean): Vec3Like =>
      oreAnchorWorld(
        store.variant[i],
        { x: store.x[i], y: store.y[i], z: store.z[i] },
        Math.PI / 2 - store.rotY[i],
        back,
      );
    const spans: OreLine['spans'] = [];
    for (let k = 0; k + 1 < chain.length; k++)
      spans.push({
        a: seat(chain[k], false),
        b: seat(chain[k + 1], store.variant[chain[k + 1]] === v2),
      });
    out.push({ islandId, spans });
  }
  return out;
}

export interface MailCablesView {
  mesh: THREE.InstancedMesh | null;
  pairs: MailLinePair[];
}

/** The cables of every mail line pair as one mesh (null when the world has none). */
export function createMailCables(
  store: PropStore,
  seed: number,
  scope: Scope,
  materials: PropMaterials,
): MailCablesView {
  const pairs = mailLinePairs(store);
  const ore = oreLines(store).flatMap((l) => l.spans);
  if (!pairs.length && !ore.length) return { mesh: null, pairs };
  const parts = [
    ...pairs.map((p, k) => buildMailCable(createRng(seed).fork('mail-cable', k), p.a, p.b, 0)),
    ...ore.map((p, k) => buildOreCable(createRng(seed).fork('ore-cable', k), p.a, p.b, 0)),
  ];
  const src = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const n = src.reduce((a, g) => a + g.getAttribute('position').count, 0);
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const spin = new Float32Array(n * 4);
  const emi = new Float32Array(n);
  const wind = new Float32Array(n);
  let o = 0;
  for (const g of src) {
    const P = g.getAttribute('position');
    const N = g.getAttribute('normal');
    const C = g.getAttribute('color');
    const AO = g.getAttribute('ao');
    const E = g.getAttribute('emissive');
    const W = g.getAttribute('wind');
    for (let v = 0; v < P.count; v++, o++) {
      const x = P.getX(v);
      const y = P.getY(v);
      const z = P.getZ(v);
      pos.set([x, y, z], o * 3);
      nor.set([N.getX(v), N.getY(v), N.getZ(v)], o * 3);
      const ao = AO ? AO.getX(v) : 1;
      col.set([C.getX(v) * ao, C.getY(v) * ao, C.getZ(v) * ao], o * 3);
      // own origin: the dither fade and the hover hash read it (merged mode)
      spin.set([x, y, z, 0], o * 4);
      emi[o] = E ? E.getX(v) : 0;
      wind[o] = W ? W.getX(v) : 0;
    }
    g.dispose();
  }
  const geo = scope.add(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSpin', new THREE.BufferAttribute(spin, 4));
  geo.setAttribute('emissive', new THREE.BufferAttribute(emi, 1));
  geo.setAttribute('wind', new THREE.BufferAttribute(wind, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  const mats = materials.mergedFor(PROP_DEFS[PROP_DEF_INDEX.mailLine]);
  // an InstancedMesh of one identity instance: the instanced lit program, no new one
  const mesh = new THREE.InstancedMesh(geo, mats.material, 1);
  mesh.setMatrixAt(0, new THREE.Matrix4());
  mesh.computeBoundingSphere();
  mesh.name = 'mail-cables';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  scope.add(mesh);
  return { mesh, pairs };
}
