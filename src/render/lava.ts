import * as THREE from 'three';
import { LAVA as L } from '../content/lava.ts';
import { heightAt, type WorldData, type XZ } from '../world/index.ts';

/**
 * Emberpeak lava (TASK-509a, D-091; M26 D1 + D2), the rendering half. 509c (placement) feeds it
 * through ONE function, `lavaFlows(world)`; everything else reads the flows from there:
 *
 * - **River** (terrain program, 0 programs / 0 draw calls): `lavaUniforms(world)` packs the first
 *   flow's channel polyline into the terrain uniforms; `LAVA_COLOR_GLSL` (in `color_fragment`, after
 *   the ground art) paints the strip — crust plates drifting downhill over glowing cracks, open
 *   molten lava near the notch and along the centre, cooled banks — and `LAVA_EMISSIVE_GLSL` (in the
 *   aomap block next to the crater glow) adds the glow and, with MAR_DETAIL, the warm spill on the
 *   ground beside it at night.
 * - **Fall + delta** (render/waterfalls.ts, the waterfall ribbon mesh on the shared lit program):
 *   a ribbon off `fall` down the wall on flow surface mode 2 (molten sheet with crust plates) and a
 *   delta disc on the water in mode 3, steam puffs (PUFF_DELTA) at the foot.
 *
 * Time comes from SHARED.uTime (the sim clock): pixel-stable shots, no Math.random / Date.now.
 */
export interface LavaFlow {
  islandId: number;
  /** Channel centre line, source (notch) → lip, world xz (≥ 2 points). */
  channel: readonly XZ[];
  /** The fall at the lip (x, z, rotY = heading out to sea), or null for a channel without one. */
  fall: { x: number; z: number; rotY: number } | null;
}

/**
 * The lava flows of a world: the carved beds TASK-509c records as `world.fences` kind 'lava' (source →
 * lip, the points on the bed; world/gen/plans/devops-m26.ts), each with the fall on its island's
 * `lavaFall` anchor (the lip, rotY out to sea) when that anchor ends the line.
 */
export function lavaFlows(world: WorldData): LavaFlow[] {
  const out: LavaFlow[] = [];
  for (const f of world.fences) {
    if (f.kind !== 'lava' || f.points.length < 2) continue;
    const a = world.islands[f.islandId]?.anchors.lavaFall;
    const lip = f.points[f.points.length - 1];
    const fall =
      a && Math.hypot(a.x - lip.x, a.z - lip.z) < 0.5 ? { x: a.x, z: a.z, rotY: a.rotY } : null;
    out.push({ islandId: f.islandId, channel: f.points, fall });
  }
  return out;
}

/**
 * Terrain uniforms of the river (the first flow; one lava island today). `uLavaPt[k]` = (x, z,
 * ground y, arc length from the source); `uLavaInfo` = (points, total length, 0, 0) — 0 points = off;
 * `uLavaBox` = xz bounds grown by the strip, the bank and the spill radius.
 */
export function lavaUniforms(world: WorldData): Record<string, THREE.IUniform> {
  const pts = Array.from({ length: L.maxPoints }, () => new THREE.Vector4(0, 0, 0, 0));
  const info = new THREE.Vector4(0, 0, 0, 0);
  const box = new THREE.Vector4(0, 0, 0, 0);
  const flow = lavaFlows(world)[0];
  if (flow) {
    const n = Math.min(flow.channel.length, L.maxPoints);
    const pad = L.halfWidth + L.bank + L.spill.radius;
    let s = 0;
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const p = flow.channel[k];
      if (k > 0) s += Math.hypot(p.x - flow.channel[k - 1].x, p.z - flow.channel[k - 1].z);
      pts[k].set(p.x, p.z, heightAt(world.height, p.x, p.z), s);
      x0 = Math.min(x0, p.x);
      z0 = Math.min(z0, p.z);
      x1 = Math.max(x1, p.x);
      z1 = Math.max(z1, p.z);
    }
    info.set(n, s, 0, 0);
    box.set(x0 - pad, z0 - pad, x1 + pad, z1 + pad);
  }
  const c = (hex: string): THREE.Color => new THREE.Color(hex);
  return {
    uLavaPt: { value: pts },
    uLavaInfo: { value: info },
    uLavaBox: { value: box },
    uLavaCol: {
      value: [L.colors.lava, L.colors.hot, L.colors.crust, L.colors.crustRim, L.colors.bank].map(c),
    },
  };
}

const f = (v: number): string => v.toFixed(5);
const FL = L.flow;
const CR = L.crust;
const G = L.glow;

/**
 * Pars (after the ground pars: uses `marHash12` / `marVNoise`). `marLavaCell` = cellular noise of the
 * crust: x = distance to the plate border (F2 − F1), y = plate hash.
 */
export const LAVA_PARS_GLSL = /* glsl */ `
uniform vec4 uLavaPt[${L.maxPoints}];
uniform vec4 uLavaInfo;
uniform vec4 uLavaBox;
uniform vec3 uLavaCol[5];
vec2 marLavaCell(vec2 p) {
  vec2 i = floor(p);
  vec2 fp = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  float h1 = 0.0;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 c = i + g;
      vec2 o = vec2(marHash12(c), marHash12(c + 17.31));
      vec2 r = g + 0.15 + 0.7 * o - fp;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; h1 = marHash12(c + 41.7); }
      else if (d < d2) d2 = d;
    }
  return vec2(sqrt(d2) - sqrt(d1), h1);
}
`;

/**
 * River colour (in 'color_fragment', after the ground art; needs 'marNP' / 'marDPx' from the ground colour).
 * Declares 'marLavaE' (molten emissive weight, × lava colour later), 'marLavaHot' and 'marLavaSp'
 * (spill weight on ground beside the strip) at main scope for LAVA_EMISSIVE_GLSL.
 */
export const LAVA_COLOR_GLSL = /* glsl */ `
  float marLavaE = 0.0;
  float marLavaHot = 0.0;
  float marLavaSp = 0.0;
  float marLavaAl = 0.0;
  if (uLavaInfo.x > 1.5 && uDebugMask < 0.5
      && all(greaterThan(vMarWorld.xz, uLavaBox.xy)) && all(lessThan(vMarWorld.xz, uLavaBox.zw))) {
    // nearest point on the polyline: distance, arc length along it, signed offset across, ground y
    float marBd = 1e9;
    float marAl = 0.0;
    float marAc = 0.0;
    float marGy = 0.0;
    for (int k = 0; k < ${L.maxPoints - 1}; k++) {
      if (float(k) + 1.5 > uLavaInfo.x) break;
      vec4 a = uLavaPt[k];
      vec4 b = uLavaPt[k + 1];
      vec2 ab = b.xy - a.xy;
      float l2 = max(dot(ab, ab), 1e-4);
      vec2 ap = vMarWorld.xz - a.xy;
      float t = clamp(dot(ap, ab) / l2, 0.0, 1.0);
      vec2 q = ap - ab * t;
      float d = dot(q, q);
      if (d < marBd) {
        marBd = d;
        marAl = a.w + t * sqrt(l2);
        marAc = sign(ab.x * ap.y - ab.y * ap.x) * sqrt(d);
        marGy = mix(a.z, b.z, t);
      }
    }
    float marLd = sqrt(marBd);
    float marHy = 1.0 - smoothstep(${f(L.heightBand * 0.7)}, ${f(L.heightBand)}, abs(vMarWorld.y - marGy));
    if (marHy > 0.0) {
      float marE = max(0.6 * max(length(marDPx.xz), length(marDPy.xz)), 0.04);
      float marU = clamp(marAl / max(uLavaInfo.y, 1.0), 0.0, 1.0);
      // banks wobble a little along the stream (organic, not a ruler)
      float marHw = ${f(L.halfWidth)} * (0.9 + 0.2 * marVNoise(vec2(marAl * 0.35, 3.1)));
      float marIn = (1.0 - smoothstep(marHw - marE, marHw + marE, marLd)) * marHy;
      float marBk = (1.0 - smoothstep(marHw + ${f(L.bank)} - marE, marHw + ${f(L.bank)} + marE, marLd)) * marHy;
      marLavaSp = (1.0 - smoothstep(marHw, marHw + ${f(L.spill.radius)}, marLd)) * marHy * (1.0 - marBk);
      if (marBk > 0.0) {
        // cooled banks: glassy basalt with a faint lighter speckle
        vec3 marBc = uLavaCol[4] * (0.9 + 0.2 * marVNoise(vMarWorld.xz * 2.7));
        diffuseColor.rgb = mix(diffuseColor.rgb, marBc, marBk);
        marNP *= 1.0 - marBk;
      }
      if (marIn > 0.0) {
        // plates drift downhill with the stream (plug flow, a gentle sideways wobble)
        float marFs = marAl - uTime * ${f(FL.speed)};
        vec2 marP = vec2(marAc + ${f(FL.wobble)} * sin(marFs * 0.7), marFs) / ${f(FL.plate)};
        vec2 marCl = marLavaCell(marP);
        // AA from the pixel footprint (taken outside the branch): ~1.5 cell units per plate
        float marCe = max(1.5 * marE / ${f(FL.plate)}, 0.02);
        float marCrack = 1.0 - smoothstep(${f(FL.crack)} - marCe, ${f(FL.crack)} + marCe, marCl.x);
        // cooling: crusted share grows downstream; the centre stays open near the notch
        float marOpen = (1.0 - abs(marAc) / marHw) * ${f(CR.coreOpen)} * (1.0 - marU);
        float marEdge = abs(marAc) / marHw;
        float marCov = mix(${f(CR.source)}, ${f(CR.lip)}, marU) + ${f(CR.edge)} * marEdge * marEdge - marOpen;
        float marPlate = step(marCl.y, marCov);
        // plate: dark crust, lighter towards its rim, a warm edge where it meets a crack
        float marRim = 1.0 - smoothstep(0.0, 0.45, marCl.x);
        vec3 marPc = mix(uLavaCol[2], uLavaCol[3], 0.55 * marRim + 0.45 * fract(marCl.y * 7.3));
        // open lava: hot, the core yellow toward the source, slow swirls
        float marSw = marVNoise(marP * 1.7 + vec2(0.0, uTime * 0.2));
        marLavaHot = clamp((1.0 - abs(marAc) / marHw) * (1.1 - marU) * (0.6 + 0.6 * marSw), 0.0, 1.0);
        float marMol = max(1.0 - marPlate, marCrack);
        vec3 marMc = mix(uLavaCol[0], uLavaCol[1], marLavaHot * ${f(G.hot)});
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(marPc, marMc * 0.55, marMol), marIn);
        marNP *= 1.0 - marIn;
        marLavaE = marIn * max(marMol, 0.25 * marRim * marPlate);
        marLavaHot *= marMol;
        marLavaAl = marAl;
      }
    }
  }
`;

/** River glow (in the aomap block): molten emissive pulsing downstream + the night spill. */
export const LAVA_EMISSIVE_GLSL = /* glsl */ `
  if (marLavaE > 0.0 || marLavaSp > 0.0) {
    float marLp = ${f((G.pulse[0] + G.pulse[1]) / 2)} + ${f((G.pulse[1] - G.pulse[0]) / 2)} * sin(uTime * ${f((2 * Math.PI) / G.period)} - marLavaAl * 0.45);
    vec3 marLc = mix(uLavaCol[0], uLavaCol[1], marLavaHot * ${f(G.hot)});
    totalEmissiveRadiance += marLc * (marLavaE * marLp * (${f(G.day)} + ${f(G.night)} * uNight));
#ifdef MAR_DETAIL
    totalEmissiveRadiance += diffuseColor.rgb * uLavaCol[0] * (marLavaSp * marLavaSp * (${f(L.spill.day)} + ${f(L.spill.night)} * uNight));
#endif
  }
`;
