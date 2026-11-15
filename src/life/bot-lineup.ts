/**
 * Bot line-up (TASK-592, `?bots=lineup`, dev shot F-bot-lineup): all nine looks (3 chassis x 3 heads)
 * in all five eye states, standing on the Coding plaza in a grid (column = look, row = eye state).
 * A QA / debug aid: the bots are three extra InstancedMeshes (one per chassis, 15 bots each) on the
 * workers' own life material (same program), posed in closed form from the engine clock: a slow
 * breathing bob, the gate row tips its heads up, the done row hops now and then. No sim, no rng.
 */
import * as THREE from 'three';
import { BOT_CHASSIS, BOT_EYES, BOT_HEADS, roleItem } from '../content/bot-look.ts';
import { BOT_GATE, BOT_LINEUP } from '../content/bot-motion.ts';
import { LAND } from '../content/life.ts';
import { THEMES } from '../content/themes.ts';
import { unitHash } from '../core/hash.ts';
import type { System } from '../core/loop.ts';
import type { Scope } from '../core/scope.ts';
import { SHARED } from '../render/uniforms.ts';
import { encodeBotCode, ROLE_ITEM_CODE } from './bot-code.ts';
import { doneHop, restPose } from './bot-motion.ts';
import type { LifeCtx } from './ctx.ts';
import { buildWorker } from './geo/workers.ts';

const TAU = Math.PI * 2;

export interface BotLineup extends System {
  /** World position of the grid centre (the shot camera aims here). */
  readonly centre: { x: number; y: number; z: number };
  readonly count: number;
}

interface Slot {
  chassis: number;
  col: number;
  row: number;
  x: number;
  y: number;
  z: number;
  phase: number;
}

/** Null when the world has no Coding plaza. */
export function createBotLineup(
  group: THREE.Object3D,
  scope: Scope,
  ctx: LifeCtx,
  material: THREE.Material,
  time: () => number,
): BotLineup | null {
  const L = BOT_LINEUP;
  const isl = ctx.world.islands.find((i) => i.theme === L.island);
  const set = ctx.world.settlements?.find((s) => s.islandId === isl?.id);
  if (!isl || !set) return null;
  const cx = (set.plaza?.x ?? set.hub.x) + L.offset.x;
  const cz = (set.plaza?.z ?? set.hub.z) + L.offset.z;
  const theme = THEMES[L.island];
  const cols = BOT_CHASSIS.length * BOT_HEADS.length;
  const rows = BOT_EYES.length;
  const slots: Slot[] = [];
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const x = cx + (col - (cols - 1) / 2) * L.gapX;
      const z = cz + (row - (rows - 1) / 2) * L.gapZ;
      slots.push({
        chassis: Math.floor(col / BOT_HEADS.length),
        col,
        row,
        x,
        y: ctx.h(x, z) + LAND.footLift,
        z,
        phase: unitHash(ctx.seed, row * cols + col, 0x1ea5),
      });
    }
  const meshes: THREE.InstancedMesh[] = [];
  const members: Slot[][] = [];
  const col = new THREE.Color();
  BOT_CHASSIS.forEach((ch, c) => {
    const mine = slots.filter((s) => s.chassis === c);
    const geo = buildWorker(ch);
    const n = mine.length;
    const seedA = new Float32Array(n);
    const gaitA = new Float32Array(n * 3);
    mine.forEach((s, k) => {
      const head = s.col % BOT_HEADS.length;
      const item = ROLE_ITEM_CODE[roleItem(L.roles[s.col % L.roles.length])];
      seedA[k] = encodeBotCode({ acc: theme.accessory, item, head, eyes: s.row }) + s.phase * 0.999;
      gaitA[k * 3 + 2] = s.phase * TAU;
    });
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedA, 1));
    geo.setAttribute('aGait', new THREE.InstancedBufferAttribute(gaitA, 3));
    const m = new THREE.InstancedMesh(geo, material, n);
    m.name = `life:lineup-${ch}`;
    m.castShadow = false;
    m.receiveShadow = false;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mine.forEach((s, k) => {
      col.set(theme.teamTints[(s.col + s.row) % theme.teamTints.length]);
      m.setColorAt(k, col);
    });
    group.add(m);
    scope.add(geo);
    scope.add(m);
    meshes.push(m);
    members.push(mine);
  });

  const bp = restPose();
  const e = new THREE.Euler(0, 0, 0, 'YZX');
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const mat = new THREE.Matrix4();
  // facing +z (toward a camera south of the grid): the model's +x forward turns by atan2(-dz, dx)
  const yaw = Math.atan2(-1, 0);
  const S = LAND.size.workers;
  return {
    name: 'bot-lineup',
    centre: { x: cx, y: ctx.h(cx, cz), z: cz },
    count: slots.length,
    update() {
      const t = time();
      const ms = SHARED.uMotionScale.value as number;
      meshes.forEach((m, c) => {
        members[c].forEach((s, k) => {
          bp.pitch = bp.y = 0;
          bp.sy = 1;
          const eyes = BOT_EYES[s.row];
          bp.y = L.bob.y * Math.sin((t / L.bob.period + s.phase) * TAU) * ms;
          if (eyes === 'gate') bp.pitch = BOT_GATE.lookPitch * ms;
          if (eyes === 'done') {
            const tt = (t + s.phase * L.doneHopEvery) % L.doneHopEvery;
            bp.sy = 1;
            const hop = restPose();
            if (doneHop(tt, hop)) {
              bp.y += hop.y * ms;
              bp.sy = 1 + (hop.sy - 1) * ms;
            }
          }
          p.set(s.x, s.y + bp.y, s.z);
          e.set(0, yaw, bp.pitch, 'YZX');
          q.setFromEuler(e);
          const sy = S * bp.sy;
          const sxz = S / Math.sqrt(bp.sy);
          sc.set(sxz, sy, sxz);
          mat.compose(p, q, sc);
          m.setMatrixAt(k, mat);
        });
        m.instanceMatrix.needsUpdate = true;
      });
    },
  };
}
