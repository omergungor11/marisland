/**
 * Shop sign glyphs of the Horseshoe Harbour quay houses (M52 TASK-660): fish, cup, loaf, cone,
 * postcard, anchor, drawn as a few thin extruded polygons in the unit square (x right, y up,
 * [-0.5, 0.5]). Stacked layers sit one `LAYER` apart, so no two visible faces are coplanar.
 */
import * as THREE from 'three';
import { MARINA_LOOK as L, type Glyph } from '../../content/themes/hq-horseshoe-look.ts';
import type { Acc } from '../kit.ts';
import { V2, put } from '../parts.ts';
import { qEuler } from '../kit.ts';

type Pt = readonly [number, number];
export interface GlyphPart {
  pts: readonly Pt[];
  color: string;
  layer: number;
  /** Optional hole polygon (anchor ring). */
  hole?: readonly Pt[];
  rot?: number;
}

const LAYER = 0.03;

const poly = (pts: readonly Pt[], color: string, layer = 0, rot = 0): GlyphPart => ({
  pts,
  color,
  layer,
  rot,
});

/** Regular polygon with `n` corners, radius `r`, centre (cx, cy), `a0` rad start. */
function ngon(cx: number, cy: number, r: number, n: number, a0 = 0): Pt[] {
  return Array.from({ length: n }, (_, i): Pt => {
    const a = a0 + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}

/** A thin slanted bar between two points. */
function bar(a: Pt, b: Pt, t: number): Pt[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * (t / 2);
  const ny = (dx / l) * (t / 2);
  return [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ];
}

export function glyphParts(g: Glyph): GlyphPart[] {
  const c = L.glyphColors;
  switch (g) {
    case 'fish': {
      const [body, tail, eye] = c.fish;
      return [
        poly(
          [
            [-0.45, 0],
            [-0.25, 0.2],
            [0.05, 0.26],
            [0.3, 0.12],
            [0.36, 0],
            [0.3, -0.12],
            [0.05, -0.26],
            [-0.25, -0.2],
          ],
          body,
        ),
        poly(
          [
            [0.28, 0],
            [0.5, 0.24],
            [0.5, -0.24],
          ],
          tail,
        ),
        poly(
          [
            [-0.34, 0.03],
            [-0.26, 0.03],
            [-0.26, 0.11],
            [-0.34, 0.11],
          ],
          eye,
          1,
        ),
      ];
    }
    case 'cup': {
      const [cup, saucer, steam] = c.cup;
      return [
        poly(
          [
            [-0.3, 0.12],
            [0.3, 0.12],
            [0.22, -0.2],
            [-0.22, -0.2],
          ],
          cup,
        ),
        poly(
          [
            [-0.42, -0.24],
            [0.42, -0.24],
            [0.32, -0.33],
            [-0.32, -0.33],
          ],
          saucer,
        ),
        poly(
          [
            [0.28, 0.06],
            [0.42, 0.06],
            [0.42, -0.1],
            [0.24, -0.14],
            [0.25, -0.07],
            [0.34, -0.05],
            [0.34, 0.0],
            [0.27, 0.0],
          ],
          cup,
        ),
        poly(bar([-0.1, 0.2], [-0.04, 0.44], 0.06), steam),
        poly(bar([0.1, 0.2], [0.16, 0.44], 0.06), steam),
      ];
    }
    case 'loaf': {
      const [crust, score] = c.loaf;
      return [
        poly(
          [
            [-0.44, -0.2],
            [-0.44, 0.02],
            [-0.32, 0.2],
            [-0.1, 0.28],
            [0.1, 0.28],
            [0.32, 0.2],
            [0.44, 0.02],
            [0.44, -0.2],
          ],
          crust,
        ),
        ...[-0.2, 0, 0.2].map((x) =>
          poly(bar([x - 0.05, -0.02], [x + 0.05, 0.18], 0.06), score, 1),
        ),
      ];
    }
    case 'cone': {
      const [wafer, scoopA, scoopB] = c.cone;
      return [
        poly(
          [
            [-0.2, 0.0],
            [0.2, 0.0],
            [0, -0.46],
          ],
          wafer,
        ),
        poly(ngon(0, 0.12, 0.25, 8, Math.PI / 8), scoopA, 1),
        poly(ngon(0, 0.36, 0.17, 8, Math.PI / 8), scoopB, 2),
      ];
    }
    case 'card': {
      const [paper, stamp, line] = c.card;
      const r = -0.14;
      return [
        poly(
          [
            [-0.44, -0.29],
            [0.44, -0.29],
            [0.44, 0.29],
            [-0.44, 0.29],
          ],
          paper,
          0,
          r,
        ),
        poly(
          [
            [0.2, 0.1],
            [0.37, 0.1],
            [0.37, 0.25],
            [0.2, 0.25],
          ],
          stamp,
          1,
          r,
        ),
        ...[-0.14, -0.02, 0.1].map((y) =>
          poly(
            [
              [-0.34, y - 0.025],
              [0.04, y - 0.025],
              [0.04, y + 0.025],
              [-0.34, y + 0.025],
            ],
            line,
            1,
            r,
          ),
        ),
      ];
    }
    case 'anchor': {
      const [ink] = c.anchor;
      const arc: Pt[] = [];
      for (let i = 0; i <= 4; i++) {
        const a = Math.PI * (1.12 + (i / 4) * 0.76);
        arc.push([Math.cos(a) * 0.36, 0.0 + Math.sin(a) * 0.36]);
      }
      for (let i = 4; i >= 0; i--) {
        const a = Math.PI * (1.12 + (i / 4) * 0.76);
        arc.push([Math.cos(a) * 0.26, 0.0 + Math.sin(a) * 0.26]);
      }
      return [
        { pts: ngon(0, 0.34, 0.11, 6), color: ink, layer: 0, hole: ngon(0, 0.34, 0.055, 6) },
        poly(
          [
            [-0.045, 0.24],
            [0.045, 0.24],
            [0.045, -0.3],
            [-0.045, -0.3],
          ],
          ink,
        ),
        poly(
          [
            [-0.2, 0.17],
            [0.2, 0.17],
            [0.2, 0.1],
            [-0.2, 0.1],
          ],
          ink,
        ),
        poly(arc, ink),
        poly(
          [
            [-0.39, 0.05],
            [-0.24, 0.06],
            [-0.37, -0.12],
          ],
          ink,
        ),
        poly(
          [
            [0.39, 0.05],
            [0.24, 0.06],
            [0.37, -0.12],
          ],
          ink,
        ),
      ];
    }
  }
}

/** Add the glyph at `at` (centre of the board face, front = +z), `size` u across. */
export function addGlyph(
  acc: Acc,
  g: Glyph,
  at: readonly [number, number, number],
  size: number,
): void {
  for (const p of glyphParts(g)) {
    const shape = new THREE.Shape(p.pts.map(([x, y]) => V2(x * size, y * size)));
    if (p.hole) shape.holes.push(new THREE.Path(p.hole.map(([x, y]) => V2(x * size, y * size))));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: LAYER, bevelEnabled: false });
    put(acc, geo, [at[0], at[1], at[2] + p.layer * LAYER], p.color, {
      aoAmt: 0,
      ao: () => 1,
      noJitter: true,
      q: p.rot ? qEuler(0, 0, p.rot) : undefined,
    });
  }
}
