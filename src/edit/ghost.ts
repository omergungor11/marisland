import * as THREE from 'three';
import { Scope } from '../core/scope.ts';
import { PROP_DEFS, type PropDef } from '../content/props.ts';
import { GHOST } from '../content/edit-ui.ts';
import { buildProp } from '../geo/index.ts';
import { createPropMaterials, type PropMaterials } from '../render/materials/prop-materials.ts';
import { LitMaterial } from '../render/materials/factory.ts';

/**
 * Ghost preview of the selected prop (phase-2 TASK-212): a single-instance `InstancedMesh` per
 * (def, variant) built exactly like a PropBatcher group (same `buildProp` geometry, an
 * `InstancedBufferGeometry` with per-instance `aSeed` / `aAppear`, the prop material from
 * `prop-materials.ts`), so it renders through the ONE shared lit program — zero new programs.
 *
 * Translucency is the factory's ordered dither: the ghost's own material instance gets its
 * distance-fade uniforms set every frame so `vFade` = `GHOST.alpha` at the ghost's origin
 * (opaque, no sorting). Invalid placement tints through the material's Lambert `color` /
 * `emissive` uniforms (per material, not program parameters). No shadow casting (no depth
 * program), no animation of its own. Everything lives in a child scope of the world scope.
 */
export interface GhostDeps {
  /** World scope (the ghost's resources are freed with the world). */
  scope: Scope;
  /** World group the mesh is added to. */
  parent: THREE.Object3D;
  /** World seed: the batcher builds prop geometry with it, so the ghost matches. */
  seed: number;
  camera: THREE.Camera;
}

export interface Ghost {
  /** Select the previewed def (null: none) and variant. Builds on first use, then cached. */
  setDef(defId: string | null, variant: number): void;
  setPose(x: number, y: number, z: number, rotY: number, scale: number): void;
  setValid(ok: boolean): void;
  setVisible(on: boolean): void;
  readonly visible: boolean;
  readonly valid: boolean;
  /** Current mesh (debug / tests). */
  readonly mesh: THREE.InstancedMesh | null;
  /** Per frame: keep the dither at `GHOST.alpha` for the current camera distance. */
  update(): void;
  dispose(): void;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _axis = new THREE.Vector3(0, 1, 0);
/** Half-span of the fade ramp around the ghost (u): vFade is flat over the whole model. */
const FADE_SPAN = 1000;
/** Matches the batcher's always-visible `aAppear` (bloom-in long finished). */
const ALWAYS_APPEAR = -1e3;

const VALID_COLOR = new THREE.Color(GHOST.validColor);
const VALID_EMISSIVE = new THREE.Color(GHOST.validEmissive);
const INVALID_COLOR = new THREE.Color(GHOST.invalidColor);
const INVALID_EMISSIVE = new THREE.Color(GHOST.invalidEmissive);

export function createGhost(d: GhostDeps): Ghost {
  const own = d.scope.add(new Scope('ghost'));
  const mats: PropMaterials = createPropMaterials(own);
  const meshes = new Map<string, THREE.InstancedMesh>();
  let mesh: THREE.InstancedMesh | null = null;
  let material: LitMaterial | null = null;
  let visible = false;
  let valid = true;
  const pos = new THREE.Vector3();
  const pose = { rotY: 0, scale: 1 };
  const writePose = (): void => {
    if (!mesh) return;
    _q.setFromAxisAngle(_axis, pose.rotY);
    _s.setScalar(pose.scale);
    mesh.setMatrixAt(0, _m.compose(_p.copy(pos), _q, _s));
    mesh.instanceMatrix.needsUpdate = true;
  };

  const build = (def: PropDef, variant: number): THREE.InstancedMesh => {
    const base = own.add(buildProp(def.geo, d.seed, variant, 0));
    const geo = new THREE.InstancedBufferGeometry();
    for (const name of Object.keys(base.attributes)) geo.setAttribute(name, base.attributes[name]);
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array([0]), 1));
    geo.setAttribute(
      'aAppear',
      new THREE.InstancedBufferAttribute(new Float32Array([ALWAYS_APPEAR]), 1),
    );
    const mat = mats.materialFor(def, 0, false);
    const m = new THREE.InstancedMesh(geo, mat, 1);
    m.name = `ghost:${def.id}:${variant}`;
    m.castShadow = false;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.visible = false;
    d.parent.add(m);
    own.defer(() => {
      m.removeFromParent();
      m.dispose();
      geo.dispose();
    });
    return m;
  };

  const applyTint = (): void => {
    if (!material) return;
    material.color.copy(valid ? VALID_COLOR : INVALID_COLOR);
    material.emissive.copy(valid ? VALID_EMISSIVE : INVALID_EMISSIVE);
  };

  const ghost: Ghost = {
    setDef(defId, variant) {
      const def = defId ? PROP_DEFS.find((p) => p.id === defId) : undefined;
      const next = def ? `${def.id}:${Math.max(0, Math.min(def.variants - 1, variant))}` : '';
      const cur = mesh ? mesh.name.slice('ghost:'.length) : '';
      if (next === cur) return;
      if (mesh) mesh.visible = false;
      mesh = null;
      material = null;
      if (!def) return;
      const v = Number(next.split(':')[1]);
      let m = meshes.get(next);
      if (!m) {
        m = build(def, v);
        meshes.set(next, m);
      }
      mesh = m;
      material = m.material instanceof LitMaterial ? m.material : null;
      writePose();
      mesh.visible = visible;
      applyTint();
    },
    setPose(x, y, z, rotY, scale) {
      pos.set(x, y, z);
      pose.rotY = rotY;
      pose.scale = scale;
      writePose();
    },
    setValid(ok) {
      if (ok === valid) return;
      valid = ok;
      applyTint();
    },
    setVisible(on) {
      visible = on;
      if (mesh) mesh.visible = on;
    },
    get visible() {
      return visible && !!mesh;
    },
    get valid() {
      return valid;
    },
    get mesh() {
      return mesh;
    },
    update() {
      if (!visible || !material) return;
      d.camera.getWorldPosition(_cam);
      // vFade = 1 − (dist − near) / (far − near) = GHOST.alpha at the ghost's origin
      const near = _cam.distanceTo(pos) - (1 - GHOST.alpha) * 2 * FADE_SPAN;
      material.fade.uFadeNear.value = near;
      material.fade.uFadeFar.value = near + 2 * FADE_SPAN;
    },
    dispose() {
      own.dispose();
      meshes.clear();
      mesh = null;
      material = null;
    },
  };
  return ghost;
}
