/**
 * Bot effects (TASK-592): the one-shot particles of the bots, a pooled burst mesh of their own
 * (`life:bot-fx`, nothing alive = count 0 = no draw call). The workers' sim queues `BotFxEvent`s
 * (done sparkles at the hop apex, the chassis-swap poof); this system turns them into bursts on the
 * engine clock, so a frozen capture shows them exactly and a re-run gives the same particles.
 */
import type * as THREE from 'three';
import { BOT_DONE, BOT_SWAP } from '../content/bot-motion.ts';
import { createRng } from '../core/rng.ts';
import type { System } from '../core/loop.ts';
import type { Quality } from '../core/params.ts';
import type { Scope } from '../core/scope.ts';
import { createBursts, type BurstAnchor, type Bursts } from '../render/particles/bursts.ts';
import type { Workers } from './workers.ts';

const POOL = 96;
const _a: BurstAnchor = { x: 0, y: 0, z: 0, r: 0.35, h: 1, floor: 0 };

export interface BotFx extends System {
  readonly bursts: Bursts;
  /** Particles alive at the last update (tests / counters). */
  alive: number;
}

export function createBotFx(
  group: THREE.Object3D,
  scope: Scope,
  quality: Quality,
  seed: number,
  workers: Workers,
  camera: THREE.Camera,
  time: () => number,
): BotFx {
  const bursts = createBursts(scope, quality, { capacity: POOL });
  bursts.mesh.name = 'life:bot-fx';
  group.add(bursts.mesh);
  scope.defer(() => bursts.mesh.removeFromParent());
  const rng = createRng(seed).fork('botfx');
  workers.fxOn = true;
  scope.defer(() => {
    workers.fxOn = false;
    workers.fx.length = 0;
  });
  const fx: BotFx = {
    name: 'bot-fx',
    bursts,
    alive: 0,
    update() {
      const t = time();
      const q = workers.fx;
      for (let k = 0; k < q.length; k++) {
        const e = q[k];
        _a.x = e.x;
        _a.z = e.z;
        _a.h = e.h;
        _a.floor = e.y;
        if (e.kind === 'done') {
          // sparkles come out at the apex of the hop (their spec delay), so lift the ring by its height
          _a.y = e.y + BOT_DONE.height;
          bursts.emit(BOT_DONE.sparkles, _a, t, rng);
        } else {
          _a.y = e.y;
          bursts.emit(BOT_SWAP.poof, _a, t, rng);
        }
      }
      q.length = 0;
      fx.alive = bursts.update(t, camera);
    },
  };
  return fx;
}
