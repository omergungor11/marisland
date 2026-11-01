import type * as THREE from 'three';
import { createRng } from '../core/rng.ts';
import { buildCoasterSiteTrack } from '../geo/themes/qa-coaster.ts';
import type { Lod } from '../geo/types.ts';
import { coasterKitOf, coasterKitToWorld } from '../world/coaster-kit.ts';
import { heightAt, type WorldData } from '../world/types.ts';

/**
 * The real track of a world (TASK-541, D-122): a registry def can't receive points, so the batcher asks
 * this for the `coasterTrack` def's geometry (`BatcherDeps.geometryOverride`) and treats it as any prop
 * from there: its cache hands it to the world scope (disposed with the world), the tier rules, LOD
 * groups, far / near merge and shadow pass all apply. The `coasterTrack` def keeps building the FIXTURE
 * (gallery, tests). The prop stands at the site's origin at the site's scale, so this is the kit frame.
 */
export function coasterTrackGeometry(
  world: WorldData,
): (id: string, lod: Lod) => THREE.BufferGeometry | null {
  const isl = world.islands.find((i) => i.theme === 'qa');
  const kit = isl ? coasterKitOf(isl) : null;
  return (id, lod) => {
    if (id !== 'coasterTrack' || !kit) return null;
    return buildCoasterSiteTrack({
      kit,
      lod,
      rng: createRng(world.seed).fork('coasterTrack', lod),
      groundY: (x, z) => {
        const [wx, , wz] = coasterKitToWorld(kit, x, 0, z);
        return (heightAt(world.height, wx, wz) - kit.groundY) / kit.scale;
      },
    });
  };
}
