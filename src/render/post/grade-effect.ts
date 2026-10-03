import * as THREE from 'three';
import { Effect } from 'postprocessing';
import { LIGHTING } from '../../content/palette.ts';
import { POST } from '../../content/lighting.ts';

/**
 * One merged grade effect (ART_BIBLE §3 "Grade", "Vignette"), applied in linear
 * HDR before tone mapping:
 *  - +4 % saturation weighted to midtones,
 *  - lifted blacks (darks only),
 *  - golden-hour warm overlay (6 % × uGolden toward #FFB866),
 *  - coloured vignette (intensity 0.22, softness 0.6, colour #2A2350) — pmndrs'
 *    VignetteEffect can only darken to black, hence the custom effect.
 * Bypassed in debug-mask mode so mask colours stay exact.
 */
const FRAG = /* glsl */ `
uniform float uSat;
uniform float uLift;
uniform vec3 uWarm;
uniform float uGolden;
uniform vec3 uVigColor;
uniform vec2 uVig;
uniform float uMask;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = max(inputColor.rgb, 0.0);
  if (uMask > 0.5) { outputColor = vec4(c, inputColor.a); return; }
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float mid = smoothstep(0.0, 0.18, l) * (1.0 - smoothstep(0.5, 1.4, l));
  c = max(mix(vec3(l), c, 1.0 + uSat * mid), 0.0);
  c += uLift * (1.0 - smoothstep(0.0, 0.15, c));
  c = mix(c, uWarm, uGolden);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float r = length(p) / length(vec2(aspect, 1.0) * 0.5);
  float m = smoothstep(1.0 - uVig.y, 1.0 + 0.1, r);
  c = mix(c, uVigColor, m * uVig.x);
  outputColor = vec4(c, inputColor.a);
}
`;

export class MarGradeEffect extends Effect {
  constructor() {
    const warm = new THREE.Color(POST.goldenColor);
    const vig = new THREE.Color(LIGHTING.vignette.color);
    super('MarGradeEffect', FRAG, {
      uniforms: new Map<string, THREE.Uniform>([
        ['uSat', new THREE.Uniform(LIGHTING.grade.saturation)],
        ['uLift', new THREE.Uniform(POST.lift)],
        ['uWarm', new THREE.Uniform(new THREE.Vector3(warm.r, warm.g, warm.b))],
        ['uGolden', new THREE.Uniform(0)],
        ['uVigColor', new THREE.Uniform(new THREE.Vector3(vig.r, vig.g, vig.b))],
        [
          'uVig',
          new THREE.Uniform(
            new THREE.Vector2(LIGHTING.vignette.intensity, LIGHTING.vignette.softness),
          ),
        ],
        ['uMask', new THREE.Uniform(0)],
      ]),
    });
  }

  /** 0..1 golden-hour factor (EnvState.golden) → 6 % overlay at the peak. */
  setGolden(g: number): void {
    (this.uniforms.get('uGolden') as THREE.Uniform<number>).value = g * LIGHTING.grade.goldenWarm;
  }

  setMask(on: boolean): void {
    (this.uniforms.get('uMask') as THREE.Uniform<number>).value = on ? 1 : 0;
  }
}
