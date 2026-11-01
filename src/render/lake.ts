import * as THREE from 'three';
import { DATA_LAKE as L } from '../content/data-lake.ts';
import { dataLakeOf, type DataLake, type WorldData } from '../world/index.ts';

/**
 * Data Lake surface (TASK-547, D-125), in the terrain program like the lava river (0 programs, 0 draw
 * calls, 0 textures): the lake stands on the plateau, the water mesh does not reach it. The mask is the
 * outline from world/data-lake.ts, not the zone, because Zone.crater also marks the Tech Park pools.
 *
 * - `LAKE_COLOR_GLSL` (in 'color_fragment', after the lava): navy depth ramp, a wet line, a stone kerb
 *   over the zone's 2 u steps, fibre lines under the water; with MAR_DETAIL they flow and bend with the
 *   surface and packets ride them; without it (low) the lines are static and there are no packets.
 * - `LAKE_EMISSIVE_GLSL` (in the aomap block): the same light, mostly at night; with MAR_DETAIL the blue
 *   spill on the quay.
 *
 * Time comes from SHARED.uTime (the sim clock): pixel-stable shots, no Math.random / Date.now.
 */

/** The world's one Data Lake (D-121: Millbrook, a seed may have none). */
export function lakeOf(world: WorldData): DataLake | null {
  for (const isl of world.islands) {
    const l = dataLakeOf(isl);
    if (l) return l;
  }
  return null;
}

/**
 * Terrain uniforms: `uLakeFrame` = (x, z, cos rotY, sin rotY); `uLakeSize` = (a, b, wobble, phase);
 * `uLakeInfo` = (water level, squared reach of the paint from the centre): reach 0 = off, so a seed
 * without a lake pays one comparison per fragment.
 */
export function lakeUniforms(world: WorldData): Record<string, THREE.IUniform> {
  const frame = new THREE.Vector4(0, 0, 1, 0);
  const size = new THREE.Vector4(1, 1, 0, 0);
  const info = new THREE.Vector2(0, 0);
  const l = lakeOf(world);
  if (l) {
    frame.set(l.x, l.z, Math.cos(l.rotY), Math.sin(l.rotY));
    size.set(l.a, l.b, l.wobble, l.phase);
    const reach =
      Math.max(l.a, l.b) * (1 + l.wobble) + Math.max(L.spill.radius, L.kerb.width) + 0.5;
    info.set(l.level, reach * reach);
  }
  return { uLakeFrame: { value: frame }, uLakeSize: { value: size }, uLakeInfo: { value: info } };
}

const f = (v: number): string => v.toFixed(5);
/** Palette hex → linear GLSL constant (no colour uniforms for look numbers that never change). */
const col = (hex: string): string => {
  const c = new THREE.Color(hex);
  return `vec3(${f(c.r)}, ${f(c.g)}, ${f(c.b)})`;
};
const C = L.colors;
const D = L.depth;
const FB = L.fibre;
const P = L.packet;
const SH = L.sheen;

/** Pars. */
export const LAKE_PARS_GLSL = /* glsl */ `
uniform vec4 uLakeFrame;
uniform vec4 uLakeSize;
uniform vec2 uLakeInfo;
`;

/**
 * Lake colour (in 'color_fragment', needs 'marNP' / 'marDPx' from the ground colour). Declares
 * 'marLakeF' / 'marLakeH' (fibre core / halo weight), 'marLakeK' (packet weight) and 'marLakeS' (signed
 * outline distance, 1e9 = far) at main scope for LAKE_EMISSIVE_GLSL.
 */
export const LAKE_COLOR_GLSL = /* glsl */ `
  float marLakeF = 0.0;
  float marLakeH = 0.0;
  float marLakeK = 0.0;
  float marLakeS = 1e9;
  vec2 marLakeD = vMarWorld.xz - uLakeFrame.xy;
  if (dot(marLakeD, marLakeD) < uLakeInfo.y && uDebugMask < 0.5
      && abs(vMarWorld.y - uLakeInfo.x) < ${f(L.heightBand)}) {
    // the outline's GLSL form (world/data-lake.ts, lakeEdge)
    vec2 marQ = vec2(marLakeD.x * uLakeFrame.z + marLakeD.y * uLakeFrame.w,
                     -marLakeD.x * uLakeFrame.w + marLakeD.y * uLakeFrame.z);
    vec2 marN = marQ / uLakeSize.xy;
    float marR = max(length(marN), 1e-3);
    float marEd = marR - (1.0 + uLakeSize.z * cos(3.0 * atan(marN.y, marN.x) + uLakeSize.w));
    float marS = marEd * marR / max(length(marN / uLakeSize.xy), 1e-4);
    marLakeS = marS;
    float marPx = max(0.6 * max(length(marDPx.xz), length(marDPy.xz)), 0.03);
    float marKb = 1.0 - smoothstep(${f(L.kerb.width)} - marPx, ${f(L.kerb.width)} + marPx, marS);
    if (marKb > 0.0) {
      diffuseColor.rgb = mix(diffuseColor.rgb, ${col(C.kerb)}, marKb);
    }
    float marIn = 1.0 - smoothstep(-marPx, marPx, marS);
    if (marIn > 0.0) {
      // calm navy: a shallow ring, then deeper toward the middle
      vec3 marW = mix(mix(${col(C.shallow)}, ${col(C.mid)}, ${f(1 - D.shallowMix)}), ${col(C.mid)}, smoothstep(0.0, ${f(D.shallow)}, -marS));
      marW = mix(marW, ${col(C.deep)}, smoothstep(${f(D.shallow)}, ${f(D.deep)}, -marS));
      // fibres: the bundle squeezes toward the tips of the long axis and bends as one
      float marTip = clamp(marN.x, -1.0, 1.0);
      float marPin = mix(1.0, sqrt(max(1.0 - marTip * marTip, 0.05)), ${f(FB.pinch)});
      float marV = marQ.y / marPin + ${f(FB.wander[0][0])} * sin(marQ.x * ${f(FB.wander[0][1])} + uLakeSize.w)
                 + ${f(FB.wander[1][0])} * sin(marQ.x * ${f(FB.wander[1][1])} + 2.0 * uLakeSize.w);
#ifdef MAR_DETAIL
      // the moving surface bends what is seen under it
      marV += ${f(FB.refract.amp)} * (marVNoise(vMarWorld.xz * ${f(FB.refract.scale)} + uTime * ${f(FB.refract.rate)}) - 0.5);
#endif
      float marSp = 2.0 * uLakeSize.y / ${f(FB.lines)};
      float marCv = marV / marSp;
      float marFe = smoothstep(0.0, ${f(FB.inset)}, -marS);
      // the line of this cell and both neighbours: halos overlap, so a glow never stops on a cell edge
      for (int k = -1; k <= 1; k++) {
        float marId = floor(marCv) + float(k);
        float marH0 = marHash12(vec2(marId, 7.31));
        float marH1 = marHash12(vec2(marId, 19.7));
        float marFr = marCv - marId - 0.5 + (marH0 - 0.5) * ${f(FB.jitter)};
#ifdef MAR_DETAIL
        marFr += ${f(FB.drift.amp)} * sin(marQ.x * ${f(FB.drift.freq)} + 6.2832 * marH1 + uTime * ${f(FB.drift.rate)});
#endif
        float marDl = abs(marFr) * marSp * marPin;
        // thin lines dim instead of aliasing once the pixel outgrows them
        float marCo = (1.0 - smoothstep(${f(FB.coreWidth)} - marPx, ${f(FB.coreWidth)} + marPx, marDl)) * min(1.0, ${f(FB.coreWidth)} / marPx);
        float marHl = exp(-marDl * marDl / ${f(FB.haloWidth * FB.haloWidth)});
#ifdef MAR_DETAIL
        float marDir = marH1 > 0.5 ? 1.0 : -1.0;
        float marFs = marQ.x - marDir * ${f(FB.flow.speed)} * uTime + marH0 * ${f(FB.flow.period)};
        float marPu = 0.5 + 0.5 * cos(6.2832 * marFs / ${f(FB.flow.period)});
        marPu = ${f(FB.flow.floor)} + ${f(1 - FB.flow.floor)} * marPu * marPu * marPu;
        // packets: one slot per spacing along the line, some in use; a dot keeps its slot while it crosses
        float marPs = (marQ.x - marDir * ${f(P.speed)} * uTime) / ${f(P.spacing)} + marH1 * 3.7;
        float marSl = floor(marPs);
        float marHp = marHash12(vec2(marId + 3.1, marSl));
        if (marHp < ${f(P.share)}) {
          vec2 marPd = vec2((marPs - marSl - 0.5 + (fract(marHp * 41.7) - 0.5) * 0.5) * ${f(P.spacing)}, marDl);
          float marPr = max(${f(P.radius)}, marPx * ${f(P.minPixels)});
          float marPl = length(marPd);
          float marPa = ${f(P.radius * P.radius)} / (marPr * marPr);
          float marPh = exp(-marPl * marPl / (marPr * marPr * ${f(P.halo * P.halo)}));
          marLakeK += (1.0 - smoothstep(marPr - marPx, marPr + marPx, marPl)) * marPa + ${f(P.haloGain)} * marPh * max(marPa, 0.2);
        }
#else
        float marPu = ${f(FB.flow.flat)};
#endif
        marLakeF += marCo * marPu;
        marLakeH += marHl * marPu;
      }
      marLakeF *= marFe * marIn;
      marLakeH *= marFe * marIn;
      marLakeK *= marFe * marIn;
#ifdef MAR_DETAIL
      // slow sheen on the calm surface
      float marSn = marVNoise(vMarWorld.xz * ${f(SH.scale)} + vec2(uTime * ${f(SH.rate)}, -uTime * ${f(SH.rate * 0.7)})) - 0.5;
      marW *= 1.0 + ${f(2 * SH.amount)} * marSn;
#endif
      marW = mix(marW, ${col(C.core)}, clamp(marLakeF * ${f(FB.albedo.core)} + marLakeH * ${f(FB.albedo.halo)}, 0.0, 1.0));
      // a thin wet line at the outline
      marW = mix(marW, ${col(C.foam)}, ${f(L.foam.mix)} * (1.0 - smoothstep(${f(L.foam.width)} - marPx, ${f(L.foam.width)} + marPx, -marS)));
      diffuseColor.rgb = mix(diffuseColor.rgb, marW, marIn);
      marNP *= 1.0 - marIn * ${f(1 - SH.normal)};
    }
  }
`;

/** Lake light (in the aomap block). */
export const LAKE_EMISSIVE_GLSL = /* glsl */ `
  if (marLakeS < 1e8) {
    // the water keeps a faint inner blue at night: navy, never black
    totalEmissiveRadiance += ${col(C.fibre)} * (smoothstep(0.0, 0.4, -marLakeS) * ${f(L.body.night)} * uNight);
    totalEmissiveRadiance += ${col(C.core)} * (marLakeF * (${f(FB.core.day)} + ${f(FB.core.night)} * uNight));
    totalEmissiveRadiance += ${col(C.fibre)} * (marLakeH * (${f(FB.halo.day)} + ${f(FB.halo.night)} * uNight));
#ifdef MAR_DETAIL
    totalEmissiveRadiance += ${col(C.packet)} * (marLakeK * (${f(P.day)} + ${f(P.night)} * uNight));
    if (marLakeS > 0.0) {
      float marLsp = 1.0 - smoothstep(0.0, ${f(L.spill.radius)}, marLakeS);
      totalEmissiveRadiance += diffuseColor.rgb * ${col(C.fibre)} * (marLsp * marLsp * ${f(L.spill.night)} * uNight);
    }
#endif
  }
`;
