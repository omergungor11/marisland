import * as THREE from 'three';
import type { Rng } from '../../core/rng.ts';
import { CLOUDS } from '../../content/anim.ts';

/**
 * One cloud variant (ART_BIBLE §3): 5–9 smooth icospheres (detail 2, analytic
 * sphere normals), bottom 30 % flattened. Normalised so the footprint spans
 * x ∈ [−0.5, 0.5], z ∈ ±aspect/2 (instance scale = cloud width), flat base at
 * y = 0. `aShade` = 0 at the flat belly → 1 at the top.
 */
export function buildCloudGeometry(rng: Rng): THREE.BufferGeometry {
  const n = rng.int(5, 9);
  const spheres: { x: number; y: number; z: number; r: number }[] = [];
  spheres.push({ x: rng.range(-0.04, 0.04), y: 0.06, z: 0, r: rng.range(0.32, 0.37) });
  const flank = n - 2;
  for (let i = 0; i < flank; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const k = Math.floor(i / 2) + 1;
    const r = 0.3 * (1 - 0.16 * k) * rng.range(0.88, 1.08);
    spheres.push({
      x: side * (0.24 * k + rng.range(-0.04, 0.04)),
      y: r * 0.25 - 0.03 * k + rng.range(-0.02, 0.03),
      z: rng.range(-0.1, 0.1) * k * 0.6,
      r,
    });
  }
  // a top bump makes the silhouette read as a cartoon cumulus
  spheres.push({
    x: rng.range(-0.16, 0.16),
    y: rng.range(0.22, 0.28),
    z: rng.range(-0.05, 0.05),
    r: rng.range(0.2, 0.25),
  });

  const pos: number[] = [];
  const nrm: number[] = [];
  const ico = new THREE.IcosahedronGeometry(1, 2);
  const ip = ico.getAttribute('position');
  for (const s of spheres) {
    for (let i = 0; i < ip.count; i++) {
      const ux = ip.getX(i);
      const uy = ip.getY(i);
      const uz = ip.getZ(i);
      pos.push(s.x + ux * s.r, s.y + uy * s.r, s.z + uz * s.r);
      nrm.push(ux, uy, uz);
    }
  }
  ico.dispose();

  // bounds → normalise and flatten
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    x0 = Math.min(x0, pos[i]);
    x1 = Math.max(x1, pos[i]);
    y0 = Math.min(y0, pos[i + 1]);
    y1 = Math.max(y1, pos[i + 1]);
    z0 = Math.min(z0, pos[i + 2]);
    z1 = Math.max(z1, pos[i + 2]);
  }
  const flat = y0 + 0.3 * (y1 - y0);
  const sx = 1 / (x1 - x0);
  const sz = CLOUDS.aspect / (z1 - z0) / sx; // in pre-x-scale units
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const top = (y1 - flat) * sx;
  const shade = new Float32Array(pos.length / 3);
  for (let i = 0, v = 0; i < pos.length; i += 3, v++) {
    let y = pos[i + 1];
    let nx = nrm[i];
    let ny = nrm[i + 1];
    let nz = nrm[i + 2];
    if (y < flat) {
      // flattened belly: soft (not creased) normals bent downward
      y = flat;
      const k = 0.75;
      nx *= 1 - k;
      nz *= 1 - k;
      ny = ny * (1 - k) - k;
    }
    // z is squeezed by sz → normal z scales by 1/sz
    nz /= sz;
    const l = Math.hypot(nx, ny, nz) || 1;
    pos[i] = (pos[i] - cx) * sx;
    pos[i + 1] = (y - flat) * sx;
    pos[i + 2] = (pos[i + 2] - cz) * sz * sx;
    nrm[i] = nx / l;
    nrm[i + 1] = ny / l;
    nrm[i + 2] = nz / l;
    shade[v] = top > 0 ? pos[i + 1] / top : 0;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
  g.computeBoundingSphere();
  return g;
}
