/**
 * DevOps "Ember Works" structures (TASK-402): containerYard (stacks, gantry crane, control tower), foundry,
 * smithy, railTrack — plus the cargo ship the movers sail (not a prop). Sizes and colours:
 * content/props-themes/devops.ts DEVOPS_WORKS. One variant each (one draw call per def).
 * Local frame: x = width, z = depth, the fixture's rotY faces local +z; ground at y = 0.
 * Glow (night): window panes, the furnace mouth, lava trough and forge coals are emissive 1.
 */
import * as THREE from 'three';
import { DEVOPS_WORKS as W } from '../../content/props-themes/devops.ts';
import { createRng } from '../../core/rng.ts';
import type { Rng } from '../../core/rng.ts';
import { Acc, col, qEuler, qFromTo } from '../kit.ts';
import { Spin, fan, finishSpin } from '../office-kit.ts';
import { V, V2, baseBox, cylB, gableRoof, jitterAcc, prism, put, windowAt } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';

const UP = V(0, 1, 0);
const finish = (acc: Acc, rng: BuildOpts['rng']): THREE.BufferGeometry =>
  acc.finish(rng, false, true);
const lighten = (hex: string, t: number): THREE.Color => col(hex).lerp(col('#FFFFFF'), t);

/** Square beam from a to b (thickness `th`). */
function beam(acc: Acc, a: THREE.Vector3, b: THREE.Vector3, th: number, color: string): void {
  const d = b.clone().sub(a);
  put(acc, baseBox(th, d.length(), th), a, color, { q: qFromTo(UP, d), aoAmt: 0 });
}

/* ------------------------------- containers -------------------------------- */

/** One container (length along x) with its base centre at `at`: body, ribs, end doors. */
function container(acc: Acc, at: THREE.Vector3, color: string, lod: 0 | 1): void {
  const C = W.container;
  put(acc, baseBox(C.l, C.h, C.w), at, color, { aoAmt: 0.12 });
  if (lod === 1) return;
  const rib = lighten(color, 0.18);
  // corrugation ribs on both long sides, a top rail, the door end (+x) with lock bars
  for (const sz of [-1, 1])
    for (let k = 0; k < 3; k++)
      put(
        acc,
        baseBox(0.14, C.h - 0.16, 0.05),
        [at.x - C.l / 2 + 0.7 + k * ((C.l - 1.4) / 2), at.y + 0.08, at.z + sz * (C.w / 2 + 0.02)],
        rib,
        { aoAmt: 0 },
      );
  put(acc, baseBox(C.l + 0.04, 0.1, C.w + 0.04), [at.x, at.y + C.h - 0.1, at.z], rib, { aoAmt: 0 });
  put(acc, baseBox(0.05, C.h - 0.12, C.w - 0.2), [at.x + C.l / 2 + 0.02, at.y + 0.06, at.z], rib, {
    aoAmt: 0,
  });
  put(acc, baseBox(0.05, C.h - 0.3, 0.06), [at.x + C.l / 2 + 0.05, at.y + 0.15, at.z], C.door, {
    aoAmt: 0,
  });
}

/**
 * Container stack at (x, z): columns side by side along z with DEVOPS_WORKS.stack.tiers
 * containers each (tallest at −z; `turn` mirrors it), colours from the palette by `r`.
 */
function stack(
  acc: Acc,
  x: number,
  z0: number,
  turn: boolean,
  r: Rng,
  lod: 0 | 1,
  T: readonly number[] = W.stack.tiers,
): void {
  const C = W.container;
  const pitch = C.w + W.stack.gap;
  T.forEach((tiers, c) => {
    const z = z0 + (turn ? -1 : 1) * (c - (T.length - 1) / 2) * pitch;
    for (let k = 0; k < tiers; k++) {
      const color = C.colors[(c * 3 + k + r.int(0, C.colors.length - 1)) % C.colors.length];
      // stacked with a small stagger along x so the column reads as boxes, not a slab
      container(acc, V(x + (k % 2) * 0.12, k * (C.h + 0.04), z), color, lod);
    }
  });
}

/* ------------------------------ container yard ----------------------------- */

/**
 * Container yard (one prefab, one draw call): three stacks in a row along the quay (local x), the
 * harbour control tower at one end, and a portal gantry crane straddling the middle stack — four legs at (±legX, ±legZ), braced side
 * frames, twin girders from backZ to boomZ (the boom reaches out over the quay at +z), a machine
 * house on the back end, trolley + cab over the boom, cables and a spreader with a container.
 */
export function containerYard({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const G = W.crane;
  const acc = jitterAcc(rng, 0.008);
  const r = rng.fork('colours');
  for (const s of W.yard.stacks) stack(acc, s.x, s.z, s.turn, r, lod);
  const spin = new Spin();
  towerInto(acc, spin, W.yard.tower.x, W.yard.tower.z, lod);
  // the crane straddles the stack at x = crane.x (built in its own frame through acc.xf)
  acc.xf = new THREE.Matrix4().makeTranslation(W.yard.crane.x, 0, 0);
  const hi = lod === 0;
  const top = G.top;
  const th = G.leg;
  // legs + bogies
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      put(acc, baseBox(th, top, th), [sx * G.legX, 0, sz * G.legZ], G.body, { aoAmt: 0.15 });
      if (hi)
        put(acc, baseBox(0.7, 0.45, 1.1), [sx * G.legX, 0, sz * G.legZ], G.steel, { aoAmt: 0.2 });
    }
  // side frames: sill and mid ties along z, an X brace on each side
  for (const sx of hi ? [-1, 1] : []) {
    const x = sx * G.legX;
    put(acc, baseBox(th * 0.8, th * 0.8, 2 * G.legZ), [x, top * 0.42, 0], G.bodyDark, { aoAmt: 0 });
    {
      beam(acc, V(x, 0.5, -G.legZ), V(x, top * 0.42, G.legZ), th * 0.55, G.bodyDark);
      beam(acc, V(x, 0.5, G.legZ), V(x, top * 0.42, -G.legZ), th * 0.55, G.bodyDark);
    }
  }
  // girders (boom out to +z, back end to backZ) and cross beams
  const len = G.boomZ - G.backZ;
  const mid = (G.boomZ + G.backZ) / 2;
  for (const sx of [-1, 1])
    put(acc, baseBox(th * 1.2, 0.7, len), [sx * G.legX, top, mid], G.body, { aoAmt: 0.05 });
  for (const z of hi ? [-G.legZ, G.legZ, G.boomZ - 0.3, G.backZ + 0.3] : [-G.legZ, G.legZ])
    put(acc, baseBox(2 * G.legX + th, 0.5, th), [0, top + 0.1, z], G.bodyDark, { aoAmt: 0 });
  // machine house on the back end
  put(acc, baseBox(2 * G.legX - 0.6, 1.2, 2.2), [0, top + 0.7, G.backZ + 1.4], G.cab, {
    aoAmt: 0.1,
  });
  // trolley + driver's cab under it, over the boom
  const tz = G.boomZ - 3.2;
  if (hi) {
    put(acc, baseBox(2 * G.legX - 0.4, 0.16, 2.4), [0, top + 1.9, G.backZ + 1.4], G.bodyDark, {
      aoAmt: 0,
    });
    put(acc, baseBox(2 * G.legX - 0.4, 0.6, 1.6), [0, top + 0.7, tz], G.bodyDark, { aoAmt: 0.05 });
    put(acc, baseBox(1.1, 1, 1.2), [G.legX - 0.9, top - 1.05, tz], G.cab, { aoAmt: 0.05 });
    windowAt(acc, {
      at: V(G.legX - 0.9, top - 0.5, tz + 0.6),
      yaw: 0,
      w: 0.8,
      h: 0.5,
      frame: G.cab,
      glow: '#FFC870',
    });
    // headblock lamps (red aviation lamps on the boom tip and machine house)
    for (const at of [V(0, top + 0.45, G.boomZ - 0.1), V(0, top + 2.05, G.backZ + 1.4)])
      put(acc, new THREE.IcosahedronGeometry(0.14, 0), at, '#FF5A4A', {
        emissive: 1,
        ao: () => 1,
        aoAmt: 0,
      });
    // cables down to the spreader
    for (const dx of [-0.5, 0.5])
      put(acc, baseBox(0.05, 3.4, 0.05), [dx, top - 3.7, tz], G.cable, { aoAmt: 0 });
  }
  // spreader + the container it carries
  put(acc, baseBox(W.container.l + 0.3, 0.25, 1.2), [0, top - 3.95, tz], G.body, { aoAmt: 0 });
  container(acc, V(0, top - 3.95 - W.container.h - 0.02, tz), W.container.colors[1], lod);
  acc.xf = null;
  return finishSpin(finish(acc, rng), acc, spin);
}

/* ------------------------------ control tower ------------------------------ */

/**
 * Harbour control tower at (ox, oz) of the yard: plinth, octagonal shaft with teal bands, a wider
 * glass cab (warm panes that glow at night) with a balcony ring, a blue cap, a mast with a
 * pinwheel wind indicator (spins via aSpin) and a red lamp. Door at +z.
 */
function towerInto(acc: Acc, spin: Spin, ox: number, oz: number, lod: 0 | 1): void {
  const T = W.tower;
  const hi = lod === 0;
  const seg = hi ? 8 : 6;
  const at = (x: number, y: number, z: number): [number, number, number] => [ox + x, y, oz + z];
  put(acc, baseBox(T.base, 0.5, T.base), at(0, 0, 0), T.trim, { aoAmt: 0.2 });
  put(acc, cylB(T.shaft, T.shaft * 0.86, T.shaftH, seg), at(0, 0.5, 0), T.wall, { aoAmt: 0.2 });
  const y0 = 0.5 + T.shaftH;
  if (hi) {
    for (const y of [2.6, 5.6])
      put(acc, cylB(T.shaft * 0.96, T.shaft * 0.93, 0.35, seg), at(0, y, 0), T.trim, {
        aoAmt: 0,
        s: [1.06, 1, 1.06],
      });
    put(acc, baseBox(0.8, 1.4, 0.12), at(0, 0.5, T.shaft * 0.9), T.trim, { aoAmt: 0 });
    for (const y of [3.8, 6.8])
      windowAt(acc, {
        at: V(...at(0, y, T.shaft * 0.86)),
        yaw: 0,
        w: 0.4,
        h: 0.5,
        frame: T.trim,
        glow: T.glass,
      });
  }
  // cab: floor slab + balcony, glass band, cap
  put(acc, cylB(T.cabW / 2 + 0.35, T.cabW / 2 + 0.35, 0.3, seg), at(0, y0 - 0.3, 0), T.trim, {
    aoAmt: 0,
  });
  put(acc, cylB((T.cabW / 2) * 0.92, T.cabW / 2, T.cabH, seg), at(0, y0, 0), T.glass, {
    emissive: 1,
    ao: () => 1,
    aoAmt: 0,
  });
  if (hi)
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2 + Math.PI / seg;
      const r = T.cabW * 0.49;
      put(acc, baseBox(0.14, T.cabH, 0.14), at(Math.sin(a) * r, y0, Math.cos(a) * r), T.wall, {
        aoAmt: 0,
      });
    }
  put(
    acc,
    cylB(T.cabW / 2 + 0.3, (T.cabW / 2) * 0.6, T.roofH, seg),
    at(0, y0 + T.cabH, 0),
    T.roof,
    {
      aoAmt: 0,
    },
  );
  const ym = y0 + T.cabH + T.roofH;
  put(acc, cylB(0.07, 0.06, T.mast, 5), at(0, ym, 0), T.radar, { aoAmt: 0 });
  if (hi) {
    fan(acc, spin, V(...at(0, ym + T.mast * 0.65, 0.12)), T.radarR * 0.5, T.trim, T.radar, lod);
    put(acc, new THREE.IcosahedronGeometry(0.12, 0), at(0, ym + T.mast + 0.05, 0), '#FF5A4A', {
      emissive: 1,
      ao: () => 1,
      aoAmt: 0,
    });
  }
}

/* --------------------------------- foundry --------------------------------- */

/**
 * Lava foundry: a stone hall with a brick base band and a monitor roof (glowing clerestory),
 * a big arched furnace mouth at +z glowing with lava, a lava trough running out of it, a tipped
 * ladle, two tall brick chimneys at the back (FIXTURE_EMITTERS smoke), an ore heap.
 */
export function foundry({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const Fd = W.foundry;
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const { w, d, h } = Fd;
  put(acc, baseBox(w + 0.4, 0.3, d + 0.4), [0, 0, 0], Fd.iron, { aoAmt: 0.2 });
  put(acc, baseBox(w, h, d), [0, 0.3, 0], Fd.wall, { aoAmt: 0.2 });
  put(acc, baseBox(w + 0.08, 1.1, d + 0.08), [0, 0.3, 0], Fd.brick, { aoAmt: 0.1 });
  // gable roof with a raised monitor (clerestory glow band) along x
  put(
    acc,
    gableRoof(d / 2 + 0.35, Fd.roofRise, w + 0.5).rotateY(Math.PI / 2),
    [0, 0.3 + h, 0],
    Fd.roof,
    {
      aoAmt: 0.05,
    },
  );
  put(acc, baseBox(w * 0.6, 0.55, 1.2), [0, 0.3 + h + Fd.roofRise - 0.25, 0], Fd.lavaHot, {
    emissive: 1,
    ao: () => 1,
    aoAmt: 0,
  });
  put(
    acc,
    gableRoof(0.85, 0.45, w * 0.64).rotateY(Math.PI / 2),
    [0, 0.3 + h + Fd.roofRise + 0.3, 0],
    Fd.roof,
    {
      aoAmt: 0,
    },
  );
  // furnace mouth: trim arch, glowing interior
  const mw = 2.4;
  const mh = 2.2;
  put(acc, baseBox(mw + 0.5, mh + 0.35, 0.2), [0, 0.3, d / 2], Fd.trim, { aoAmt: 0 });
  put(acc, baseBox(mw, mh, 0.12), [0, 0.3, d / 2 + 0.06], Fd.lavaHot, {
    emissive: 1,
    ao: () => 1,
    aoAmt: 0,
  });
  // lava trough out of the mouth (+z), its stone kerbs
  const tl = 2.2;
  put(acc, baseBox(0.9, 0.12, tl), [0, 0.18, d / 2 + tl / 2 + 0.1], Fd.lavaHot, {
    emissive: 1,
    ao: () => 1,
    aoAmt: 0,
  });
  for (const sx of [-1, 1])
    put(acc, baseBox(0.25, 0.32, tl + 0.2), [sx * 0.58, 0, d / 2 + tl / 2 + 0.1], Fd.iron, {
      aoAmt: 0.15,
    });
  if (hi) {
    // side windows (warm), the tipped ladle, ore heap, a yellow hazard band over the mouth
    for (const sx of [-1, 1])
      for (const z of [-1, 1])
        windowAt(acc, {
          at: V((sx * w) / 2, 0.3 + 2.2, z),
          yaw: (sx * Math.PI) / 2,
          w: 0.8,
          h: 0.8,
          frame: Fd.trim,
          glow: '#FFC870',
        });
    for (const x of [-2.4, 2.4])
      windowAt(acc, {
        at: V(x, 0.3 + 2.3, d / 2),
        yaw: 0,
        w: 0.9,
        h: 0.8,
        frame: Fd.trim,
        glow: '#FFC870',
      });
    put(acc, cylB(0.55, 0.7, 0.9, 10), [1.6, 0.55, d / 2 + 1.4], Fd.iron, {
      q: qEuler(0.5, 0, -0.35),
      aoAmt: 0.1,
    });
    put(
      acc,
      new THREE.CylinderGeometry(0.5, 0.5, 0.05, 10),
      [1.75, 1.35, d / 2 + 1.75],
      Fd.lavaHot,
      {
        q: qEuler(0.5, 0, -0.35),
        emissive: 1,
        ao: () => 1,
        aoAmt: 0,
      },
    );
    for (let k = 0; k < 5; k++)
      put(
        acc,
        new THREE.DodecahedronGeometry(0.35 + 0.08 * k, 0),
        [-2.4 + 0.35 * k, 0.45 + 0.08 * k, d / 2 + 1.2 + 0.2 * (k % 2)],
        k % 2 ? '#5A5664' : '#6A6676',
        {
          aoAmt: 0.15,
        },
      );
    for (let i = 0; i < 6; i++)
      put(
        acc,
        baseBox((mw + 0.5) / 6, 0.2, 0.06),
        [-(mw + 0.5) / 2 + (mw + 0.5) / 12 + (i * (mw + 0.5)) / 6, 0.3 + mh + 0.1, d / 2 + 0.12],
        i % 2 ? '#3A3F4D' : Fd.trim,
        {
          aoAmt: 0,
        },
      );
  }
  // chimneys: brick stacks with a yellow band and a dark cap
  const seg = hi ? 10 : 6;
  for (const c of Fd.chimneys) {
    put(acc, cylB(Fd.chimneyR, Fd.chimneyR * 0.82, Fd.chimneyH, seg), [c.x, 0, c.z], Fd.brick, {
      aoAmt: 0.1,
    });
    put(
      acc,
      cylB(Fd.chimneyR * 0.86, Fd.chimneyR * 0.86, 0.4, seg),
      [c.x, Fd.chimneyH * 0.78, c.z],
      Fd.trim,
      {
        aoAmt: 0,
        s: [1.08, 1, 1.08],
      },
    );
    if (hi)
      put(
        acc,
        cylB(Fd.chimneyR * 0.95, Fd.chimneyR * 0.9, 0.25, seg),
        [c.x, Fd.chimneyH, c.z],
        '#3A3F4D',
        { aoAmt: 0 },
      );
  }
  return finish(acc, rng);
}

/* ---------------------------------- smithy --------------------------------- */

/**
 * Smithy workshop: cream timber-framed hut, coral gable roof, a lean-to awning at +z over a
 * brick forge with glowing coals, an anvil, a stone chimney (FIXTURE_EMITTERS smoke).
 */
export function smithy({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const Sm = W.smithy;
  const acc = jitterAcc(rng, 0.015);
  const hi = lod === 0;
  const { w, d, h } = Sm;
  put(acc, baseBox(w, h, d), [0, 0, -0.4], Sm.wall, { aoAmt: 0.18 });
  put(acc, gableRoof(w / 2 + 0.3, Sm.roofRise, d + 0.4), [0, h, -0.4], Sm.roof, { aoAmt: 0.05 });
  // chimney from the forge up past the roof
  put(acc, baseBox(0.55, Sm.chimneyH, 0.55), [Sm.chimney.x, 0, Sm.chimney.z], '#9C8C86', {
    aoAmt: 0.1,
  });
  if (hi) {
    // awning over the forge (+z); forge: brick block with glowing coals
    put(acc, baseBox(w, 0.12, 1.5), [0, h - 0.35, d / 2 + 0.35], Sm.roof, {
      q: qEuler(0.18, 0, 0),
      aoAmt: 0,
    });
    put(acc, baseBox(1.1, 0.8, 0.8), [Sm.chimney.x, 0, d / 2 + 0.2], '#C2675A', { aoAmt: 0.15 });
    put(acc, baseBox(0.8, 0.06, 0.55), [Sm.chimney.x, 0.8, d / 2 + 0.2], Sm.glow, {
      emissive: 1,
      ao: () => 1,
      aoAmt: 0,
    });
    for (const sx of [-1, 1])
      put(acc, baseBox(0.12, h - 0.3, 0.12), [sx * (w / 2 - 0.1), 0, d / 2 + 1.0], Sm.timber, {
        aoAmt: 0.1,
      });
    // timber frame on the walls, door, window
    for (const sx of [-1, 1])
      put(acc, baseBox(0.12, h, 0.08), [sx * (w / 2 - 0.06), 0, d / 2 - 0.36], Sm.timber, {
        aoAmt: 0,
      });
    put(acc, baseBox(w + 0.04, 0.12, 0.08), [0, h * 0.55, d / 2 - 0.36], Sm.timber, { aoAmt: 0 });
    put(acc, baseBox(0.8, 1.5, 0.06), [0.75, 0, d / 2 - 0.36], Sm.timber, { aoAmt: 0 });
    windowAt(acc, {
      at: V(w / 2, 1.4, -0.6),
      yaw: Math.PI / 2,
      w: 0.6,
      h: 0.55,
      frame: Sm.timber,
      glow: '#FFC870',
    });
    // anvil on a stump
    put(acc, cylB(0.22, 0.22, 0.45, 7), [0.6, 0, d / 2 + 0.9], Sm.timber, { aoAmt: 0.1 });
    put(acc, baseBox(0.55, 0.18, 0.22), [0.6, 0.45, d / 2 + 0.9], Sm.anvil, { aoAmt: 0 });
    put(acc, cylB(0.34, 0.3, 0.06, 6), [Sm.chimney.x, Sm.chimneyH, Sm.chimney.z], '#5A5664', {
      aoAmt: 0,
    });
  }
  return finish(acc, rng);
}

/* -------------------------------- railTrack -------------------------------- */

/** One 2 u rail segment along local x ∈ [−1, 1]: ballast bed, four sleepers, two rails. */
export function railTrack({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const R = W.rail;
  const acc = jitterAcc(rng, 0.004);
  const L = R.len;
  if (lod === 1) {
    put(acc, baseBox(L, R.top, R.gauge + 0.5), [0, 0, 0], R.ballast, { aoAmt: 0.1 });
    return finish(acc, rng);
  }
  put(
    acc,
    prism(
      [
        V2(-(R.gauge / 2 + 0.45), 0),
        V2(R.gauge / 2 + 0.45, 0),
        V2(R.gauge / 2 + 0.25, 0.1),
        V2(-(R.gauge / 2 + 0.25), 0.1),
      ],
      L,
    ),
    [0, 0, 0],
    R.ballast,
    { q: qEuler(0, Math.PI / 2, 0), aoAmt: 0.1 },
  );
  for (let k = 0; k < 4; k++)
    put(acc, baseBox(0.24, 0.08, R.gauge + 0.42), [-L / 2 + 0.25 + k * 0.5, 0.08, 0], R.sleeper, {
      aoAmt: 0.05,
    });
  for (const sz of [-1, 1]) {
    put(acc, baseBox(L, 0.03, 0.16), [0, 0.16, (sz * R.gauge) / 2], R.steel, { aoAmt: 0 });
    put(acc, baseBox(L, R.top - 0.19, 0.08), [0, 0.19, (sz * R.gauge) / 2], R.steel, { aoAmt: 0 });
  }
  return finish(acc, rng);
}

/* ------------------------------- cargo ship -------------------------------- */

/**
 * Cargo ship for the harbour movers (render/movers.ts), bow at +z, waterline at y = 0: a two-tone
 * hull with a pointed bow, deck, two rows of containers, the bridge at the stern with a warm
 * window band, an orange funnel. Not a prop: built once, deterministic.
 */
export function buildCargoShip(): THREE.BufferGeometry {
  const Sh = W.ship;
  const acc = new Acc();
  const half = Sh.beam / 2;
  const L = Sh.l;
  // plan outline (x, z) with a pointed bow; extruded up in two colour bands
  const plan = [
    V2(-half, -L / 2),
    V2(half, -L / 2),
    V2(half, L / 2 - 2.4),
    V2(0, L / 2),
    V2(-half, L / 2 - 2.4),
  ];
  const band = (y0: number, y1: number, color: string, inset: number): void => {
    const g = prism(
      plan.map((p) => V2(p.x * (1 - inset), p.y * (1 - inset * 0.3))),
      y1 - y0,
    ).rotateX(-Math.PI / 2);
    put(acc, g, [0, (y0 + y1) / 2, 0], color, { aoAmt: 0 });
  };
  band(-0.4, 0.35, Sh.hullLow, 0.06);
  band(0.35, Sh.deck, Sh.hull, 0);
  band(Sh.deck, Sh.deck + 0.08, Sh.deckCol, 0.05);
  // containers: two rows of three on the fore deck
  const C = W.container;
  const s = 0.42;
  for (let row = 0; row < 2; row++)
    for (let k = 0; k < 3; k++)
      put(
        acc,
        baseBox(C.w * s * 1.6, C.h * s * 1.4, C.l * s * 0.95),
        [(row - 0.5) * (C.w * s * 1.6 + 0.08), Sh.deck + 0.08, -0.6 + k * (C.l * s + 0.12)],
        C.colors[(row * 3 + k * 2) % C.colors.length],
        { aoAmt: 0.1 },
      );
  // bridge + window band + funnel at the stern
  const bz = -L / 2 + 1.2;
  put(acc, baseBox(Sh.beam - 0.4, 1.5, 1.6), [0, Sh.deck + 0.08, bz], Sh.bridge, { aoAmt: 0.1 });
  put(acc, baseBox(Sh.beam - 0.3, 0.35, 1.7), [0, Sh.deck + 0.95, bz], Sh.window, {
    emissive: 1,
    ao: () => 1,
    aoAmt: 0,
  });
  put(acc, baseBox(Sh.beam - 0.2, 0.12, 1.9), [0, Sh.deck + 1.58, bz], Sh.hullLow, { aoAmt: 0 });
  put(acc, cylB(0.32, 0.28, 1.1, 8), [0, Sh.deck + 1.7, bz - 0.3], Sh.funnel, { aoAmt: 0.05 });
  put(acc, new THREE.IcosahedronGeometry(0.1, 0), [0, Sh.deck + 2.9, bz + 0.2], '#FF5A4A', {
    emissive: 1,
    ao: () => 1,
    aoAmt: 0,
  });
  put(acc, cylB(0.04, 0.04, 1.1, 4), [0, Sh.deck + 1.7, bz + 0.2], Sh.bridge, { aoAmt: 0 });
  return acc.finish(createRng(402).fork('cargo-ship'), false, true);
}

/* ------------------------------ quay stock ------------------------------- */

/** containerRow: one loose stack on the quay (DEVOPS_WORKS.row.tiers), colours by the seed. */
export function containerRow({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.01);
  stack(acc, 0, 0, false, rng.fork('colours'), lod, W.row.tiers);
  return finish(acc, rng);
}

/** fuelTank: two horizontal tanks (along x) on grey saddles, an orange band, catwalk, filler. */
export function fuelTank({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const T = W.tank;
  const acc = jitterAcc(rng, 0.01);
  const hi = lod === 0;
  const seg = hi ? 12 : 6;
  const y = 0.35 + T.r;
  for (const sz of [-1, 1]) {
    const z = sz * (T.r + T.gap / 2);
    put(acc, new THREE.CylinderGeometry(T.r, T.r, T.len, seg), [0, y, z], T.body, {
      q: qEuler(0, 0, Math.PI / 2),
      aoAmt: 0.15,
    });
    if (!hi) continue;
    put(acc, new THREE.CylinderGeometry(T.r + 0.03, T.r + 0.03, 0.3, seg), [0, y, z], T.band, {
      q: qEuler(0, 0, Math.PI / 2),
      aoAmt: 0,
    });
    for (const sx of [-1, 1])
      put(
        acc,
        new THREE.SphereGeometry(T.r, seg, 4, 0, Math.PI * 2, 0, Math.PI / 2),
        [sx * (T.len / 2), y, z],
        T.body,
        {
          q: qEuler(0, 0, -sx * (Math.PI / 2)),
          aoAmt: 0.1,
        },
      );
    for (const sx of [-0.9, 0.9])
      put(acc, baseBox(0.25, y - 0.2, T.r * 1.5), [sx, 0, z], T.saddle, { aoAmt: 0.2 });
  }
  put(acc, baseBox(T.len + 0.4, 0.3, 2 * T.r + T.gap + 0.3), [0, 0, 0], T.saddle, { aoAmt: 0.2 });
  if (hi) {
    // catwalk over the tanks, filler pipe down one end
    put(acc, baseBox(T.len * 0.7, 0.06, 0.5), [0, y + T.r + 0.05, 0], T.saddle, { aoAmt: 0 });
    put(acc, baseBox(0.12, y + T.r, 0.12), [T.len / 2 + 0.55, 0, 0], T.band, { aoAmt: 0 });
  }
  return finish(acc, rng);
}

/** forklift: chassis, counterweight, cab cage, mast up front (+z) with forks and a crate pallet. */
export function forklift({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const F = W.forklift;
  const acc = jitterAcc(rng, 0.01);
  const hi = lod === 0;
  put(acc, baseBox(F.w, 0.55, F.l), [0, 0.18, 0], F.body, { aoAmt: 0.15 });
  put(acc, baseBox(F.w, 1.55, 0.25), [0, 0.35, F.l / 2 + 0.25], F.dark, { aoAmt: 0.1 });
  put(acc, baseBox(0.9, 0.5, 0.9), [0, 0.42, F.l / 2 + 0.85], F.pallet, { aoAmt: 0.1 });
  if (hi) {
    for (const sx of [-1, 1])
      for (const z of [-F.l / 3, F.l / 3])
        put(acc, new THREE.CylinderGeometry(0.2, 0.2, 0.16, 8), [sx * (F.w / 2), 0.2, z], F.dark, {
          q: qEuler(0, 0, Math.PI / 2),
          aoAmt: 0,
        });
    put(acc, baseBox(F.w - 0.1, 0.45, 0.4), [0, 0.73, -F.l / 2 + 0.2], F.dark, { aoAmt: 0.1 });
    put(acc, baseBox(0.45, 0.35, 0.45), [0, 0.73, -0.1], F.seat, { aoAmt: 0.1 });
    for (const sx of [-1, 1])
      for (const z of [-0.45, 0.45])
        put(acc, baseBox(0.06, 1.15, 0.06), [sx * (F.w / 2 - 0.08), 0.73, z], F.dark, { aoAmt: 0 });
    put(acc, baseBox(F.w, 0.06, 1.0), [0, 1.88, 0], F.body, { aoAmt: 0 });
    for (const sx of [-0.25, 0.25])
      put(acc, baseBox(0.1, 0.05, 0.95), [sx, 0.36, F.l / 2 + 0.85], F.dark, { aoAmt: 0 });
  }
  return finish(acc, rng);
}

export const DEVOPS_WORKS_GEO: readonly PropGeoDef[] = [
  {
    id: 'containerYard',
    variants: 1,
    build: containerYard,
    footprint: 11,
    height: 12,
    windy: false,
  },
  { id: 'foundry', variants: 1, build: foundry, footprint: 3.8, height: 10, windy: false },
  { id: 'smithy', variants: 1, build: smithy, footprint: 2.1, height: 4.6, windy: false },
  { id: 'railTrack', variants: 1, build: railTrack, footprint: 1.0, height: 0.22, windy: false },
  {
    id: 'containerRow',
    variants: 1,
    build: containerRow,
    footprint: 3.2,
    height: 4.1,
    windy: false,
  },
  { id: 'fuelTank', variants: 1, build: fuelTank, footprint: 1.8, height: 2, windy: false },
  { id: 'forklift', variants: 1, build: forklift, footprint: 0.9, height: 1.9, windy: false },
];
