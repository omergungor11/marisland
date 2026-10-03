import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SPARKLES } from '../anim/reaction-data.ts';
import { FIXED_STEP } from '../core/clock.ts';
import { Scope } from '../core/scope.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../content/props.ts';
import { createLife, type LifeSystem } from '../life/index.ts';
import type { PropBatcher } from '../render/props/batcher.ts';
import { generateWorld, heightAt, type Heightfield, type WorldData } from '../world/index.ts';
import { createPicker, isClick, createReactions, rayCylinder, type PickResult } from './index.ts';

let cached: WorldData | null = null;
const world = (): WorldData => (cached ??= generateWorld(7));

/** Flat heightfield at y = 1 (n = 65, 2 u cells, origin -64). */
function flat(h = 1): Heightfield {
  const n = 65;
  return { data: new Float32Array(n * n).fill(h), n, cellSize: 2, originX: -64, originZ: -64 };
}

function fakeBatcher(props: { def: string; x: number; z: number; y: number; scale?: number }[]): {
  batcher: PropBatcher;
  meshes: THREE.InstancedMesh[];
} {
  const meshes: THREE.InstancedMesh[] = [];
  const groups = props.map((p, i) => {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      1,
    );
    mesh.setMatrixAt(
      0,
      new THREE.Matrix4().compose(
        new THREE.Vector3(p.x, p.y, p.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.7),
        new THREE.Vector3().setScalar(p.scale ?? 1),
      ),
    );
    mesh.visible = true;
    meshes.push(mesh);
    return {
      mesh,
      defIndex: PROP_DEF_INDEX[p.def],
      def: PROP_DEFS[PROP_DEF_INDEX[p.def]],
      lod: 0,
      bucket: i,
      groundCover: false,
      members: Int32Array.from([100 + i]),
      appear: null,
      blobs: null,
      visible: true,
      cx: p.x,
      cz: p.z,
    };
  });
  return { batcher: { groups } as unknown as PropBatcher, meshes } as {
    batcher: PropBatcher;
    meshes: THREE.InstancedMesh[];
  };
}

describe('isClick', () => {
  it('needs < 6 px and < 300 ms', () => {
    expect(isClick(10, 10, 12, 12, 120)).toBe(true);
    expect(isClick(10, 10, 20, 10, 120)).toBe(false);
    expect(isClick(10, 10, 10, 10, 300)).toBe(false);
    expect(isClick(10, 10, 15, 10, 299)).toBe(true);
  });
});

describe('picker', () => {
  it('rayCylinder: side, top cap and miss', () => {
    expect(rayCylinder(-5, 1, 0, 1, 0, 0, 0, 0, 1, 0, 3)).toBeCloseTo(4, 5);
    expect(rayCylinder(0, 10, 0, 0, -1, 0, 0, 0, 1, 0, 3)).toBeCloseTo(7, 5);
    expect(rayCylinder(-5, 5, 0, 1, 0, 0, 0, 0, 1, 0, 3)).toBe(-1);
  });

  it('returns the terrain hit for a known ray on the real world', () => {
    const w = world();
    const hh = w.height;
    const isl = w.islands[0];
    const tx = isl.peakX;
    const tz = isl.peakZ;
    const ty = heightAt(hh, tx, tz);
    const picker = createPicker({ height: hh });
    // from straight above
    const down = picker.pickRay(tx, ty + 80, tz, 0, -1, 0)!;
    expect(down.kind).toBe('terrain');
    expect(down.x).toBeCloseTo(tx, 3);
    expect(down.y).toBeCloseTo(ty, 1);
    // from a slanted direction aimed at the peak
    const o = new THREE.Vector3(tx - 120, ty + 100, tz - 90);
    const d = new THREE.Vector3(tx, ty, tz).sub(o);
    const hit = picker.pickRay(o.x, o.y, o.z, d.x, d.y, d.z)!;
    expect(hit.kind).toBe('terrain');
    expect(Math.hypot(hit.x - tx, hit.z - tz)).toBeLessThan(1.5);
    expect(hit.y).toBeCloseTo(heightAt(hh, hit.x, hit.z), 1);
  });

  it('water: a ray over the open sea hits y = 0', () => {
    const w = world();
    const picker = createPicker({ height: w.height });
    const hit = picker.pickRay(-380, 60, -380, 0.3, -1, 0.2)!;
    expect(hit.kind).toBe('water');
    expect(hit.y).toBe(0);
  });

  it('pick(ndc, camera) matches pickRay through the camera centre', () => {
    const picker = createPicker({ height: flat() });
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    cam.position.set(0, 30, 30);
    cam.lookAt(0, 1, 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    const hit = picker.pick(0, 0, cam)!;
    expect(hit.kind).toBe('terrain');
    expect(Math.hypot(hit.x, hit.z)).toBeLessThan(0.2);
    expect(hit.y).toBeCloseTo(1, 3);
  });

  it('picks a prop placed at a known spot, ahead of the terrain behind it', () => {
    const { batcher } = fakeBatcher([
      { def: 'roundTree', x: 4, y: 1, z: 4 },
      { def: 'cottage', x: -10, y: 1, z: 0 },
    ]);
    const picker = createPicker({ height: flat(), batcher });
    const hit = picker.pickRay(4, 3, -20, 0, -0.05, 1)!;
    expect(hit.kind).toBe('prop');
    expect(hit.defId).toBe('roundTree');
    expect(hit.instance?.index).toBe(0);
    expect(hit.id).toBe('prop:roundTree:100');
    expect(hit.z).toBeLessThan(4);
    const h2 = picker.pickRay(-10, 2, -30, 0, 0, 1)!;
    expect(h2.defId).toBe('cottage');
    // a ray that passes beside it hits the ground
    const miss = picker.pickRay(30, 8, -20, 0, -0.2, 1)!;
    expect(miss.kind).toBe('terrain');
    // hidden group is ignored
    (batcher.groups[0] as { visible: boolean }).visible = false;
    expect(picker.pickRay(4, 3, -20, 0, -0.05, 1)!.kind).toBe('terrain');
  });

  it('agents win when in front; the nearest of agent/prop is chosen', () => {
    const { batcher } = fakeBatcher([{ def: 'roundTree', x: 4, y: 1, z: 4 }]);
    const fakeKind = { name: 'villager' } as never;
    const life = {
      forEachAgent: (
        cb: (k: never, i: number, x: number, y: number, z: number, r: number) => void,
      ) => cb(fakeKind, 3, 4, 1.5, -2, 0.7),
    } as unknown as LifeSystem;
    const picker = createPicker({ height: flat(), batcher, life });
    const hit = picker.pickRay(4, 1.5, -20, 0, 0, 1)!;
    expect(hit.kind).toBe('agent');
    expect(hit.id).toBe('agent:villager:3');
    // from behind the tree the tree is nearer
    const back = picker.pickRay(4, 1.5, 20, 0, 0, -1)!;
    expect(back.kind).toBe('prop');
  });

  it('picks a live villager from the real life system', () => {
    const w = world();
    const cam = new THREE.Vector3(0, 40, 0);
    const life = createLife({
      world: w,
      scope: new Scope('t'),
      seed: 7,
      quality: 'medium',
      water: { splat: () => undefined },
      counters: { agents: 0 } as never,
      getTier: () => 2,
      cameraPos: cam,
    });
    life.onTier(2);
    for (let i = 0; i < 30; i++) life.fixedUpdate(FIXED_STEP);
    const v = life.kinds.villagers!;
    const picker = createPicker({ height: w.height, life });
    const hit = picker.pickRay(v.x[0], v.y[0] + 40, v.z[0], 0, -1, 0)!;
    expect(hit.kind).toBe('agent');
    expect(hit.agent?.kind.name).toBe('villager');
    expect(hit.agent?.index).toBe(0);
  });
});

describe('reactions', () => {
  const setup = (opts: { reduced?: boolean } = {}) => {
    const { batcher, meshes } = fakeBatcher([{ def: 'roundTree', x: 4, y: 1, z: 4 }]);
    const splats: number[][] = [];
    const scope = new Scope('rx');
    const effects: string[] = [];
    const rx = createReactions({
      scope,
      seed: 7,
      water: { splat: (x, z, r, s) => splats.push([x, z, r, s]) },
      onEffect: (e) => effects.push(e.id),
    });
    rx.setReducedMotion(!!opts.reduced);
    const picker = createPicker({ height: flat(), batcher });
    const target = picker.pickRay(4, 3, -20, 0, -0.05, 1) as PickResult;
    const cam = new THREE.PerspectiveCamera();
    const mat = (): number[] =>
      Array.from(meshes[0].instanceMatrix.array as Float32Array).slice(0, 16);
    return { rx, target, cam, mat, splats, effects, picker, meshes };
  };

  it('squashes only the clicked instance: sy 0.85 at 0.11 s, restored exactly after', () => {
    const { rx, target, cam, mat, meshes } = setup();
    const orig = mat();
    expect(rx.react(target)).toBe(true);
    const frames: number[] = [];
    let maxDev = 0;
    for (let i = 0; i < 12; i++) {
      rx.update(1 / 120, cam);
      const m = new THREE.Matrix4().fromArray(mat());
      const s = new THREE.Vector3();
      m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
      frames.push(s.y);
      maxDev = Math.max(maxDev, Math.abs(s.y - 1));
    }
    expect(Math.min(...frames)).toBeLessThan(0.9);
    expect(Math.min(...frames)).toBeGreaterThanOrEqual(0.84);
    expect(maxDev).toBeGreaterThan(0.1);
    expect(meshes[0].instanceMatrix.updateRanges.length).toBeGreaterThan(0);
    for (let i = 0; i < 400; i++) rx.update(1 / 60, cam);
    expect(mat()).toEqual(orig);
    expect(rx.stats.hovers).toBe(0);
  });

  it('spawns 6 sparkles + leaves, then everything fades out', () => {
    const { rx, target, cam } = setup();
    rx.react(target);
    rx.update(0.05, cam);
    expect(rx.stats.particles).toBeGreaterThanOrEqual(SPARKLES.count + 3);
    for (let i = 0; i < 200; i++) rx.update(1 / 60, cam);
    expect(rx.stats.particles).toBe(0);
  });

  it('600 ms cooldown per target; others are independent', () => {
    const { rx, target, cam } = setup();
    expect(rx.react(target)).toBe(true);
    for (let i = 0; i < 20; i++) rx.update(1 / 60, cam); // 0.33 s
    expect(rx.react(target)).toBe(false);
    for (let i = 0; i < 25; i++) rx.update(1 / 60, cam); // 0.75 s total
    expect(rx.react(target)).toBe(true);
    expect(rx.react({ ...target, id: 'other' })).toBe(true);
  });

  it('3rd click in a row escalates (tree drops an apple) and the streak resets', () => {
    const { rx, target, cam } = setup();
    const step = (s: number): void => {
      for (let i = 0; i < Math.round(s * 60); i++) rx.update(1 / 60, cam);
    };
    rx.react(target);
    step(0.7);
    rx.react(target);
    step(0.7);
    const before = rx.stats.particles;
    rx.react(target);
    rx.update(0.05, cam);
    // 6 sparkles + leaves + 1 apple
    expect(rx.stats.particles).toBeGreaterThan(before + SPARKLES.count + 3);
  });

  it('water click: splat ring; terrain click: sparkles only', () => {
    const { rx, cam, splats } = setup();
    rx.react({ kind: 'water', id: 'water', x: 3, y: 0, z: 4, t: 1 });
    expect(splats.length).toBe(1);
    rx.react({ kind: 'terrain', id: 'terrain', x: 1, y: 1, z: 1, t: 1 });
    rx.update(0.05, cam);
    expect(rx.stats.particles).toBeGreaterThanOrEqual(SPARKLES.count * 2);
  });

  it('reduced motion: 300 ms scale <= 1.02, no particles, no app effects', () => {
    const { rx, target, cam, mat, effects } = setup({ reduced: true });
    rx.react(target);
    let maxS = 0;
    let minS = 9;
    for (let i = 0; i < 30; i++) {
      rx.update(1 / 60, cam);
      const s = new THREE.Vector3();
      new THREE.Matrix4()
        .fromArray(mat())
        .decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
      maxS = Math.max(maxS, s.y);
      minS = Math.min(minS, s.y);
    }
    expect(maxS).toBeLessThanOrEqual(1.0201);
    expect(minS).toBeGreaterThanOrEqual(0.999);
    expect(rx.stats.particles).toBe(0);
    expect(effects).toEqual([]);
    for (let i = 0; i < 20; i++) rx.update(1 / 60, cam);
    expect(rx.stats.hovers).toBe(0);
  });

  it('hover scales one instance by 1.04 and restores', () => {
    const { rx, target, cam, mat } = setup();
    const orig = mat();
    rx.setHover(target);
    for (let i = 0; i < 60; i++) rx.update(1 / 60, cam);
    const s = new THREE.Vector3();
    new THREE.Matrix4().fromArray(mat()).decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
    expect(s.y).toBeCloseTo(1.04, 3);
    rx.setHover(null);
    for (let i = 0; i < 90; i++) rx.update(1 / 60, cam);
    expect(mat()).toEqual(orig);
  });

  it('agent reaction: villager jumps 0.5 u, is held, shows a "!" and clears afterwards', () => {
    const w = world();
    const life = createLife({
      world: w,
      scope: new Scope('t2'),
      seed: 7,
      quality: 'medium',
      water: { splat: () => undefined },
      counters: { agents: 0 } as never,
      getTier: () => 2,
      cameraPos: new THREE.Vector3(0, 40, 0),
    });
    life.onTier(2);
    for (let i = 0; i < 30; i++) life.fixedUpdate(FIXED_STEP);
    const v = life.kinds.villagers!;
    const rx = createReactions({ scope: new Scope('rx2'), seed: 7, life });
    const cam = new THREE.PerspectiveCamera();
    const picker = createPicker({ height: w.height, life });
    const hit = picker.pickRay(v.x[1], v.y[1] + 40, v.z[1], 0, -1, 0)!;
    expect(hit.agent?.index).toBe(1);
    expect(rx.react(hit)).toBe(true);
    expect(v.hold[1]).toBeGreaterThan(1);
    let maxY = 0;
    let bubbles = 0;
    for (let i = 0; i < 40; i++) {
      rx.update(1 / 60, cam);
      maxY = Math.max(maxY, v.ovY[1]);
      bubbles = Math.max(bubbles, rx.stats.particles);
    }
    expect(maxY).toBeGreaterThan(0.35);
    expect(maxY).toBeLessThanOrEqual(0.5 + 1e-3);
    expect(bubbles).toBeGreaterThanOrEqual(SPARKLES.count + 1);
    const x0 = v.x[1];
    for (let i = 0; i < 20; i++) life.fixedUpdate(FIXED_STEP);
    expect(v.x[1]).toBe(x0); // held: not walking while the reaction plays
    for (let i = 0; i < 400; i++) rx.update(1 / 60, cam);
    expect(v.ovY[1]).toBe(0);
    expect(v.ovSy[1]).toBe(1);
  });

  it('crab buries (sy -> 0.1) for ~4 s then pops back', () => {
    const rxm = createReactions({ scope: new Scope('rx3'), seed: 7 });
    const fakeAgent = {
      name: 'crab',
      active: new Uint8Array([1]),
      x: new Float32Array([1]),
      y: new Float32Array([0]),
      z: new Float32Array([1]),
      ovY: new Float32Array(1),
      ovYaw: new Float32Array(1),
      ovRoll: new Float32Array(1),
      ovSx: new Float32Array([1]),
      ovSy: new Float32Array([1]),
      ovSz: new Float32Array([1]),
      hold: new Float32Array(1),
      mesh: { instanceColor: null },
      clearOverlay(i: number) {
        this.ovSy[i] = 1;
        this.ovSx[i] = 1;
        this.ovSz[i] = 1;
      },
    };
    const cam = new THREE.PerspectiveCamera();
    rxm.react({
      kind: 'agent',
      id: 'agent:crab:0',
      x: 1,
      y: 0,
      z: 1,
      t: 1,
      agent: { kind: fakeAgent as never, index: 0 },
    });
    for (let i = 0; i < 60; i++) rxm.update(1 / 60, cam); // 1 s
    expect(fakeAgent.ovSy[0]).toBeLessThan(0.2);
    for (let i = 0; i < 60 * 5; i++) rxm.update(1 / 60, cam); // 6 s
    expect(fakeAgent.ovSy[0]).toBe(1);
    expect(fakeAgent.hold[0]).toBeGreaterThan(3);
  });
});
