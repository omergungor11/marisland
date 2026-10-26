import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import { BEAM } from '../../content/lighting.ts';
import { PROP_DEF_INDEX } from '../../content/props.ts';
import { BEACON_NET } from '../../content/signature.ts';
import type { PropStore } from '../../world/prop-store.ts';
import type { WorldData } from '../../world/types.ts';
import { SHARED } from '../uniforms.ts';
import { createSkyProgramMaterial } from '../sky/sky.ts';
import { buildBeamGeometry, type BeamView } from './beam.ts';

/**
 * Beacon network (M23 TASK-490, W:B1): the skerry mini lighthouses and the Marketing lighthouse sweep
 * their beams on one 8 s turn, each lagging the previous one by `BEACON_NET.stepS` in route order
 * (distance from the HQ), so a wave of light runs around the archipelago. Every beam is the lighthouse
 * beam program (sky.ts, one draw call each) turned by `uTime` alone — the lag is a yaw of the mesh —
 * so captures replay it. Each beam fades out with camera distance (`BEACON_NET.fade`) and is hidden
 * past it, which also keeps far beams from stacking additive light in the fog. Night visibility is the
 * existing `uLamps.z` ramp (18:30–06:30).
 */
export interface BeaconNet {
  /** The mini lighthouse beam meshes (the Marketing lighthouse's stays in its own mesh). */
  readonly group: THREE.Group;
  /** Per frame, after `BeamView.update`: distance fade and visibility. */
  update(camPos: THREE.Vector3): void;
  /** Beams in the network (mini + the lighthouse's). */
  readonly count: number;
  /** Beam turn lag in route order (s), nearest to the HQ first. */
  readonly lags: readonly number[];
}

interface Node {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  base: number;
}

export function createBeaconNet(
  props: PropStore,
  world: Pick<WorldData, 'islands'>,
  lighthouse: BeamView,
  scope: Scope,
): BeaconNet {
  const nodes: Node[] = [];
  const rank: { d: number; node: Node }[] = [];
  const hq = world.islands.find((i) => i.theme === 'hq');
  const hx = hq?.cx ?? 0;
  const hz = hq?.cz ?? 0;
  const omega = (Math.PI * 2) / BEAM.secondsPerRev;
  const B = BEACON_NET.beam;
  const def = PROP_DEF_INDEX.beaconTower ?? -1;
  let geo: THREE.BufferGeometry | null = null;
  for (let i = 0; i < props.count; i++) {
    if (props.defId[i] !== def || def < 0) continue;
    const s = props.scale[i] || 1;
    geo ??= scope.add(buildBeamGeometry());
    const mat = scope.add(
      createSkyProgramMaterial('beam', {
        flareRadius: BEAM.flareRadius * B.scale * B.flare,
        flarePull: BEAM.flarePull * B.scale,
      }),
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'beacon-beam';
    mesh.position.set(props.x[i], props.y[i] + BEACON_NET.tower.lampY * s, props.z[i]);
    mesh.scale.setScalar(B.scale * s);
    mesh.renderOrder = 20;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    const node = { mesh, mat, base: BEAM.opacity * B.opacity };
    nodes.push(node);
    rank.push({ d: Math.hypot(props.x[i] - hx, props.z[i] - hz), node });
  }
  if (lighthouse.mesh) {
    const mat = lighthouse.mesh.material as THREE.ShaderMaterial;
    const node = { mesh: lighthouse.mesh, mat, base: BEAM.opacity };
    nodes.push(node);
    rank.push({
      d: Math.hypot(lighthouse.mesh.position.x - hx, lighthouse.mesh.position.z - hz),
      node,
    });
  }
  rank.sort((a, b) => a.d - b.d);
  const lags = rank.map((_, r) => r * BEACON_NET.stepS);
  // yaw of the mesh = a phase offset of the shader's turn (ang = uTime * omega); later = lagging
  rank.forEach((r, k) => {
    r.node.mesh.rotation.y = -omega * lags[k];
  });
  const group = new THREE.Group();
  group.name = 'beacon-beams';
  for (const n of nodes) if (n.mesh !== lighthouse.mesh) group.add(n.mesh);
  const [f0, f1] = BEACON_NET.fade;
  return {
    group,
    count: nodes.length,
    lags,
    update(camPos) {
      const night = SHARED.uLamps.value.z > 0.001 && SHARED.uDebugMask.value < 0.5;
      for (const n of nodes) {
        const d = n.mesh.position.distanceTo(camPos);
        const k = d <= f0 ? 1 : d >= f1 ? 0 : 1 - (d - f0) / (f1 - f0);
        const k2 = k * k * (3 - 2 * k);
        (n.mat.uniforms.uBeamLook.value as THREE.Vector4).x = n.base * k2;
        n.mesh.visible = night && k2 > 0.002;
      }
    },
  };
}
