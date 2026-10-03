import { CLOUDS } from '../../../content/anim.ts';
import { MEAN_ALT } from '../../clouds/cloud-field.ts';

const f = (v: number): string => v.toFixed(6);

/**
 * GLSL twin of `render/clouds/cloud-field.ts` (TASK-153). Keep the two in step —
 * `cloud-field.test.ts` ports this formula and checks parity.
 *
 * Uniforms (SHARED, written by clouds.ts each frame):
 *  uCloudShadow xy = wind offset (wrapped), z = coverage (0 → off), w = strength (1 − 0.82 by day)
 *  uCloudSun    xy = −sunDir.xz / sunDir.y, zw = window centre
 *  uCloudSeed   x = salt, y = active threshold, z = cell size, w = cells
 *
 * `marCloudShadow(xz)` → 0..1 mask; `marCloudShadowMul(xz)` → lit-colour multiplier
 * (1 when off or in debug-mask mode). Fragment-only; needs WebGL2 (uint).
 */
export const CLOUD_SHADOW_GLSL = /* glsl */ `
uniform vec4 uCloudShadow;
uniform vec4 uCloudSun;
uniform vec4 uCloudSeed;
uint marCloudH32(uint x) {
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return x;
}
float marCloudU(uint ix, uint iz, uint salt, uint k) {
  uint h = marCloudH32(ix + iz * 16u + salt * 256u);
  return float(marCloudH32(h + k) >> 8u) / 16777216.0;
}
float marCloudLat(uint X, uint Z, uint salt) {
  return float(marCloudH32(marCloudH32(Z + salt * 4096u) ^ X) >> 8u) / 16777216.0;
}
float marCloudVN(vec2 p, uint salt) {
  vec2 i = floor(p);
  vec2 fr = p - i;
  vec2 u = fr * fr * (3.0 - 2.0 * fr);
  uint X = uint(int(i.x) + 1024);
  uint Z = uint(int(i.y) + 1024);
  float a = marCloudLat(X, Z, salt);
  float b = marCloudLat(X + 1u, Z, salt);
  float c = marCloudLat(X, Z + 1u, salt);
  float d = marCloudLat(X + 1u, Z + 1u, salt);
  return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
}
float marCloudShadow(vec2 xz) {
  if (uCloudShadow.z <= 0.0) return 0.0;
  float cell = uCloudSeed.z;
  float cells = uCloudSeed.w;
  float tile = cell * cells;
  uint salt = uint(uCloudSeed.x + 0.5);
  vec2 q = (xz - uCloudShadow.xy - uCloudSun.zw - uCloudSun.xy * ${f(MEAN_ALT)}) / cell + 0.5 * cells;
  vec2 base = floor(q - 0.5);
  float m = 0.0;
  for (int k = 0; k < 4; k++) {
    vec2 c = base + vec2(float(k & 1), float(k >> 1));
    vec2 w = mod(c, cells);
    uint ix = uint(w.x + 0.5);
    uint iz = uint(w.y + 0.5);
    uint h = marCloudH32(ix + iz * 16u + salt * 256u);
    if (float(marCloudH32(h) >> 8u) / 16777216.0 >= uCloudSeed.y) continue;
    uint pk = marCloudH32(h + 1u);
    vec4 cb = (vec4(float(pk & 255u), float((pk >> 8u) & 255u), float((pk >> 16u) & 255u), float(pk >> 24u)) + 0.5) / 256.0;
    vec2 j = ${f(CLOUDS.jitter[0])} + ${f(CLOUDS.jitter[1] - CLOUDS.jitter[0])} * cb.xy;
    float width = ${f(CLOUDS.width[0])} + ${f(CLOUDS.width[1] - CLOUDS.width[0])} * cb.z;
    float yaw = cb.w * 6.283185307;
    float alt = ${f(CLOUDS.altitude[0])} + ${f(CLOUDS.altitude[1] - CLOUDS.altitude[0])} * float(marCloudH32(h + 5u) >> 8u) / 16777216.0;
    vec2 r = (c + j - 0.5 * cells) * cell + uCloudShadow.xy;
    float edge = 1.0 - smoothstep(0.5 * tile - ${f(CLOUDS.edgeFade)}, 0.5 * tile, max(abs(r.x), abs(r.y)));
    if (edge <= 0.0) continue;
    vec2 d = xz - (uCloudSun.zw + r + uCloudSun.xy * alt);
    float cy = cos(yaw), sy = sin(yaw);
    vec2 l = vec2(cy * d.x - sy * d.y, sy * d.x + cy * d.y);
    float ax = 0.5 * width * ${f(CLOUDS.shadowFit)} * uCloudShadow.z;
    float az = ax * ${f(CLOUDS.aspect)};
    float dn = length(l / vec2(ax, az));
    float sd = (dn - 1.0) * sqrt(ax * az);
    if (sd > ${f(CLOUDS.shadowBlur / 2 + CLOUDS.wobble)}) continue; // exact: wobble can't reach
    float wob = 0.65 * marCloudVN(l * 0.11 + vec2(float(ix), float(iz)) * 17.0, salt)
              + 0.35 * marCloudVN(l * 0.23 + 5.0, salt);
    sd += (wob - 0.5) * ${f(2 * CLOUDS.wobble)};
    m = max(m, (1.0 - smoothstep(${f(-CLOUDS.shadowBlur / 2)}, ${f(CLOUDS.shadowBlur / 2)}, sd)) * edge);
  }
  return m;
}
float marCloudShadowMul(vec2 xz, float debugMask) {
  if (uCloudShadow.z <= 0.0 || uCloudShadow.w <= 0.0 || debugMask > 0.5) return 1.0;
  return 1.0 - uCloudShadow.w * marCloudShadow(xz);
}
`;
