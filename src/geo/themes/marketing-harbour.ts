/**
 * Marketing Carnival Pier geometry (M31 TASK-536, D-126). Numbers: content/themes/marketing-harbour.ts.
 * Three variants, pinned by the plan, never rolled (no ledger entry):
 *   sailboat v10     the boardwalk: one planked deck on piles (floating fixture, pivot on the water)
 *   billboardV2 v4   the WELCOME screen: lit stroke word on an emissive board, chasing bulbs, two posts
 *   bunting v5       a bulb arch: two candy poles and a hoop of chasing bulbs (geo/registry.ts appends it)
 * Frames: pivot on the planks, front = +z. The screen is not on the SURFACE.slides cycle: it always
 * says the word. Its flash on the ferry's arrival is a culture-mover scene over the board.
 */
import * as THREE from 'three';
import { HARBOURS } from '../../content/harbours.ts';
import { CARNIVAL_PIER as K, WELCOME_FONT } from '../../content/themes/marketing-harbour.ts';
import { Acc, qEuler } from '../kit.ts';
import { V, V2, baseBox, cylB, put, tubeAlong } from '../parts.ts';
import type { BuildOpts, PropBuilder, PropGeoDef } from '../types.ts';
import { addHook } from './hq.ts';
import { tagMarquee } from './surface-tags.ts';

/** The harbour skeleton's plank top (`kit.deckY`, content/harbours.ts; DOCK planks' top). */
const HARBOUR_KIT_DECK_Y = (HARBOURS.marketing as NonNullable<typeof HARBOURS.marketing>).kit.deckY;
const lit = { emissive: 1, aoAmt: 0, ao: () => 1 } as const;
const screen = { emissive: 2, aoAmt: 0, ao: () => 1 } as const;

/** Flat stroke in the board plane from `a` to `b`. */
function stroke(
  acc: Acc,
  a: readonly [number, number],
  b: readonly [number, number],
  w: number,
  z: number,
  color: string,
): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  // (a little past both ends, so the corners of a polyline close)
  put(
    acc,
    new THREE.PlaneGeometry(len + w * 0.9, w),
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z],
    color,
    {
      ...screen,
      q: qEuler(0, 0, Math.atan2(dy, dx)),
    },
  );
}

function welcomeScreen({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const S = K.screen;
  const hi = lod === 0;
  const acc = new Acc();
  const cy = S.y + S.h / 2;
  const hw = S.w / 2;
  const px = hw - 0.7;
  for (const x of [-px, px]) {
    put(acc, cylB(0.13, 0.11, S.y + 0.4, hi ? 6 : 4, true), [x, 0, -0.05], S.post, { aoAmt: 0.2 });
    if (hi) put(acc, baseBox(0.5, 0.1, 0.7), [x, 0, -0.05], S.post, { aoAmt: 0.2 });
  }
  const f = S.frame;
  put(acc, baseBox(S.w + 2 * f, S.h + 2 * f, S.depth), [0, S.y - f, -0.1], S.frameColor, {
    aoAmt: 0.1,
  });
  const z0 = -0.1 + S.depth / 2 + 0.005;
  put(acc, new THREE.PlaneGeometry(S.w, S.h), [0, cy, z0], S.face, screen);
  // the word, one slot per letter
  const word = S.word;
  const lh = S.h * S.letterH;
  const slot = (S.w - 0.5) / word.length;
  const lw = slot * S.letterW;
  const wy = cy + S.wordY;
  [...word].forEach((ch, k) => {
    const x0 = -hw + 0.25 + slot * (k + 0.5) - lw / 2;
    const y0 = wy - lh / 2;
    if (!hi) {
      // far: the letter as one lit slab
      put(acc, new THREE.PlaneGeometry(lw, lh), [x0 + lw / 2, wy, z0 + 0.01], S.ink, screen);
      return;
    }
    for (const line of WELCOME_FONT[ch])
      for (let i = 0; i + 1 < line.length; i++) {
        const [ax, ay] = line[i];
        const [bx, by] = line[i + 1];
        stroke(
          acc,
          [x0 + ax * lw, y0 + ay * lh],
          [x0 + bx * lw, y0 + by * lh],
          S.stroke,
          z0 + 0.01 + i * 0.001,
          S.ink,
        );
      }
  });
  put(
    acc,
    new THREE.PlaneGeometry(S.bar.w, S.bar.h),
    [0, cy + S.bar.y, z0 + 0.01],
    S.bar.color,
    screen,
  );
  if (!hi) return acc.finish(rng, false, true);
  // chasing bulbs along the top and bottom of the frame
  const chase: THREE.Vector3[] = [];
  for (const y of [S.y + S.h + f, S.y - f])
    for (let i = 0; i < S.bulbs; i++) {
      const p = V(-hw - f + ((i + 0.5) / S.bulbs) * (S.w + 2 * f), y, z0 + 0.03);
      put(
        acc,
        new THREE.OctahedronGeometry(S.bulbR, 0),
        p,
        S.bulbColors[i % S.bulbColors.length],
        lit,
      );
      chase.push(p);
    }
  const g = acc.finish(rng, false, true);
  tagMarquee(g, chase, S.bulbR * 1.4);
  addHook(g, 'screen', { center: [0, cy, z0], size: [S.w, S.h], normal: [0, 0, 1] });
  return g;
}

export function carnivalArch({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const A = K.arch;
  const hi = lod === 0;
  const acc = new Acc();
  const hw = A.w / 2;
  for (const s of [-1, 1]) {
    put(acc, cylB(0.06, 0.05, A.poleH, hi ? 5 : 4, true), [s * hw, 0, 0], A.pole, { aoAmt: 0.15 });
    if (hi) put(acc, cylB(0.066, 0.066, 0.3, 5, true), [s * hw, 0.9, 0], A.band, { aoAmt: 0 });
  }
  const at = (t: number): THREE.Vector3 =>
    V(-hw + 2 * hw * t, A.poleH + A.rise * 4 * t * (1 - t), 0);
  if (!hi) {
    for (const t of [0.3, 0.7])
      put(acc, new THREE.OctahedronGeometry(A.bulbR * 1.6, 0), at(t), A.bulbColors[0], lit);
    const a = at(0);
    put(acc, new THREE.BoxGeometry(2 * hw, 0.05, 0.05), [0, a.y + A.rise * 0.75, 0], A.cable, {
      aoAmt: 0,
    });
    return acc.finish(rng, false, true);
  }
  // the hoop stirs mid-span, never at the poles
  const sway = (p: THREE.Vector3): number => A.wind * Math.max(0, 1 - (p.x / hw) ** 2);
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 6; k++) pts.push(at(k / 6));
  put(acc, tubeAlong(pts, 0.02, 3), [0, 0, 0], A.cable, { aoAmt: 0, windAbs: sway });
  const chase: THREE.Vector3[] = [];
  for (let i = 0; i < A.bulbs; i++) {
    const p = at((i + 0.5) / A.bulbs);
    put(acc, new THREE.OctahedronGeometry(A.bulbR, 0), p, A.bulbColors[i % 3], {
      ...lit,
      windAbs: sway(p),
    });
    chase.push(p);
  }
  const g = acc.finish(rng, false, true);
  tagMarquee(g, chase, A.bulbR * 1.4);
  return g;
}

/** `sailboat` v10: the boardwalk, centre at the pivot, its top at `deckY` over the water. */
export function carnivalDeck({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const D = K.deck;
  const hi = lod === 0;
  const acc = new Acc();
  const top = HARBOUR_KIT_DECK_Y;
  const hw = D.w / 2;
  const hd = D.d / 2;
  put(acc, new THREE.BoxGeometry(D.w, D.thick, D.d), [0, top - D.thick / 2 - 0.01, 0], D.gapTone, {
    aoAmt: 0.1,
  });
  if (hi) {
    // plank tops in three tones, the seam shows the slab between them; two beams under the slab
    const n = Math.floor(D.w / D.plank);
    const pw = D.w / n;
    const planks = rng.fork('planks');
    for (let i = 0; i < n; i++) {
      const tone = D.tones[planks.int(0, D.tones.length - 1)];
      const g = new THREE.PlaneGeometry(pw - 0.04, D.d - 0.02).rotateX(-Math.PI / 2);
      put(acc, g, [-hw + (i + 0.5) * pw, top, 0], tone, { aoAmt: 0.05, noJitter: true });
    }
    for (const z of [-hd + 0.3, hd - 0.3])
      put(acc, new THREE.BoxGeometry(D.w, 0.16, 0.16), [0, top - D.thick - 0.08, z], D.beam, {
        aoAmt: 0.25,
      });
  } else {
    put(acc, new THREE.PlaneGeometry(D.w, D.d).rotateX(-Math.PI / 2), [0, top, 0], D.tones[0], {
      aoAmt: 0,
    });
  }
  // the piles: rows along the two long edges (LOD1: the corners)
  const nx = hi ? Math.round(D.w / D.pile) : 1;
  for (let i = 0; i <= nx; i++)
    for (const z of [-hd + 0.15, hd - 0.15])
      put(
        acc,
        cylB(D.pileR, D.pileR * 0.85, top, hi ? 5 : 4, !hi),
        [-hw + 0.15 + (i * (D.w - 0.3)) / nx, 0, z],
        D.pileColor,
        { aoAmt: 0.3 },
      );
  const P = D.pennant;
  const x = -hw + 0.3;
  const z = -hd + 0.3;
  put(acc, cylB(0.03, 0.025, P.pole, 4, true), [x, top, z], D.beam, { aoAmt: 0 });
  if (hi) {
    const tri = new THREE.Shape([V2(0, 0.14), V2(0, -0.14), V2(P.flag, 0)]);
    put(acc, new THREE.ShapeGeometry(tri), [x, top + P.pole - 0.16, z], P.color, {
      double: true,
      aoAmt: 0,
      ao: () => 1,
      windAbs: P.wind,
    });
  }
  return acc.finish(rng, false, true);
}

/** `billboardV2` v4: the WELCOME screen, appended after the sea signs. */
export function withWelcomeScreen(def: PropGeoDef): PropGeoDef {
  const own = def.heights ?? Array.from({ length: def.variants }, () => def.height);
  const build: PropBuilder = (o) =>
    o.variant === K.screen.variant ? welcomeScreen(o) : def.build(o);
  return {
    ...def,
    variants: K.screen.variant + 1,
    heights: [...own, K.screen.height],
    build,
    lod1Of: { ...def.lod1Of },
  };
}
