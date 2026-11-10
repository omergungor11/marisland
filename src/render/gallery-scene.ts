import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import type { System } from '../core/loop.ts';
import { buildGalleryScene } from '../geo/index.ts';
import { SAND } from '../content/palette.ts';
import { CODING_M22_SHOWCASE_IDS } from '../content/props-themes/coding.ts';
import { QA_M24_PROP_IDS } from '../content/props-themes/qa-proving.ts';
import { QA_M30_PROP_IDS } from '../content/props-themes/qa-customs.ts';
import { MARINA_QUAY_PROP_IDS } from '../content/props-themes/hq-horseshoe.ts';
import { HQ_MARINA_PROP_IDS } from '../content/props-themes/hq-marina.ts';
import { DEVOPS_M25_PROP_IDS } from '../content/props-themes/devops-m25.ts';
import { DEVOPS_M26_PROP_IDS } from '../content/props-themes/devops-m26.ts';
import { MARKETING_M27_PROP_IDS } from '../content/props-themes/marketing-m27.ts';
import { RESEARCH_M28_PROP_IDS } from '../content/props-themes/research-m28.ts';
import { CODING_M33_PROP_IDS } from '../content/props-themes/coding-m33.ts';
import { QA_COASTER_PROP_IDS } from '../content/props-themes/qa-coaster.ts';
import { LUNA_PROP_IDS } from '../content/props-themes/marketing-luna.ts';
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
  if (raw === 'quay') return MARINA_QUAY_PROP_IDS;
  if (raw === 'devops25') return DEVOPS_M25_PROP_IDS;
  if (raw === 'devops26') return DEVOPS_M26_PROP_IDS;
  if (raw === 'marketing27') return MARKETING_M27_PROP_IDS;
  if (raw === 'research28') return RESEARCH_M28_PROP_IDS;
  if (raw === 'coding33') return CODING_M33_PROP_IDS;
  if (raw === 'coaster') return QA_COASTER_PROP_IDS;
  if (raw === 'luna') return LUNA_PROP_IDS;
  return raw === 'm20' ? M20_PROP_IDS : raw.split(',');
}

/**
 * `?night=1` (TASK-670): the lamp-class vertices (the `emissive` attribute's base >= 1) drawn unlit over
 * the dimmed rig, so a kit's night look can be judged without a world. `?sea=1`: a turquoise floor.
 */
function glowOverlay(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    vertexShader: `attribute float emissive; varying float vE; varying vec3 vC;
      void main() { vE = emissive; vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying float vE; varying vec3 vC;
      void main() {
        if (mod(vE + 0.5, 8.0) - 0.5 < 0.75) discard;
        gl_FragColor = vec4(min(vC * 1.7 + 0.08, vec3(1.0)), 1.0);
        #include <colorspace_fragment>
      }`,
  });
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
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  const night = q.get('night') === '1';
  if (night) {
    const glow = scope.add(glowOverlay());
    g.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = new THREE.Mesh(o.geometry, glow);
        m.position.copy(o.position);
        group.add(m);
      }
    });
  }
  const box = new THREE.Box3().setFromObject(g.group);
  const ground = new THREE.Mesh(
    scope.add(new THREE.PlaneGeometry(400, 400)),
    scope.add(
      new THREE.MeshLambertMaterial({
        color: new THREE.Color(q.get('sea') === '1' ? '#4FB8C4' : SAND.dry),
      }),
    ),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  g.group.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  const sun = new THREE.DirectionalLight(
    new THREE.Color(night ? '#8FA6E8' : '#FFF6E5'),
    night ? 0.5 : 3,
  );
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
  group.add(
    new THREE.HemisphereLight(
      new THREE.Color(night ? '#3A4A8A' : '#CFEAFF'),
      new THREE.Color(night ? '#1A2040' : '#B9D08A'),
      night ? 0.5 : 1.2,
    ),
  );
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
