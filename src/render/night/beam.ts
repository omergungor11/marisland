import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import { BEAM } from '../../content/lighting.ts';
import { PROP_DEFS } from '../../content/props.ts';
import type { PropStore } from '../../world/prop-store.ts';
import { SHARED } from '../uniforms.ts';
import { createSkyProgramMaterial } from '../sky/sky.ts';

/**
 * Lighthouse beam (TASK-171, ART_BIBLE §7 #19): a rotating double cone of soft additive light
 * from the lamp room plus a camera-facing lamp flare, one mesh drawn with the sky dome's program
 * (sky.ts createSkyProgramMaterial('beam') — zero extra shader programs). Visible
 * with EnvState.beam (SHARED.uLamps.z); the mesh is hidden (no draw call) by day.
 * Rotation is a function of SHARED.uTime only → deterministic in capture mode.
 */
export interface BeamView {
  /** Null when the world has no lighthouse. */
  mesh: THREE.Mesh | null;
  update(): void;
}

const DEG = Math.PI / 180;

/** Open cone along +x (front) and −x (back), plus a flare quad; aBeam = (t along, kind). */
export function buildBeamGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const beam: number[] = [];
  const idx: number[] = [];
  const radial = BEAM.radialSegments;
  const along = BEAM.lengthSegments;
  const tanA = Math.tan(BEAM.halfAngleDeg * DEG);
  const r0 = BEAM.startRadius;
  const L = BEAM.length;
  const slope = tanA; // dr/dx
  const nl = 1 / Math.hypot(1, slope);
  for (const kind of [0, 1]) {
    const dir = kind === 0 ? 1 : -1;
    const base = pos.length / 3;
    for (let j = 0; j <= along; j++) {
      // denser near the lamp where the beam is narrow
      const t = (j / along) ** 1.4;
      const x = t * L;
      const r = r0 + x * tanA;
      for (let i = 0; i <= radial; i++) {
        const a = (i / radial) * Math.PI * 2;
        const cy = Math.cos(a);
        const cz = Math.sin(a);
        pos.push(dir * x, r * cy, r * cz);
        nrm.push(-dir * slope * nl, cy * nl, cz * nl);
        beam.push(t, kind);
      }
    }
    // both windings: the shared sky program renders BackSide only, so every surface needs a
    // back-facing copy toward the camera (≙ DoubleSide without a different program key)
    for (let j = 0; j < along; j++) {
      for (let i = 0; i < radial; i++) {
        const a = base + j * (radial + 1) + i;
        const b = a + radial + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const f = pos.length / 3;
  for (const [x, y] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    pos.push(x, y, 0);
    nrm.push(0, 0, 1);
    beam.push(0, 2);
  }
  // clockwise as seen from the camera → back-facing → drawn under BackSide
  idx.push(f, f + 2, f + 1, f, f + 3, f + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aBeam', new THREE.Float32BufferAttribute(beam, 2));
  g.setIndex(idx);
  // generous bounds: the cone sweeps a full circle around the lamp
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), L + BEAM.flareRadius);
  return g;
}

/** Find the lighthouse instance in the prop store (first one). */
function findLighthouse(props: PropStore): { x: number; y: number; z: number; s: number } | null {
  for (let i = 0; i < props.count; i++) {
    if (PROP_DEFS[props.defId[i]]?.geo === 'lighthouse')
      return { x: props.x[i], y: props.y[i], z: props.z[i], s: props.scale[i] || 1 };
  }
  return null;
}

export function createBeam(props: PropStore, scope: Scope): BeamView {
  const lh = findLighthouse(props);
  if (!lh) return { mesh: null, update() {} };
  const geo = scope.add(buildBeamGeometry());
  // same program as the sky dome (uMode = 1): no extra shader program for the beam
  const mat = scope.add(
    createSkyProgramMaterial('beam', {
      flareRadius: BEAM.flareRadius * lh.s,
      flarePull: BEAM.flarePull * lh.s,
    }),
  );
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'lighthouse-beam';
  mesh.position.set(lh.x, lh.y + BEAM.lampY * lh.s, lh.z);
  mesh.scale.setScalar(lh.s);
  mesh.renderOrder = 20; // after water (10) and blobs (5)
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // visible at build so compileAsync prewarms the program; update() hides it by day
  return {
    mesh,
    update() {
      mesh.visible = SHARED.uLamps.value.z > 0.001 && SHARED.uDebugMask.value < 0.5;
    },
  };
}
