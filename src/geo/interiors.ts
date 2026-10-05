/**
 * Tier-2 office interiors (TASK-303): one `officeInterior` geometry per shell in
 * OFFICE_INTERIOR_SHELLS (variant = index). Furniture is built exactly at WORK_SPOTS[shell]: a spot
 * is where a worker's hips are; the desk / bench / rack / easel sits `DESK_OFF` ahead along the
 * spot's `face`, a chair at the spot. Lot-local frame, shell floor line = FLOOR_Y (STILT_FLOOR
 * for the stilt hut). Screens and rack LEDs carry emissive = 2 (the TASK-305 "screen" class).
 */
import * as THREE from 'three';
import {
  OFFICE_DEFS,
  OFFICE_INTERIOR_SHELLS,
  WORK_SPOTS,
  type WorkSpot,
} from '../content/offices.ts';
import { OFFICE_COLORS as C } from '../content/palette-offices.ts';
import { THEMES } from '../content/themes.ts';
import { qEuler, type Acc } from './kit.ts';
import { FLOOR_Y, STILT_FLOOR, easel, monitor, plant, rack, sculpture } from './office-kit.ts';
import { V, baseBox, cylB, jitterAcc, put } from './parts.ts';
import type { BuildOpts, Lod } from './types.ts';

/** Desk / bench centre ahead of the spot, and its depth. */
export const DESK_OFF = 0.5;
export const DESK_D = 0.45;

const PASTELS = ['#FF8FB1', '#FFE45C', '#7FD8B3', '#B39DFF', '#5DA9E9'] as const;

interface Ctx {
  acc: Acc;
  lod: Lod;
  /** Floor line (y). */
  fy: number;
  accent: string;
}

/** Spot-local placer: local +z = the worker's facing, +x = their left-hand side mirror (x right). */
function frame(c: Ctx, s: Pick<WorkSpot, 'x' | 'z' | 'face'>) {
  const q = qEuler(0, s.face, 0);
  const at = (lx: number, ly: number, lz: number): THREE.Vector3 =>
    V(lx, ly, lz)
      .applyQuaternion(q)
      .add(V(s.x, c.fy, s.z));
  return { q, at };
}

function chair(c: Ctx, s: WorkSpot, color = c.accent): void {
  if (c.lod === 1) return;
  const { q, at } = frame(c, s);
  const hi = c.lod === 0;
  put(c.acc, new THREE.BoxGeometry(0.36, 0.06, 0.36), at(0, 0.3, 0), color, { q, aoAmt: 0.1 });
  put(c.acc, new THREE.BoxGeometry(0.36, 0.34, 0.05), at(0, 0.5, -0.19), color, { q, aoAmt: 0.1 });
  if (hi) {
    put(c.acc, cylB(0.03, 0.03, 0.27, 4, true), at(0, 0, 0), C.steel, { aoAmt: 0 });
    put(c.acc, new THREE.BoxGeometry(0.42, 0.03, 0.07), at(0, 0.02, 0), C.steel, { q, aoAmt: 0 });
    put(c.acc, new THREE.BoxGeometry(0.07, 0.03, 0.42), at(0, 0.02, 0), C.steel, { q, aoAmt: 0 });
  }
}

/** Desk ahead of the spot with one/two monitors facing the worker. */
function desk(c: Ctx, s: WorkSpot, o: { screens?: 1 | 2; mug?: boolean } = {}): void {
  const { q, at } = frame(c, s);
  const hi = c.lod === 0;
  const cz = DESK_OFF;
  put(c.acc, new THREE.BoxGeometry(1.0, 0.05, DESK_D), at(0, 0.62, cz), C.desk, { q, aoAmt: 0.1 });
  if (hi) {
    for (const x of [-0.46, 0.46])
      put(c.acc, new THREE.BoxGeometry(0.04, 0.6, DESK_D - 0.05), at(x, 0.32, cz), C.deskDark, {
        q,
        aoAmt: 0.15,
      });
  }
  const n = o.screens ?? 1;
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : (i - 0.5) * 0.46;
    const yaw = s.face + Math.PI;
    // body + emissive-2 screen facing the worker (-z local)
    monitor(
      c.acc,
      at(x, 0.93, cz + 0.12),
      yaw - (n === 2 ? (i - 0.5) * 0.35 : 0),
      n === 1 ? 0.5 : 0.4,
      0.3,
      C.screen,
      c.lod,
    );
    if (hi)
      put(c.acc, new THREE.BoxGeometry(0.06, 0.2, 0.06), at(x, 0.72, cz + 0.12), C.steel, {
        q,
        aoAmt: 0,
      });
  }
  if (hi) {
    put(c.acc, new THREE.BoxGeometry(0.34, 0.015, 0.11), at(0, 0.655, cz - 0.1), C.bezel, {
      q,
      aoAmt: 0,
    });
    if (o.mug)
      put(c.acc, cylB(0.04, 0.035, 0.08, 5), at(0.38, 0.645, cz - 0.05), C.white, { aoAmt: 0 });
  }
}

/** Lab bench: long table + a couple of instruments. */
function bench(
  c: Ctx,
  s: WorkSpot,
  o: { len?: number; screen?: boolean; items?: number } = {},
): void {
  const { q, at } = frame(c, s);
  const hi = c.lod === 0;
  const len = o.len ?? 1.5;
  put(c.acc, new THREE.BoxGeometry(len, 0.07, DESK_D + 0.1), at(0, 0.78, DESK_OFF), C.white, {
    q,
    aoAmt: 0.1,
  });
  put(
    c.acc,
    new THREE.BoxGeometry(len - 0.1, 0.7, DESK_D - 0.05),
    at(0, 0.38, DESK_OFF),
    C.steelLight,
    { q, aoAmt: 0.2 },
  );
  if (o.screen)
    monitor(c.acc, at(0, 1.07, DESK_OFF + 0.12), s.face + Math.PI, 0.5, 0.3, C.screen, c.lod);
  if (!hi) return;
  const items = o.items ?? 3;
  for (let i = 0; i < items; i++) {
    const x = -len / 2 + 0.25 + (i * (len - 0.5)) / Math.max(1, items - 1);
    if (i % 2 === 0) {
      put(c.acc, new THREE.CylinderGeometry(0.06, 0.07, 0.16, 6), at(x, 0.9, DESK_OFF), '#BFEAF5', {
        q,
        aoAmt: 0,
      });
      put(
        c.acc,
        new THREE.CylinderGeometry(0.055, 0.055, 0.04, 6),
        at(x, 0.84, DESK_OFF),
        c.accent,
        { q, aoAmt: 0 },
      );
    } else {
      put(c.acc, new THREE.BoxGeometry(0.2, 0.1, 0.16), at(x, 0.86, DESK_OFF), C.dark, {
        q,
        aoAmt: 0,
      });
      put(c.acc, new THREE.PlaneGeometry(0.12, 0.05), at(x, 0.88, DESK_OFF - 0.082), C.screen, {
        q: q.clone().multiply(qEuler(0, Math.PI, 0)),
        emissive: 2,
        aoAmt: 0,
        ao: () => 1,
      });
    }
  }
}

/** Wall shelf with book blocks (local to the lot, faces +z of `yaw`). */
function shelf(c: Ctx, x: number, z: number, yaw: number, len: number, books: number): void {
  const q = qEuler(0, yaw, 0);
  const at = (lx: number, ly: number, lz = 0): THREE.Vector3 =>
    V(lx, ly, lz)
      .applyQuaternion(q)
      .add(V(x, c.fy, z));
  put(c.acc, new THREE.BoxGeometry(len, 1.2, 0.3), at(0, 0.6), C.deskDark, { q, aoAmt: 0.2 });
  if (c.lod === 1) return;
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < books; i++) {
      const w = len / books;
      put(
        c.acc,
        new THREE.BoxGeometry(w * 0.7, 0.28, 0.04),
        at(-len / 2 + w * (i + 0.5), 0.45 + row * 0.5, 0.16),
        PASTELS[(i + row * 2) % PASTELS.length],
        { q, aoAmt: 0 },
      );
    }
}

function rug(c: Ctx, x: number, z: number, w: number, d: number, color: string): void {
  if (c.lod === 1) return;
  put(c.acc, new THREE.BoxGeometry(w, 0.02, d), V(x, c.fy + 0.01, z), color, { aoAmt: 0 });
}

const spots = (shell: string): readonly WorkSpot[] => WORK_SPOTS[shell] ?? [];

/* ---------------------------- per-shell compositions ---------------------------- */

function hqOfficeInterior(c: Ctx): void {
  for (const s of spots('hqOffice')) {
    chair(c, s);
    desk(c, s, { mug: true });
  }
  rug(c, 0, 0.2, 3.6, 1.6, '#F6D5C9');
  shelf(c, 0, -2.2, 0, 3.0, 5);
  plant(c.acc, V(-2.6, c.fy, -1.9), 1.5, c.lod);
  plant(c.acc, V(2.6, c.fy, -1.9), 1.5, c.lod);
}

function meetingInterior(c: Ctx): void {
  const hi = c.lod === 0;
  put(c.acc, cylB(0.62, 0.62, 0.06, hi ? 10 : 6), V(0, c.fy + 0.7, 0), C.desk, { aoAmt: 0.05 });
  put(c.acc, cylB(0.08, 0.08, 0.7, 5, true), V(0, c.fy, 0), C.deskDark, { aoAmt: 0.2 });
  if (hi) put(c.acc, cylB(0.3, 0.3, 0.05, 8), V(0, c.fy, 0), C.deskDark, { aoAmt: 0.1 });
  for (const s of spots('meetingPavilion')) {
    chair(c, s);
    // laptop on the table rim facing the worker
    const { q, at } = frame(c, s);
    put(c.acc, new THREE.BoxGeometry(0.3, 0.02, 0.2), at(0, 0.745, 0.5), C.bezel, { q, aoAmt: 0 });
    monitor(c.acc, at(0, 0.88, 0.58), s.face + Math.PI, 0.3, 0.2, C.screen, c.lod);
  }
  put(c.acc, new THREE.IcosahedronGeometry(0.1, 0), V(0, c.fy + 0.82, 0), c.accent, { aoAmt: 0 });
}

function devOfficeInterior(c: Ctx): void {
  for (const s of spots('devOffice')) {
    chair(c, s);
    desk(c, s, { screens: 2, mug: true });
  }
  rug(c, 0, 0.1, 6.2, 0.7, '#CFE0F5');
  shelf(c, -3.2, -1.5, Math.PI / 2, 1.8, 4);
  plant(c.acc, V(3.0, c.fy, -1.5), 1.5, c.lod);
  // sofa corner
  put(c.acc, new THREE.BoxGeometry(1.4, 0.3, 0.6), V(3.0, c.fy + 0.15, 0.3), c.accent, {
    aoAmt: 0.2,
  });
  put(c.acc, new THREE.BoxGeometry(1.4, 0.4, 0.14), V(3.0, c.fy + 0.5, 0.04), c.accent, {
    aoAmt: 0.2,
  });
}

function devPodInterior(c: Ctx): void {
  for (const s of spots('devPod')) {
    chair(c, s);
    desk(c, s, { screens: 1 });
  }
  plant(c.acc, V(-1.0, c.fy, -1.0), 1.3, c.lod);
  rug(c, 0, 0.4, 2.2, 1.0, '#CFE0F5');
}

function broadcastInterior(c: Ctx): void {
  const hi = c.lod === 0;
  for (const s of spots('broadcastStudio')) {
    if (s.pose === 'type') {
      chair(c, s);
      desk(c, s, { screens: 1 });
    } else {
      // camera on a tripod ahead of the presenter + softbox
      const { q, at } = frame(c, s);
      put(c.acc, new THREE.BoxGeometry(0.22, 0.18, 0.3), at(0, 1.2, 0.55), C.dark, {
        q,
        aoAmt: 0.1,
      });
      put(c.acc, cylB(0.05, 0.05, 0.12, 6), at(0, 1.25, 0.76), C.steel, {
        q: q.clone().multiply(qEuler(Math.PI / 2, 0, 0)),
        aoAmt: 0,
      });
      put(c.acc, new THREE.IcosahedronGeometry(0.03, 0), at(0.08, 1.3, 0.4), C.onAir, {
        emissive: 2,
        aoAmt: 0,
        ao: () => 1,
      });
      if (hi)
        for (const a of [0, 2.1, 4.2])
          put(
            c.acc,
            cylB(0.02, 0.02, 1.15, 3, true),
            at(Math.cos(a) * 0.2, 0.0, 0.55 + Math.sin(a) * 0.2),
            C.steel,
            { aoAmt: 0 },
          );
    }
  }
  // backdrop panel + softbox lights
  put(c.acc, new THREE.PlaneGeometry(2.6, 1.3), V(0, c.fy + 1.2, -1.45), c.accent, {
    aoAmt: 0,
    ao: () => 1,
    emissive: 0.4,
  });
  for (const x of hi ? [-1.5, 1.5] : []) {
    put(c.acc, cylB(0.02, 0.02, 1.3, 3, true), V(x, c.fy, 0.0), C.steel, { aoAmt: 0 });
    put(c.acc, new THREE.BoxGeometry(0.5, 0.4, 0.1), V(x, c.fy + 1.45, 0.0), C.dark, {
      q: qEuler(0, x > 0 ? -0.6 : 0.6, 0),
      aoAmt: 0.1,
    });
    put(
      c.acc,
      new THREE.PlaneGeometry(0.42, 0.32),
      V(x + (x > 0 ? -0.04 : 0.04), c.fy + 1.45, 0.06),
      '#FFF4D6',
      {
        q: qEuler(0, x > 0 ? -0.6 : 0.6, 0),
        emissive: 1,
        aoAmt: 0,
        ao: () => 1,
      },
    );
  }
}

function testLabInterior(c: Ctx): void {
  const hi = c.lod === 0;
  for (const s of spots('testLab')) {
    if (s.pose === 'inspect') bench(c, s, { len: 1.5, items: 3 });
    else {
      chair(c, s);
      desk(c, s, { screens: 1 });
    }
  }
  shelf(c, -1.4, -1.8, 0, 2.2, 4);
  if (hi) {
    // device test rack: phones in a row
    for (let i = 0; i < 5; i++)
      put(
        c.acc,
        new THREE.BoxGeometry(0.16, 0.28, 0.04),
        V(0.2 + i * 0.22, c.fy + 0.9 + (i % 2) * 0.05, -1.82),
        C.dark,
        { aoAmt: 0 },
      );
    for (let i = 0; i < 5; i++)
      put(
        c.acc,
        new THREE.PlaneGeometry(0.12, 0.22),
        V(0.2 + i * 0.22, c.fy + 0.9 + (i % 2) * 0.05, -1.795),
        i === 2 ? C.onAir : C.screen,
        { emissive: 2, aoAmt: 0, ao: () => 1 },
      );
    put(c.acc, baseBox(1.3, 0.8, 0.3), V(0.7, c.fy, -1.8), C.white, { aoAmt: 0.2 });
  }
}

function testLabStiltInterior(c: Ctx): void {
  for (const s of spots('testLabStilt')) {
    if (s.pose === 'inspect') bench(c, s, { len: 1.1, items: 2 });
    else {
      chair(c, s);
      desk(c, s, { screens: 1 });
    }
  }
  plant(c.acc, V(-1.0, c.fy, -1.0), 1.2, c.lod);
}

function atelierInterior(c: Ctx): void {
  const hi = c.lod === 0;
  for (const s of spots('atelier')) {
    if (s.pose === 'paint') {
      const { at } = frame(c, s);
      const p = at(0, 0, 0.62);
      easel(
        c.acc,
        p,
        s.face + Math.PI,
        PASTELS[(Math.round(s.x * 3) + 5) % PASTELS.length],
        1,
        c.lod,
      );
    } else {
      chair(c, s);
      desk(c, s, { screens: 1 });
    }
  }
  // paint table + leaning canvases + sculpture
  put(c.acc, new THREE.BoxGeometry(1.4, 0.06, 0.6), V(-0.4, c.fy + 0.7, -1.4), C.desk, {
    aoAmt: 0.1,
  });
  if (hi) {
    for (const x of [-1.0, 0.2])
      put(c.acc, new THREE.BoxGeometry(0.04, 0.68, 0.5), V(x, c.fy + 0.34, -1.4), C.deskDark, {
        aoAmt: 0.2,
      });
    for (let i = 0; i < 5; i++)
      put(c.acc, cylB(0.07, 0.06, 0.12, 5), V(-0.9 + i * 0.28, c.fy + 0.73, -1.4), PASTELS[i], {
        aoAmt: 0,
      });
  }
  for (let i = 0; i < 3; i++)
    put(
      c.acc,
      new THREE.BoxGeometry(0.7, 0.9, 0.04),
      V(-2.0 + i * 0.12, c.fy + 0.45, -1.75 + i * 0.0),
      PASTELS[(i + 1) % 5],
      {
        q: qEuler(-0.18, 0, 0),
        aoAmt: 0,
      },
    );
  if (hi) sculpture(c.acc, V(2.0, c.fy, -1.3), 0, [c.accent, C.gold], c.lod);
}

function dataCenterInterior(c: Ctx): void {
  const hi = c.lod === 0;
  for (const s of spots('dataCenter')) {
    if (s.pose === 'rack') {
      const { at } = frame(c, s);
      rack(c.acc, at(0, 0, 0.75), s.face + Math.PI, {
        body: C.steel,
        seed: Math.round(s.x * 2) + 3,
        lod: c.lod,
      });
    } else {
      chair(c, s);
      desk(c, s, { screens: 2 });
    }
  }
  // rack row along the back wall (faces +z) + a second row against the right wall
  const n = hi ? 9 : 5;
  for (let i = 0; i < n; i++) {
    const x = -2.8 + i * (5.6 / (n - 1));
    rack(c.acc, V(x, c.fy, -1.45), 0, {
      w: 0.6,
      h: 1.7,
      d: 0.55,
      body: C.steel,
      seed: i,
      lod: c.lod,
    });
  }
  if (hi) {
    for (const z of [-0.4, 0.5])
      rack(c.acc, V(3.0, c.fy, z), -Math.PI / 2, {
        w: 0.6,
        h: 1.7,
        d: 0.55,
        body: C.steel,
        seed: 5 + Math.round(z * 4),
        lod: c.lod,
      });
    // cable tray along the ceiling line of the back row
    put(c.acc, baseBox(6.2, 0.06, 0.3), V(0, c.fy + 1.9, -1.45), C.dark, { aoAmt: 0 });
  }
}

function researchInterior(c: Ctx): void {
  const hi = c.lod === 0;
  for (const s of spots('researchHut')) {
    if (s.pose === 'inspect') {
      bench(c, s, { len: 1.1, items: 2 });
      // microscope
      const { q, at } = frame(c, s);
      put(c.acc, cylB(0.08, 0.08, 0.04, 6), at(0, 0.82, DESK_OFF), C.dark, { q, aoAmt: 0 });
      put(
        c.acc,
        new THREE.CylinderGeometry(0.035, 0.035, 0.26, 5),
        at(0, 0.97, DESK_OFF),
        C.white,
        { q: q.clone().multiply(qEuler(0.4, 0, 0)), aoAmt: 0 },
      );
    } else {
      chair(c, s);
      desk(c, s, { screens: 1 });
    }
  }
  shelf(c, -0.7, -1.2, 0, 1.4, 4);
  if (hi) {
    // star chart on the back wall + globe
    put(c.acc, new THREE.PlaneGeometry(0.9, 0.6), V(0.5, c.fy + 1.3, -1.33), '#2E3A66', {
      emissive: 0.5,
      aoAmt: 0,
      ao: () => 1,
    });
    for (let i = 0; i < 5; i++)
      put(
        c.acc,
        new THREE.PlaneGeometry(0.06, 0.06),
        V(0.2 + i * 0.15, c.fy + 1.2 + (i % 3) * 0.12, -1.325),
        '#FFF6C2',
        { emissive: 1, aoAmt: 0, ao: () => 1 },
      );
    put(c.acc, cylB(0.08, 0.1, 0.05, 6), V(0.9, c.fy, -1.0), C.deskDark, { aoAmt: 0 });
    put(c.acc, new THREE.IcosahedronGeometry(0.16, 1), V(0.9, c.fy + 0.28, -1.0), C.screen, {
      aoAmt: 0,
    });
  }
}

const BUILDERS: Readonly<Record<string, (c: Ctx) => void>> = {
  hqOffice: hqOfficeInterior,
  meetingPavilion: meetingInterior,
  devOffice: devOfficeInterior,
  devPod: devPodInterior,
  broadcastStudio: broadcastInterior,
  testLab: testLabInterior,
  testLabStilt: testLabStiltInterior,
  atelier: atelierInterior,
  dataCenter: dataCenterInterior,
  researchHut: researchInterior,
};

/** Interior of `OFFICE_INTERIOR_SHELLS[variant]`, built at that shell's WORK_SPOTS. */
export function officeInterior({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const shell = OFFICE_INTERIOR_SHELLS[variant % OFFICE_INTERIOR_SHELLS.length];
  const acc = jitterAcc(rng, 0.01);
  const theme = OFFICE_DEFS[shell].theme;
  const c: Ctx = {
    acc,
    lod,
    fy: shell === 'testLabStilt' ? STILT_FLOOR + FLOOR_Y : FLOOR_Y,
    accent: THEMES[theme].accent,
  };
  BUILDERS[shell](c);
  return acc.finish(rng, false, true);
}
