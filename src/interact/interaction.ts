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
import { createBursts } from '../render/particles/bursts.ts';
import { clearHover, setHover } from '../render/materials/hover.ts';
import { SHARED } from '../render/uniforms.ts';
import { createReactions, type ReactionTarget } from '../anim/reactions.ts';
import {
  ClickFilter,
  makeRay,
  PropHash,
  Picker,
  screenRay,
  type AgentSource,
  type PickCamera,
  type PickHit,
  type PropProxies,
  type Ray,
} from './picking.ts';

/**
 * Pointer interaction for one world (TASK-162): picking, 10 Hz hover tint + cursor, the click
 * jitter filter, reactions and their particle bursts, fish scatter from the cursor, and the
 * reduced-motion switches. Built per world (`buildWorldView`), torn down with the world scope.
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
  const n = store.count;
  const slotA = new Int32Array(n).fill(-1);
  const groupA = new Int32Array(n).fill(-1);
  const slotB = new Int32Array(n).fill(-1);
  const groupB = new Int32Array(n).fill(-1);
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
  const px: number[] = [];
  const py: number[] = [];
  const pz: number[] = [];
  const pr: number[] = [];
  const ph: number[] = [];
  const pid: number[] = [];
  const pdef: number[] = [];
  const slotByStore = new Int32Array(n).fill(-1);
  const bbox = new THREE.Box3();
  for (const g of groups) {
    if (g.lod !== 0 || g.groundCover || skip.has(g.def.id)) continue;
    if ((g.def.flags & (PropFlag.underwater | PropFlag.groundCover)) !== 0) continue;
    const geo = g.mesh.geometry;
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
    for (const i of g.members) {
      if (i < 0) continue;
      const s = store.scale[i];
      slotByStore[i] = px.length;
      px.push(store.x[i]);
      py.push(store.y[i] + y0 * s);
      pz.push(store.z[i]);
      pr.push(baseR * s);
      ph.push(Math.max(0.3, baseH * s));
      pid.push(i);
      pdef.push(store.defId[i]);
    }
  }
  const proxies: PropProxies = {
    count: px.length,
    id: Int32Array.from(pid),
    def: Uint16Array.from(pdef),
    x: Float32Array.from(px),
    y: Float32Array.from(py),
    z: Float32Array.from(pz),
    r: Float32Array.from(pr),
    h: Float32Array.from(ph),
  };
  const hf = world.height;
  const hash = new PropHash(
    proxies,
    {
      minX: hf.originX,
      minZ: hf.originZ,
      maxX: hf.originX + (hf.n - 1) * hf.cellSize,
      maxZ: hf.originZ + (hf.n - 1) * hf.cellSize,
    },
    PICK.cell,
  );
  const propVisible = (id: number): boolean =>
    (groupA[id] >= 0 && groups[groupA[id]].visible) ||
    (groupB[id] >= 0 && groups[groupB[id]].visible);

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
      const i = hit.id;
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
      const s = slotByStore[hit.id];
      const x = store.x[hit.id];
      const z = store.z[hit.id];
      return {
        x,
        y: store.y[hit.id],
        z,
        r: s >= 0 ? proxies.r[s] : 0.5,
        h: s >= 0 ? proxies.h[s] + (proxies.y[s] - store.y[hit.id]) : 1,
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
    return r ? picker.pick(r) : null;
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
    const key = `${hit.kind}:${hit.name}:${hit.id}`;
    reactions.trigger(key, specFor(hit), target, anchorOf(hit), reduced);
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
        (wasTouch || e.button === 0)
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
        if (pointer.inside && !pointer.touch && !pointer.dragging) hoverAt(pointer.x, pointer.y);
        else if (hover && (!pointer.inside || pointer.dragging)) hoverFrom(null);
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
    get reduced() {
      return reduced;
    },
    get activeReactions() {
      return reactions.active;
    },
  };
}
