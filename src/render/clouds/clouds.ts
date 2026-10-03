import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { WorldData } from '../../world/types.ts';
import { heightAt } from '../../world/types.ts';
import type { Quality } from '../../core/params.ts';
import type { EnvState } from '../../env/env-state.ts';
import { createRng } from '../../core/rng.ts';
import { CLOUDS } from '../../content/anim.ts';
import { CLOUD } from '../../content/palette.ts';
import { SHARED } from '../uniforms.ts';
import {
  cellBlob,
  edgeFade,
  fieldForSeed,
  windOffset,
  type CloudFieldParams,
} from './cloud-field.ts';
import { buildCloudGeometry } from './cloud-geometry.ts';
import { CLOUD_FRAG, CLOUD_VERT } from './cloud.glsl.ts';
import { createPuffs, PUFF_SPRING, PUFF_STEAM, type Puffs } from '../particles/puffs.ts';

/**
 * TASK-153 — clouds + aligned cloud shadows (ARCHITECTURE §7 "Clouds", ART_BIBLE §3).
 * Clouds sit at the peaks of the periodic cloud field (`cloud-field.ts`), advected by
 * the wind; terrain/water/props evaluate the same field in GLSL (`marCloudShadow`)
 * so the soft shadows line up without a shadow map. Also owns the puff system
 * (volcano steam, hot spring; chimneys are added by the caller via `puffs`).
 *
 * Cost: 3 InstancedMeshes (one per variant, ≤ 10 instances total, 0.9–1.6k tris each
 * variant) + 1 puff InstancedMesh → ≤ 4 draw calls, 2 programs.
 */
export interface CloudsView {
  group: THREE.Group;
  update(time: number, env: EnvState, cameraPos: THREE.Vector3, tier: number): void;
  /** Cloud-shadow parameters for terrain/water/props (= SHARED.uCloudShadow): xy = wind offset, z = coverage, w = strength. */
  shadowParams: { value: THREE.Vector4 };
  /** Smoke/steam puffs (chimney emitters are added later via `puffs.addEmitter` + `finalize`). */
  puffs: Puffs;
  /** The field (for tests / debug / alignment checks). */
  field: CloudFieldParams;
  /** Current visibility 0..1 (tier fade). */
  visibility(): number;
}

interface Slot {
  mesh: THREE.InstancedMesh;
  index: number;
  ix: number;
  iz: number;
  jx: number;
  jz: number;
  width: number;
  yaw: number;
  alt: number;
  phase: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _off = { x: 0, z: 0 };

export function createClouds(world: WorldData, quality: Quality, scope: Scope): CloudsView {
  const rng = createRng(world.seed).fork('clouds');
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const i of world.islands) {
    minX = Math.min(minX, i.minX);
    maxX = Math.max(maxX, i.maxX);
    minZ = Math.min(minZ, i.minZ);
    maxZ = Math.max(maxZ, i.maxZ);
  }
  const cx = Number.isFinite(minX) ? (minX + maxX) / 2 : 0;
  const cz = Number.isFinite(minZ) ? (minZ + maxZ) / 2 : 0;
  const field = fieldForSeed(world.seed, cx, cz);
  const tile = field.cellSize * field.cells;
  SHARED.uCloudSeed.value.set(field.salt, field.threshold, field.cellSize, field.cells);

  const group = new THREE.Group();
  group.name = 'clouds';

  const defines: Record<string, string> = {};
  if (quality === 'low') defines.MAR_DIRECT = '';
  const mat = scope.add(
    new THREE.ShaderMaterial({
      name: 'clouds',
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      defines,
      uniforms: {
        uSunDir: SHARED.uSunDir,
        uSunColor: SHARED.uSunColor,
        uSunIntensity: SHARED.uSunIntensity,
        uHemiSky: SHARED.uHemiSky,
        uFogColor: SHARED.uFogColor,
        uFogDensity: SHARED.uFogDensity,
        uCameraPos: SHARED.uCameraPos,
        uNight: SHARED.uNight,
        uGolden: SHARED.uGolden,
        uDebugMask: SHARED.uDebugMask,
        uTop: { value: new THREE.Color(CLOUD.top) },
        uBelly: { value: new THREE.Color(CLOUD.belly) },
        uBellyNight: { value: new THREE.Color(CLOUD.bellyNight) },
      },
      fog: false,
      lights: false,
    }),
  );

  // active cells grouped by variant → one InstancedMesh per variant
  const byVariant: Slot[][] = [[], [], []];
  for (let iz = 0; iz < field.cells; iz++)
    for (let ix = 0; ix < field.cells; ix++) {
      const b = cellBlob(field, ix, iz);
      if (!b.active) continue;
      byVariant[b.variant].push({
        mesh: null as unknown as THREE.InstancedMesh,
        index: byVariant[b.variant].length,
        ix,
        iz,
        jx: b.jx,
        jz: b.jz,
        width: b.width,
        yaw: b.yaw,
        alt: b.alt,
        phase: rng.next() * Math.PI * 2,
      });
    }
  const slots: Slot[] = [];
  for (let v = 0; v < 3; v++) {
    const list = byVariant[v];
    if (list.length === 0) continue;
    const geo = scope.add(buildCloudGeometry(rng.fork('geo', v)));
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.name = `clouds:${v}`;
    mesh.frustumCulled = false; // ≤ 10 instances moving every frame
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    for (const s of list) {
      s.mesh = mesh;
      slots.push(s);
    }
    group.add(mesh);
  }

  // smoke & steam
  const puffs = createPuffs(scope, quality);
  for (const isl of world.islands) {
    if (isl.archetype !== 'emberpeak') continue;
    const cr = isl.anchors.crater;
    // the crater floor sits ~15 u below the rim: start just under the rim so the column
    // reads above it (W5: ≥ 15 u continuous) while the rim still hides the base
    if (cr) {
      const y = Math.max(heightAt(world.height, cr.x, cr.z) + 2, isl.peakY - 6);
      puffs.addEmitter(cr.x, y, cr.z, PUFF_STEAM);
    }
    const hs = isl.anchors.hotspring;
    if (hs) puffs.addEmitter(hs.x, heightAt(world.height, hs.x, hs.z) + 0.5, hs.z, PUFF_SPRING);
  }
  puffs.finalize();
  group.add(puffs.mesh);

  let vis = 1;
  let lastTime = Number.NaN;
  const B = CLOUDS.breathe;

  const update = (time: number, env: EnvState, cameraPos: THREE.Vector3, tier: number): void => {
    void cameraPos;
    const target = tier >= CLOUDS.hideTier ? 0 : 1;
    if (Number.isNaN(lastTime)) vis = target;
    else {
      const step = Math.max(0, time - lastTime) / CLOUDS.fade;
      vis = target > vis ? Math.min(target, vis + step) : Math.max(target, vis - step);
    }
    lastTime = time;

    const wind = SHARED.uWind.value;
    windOffset(field, wind.x, wind.y, time, _off);
    const eased = vis * vis * (3 - 2 * vis);
    for (const s of slots) {
      const rx =
        wrap(tile, (s.ix + s.jx - field.cells / 2) * field.cellSize + _off.x + tile / 2) - tile / 2;
      const rz =
        wrap(tile, (s.iz + s.jz - field.cells / 2) * field.cellSize + _off.z + tile / 2) - tile / 2;
      const edge = edgeFade(rx, rz, tile);
      const breathe = 1 + B.amp * Math.sin((time * 2 * Math.PI) / B.period + s.phase);
      const k = s.width * eased * edge;
      _p.set(field.centreX + rx, s.alt, field.centreZ + rz);
      _q.setFromAxisAngle(_up, s.yaw);
      _s.set(k * breathe, k * (2 - breathe), k * breathe);
      _m.compose(_p, _q, _s);
      s.mesh.setMatrixAt(s.index, _m);
    }
    for (const c of group.children)
      if (c instanceof THREE.InstancedMesh && c !== puffs.mesh) c.instanceMatrix.needsUpdate = true;
    group.visible = true;

    // shadows: projected along the sun; per-quality switch, off at night
    const sy = Math.max(env.sunDir.y, CLOUDS.minSunY);
    const day = (1 - env.night) * smoothstep01((env.sunDir.y - 0.02) / 0.2);
    SHARED.uCloudSun.value.set(
      -env.sunDir.x / sy,
      -env.sunDir.z / sy,
      field.centreX,
      field.centreZ,
    );
    SHARED.uCloudShadow.value.set(
      _off.x,
      _off.z,
      CLOUDS.shadowOn[quality] ? 1 : 0,
      (1 - CLOUDS.shadowMul) * day,
    );
  };

  return {
    group,
    update,
    shadowParams: SHARED.uCloudShadow,
    puffs,
    field,
    visibility: () => vis,
  };
}

function wrap(tile: number, a: number): number {
  return a - tile * Math.floor(a / tile);
}

function smoothstep01(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}
