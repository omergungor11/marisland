import type * as THREE from 'three';
import { createRng } from '../core/rng.ts';
import { buildCoasterSiteTrack } from '../geo/themes/qa-coaster.ts';
import type { Lod } from '../geo/types.ts';
import type { Quality } from '../core/params.ts';
import { coasterKitOf, coasterKitToWorld, type CoasterKit } from '../world/coaster-kit.ts';
import { heightAt, type WorldData } from '../world/types.ts';

/**
 * The real track of a world (TASK-541, D-122): a registry def can't receive points, so the batcher asks
 * this for the `coasterTrack` def's geometry (`BatcherDeps.geometryOverride`) and treats it as any prop
 * from there: its cache hands it to the world scope (disposed with the world), the tier rules, LOD
 * groups, far / near merge and shadow pass all apply. The `coasterTrack` def keeps building the FIXTURE
 * (gallery, tests). The prop stands at the site's origin at the site's scale, so this is the kit frame.
 * Low quality holds no LOD0 track: both slots share the LOD1 mesh (0.46 MB less on a line already over).
 */
export function coasterTrackGeometry(
  world: WorldData,
  quality: Quality = 'medium',
): (id: string, lod: Lod) => THREE.BufferGeometry | null {
  const isl = world.islands.find((i) => i.theme === 'qa');
  const kit = isl ? coasterKitOf(isl) : null;
  let shared: THREE.BufferGeometry | null = null;
  const build = (k: CoasterKit, lod: Lod): THREE.BufferGeometry =>
    buildCoasterSiteTrack({
      kit: k,
      lod,
      rng: createRng(world.seed).fork('coasterTrack', lod),
      groundY: (x, z) => {
        const [wx, , wz] = coasterKitToWorld(k, x, 0, z);
        return (heightAt(world.height, wx, wz) - k.groundY) / k.scale;
      },
    });
  return (id, lod) => {
    if (id !== 'coasterTrack' || !kit) return null;
    if (quality === 'low') return (shared ??= build(kit, 1));
    return build(kit, lod);
  };
}
