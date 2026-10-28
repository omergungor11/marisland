import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import type { System } from '../core/loop.ts';
import { buildGalleryScene } from '../geo/index.ts';
import { SAND } from '../content/palette.ts';
import { CODING_M22_SHOWCASE_IDS } from '../content/props-themes/coding.ts';
import { QA_M24_PROP_IDS } from '../content/props-themes/qa-proving.ts';
import { QA_M30_PROP_IDS } from '../content/props-themes/qa-customs.ts';
import { HQ_MARINA_PROP_IDS } from '../content/props-themes/hq-marina.ts';
import { DEVOPS_M25_PROP_IDS } from '../content/props-themes/devops-m25.ts';
import { DEVOPS_M26_PROP_IDS } from '../content/props-themes/devops-m26.ts';
import { M20_PROP_IDS } from '../content/props-themes/m20.ts';
import { M22_MARKETING_PROP_IDS } from '../content/themes/marketing.ts';
import type { CameraWorld } from '../camera/controls.ts';
import type { TestScene } from './test-scene.ts';

/**
 * Def ids of the `?ids=` query: `m20` = the M20 HQ / Design kits (TASK-465), `coding22` = the M22 Coding
 * quick wins (TASK-479), `m22` = the Marketing quick-win defs (TASK-481), else a comma list of def ids;
 * none = every def.
 */
function showcaseIds(): readonly string[] | undefined {
  const raw = new URLSearchParams(globalThis.location?.search ?? '').get('ids');
  if (!raw) return undefined;
  if (raw === 'coding22') return CODING_M22_SHOWCASE_IDS;
  if (raw === 'm22') return M22_MARKETING_PROP_IDS;
  if (raw === 'qa24') return QA_M24_PROP_IDS;
  if (raw === 'qa30') return QA_M30_PROP_IDS;
  if (raw === 'marina') return HQ_MARINA_PROP_IDS;
  if (raw === 'devops25') return DEVOPS_M25_PROP_IDS;
  if (raw === 'devops26') return DEVOPS_M26_PROP_IDS;
  return raw === 'm20' ? M20_PROP_IDS : raw.split(',');
}

/** `?gallery=1`: every prop def × variant × LOD on a sand plane with the default light rig. */
export function buildGallery(scope: Scope): TestScene {
  const group = new THREE.Group();
  const g = buildGalleryScene(showcaseIds());
  group.add(g.group);
  scope.defer(() => {
    g.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  });
  const box = new THREE.Box3().setFromObject(g.group);
  const ground = new THREE.Mesh(
    scope.add(new THREE.PlaneGeometry(400, 400)),
    scope.add(new THREE.MeshLambertMaterial({ color: new THREE.Color(SAND.dry) })),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  g.group.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  const sun = new THREE.DirectionalLight(new THREE.Color('#FFF6E5'), 3);
  sun.position.set(40, 80, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 300;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  group.add(sun, sun.target);
  group.add(new THREE.HemisphereLight(new THREE.Color('#CFEAFF'), new THREE.Color('#B9D08A'), 1.2));
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const cameraWorld: CameraWorld = {
    centerX: cx,
    centerZ: cz,
    radius: 200,
    islands: g.items.map((it, i) => ({
      name: `${it.id}${it.variant}L${it.lod}`,
      cx: it.x,
      cz: it.z,
      radius: 3,
      peakY: 2,
      anchors: {},
      index: i,
    })),
    heightAt: () => 0,
  };
  const system: System = { name: 'gallery' };
  return { group, system, hash: 'gallery', cameraWorld };
}
