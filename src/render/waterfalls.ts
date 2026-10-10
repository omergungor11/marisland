import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import type { Quality } from '../core/params.ts';
import { SURFACE } from '../content/activity.ts';
import { WATERFALL_LOOK as L } from '../content/waterfalls.ts';
import { heightAt, type WaterfallData, type WorldData } from '../world/index.ts';
import { makeLitMaterial } from './materials/factory.ts';
import { PUFF_MIST, type Puffs } from './particles/puffs.ts';

/**
 * Waterfalls off the bluff lips (M17b TASK-395). Every fall is a ribbon that runs from a short
 * channel on the plateau over the rim and down the wall (a ballistic throw off the lip, then a
 * `gap` off the dilated wall profile, so it never z-fights the face) into a foam disc on the sea.
 * All falls are ONE merged geometry on the shared lit program (one InstancedMesh, count 1, like
 * the sky craft: no new program, +1 draw call); the look is the `flow` surface kind
 * (`aSpin = (u, v, mode, −SURFACE.flow)`, materials/activity-glsl.ts) driven by uTime only.
 * Mist rises from the plunge through the shared puff emitters (PUFF_MIST).
 */
export interface WaterfallsView {
  mesh: THREE.InstancedMesh | null;
}

const DS = 0.05;

interface Builder {
  pos: number[];
  spin: number[];
  seed: number[];
  idx: number[];
}

/** Sheet centre line in (s along the fall, y): dense samples, then arc-length resampled rows. */
export function fallProfile(world: WorldData, f: WaterfallData): { s: number[]; y: number[] } {
  const dx = Math.cos(f.rotY);
  const dz = Math.sin(f.rotY);
  const tx = -dz;
  const tz = dx;
  const half = (f.width * L.spread) / 2;
  const s0 = -L.inland;
  const s1 = Math.hypot(f.baseX - f.x, f.baseZ - f.z) + L.gap + 4;
  const ground: number[] = [];
  for (let s = s0 - L.gap; s <= s1 + L.gap + 1e-6; s += DS) {
    let g = -Infinity;
    for (const o of [-half, 0, half])
      g = Math.max(g, heightAt(world.height, f.x + dx * s + tx * o, f.z + dz * s + tz * o));
    ground.push(g);
  }
  // dilate by the gap along s (pushes the steep face out), lift on the flats
  const k = Math.round(L.gap / DS);
  const g0 = Math.round(L.gap / DS);
  const ds: number[] = [];
  const ys: number[] = [];
  let rim = Infinity;
  let rimY = 0;
  for (let i = g0; i < ground.length - k; i++) {
    const s = s0 + (i - g0) * DS;
    let g = -Infinity;
    for (let j = i - k; j <= i + k; j++) g = Math.max(g, ground[j]);
    g += L.lift;
    if (rim === Infinity && s >= 0 && g < f.y + L.lift - 0.3) {
      rim = s;
      rimY = ys[ys.length - 1] ?? g;
    }
    const throwY = s > rim ? rimY - L.throwK * (s - rim) * (s - rim) : -Infinity;
    const y = Math.max(g, throwY);
    ds.push(s);
    ys.push(y);
    if (y < -0.05) break;
  }
  ys[ys.length - 1] = Math.min(ys[ys.length - 1], -0.15);
  // arc-length resample
  const acc = [0];
  for (let i = 1; i < ds.length; i++)
    acc.push(acc[i - 1] + Math.hypot(ds[i] - ds[i - 1], ys[i] - ys[i - 1]));
  const total = acc[acc.length - 1];
  const s: number[] = [];
  const y: number[] = [];
  let j = 0;
  for (let r = 0; r <= L.rows; r++) {
    const a = (total * r) / L.rows;
    while (j < acc.length - 2 && acc[j + 1] < a) j++;
    const t = (a - acc[j]) / Math.max(acc[j + 1] - acc[j], 1e-6);
    s.push(ds[j] + (ds[j + 1] - ds[j]) * t);
    y.push(ys[j] + (ys[j + 1] - ys[j]) * t);
  }
  return { s, y };
}

/** Push triangle (a, b, c) facing `n` (flips the winding when needed). */
function tri(b: Builder, a: number, c: number, d: number, n: THREE.Vector3): void {
  const p = b.pos;
  const ux = p[c * 3] - p[a * 3];
  const uy = p[c * 3 + 1] - p[a * 3 + 1];
  const uz = p[c * 3 + 2] - p[a * 3 + 2];
  const vx = p[d * 3] - p[a * 3];
  const vy = p[d * 3 + 1] - p[a * 3 + 1];
  const vz = p[d * 3 + 2] - p[a * 3 + 2];
  const dot = (uy * vz - uz * vy) * n.x + (uz * vx - ux * vz) * n.y + (ux * vy - uy * vx) * n.z;
  if (dot >= 0) b.idx.push(a, c, d);
  else b.idx.push(a, d, c);
}

const _n = new THREE.Vector3();

function addFall(b: Builder, world: WorldData, f: WaterfallData): { x: number; z: number } {
  const dx = Math.cos(f.rotY);
  const dz = Math.sin(f.rotY);
  const tx = -dz;
  const tz = dx;
  const { s, y } = fallProfile(world, f);
  const rows = s.length;
  const cols = L.cols;
  const start = b.pos.length / 3;
  let v = 0;
  for (let r = 0; r < rows; r++) {
    if (r > 0) v += Math.hypot(s[r] - s[r - 1], y[r] - y[r - 1]);
    // outward normal of the centre line in (s, y): (−dy, ds)
    const r0 = Math.max(0, r - 1);
    const r1 = Math.min(rows - 1, r + 1);
    let ns = -(y[r1] - y[r0]);
    let ny = s[r1] - s[r0];
    const nl = Math.hypot(ns, ny) || 1;
    ns /= nl;
    ny /= nl;
    const w = (f.width / 2) * (1 + (L.spread - 1) * (r / (rows - 1)));
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const o = (u * 2 - 1) * w;
      const bulge = L.bulge * (1 - (u * 2 - 1) ** 2);
      const ss = s[r] + ns * bulge;
      b.pos.push(f.x + dx * ss + tx * o, y[r] + ny * bulge, f.z + dz * ss + tz * o);
      b.spin.push(u, v, 0, -SURFACE.flow);
      b.seed.push(f.seed);
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    // facing: outward / up along the sheet normal at this row
    const ns = -(y[r + 1] - y[r]);
    const ny = s[r + 1] - s[r];
    _n.set(dx * ns, ny, dz * ns);
    for (let c = 0; c < cols; c++) {
      const a = start + r * (cols + 1) + c;
      tri(b, a, a + 1, a + cols + 1, _n);
      tri(b, a + 1, a + cols + 2, a + cols + 1, _n);
    }
  }
  // foam disc where the sheet meets the water
  const cx = f.x + dx * s[rows - 1];
  const cz = f.z + dz * s[rows - 1];
  const R = f.width * L.foam.radius + L.foam.pad;
  const seg = L.foam.segments;
  const ring = L.foam.rings;
  const centre = b.pos.length / 3;
  b.pos.push(cx, L.foam.y, cz);
  b.spin.push(0, 0, 1, -SURFACE.flow);
  b.seed.push(f.seed);
  for (let k = 1; k <= ring; k++) {
    const rn = k / ring;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2 + f.seed * 6.283;
      b.pos.push(cx + Math.cos(a) * R * rn, L.foam.y, cz + Math.sin(a) * R * rn);
      b.spin.push(rn, rn * R, 1, -SURFACE.flow);
      b.seed.push(f.seed);
    }
  }
  _n.set(0, 1, 0);
  const at = (k: number, i: number): number => centre + 1 + (k - 1) * seg + (i % seg);
  for (let i = 0; i < seg; i++) tri(b, centre, at(1, i), at(1, i + 1), _n);
  for (let k = 1; k < ring; k++)
    for (let i = 0; i < seg; i++) {
      tri(b, at(k, i), at(k + 1, i), at(k + 1, i + 1), _n);
      tri(b, at(k, i), at(k + 1, i + 1), at(k, i + 1), _n);
    }
  return { x: cx, z: cz };
}

export function createWaterfalls(
  world: WorldData,
  quality: Quality,
  scope: Scope,
  puffs: Puffs,
): WaterfallsView {
  const falls = world.waterfalls;
  if (!falls.length) return { mesh: null };
  const b: Builder = { pos: [], spin: [], seed: [], idx: [] };
  const mist = L.mistEmitters[quality];
  for (const f of falls) {
    const foot = addFall(b, world, f);
    for (let m = 0; m < mist; m++) {
      const o = mist > 1 ? (m / (mist - 1) - 0.5) * f.width : 0;
      puffs.addEmitter(
        foot.x - Math.sin(f.rotY) * o,
        0.3,
        foot.z + Math.cos(f.rotY) * o,
        PUFF_MIST,
      );
    }
  }
  const geo = scope.add(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  geo.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(new Float32Array(b.pos.length).fill(1), 3),
  );
  geo.setAttribute('aSpin', new THREE.Float32BufferAttribute(b.spin, 4));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(b.seed, 1));
  geo.setIndex(b.idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = scope.add(makeLitMaterial({ instanced: true, dither: true }, { name: 'waterfalls' }));
  const mesh = new THREE.InstancedMesh(geo, mat, 1);
  mesh.name = 'waterfalls';
  mesh.setMatrixAt(0, new THREE.Matrix4());
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  scope.add(mesh);
  return { mesh };
}
