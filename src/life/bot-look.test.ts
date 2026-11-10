import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BOT_CHASSIS,
  BOT_EYES,
  BOT_HEADS,
  botLook,
  eyesFor,
  packLook,
  unpackLook,
  type BotLook,
} from '../content/bot-look.ts';
import { FIXED_STEP } from '../core/clock.ts';
import { Scope } from '../core/scope.ts';
import { generateWorld } from '../world/index.ts';
import type { FleetSession } from '../fleet/protocol.ts';
import {
  chassisIndex,
  decodeBotCode,
  encodeBotCode,
  eyesIndex,
  headIndex,
  visibleVariants,
} from './bot-code.ts';
import { bindFleetToBots, type BotHost } from './fleet-bots.ts';
import { createLife } from './index.ts';
import { ITEM_STRIDE, LOOK_STRIDE } from './life-material.ts';
import type { Workers } from './workers.ts';

describe('bot instance code (TASK-590)', () => {
  it('round-trips every acc x item x head x eyes through the aSeed integer part', () => {
    for (let acc = 0; acc < 7; acc++)
      for (let item = 0; item <= 15; item++)
        for (let head = 0; head < 3; head++)
          for (let eyes = 0; eyes < 5; eyes++) {
            const code = encodeBotCode({ acc, item, head, eyes });
            // a phase fraction never changes the integer part
            expect(decodeBotCode(code + 0.999)).toEqual({ acc, item, head, eyes });
          }
  });

  it('keeps every sin(aSeed 2pi) / fract(aSeed 7.31) phase whole: the strides are multiples of 100', () => {
    expect(ITEM_STRIDE % 100).toBe(0);
    expect(LOOK_STRIDE % 100).toBe(0);
    expect(LOOK_STRIDE).toBeGreaterThan(ITEM_STRIDE * 15 + 6);
    // float32 keeps a fine phase at the largest code
    const max = encodeBotCode({ acc: 6, item: 15, head: 2, eyes: 4 }) + 0.5;
    expect(new Float32Array([max])[0]).toBe(max);
  });

  it('look -> attributes -> look: head, eyes, shade and chassis survive', () => {
    for (const seed of ['a', 'b', 'coding:3', 'sess-77']) {
      for (const eyes of BOT_EYES) {
        const look = botLook(seed, 'coding', 'engine', eyes);
        const code = encodeBotCode({
          acc: 1,
          item: 0,
          head: headIndex(look.head),
          eyes: eyesIndex(look.eyes),
        });
        const dec = decodeBotCode(code);
        expect(BOT_HEADS[dec.head]).toBe(look.head);
        expect(BOT_EYES[dec.eyes]).toBe(look.eyes);
        // the chassis picks the mesh, the shade the tint: both ride in packLook
        const u = unpackLook(packLook(look));
        expect(u.chassis).toBe(look.chassis);
        expect(u.head).toBe(look.head);
        expect(u.shade).toBe(look.shade);
        expect(chassisIndex(look.chassis)).toBe(BOT_CHASSIS.indexOf(look.chassis));
      }
    }
  });

  it('a bot shows exactly one accessory, one head, one eye glyph set and at most one item', () => {
    for (const eyes of [0, 1, 2, 3, 4]) {
      const v = visibleVariants(encodeBotCode({ acc: 3, item: 10, head: 2, eyes }) + 0.25);
      expect(v).toEqual([3, 32, 40 + 2 * 5 + eyes, 16]);
    }
    expect(visibleVariants(5.5)).toEqual([5, 30, 40]);
  });
});

describe('workers wear their look (TASK-590)', () => {
  const world = generateWorld(1001);
  const cam = new THREE.Vector3(0, 400, 0);
  const make = (): { life: ReturnType<typeof createLife>; w: Workers } => {
    const life = createLife({
      world,
      scope: new Scope('bot-look-test'),
      seed: 1001,
      quality: 'medium',
      water: { splat: () => undefined },
      counters: { agents: 0 } as never,
      getTier: () => 2,
      cameraPos: cam,
    });
    life.onTier(2);
    return { life, w: life.kinds.workers as Workers };
  };

  it('resident bots take botLook(`${island}:${rank}`) and every chassis mesh holds exactly its bots', () => {
    const { life, w } = make();
    for (let i = 0; i < 90; i++) life.fixedUpdate(FIXED_STEP);
    // the camera reveals each bot by distance (TASK-651): stand next to the first awake one
    const first = Array.from({ length: w.capacity }, (_, k) => k).find((k) => w.active[k])!;
    cam.set(w.x[first], w.y[first] + 10, w.z[first]);
    for (let i = 0; i < 90; i++) life.fixedUpdate(FIXED_STEP);
    life.update(1, 0);
    const meshes = life.group.children.filter(
      (c): c is THREE.InstancedMesh =>
        c instanceof THREE.InstancedMesh && c.name.startsWith('life:workers'),
    );
    expect(meshes.map((m) => m.name).sort()).toEqual([
      'life:workers',
      'life:workers-hauler',
      'life:workers-spire',
    ]);
    const per = [0, 0, 0];
    const sim = [0, 0, 0];
    let shown = 0;
    for (let i = 0; i < w.capacity; i++) {
      if (!w.active[i]) continue;
      sim[w.chassisOf(i)]++;
      if (w.vis[i] === 0) continue;
      per[w.chassisOf(i)]++;
      shown++;
    }
    expect(shown).toBeGreaterThan(0);
    expect(meshes.reduce((n, m) => n + (m.visible ? m.count : 0), 0)).toBe(shown);
    const byName = (n: string): THREE.InstancedMesh => meshes.find((m) => m.name === n)!;
    expect(byName('life:workers').count).toBe(per[0]);
    expect(byName('life:workers-hauler').count).toBe(per[1]);
    expect(byName('life:workers-spire').count).toBe(per[2]);
    // all three silhouettes occur among the residents of the seed
    expect(sim.filter((n) => n > 0).length).toBeGreaterThanOrEqual(2);
    // idle residents: eyes idle, look is the hash of the seed string
    for (let i = 0; i < w.capacity; i++) {
      if (!w.active[i]) continue;
      expect(w.lookOf(i).eyes).toBe('idle');
      expect(w.lookOf(i).role).toBe('');
    }
    // the shared material is one program
    expect(new Set(meshes.map((m) => m.material)).size).toBe(1);
  });

  it('a fleet look swaps the chassis only at rest, eyes at once; release restores the resident look', () => {
    const { life, w } = make();
    const STATE_WORK = 4;
    for (let i = 0; i < 60; i++) life.fixedUpdate(FIXED_STEP);
    const seated = [...Array(w.capacity).keys()].find(
      (i) => w.active[i] && w.stateOf(i) === STATE_WORK,
    )!;
    expect(seated).toBeGreaterThanOrEqual(0);
    const before = w.chassisOf(seated);
    const other = BOT_CHASSIS[(before + 1) % 3];
    const want: BotLook = {
      ...w.lookOf(seated),
      chassis: other,
      head: 'cam',
      shade: 2,
      role: 'engine',
      item: 'wrench',
      eyes: 'gate',
    };
    w.setLook(seated, want);
    life.update(1, 0);
    expect(w.chassisOf(seated)).toBe(chassisIndex(other));
    expect(w.lookOf(seated).head).toBe('cam');
    expect(decodeBotCode(w.seedOf(seated))).toMatchObject({ head: 2, eyes: 2, item: 10 });
    w.setLook(seated, null);
    life.update(1, 0);
    expect(w.chassisOf(seated)).toBe(before);
    expect(w.lookOf(seated).eyes).toBe('idle');
    expect(decodeBotCode(w.seedOf(seated)).item).not.toBe(10);
  });

  it('a walking bot keeps its chassis until it rests', () => {
    const { life, w } = make();
    const STATE_WALK = 0;
    for (let i = 0; i < 30; i++) life.fixedUpdate(FIXED_STEP);
    const walker = [...Array(w.capacity).keys()].find(
      (i) => w.active[i] && w.stateOf(i) === STATE_WALK,
    );
    if (walker === undefined) return; // every bot happened to be resting at this seed / step
    const before = w.chassisOf(walker);
    w.setLook(walker, {
      ...w.lookOf(walker),
      chassis: BOT_CHASSIS[(before + 1) % 3],
      eyes: 'done',
    });
    life.update(1, 0);
    expect(w.chassisOf(walker)).toBe(before);
    expect(w.lookOf(walker).eyes).toBe('done');
  });
});

describe('fleet binding hands the session look to the host (TASK-590)', () => {
  const sess = (id: string, over: Partial<FleetSession> = {}): FleetSession =>
    ({
      id,
      island: 'coding',
      status: 'running',
      title: id,
      agent: 'Engine',
      ...over,
    }) as FleetSession;

  it('uses botLook(sessionId, island, agent, eyesFor(status, pending gate)) and clears it on release', () => {
    const sessions = new Map<string, FleetSession>();
    const gates = new Map<string, never>();
    const subs = new Set<() => void>();
    const store = {
      sessions,
      gates,
      subscribe: (cb: () => void) => (subs.add(cb), () => subs.delete(cb)),
    };
    const looks = new Map<number, BotLook | null>();
    const host: BotHost = {
      residentsOf: (k) => (k === 1 ? [10, 11, 12] : []),
      pin: () => undefined,
      unpin: () => undefined,
      setLook: (i, l) => void looks.set(i, l),
    };
    const fb = bindFleetToBots(store as never, { kinds: { workers: host } }, { releaseDelayS: 5 });
    const poke = (): void => subs.forEach((cb) => cb());
    sessions.set('s1', sess('s1'));
    poke();
    fb.update(1);
    const bot = fb.boundBots()[0].bot;
    expect(looks.get(bot)).toEqual(botLook('s1', 'coding', 'engine', eyesFor('running')));
    expect(looks.get(bot)?.item).toBe('wrench');
    // waiting with a pending gate asks, without one it idles
    sessions.set('s1', sess('s1', { status: 'waiting' }));
    poke();
    fb.update(2);
    expect(looks.get(bot)?.eyes).toBe('idle');
    gates.set('g1', { status: 'pending', fromSessionId: 's1' } as never);
    poke();
    fb.update(3);
    expect(looks.get(bot)?.eyes).toBe('gate');
    sessions.set('s1', sess('s1', { status: 'error' }));
    poke();
    fb.update(4);
    expect(looks.get(bot)?.eyes).toBe('error');
    sessions.delete('s1');
    poke();
    fb.update(5);
    fb.update(20);
    expect(looks.get(bot)).toBeNull();
  });
});
