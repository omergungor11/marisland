import { BEAM_FRAG_PARS, BEAM_VERT_PARS } from '../night/beam.glsl.ts';

/**
 * Sky dome shaders (TASK-171). Uniforms: SHARED env colours (linear) + sky constants from
 * content/lighting SKY. Output is HDR (sun disc > 1 so bloom catches it; moon slightly).
 * One draw call: gradient → sun (disc + glow, grows near the horizon) → moon (soft crescent +
 * halo, earthshine blocks stars) → hashed twinkling stars.
 *
 * `uMode` = 1 turns the same program into the lighthouse beam (night/beam.glsl.ts): a second
 * material with identical source / flags (BackSide, non-"opaque" blending) shares the program,
 * so the beam costs a draw call at night but no shader program.
 */
export const SKY_VERT = /* glsl */ `
uniform float uMode;
varying vec3 vDir;
${BEAM_VERT_PARS}
void main() {
  if (uMode > 0.5) {
    vDir = vec3(0.0, 1.0, 0.0);
    marBeamVertex();
    return;
  }
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_FRAG = /* glsl */ `
uniform float uMode;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uFogColor;
uniform vec3 uSunSkyDir;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform vec3 uSkyNight;
uniform float uNight;
uniform float uTime;
uniform float uDebugMask;
// x = radius (rad), y = HDR intensity, z = horizon growth, w = grow-below (sin elevation)
uniform vec4 uSun;
// x = soft-edge fraction, y = glow strength, z = glow power
uniform vec3 uSunGlow;
// x = radius (rad), y = soft limb, z = phase offset (radii), w = earthshine
uniform vec4 uMoon;
uniform vec3 uMoonColor;
uniform vec4 uMoonHalo;
uniform vec3 uMoonHaloColor;
// x = cells per radian, y = density, z = brightness, w = twinkle depth
uniform vec4 uStars;
// x = twinkle rate, yz = horizon fade band, w = max star radius (cells)
uniform vec4 uStarFx;
uniform vec2 uBands;
varying vec3 vDir;
${BEAM_FRAG_PARS}

float skyHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  if (uMode > 0.5) {
    gl_FragColor = vec4(marBeamFrag(), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }
  if (uDebugMask > 0.5) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec3 d = normalize(vDir);
  float h = d.y;

  // fog colour at and below the horizon → horizon band → zenith
  float tFog = smoothstep(0.0, uBands.x, h);
  float tZen = smoothstep(uBands.x, uBands.y, h);
  vec3 col = mix(uFogColor, uHorizon, tFog);
  col = mix(col, uZenith, tZen * tZen * (2.0 - tZen));

  // bodies sink into the fog band instead of cutting at the horizon line
  float above = smoothstep(-0.01, uBands.x, h);

  // --- sun: soft disc that grows and warms toward the horizon, plus glow
  vec3 sd = normalize(uSunSkyDir);
  float sunUp = smoothstep(-0.06, 0.02, sd.y);
  if (sunUp > 0.0) {
    float cosS = dot(d, sd);
    float angS = acos(clamp(cosS, -1.0, 1.0));
    float grow = mix(uSun.z, 1.0, smoothstep(0.0, uSun.w, sd.y));
    float rS = uSun.x * grow;
    // soft plateau + gaussian shoulder: no saturated ring where the HDR core meets the sky
    float q = angS / rS;
    float disc = (1.0 - smoothstep(1.0 - uSunGlow.x, 1.0 + uSunGlow.x, q)) * 0.75 + exp(-q * q * 1.6) * 0.25;
    // dimmer (so it stays warm after tone mapping) as it nears the horizon
    float hdr = uSun.y * mix(0.65, 1.0, smoothstep(0.0, uSun.w, sd.y));
    float glow = pow(max(cosS, 0.0), uSunGlow.z) * uSunGlow.y;
    // the disc is paler than the light it casts: its bloom halo then reads as glow, not as a
    // saturated ring around a tone-mapped white core
    vec3 discCol = mix(uSunColor, vec3(1.0, 0.94, 0.84) * max(max(uSunColor.r, uSunColor.g), 1e-3), 0.25);
    col += (discCol * disc * hdr + uSunColor * glow) * sunUp * (1.0 - uNight * 0.85) * above;
  }

  // --- moon: soft crescent (lit limb faces the sun), earthshine, two-layer halo
  vec3 md = normalize(uMoonDir);
  float moonVis = uSkyNight.x;
  float moonMask = 0.0;
  if (moonVis > 0.0) {
    float cosM = dot(d, md);
    // tangent frame on the moon disc
    vec3 mx = normalize(cross(md, vec3(0.0, 1.0, 0.0)) + vec3(1e-5, 0.0, 0.0));
    vec3 my = cross(mx, md);
    vec2 p = vec2(dot(d, mx), dot(d, my)) / uMoon.x;
    // unlit side: away from the sun, projected on the disc
    vec2 toSun = vec2(dot(sd, mx), dot(sd, my));
    toSun = length(toSun) > 1e-4 ? normalize(toSun) : vec2(0.7071, 0.7071);
    float r = length(p);
    float disc = (1.0 - smoothstep(1.0 - uMoon.y, 1.0 + uMoon.y, r)) * step(0.0, cosM);
    float shadow = 1.0 - smoothstep(1.0 - uMoon.y * 1.6, 1.0 + uMoon.y * 1.6, length(p + toSun * uMoon.z));
    float lit = disc * (1.0 - shadow);
    // soft maria: low-frequency blotches on the lit face
    float seas = 0.84 + 0.16 * smoothstep(0.35, 0.75, skyHash12(floor(p * 2.2 + 7.0)));
    float limb = 1.0 - 0.18 * r * r;
    vec3 moon = uMoonColor * (lit * seas * limb + disc * uMoon.w);
    float halo = pow(max(cosM, 0.0), uMoonHalo.y) * uMoonHalo.x + pow(max(cosM, 0.0), uMoonHalo.w) * uMoonHalo.z;
    moonMask = disc;
    float k = moonVis * above;
    col = mix(col, col * (1.0 - disc) + moon, k);
    col += uMoonHaloColor * halo * k;
  }

  // --- stars: one candidate per angular cell, twinkling; fade into the fog band, behind the moon
  float starA = uSkyNight.y;
  if (starA > 0.001) {
    // rows of equal elevation; each row gets an integer number of cells around the sky
    // (scaled by cos(row elevation)) → isotropic round stars, no shear, no seam at az = ±π
    float az = atan(d.z, d.x);
    float el = asin(clamp(h, -1.0, 1.0));
    float row = floor(el * uStars.x);
    float nx = max(floor(6.2831853 * cos((row + 0.5) / uStars.x) * uStars.x), 1.0);
    vec2 g = vec2((az / 6.2831853 + 0.5) * nx, el * uStars.x);
    vec2 cell = vec2(floor(g.x), row);
    float r = skyHash12(cell);
    if (r < uStars.y) {
      float rr = r / uStars.y;
      vec2 c = vec2(skyHash12(cell + 17.3), skyHash12(cell + 41.9)) * 0.7 + 0.15;
      float dist = length(fract(g) - c);
      float size = mix(uStarFx.w * 0.55, uStarFx.w, skyHash12(cell + 3.1));
      float tw = 1.0 - uStars.w + uStars.w * sin(uTime * uStarFx.x * (0.6 + rr) + r * 40.0);
      float bright = mix(0.35, 1.0, skyHash12(cell + 5.7));
      // ≥ ~1.5 px wide at 540p so stars stay round dots (sub-pixel stars alias into streaks)
      float star = (1.0 - smoothstep(size * 0.15, size, dist)) * tw * bright;
      float fade = smoothstep(uStarFx.y, uStarFx.z, h) * (1.0 - moonMask);
      vec3 sc = mix(vec3(1.0, 0.92, 0.8), vec3(0.85, 0.9, 1.0), skyHash12(cell + 9.7));
      col += sc * star * uStars.z * starA * fade;
    }
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
