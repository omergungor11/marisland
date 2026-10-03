import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { WorldData } from '../../world/types.ts';
import type { WorldTextures } from '../world-textures.ts';
import type { Quality } from '../../core/params.ts';
import { WATER } from '../../content/palette.ts';
import { WATER_SHADER } from '../../content/water.ts';
import { SHARED } from '../uniforms.ts';
import { createRadialGrid } from './water-geometry.ts';
import { createFoamTrail, type FoamTrail } from './foam-trail.ts';
import { WATER_FRAG, WATER_VERT, waterDefines } from './water.glsl.ts';

/**
 * TASK-103 — water (ARCHITECTURE §3, ART_BIBLE §2/§7): camera-centred radial grid,
 * swell from shared/fields, shore-distance colour bands + alpha from the world grid
 * textures, in-shader SDF foam, glints, moon streak, fresnel sky and manual fog.
 * One ShaderMaterial, one program per quality.
 */
export interface WaterView {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  trail: FoamTrail;
  /** Re-centre the radial grid on the camera (snapped) and push time. */
  update(cameraPos: THREE.Vector3, time: number): void;
  /** Splat a wake/ripple into the foam-trail texture (M6). */
  splat(x: number, z: number, radius: number, strength: number): void;
}

export function createWater(
  world: WorldData,
  textures: WorldTextures,
  quality: Quality,
  scope: Scope,
): WaterView {
  void world; // wind comes in through SHARED.uWind (setWind(world.windDir))
  const cfg = WATER_SHADER;
  const geo = scope.add(createRadialGrid(cfg.grid));
  const trail = createFoamTrail(cfg.trail, scope);

  const defines: Record<string, string> = {};
  if (quality === 'low') defines.MAR_DIRECT = '';
  else defines.MAR_DETAIL = '';

  const col = (hex: string): { value: THREE.Color } => ({ value: new THREE.Color(hex) });
  const mat = scope.add(
    new THREE.ShaderMaterial({
      name: 'water',
      vertexShader: `${waterDefines()}\n${WATER_VERT}`,
      fragmentShader: `${waterDefines()}\n${WATER_FRAG}`,
      defines,
      uniforms: {
        ...SHARED,
        uHeightTex: { value: textures.height },
        uSdfTex: { value: textures.sdf },
        uGridMap: textures.uGridMap,
        uTrailTex: { value: trail.texture },
        uTrailMap: trail.uMap,
        uDeep: col(WATER.deep),
        uMid: col(WATER.mid),
        uShallow: col(WATER.shallow),
        uLagoon: col(WATER.lagoon),
        uFoam: col(WATER.foam),
      },
      transparent: true,
      depthWrite: true,
      fog: false,
      lights: false,
    }),
  );

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.renderOrder = 10;
  mesh.frustumCulled = false; // always around the camera
  const snap = cfg.grid.snap;

  return {
    mesh,
    material: mat,
    trail,
    update(cameraPos, time) {
      mesh.position.set(
        Math.round(cameraPos.x / snap) * snap,
        0,
        Math.round(cameraPos.z / snap) * snap,
      );
      mesh.updateMatrix();
      trail.step(time);
    },
    splat: (x, z, r, s) => trail.splat(x, z, r, s),
  };
}
