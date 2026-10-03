import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import { easeOutBack, easeOutCubic } from '../anim/spring.ts';
import { FX_COLORS } from '../anim/reaction-data.ts';

/** Particle kinds drawn by the pooled FX meshes. */
export const Fx = { Sparkle: 0, Leaf: 1, Heart: 2, Sand: 3, Apple: 4, Bubble: 5 } as const;
export type FxType = (typeof Fx)[keyof typeof Fx];

interface Particle {
  on: boolean;
  type: FxType;
  t0: number;
  life: number;
  x: number;
  y: number;
  z: number;
  /** Type-specific: sparkle ring angle, leaf phase, apple ground y, … */
  a: number;
  b: number;
  size: number;
  /** Bubble: follow an agent (index into follow callbacks). */
  follow: (() => { x: number; y: number; z: number } | null) | null;
}

const mk = (): Particle => ({
  on: false,
  type: Fx.Sparkle,
  t0: 0,
  life: 1,
  x: 0,
  y: 0,
  z: 0,
  a: 0,
  b: 0,
  size: 1,
  follow: null,
});

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const _cq = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _zaxis = new THREE.Vector3(0, 0, 1);

/** 4-point star in the xy plane facing +z (8 tris). */
export function starGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const n = 4;
  for (let i = 0; i < n * 2; i++) {
    const a0 = (i / (n * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (n * 2)) * Math.PI * 2;
    const r0 = i % 2 === 0 ? 1 : 0.35;
    const r1 = i % 2 === 0 ? 0.35 : 1;
    pos.push(
      0,
      0,
      0,
      Math.cos(a0) * r0,
      Math.sin(a0) * r0,
      0,
      Math.cos(a1) * r1,
      Math.sin(a1) * r1,
      0,
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeBoundingSphere();
  return g;
}

/** Elongated diamond leaf (2 tris), facing +z. */
export function leafGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [0, 1, 0, -0.5, 0, 0, 0.5, 0, 0, 0, -1, 0, 0.5, 0, 0, -0.5, 0, 0],
      3,
    ),
  );
  g.computeBoundingSphere();
  return g;
}

/** Speech bubble: white disc with a dark "!" (≈ 22 tris), vertex-coloured, facing +z. */
export function bubbleGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const white = new THREE.Color(FX_COLORS.bubble);
  const ink = new THREE.Color(FX_COLORS.bubbleInk);
  const tri = (a: number[], b: number[], c: number[], k: THREE.Color): void => {
    pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) col.push(k.r, k.g, k.b);
  };
  const seg = 12;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    tri([0, 0, 0], [Math.cos(a0), Math.sin(a0), 0], [Math.cos(a1), Math.sin(a1), 0], white);
  }
  // tail
  tri([-0.25, -0.85, 0], [0.25, -0.85, 0], [0, -1.35, 0], white);
  // "!" bar (trapezoid) and dot, slightly in front
  tri([-0.16, 0.6, 0.01], [-0.1, -0.12, 0.01], [0.1, -0.12, 0.01], ink);
  tri([-0.16, 0.6, 0.01], [0.1, -0.12, 0.01], [0.16, 0.6, 0.01], ink);
  tri([-0.11, -0.32, 0.01], [-0.11, -0.54, 0.01], [0.11, -0.54, 0.01], ink);
  tri([-0.11, -0.32, 0.01], [0.11, -0.54, 0.01], [0.11, -0.32, 0.01], ink);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

const basic = (opts: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false, fog: false, ...opts });

/**
 * Pooled FX: sparkles + leaves (billboarded quads), puffs/apples (low-poly spheres), "!" bubbles.
 * One InstancedMesh each; everything advances from the caller's clock.
 */
export class FxPool {
  readonly group = new THREE.Group();
  private readonly quads: Particle[];
  private readonly leaves: Particle[];
  private readonly puffs: Particle[];
  private readonly bubbles: Particle[];
  private readonly mQuads: THREE.InstancedMesh;
  private readonly mLeaves: THREE.InstancedMesh;
  private readonly mPuffs: THREE.InstancedMesh;
  private readonly mBubbles: THREE.InstancedMesh;

  constructor(
    scope: Scope,
    caps: { sparkles: number; leaves: number; puffs: number; bubbles: number },
  ) {
    this.group.name = 'reaction-fx';
    this.quads = Array.from({ length: caps.sparkles }, mk);
    this.leaves = Array.from({ length: caps.leaves }, mk);
    this.puffs = Array.from({ length: caps.puffs }, mk);
    this.bubbles = Array.from({ length: caps.bubbles }, mk);
    this.mQuads = this.mesh(scope, starGeometry(), basic({}), caps.sparkles, 'fx:sparkles');
    this.mLeaves = this.mesh(scope, leafGeometry(), basic({}), caps.leaves, 'fx:leaves');
    this.mPuffs = this.mesh(
      scope,
      new THREE.IcosahedronGeometry(0.5, 0),
      new THREE.MeshBasicMaterial({ toneMapped: false, fog: false }),
      caps.puffs,
      'fx:puffs',
    );
    this.mBubbles = this.mesh(
      scope,
      bubbleGeometry(),
      basic({ vertexColors: true }),
      caps.bubbles,
      'fx:bubbles',
    );
    scope.defer(() => this.group.removeFromParent());
  }

  private mesh(
    scope: Scope,
    g: THREE.BufferGeometry,
    m: THREE.Material,
    n: number,
    name: string,
  ): THREE.InstancedMesh {
    const im = new THREE.InstancedMesh(g, m, n);
    im.name = name;
    im.frustumCulled = false;
    im.visible = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) im.setColorAt(i, _c.set('#ffffff'));
    this.group.add(im);
    scope.add(g);
    scope.add(m);
    scope.add(im);
    return im;
  }

  get active(): number {
    let n = 0;
    for (const arr of [this.quads, this.leaves, this.puffs, this.bubbles])
      for (const p of arr) if (p.on) n++;
    return n;
  }

  private spawn(
    pool: Particle[],
    mesh: THREE.InstancedMesh,
    type: FxType,
    t: number,
    delay: number,
    life: number,
    x: number,
    y: number,
    z: number,
    size: number,
    color: string | null,
    a = 0,
    b = 0,
  ): Particle | null {
    const idx = pool.findIndex((p) => !p.on);
    if (idx < 0) return null;
    const p = pool[idx];
    p.on = true;
    p.type = type;
    p.t0 = t + delay;
    p.life = life;
    p.x = x;
    p.y = y;
    p.z = z;
    p.a = a;
    p.b = b;
    p.size = size;
    p.follow = null;
    if (color) {
      mesh.setColorAt(idx, _c.set(color));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    mesh.visible = true;
    return p;
  }

  /** Ring of `n` sparkles around (x, y, z) springing outward and fading. */
  sparkles(
    t: number,
    x: number,
    y: number,
    z: number,
    n: number,
    radius: number,
    size: number,
    life: number,
    color: string,
    rot = 0,
  ): void {
    for (let k = 0; k < n; k++) {
      this.spawn(
        this.quads,
        this.mQuads,
        Fx.Sparkle,
        t,
        0,
        life,
        x,
        y,
        z,
        size,
        color,
        rot + (k / n) * Math.PI * 2,
        radius,
      );
    }
  }

  leaf(
    t: number,
    delay: number,
    x: number,
    y: number,
    z: number,
    fall: number,
    phase: number,
    color: string,
  ): void {
    this.spawn(
      this.leaves,
      this.mLeaves,
      Fx.Leaf,
      t,
      delay,
      1.3 + fall * 0.15,
      x,
      y,
      z,
      0.18,
      color,
      phase,
      fall,
    );
  }

  puff(
    t: number,
    delay: number,
    type: typeof Fx.Heart | typeof Fx.Sand | typeof Fx.Apple,
    x: number,
    y: number,
    z: number,
    size: number,
    color: string,
    life: number,
    groundY = 0,
  ): void {
    this.spawn(this.puffs, this.mPuffs, type, t, delay, life, x, y, z, size, color, groundY, 0);
  }

  bubble(t: number, x: number, y: number, z: number, follow: Particle['follow']): void {
    const p = this.spawn(this.bubbles, this.mBubbles, Fx.Bubble, t, 0, 1.2, x, y, z, 0.32, null);
    if (p) p.follow = follow;
  }

  update(t: number, camera: THREE.Camera): void {
    camera.getWorldQuaternion(_cq);
    this.run(this.quads, this.mQuads, t, true);
    this.run(this.leaves, this.mLeaves, t, true);
    this.run(this.puffs, this.mPuffs, t, false);
    this.run(this.bubbles, this.mBubbles, t, true);
  }

  private run(pool: Particle[], mesh: THREE.InstancedMesh, t: number, billboard: boolean): void {
    let any = false;
    const arr = mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      let scale = 0;
      let px = p.x;
      let py = p.y;
      let pz = p.z;
      if (p.on) {
        const u = (t - p.t0) / p.life;
        if (u > 1) p.on = false;
        else {
          any = true;
          if (u >= 0) {
            scale = this.eval(p, u, t);
            px = this.out.x;
            py = this.out.y;
            pz = this.out.z;
          }
        }
      }
      _s.setScalar(scale);
      if (billboard) {
        const spin =
          p.type === Fx.Leaf ? p.a + (t - p.t0) * 3 : p.type === Fx.Sparkle ? (t - p.t0) * 2 : 0;
        _qz.setFromAxisAngle(_zaxis, spin);
        _q.copy(_cq).multiply(_qz);
      } else _q.identity();
      _p.set(px, py, pz);
      _m.compose(_p, _q, _s);
      _m.toArray(arr, i * 16);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = any;
  }

  private readonly out = { x: 0, y: 0, z: 0 };

  /** Position goes to `this.out`, returns the scale. */
  private eval(p: Particle, u: number, t: number): number {
    const o = this.out;
    o.x = p.x;
    o.y = p.y;
    o.z = p.z;
    switch (p.type) {
      case Fx.Sparkle: {
        const r = p.b * easeOutBack(Math.min(u * 1.6, 1), 1.7);
        o.x = p.x + Math.cos(p.a) * r;
        o.z = p.z + Math.sin(p.a) * r;
        o.y = p.y + 0.35 * easeOutCubic(u);
        // face the camera: ring is horizontal in the world, quads are billboards
        return p.size * (u < 0.12 ? u / 0.12 : 1 - (u - 0.12) / 0.88) * (1 - u * 0.3);
      }
      case Fx.Leaf: {
        const fall = p.b;
        o.x = p.x + Math.sin(p.a + u * 6) * 0.35 * u;
        o.z = p.z + Math.cos(p.a * 1.7 + u * 5) * 0.35 * u;
        o.y = p.y - fall * u * u * (3 - 2 * u) * 1;
        return p.size * (u < 0.1 ? u / 0.1 : u > 0.85 ? (1 - u) / 0.15 : 1);
      }
      case Fx.Heart: {
        o.y = p.y + 1.5 * easeOutCubic(u);
        o.x = p.x + Math.sin(u * 5) * 0.12;
        return p.size * (0.3 + 0.9 * easeOutCubic(u)) * (u > 0.7 ? (1 - u) / 0.3 : 1);
      }
      case Fx.Sand: {
        o.y = p.y + 0.35 * easeOutCubic(u);
        return p.size * (0.3 + 0.9 * easeOutCubic(u)) * (1 - u * u);
      }
      case Fx.Apple: {
        // closed-form fall + 3 damped bounces
        const g = 9;
        const h0 = Math.max(p.y - p.a, 0.01);
        const tf = Math.sqrt((2 * h0) / g);
        const tau = u * p.life;
        let y = h0 - 0.5 * g * Math.min(tau, tf) ** 2;
        if (tau > tf) {
          let rest = tau - tf;
          let v = Math.sqrt(2 * g * h0) * 0.45;
          y = 0;
          for (let b = 0; b < 3; b++) {
            const tb = (2 * v) / g;
            if (rest < tb) {
              y = v * rest - 0.5 * g * rest * rest;
              break;
            }
            rest -= tb;
            v *= 0.45;
          }
        }
        o.y = p.a + y + p.size * 0.5;
        return p.size * (u > 0.85 ? (1 - u) / 0.15 : 1);
      }
      case Fx.Bubble: {
        if (p.follow) {
          const f = p.follow();
          if (f) {
            o.x = f.x;
            o.y = f.y;
            o.z = f.z;
          }
        }
        o.y += 0.5 + 0.35 * easeOutCubic(u);
        void t;
        return p.size * easeOutBack(Math.min(u / 0.18, 1), 2) * (u > 0.85 ? (1 - u) / 0.15 : 1);
      }
    }
  }
}
