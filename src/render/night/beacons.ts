import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import { BEAM } from '../../content/lighting.ts';
import { PROP_DEF_INDEX } from '../../content/props.ts';
import { BEACON_NET } from '../../content/signature.ts';
import { HARBOUR, HARBOUR_VARIANTS } from '../../content/themes/harbours.ts';
import type { PropStore } from '../../world/prop-store.ts';
import type { WorldData } from '../../world/types.ts';
import { SHARED } from '../uniforms.ts';
import { createSkyProgramMaterial, type BeamLand } from '../sky/sky.ts';
import { buildBeamGeometry, type BeamView } from './beam.ts';

/**
 * Beacon network (M23 TASK-490, W:B1): the skerry mini lighthouses and the Marketing lighthouse sweep
 * their beams on one 8 s turn, each lagging the previous one by `BEACON_NET.stepS` in route order
 * (distance from the HQ), so a wave of light runs around the archipelago. Every beam is the lighthouse
 * beam program (sky.ts, one draw call each) turned by `uTime` alone — the lag is a yaw of the mesh —
 * so captures replay it. Each beam fades out with camera distance (`BEACON_NET.fade`) and is hidden
 * past it, which also keeps far beams from stacking additive light in the fog. Night visibility is the
 * existing `uLamps.z` ramp (18:30–06:30). The 6 u harbour lights (M31 TASK-534) join the same turn
 * with a shorter beam and a near fade of their own: a harbour beam is a harbour-view read, and three
 * of them must not cost three draw calls on every far dusk shot.
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
  /** Flare radius (u) at rest; grows to `BEACON_NET.flareMin` × distance far away. */
  flare: number;
  /** Camera distance band of the fade (u). */
  fade: readonly [number, number];
}

export function createBeaconNet(
  props: PropStore,
  world: Pick<WorldData, 'islands'>,
  lighthouse: BeamView,
  scope: Scope,
  land?: BeamLand,
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
        land,
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
    const node = {
      mesh,
      mat,
      base: BEAM.opacity * B.opacity,
      flare: BEAM.flareRadius * B.scale * B.flare,
      fade: BEACON_NET.fade,
    };
    nodes.push(node);
    rank.push({ d: Math.hypot(props.x[i] - hx, props.z[i] - hz), node });
  }
  // the harbour lights (lighthouse v3+, geo/themes/harbours.ts): their lamp, on the same turn
  const HB = BEACON_NET.harbour;
  const lightDef = PROP_DEF_INDEX.lighthouse ?? -1;
  for (let i = 0; i < props.count; i++) {
    if (props.defId[i] !== lightDef || props.variant[i] < HARBOUR_VARIANTS.lighthouse) continue;
    const s = props.scale[i] || 1;
    const k = (HARBOUR.light.beam.length / BEAM.length) * s;
    geo ??= scope.add(buildBeamGeometry());
    const mat = scope.add(
      createSkyProgramMaterial('beam', {
        flareRadius: BEAM.flareRadius * k * HB.flare,
        flarePull: BEAM.flarePull * k,
        land,
      }),
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'harbour-beam';
    mesh.position.set(props.x[i], props.y[i] + HARBOUR.light.lamp.y * s, props.z[i]);
    mesh.scale.setScalar(k);
    mesh.renderOrder = 20;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    const node = {
      mesh,
      mat,
      base: BEAM.opacity * HB.opacity,
      flare: BEAM.flareRadius * k * HB.flare,
      fade: HB.fade,
    };
    nodes.push(node);
    rank.push({ d: Math.hypot(props.x[i] - hx, props.z[i] - hz), node });
  }
  if (lighthouse.mesh) {
    const mat = lighthouse.mesh.material as THREE.ShaderMaterial;
    const node = {
      mesh: lighthouse.mesh,
      mat,
      base: BEAM.opacity,
      flare: (mat.uniforms.uBeamMotion.value as THREE.Vector4).z,
      fade: BEACON_NET.fade,
    };
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
  return {
    group,
    count: nodes.length,
    lags,
    update(camPos) {
      const night = SHARED.uLamps.value.z > 0.001 && SHARED.uDebugMask.value < 0.5;
      for (const n of nodes) {
        const [f0, f1] = n.fade;
        const d = n.mesh.position.distanceTo(camPos);
        const k = d <= f0 ? 1 : d >= f1 ? 0 : 1 - (d - f0) / (f1 - f0);
        const k2 = k * k * (3 - 2 * k);
        (n.mat.uniforms.uBeamLook.value as THREE.Vector4).x = n.base * k2;
        // the lamp reads as a light from the postcard, not a red dot (TASK-496)
        (n.mat.uniforms.uBeamMotion.value as THREE.Vector4).z = Math.max(
          n.flare,
          d * BEACON_NET.flareMin,
        );
        n.mesh.visible = night && k2 > 0.002;
      }
    },
  };
}
