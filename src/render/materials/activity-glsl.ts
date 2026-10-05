import * as THREE from 'three';
import {
  LEDS,
  MOTION_TAG,
  OCCUPANCY,
  PULSE,
  SCREEN_ANIM as A,
  SCREEN_INK as INK,
  SLIDES,
  SURFACE,
  TRACKER,
  TURBINE_YAW,
} from '../../content/activity.ts';

/**
 * GLSL for the living close-up surfaces (M14c TASK-384), spliced into the ONE lit program by
 * materials/factory.ts — no new program, no new attribute: everything keys off the `aSpin.w` tag
 * channel (content/activity.ts) and `uTime`, so a frame is a pure function of the sim time.
 *
 * - ACTIVITY_DISPLACE (colour + depth vertex): turbine head yaw into the wind (+ the blades'
 *   spin), sun-tracking solar panels. Untagged vertices (`aSpin.w` 0 / 1) run the pre-TASK-384
 *   code path unchanged.
 * - ACTIVITY_VARY (colour vertex): surface uv / kind / seed varyings, pipe pulse coordinate.
 * - ACTIVITY_OCCUPANCY (colour vertex, lamp class): night facade occupancy (× marOn).
 * - ACTIVITY_FRAG_PARS / ACTIVITY_SURFACE (fragment, after `color_fragment`): procedural
 *   monitor content per kind, LED dot blink, billboard slideshow, pipe pulse tint. Sets
 *   `marSG` (screen glow weight, × the emissive mask) and `marPG` (pulse glow) for FRAG_OUTGOING.
 */
const f = (v: number): string => v.toFixed(6);
const DEG = Math.PI / 180;

/** Linear vec3 literal of a palette hex. */
function v3(hex: string): string {
  const c = new THREE.Color(hex);
  return `vec3(${f(c.r)}, ${f(c.g)}, ${f(c.b)})`;
}

const T = MOTION_TAG;

export const ACTIVITY_VERTEX_PARS = /* glsl */ `
uniform vec3 uSunSkyDir;
`;

/** Rotation of `transformed` for the yaw / tracker tags (after the spin, before bloom-in). */
export const ACTIVITY_DISPLACE = /* glsl */ `
  #ifdef MAR_SPIN
  if (aSpin.w > ${f(T.yaw - 0.5)} && aSpin.w < ${f(T.yawSpin + 0.5)}) {
    // turbine head: rotor (+z local) into the wind (uWind.xy = where the wind blows to) + hunting
    mat3 marYR = mat3(marM);
    vec3 marUp = transpose(marYR) * vec3(-uWind.x, 0.0, -uWind.y) / max(dot(marYR[0], marYR[0]), 1e-6);
    float marYaw = atan(marUp.x, marUp.z) + ${f(TURBINE_YAW.wobbleDeg * DEG)} * uMotionScale
      * sin(uTime * ${f((2 * Math.PI) / TURBINE_YAW.wobblePeriod)} + marHash12(marOrigin.xz * 0.53) * 6.2831853);
    float marYc = cos(marYaw);
    float marYs = sin(marYaw);
    transformed.xz = vec2(marYc * transformed.x + marYs * transformed.z, -marYs * transformed.x + marYc * transformed.z);
  } else if (aSpin.w > ${f(T.tracker - 0.5)}) {
    // sun tracker: rest tilt = (w − 4)·π about x through the pivot; stow when the sun is down
    mat3 marTR = mat3(marM);
    vec3 marSl = transpose(marTR) * uSunSkyDir;
    float marTa = clamp(atan(marSl.z, max(marSl.y, 1e-3)), ${f(-TRACKER.maxTilt)}, ${f(TRACKER.maxTilt)});
    marTa = mix(${f(TRACKER.stow)}, marTa, smoothstep(-0.05, 0.2, uSunSkyDir.y));
    float marTd = marTa - (aSpin.w - ${f(T.tracker)}) * 3.14159265;
    float marTc = cos(marTd);
    float marTs = sin(marTd);
    vec3 marTp = transformed - aSpin.xyz;
    transformed = aSpin.xyz + vec3(marTp.x, marTc * marTp.y - marTs * marTp.z, marTs * marTp.y + marTc * marTp.z);
  }
  #endif
`;

export const ACTIVITY_VARYINGS = /* glsl */ `
varying vec4 vMarSurf;
varying float vMarSurfSeed;
`;

/** Colour vertex: surface varyings (after VERTEX_DISPLACE: marM / marOrigin / transformed). */
export const ACTIVITY_VARY = /* glsl */ `
  vMarSurf = vec4(0.0);
  vMarSurfSeed = 0.0;
  #ifdef MAR_SPIN
  if (aSpin.w < -0.5) {
    vMarSurf = vec4(aSpin.xyz, -aSpin.w);
    // static props: hash of the instance origin; movers: their seed
    vMarSurfSeed = uLampMode.x > 0.5 ? marHash12(marOrigin.xz * 0.37 + 1.9) : fract(aSeed * 3.17 + 0.25);
    if (-aSpin.w > ${f(SURFACE.pulse - 0.5)}) {
      // pipe pulse: coordinate along the world tube axis (sign canonical so collinear pieces agree)
      vec3 marAx = normalize(mat3(marM) * aSpin.xyz);
      marAx *= (marAx.x < -1e-3 || (abs(marAx.x) <= 1e-3 && marAx.z < 0.0)) ? -1.0 : 1.0;
      vMarSurf.x = dot((marM * vec4(transformed, 1.0)).xyz, marAx);
    }
  }
  #endif
`;

/** Lamp class, after the late switch-off: facade occupancy (multiplies `marOn`). */
export const ACTIVITY_OCCUPANCY = /* glsl */ `
    if (uLampMode.y > 0.5) {
      vec3 marOn3 = objectNormal;
      if (abs(marOn3.y) < 0.5 && dot(transformed.xz, marOn3.xz) > ${f(OCCUPANCY.minDepth)}) {
        float marQ = floor(atan(marOn3.z, marOn3.x) / 1.5707963 + 0.5);
        float marOk = marHash12(marOrigin.xz * 0.913 + vec2(marQ * 17.0, 5.3));
        float marOt = uTime / ${f(OCCUPANCY.period)} + marOk * 13.0;
        float marOs = floor(marOt);
        float marD1 = step(marHash12(vec2(marOs, marOk * 91.0)), ${f(OCCUPANCY.dark)});
        float marD0 = step(marHash12(vec2(marOs - 1.0, marOk * 91.0)), ${f(OCCUPANCY.dark)});
        float marDk = mix(marD0, marD1, smoothstep(0.0, ${f(OCCUPANCY.fade)}, fract(marOt) * ${f(OCCUPANCY.period)}));
        marOn *= mix(1.0, ${f(OCCUPANCY.dim)}, marDk);
      }
    }
`;

const pick = (name: string, list: readonly string[]): string =>
  `vec3 ${name}(float i) {\n` +
  list
    .map((c, k) =>
      k < list.length - 1 ? `  if (i < ${f(k + 0.5)}) return ${v3(c)};` : `  return ${v3(c)};`,
    )
    .join('\n') +
  '\n}';

export const ACTIVITY_FRAG_PARS = /* glsl */ `
uniform float uMotionScale;
${ACTIVITY_VARYINGS}
float marHf(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
${pick('marCodeInk', INK.code)}
${pick('marPastel', INK.canvas)}
${pick('marSlideBar', SLIDES.ink.bars)}
/** Inset uv (margin m) → [0, 1]²; outside → negative. */
vec2 marInset(vec2 uv, float m) { return (uv - m) / (1.0 - 2.0 * m); }
bool marIn(vec2 m) { return m.x >= 0.0 && m.x <= 1.0 && m.y >= 0.0 && m.y <= 1.0; }
/** Scrolling text rows: x = glyph mask, y = token index (0..3). */
vec2 marText(vec2 uv, float asp, float seed, float t, float rows, float rate, float cpa) {
  vec2 m = marInset(uv, 0.07);
  if (!marIn(m)) return vec2(0.0);
  float y = (1.0 - m.y) * rows + t * rate + seed * 97.0;
  float line = floor(y);
  float fy = fract(y);
  float cols = max(5.0, floor(cpa * asp));
  float x = m.x * cols;
  float cell = floor(x);
  float fx = fract(x);
  float marIh = marHf(vec2(line, 1.7));
  float indent = marIh < 0.45 ? 0.0 : (marIh < 0.8 ? 2.0 : 4.0);
  float len = indent + 2.0 + floor(marHf(vec2(line, 4.1)) * (cols - indent - 2.0));
  float on = step(indent, cell) * step(cell + 1.0, len) * step(0.12, marHf(vec2(line, 8.3)));
  on *= step(0.16, marHf(vec2(cell, line + 0.37)));
  on *= step(0.2, fy) * step(fy, 0.8) * step(0.08, fx) * step(fx, 0.92);
  return vec2(on, floor(marHf(vec2(floor((cell - indent) / 3.0), line + 0.5)) * 4.0));
}
vec4 marCode(vec2 uv, float asp, float seed, float t) {
  vec2 g = marText(uv, asp, seed, t, ${f(A.code.rows)}, ${f(A.code.scroll)}, ${f(A.code.colsPerAspect)});
  return g.x > 0.5 ? vec4(marCodeInk(g.y), 1.0) : vec4(${v3(INK.dark)}, 0.35);
}
vec4 marTerminal(vec2 uv, float asp, float seed, float t) {
  vec2 m = marInset(uv, 0.07);
  // CPU meters along the top
  if (m.y > 0.8 && marIn(m)) {
    float i = floor(m.x * 4.0);
    float fx = fract(m.x * 4.0);
    float h = 0.5 + 0.45 * sin(t * (2.0 + i * 0.7) + i * 1.3 + seed * 6.283);
    if (fx > 0.1 && fx < 0.9 && (m.y - 0.8) / 0.2 < 0.25 + 0.7 * h && m.x * 4.0 - i < h + 0.1)
      return vec4(${v3(INK.terminal[1])}, 1.0);
    return vec4(${v3(INK.dark)}, 0.35);
  }
  vec2 g = marText(vec2(uv.x, uv.y * 0.8), asp * 1.25, seed, t, ${f(A.terminal.rows)}, ${f(A.terminal.scroll)}, ${f(A.terminal.colsPerAspect)});
  return g.x > 0.5 ? vec4(${v3(INK.terminal[0])}, 1.0) : vec4(${v3(INK.dark)}, 0.35);
}
vec4 marChart(vec2 uv, float asp, float seed, float t) {
  vec2 m = marInset(uv, 0.08);
  if (!marIn(m)) return vec4(${v3(INK.light)}, 0.45);
  if (m.y < 0.03) return vec4(${v3(INK.checklist[3])}, 0.6);
  float nb = ${f(A.chart.bars)};
  float i = floor(m.x * nb);
  float fx = fract(m.x * nb);
  float h = 0.12 + 0.42 * (0.55 + 0.45 * sin(t * ${f(A.chart.rate)} * (0.6 + 0.5 * marHf(vec2(i, 2.0))) + i * 1.9 + seed * 6.283));
  if (fx > 0.18 && fx < 0.82 && m.y < h) return vec4(${v3(INK.chart[0])}, 1.0);
  float ly = 0.74 + 0.11 * sin(m.x * 7.0 - t * ${f(A.chart.trend)} + seed * 6.283) + 0.06 * sin(m.x * 17.0 + t * 1.3);
  if (abs(m.y - ly) < 0.05) return vec4(${v3(INK.chart[1])}, 1.0);
  return vec4(${v3(INK.light)}, 0.45);
}
vec4 marCanvas(vec2 uv, float asp, float seed, float t) {
  vec2 m = marInset(uv, 0.06);
  if (!marIn(m)) return vec4(${v3(INK.paper)}, 0.45);
  float sw = floor(m.y * 5.0);
  if (m.x < 0.1 && fract(m.y * 5.0) > 0.15 && fract(m.y * 5.0) < 0.85) return vec4(marPastel(sw), 1.0);
  float cyc = t / ${f(A.canvas.period)} + seed * 3.0;
  float n = floor(cyc);
  float p = fract(cyc);
  vec4 c = vec4(${v3(INK.paper)}, 0.45);
  for (int j = 0; j < 3; j++) {
    float fj = float(j);
    float sx = clamp((p * 1.25 - fj * 0.36) / 0.36, 0.0, 1.0);
    float y = 0.22 + 0.28 * fj + 0.1 * (marHf(vec2(n, fj)) - 0.5)
      + (0.06 + 0.08 * marHf(vec2(n, fj + 5.0))) * sin(m.x * (5.0 + 6.0 * marHf(vec2(n, fj + 9.0))) + marHf(vec2(n, fj + 13.0)) * 6.283);
    if (m.x > 0.16 && m.x < 0.16 + 0.84 * sx && abs(m.y - y) < 0.06)
      c = vec4(marPastel(mod(n + fj * 2.0, 5.0)), 1.0);
  }
  return c;
}
vec4 marChecklist(vec2 uv, float asp, float seed, float t) {
  vec2 m = marInset(uv, 0.08);
  if (!marIn(m)) return vec4(${v3(INK.light)}, 0.45);
  float rows = ${f(A.checklist.rows)};
  float r = floor((1.0 - m.y) * rows);
  float fy = fract((1.0 - m.y) * rows);
  float cyc = t / ${f(A.checklist.period)} + seed * 5.0;
  float n = floor(cyc);
  bool done = r < floor(fract(cyc) * (rows + 1.0));
  bool fail = done && marHf(vec2(n, r)) < 0.15;
  float bx = m.x * asp * 0.8;
  if (fy > 0.18 && fy < 0.82 && bx < 0.22) {
    bool rim = fy < 0.3 || fy > 0.7 || bx < 0.06 || bx > 0.18;
    if (done) return vec4(fail ? ${v3(INK.checklist[2])} : ${v3(INK.checklist[0])}, 1.0);
    return rim ? vec4(${v3(INK.checklist[1])}, 0.7) : vec4(${v3(INK.light)}, 0.45);
  }
  float len = 0.35 + 0.5 * marHf(vec2(r, n * 0.0 + 3.1));
  if (fy > 0.36 && fy < 0.64 && m.x > 0.3 && m.x < 0.3 + 0.7 * len)
    return vec4(${v3(INK.checklist[3])}, done ? 0.5 : 0.8);
  return vec4(${v3(INK.light)}, 0.45);
}
vec4 marSpectrum(vec2 uv, float asp, float seed, float t) {
  vec2 m = marInset(uv, 0.07);
  if (!marIn(m)) return vec4(${v3(INK.dark)}, 0.35);
  float y = 0.06 + 0.03 * sin(m.x * 41.0 + t * 5.0);
  for (int j = 0; j < 3; j++) {
    float fj = float(j);
    float c = 0.15 + 0.7 * (0.5 + 0.5 * sin(t * ${f(A.spectrum.drift)} * (0.5 + 0.3 * fj) + fj * 2.1 + seed * 6.283));
    float w = 0.05 + 0.04 * fj;
    y += (0.62 - 0.15 * fj) * exp(-pow((m.x - c) / w, 2.0));
  }
  if (abs(m.x - fract(t / ${f(A.spectrum.sweep)} + seed)) < 0.015) return vec4(${v3(INK.spectrum[1])}, 1.0);
  if (abs(m.y - y) < 0.035) return vec4(${v3(INK.spectrum[0])}, 1.0);
  if (m.y < y) return vec4(${v3(INK.spectrum[0])} * (0.25 + 0.4 * m.y / max(y, 1e-3)), 0.6);
  return vec4(${v3(INK.dark)}, 0.35);
}
/** LED strip: dot grid, each dot blinking by its own pattern. */
vec4 marLeds(vec2 uv, float z, vec3 base, float seed, float t) {
  float cols = floor(z);
  vec2 g = uv * vec2(cols, ${f(LEDS.rows)});
  vec2 cell = floor(g);
  vec2 fr = fract(g);
  float s = fract(z) * 53.0 + seed * 31.0;
  float h = marHf(cell + s);
  float mode = marHf(cell + 7.7 + s);
  float on = 1.0;
  if (mode < ${f(LEDS.activity)}) {
    on = step(${f(1 - LEDS.onP)}, marHf(vec2(floor(t * ${f(LEDS.rate)} * (0.7 + 0.6 * h) + h * 10.0), h * 91.0 + cell.x)));
  } else if (mode < ${f(LEDS.activity + LEDS.heartbeat)}) {
    on = step(fract(t / ${f(LEDS.heartbeatPeriod)} + h), 0.22);
  }
  bool dot = fr.x > 0.18 && fr.x < 0.82 && fr.y > 0.2 && fr.y < 0.8;
  return dot ? vec4(base * mix(${f(LEDS.off)}, 1.0, on), mix(0.15, 1.0, on)) : vec4(base * ${f(LEDS.off * 0.6)}, 0.1);
}
/** Billboard slide \`idx\` at board uv (slide-local time lt). Slide 0 = the brand art (base). */
vec3 marSlide(float idx, vec2 uv, float asp, vec3 base, float lt) {
  if (idx < 0.5) return base;
  vec2 p = vec2(uv.x * asp, uv.y);
  if (idx < 1.5) {
    // KPI bars rising one after another + title bar
    vec3 c = ${v3(SLIDES.ink.paper)} * 0.55;
    if (uv.y > 0.8 && uv.y < 0.9 && uv.x > 0.08 && uv.x < 0.55) return ${v3(SLIDES.ink.text)};
    float i = floor((uv.x - 0.1) / 0.2);
    float fx = fract((uv.x - 0.1) / 0.2);
    if (i >= 0.0 && i < 4.0 && fx > 0.15 && fx < 0.85) {
      float h = (0.25 + 0.13 * i) * smoothstep(0.0, 0.7, lt - 0.12 * i);
      if (uv.y > 0.1 && uv.y < 0.1 + h) return marSlideBar(i);
    }
    return c;
  }
  if (idx < 2.5) {
    // product: pulsing disc + copy bars
    vec2 d = p - vec2(0.3 * asp, 0.5);
    float r = 0.33 * (1.0 + 0.06 * sin(lt * 6.0));
    if (length(d) < r) return length(d - vec2(-0.1, 0.1)) < 0.08 ? ${v3(SLIDES.ink.paper)} * 0.6 : ${v3(SLIDES.ink.productDisc)};
    for (int j = 0; j < 3; j++) {
      float y = 0.66 - 0.2 * float(j);
      if (uv.y > y - 0.05 && uv.y < y + 0.05 && uv.x > 0.56 && uv.x < 0.92 - 0.12 * float(j)) return ${v3(SLIDES.ink.text)};
    }
    return ${v3(SLIDES.ink.productBg)} * 0.6;
  }
  // event: scrolling diagonal stripes + a headline block
  if (uv.y > 0.32 && uv.y < 0.68 && uv.x > 0.18 && uv.x < 0.82) {
    if (uv.y > 0.44 && uv.y < 0.56 && uv.x > 0.24 && uv.x < 0.76) return ${v3(SLIDES.ink.stripes[0])};
    return ${v3(SLIDES.ink.text)};
  }
  float s = fract((p.x + p.y) * 1.6 - lt * 0.9);
  return s < 0.5 ? ${v3(SLIDES.ink.stripes[0])} : ${v3(SLIDES.ink.stripes[1])} * 0.55;
}
`;

/** Fragment, after `#include <color_fragment>`: may rewrite `diffuseColor.rgb`. */
export const ACTIVITY_SURFACE = /* glsl */ `
  float marSG = 1.0;
  float marPG = 0.0;
  if (vMarSurf.w > 0.5 && uDebugMask < 0.5) {
    float marK = floor(vMarSurf.w + 0.5);
    float marSt = uTime * mix(0.3, 1.0, uMotionScale);
    vec2 marUv = clamp(vMarSurf.xy, 0.0, 1.0);
    float marAsp = vMarSurf.z;
    vec4 marC = vec4(diffuseColor.rgb, 1.0);
    if (marK > ${f(SURFACE.pulse - 0.5)}) {
      float marPs = fract((vMarSurf.x - marSt * ${f(PULSE.speed)}) / ${f(PULSE.spacing)});
      float marPw = ${f(PULSE.width / PULSE.spacing)};
      float marPb = smoothstep(0.0, marPw * 0.5, marPs) * (1.0 - smoothstep(marPw * 0.5, marPw, marPs));
      marC.rgb = mix(diffuseColor.rgb, ${v3(PULSE.color)}, marPb * ${f(PULSE.dayTint)});
      marPG = marPb;
    } else if (marK > ${f(SURFACE.slides - 0.5)}) {
      float marCy = marSt / ${f(SLIDES.period)} + vMarSurfSeed * ${f(SLIDES.count)};
      float marLt = fract(marCy) * ${f(SLIDES.period)};
      float marId = mod(floor(marCy), ${f(SLIDES.count)});
      // wipe from the left into the next slide (slide 0 = the brand art: own colours)
      if (marLt < ${f(SLIDES.wipe)} && marUv.x > marLt / ${f(SLIDES.wipe)}) {
        marId = mod(marId + ${f(SLIDES.count - 1)}, ${f(SLIDES.count)});
        marLt += ${f(SLIDES.period)};
      }
      // art faces sit 1 cm in front of the board: off the brand slide they step aside (discard)
      // so the board's own slide shows through them, extrusion sides included
      if (marAsp < 0.0 && marId > 0.5) discard;
      marC.rgb = marSlide(marId, marUv, abs(marAsp), diffuseColor.rgb, marLt);
    } else if (marK > ${f(SURFACE.led - 0.5)}) {
      marC = marLeds(marUv, vMarSurf.z, diffuseColor.rgb, vMarSurfSeed, marSt);
    } else if (marK > ${f(SURFACE.spectrum - 0.5)}) {
      marC = marSpectrum(marUv, marAsp, vMarSurfSeed, marSt);
    } else if (marK > ${f(SURFACE.terminal - 0.5)}) {
      marC = marTerminal(marUv, marAsp, vMarSurfSeed, marSt);
    } else if (marK > ${f(SURFACE.checklist - 0.5)}) {
      marC = marChecklist(marUv, marAsp, vMarSurfSeed, marSt);
    } else if (marK > ${f(SURFACE.canvas - 0.5)}) {
      marC = marCanvas(marUv, marAsp, vMarSurfSeed, marSt);
    } else if (marK > ${f(SURFACE.chart - 0.5)}) {
      marC = marChart(marUv, marAsp, vMarSurfSeed, marSt);
    } else {
      marC = marCode(marUv, marAsp, vMarSurfSeed, marSt);
    }
    diffuseColor.rgb = marC.rgb;
    marSG = marC.a;
  }
`;

/** FRAG_OUTGOING additions: pipe pulse glow at night (× lamps; day is a tint only). */
export const ACTIVITY_GLOW = /* glsl */ `
  outgoingLight += ${v3(PULSE.color)} * (marPG * ${f(PULSE.nightGlow)} * uLamps.x);
`;
