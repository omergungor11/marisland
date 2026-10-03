import { FIELDS_GLSL } from '../shaders/chunks/fields.glsl.ts';
import { CLOUD_SHADOW_GLSL } from '../shaders/chunks/cloud-shadow.glsl.ts';
import { NIGHT_GLSL, POOL_GAIN } from '../shaders/chunks/night.glsl.ts';
import { MIST_GLSL } from '../shaders/chunks/mist.glsl.ts';
import { RIPPLES } from '../../content/weather.ts';
import { GRID_SAMPLE_GLSL } from '../world-textures.ts';
import { WATER_SHADER as W } from '../../content/water.ts';
import { bandDefines, glslFloat as f } from './water-bands.ts';

/**
 * Water ShaderMaterial source (TASK-103). Everything (bands, alpha, foam, glints,
 * moon streak, sky fresnel, fog) happens in one program; depth and shore distance
 * come from the world grid textures, never from the depth buffer.
 */
/** Glitter sparkle cell params → `vec4(density, fraction, radius, rate)`. */
function glitterVec(p: {
  density: number;
  fraction: number;
  radius: number;
  rate: number;
}): string {
  return `vec4(${f(p.density)}, ${f(p.fraction)}, ${f(p.radius)}, ${f(p.rate)})`;
}

export function waterDefines(): string {
  const fo = W.foam;
  const g = W.glint;
  return [
    bandDefines(),
    `#define MAR_BAND_SOFT ${f(W.bandSoft)}`,
    `#define MAR_A_LAGOON ${f(W.alpha.lagoon)}`,
    `#define MAR_A_SHALLOW ${f(W.alpha.shallow)}`,
    `#define MAR_A_DEEP ${f(W.alpha.deep)}`,
    `#define MAR_A_DEPTH0 ${f(W.alphaDepth[0])}`,
    `#define MAR_A_DEPTH1 ${f(W.alphaDepth[1])}`,
    `#define MAR_DARKEN ${f(W.depthDarken.amount)}`,
    `#define MAR_DARKEN0 ${f(W.depthDarken.from)}`,
    `#define MAR_DARKEN1 ${f(W.depthDarken.to)}`,
    `#define MAR_SWELL_FLAT ${f(W.swellShore.flatUntil)}`,
    `#define MAR_SWELL_FULL ${f(W.swellShore.fullAt)}`,
    `#define MAR_NORMAL_SCALE ${f(W.normalScale)}`,
    `#define MAR_RIPPLE_SCALE ${f(W.ripple.scale)}`,
    `#define MAR_RIPPLE_STRENGTH ${f(W.ripple.strength)}`,
    `#define MAR_RIPPLE_SPEED vec2(${f(W.ripple.speed[0])}, ${f(W.ripple.speed[1])})`,
    `#define MAR_RIPPLE_FADE0 ${f(W.ripple.fadeFrom)}`,
    `#define MAR_RIPPLE_FADE1 ${f(W.ripple.fadeTo)}`,
    `#define MAR_FRES_BASE ${f(W.fresnel.base)}`,
    `#define MAR_FRES_GRAZE ${f(W.fresnel.grazing)}`,
    `#define MAR_FRES_MAX ${f(W.fresnel.max)}`,
    `#define MAR_FRES_ZENITH ${f(W.fresnel.zenith)}`,
    `#define MAR_BAND_JITTER ${f(W.bandJitter)}`,
    `#define MAR_SUN_TINT ${f(W.light.sunTint)}`,
    `#define MAR_NIGHT_TINT ${f(W.light.nightTint)}`,
    `#define MAR_VIEW_HAZE_POW ${f(W.viewHazePow)}`,
    `#define MAR_LOWSUN_Y0 ${f(W.lowSun.y[0])}`,
    `#define MAR_LOWSUN_Y1 ${f(W.lowSun.y[1])}`,
    `#define MAR_SUN_LOBE vec2(${f(W.lowSun.lobe.across)}, ${f(W.lowSun.lobe.along)})`,
    `#define MAR_SUN_SPARK ${glitterVec(W.lowSun.sparkle)}`,
    `#define MAR_SUN_GAIN ${f(W.lowSun.sparkle.gain)}`,
    `#define MAR_SUN_GLOW ${f(W.lowSun.glow)}`,
    `#define MAR_SUN_FARGLOW ${f(W.lowSun.farGlow)}`,
    `#define MAR_SUN_GLINTFADE ${f(W.lowSun.dayGlintFade)}`,
    `#define MAR_LAP_PERIOD ${f(fo.lapPeriod)}`,
    `#define MAR_LAP_ADVANCE ${f(fo.lapAdvance)}`,
    `#define MAR_LAP_IN ${f(fo.lapInFraction)}`,
    `#define MAR_LINE_PX ${f(fo.minLinePx)}`,
    `#define MAR_FBAND_K ${f((2 * Math.PI) / fo.bandSpacing)}`,
    `#define MAR_FBAND_W ${f((2 * Math.PI) / fo.bandPeriod)}`,
    `#define MAR_FBAND_FADE0 ${f(fo.bandFadeStart)}`,
    `#define MAR_FBAND_FADE1 ${f(fo.bandFadeEnd)}`,
    `#define MAR_FBAND_TH ${f(fo.bandThreshold)}`,
    `#define MAR_DOT_DENSITY ${f(fo.dotDensity)}`,
    `#define MAR_DOT_FRACTION ${f(fo.dotFraction)}`,
    `#define MAR_DOT_RADIUS ${f(fo.dotRadius)}`,
    `#define MAR_DOT_DRIFT ${f(fo.dotDrift)}`,
    `#define MAR_GLINT_EXP ${f(g.exponent)}`,
    `#define MAR_GLINT_STRENGTH ${f(g.strength)}`,
    `#define MAR_GLINT_GOLDEN ${f(g.goldenBoost)}`,
    `#define MAR_GLINT_JSCALE ${f(g.jitterScale)}`,
    `#define MAR_GLINT_JITTER ${f(g.jitter)}`,
    `#define MAR_GLINT_MSCALE ${f(g.maskScale)}`,
    `#define MAR_GLINT_TH0 ${f(g.maskThreshold[0])}`,
    `#define MAR_GLINT_TH1 ${f(g.maskThreshold[1])}`,
    `#define MAR_GLITTER_SWELL ${f(W.moon.normal[0])}`,
    `#define MAR_GLITTER_RIPPLE ${f(W.moon.normal[1])}`,
    `#define MAR_MOON_LOBE vec2(${f(W.moon.lobe.across)}, ${f(W.moon.lobe.along)})`,
    `#define MAR_MOON_SPARK ${glitterVec(W.moon.sparkle)}`,
    `#define MAR_MOON_GAIN ${f(W.moon.sparkle.gain)}`,
    `#define MAR_MOON_GLOW ${f(W.moon.glow)}`,
    `#define MAR_MOON_FARGLOW ${f(W.moon.farGlow)}`,
    `#define MAR_MOON_FAR0 ${f(W.moon.far[0])}`,
    `#define MAR_MOON_FAR1 ${f(W.moon.far[1])}`,
    `#define MAR_OUTER_RADIUS ${f(W.grid.outerRadius)}`,
    `#define MAR_RIP_DENSITY ${f(RIPPLES.density)}`,
    `#define MAR_RIP_RATE ${f(1 / RIPPLES.seconds)}`,
    `#define MAR_RIP_RADIUS ${f(RIPPLES.radius * RIPPLES.density)}`,
    `#define MAR_RIP_WIDTH ${f(RIPPLES.width)}`,
    `#define MAR_RIP_BRIGHT ${f(RIPPLES.bright)}`,
    `#define MAR_RIP_NORMAL ${f(RIPPLES.normal)}`,
    `#define MAR_RIP_FP0 ${f(RIPPLES.footprint[0])}`,
    `#define MAR_RIP_FP1 ${f(RIPPLES.footprint[1])}`,
    `#define MAR_RIP_BFP0 ${f(RIPPLES.brightFootprint[0])}`,
    `#define MAR_RIP_BFP1 ${f(RIPPLES.brightFootprint[1])}`,
  ].join('\n');
}

const COMMON = /* glsl */ `
uniform sampler2D uSdfTex;
uniform vec3 uGridMap;
uniform float uTime;
uniform vec4 uWind;
uniform vec2 uSwell;
uniform float uMotionScale;
${GRID_SAMPLE_GLSL}
${FIELDS_GLSL}
/* swell amplitude factor by shore distance: flat at the beach, full beyond the shallow ring */
float marShoreAmp(float d) { return smoothstep(MAR_SWELL_FLAT, MAR_SWELL_FULL, d); }
`;

export const WATER_VERT = /* glsl */ `
${COMMON}
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float d = -marSampleGrid(uSdfTex, wp.xz);
  float amp = marShoreAmp(d) * uSwell.x * uMotionScale;
  wp.y = marSwellY(wp.xz, uTime, uWind.xy, amp, uSwell.y);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const WATER_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uHeightTex;
uniform sampler2D uTrailTex;
uniform vec3 uTrailMap;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uHemiSky;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uCameraPos;
uniform float uNight;
uniform float uGolden;
uniform float uDebugMask;
uniform vec3 uMoonDir;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uShallow;
uniform vec3 uLagoon;
uniform vec3 uFoam;
uniform vec4 uWeather;
varying vec3 vWorld;
${CLOUD_SHADOW_GLSL}
${NIGHT_GLSL}
${MIST_GLSL}

float marHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
/* value noise + analytic gradient (x = value, yz = d/dx, d/dy) */
vec3 marNoised(vec2 x) {
  vec2 i = floor(x);
  vec2 fr = fract(x);
  vec2 u = fr * fr * (3.0 - 2.0 * fr);
  vec2 du = 6.0 * fr * (1.0 - fr);
  float a = marHash12(i);
  float b = marHash12(i + vec2(1.0, 0.0));
  float c = marHash12(i + vec2(0.0, 1.0));
  float d = marHash12(i + vec2(1.0, 1.0));
  float k = a - b - c + d;
  return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y,
              du * (vec2(b - a, c - a) + k * u.yx));
}
float marNoise(vec2 x) { return marNoised(x).x; }

/* Same curve as the scene's FogExp2 that every lit material gets (one fog look for land
   and water); TASK-104 owns the curve — change it here and in sky.ts together. */
float marFogFactor(float dist) {
  float x = uFogDensity * dist;
  return 1.0 - exp(-x * x);
}

/* shore lap 0..1: ease-out advance, ease-in retreat (ART_BIBLE §7 #2) */
float marLap(float t) {
  float p = fract(t / MAR_LAP_PERIOD);
  if (p < MAR_LAP_IN) { float q = p / MAR_LAP_IN; return 1.0 - (1.0 - q) * (1.0 - q); }
  float q = (p - MAR_LAP_IN) / (1.0 - MAR_LAP_IN);
  return 1.0 - q * q;
}

/* Rain ripple rings (TASK-172): two hash-jittered cell layers, one expanding ring per active cell
   (cells active with probability = rain intensity). x = ring 0..1, yz = normal xz offset. */
vec3 marRainRipples(vec2 xz, float t, float fp, float rain) {
  vec3 acc = vec3(0.0);
  float w = max(MAR_RIP_WIDTH, fp * MAR_RIP_DENSITY * 0.7);
  for (int l = 0; l < 2; l++) {
    float fl = float(l);
    vec2 p = xz * MAR_RIP_DENSITY + fl * vec2(0.5, 0.37);
    vec2 ci = floor(p);
    if (marHash12(ci + 9.1 + fl * 4.3) > rain) continue;
    vec2 off = (vec2(marHash12(ci + 3.1 + fl), marHash12(ci + 5.7 + fl)) - 0.5) * (1.0 - 2.0 * MAR_RIP_RADIUS);
    float ph = fract(t * MAR_RIP_RATE + marHash12(ci + 1.7 + fl * 7.9));
    vec2 dv = fract(p) - 0.5 - off;
    float d = length(dv);
    float x = (d - (1.0 - (1.0 - ph) * (1.0 - ph)) * MAR_RIP_RADIUS) / w;  // ease-out growth
    float g = exp(-x * x * 2.0);
    float life = (1.0 - ph) * (1.0 - ph);
    acc.x += g * life;
    acc.yz += dv / max(d, 1e-3) * (x * g * life);
  }
  return acc;
}

/* Glitter path toward the light Ld (moon at night, low sun at golden hour; D6/D7). The facet that
   mirrors Ld into the eye has normal H = normalize(Ld + V); its tilt from the smooth swell normal
   nS, split across / along the light's azimuth, feeds an anisotropic gaussian lobe → a narrow
   path that stretches toward the light. Inside the lobe sparse cells twinkle (lit with
   p = lobe × fraction); cells under ~2 px fold into the lobe glow (cpx = cells per pixel, computed
   outside any branch). x = sparkle 0..1, y = lobe 0..1. sp = density, fraction, radius, rate. */
vec2 marGlitter(vec3 Ld, vec3 V, vec3 nS, vec2 xz, float t, float cpx, vec2 lobeK, vec4 sp, float salt) {
  vec3 Hh = normalize(Ld + V);
  vec3 tl = Hh - nS * dot(Hh, nS);
  vec2 m = normalize(Ld.xz + 1e-5);
  float ac = dot(tl.xz, vec2(-m.y, m.x));
  float al = dot(tl.xz, m);
  float lobe = exp(-ac * ac * lobeK.x - al * al * lobeK.y);
  vec2 cp = xz * sp.x + salt;
  vec2 ci = floor(cp);
  float act = step(marHash12(ci + salt + 11.3), lobe * sp.y);
  float ph = fract(t * sp.w + marHash12(ci + 4.1));
  float tw = smoothstep(0.0, 0.18, ph) * (1.0 - smoothstep(0.32, 0.62, ph));
  vec2 off = vec2(marHash12(ci + 3.1), marHash12(ci + 7.7)) * 0.6 + 0.2;
  float r = length(fract(cp) - off) / max(sp.z, 0.7 * cpx);
  float spark = act * tw * exp(-r * r * 2.2) * (1.0 - smoothstep(0.22, 0.5, cpx));
  return vec2(spark, lobe);
}

void main() {
  vec2 xz = vWorld.xz;
  float t = uTime;
  // R = shore distance, G = smooth leeward ring scale (world-textures.ts ringScaleField, D3)
  vec2 sdfRing = texture2D(uSdfTex, marGridUv(xz)).rg;
  float sdf = sdfRing.x;
  float d = -sdf;
  float depth = max(0.0, -marSampleGrid(uHeightTex, xz));
  vec3 toCam = uCameraPos - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;

  // smooth ±MAR_BAND_JITTER u wobble hides the 2 u SDF cell steps on the outer contours
  float bandJit = (marNoise(xz * 0.35 + 7.3) - 0.5) * 2.0 * MAR_BAND_JITTER * smoothstep(4.0, 12.0, d);
  // leeward rings are wider: a precomputed, blurred scale (continuous across shelf seams, D3)
  float db = (d + bandJit) / clamp(sdfRing.y, 1.0, MAR_LEEWARD_SCALE);

  // --- colour bands by shore distance
  float s1 = smoothstep(MAR_LAGOON_MAX - MAR_BAND_SOFT, MAR_LAGOON_MAX + MAR_BAND_SOFT, db);
  float s2 = smoothstep(MAR_SHALLOW_MAX - MAR_BAND_SOFT, MAR_SHALLOW_MAX + MAR_BAND_SOFT, db);
  float s3 = smoothstep(MAR_MID_MAX - MAR_BAND_SOFT * 1.6, MAR_MID_MAX + MAR_BAND_SOFT * 1.6, db);
  vec3 col = mix(uLagoon, uShallow, s1);
  col = mix(col, uMid, s2);
  col = mix(col, uDeep, s3);
  // real shallows read bright; a near-shore band over a steep drop darkens
  // (gentle over the first few u so carved dock basins / channels blend instead of reading as holes)
  float dk = smoothstep(MAR_DARKEN0, MAR_DARKEN1, depth);
  col *= 1.0 - MAR_DARKEN * dk * dk * (1.0 - s3);

  float alpha = mix(MAR_A_LAGOON, MAR_A_SHALLOW, s1);
  alpha = mix(alpha, MAR_A_DEEP, s2);
  alpha = max(alpha, mix(MAR_A_LAGOON, MAR_A_DEEP, smoothstep(MAR_A_DEPTH0, MAR_A_DEPTH1, depth)));
  // open sea is opaque: nothing to see down there, and terrain chunk edges would show through
  alpha = mix(alpha, 1.0, s3);

  // pixel footprint in u: fades detail that would alias into stripes / pixel snow
  float fp = length(fwidth(xz));
  // grazing views: strong fresnel turns exaggerated swell normals into stripes
  float swellF = (1.0 - smoothstep(1.5, 4.0, fp)) * smoothstep(0.04, 0.35, V.y);
  float rippleF = 1.0 - smoothstep(0.4, 1.5, fp);
  float glintF = 1.0 - smoothstep(0.25, 1.0, fp);

  // --- normal: swell finite differences (same function as the vertex shader) + ripples
  float A = marShoreAmp(d) * uSwell.x * uMotionScale;
  float h0 = marSwellY(xz, t, uWind.xy, A, uSwell.y);
  float hx = marSwellY(xz + vec2(0.5, 0.0), t, uWind.xy, A, uSwell.y);
  float hz = marSwellY(xz + vec2(0.0, 0.5), t, uWind.xy, A, uSwell.y);
  float ns = 2.0 * MAR_NORMAL_SCALE * swellF;
  vec3 n = vec3(-(hx - h0) * ns, 1.0, -(hz - h0) * ns);
  vec3 nSwell = n;
  float near = rippleF * (1.0 - smoothstep(MAR_RIPPLE_FADE0, MAR_RIPPLE_FADE1, dist));
  vec2 tm = t * MAR_RIPPLE_SPEED * uMotionScale;
  vec3 r1 = marNoised(xz * MAR_RIPPLE_SCALE + tm);
  n.xz -= r1.yz * MAR_RIPPLE_STRENGTH * (0.2 * swellF + 0.8 * near);
#ifdef MAR_DETAIL
  vec3 r2 = marNoised(xz * MAR_RIPPLE_SCALE * 2.7 - tm * 1.6 + 11.0);
  n.xz -= r2.yz * MAR_RIPPLE_STRENGTH * 0.5 * near;
#endif
  // rain ripple rings (TASK-172): off (no math) unless it rains
  float rainRing = 0.0;
  if (uWeather.x > 0.0) {
    float ripF = (1.0 - smoothstep(MAR_RIP_FP0, MAR_RIP_FP1, fp)) * uWeather.x * uMotionScale;
    if (ripF > 0.0) {
      vec3 rr = marRainRipples(xz, t, fp, uWeather.x);
      rainRing = min(rr.x, 1.0) * ripF * (1.0 - smoothstep(MAR_RIP_BFP0, MAR_RIP_BFP1, fp));
      n.xz += rr.yz * MAR_RIP_NORMAL * ripF;
    }
  }
  n = normalize(n);

  // --- light: palette colour by day, hemisphere-tinted by night
  vec3 L = normalize(uSunDir);
  float ndl = max(dot(n, L), 0.0);
  float dayK = clamp(uSunIntensity / 3.0, 0.0, 1.0);
  vec3 dayLight = mix(vec3(1.0), uSunColor, MAR_SUN_TINT) * (0.88 + 0.12 * ndl) * (0.8 + 0.2 * dayK);
  // night/dusk: mostly a brightness drop so the water keeps its own hues (the hemisphere sky
  // is violet at dusk and would turn the sea magenta)
  float hemiL = dot(uHemiSky, vec3(0.2126, 0.7152, 0.0722));
  vec3 nightLight = mix(vec3(hemiL), uHemiSky, MAR_NIGHT_TINT) * 0.9 + 0.04;
  vec3 light = mix(dayLight, nightLight, uNight);
  col *= light;

  // --- sky reflection (fresnel)
  float ndv = max(dot(n, V), 0.0);
  float fres = pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, n);
  // reflection leans on the horizon colour; band colours stay dominant (≤ MAR_FRES_MAX off-grazing)
  vec3 sky = mix(uHorizon, uZenith, MAR_FRES_ZENITH * smoothstep(0.2, 0.9, R.y));
  float graze = 1.0 - smoothstep(0.05, 0.3, V.y);
  float reflW = min(MAR_FRES_BASE + MAR_FRES_GRAZE * fres, mix(MAR_FRES_MAX, MAR_FRES_BASE + MAR_FRES_GRAZE, graze));
  col = mix(col, sky, reflW);

  // --- foam
  float px = max(fwidth(d), 1e-3);          // u per pixel across the shore
  float farFoam = smoothstep(0.3, 1.0, px);  // 0 near, 1 at map scale
  float lap = marLap(t) * uMotionScale + (1.0 - uMotionScale) * 0.5;
  float lo = MAR_LAP_ADVANCE * (1.0 - lap) * (1.0 - farFoam);
  float brk = marNoise(xz * 0.9 + vec2(t * 0.11, -t * 0.07));
  float w = mix(MAR_FOAM_MIN, MAR_FOAM_MAX, brk);
  float hi = max(lo + w, MAR_LINE_PX * px);
  float lower = lo < px ? 1.0 : smoothstep(lo - px, lo + 0.5 * px, d);
  float foam = lower * (1.0 - smoothstep(hi - 0.5 * px, hi + px, d));
  foam *= mix(smoothstep(0.12, 0.3, brk), 1.0, farFoam);

  // travelling bands toward the shore
  float bandWave = sin(d * MAR_FBAND_K + t * MAR_FBAND_W);
  float bands = smoothstep(MAR_FBAND_TH, 1.0, bandWave);
  bands *= smoothstep(hi, hi + 1.0, d) * (1.0 - smoothstep(MAR_FBAND_FADE0, MAR_FBAND_FADE1, d));
  bands *= smoothstep(0.35, 0.6, marNoise(xz * 0.45 + vec2(-t * 0.05, t * 0.08)));
  bands *= 1.0 - smoothstep(0.25, 0.7, px);
  foam = max(foam, bands);

  // crest dots riding the primary swell in the shallow band
  float crest = smoothstep(0.45, 0.9, marSwellY(xz, t, uWind.xy, 1.0, uSwell.y));
  vec2 cp = (xz - uWind.xy * t * MAR_DOT_DRIFT * uMotionScale) * MAR_DOT_DENSITY;
  vec2 ci = floor(cp);
  vec2 off = vec2(marHash12(ci + 3.1), marHash12(ci + 7.7)) * 0.6 + 0.2;
  float cpx = max(fwidth(cp.x), 1e-3);
  float dotM = step(1.0 - MAR_DOT_FRACTION, marHash12(ci + 17.0));
  float dots = dotM * (1.0 - smoothstep(MAR_DOT_RADIUS - cpx, MAR_DOT_RADIUS + cpx, length(fract(cp) - off)));
  dots *= crest * (1.0 - s2) * smoothstep(MAR_LAGOON_MAX, MAR_LAGOON_MAX + 2.0, d);
  dots *= 1.0 - smoothstep(0.08, 0.3, cpx);
  foam = max(foam, dots);

  // foam trail (wakes, ripples)
  float trail = texture2D(uTrailTex, (xz - uTrailMap.xy) * uTrailMap.z).r;
  foam = max(foam, trail * smoothstep(0.1, 0.4, brk + 0.3));
  foam = clamp(foam, 0.0, 1.0);

  col = mix(col, uFoam * light, foam);
  alpha = mix(alpha, 1.0, foam);
  if (rainRing > 0.0) col = mix(col, uFoam * light, rainRing * MAR_RIP_BRIGHT * (1.0 - foam));

  // --- glints: thresholded sparkle mask × sharp sun highlight (> 1.0 → bloom)
  vec3 jit = marNoised(xz * MAR_GLINT_JSCALE + vec2(t * 0.6, -t * 0.4) * uMotionScale);
  vec3 ng = normalize(n + vec3(-jit.y, 0.0, -jit.z) * MAR_GLINT_JITTER * glintF);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(ng, H), 0.0), MAR_GLINT_EXP);
  // sparser far away: minified noise turns into uniform pixel snow otherwise
  float farG = 1.0 - glintF;
  float mask = smoothstep(MAR_GLINT_TH0 + 0.22 * farG, MAR_GLINT_TH1 + 0.22 * farG,
                          marNoise(xz * MAR_GLINT_MSCALE + vec2(-t * 0.9, t * 0.7) * uMotionScale));
  float glint = spec * mask * MAR_GLINT_STRENGTH * (1.0 + (MAR_GLINT_GOLDEN - 1.0) * uGolden);
  glint *= (1.0 - uNight) * dayK * (1.0 - foam);
  // overcast veil (TASK-172): no sun to glint
  glint *= 1.0 - uWeather.y;

  // --- glitter paths (D6/D7): narrow twinkling streaks toward the moon / the low sun
  // damped swell normal + a little ripple: a straight streak whose edge wobbles, no scribbles
  vec3 nS = normalize(vec3(0.0, 1.0, 0.0) + (nSwell - vec3(0.0, 1.0, 0.0)) * MAR_GLITTER_SWELL + (n - nSwell) * MAR_GLITTER_RIPPLE);
  float streak = 0.0;
  float moonOn = uNight * smoothstep(0.0, 0.12, normalize(uMoonDir).y) * (1.0 - uWeather.y);
  // fwidth outside the branches (derivatives are undefined in divergent control flow)
  float moonCpx = fp * MAR_MOON_SPARK.x;
  if (moonOn > 0.0) {
    // the streak follows the sky moon (SHARED.uMoonDir, TASK-171), not the night key light
    vec2 mg = marGlitter(normalize(uMoonDir), V, nS, xz, t * uMotionScale, moonCpx, MAR_MOON_LOBE, MAR_MOON_SPARK, 0.0);
    float glowW = mix(MAR_MOON_GLOW, MAR_MOON_FARGLOW, smoothstep(0.22, 0.5, moonCpx));
    streak = (mg.x * MAR_MOON_GAIN + mg.y * glowW) * moonOn * (1.0 - foam)
           * (1.0 - smoothstep(MAR_MOON_FAR0, MAR_MOON_FAR1, dist));
  }

  // low sun / golden hour: the scattered high-sun glints hand over to a warm glitter path
  float lowSun = max(1.0 - smoothstep(MAR_LOWSUN_Y0, MAR_LOWSUN_Y1, L.y), uGolden) * (1.0 - smoothstep(0.55, 0.9, uNight));
  float warm = 0.0;
  float sunCpx = fp * MAR_SUN_SPARK.x;
  if (lowSun > 0.0) {
    glint *= 1.0 - MAR_SUN_GLINTFADE * lowSun;
    vec2 sg = marGlitter(L, V, nS, xz, t * uMotionScale, sunCpx, MAR_SUN_LOBE, MAR_SUN_SPARK, 17.0);
    float glowW = mix(MAR_SUN_GLOW, MAR_SUN_FARGLOW, smoothstep(0.22, 0.5, sunCpx));
    warm = (sg.x * MAR_SUN_GAIN + sg.y * glowW) * lowSun * (1.0 - foam) * (1.0 - uWeather.y);
  }
  vec3 warmCol = mix(uSunColor, uSunColor * vec3(1.0, 0.82, 0.6), 0.5);

  col += uSunColor * (glint + streak) + warmCol * warm;
  alpha = max(alpha, min(1.0, glint + streak + warm));

  // --- cloud shadows (TASK-153): same field as the clouds, ×0.82 with a 6 u soft edge
  col *= marCloudShadowMul(xz, uDebugMask);

  // --- lantern pools (TASK-171): warm reflection of nearby shore/dock lamps (only low pools)
  {
    vec2 pl = marPool(xz);
    if (pl.x > 0.0) {
      float pw = pl.x * (1.0 - smoothstep(2.5, 6.0, pl.y)) * ${POOL_GAIN.water} * marPoolFlicker(xz, uTime);
      col += uPoolColor * pw;
      alpha = max(alpha, min(1.0, pw));
    }
  }

  // --- fog (exponential, like ART_BIBLE §3) and a soft rim at the grid edge
  // far sea eases into fog, the last stretch into the horizon colour → no hard line
  float rim = length(xz - uCameraPos.xz) / MAR_OUTER_RADIUS;
  float fogF = max(marFogFactor(dist), smoothstep(0.2, 0.9, rim));
  // view-angle haze: as the view ray flattens the far sea melts into the fog/sky
  float viewHaze = pow(1.0 - abs(V.y), MAR_VIEW_HAZE_POW) * smoothstep(40.0, 200.0, dist);
  fogF = max(fogF, viewHaze);
  col = mix(col, uFogColor, fogF);
  col = mix(col, uHorizon, smoothstep(0.7, 1.0, rim));
  alpha = mix(alpha, 1.0, fogF);
  // low mist band (TASK-172)
  if (uMist.x > 0.0) {
    float mi = marMist(vWorld, uCameraPos);
    col = mix(col, uMistColor, mi);
    alpha = mix(alpha, 1.0, mi);
  }

  gl_FragColor = vec4(col, alpha);
#ifdef MAR_DIRECT
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
#endif

  if (uDebugMask > 0.5) {
    vec3 m = d < MAR_FOAM_MAX ? uFoam  // db carries the same ±jitter as the visible bands
           : db < MAR_LAGOON_MAX ? uLagoon
           : db < MAR_SHALLOW_MAX ? uShallow
           : db < MAR_MID_MAX ? uMid : uDeep;
    gl_FragColor = linearToOutputTexel(vec4(m, 1.0));
  }
}
`;
