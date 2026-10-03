import { RAIN } from '../../content/weather.ts';

const f = (v: number): string => v.toFixed(6);

/**
 * Rain streaks (TASK-172), spliced into the puff program (clouds/cloud.glsl.ts: instances with
 * `aKind` 4) so rain costs no shader program of its own. Stateless: every instance is a drop
 * whose position is f(aDrop, uTime) wrapped modulo a camera-local box (world-anchored, so drops
 * don't slide with the camera). The quad is a camera-facing ribbon along the fall velocity, its
 * width a fixed view angle (resolution independent). Opaque with ordered-dither coverage — no
 * blending, no sorting. Fades: near the camera, at the box faces (the wrap is invisible) and
 * below the sea surface.
 *
 * Rain quad: position.x ∈ {−0.5, 0.5} across, position.y ∈ {0 head, 1 tail}.
 * Needs `uTime` declared before it (the puff vertex shader does).
 */
export const RAIN_KIND = 4;

export const RAIN_VERT_PARS = /* glsl */ `
// xyz = box size (u), w = peak dither coverage
uniform vec4 uRainBox;
uniform vec3 uRainCentre;
// xy = horizontal drift (u/s), z = fall speed (u/s), w = streak seconds
uniform vec4 uRainMotion;
// x = width (rad), y/z = near fade (u), w = box-edge fade start (fraction of the half box)
uniform vec4 uRainLook;
attribute vec4 aDrop;
varying float vAlong;
/* clip position of a rain-streak corner; fade = dither coverage (box edge × near × sea) */
vec4 marRainVertex(out float fade) {
  float spd = 1.0 + ${f(RAIN.speedJitter)} * (aDrop.w * 2.0 - 1.0);
  vec3 vel = vec3(uRainMotion.x, -uRainMotion.z * spd, uRainMotion.y);
  vec3 size = uRainBox.xyz;
  vec3 rel = mod(aDrop.xyz * size + vel * uTime - uRainCentre + 0.5 * size, size) - 0.5 * size;
  vec3 head = uRainCentre + rel;
  float len = length(vel) * uRainMotion.w * (1.0 + ${f(RAIN.lengthJitter)} * (fract(aDrop.w * 7.31) * 2.0 - 1.0));
  vec3 axis = normalize(vel);
  vec3 pos = head - axis * (len * position.y);
  vec3 toCam = cameraPosition - pos;
  float dist = max(length(toCam), 1e-3);
  vec3 across = cross(toCam / dist, axis);
  float al = length(across);
  across = al > 1e-4 ? across / al : vec3(1.0, 0.0, 0.0);
  pos += across * (position.x * dist * uRainLook.x);
  vec3 e = abs(rel) / (0.5 * size);
  float edge = 1.0 - smoothstep(uRainLook.w, 1.0, max(max(e.x, e.y), e.z));
  float near = smoothstep(uRainLook.y, uRainLook.z, dist);
  float sea = smoothstep(-0.1, 0.5, pos.y);
  fade = edge * near * sea * uRainBox.w;
  vAlong = position.y;
  return projectionMatrix * viewMatrix * vec4(pos, 1.0);
}
`;

export const RAIN_FRAG_PARS = /* glsl */ `
uniform vec3 uRainColor;
varying float vAlong;
/* bright head, tapering tail */
float marRainCoverage(float fade) {
  return fade * smoothstep(0.0, 0.08, vAlong) * pow(1.0 - vAlong, 0.6);
}
`;
