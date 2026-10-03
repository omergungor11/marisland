import * as THREE from 'three';
import { AgentKind, type AgentKindOpts } from './agents.ts';
import { litCreatureMaterial } from './boats.ts';

/** A separately instanced sub-mesh that follows its kind's body matrix and rotates about a pivot. */
export interface Part {
  readonly mesh: THREE.InstancedMesh;
  readonly pivot: THREE.Vector3;
  readonly axis: 'y' | 'z';
  /** Per-instance angle (rad) set by the behaviour each step. */
  readonly angle: Float32Array;
}

export type KindOpts = Omit<AgentKindOpts, 'name' | 'capacity' | 'geometry' | 'material'>;

const _body = new THREE.Matrix4();
const _t1 = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _t2 = new THREE.Matrix4();

/** Agent kind with optional rotating parts (cat tail, crab claws) and a tier gate. */
export abstract class CritterKind extends AgentKind {
  readonly parts: Part[] = [];
  /** First tier at which the agents are live (0–3). */
  protected readonly minTier: number;
  protected wasOn = false;
  private readonly o: KindOpts;

  constructor(
    o: KindOpts,
    name: string,
    capacity: number,
    geometry: THREE.BufferGeometry,
    minTier: number,
  ) {
    super({ ...o, name, capacity, geometry, material: litCreatureMaterial(`life:${name}`) });
    this.o = o;
    this.minTier = minTier;
  }

  protected addPart(
    name: string,
    geometry: THREE.BufferGeometry,
    pivot: THREE.Vector3,
    axis: 'y' | 'z',
  ): Part {
    const mesh = new THREE.InstancedMesh(geometry, this.mesh.material, this.capacity);
    mesh.name = `life:${this.name}:${name}`;
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.o.group.add(mesh);
    this.o.scope.add(geometry);
    this.o.scope.add(mesh);
    const part: Part = { mesh, pivot, axis, angle: new Float32Array(this.capacity) };
    this.parts.push(part);
    return part;
  }

  /** Called when the tier crosses `minTier`; subclasses (re)spawn. */
  protected abstract onActivate(): void;

  syncTier(tier: number): void {
    const on = tier >= this.minTier;
    if (on && !this.wasOn) {
      this.wasOn = true;
      this.onActivate();
    } else if (!on && this.wasOn) {
      this.wasOn = false;
      this.active.fill(0);
    }
  }

  override update(alpha: number): void {
    super.update(alpha);
    const src = this.mesh.instanceMatrix.array as Float32Array;
    for (const p of this.parts) {
      const dst = p.mesh.instanceMatrix.array as Float32Array;
      for (let i = 0; i < this.capacity; i++) {
        _body.fromArray(src, i * 16);
        _t1.makeTranslation(p.pivot.x, p.pivot.y, p.pivot.z);
        if (p.axis === 'y') _r.makeRotationY(p.angle[i]);
        else _r.makeRotationZ(p.angle[i]);
        _t2.makeTranslation(-p.pivot.x, -p.pivot.y, -p.pivot.z);
        _body.multiply(_t1).multiply(_r).multiply(_t2);
        _body.toArray(dst, i * 16);
      }
      p.mesh.count = this.mesh.count;
      p.mesh.visible = this.mesh.visible;
      p.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Frozen by a reaction: count the hold down and report whether to skip the behaviour. */
  protected held(i: number, dt: number): boolean {
    if (this.hold[i] <= 0) return false;
    this.hold[i] = Math.max(0, this.hold[i] - dt);
    return true;
  }
}
