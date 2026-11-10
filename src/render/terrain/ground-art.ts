import * as THREE from 'three';
import type { WorldData } from '../../world/types.ts';
import { heightAt, THEME_IDS, Zone } from '../../world/types.ts';
import {
  CARPET as CP,
  COMPASS_MOSAIC as CM,
  MARINA_QUAY as MQ,
  PRISM_POOLS as PP,
} from '../../content/ground-art.ts';
import { MARINA_SITE } from '../../content/themes/hq-horseshoe-site.ts';
import { SHARED } from '../uniforms.ts';

/**
 * Ground art of the terrain material (TASK-468, content/ground-art.ts): the HQ compass mosaic and
 * the Design prism-arch light pools, analytic shapes in the ONE terrain program (no mesh, no draw
 * call, no texture). Uniforms are plain values built from the world (no GPU resource to own).
 *
 * - `GROUND_ART_COLOR_GLSL` (after the ground colour, in `color_fragment`): the mosaic over the
 *   'compass' district's albedo; needs `marDPx` / `marDPy` / `marBase` from the ground colour.
 *   The Marketing red carpet (TASK-481) is painted in the same block: a rotated strip over the
 *   first 'carpet' district, gold trim lines and star plates. The HQ harbour quay (TASK-664, open
 *   crescent TASK-675) too: flags in courses, coping and face along the quay line (`marinaUniforms`).
 * - `GROUND_ART_LIGHT_GLSL` (after the cloud shadow, `opaque_fragment`): the prism pools as added
 *   light × albedo (define `MAR_PRISM`; off on low quality); the day pools fade under the overcast
 *   veil (rain, fog), the night ones follow the lamps.
 */

/** Culture index of a `cultureGate` fixture (its variant = THEME_IDS index). */
const cultureOf = (variant: number | undefined): number =>
  Math.min(Math.max(variant ?? 0, 0), THEME_IDS.length - 1);

const lin = (hex: string): THREE.Color => new THREE.Color(hex);

export function groundArtUniforms(world: WorldData): Record<string, THREE.IUniform> {
  // ---- compass: the first 'compass' district (HQ), rays = its island's gates' bearings
  const compass = new THREE.Vector4(0, 0, 0, 0);
  const rays = Array.from({ length: CM.maxRays }, () => new THREE.Vector4(0, 0, 0, 0));
  const rayCol = Array.from({ length: CM.maxRays }, () => new THREE.Color(0, 0, 0));
  const d = world.districts.find((x) => x.kind === 'compass');
  if (d) {
    compass.set(d.x, d.z, d.w / 2, heightAt(world.height, d.x, d.z));
    let k = 0;
    for (const f of world.fixtures) {
      if (k >= CM.maxRays) break;
      if (f.defId !== 'cultureGate' || f.islandId !== d.islandId) continue;
      const dx = f.x - d.x;
      const dz = f.z - d.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-3) continue;
      rays[k].set(dx / len, dz / len, 0, 1);
      rayCol[k].copy(lin(CM.accents[THEME_IDS[cultureOf(f.variant)]]));
      k++;
    }
  }
  // ---- prism pools: every prismArch (x, z, ground y, on)
  const prisms = Array.from({ length: PP.maxArches }, () => new THREE.Vector4(0, 0, 0, 0));
  let n = 0;
  for (const f of world.fixtures) {
    if (n >= PP.maxArches) break;
    if (f.defId !== 'prismArch') continue;
    prisms[n++].set(f.x, f.z, heightAt(world.height, f.x, f.z), 1);
  }
  // ---- red carpet: the first 'carpet' district (Marketing's Ad Boulevard)
  const carpet = new THREE.Vector4(0, 0, 1, 0);
  const carpetDim = new THREE.Vector4(0, 0, 0, 0);
  const cd = world.districts.find((x) => x.kind === 'carpet');
  if (cd) {
    carpet.set(cd.x, cd.z, Math.cos(cd.rotY), Math.sin(cd.rotY));
    carpetDim.set(cd.w / 2 + CP.edge, cd.d / 2, heightAt(world.height, cd.x, cd.z), 1);
  }
  return {
    ...marinaUniforms(world),
    uCarpet: { value: carpet },
    uCarpetDim: { value: carpetDim },
    uCarpetInk: { value: [CP.pile, CP.trim, CP.plate, CP.star, CP.outline].map(lin) },
    uCompass: { value: compass },
    uCompassRay: { value: rays },
    uCompassCol: { value: rayCol },
    // paving, grout, light inlay, HQ accent (medallion ring)
    uCompassInk: {
      value: [lin(CM.paving), lin(CM.grout), lin(CM.inlay), lin(CM.accents.hq)],
    },
    uPrism: { value: prisms },
    uPrismCol: { value: PP.colors.map(lin) },
    uSunSkyDir: SHARED.uSunSkyDir,
    uSunColor: SHARED.uSunColor,
    uGolden: SHARED.uGolden,
    uWeather: SHARED.uWeather,
  };
}

/**
 * HQ harbour quay (TASK-675, D-173: an open crescent along the bay) from the anchors (hq-horseshoe.ts
 * contract). `uMarinaQ[k]` = a point of the quay's centre line (x, z, offset of the deck's land edge
 * along the water normal (−sin θ, cos θ), 1 = level deck / 0 = gap or ramp); at most
 * `MARINA_QUAY.maxPoints`, every `stride`th anchor and the last one. The land edge is the level
 * plaza scanned inland from the water edge (the house row's full width, else the promenade).
 * `uMarinaStub[0/1]` = the light's / the tower's stub (root x, z, head x, z; root = head: none), a
 * capsule of `uMarinaInfo.w` round root → head.
 * `uMarinaInfo` = (points, deck y, offset of the drawn water edge, stub half width; x 0 = no quay);
 * `uMarinaBox` = the xz box the paint can reach (min x, z, max x, z).
 */
export function marinaUniforms(world: WorldData): Record<string, THREE.IUniform> {
  const N = MQ.maxPoints;
  const pts = Array.from({ length: N }, () => new THREE.Vector4(0, 0, 0, 0));
  const stubs = [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)];
  const info = new THREE.Vector4(0, 0, 0, 0);
  const box = new THREE.Vector4(0, 0, 0, 0);
  const isl = world.islands.find((i) => i.anchors.marinaQuay1 && i.anchors.marinaQuaySize);
  if (isl) {
    const A = isl.anchors;
    const R = MARINA_SITE.ring;
    const W2 = A.marinaQuaySize.x / 2;
    const deckY = A.marinaQuaySize.z;
    const h = world.height;
    const q: { x: number; z: number; rotY: number }[] = [];
    for (let k = 0; A[`marinaQuay${k}`]; k++) q.push(A[`marinaQuay${k}`]);
    const stride = Math.ceil(q.length / N);
    const idx: number[] = [];
    for (let k = 0; k < q.length - 1; k += stride) idx.push(k);
    idx.push(q.length - 1);
    const level = (x: number, z: number): boolean => {
      const i = Math.round((x - h.originX) / h.cellSize);
      const j = Math.round((z - h.originZ) / h.cellSize);
      if (i < 0 || j < 0 || i >= h.n || j >= h.n) return false;
      return (
        world.zone[j * h.n + i] === Zone.plaza &&
        Math.abs(heightAt(h, x, z) - deckY) <= MQ.heightBand
      );
    };
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    idx.forEach((k, m) => {
      const p = q[k];
      const nx = -Math.sin(p.rotY);
      const nz = Math.cos(p.rotY);
      // the land edge: the level plaza inland of the water edge (≥ the promenade where it is deck)
      let land = 0;
      for (let o = 0; o <= A.marinaQuaySize.x + R.edgeFlat + 1e-6; o += MQ.scanStep) {
        if (!level(p.x + nx * (W2 - o), p.z + nz * (W2 - o))) break;
        land = o;
      }
      // level deck unless the promenade at an anchor this point stands for is off the deck height (gap, ramp)
      let deck = 1;
      for (let j = Math.max(0, k - stride + 1); j <= Math.min(q.length - 1, k + stride - 1); j++) {
        const o = W2 - R.promenade / 2;
        const y = heightAt(h, q[j].x - Math.sin(q[j].rotY) * o, q[j].z + Math.cos(q[j].rotY) * o);
        if (Math.abs(y - deckY) > MQ.deckTol) deck = 0;
      }
      pts[m].set(p.x, p.z, W2 - Math.max(land, deck ? R.promenade : 0), deck);
      x0 = Math.min(x0, p.x);
      z0 = Math.min(z0, p.z);
      x1 = Math.max(x1, p.x);
      z1 = Math.max(z1, p.z);
    });
    const ends = [
      [A.marinaStubL, A.marinaStubSize?.x ?? 0],
      [A.marinaStubT, A.marinaStubSize?.z ?? 0],
    ] as const;
    ends.forEach(([sb, len], k) => {
      if (!sb || len <= 0) return;
      const hx = sb.x + Math.cos(sb.rotY) * len;
      const hz = sb.z + Math.sin(sb.rotY) * len;
      stubs[k].set(sb.x, sb.z, hx, hz);
      x0 = Math.min(x0, hx);
      z0 = Math.min(z0, hz);
      x1 = Math.max(x1, hx);
      z1 = Math.max(z1, hz);
    });
    const pad = A.marinaQuaySize.x + R.edgeFlat + MQ.faceReach + 2;
    info.set(idx.length, deckY, W2 + R.innerFlat - MQ.edgeInset, MARINA_SITE.stub.half);
    box.set(x0 - pad, z0 - pad, x1 + pad, z1 + pad);
  }
  return {
    uMarinaQ: { value: pts },
    uMarinaStub: { value: stubs },
    uMarinaInfo: { value: info },
    uMarinaBox: { value: box },
    uMarinaInk: {
      value: [
        lin(MQ.ink.deck).lerp(lin(MQ.deckLight), MQ.deckLightMix),
        lin(MQ.ink.coping),
        lin(MQ.ink.face),
      ],
    },
  };
}

const f = (v: number): string => v.toFixed(5);

export const GROUND_ART_PARS_GLSL = /* glsl */ `
uniform vec4 uMarinaQ[${MQ.maxPoints}];
uniform vec4 uMarinaStub[2];
uniform vec4 uMarinaInfo;
uniform vec4 uMarinaBox;
uniform vec3 uMarinaInk[3];
uniform vec4 uCarpet;
uniform vec4 uCarpetDim;
uniform vec3 uCarpetInk[5];
uniform vec4 uCompass;
uniform vec4 uCompassRay[${CM.maxRays}];
uniform vec3 uCompassCol[${CM.maxRays}];
uniform vec3 uCompassInk[4];
uniform vec4 uPrism[${PP.maxArches}];
uniform vec3 uPrismCol[${PP.colors.length}];
uniform vec3 uSunSkyDir;
uniform vec3 uSunColor;
uniform float uGolden;
uniform vec4 uWeather;
/** Quay segment k's frame at p: x = arc from the quay start (s0 = its start's), y = offset toward the water, z = t (unclamped). */
vec3 marQuaySeg(int k, float s0, vec2 p) {
  vec2 a = uMarinaQ[k].xy;
  vec2 ab = uMarinaQ[k + 1].xy - a;
  float l = max(length(ab), 1e-3);
  vec2 t = ab / l;
  vec2 r = p - a;
  float u = dot(r, t);
  return vec3(s0 + u, t.x * r.y - t.y * r.x, u / l);
}
/** Five-point star (r = outer radius, rf = inner / outer ratio in (0.3, 0.55)), signed distance. */
float marStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
/** Prism spectrum at t in [0, 1]: banded (a soft step between neighbouring hues). */
vec3 marPrismSpectrum(float t) {
  float x = clamp(t, 0.0, 1.0) * ${f(PP.colors.length - 1)};
  int i = int(min(floor(x), ${f(PP.colors.length - 2)}));
  float s = smoothstep(0.3, 0.7, x - float(i));
  vec3 a = uPrismCol[0];
  vec3 b = uPrismCol[1];
  for (int k = 1; k < ${PP.colors.length - 1}; k++) if (k == i) { a = uPrismCol[k]; b = uPrismCol[k + 1]; }
  return mix(a, b, s);
}
`;

const RIM0 = f(CM.rim[0]);
const RIM1 = f(CM.rim[1]);

/**
 * Compass mosaic over the albedo: diffuseColor = the plaza paving recoloured, keeping the near
 * detail (tile relief / grout) as a ratio to the pre-detail albedo `marBase`. Anti-aliased by the
 * pixel footprint (taken from the ground colour's derivatives, outside any branch).
 */
export const GROUND_ART_COLOR_GLSL = /* glsl */ `
  if (uMarinaInfo.x > 0.0 && vMarWorld.y > ${f(-MQ.faceDepth)}
      && all(greaterThan(vMarWorld.xz, uMarinaBox.xy)) && all(lessThan(vMarWorld.xz, uMarinaBox.zw))) {
    // HQ harbour quay (TASK-664, open crescent TASK-675): the deck as a signed distance md (< 0 on
    // the deck) along the quay's centre line (uMarinaQ) and its two stubs; marCq / marCs = the
    // course frame (u in from the drawn water edge, u along), marWet = the nearest edge is water
    vec2 marP = vMarWorld.xz;
    int marN = int(uMarinaInfo.x);
    float marBd = 1e9;
    int marBk = 0;
    float marBs = 0.0;
    float marS0 = 0.0;
    for (int k = 0; k < ${MQ.maxPoints - 1}; k++) {
      if (k >= marN - 1) break;
      vec2 a = uMarinaQ[k].xy;
      vec2 ab = uMarinaQ[k + 1].xy - a;
      float l2 = max(dot(ab, ab), 1e-6);
      vec2 dd = marP - a - ab * clamp(dot(marP - a, ab) / l2, 0.0, 1.0);
      float d2 = dot(dd, dd);
      if (d2 < marBd) { marBd = d2; marBk = k; marBs = marS0; }
      marS0 += sqrt(l2);
    }
    // the nearest segment's frame, blended half-way into the neighbour's toward each joint (the
    // arc and offset run on smoothly round the polyline's kinks)
    float marLk = length(uMarinaQ[marBk + 1].xy - uMarinaQ[marBk].xy);
    vec3 marF = marQuaySeg(marBk, marBs, marP);
    if (marF.z > 0.5 && marBk + 2 < marN) {
      marF.xy = mix(marF.xy, marQuaySeg(marBk + 1, marBs + marLk, marP).xy, 0.5 * smoothstep(0.5, 1.0, marF.z));
    } else if (marF.z <= 0.5 && marBk > 0) {
      float lp = length(uMarinaQ[marBk].xy - uMarinaQ[marBk - 1].xy);
      marF.xy = mix(marF.xy, marQuaySeg(marBk - 1, marBs - lp, marP).xy, 0.5 * (1.0 - smoothstep(0.0, 0.5, marF.z)));
    }
    float marT = clamp(marF.z, 0.0, 1.0);
    vec4 marQa = uMarinaQ[marBk];
    vec4 marQb = uMarinaQ[marBk + 1];
    float marWater = marF.y - uMarinaInfo.z;
    float marLand = mix(marQa.z, marQb.z, marT) - marF.y;
    float marEnd = max(-marF.x, marF.x - marS0);
    float marGap = (0.5 - mix(marQa.w, marQb.w, marT)) * marLk;
    float marOther = max(max(marLand, marEnd), marGap);
    float marMd = max(marWater, marOther);
    float marWet = step(marOther, marWater);
    float marCq = -marWater;
    float marCs = marF.x;
    float marSdfSea = 1.0 - smoothstep(${f(MQ.seaSdf[0])}, ${f(MQ.seaSdf[1])}, texture2D(uTerrainSdf, marUv).r);
    for (int k = 0; k < 2; k++) {
      vec4 sb = uMarinaStub[k];
      vec2 ab = sb.zw - sb.xy;
      float l = length(ab);
      if (l < 1e-3) continue;
      vec2 tt = ab / l;
      vec2 r = marP - sb.xy;
      float u = dot(r, tt);
      // a capsule, like the plan's stub deck; its root half-disc lies on the quay's end and has no
      // water edge of its own (no coping or face behind the root)
      float sd = length(r - tt * clamp(u, 0.0, l)) - uMarinaInfo.w;
      if (sd < marMd) { marMd = sd; marWet = marSdfSea * smoothstep(-0.5, 0.5, u); marCq = -sd; marCs = u; }
    }
    float marPe = max(max(length(marDPx.xz), length(marDPy.xz)), 1e-3);
    float marLum = dot(marBase, vec3(0.2126, 0.7152, 0.0722));
    float marSh = clamp(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / max(marLum, 1e-4), ${f(MQ.faceShade[0])}, ${f(MQ.faceShade[1])});
    vec3 marQc = diffuseColor.rgb;
    float marCw = max(${f(MQ.coping)}, ${f(MQ.copingPx)} * marPe);
    // deck: cream flags in courses parallel to the water edge, staggered, joints faded when small
    // (MAR_DETAIL only, over little of the zone paving's own world-aligned tiles; low quality keeps
    // the paving relief under a plain deck, coping and face)
    float marOnDeck = (1.0 - smoothstep(-0.5 * marPe, 0.5 * marPe, marMd))
                    * (1.0 - smoothstep(${f(MQ.heightBand)}, ${f(MQ.heightBand + 0.3)}, abs(vMarWorld.y - uMarinaInfo.y)));
    if (marOnDeck > 0.0) {
#ifdef MAR_DETAIL
      vec3 deck = uMarinaInk[0] * mix(1.0, marSh, ${f(MQ.deckRelief)});
      float cq = max(marCq - marCw, 0.0);
      float row = floor(cq / ${f(MQ.course.width)});
      float fr = cq - row * ${f(MQ.course.width)};
      float al = marCs / ${f(MQ.course.length)} + 0.5 * mod(row, 2.0);
      float col = floor(al);
      float fa = (al - col) * ${f(MQ.course.length)};
      float jd = min(min(fr, ${f(MQ.course.width)} - fr), min(fa, ${f(MQ.course.length)} - fa));
      float jw = max(${f(MQ.joint)}, ${f(MQ.jointPx)} * marPe);
      float jl = 1.0 - smoothstep(0.5 * jw, 0.5 * jw + marPe, jd);
      float fade = smoothstep(${f(MQ.jointFadePx[0])}, ${f(MQ.jointFadePx[1])}, ${f(MQ.course.width)} / marPe);
      float tone = 1.0 + ${f(MQ.flagTone)} * fade * (2.0 * fract(sin(dot(vec2(row, col), vec2(12.9898, 78.233))) * 43758.5453) - 1.0);
      deck *= tone * mix(1.0, ${f(MQ.jointShade)}, jl * fade);
#else
      vec3 deck = uMarinaInk[0] * mix(1.0, marSh, ${f(MQ.deckShade)});
#endif
      marQc = mix(marQc, deck, ${f(MQ.deckMix)} * marOnDeck);
    }
    // coping band inside the water edge (≥ copingPx px), a light lip on its deck side, then the face
    float marCop = smoothstep(-marCw - 0.5 * marPe, -marCw + 0.5 * marPe, marMd) * marWet;
    float marLw = max(${f(MQ.copingLip)}, ${f(MQ.copingLipPx)} * marPe);
    float marLip = (1.0 - smoothstep(0.5 * marLw, 0.5 * marLw + marPe, abs(marMd + marCw + 0.5 * marLw))) * marWet;
    // face: off the drawn edge, or below the deck where the 2 u grid's brink runs past it;
    // stone / deck / berth texels only (lagoon texels reach above the water between samples)
    float marBelow = 1.0 - smoothstep(uMarinaInfo.y - ${f(MQ.faceBelow[1])}, uMarinaInfo.y - ${f(MQ.faceBelow[0])}, vMarWorld.y);
    float marFace = max(smoothstep(-0.5 * marPe, 0.5 * marPe, marMd), marBelow * (1.0 - marCop))
                  * (1.0 - smoothstep(${f(MQ.faceReach - 1)}, ${f(MQ.faceReach)}, marMd)) * marWet
                  * float(marZone == ${Zone.rock}.0 || marZone == ${Zone.plaza}.0 || marZone == ${Zone.lagoon}.0 || vMarWorld.y < 0.05);
    marQc = mix(marQc, uMarinaInk[1] * mix(1.0, marSh, ${f(MQ.deckShade)}), marCop * (1.0 - smoothstep(0.0, 0.5 * marPe, marMd)));
    marQc = mix(marQc, uMarinaInk[0], ${f(MQ.copingLipMix)} * marLip);
    marQc = mix(marQc, uMarinaInk[2] * marSh, marFace);
    diffuseColor.rgb = marQc;
  }
  if (uCarpetDim.w > 0.5 && abs(vMarWorld.y - uCarpetDim.z) < ${f(CP.heightBand)}) {
    vec2 marKq = vMarWorld.xz - uCarpet.xy;
    float marKa = dot(marKq, uCarpet.zw);
    float marKx = marKq.x * -uCarpet.w + marKq.y * uCarpet.z;
    float marKe = 0.75 * max(max(length(marDPx.xz), length(marDPy.xz)), 1e-3);
    float marKd = max(abs(marKx) - uCarpetDim.x, abs(marKa) - uCarpetDim.y);
    if (marKd < marKe) {
      vec3 marKdet = mix(vec3(1.0), diffuseColor.rgb / max(marBase, vec3(1e-3)), ${f(CP.detail)});
      float marKw = 1.0 + ${f(CP.weave)} * sin(marKa * 23.0 + marKx * 5.0) * sin(marKa * 7.0 - marKx * 19.0);
      vec3 marKc = uCarpetInk[0] * marKw;
      // gold trim lines inside either edge (the strip's own distance to its edge)
      float marKin = uCarpetDim.x - abs(marKx);
      float marKt = smoothstep(${f(CP.trimBand[0])} - marKe, ${f(CP.trimBand[0])} + marKe, marKin)
                  * (1.0 - smoothstep(${f(CP.trimBand[1])} - marKe, ${f(CP.trimBand[1])} + marKe, marKin));
      marKc = mix(marKc, uCarpetInk[1], marKt);
      // star plates down both edges, one every pitch
      float marKcell = floor(marKa / ${f(CP.pitch)} + 0.5);
      vec2 marKp = vec2(abs(marKx) - (uCarpetDim.x - ${f(CP.plateInset)}), marKa - marKcell * ${f(CP.pitch)});
      float marKbox = max(abs(marKp.x), abs(marKp.y)) - ${f(CP.plateHalf)};
      float marKpl = 1.0 - smoothstep(-marKe, marKe, marKbox);
      float marKol = 1.0 - smoothstep(0.03 - marKe, 0.03 + marKe, abs(marKbox + 0.03));
      float marKs = 1.0 - smoothstep(-marKe, marKe, marStar5(vec2(marKp.x, marKp.y), ${f(CP.starR)}, 0.45));
      float marKlim = step(abs(marKa), uCarpetDim.y - ${f(CP.plateHalf)});
      marKc = mix(marKc, uCarpetInk[2], marKpl * marKlim);
      marKc = mix(marKc, uCarpetInk[4], marKol * marKlim * (1.0 - smoothstep(0.0, 1.5, marKe)));
      marKc = mix(marKc, uCarpetInk[3], marKs * marKlim);
      diffuseColor.rgb = mix(diffuseColor.rgb, marKc * marKdet, 1.0 - smoothstep(-marKe, marKe, marKd));
    }
  }
  if (uCompass.z > 0.0) {
    vec2 marCp = vMarWorld.xz - uCompass.xy;
    float marCr = length(marCp);
    float marR = uCompass.z;
    if (marCr < marR - ${RIM1} + ${f(CM.rimLine * 2)} && abs(vMarWorld.y - uCompass.w) < ${f(CM.heightBand)}) {
      float marE = 0.75 * max(max(length(marDPx.xz), length(marDPy.xz)), 1e-3);
      vec3 marDet = diffuseColor.rgb / max(marBase, vec3(1e-3));
      vec3 marC = diffuseColor.rgb;
      float marRayLen = marR - ${RIM0} - ${f(CM.tipInset)};
      float marDotR = marR - ${f((CM.rim[0] + CM.rim[1]) / 2)};
      // the ray holding this pixel most centrally (rays overlap near the medallion)
      float marBest = -1e3;
      float marSide = 0.0;
      vec3 marAcc = vec3(0.0);
      float marDot = 1e3;
      vec3 marDotC = vec3(0.0);
      for (int k = 0; k < ${CM.maxRays}; k++) {
        vec4 ry = uCompassRay[k];
        if (ry.w < 0.5) continue;
        float al = dot(marCp, ry.xy);
        float ac = ry.x * marCp.y - ry.y * marCp.x;
        float hw = ${f(CM.rayWidth)} * clamp(1.0 - al / marRayLen, 0.0, 1.0);
        float m = al > 0.0 ? (hw - abs(ac)) / max(hw, 0.05) * hw : -1e3;
        if (m > marBest) { marBest = m; marSide = ac; marAcc = uCompassCol[k]; }
        float dd = length(marCp - ry.xy * marDotR) - ${f(CM.dot)};
        if (dd < marDot) { marDot = dd; marDotC = uCompassCol[k]; }
      }
      vec3 marPave = mix(marBase, uCompassInk[0], 0.5);
      // rim band (grout) with a light line either side: the plaza reads round from any height
      float marB0 = marR - ${RIM0};
      float marB1 = marR - ${RIM1};
      float marBand = smoothstep(marB0 - marE, marB0 + marE, marCr) * (1.0 - smoothstep(marB1 - marE, marB1 + marE, marCr));
      float marLine = max(1.0 - smoothstep(${f(CM.rimLine)} - marE, ${f(CM.rimLine)} + marE, abs(marCr - marB0 + ${f(CM.rimLine)})),
                          1.0 - smoothstep(${f(CM.rimLine)} - marE, ${f(CM.rimLine)} + marE, abs(marCr - marB1 - ${f(CM.rimLine)})));
      marC = mix(marC, mix(uCompassInk[1], uCompassInk[0], ${f(CM.rimPaving)}) * marDet, marBand);
      marC = mix(marC, uCompassInk[2] * marDet, marLine);
      // rays: accent on the lit half, shaded half the other side of the spine
      if (marBest > -marE - ${f(CM.outline)}) {
        float marIn = smoothstep(-marE, marE, marBest);
        float marLit = mix(${f(CM.shade)}, 1.0, smoothstep(-marE, marE, marSide));
        vec3 marRay = mix(marPave, marAcc, ${f(CM.rayMix)}) * marLit * marDet;
        float marOut = 1.0 - smoothstep(${f(CM.outline)} - marE, ${f(CM.outline)} + marE, abs(marBest));
        marC = mix(marC, marRay, marIn);
        marC = mix(marC, uCompassInk[1] * 0.8 * marDet, marOut * (1.0 - smoothstep(0.0, 1.5, marE)));
      }
      // gate dots on the rim band
      float marDin = 1.0 - smoothstep(-marE, marE, marDot);
      marC = mix(marC, uCompassInk[1] * 0.8 * marDet, (1.0 - smoothstep(${f(CM.outline)} - marE, ${f(CM.outline)} + marE, abs(marDot))) * (1.0 - smoothstep(0.0, 1.5, marE)));
      marC = mix(marC, marDotC * marDet, marDin);
      // centre medallion: HQ ring, light core
      float marHub = 1.0 - smoothstep(${f(CM.hub)} - marE, ${f(CM.hub)} + marE, marCr);
      float marCore = 1.0 - smoothstep(${f(CM.core)} - marE, ${f(CM.core)} + marE, marCr);
      marC = mix(marC, uCompassInk[1] * 0.8 * marDet, (1.0 - smoothstep(${f(CM.outline)} - marE, ${f(CM.outline)} + marE, abs(marCr - ${f(CM.hub)}))) * (1.0 - smoothstep(0.0, 1.5, marE)));
      marC = mix(marC, mix(marPave, uCompassInk[3], ${f(CM.rayMix)}) * marDet, marHub);
      marC = mix(marC, uCompassInk[2] * marDet, marCore);
      diffuseColor.rgb = marC;
    }
  }
`;

/** Prism-arch light pools (added light × albedo, after the cloud shadow). */
export const GROUND_ART_LIGHT_GLSL = /* glsl */ `
#ifdef MAR_PRISM
  if (uPrism[0].w > 0.5) {
    vec3 marS = uSunSkyDir;
    float marDay = smoothstep(${f(PP.sunY[0])}, ${f(PP.sunY[1])}, marS.y) * mix(${f(PP.day)}, ${f(PP.golden)}, uGolden)
                 * (1.0 - smoothstep(0.0, 0.5, uWeather.y));
    float marNt = uLamps.x * ${f(PP.night)};
    if (marDay + marNt > 0.0) {
      vec2 marSh = -marS.xz / max(marS.y, 0.05) * ${f(PP.height)};
      float marSl = length(marSh);
      if (marSl > ${f(PP.maxOffset)}) marSh *= ${f(PP.maxOffset)} / marSl;
      vec2 marA = marSl > 1e-4 ? -marS.xz / max(length(marS.xz), 1e-4) : vec2(1.0, 0.0);
      vec2 marBx = vec2(-marA.y, marA.x);
      float marLen = ${f(PP.length)} * (1.0 + ${f(PP.stretch)} * (1.0 - clamp(marS.y, 0.0, 1.0)));
      vec3 marSc = mix(vec3(dot(uSunColor, vec3(0.2126, 0.7152, 0.0722))), uSunColor, 0.5);
      vec3 marPl = vec3(0.0);
      for (int k = 0; k < ${PP.maxArches}; k++) {
        vec4 pr = uPrism[k];
        if (pr.w < 0.5) break;
        if (abs(vMarWorld.y - pr.z) > 2.5) continue;
        vec2 q = vMarWorld.xz - pr.xy;
        if (marDay > 0.0) {
          vec2 qs = q - marSh;
          float u = dot(qs, marA) / marLen;
          float v = dot(qs, marBx) / ${f(PP.width)};
          float e = u * u + v * v;
          if (e < 1.0) marPl += marPrismSpectrum(v * 0.5 + 0.5) * marSc * ((1.0 - smoothstep(0.3, 1.0, e)) * marDay);
        }
        if (marNt > 0.0) {
          float e = dot(q, q) * ${f(1 / (PP.nightRadius * PP.nightRadius))};
          if (e < 1.0) marPl += marPrismSpectrum(atan(q.y, q.x) * 0.15915494 + 0.5) * ((1.0 - smoothstep(0.0, 1.0, e)) * marNt);
        }
      }
      vec3 marAlb = mix(vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), diffuseColor.rgb, ${f(PP.albedoHue)});
      outgoingLight += marAlb * marPl * (1.0 - uDebugMask);
    }
  }
#endif
`;
