import * as THREE from 'three';
import type { AgentKind } from '../life/agents.ts';
import type { BurstAnchor } from '../render/particles/bursts.ts';
import type { Scope } from '../core/scope.ts';
import type { System } from '../core/loop.ts';
import type { Quality } from '../core/params.ts';
import type { Emitter, AppEvents } from '../core/events.ts';
import { createRng } from '../core/rng.ts';
import { DEG } from '../core/math/index.ts';
import type { Counters } from '../capture/api.ts';
import { CAMERA } from '../content/tiers.ts';
import {
  AGENT_REACTIONS,
  HOVER,
  PICK,
  PROP_REACTIONS,
  REACTION_PRESETS,
  type ReactionSpec,
} from '../content/anim.ts';
import { PROP_DEFS } from '../content/props.ts';
import { PropFlag } from '../world/prop-store.ts';
import { heightAt } from '../world/index.ts';
import type { WorldView } from '../render/world-view.ts';
import type { Group } from '../render/props/batcher.ts';
import { createBursts } from '../render/particles/bursts.ts';
import { clearHover, setHover } from '../render/materials/hover.ts';
import { SHARED } from '../render/uniforms.ts';
import { createReactions, type ReactionTarget } from '../anim/reactions.ts';
import {
  ClickFilter,
  makeRay,
  PropPickIndex,
  Picker,
  screenRay,
  type AgentSource,
  type PickCamera,
  type PickHit,
  type ProxyDims,
  type Ray,
} from './picking.ts';

/**
 * Pointer interaction for one world (TASK-162): picking, 10 Hz hover tint + cursor, the click
 * jitter filter, reactions and their particle bursts, fish scatter from the cursor, and the
 * reduced-motion switches. Built per world (`buildWorldView`), torn down with the world scope.
 *
 * Edits (TASK-213): the prop proxies follow every rebuild (`wv.rebuild.onProps` → `refresh`):
 * moved props are re-hashed, removed ones dropped, edit-added ones inserted with their def's
 * proxy. Prop hits carry the edit-model id (`wv.mirror.idOf`) in `id` — what `propRemove` /
 * `propMove` expect — and the render index in `instanceIndex`.
 */
export interface InteractionDeps {
  wv: WorldView;
  camera: THREE.PerspectiveCamera;
  dom: HTMLElement;
  events: Emitter<AppEvents>;
  scope: Scope;
  seed: number;
  quality: Quality;
  counters: Counters;
  /** Engine clock, s. */
  getTime(): number;
  /** Reduced motion at creation (then follows `reducedMotionChanged`). */
  reduced: boolean;
  motionScale: number;
  /** Attach pointer listeners (false in capture mode: scripts drive `pickAt`/`clickAt`). */
  listen: boolean;
}

export interface Interaction {
  /** Runs after the world view (agent matrices are final). */
  system: System;
  /** CPU pick at canvas-relative CSS pixels. */
  pickAt(x: number, y: number): PickHit | null;
  /** Update the hover highlight now (what the 10 Hz tick does). */
  hoverAt(x: number, y: number): PickHit | null;
  /** Pick and start the reaction (what a counted click does). */
  clickAt(x: number, y: number): PickHit | null;
  /**
   * Terrain-only ray-march at canvas-relative CSS pixels (sea plane included; props and agents
   * ignored) — the editor's brush cursor (TASK-212). Reads the live heightfield.
   */
  terrainAt(x: number, y: number): PickHit | null;
  /** Edit mode (TASK-212): no hover tint, cursor or click reactions while on. */
  setSuspended(on: boolean): void;
  /**
   * TASK-213: re-derive the pick proxies and mesh slots of render-store indices `indices`
   * (called automatically after every rebuild's prop rewrite).
   */
  refresh(indices: readonly number[]): void;
  /** Live prop proxies (tests / debugging). */
  readonly proxyCount: number;
  readonly reduced: boolean;
  /** Reactions currently animating. */
  readonly activeReactions: number;
}

const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();

export function createInteraction(d: InteractionDeps): Interaction {
  const { wv, camera, dom } = d;
  const world = wv.world;
  const store = wv.scatter.props;
  const groups = wv.props.groups;
  const kinds = wv.life.kinds as Record<string, AgentKind | undefined>;
  let reduced = d.reduced;
  SHARED.uMotionScale.value = d.motionScale;

  // ---- prop proxies (cylinders from geometry bounds) + store → mesh slot maps
  // (growable: edits append render slots, TASK-213)
  let cap = store.count;
  let slotA = new Int32Array(cap).fill(-1);
  let groupA = new Int32Array(cap).fill(-1);
  let slotB = new Int32Array(cap).fill(-1);
  let groupB = new Int32Array(cap).fill(-1);
  const ensure = (n: number): void => {
    if (n <= cap) return;
    const next = Math.max(n, Math.ceil(cap * 1.25) + 64);
    const grow = (a: Int32Array<ArrayBuffer>): Int32Array<ArrayBuffer> => {
      const b = new Int32Array(next).fill(-1);
      b.set(a);
      return b;
    };
    slotA = grow(slotA);
    groupA = grow(groupA);
    slotB = grow(slotB);
    groupB = grow(groupB);
    cap = next;
  };
  groups.forEach((g, gi) => {
    for (let k = 0; k < g.members.length; k++) {
      const i = g.members[k];
      if (i < 0) continue;
      if (g.lod === 0) {
        slotA[i] = k;
        groupA[i] = gi;
      } else {
        slotB[i] = k;
        groupB[i] = gi;
      }
    }
  });
  const skip = new Set<string>(PICK.skipDefs);
  /** Groups whose instances get pick proxies (LOD0, not ground cover / underwater / skipped). */
  const pickable = (g: Group): boolean =>
    g.lod === 0 &&
    !g.groundCover &&
    !skip.has(g.def.id) &&
    (g.def.flags & (PropFlag.underwater | PropFlag.groundCover)) === 0 &&
    !(g.members.length && g.members[0] < 0);
  const bbox = new THREE.Box3();
  /** Unit-scale proxy of a group's geometry (cached per geometry). */
  const dimsCache = new Map<Group['mesh']['geometry'], ProxyDims>();
  const dimsOf = (g: Group): ProxyDims => {
    const geo = g.mesh.geometry;
    let dims = dimsCache.get(geo);
    if (dims) return dims;
    if (!geo.boundingBox) geo.computeBoundingBox();
    bbox.copy(geo.boundingBox!);
    const ov = PICK.proxy[g.def.id];
    const sizeX = bbox.max.x - bbox.min.x;
    const sizeZ = bbox.max.z - bbox.min.z;
    const baseR = ov
      ? ov[0]
      : Math.max(PICK.minRadius, (Math.sqrt(sizeX * sizeZ) / 2) * PICK.radiusFit);
    const baseH = ov ? ov[1] : (bbox.max.y - Math.min(0, bbox.min.y)) * PICK.heightFit;
    const y0 = ov ? 0 : Math.min(0, bbox.min.y);
    dims = [baseR, baseH, y0];
    dimsCache.set(geo, dims);
    return dims;
  };
  const items: { i: number; dims: ProxyDims }[] = [];
  for (const g of groups) {
    if (!pickable(g)) continue;
    const dims = dimsOf(g);
    for (const i of g.members) if (i >= 0) items.push({ i, dims });
  }
  const hf = world.height;
  const pickIndex = new PropPickIndex(
    store,
    items,
    {
      minX: hf.originX,
      minZ: hf.originZ,
      maxX: hf.originX + (hf.n - 1) * hf.cellSize,
      maxZ: hf.originZ + (hf.n - 1) * hf.cellSize,
    },
    PICK.cell,
  );
  const hash = pickIndex.hash;
  const proxies = hash.props;
  const propVisible = (id: number): boolean =>
    (groupA[id] >= 0 && groups[groupA[id]].visible) ||
    (groupB[id] >= 0 && groups[groupB[id]].visible);

  /** Group → index in `groups` (refreshed when edits created groups). */
  const groupIndex = new Map<Group, number>();
  const indexOfGroup = (g: Group): number => {
    if (groupIndex.size !== groups.length) {
      groupIndex.clear();
      groups.forEach((x, gi) => groupIndex.set(x, gi));
    }
    return groupIndex.get(g) ?? -1;
  };
  const refresh = (indices: readonly number[]): void => {
    // mesh slots (appended instances, reallocated groups)
    for (const i of indices) {
      if (i < 0 || i >= store.count) continue;
      ensure(i + 1);
      const sl = wv.props.slotsOf(i);
      groupA[i] = slotA[i] = groupB[i] = slotB[i] = -1;
      if (sl)
        for (const { g, k } of sl) {
          const gi = indexOfGroup(g);
          if (g.lod === 0) {
            slotA[i] = k;
            groupA[i] = gi;
          } else {
            slotB[i] = k;
            groupB[i] = gi;
          }
        }
    }
    // proxies: re-hashed from the store (removed → dropped)
    pickIndex.refresh(store, indices, (i) => {
      const g = groupA[i] >= 0 ? groups[groupA[i]] : null;
      return g && pickable(g) ? dimsOf(g) : null;
    });
  };

  // ---- agents
  const sources: AgentSource[] = [];
  for (const [name, o] of Object.entries(PICK.agents)) {
    const k = kinds[name];
    if (!k) continue;
    if (o) {
      k.pickRadius = o[0];
      k.pickHeight = o[1];
    }
    sources.push({ name, capacity: k.capacity, fill: (out, ids) => k.positions(out, ids) });
  }

  let maxY = 1;
  for (const i of world.islands) maxY = Math.max(maxY, i.peakY);
  const ground = (x: number, z: number): number => heightAt(hf, x, z);
  const picker = new Picker({
    march: { ...PICK.march, heightAt: ground, maxY: maxY + 5 },
    hash,
    defNames: PROP_DEFS.map((p) => p.id),
    agents: sources,
    propVisible,
    propId: (i) => wv.mirror.idOf(i),
    near: camera.near,
    far: Math.min(camera.far, 2500),
  });

  // ---- bursts + reactions
  const bursts = createBursts(d.scope, d.quality);
  bursts.mesh.name = 'bursts';
  wv.group.add(bursts.mesh);
  d.scope.defer(() => bursts.mesh.removeFromParent());
  const reactions = createReactions({
    bursts,
    rng: createRng(d.seed).fork('react'),
    time: d.getTime,
    viewAxis(out) {
      camera.getWorldDirection(out);
      out.y = 0;
      if (out.lengthSq() < 1e-6) out.set(1, 0, 0);
      out.normalize();
    },
  });
  d.scope.defer(() => reactions.clear());
  /** Render indices of props clicked while reactions run (an edit to one cancels them). */
  const reacting = new Set<number>();
  d.scope.defer(
    wv.rebuild.onProps({
      // a reaction restores its saved matrix when it ends: stop it before the edit rewrites
      before(ids) {
        if (!reacting.size) return;
        if (reactions.active === 0) {
          reacting.clear();
          return;
        }
        if (ids.some((i) => reacting.has(i))) {
          reactions.clear();
          reacting.clear();
        }
      },
      after: refresh,
    }),
  );

  const offReduced = d.events.on('reducedMotionChanged', (e) => {
    reduced = e.reduced;
    SHARED.uMotionScale.value = e.motionScale;
  });
  d.scope.defer(offReduced);
  d.scope.defer(() => {
    clearHover();
    SHARED.uMotionScale.value = 1;
    dom.style.cursor = '';
  });

  // ---- ray + target helpers
  const ray: Ray = makeRay();
  const pcam: PickCamera = {
    px: 0,
    py: 0,
    pz: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    ux: 0,
    uy: 0,
    uz: 0,
    fx: 0,
    fy: 0,
    fz: 0,
    tanHalf: 1,
    aspect: 1,
  };
  const rayAt = (x: number, y: number): Ray | null => {
    const rect = dom.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    camera.updateMatrixWorld();
    camera.matrixWorld.extractBasis(_right, _up, _fwd);
    pcam.px = camera.matrixWorld.elements[12];
    pcam.py = camera.matrixWorld.elements[13];
    pcam.pz = camera.matrixWorld.elements[14];
    pcam.rx = _right.x;
    pcam.ry = _right.y;
    pcam.rz = _right.z;
    pcam.ux = _up.x;
    pcam.uy = _up.y;
    pcam.uz = _up.z;
    pcam.fx = -_fwd.x;
    pcam.fy = -_fwd.y;
    pcam.fz = -_fwd.z;
    pcam.tanHalf = Math.tan(camera.fov * 0.5 * DEG);
    pcam.aspect = rect.width / rect.height;
    return screenRay(ray, pcam, (x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
  };

  const meshesOf = (hit: PickHit): ReactionTarget | null => {
    if (hit.kind === 'prop') {
      const i = hit.instanceIndex;
      const ms: THREE.InstancedMesh[] = [];
      let slot = -1;
      if (groupA[i] >= 0) {
        ms.push(groups[groupA[i]].mesh);
        slot = slotA[i];
      }
      if (groupB[i] >= 0) {
        ms.push(groups[groupB[i]].mesh);
        slot = slotB[i];
      }
      // both LOD groups list the instance in the same member order → same slot
      return ms.length && slot >= 0 ? { meshes: ms, slot, dynamic: false } : null;
    }
    if (hit.kind === 'agent') {
      const k = kinds[hit.name];
      return k ? { meshes: [k.mesh], slot: hit.id, dynamic: true } : null;
    }
    return null;
  };

  const specFor = (hit: PickHit): ReactionSpec => {
    const key = hit.kind === 'prop' ? PROP_REACTIONS[hit.name] : AGENT_REACTIONS[hit.name];
    return REACTION_PRESETS[key ?? 'generic'] ?? REACTION_PRESETS.generic;
  };

  const anchorOf = (hit: PickHit): BurstAnchor => {
    if (hit.kind === 'prop') {
      const i = hit.instanceIndex;
      const s = pickIndex.slotOf(i);
      const x = store.x[i];
      const z = store.z[i];
      return {
        x,
        y: store.y[i],
        z,
        r: s >= 0 ? proxies.r[s] : 0.5,
        h: s >= 0 ? proxies.h[s] + (proxies.y[s] - store.y[i]) : 1,
        floor: Math.max(0, ground(x, z)),
      };
    }
    const k = kinds[hit.name]!;
    return {
      x: k.x[hit.id],
      y: k.y[hit.id],
      z: k.z[hit.id],
      r: k.pickRadius,
      h: k.pickHeight * 2,
      floor: Math.max(0, ground(k.x[hit.id], k.z[hit.id])),
    };
  };

  // ---- hover (10 Hz) + click
  let hover: { hit: PickHit; target: ReactionTarget } | null = null;
  const pointer = { x: 0, y: 0, inside: false, touch: false, dragging: false };
  let acc = 0;
  const setCursor = (c: string): void => {
    if (dom.style.cursor !== c) dom.style.cursor = c;
  };

  const doPick = (x: number, y: number): PickHit | null => {
    const r = rayAt(x, y);
    const hit = r ? picker.pick(r) : null;
    if (hit && hit.kind === 'prop') hit.rotY = store.rotY[hit.instanceIndex];
    return hit;
  };

  let suspended = false;
  const terrainOnly = new Picker({
    march: { ...PICK.march, heightAt: ground, maxY: maxY + 5 },
    hash: null,
    defNames: [],
    agents: [],
    near: camera.near,
    far: Math.min(camera.far, 2500),
  });
  const terrainAt = (x: number, y: number): PickHit | null => {
    const r = rayAt(x, y);
    return r ? terrainOnly.pick(r) : null;
  };

  const hoverFrom = (hit: PickHit | null): void => {
    const target = hit && hit.kind !== 'terrain' ? meshesOf(hit) : null;
    hover = hit && target ? { hit, target } : null;
    setCursor(hover ? 'pointer' : '');
    // fish scatter from the water point under the cursor (tier 3 schools)
    if (hit && hit.kind === 'terrain' && hit.water) wv.life.setCursorWorld(hit.x, hit.z);
    else wv.life.setCursorWorld(null);
  };

  const hoverAt = (x: number, y: number): PickHit | null => {
    const hit = doPick(x, y);
    hoverFrom(hit);
    return hit;
  };

  const clickAt = (x: number, y: number): PickHit | null => {
    const hit = doPick(x, y);
    if (!hit || hit.kind === 'terrain') return hit;
    const target = meshesOf(hit);
    if (!target) return hit;
    const key = `${hit.kind}:${hit.name}:${hit.instanceIndex}`;
    reactions.trigger(key, specFor(hit), target, anchorOf(hit), reduced);
    if (hit.kind === 'prop') reacting.add(hit.instanceIndex);
    // the villager's `emote` reaction also drives its wave state (interaction → life API)
    if (hit.kind === 'agent' && hit.name === 'villagers' && !reduced)
      wv.life.kinds.villagers?.wave(hit.id);
    d.events.emit('picked', { kind: `${hit.kind}:${hit.name}`, id: hit.id });
    return hit;
  };

  if (d.listen) {
    const filter = new ClickFilter(CAMERA.clickMaxPx, CAMERA.clickMaxMs);
    const local = (e: PointerEvent): [number, number] => {
      const r = dom.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const touches = new Set<number>();
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
    ): void => {
      dom.addEventListener(type, fn as EventListener);
      d.scope.defer(() => dom.removeEventListener(type, fn as EventListener));
    };
    on('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        touches.add(e.pointerId);
        if (touches.size > 1) filter.cancel();
        else filter.down(e.pointerId, e.clientX, e.clientY, e.timeStamp);
        pointer.touch = true;
        return;
      }
      pointer.touch = false;
      pointer.dragging = true;
      if (e.button === 0) filter.down(e.pointerId, e.clientX, e.clientY, e.timeStamp);
      else filter.cancel();
    });
    on('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      [pointer.x, pointer.y] = local(e);
      pointer.inside = true;
      pointer.dragging = e.buttons !== 0;
    });
    const up = (e: PointerEvent): void => {
      const wasTouch = touches.delete(e.pointerId);
      pointer.dragging = false;
      if (e.type !== 'pointerup') {
        filter.cancel();
        return;
      }
      if (
        filter.up(e.pointerId, e.clientX, e.clientY, e.timeStamp) &&
        (wasTouch || e.button === 0) &&
        !suspended
      ) {
        const [x, y] = local(e);
        clickAt(x, y);
      }
    };
    on('pointerup', up);
    on('pointercancel', up);
    on('pointerleave', () => {
      pointer.inside = false;
      pointer.dragging = false;
    });
  }

  const period = 1 / PICK.hoverHz;
  const system: System = {
    name: 'interaction',
    update(dt) {
      // hover tick: 10 Hz, mouse only, not while dragging
      acc += Math.min(dt, 0.1);
      if (acc >= period) {
        acc %= period;
        if (pointer.inside && !pointer.touch && !pointer.dragging && !suspended)
          hoverAt(pointer.x, pointer.y);
        else if (hover && (!pointer.inside || pointer.dragging || suspended)) hoverFrom(null);
      }
      reactions.update(dt);
      // one highlight uniform: the reduced-motion click flash wins over the hover tint
      const flash = reactions.flash;
      const src = flash ? flash.target : hover ? hover.target : null;
      if (src) {
        const m = src.meshes[0].instanceMatrix.array as Float32Array;
        setHover(
          m[src.slot * 16 + 12],
          m[src.slot * 16 + 13],
          m[src.slot * 16 + 14],
          flash ? flash.strength * HOVER.flash : HOVER.strength,
        );
      } else clearHover();
      d.counters.particles = bursts.update(d.getTime(), camera);
    },
  };

  return {
    system,
    pickAt: doPick,
    hoverAt,
    clickAt,
    terrainAt,
    setSuspended(on) {
      suspended = on;
    },
    refresh,
    get proxyCount() {
      return hash.live;
    },
    get reduced() {
      return reduced;
    },
    get activeReactions() {
      return reactions.active;
    },
  };
}
