/**
 * Sky dome shaders. Uniforms: SHARED env colours (linear) + sky constants from
 * content/lighting SKY. Output is HDR (sun disc > 1 so bloom catches it).
 */
export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uFogColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uNight;
uniform float uTime;
uniform float uDebugMask;
uniform float uSunRadius;
uniform float uSunDisc;
uniform float uSunDim;
uniform vec2 uSunGlow;
uniform float uMoonRadius;
uniform vec3 uMoonColor;
uniform vec3 uStars;
uniform vec2 uBands;
varying vec3 vDir;

float skyHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
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

  float above = smoothstep(-0.01, 0.03, h);
  float cosA = dot(d, normalize(uSunDir));
  float ang = acos(clamp(cosA, -1.0, 1.0));
  float day = 1.0 - uNight;

  // sun: soft disc + glow
  float sunDisc = 1.0 - smoothstep(uSunRadius * 0.8, uSunRadius * 1.25, ang);
  float glow = pow(max(cosA, 0.0), uSunGlow.y) * uSunGlow.x;
  col += uSunColor * (sunDisc * uSunDisc + glow) * day * above * uSunDim;

  // moon: disc with a soft limb and a few darker "seas"
  float moonDisc = 1.0 - smoothstep(uMoonRadius * 0.85, uMoonRadius * 1.1, ang);
  float limb = 1.0 - 0.25 * smoothstep(0.0, uMoonRadius, ang);
  vec2 mp = (d.xz - normalize(uSunDir).xz) / uMoonRadius;
  float seas = 0.82 + 0.18 * smoothstep(0.35, 0.7, skyHash12(floor(mp * 2.5 + 7.0)));
  float moonGlow = pow(max(cosA, 0.0), 180.0) * 0.12;
  vec3 moon = uMoonColor * (moonDisc * limb * seas) + uMoonColor * moonGlow;
  col = mix(col, col * (1.0 - moonDisc) + moon, uNight * above);

  // stars: one candidate per angular cell, twinkling, fade at the horizon and near the moon
  if (uNight > 0.01) {
    float az = atan(d.z, d.x);
    float el = asin(clamp(h, -1.0, 1.0));
    vec2 g = vec2(az * max(cos(el), 0.2), el) * uStars.x;
    vec2 cell = floor(g);
    float r = skyHash12(cell);
    if (r < uStars.y) {
      vec2 c = vec2(skyHash12(cell + 17.3), skyHash12(cell + 41.9)) * 0.7 + 0.15;
      float dist = length(fract(g) - c);
      float size = mix(0.06, 0.14, skyHash12(cell + 3.1));
      float tw = 0.75 + 0.25 * sin(uTime * (1.3 + 2.0 * r / uStars.y) + r * 40.0);
      float star = (1.0 - smoothstep(0.0, size, dist)) * tw;
      float fade = smoothstep(0.08, 0.35, h) * (1.0 - moonDisc) * (1.0 - smoothstep(0.995, 0.9995, cosA) * 0.6);
      vec3 sc = mix(vec3(1.0, 0.92, 0.8), vec3(0.85, 0.9, 1.0), skyHash12(cell + 9.7));
      col += sc * star * uStars.z * uNight * fade;
    }
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
