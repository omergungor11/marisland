/**
 * GLSL twins of src/shared/fields.ts (swellY, gustAt) and core/math/spring.ts (springIn).
 * Keep the formulas identical — fields.test.ts checks numeric parity by evaluating both.
 * Uniforms expected: uTime, uWind (xy dir, z strength, w wavelength), uGustSpeed, uSwell (x amp, y period), uMotionScale.
 */
export const FIELDS_GLSL = /* glsl */ `
float marSwellY(vec2 p, float t, vec2 dir, float amplitude, float period) {
  float w = 6.283185307 / period;
  vec2 d1 = dir;
  float k1 = 6.283185307 / 28.0;
  float k2 = 6.283185307 / 11.0;
  float ca = cos(0.65), sa = sin(0.65);
  vec2 d2 = vec2(dir.x * ca - dir.y * sa, dir.x * sa + dir.y * ca);
  float a = sin(dot(p, d1) * k1 - t * w);
  float b = sin(dot(p, d2) * k2 - t * w * 1.7 + 1.3);
  return amplitude * (a * 0.7 + b * 0.3);
}

float marGustAt(vec2 p, float t, vec2 dir, float speed, float wavelength, float strength) {
  float along = dot(p, dir);
  float phase = (along - t * speed) * (6.283185307 / wavelength);
  float wave = 0.5 + 0.5 * sin(phase);
  float pulse = 0.5 + 0.5 * sin(t * 0.37 + along * 0.013);
  float g = wave * wave * (0.55 + 0.45 * pulse);
  return min(1.0, g * strength);
}

float marSpringIn(float t, float k, float c) {
  if (t <= 0.0) return 0.0;
  if (t > 2.0) return 1.0;
  float w0 = sqrt(k);
  float z = c / (2.0 * w0);
  if (z >= 1.0) return 1.0 - exp(-w0 * t) * (1.0 + w0 * t);
  float wd = w0 * sqrt(1.0 - z * z);
  return 1.0 - exp(-z * w0 * t) * (cos(wd * t) + (z * w0 / wd) * sin(wd * t));
}

/* 4×4 Bayer threshold for ordered-dither discard. */
float marBayer4(vec2 fragCoord) {
  ivec2 p = ivec2(mod(fragCoord, 4.0));
  int i = p.x + p.y * 4;
  float v = 0.0;
  if (i == 0) v = 0.0;  else if (i == 1) v = 8.0;  else if (i == 2) v = 2.0;  else if (i == 3) v = 10.0;
  else if (i == 4) v = 12.0; else if (i == 5) v = 4.0;  else if (i == 6) v = 14.0; else if (i == 7) v = 6.0;
  else if (i == 8) v = 3.0;  else if (i == 9) v = 11.0; else if (i == 10) v = 1.0; else if (i == 11) v = 9.0;
  else if (i == 12) v = 15.0; else if (i == 13) v = 7.0; else if (i == 14) v = 13.0; else v = 5.0;
  return (v + 0.5) / 16.0;
}
`;
