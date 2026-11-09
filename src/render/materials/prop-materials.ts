import type * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { Lod } from '../../geo/types.ts';
import { LOD_HANDOFF, type PropDef } from '../../content/props.ts';
import { fadeBand, hasLod1View } from '../../detail/reveal.ts';
import { NIGHT } from '../../content/lighting.ts';
import { PropFlag } from '../../world/prop-store.ts';
import {
  makeDepthMaterial,
  makeLitMaterial,
  type LitFeatures,
  type LitMaterial,
  type LitOptions,
} from './factory.ts';
import { cultureGateOf, cultureLampTheme, SEA_LAMPS } from '../../content/cultures/rhythm.ts';
import { GATES } from '../uniforms.ts';

/**
 * PropBatcher material provider: one LitMaterial (+ matching depth material) per
 * (def, LOD), all sharing the factory's one lit program and one depth program (their
 * fade distances / rim / bloom-in switches are per-material uniforms). Grounded/standing props get
 * the rim; ground cover does not. Every prop blooms in from `aAppear` and
 * dither-fades by its def's (or tier's) fade distances — per LOD since TASK-611 (detail/reveal.ts
 * `fadeBand`: LOD0 dithers in over the hand-over band, LOD1 draws behind it with a polygon offset).
 */
export interface PropMaterials {
  materialFor(def: PropDef, lod: Lod, groundCover: boolean): THREE.Material;
  depthMaterialFor(def: PropDef, lod: Lod, groundCover: boolean): THREE.Material | null;
  /**
   * TASK-407 far structure merge: the merged-mesh twin of a def's material at `lod` (LOD1: the
   * far merge, LOD0 (default): the near merge, TASK-476, and static cable meshes; same program, `uMarMerged` on). Defs whose
   * materials agree on every per-material uniform and state share one twin; `key` names that class.
   */
  mergedFor(def: PropDef, lod?: Lod): MergedMaterials;
}

export interface MergedMaterials {
  key: string;
  material: THREE.Material;
  depth: THREE.Material;
}

export function propFeatures(def: PropDef, groundCover: boolean): LitFeatures {
  return {
    instanced: true,
    bloomIn: true,
    dither: true,
    wind: (def.flags & PropFlag.windy) !== 0,
    emissive: true,
    rim: !groundCover && (def.flags & PropFlag.groundCover) === 0,
    // windmill blades turn about the hub (aSpin); same program, the branch keys off aSpin.w
    spin: def.geo === 'windmill',
  };
}

/**
 * Night-lamp mode of a def's material: static instances switch on one by one; houses lose some
 * windows late. Culture lamp sets (TASK-430, content/cultures/rhythm.ts) follow their island's
 * clock instead (never late-off); time-gated defs get their shared gate uniform.
 */
function lampsOf(def: PropDef): Pick<LitOptions, 'gate'> & {
  lamps: { stagger: boolean; lateOff: boolean; culture: boolean | 'sea' };
} {
  const culture: boolean | 'sea' = SEA_LAMPS.defs.includes(def.id)
    ? 'sea'
    : cultureLampTheme(def.id) !== null;
  const g = cultureGateOf(def.id);
  return {
    lamps: { stagger: true, lateOff: !culture && !NIGHT.alwaysOn.includes(def.geo), culture },
    ...(g ? { gate: GATES[g] } : {}),
  };
}

/** LOD1 of a def with a far view draws behind its LOD0 (the hand-over cross-fade, TASK-611). */
function offsetBehind(m: THREE.Material, def: PropDef, lod: Lod): void {
  if (lod !== 1 || !hasLod1View(def)) return;
  m.polygonOffset = true;
  m.polygonOffsetFactor = LOD_HANDOFF.polygonOffset[0];
  m.polygonOffsetUnits = LOD_HANDOFF.polygonOffset[1];
}

export function createPropMaterials(scope: Scope): PropMaterials {
  const lit = new Map<string, LitMaterial>();
  const depth = new Map<string, THREE.Material>();
  const key = (def: PropDef, lod: Lod, gc: boolean): string => `${def.id}:${lod}:${gc ? 1 : 0}`;
  const get = (def: PropDef, lod: Lod, gc: boolean): LitMaterial => {
    const k = key(def, lod, gc);
    let m = lit.get(k);
    if (!m) {
      const [near, far] = fadeBand(def, lod, gc);
      m = scope.add(
        makeLitMaterial(propFeatures(def, gc), {
          fadeNear: near,
          fadeFar: far,
          name: `prop:${k}`,
          // static instances: lights switch on one by one; houses lose some windows late
          ...lampsOf(def),
        }),
      );
      offsetBehind(m, def, lod);
      lit.set(k, m);
    }
    return m;
  };
  const merged = new Map<string, MergedMaterials>();
  return {
    materialFor: get,
    mergedFor(def, lod = 0) {
      // every per-material uniform of a (non-ground-cover instance's) prop material: fade, lamp
      // late-off, rim (bloom-in is on for all of them), and the hand-over polygon offset
      const [near, far] = fadeBand(def, lod, false);
      const { lamps, gate } = lampsOf(def);
      const features = propFeatures(def, false);
      const behind = lod === 1 && hasLod1View(def);
      const key =
        `${near}:${far}:${lamps.lateOff ? 1 : 0}:${features.rim ? 1 : 0}${behind ? ':o' : ''}` +
        (lamps.culture === 'sea' ? ':s' : lamps.culture ? ':c' : '') +
        (gate ? `:g${cultureGateOf(def.id)}` : '');
      let m = merged.get(key);
      if (!m) {
        const material = scope.add(
          makeLitMaterial(features, {
            fadeNear: near,
            fadeFar: far,
            name: `prop:merged:${key}`,
            lamps,
            gate,
            merged: true,
          }),
        );
        offsetBehind(material, def, lod);
        const depth = scope.add(makeDepthMaterial(features, material.fade, true));
        merged.set(key, (m = { key, material, depth }));
      }
      return m;
    },
    depthMaterialFor(def, lod, gc) {
      if (gc) return null; // ground cover does not cast map shadows (contact blobs only)
      const k = key(def, lod, gc);
      let d = depth.get(k);
      if (!d) {
        d = scope.add(makeDepthMaterial(propFeatures(def, gc), get(def, lod, gc).fade));
        depth.set(k, d);
      }
      return d;
    },
  };
}
