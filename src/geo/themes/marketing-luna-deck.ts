/**
 * Deniz Üstü Lunapark ring platform (M53 TASK-670): `lunaDeck` v0-2 (30 x 22, 36 x 26, 42 x 30 u), one
 * planked ring `ring` wide on piles round an open pool, with a guard rail and a lamp on every post
 * along both edges. Pivot on the water at the centre, the plank top at LOD-independent `deck.top`,
 * front = +z (the sea side). Numbers: content/themes/marketing-luna-look.ts.
 */
import * as THREE from 'three';
import { LUNA_LOOK } from '../../content/themes/marketing-luna-look.ts';
import type { Acc } from '../kit.ts';
import { V, baseBox, cylB, jitterAcc, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { P, bulb } from './marketing-luna-parts.ts';

const K = LUNA_LOOK.deck;

interface Strip {
  cx: number;
  cz: number;
  sx: number;
  sz: number;
  along: 'x' | 'z';
}

/** The four strips of the ring: the two long ones take the corners. */
export function deckStrips(w: number, d: number): Strip[] {
  const rw = K.ring;
  return [
    { cx: 0, cz: -(d / 2 - rw / 2), sx: w, sz: rw, along: 'x' },
    { cx: 0, cz: d / 2 - rw / 2, sx: w, sz: rw, along: 'x' },
    { cx: -(w / 2 - rw / 2), cz: 0, sx: rw, sz: d - 2 * rw, along: 'z' },
    { cx: w / 2 - rw / 2, cz: 0, sx: rw, sz: d - 2 * rw, along: 'z' },
  ];
}

/** Points along the rectangle (hx, hz) every `step`, skipping `gap` ([side, c0, c1]). */
function edgePosts(
  hx: number,
  hz: number,
  step: number,
  gap: { side: 'w' | 'e' | 'n' | 's'; half: number } | null,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const run = (len: number): number[] => {
    const n = Math.max(1, Math.round(len / step));
    return Array.from({ length: n + 1 }, (_, i) => -len / 2 + (i * len) / n);
  };
  for (const x of run(2 * hx)) {
    if (!(gap?.side === 'n' && Math.abs(x) < gap.half)) out.push([x, -hz]);
    if (!(gap?.side === 's' && Math.abs(x) < gap.half)) out.push([x, hz]);
  }
  for (const z of run(2 * hz).slice(1, -1)) {
    if (!(gap?.side === 'w' && Math.abs(z) < gap.half)) out.push([-hx, z]);
    if (!(gap?.side === 'e' && Math.abs(z) < gap.half)) out.push([hx, z]);
  }
  return out;
}

/** Top rail along one edge run, in pieces that skip the gap. */
function railRuns(
  acc: Acc,
  hx: number,
  hz: number,
  y: number,
  gap: { side: 'w' | 'e' | 'n' | 's'; half: number } | null,
  color: string,
): void {
  const th = K.rail.bar;
  const seg = (x0: number, z0: number, x1: number, z1: number): void => {
    const sx = Math.abs(x1 - x0) + th;
    const sz = Math.abs(z1 - z0) + th;
    if (sx < th * 1.5 && sz < th * 1.5) return;
    put(acc, new THREE.BoxGeometry(sx, th, sz), [(x0 + x1) / 2, y, (z0 + z1) / 2], color, {
      aoAmt: 0,
      cls: 'wood',
    });
  };
  const g = gap?.half ?? 0;
  // north (z = -hz) and south (z = +hz) runs along x
  for (const [side, z] of [
    ['n', -hz],
    ['s', hz],
  ] as const) {
    if (gap?.side === side) {
      seg(-hx, z, -g, z);
      seg(g, z, hx, z);
    } else seg(-hx, z, hx, z);
  }
  for (const [side, x] of [
    ['w', -hx],
    ['e', hx],
  ] as const) {
    if (gap?.side === side) {
      seg(x, -hz, x, -g);
      seg(x, g, x, hz);
    } else seg(x, -hz, x, hz);
  }
}

function lunaDeck({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const { w, d } = K.sizes[variant];
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.006);
  const top = K.top;
  const rw = K.ring;
  const strips = deckStrips(w, d);
  for (const s of strips) {
    put(
      acc,
      new THREE.BoxGeometry(s.sx, K.thick, s.sz),
      [s.cx, top - K.thick / 2 - 0.01, s.cz],
      K.gapTone,
      { aoAmt: 0.1, cls: 'wood' },
    );
  }
  if (hi) {
    // plank tops in tones, the seam shows the slab; two beams under each strip
    const planks = rng.fork('planks');
    for (const s of strips) {
      const across = s.along === 'x' ? s.sz : s.sx;
      const len = s.along === 'x' ? s.sx : s.sz;
      const n = Math.round(across / K.plank);
      const pw = across / n;
      for (let i = 0; i < n; i++) {
        const tone = K.tones[planks.int(0, K.tones.length - 1)];
        const off = -across / 2 + (i + 0.5) * pw;
        const g =
          s.along === 'x'
            ? new THREE.PlaneGeometry(len - 0.04, pw - 0.04).rotateX(-Math.PI / 2)
            : new THREE.PlaneGeometry(pw - 0.04, len - 0.04).rotateX(-Math.PI / 2);
        put(acc, g, s.along === 'x' ? [s.cx, top, s.cz + off] : [s.cx + off, top, s.cz], tone, {
          aoAmt: 0.05,
          noJitter: true,
          cls: 'wood',
        });
      }
      for (const o of [-across / 2 + 0.4, across / 2 - 0.4])
        put(
          acc,
          s.along === 'x'
            ? new THREE.BoxGeometry(len, 0.16, 0.16)
            : new THREE.BoxGeometry(0.16, 0.16, len),
          s.along === 'x'
            ? [s.cx, top - K.thick - 0.08, s.cz + o]
            : [s.cx + o, top - K.thick - 0.08, s.cz],
          K.beam,
          { aoAmt: 0.25, cls: 'wood' },
        );
    }
  } else {
    for (const s of strips)
      put(
        acc,
        new THREE.PlaneGeometry(s.sx, s.sz).rotateX(-Math.PI / 2),
        [s.cx, top, s.cz],
        K.tones[0],
        {
          aoAmt: 0,
        },
      );
  }
  // piles under both edges
  const pileH = top + K.pileDepth;
  const piles = [
    ...edgePosts(w / 2 - 0.15, d / 2 - 0.15, K.pile, null),
    ...edgePosts(w / 2 - rw + 0.15, d / 2 - rw + 0.15, K.pile, null),
  ];
  const pileSet = hi ? piles : piles.filter((_, i) => i % 3 === 0);
  for (const [x, z] of pileSet)
    put(
      acc,
      cylB(K.pileR, K.pileR * 0.85, pileH, hi ? 5 : 4, !hi),
      [x, -K.pileDepth, z],
      K.pileColor,
      { aoAmt: 0.3, cls: 'wood' },
    );
  // guard rail: outer edge (gap at the pier, -x) and pool edge (gap at the boat landing, +z)
  const R = K.rail;
  const outer = {
    hx: w / 2 - 0.12,
    hz: d / 2 - 0.12,
    gap: { side: 'w', half: K.entry / 2 } as const,
  };
  const inner = {
    hx: w / 2 - rw + 0.12,
    hz: d / 2 - rw + 0.12,
    gap: { side: 's', half: K.landing / 2 } as const,
  };
  let k = 0;
  for (const e of [outer, inner]) {
    railRuns(acc, e.hx, e.hz, top + R.h, e.gap, R.top);
    const posts = edgePosts(e.hx, e.hz, R.post, e.gap);
    for (const [x, z] of posts) {
      k++;
      if (hi)
        put(acc, cylB(R.postR, R.postR, R.h, 4, true), [x, top, z], R.color, {
          aoAmt: 0,
          cls: 'wood',
        });
      if (hi || k % K.thin === 0)
        bulb(acc, V(x, top + R.h + 0.12, z), R.bulb, LUNA_LOOK.bulbs[k % LUNA_LOOK.bulbs.length]);
    }
  }
  // the boat landing: a step down at the pool rail's gap (hi only)
  if (hi) {
    const zl = d / 2 - rw;
    put(acc, baseBox(K.landing - 0.4, 0.12, 0.7), [0, top - 0.37, zl - 0.35], P.woodLight, {
      aoAmt: 0.1,
      cls: 'wood',
    });
  }
  return acc.finish(rng, false, true);
}

export const LUNA_DECK_GEO: readonly PropGeoDef[] = [
  {
    id: 'lunaDeck',
    variants: K.sizes.length,
    build: lunaDeck,
    footprint: 0.6,
    height: K.top + K.rail.h + 0.3,
    windy: false,
  },
];
