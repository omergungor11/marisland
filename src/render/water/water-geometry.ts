import * as THREE from 'three';

export interface RadialGridOptions {
  rings: number;
  segments: number;
  innerRadius: number;
  outerRadius: number;
}

/** Ring radius i of `rings`, geometric from inner to outer. */
export function ringRadius(i: number, o: RadialGridOptions): number {
  return o.innerRadius * Math.pow(o.outerRadius / o.innerRadius, i / (o.rings - 1));
}

/**
 * Smooth radial grid in the xz plane (y = 0), facing +y: a centre vertex plus
 * `rings` rings whose radius grows geometrically, so vertex density follows the
 * camera's screen-space density. Displacement happens in the vertex shader.
 */
export function createRadialGrid(o: RadialGridOptions): THREE.BufferGeometry {
  const { rings, segments } = o;
  const pos = new Float32Array((1 + rings * segments) * 3);
  let p = 3; // vertex 0 = centre
  for (let i = 0; i < rings; i++) {
    const r = ringRadius(i, o);
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      pos[p++] = Math.cos(a) * r;
      pos[p++] = 0;
      pos[p++] = Math.sin(a) * r;
    }
  }
  const idx: number[] = [];
  const v = (ring: number, seg: number): number => 1 + ring * segments + (seg % segments);
  for (let j = 0; j < segments; j++) idx.push(0, v(0, j + 1), v(0, j));
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = v(i, j);
      const b = v(i, j + 1);
      const c = v(i + 1, j);
      const d = v(i + 1, j + 1);
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}
