import type * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { Lod } from '../../geo/types.ts';
import { TIER_FADE, type PropDef } from '../../content/props.ts';
import { NIGHT } from '../../content/lighting.ts';
import { PropFlag } from '../../world/prop-store.ts';
import {
  makeDepthMaterial,
  makeLitMaterial,
  type LitFeatures,
  type LitMaterial,
} from './factory.ts';

/**
 * PropBatcher material provider: one LitMaterial (+ matching depth material) per
 * (def, LOD), all sharing the factory's 4 programs. Grounded/standing props get
 * the rim; ground cover does not. Every prop blooms in from `aAppear` and
 * dither-fades by its def's (or tier's) fade distances.
 */
export interface PropMaterials {
  materialFor(def: PropDef, lod: Lod, groundCover: boolean): THREE.Material;
  depthMaterialFor(def: PropDef, lod: Lod, groundCover: boolean): THREE.Material | null;
}

export function propFeatures(def: PropDef, groundCover: boolean): LitFeatures {
  return {
    instanced: true,
    bloomIn: true,
    dither: true,
    wind: (def.flags & PropFlag.windy) !== 0,
    emissive: true,
    rim: !groundCover && (def.flags & PropFlag.groundCover) === 0,
    // windmill blades turn about the hub (aSpin); one extra program (+ its depth twin)
    spin: def.geo === 'windmill',
  };
}

export function createPropMaterials(scope: Scope): PropMaterials {
  const lit = new Map<string, LitMaterial>();
  const depth = new Map<string, THREE.Material>();
  const key = (def: PropDef, lod: Lod, gc: boolean): string => `${def.id}:${lod}:${gc ? 1 : 0}`;
  const get = (def: PropDef, lod: Lod, gc: boolean): LitMaterial => {
    const k = key(def, lod, gc);
    let m = lit.get(k);
    if (!m) {
      const [near, far] = def.fade ?? TIER_FADE[def.tier] ?? TIER_FADE[0];
      m = scope.add(
        makeLitMaterial(propFeatures(def, gc), {
          fadeNear: near,
          fadeFar: far,
          name: `prop:${k}`,
          // static instances: lights switch on one by one; houses lose some windows late
          lamps: { stagger: true, lateOff: !NIGHT.alwaysOn.includes(def.geo) },
        }),
      );
      lit.set(k, m);
    }
    return m;
  };
  return {
    materialFor: get,
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
