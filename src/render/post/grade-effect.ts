import * as THREE from 'three';
import { Effect } from 'postprocessing';
import { LIGHTING } from '../../content/palette.ts';
import { POST } from '../../content/lighting.ts';

/**
 * One merged grade effect (ART_BIBLE §3 "Grade", "Vignette"), applied in linear
 * HDR before tone mapping:
 *  - +4 % saturation weighted to midtones,
 *  - lifted blacks (darks only),
 *  - golden-hour warm overlay (6 % × uGolden toward #FFB866, luminance kept),
 *  - night: luminance-kept shift toward a moonlit blue (spares emissives and warm lamp-lit
 *    pixels — lantern pools, windows — and bright cyan/blue screens by hue),
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
uniform vec3 uNightTint;
uniform float uNight;
uniform float uGoldenLift;
uniform float uNightLift;
uniform float uWSat;
uniform vec4 uScreenSpare;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = max(inputColor.rgb, 0.0);
  if (uMask > 0.5) { outputColor = vec4(c, inputColor.a); return; }
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float mid = smoothstep(0.0, 0.18, l) * (1.0 - smoothstep(0.5, 1.4, l));
  c = max(mix(vec3(l), c, 1.0 + uSat * mid), 0.0);
  // weather saturation (TASK-172, bible weather table); 0 when clear
  if (uWSat != 0.0) c = max(mix(vec3(l), c, 1.0 + uWSat), 0.0);
  c += uLift * (1.0 - smoothstep(0.0, 0.15, c));
  c = mix(c, uWarm * l, uGolden);
  c *= 1.0 + uGoldenLift * mid;
  // day-for-night: luminance-preserving shift to blue, sparing highlights (emissives)
  float spare = 1.0 - smoothstep(0.25, 0.9, l);
  // lamp-lit pixels (warm, almost no blue vs red) keep their colour too, so lantern pools
  // fade warm → dark by hue instead of flipping per facet at a luminance threshold
  float warm = max(
    (1.0 - smoothstep(0.12, 0.4, c.b / max(c.r, 1e-4))) * smoothstep(0.01, 0.06, c.r),
    smoothstep(0.04, 0.16, c.r - c.b));
  // screens (TASK-305): bright, saturated cyan/blue pixels keep their hue too; the luminance gate
  // sits above moonlit sky/water/halo so only emissive screens qualify
  float cool = smoothstep(uScreenSpare.x, uScreenSpare.y, l)
    * smoothstep(uScreenSpare.z, uScreenSpare.w, 1.0 - c.r / max(max(c.g, c.b), 1e-4));
  spare *= (1.0 - warm) * (1.0 - cool);
  c = mix(c, uNightTint * l, uNight * spare);
  c += uNightTint * (uNightLift * (1.0 - smoothstep(0.0, 0.05, l)));
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
    const warmL = 0.2126 * warm.r + 0.7152 * warm.g + 0.0722 * warm.b;
    const vig = new THREE.Color(LIGHTING.vignette.color);
    const nt = new THREE.Color(POST.nightTint);
    const ntL = 0.2126 * nt.r + 0.7152 * nt.g + 0.0722 * nt.b;
    super('MarGradeEffect', FRAG, {
      uniforms: new Map<string, THREE.Uniform>([
        ['uSat', new THREE.Uniform(LIGHTING.grade.saturation)],
        ['uLift', new THREE.Uniform(POST.lift)],
        ['uWarm', new THREE.Uniform(new THREE.Vector3(warm.r, warm.g, warm.b).divideScalar(warmL))],
        ['uGolden', new THREE.Uniform(0)],
        ['uVigColor', new THREE.Uniform(new THREE.Vector3(vig.r, vig.g, vig.b))],
        [
          'uVig',
          new THREE.Uniform(
            new THREE.Vector2(LIGHTING.vignette.intensity, LIGHTING.vignette.softness),
          ),
        ],
        ['uMask', new THREE.Uniform(0)],
        ['uNightTint', new THREE.Uniform(new THREE.Vector3(nt.r, nt.g, nt.b).divideScalar(ntL))],
        ['uNight', new THREE.Uniform(0)],
        ['uGoldenLift', new THREE.Uniform(0)],
        ['uNightLift', new THREE.Uniform(0)],
        ['uWSat', new THREE.Uniform(0)],
        ['uScreenSpare', new THREE.Uniform(new THREE.Vector4(...POST.nightScreenSpare))],
      ]),
    });
  }

  /** 0..1 golden-hour factor (EnvState.golden) → 6 % overlay at the peak. */
  setGolden(g: number): void {
    (this.uniforms.get('uGolden') as THREE.Uniform<number>).value = g * LIGHTING.grade.goldenWarm;
    (this.uniforms.get('uGoldenLift') as THREE.Uniform<number>).value = g * POST.goldenLift;
  }

  /** EnvState.night 0..1 → night grade strength. */
  setNight(n: number): void {
    const t = Math.min(1, Math.max(0, (n - POST.nightFrom) / (1 - POST.nightFrom)));
    (this.uniforms.get('uNight') as THREE.Uniform<number>).value =
      t * t * (3 - 2 * t) * POST.nightMix;
    (this.uniforms.get('uNightLift') as THREE.Uniform<number>).value =
      t * t * (3 - 2 * t) * POST.nightLift;
  }

  /** Weather saturation delta (SHARED.uWeatherGrade, e.g. −0.2 in rain). */
  setWeatherSaturation(d: number): void {
    (this.uniforms.get('uWSat') as THREE.Uniform<number>).value = d;
  }

  setMask(on: boolean): void {
    (this.uniforms.get('uMask') as THREE.Uniform<number>).value = on ? 1 : 0;
  }
}
