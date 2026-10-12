/**
 * Emblem glyphs (M19 TASK-409): small flat icons for flags, signs and crates, drawn as 2D Shapes in
 * a [-0.5, 0.5] box and extruded (depth along +z, back face at z = 0). One builder per icon; the
 * Pennant system (ISLAND_CULTURES §3.3) maps each culture to one of them (GLYPH_OF_THEME).
 * Strokes are bars (rotated rectangles) so every icon stays under ~40 triangles.
 */
import * as THREE from 'three';
import type { ThemeId } from '../../world/types.ts';
import type { Acc } from '../kit.ts';
import { TAU, V2, put } from '../parts.ts';

export type GlyphId =
  | 'check'
  | 'star'
  | 'hammer'
  | 'gear'
  | 'brush'
  | 'prism'
  | 'megaphone'
  | 'magnifier'
  | 'anchor'
  | 'bell'
  | 'code'
  | 'telescope';

export const GLYPH_IDS: readonly GlyphId[] = [
  'check',
  'star',
  'hammer',
  'gear',
  'brush',
  'prism',
  'megaphone',
  'magnifier',
  'anchor',
  'bell',
  'code',
  'telescope',
];

/** Culture emblem (ISLAND_CULTURES §2: bell, </>, megaphone, tick, brush, hammer, telescope). */
export const GLYPH_OF_THEME: Readonly<Record<ThemeId, GlyphId>> = {
  hq: 'bell',
  coding: 'code',
  marketing: 'megaphone',
  qa: 'check',
  design: 'brush',
  devops: 'hammer',
  research: 'telescope',
};

type P = readonly [number, number];
const poly = (pts: readonly P[]): THREE.Shape => new THREE.Shape(pts.map(([x, y]) => V2(x, y)));

/** Rotated rectangle from a to b, `w` wide. */
function bar(a: P, b: P, w: number): THREE.Shape {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  return poly([
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ]);
}

const ngon = (cx: number, cy: number, r: number, n: number, rot = 0): P[] =>
  Array.from({ length: n }, (_, i): P => {
    const a = rot + (i / n) * TAU;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });

/** Disc or ring (when `hole` > 0). */
function disc(cx: number, cy: number, r: number, n: number, hole = 0): THREE.Shape {
  const s = poly(ngon(cx, cy, r, n));
  if (hole > 0)
    s.holes.push(
      new THREE.Path(
        ngon(cx, cy, hole, n)
          .reverse()
          .map(([x, y]) => V2(x, y)),
      ),
    );
  return s;
}

/** Icon outlines in [-0.5, 0.5]; +y up. */
export function glyphShapes(id: GlyphId): THREE.Shape[] {
  switch (id) {
    case 'check':
      return [bar([-0.46, -0.02], [-0.13, -0.36], 0.22), bar([-0.13, -0.36], [0.46, 0.4], 0.22)];
    case 'star': {
      const pts: P[] = [];
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i / 10) * TAU;
        const r = i % 2 === 0 ? 0.5 : 0.21;
        pts.push([Math.cos(a) * r, Math.sin(a) * r - 0.03]);
      }
      return [poly(pts)];
    }
    case 'hammer':
      return [
        bar([0, -0.5], [0, 0.22], 0.16),
        poly([
          [-0.46, 0.14],
          [0.46, 0.14],
          [0.46, 0.46],
          [-0.46, 0.46],
        ]),
      ];
    case 'gear': {
      const out: P[] = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        const r = i % 4 < 2 ? 0.5 : 0.36;
        out.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      const s = poly(out);
      s.holes.push(
        new THREE.Path(
          ngon(0, 0, 0.15, 6)
            .reverse()
            .map(([x, y]) => V2(x, y)),
        ),
      );
      return [s];
    }
    case 'brush':
      return [
        bar([-0.44, -0.44], [0.0, 0.0], 0.14),
        bar([0.0, 0.0], [0.16, 0.16], 0.22),
        poly([
          [0.04, 0.24],
          [0.24, 0.04],
          [0.5, 0.5],
        ]),
      ];
    case 'prism': {
      const outer = poly([
        [-0.5, -0.4],
        [0.5, -0.4],
        [0, 0.46],
      ]);
      outer.holes.push(new THREE.Path([V2(-0.18, -0.26), V2(0, 0.08), V2(0.18, -0.26)].reverse()));
      return [outer];
    }
    case 'megaphone':
      return [
        poly([
          [-0.5, -0.12],
          [-0.5, 0.12],
          [-0.12, 0.12],
          [0.42, 0.44],
          [0.42, -0.44],
          [-0.12, -0.12],
        ]),
        poly([
          [-0.38, -0.12],
          [-0.22, -0.12],
          [-0.12, -0.46],
          [-0.28, -0.46],
        ]),
      ];
    case 'magnifier':
      return [disc(-0.1, 0.1, 0.34, 10, 0.18), bar([0.14, -0.14], [0.46, -0.46], 0.17)];
    case 'anchor':
      return [
        disc(0, 0.38, 0.12, 6, 0.05),
        bar([0, 0.28], [0, -0.4], 0.12),
        bar([-0.26, 0.14], [0.26, 0.14], 0.1),
        bar([-0.44, -0.1], [0, -0.44], 0.12),
        bar([0.44, -0.1], [0, -0.44], 0.12),
      ];
    case 'bell':
      return [
        poly([
          [-0.44, -0.3],
          [-0.32, 0.08],
          [-0.16, 0.36],
          [0.16, 0.36],
          [0.32, 0.08],
          [0.44, -0.3],
        ]),
        disc(0, -0.42, 0.1, 6),
        disc(0, 0.44, 0.07, 5),
      ];
    case 'code':
      return [
        poly([
          [-0.2, 0.4],
          [-0.5, 0],
          [-0.2, -0.4],
          [-0.08, -0.28],
          [-0.3, 0],
          [-0.08, 0.28],
        ]),
        poly([
          [0.2, 0.4],
          [0.5, 0],
          [0.2, -0.4],
          [0.08, -0.28],
          [0.3, 0],
          [0.08, 0.28],
        ]),
        bar([0.1, 0.42], [-0.1, -0.42], 0.1),
      ];
    case 'telescope':
      return [
        bar([-0.46, -0.12], [0.34, 0.3], 0.26),
        bar([0.02, 0.04], [-0.2, -0.5], 0.1),
        bar([0.02, 0.04], [0.22, -0.5], 0.1),
      ];
  }
}

export interface GlyphOpts {
  /** Rotation of the +z-facing icon (yaw about y by default). */
  q?: THREE.Quaternion;
  /** Edge length in u (the [-0.5, 0.5] box). */
  size: number;
  color: string;
  /** Extrusion depth in u (0.12 keeps the kit's minimum thickness). */
  depth?: number;
  emissive?: number;
}

/** Add glyph `id` centred on `at`, its front face pointing +z (turned by `q`). */
export function addGlyph(acc: Acc, id: GlyphId, at: THREE.Vector3, o: GlyphOpts): void {
  const depth = o.depth ?? 0.06;
  for (const sh of glyphShapes(id)) {
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 3 });
    put(acc, g, at, o.color, {
      q: o.q,
      s: [o.size, o.size, 1],
      aoAmt: 0,
      emissive: o.emissive,
      ao: o.emissive ? () => 1 : undefined,
    });
  }
}
