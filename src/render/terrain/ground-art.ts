import * as THREE from 'three';
import type { WorldData } from '../../world/types.ts';
import { heightAt, THEME_IDS } from '../../world/types.ts';
import { CARPET as CP, COMPASS_MOSAIC as CM, PRISM_POOLS as PP } from '../../content/ground-art.ts';
import { SHARED } from '../uniforms.ts';

/**
 * Ground art of the terrain material (TASK-468, content/ground-art.ts): the HQ compass mosaic and
 * the Design prism-arch light pools, analytic shapes in the ONE terrain program (no mesh, no draw
 * call, no texture). Uniforms are plain values built from the world (no GPU resource to own).
 *
 * - `GROUND_ART_COLOR_GLSL` (after the ground colour, in `color_fragment`): the mosaic over the
 *   'compass' district's albedo; needs `marDPx` / `marDPy` / `marBase` from the ground colour.
 *   The Marketing red carpet (TASK-481) is painted in the same block: a rotated strip over the
 *   first 'carpet' district, gold trim lines and star plates.
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

const f = (v: number): string => v.toFixed(5);

export const GROUND_ART_PARS_GLSL = /* glsl */ `
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
