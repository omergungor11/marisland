/**
 * Lighthouse beam GLSL (TASK-171): the rotating double cone + lamp flare billboard
 * (aBeam.y = 0 front cone, 1 back cone, 2 flare quad). These pieces are compiled INTO the sky
 * dome program (sky.glsl.ts, `uMode` = 1) so the beam costs no extra shader program — the
 * program budget is full on every quality. All motion from uTime → deterministic captures.
 *
 * The including shader declares: uTime (fragment), uDebugMask (fragment).
 */
export const BEAM_VERT_PARS = /* glsl */ `
uniform float uTime;
// x = rad/s, y = tilt (rad), z = flare radius (u), w = flare view-space pull toward camera (u)
uniform vec4 uBeamMotion;
attribute vec2 aBeam;
varying float vBT;
varying float vBKind;
varying vec3 vBN;
varying vec3 vBV;
varying vec2 vBCorner;
varying float vBFacing;
varying float vBDist;

vec3 marBeamRot(vec3 p, float ang, float tilt) {
  // tilt the +x axis down (about z), then spin about y
  float ct = cos(tilt), st = sin(tilt);
  p = vec3(ct * p.x + st * p.y, -st * p.x + ct * p.y, p.z);
  float ca = cos(ang), sa = sin(ang);
  return vec3(ca * p.x + sa * p.z, p.y, -sa * p.x + ca * p.z);
}

void marBeamVertex() {
  float ang = uTime * uBeamMotion.x;
  vBKind = aBeam.y;
  vBT = aBeam.x;
  vec3 axis = marBeamRot(vec3(1.0, 0.0, 0.0), ang, uBeamMotion.y);
  vec4 originW = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec3 toCam = normalize(cameraPosition - originW.xyz);
  vBFacing = max(dot(axis, toCam), 0.0) + max(-dot(axis, toCam), 0.0) * 0.45;
  vec4 mv;
  if (aBeam.y > 1.5) {
    // flare: camera-facing quad at the lamp, pulled toward the camera past the lamp-room glass
    vBCorner = position.xy;
    mv = viewMatrix * originW;
    mv.xyz += normalize(-mv.xyz) * uBeamMotion.w;
    mv.xy += position.xy * uBeamMotion.z;
    vBN = vec3(0.0, 0.0, 1.0);
    vBV = vec3(0.0, 0.0, 1.0);
  } else {
    vBCorner = vec2(0.0);
    vec3 p = marBeamRot(position, ang, uBeamMotion.y);
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vBN = normalize(mat3(modelMatrix) * marBeamRot(normal, ang, uBeamMotion.y));
    vBV = normalize(cameraPosition - wp.xyz);
    mv = viewMatrix * wp;
  }
  vBDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

export const BEAM_FRAG_PARS = /* glsl */ `
uniform vec3 uLamps;
uniform float uFogDensity;
uniform vec3 uBeamColor;
// x = opacity, y = back opacity, z = edge power, w = fade-in fraction
uniform vec4 uBeamLook;
// xy = fade-out band (fractions of the length), z = flare intensity, w = flare facing boost
uniform vec4 uBeamFx;
varying float vBT;
varying float vBKind;
varying vec3 vBN;
varying vec3 vBV;
varying vec2 vBCorner;
varying float vBFacing;
varying float vBDist;

/** Additive beam colour (linear HDR); discards where nothing is added. */
vec3 marBeamFrag() {
  float vis = uLamps.z * (1.0 - uDebugMask);
  if (vis <= 0.0) discard;
  vec3 col;
  if (vBKind > 1.5) {
    float r2 = dot(vBCorner, vBCorner);
    if (r2 > 1.0) discard;
    float core = exp(-r2 * 18.0);
    float halo = exp(-r2 * 4.0) * (1.0 - r2);
    float face = 1.0 + uBeamFx.w * pow(vBFacing, 6.0);
    col = uBeamColor * (core * uBeamFx.z * face + halo * 0.25 * face);
  } else {
    // soft volumetric fake: bright where we look through the cone, fading at its silhouette
    float ndv = abs(dot(normalize(vBN), normalize(vBV)));
    float edge = pow(ndv, uBeamLook.z);
    float along = smoothstep(0.0, uBeamLook.w, vBT) * (1.0 - smoothstep(uBeamFx.x, uBeamFx.y, vBT));
    // drifting haze inside the beam (subtle, moves outward)
    float haze = 0.85 + 0.15 * sin(vBT * 23.0 - uTime * 1.7) * sin(vBT * 9.0 + uTime * 0.6);
    float op = vBKind > 0.5 ? uBeamLook.x * uBeamLook.y : uBeamLook.x;
    // brighter close to the lamp (the light spreads over a wider section further out)
    float spread = mix(1.6, 0.7, vBT);
    col = uBeamColor * (op * edge * along * haze * spread);
  }
  // the beam lives in the fog: far beams soften but never vanish (they light the fog)
  float fogF = 1.0 - exp(-pow(uFogDensity * vBDist, 2.0));
  return col * vis * (1.0 - 0.6 * fogF);
}
`;
