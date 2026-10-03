/**
 * Lit-material GLSL snippets shared by the material factory (props) and the
 * terrain material (ART_BIBLE §3: fresnel rim, warm light / cool shade).
 * All operate on MeshLambertMaterial's fragment locals: `normal` (view space),
 * `vViewPosition`, `outgoingLight`, `reflectedLight`, `diffuseColor`.
 */
import { LIGHTING } from '../../../content/palette.ts';
import { SHADE } from '../../../content/lighting.ts';

const f = (v: number): string => v.toFixed(5);

export const SHARED_LIT_GLSL = {
  /** Fragment pars: uniforms + helpers. Insert after `#include <common>`. */
  fragmentPars: /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uShadowTint;
uniform float uNight;
uniform float uDebugMask;
float marLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`,

  /**
   * Fresnel rim (0.15 × horizon colour) so silhouettes separate from the water.
   * Insert before `#include <opaque_fragment>` (after outgoingLight is formed).
   */
  rim: /* glsl */ `
  {
    vec3 marV = normalize(vViewPosition);
    float marF = 1.0 - clamp(dot(normal, marV), 0.0, 1.0);
    marF = marF * marF * marF;
    outgoingLight += uHorizon * (${f(LIGHTING.rim)} * marF);
  }
`,

  /**
   * Explicit shadow tint (fallback when light colours alone fail the mask metric):
   * the shadowed part (indirect-only) is lerped toward uShadowTint by
   * SHADE.tintMix (≈ bible 0.35) and held above LIGHTING.minShadowL luminance by day.
   * Insert before `#include <opaque_fragment>`, BEFORE emissive/rim are added.
   * Needs `marSunVis` (0 shadowed … 1 lit) from `sunVisibility`.
   */
  shadowTint: /* glsl */ `
  {
    float marShade = 1.0 - marSunVis;
    vec3 marInd = reflectedLight.indirectDiffuse;
    float marL = marLuma(marInd);
    vec3 marTinted = mix(marInd, uShadowTint * (marL / max(marLuma(uShadowTint), 1e-4)), ${f(SHADE.tintMix)});
    float marMin = ${f(LIGHTING.minShadowL)} * (1.0 - uNight) * marLuma(diffuseColor.rgb);
    marTinted *= max(1.0, marMin / max(marLuma(marTinted), 1e-4));
    outgoingLight += (marTinted - marInd) * marShade;
  }
`,

  /**
   * Sun visibility estimate: direct diffuse actually received vs. what an
   * unshadowed sun would give. Requires directional light 0 (the sun).
   */
  sunVisibility: /* glsl */ `
  float marSunVis = 1.0;
  #if NUM_DIR_LIGHTS > 0
  {
    float marNdl = dot(normal, directionalLights[0].direction);
    vec3 marExp = max(marNdl, 0.0) * directionalLights[0].color * BRDF_Lambert(diffuseColor.rgb);
    float marE = marLuma(marExp);
    marSunVis = marE > 1e-4 ? clamp(marLuma(reflectedLight.directDiffuse) / marE, 0.0, 1.0) : 0.0;
    // grazing faces read as form shade too (no hard switch at N·L = 0)
    marSunVis *= smoothstep(0.0, ${f(SHADE.formNdl)}, marNdl);
  }
  #endif
`,
} as const;
