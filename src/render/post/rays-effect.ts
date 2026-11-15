import * as THREE from 'three';
import { Effect, EffectAttribute, ShaderPass } from 'postprocessing';
import { RAYS } from '../../content/lighting.ts';
import { SHARED } from '../uniforms.ts';

/**
 * Dusk / dawn god rays, high tier only (TASK-608, D-183; numbers in content/lighting.ts `RAYS`).
 * Built only by the composer's high branch — medium / low never construct it.
 *   update(): while active, a half-res R8 march: from each pixel `RAYS.samples` depth taps toward
 *             the sun's screen position count open sky (depth = far plane) inside a soft disc round
 *             the sun (`RAYS.sourceRadius`) with a per-tap decay, so clouds, islands and landmarks
 *             cut shafts out of the low sun's glow. The start is
 *             jittered by interleaved gradient noise with a fixed seed (same URL, same pixels).
 *             Inactive (sun high, below the horizon, behind the camera, off screen, overcast,
 *             debug mask) → no march, no draw call; the composite adds 0.
 *   mainImage: adds sun colour × `RAYS.tint` × rays × a radial falloff from the sun, in HDR before
 *             the grade / tone mapping of the same pass.
 * No extra scene render and no light-source mesh (pmndrs `GodRaysEffect` renders its own light
 * mesh into two more targets): the dome already draws the sun, the depth buffer says where the sky
 * is open. Memory: one R8 half-res target (0.5 MB at 1920×1080).
 */

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`;

const MARCH_FRAG = /* glsl */ `
#define SAMPLES ${RAYS.samples}
uniform highp sampler2D tDepth;
uniform vec4 uSun; // xy = sun uv, z = aspect, w = source radius (uv height)
uniform vec3 uParams; // density, decay, weight
uniform float uSeed;
varying vec2 vUv;
void main() {
  vec2 delta = (uSun.xy - vUv) * (uParams.x / float(SAMPLES));
  vec2 g = gl_FragCoord.xy + uSeed * 64.0;
  float j = fract(52.9829189 * fract(dot(g, vec2(0.06711056, 0.00583715))));
  vec2 uv = vUv + delta * j;
  float illum = 1.0;
  float sum = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    uv += delta;
    float d = texture(tDepth, clamp(uv, vec2(0.0), vec2(1.0))).r;
    // light source = open sky inside a soft disc round the sun (no global wash from all the sky)
    float src = 1.0 - smoothstep(uSun.w * 0.3, uSun.w, length((uv - uSun.xy) * vec2(uSun.z, 1.0)));
    sum += (d >= 1.0 ? src : 0.0) * illum;
    illum *= uParams.y;
  }
  gl_FragColor = vec4(min(sum * uParams.z, 1.0), 0.0, 0.0, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tRays;
uniform vec3 uRayColor;
uniform vec3 uSunUv; // xy = sun uv, z = aspect
uniform float uK;

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  float r = texture(tRays, uv).r;
  float fall = exp(-length((uv - uSunUv.xy) * vec2(uSunUv.z, 1.0)) * 1.2);
  outputColor = vec4(inputColor.rgb + uRayColor * (r * fall * uK), inputColor.a);
}`;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Ray strength 0..1 for a sun sin-elevation (pure, RAYS.elevation window). */
export function raysElevationK(sy: number): number {
  const [a, b, c, d] = RAYS.elevation;
  return smooth(a, b, sy) * (1 - smooth(c, d, sy));
}

export class MarRaysEffect extends Effect {
  private readonly target: THREE.WebGLRenderTarget;
  private readonly march: ShaderPass;
  private readonly marchMaterial: THREE.ShaderMaterial;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly k: THREE.Uniform<number>;
  private readonly sunUv: THREE.Uniform<THREE.Vector3>;
  private readonly color: THREE.Uniform<THREE.Color>;
  private readonly tint = new THREE.Color(RAYS.tint);
  private readonly _v = new THREE.Vector3();
  private readonly _f = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    const k = new THREE.Uniform(0);
    const sunUv = new THREE.Uniform(new THREE.Vector3(0.5, 0.5, 1));
    const color = new THREE.Uniform(new THREE.Color());
    const tex = new THREE.Uniform<THREE.Texture | null>(null);
    super('MarRaysEffect', COMPOSITE_FRAG, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ['tRays', tex],
        ['uRayColor', color],
        ['uSunUv', sunUv],
        ['uK', k],
      ]),
    });
    this.camera = camera;
    this.k = k;
    this.sunUv = sunUv;
    this.color = color;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType,
      format: THREE.RedFormat,
      depthBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.target.texture.name = 'MarRays.Target';
    tex.value = this.target.texture;
    this.marchMaterial = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: MARCH_FRAG,
      uniforms: {
        tDepth: { value: null },
        uSun: { value: new THREE.Vector4(0.5, 0.5, 1, RAYS.sourceRadius) },
        uParams: { value: new THREE.Vector3(RAYS.density, RAYS.decay, RAYS.weight) },
        uSeed: { value: RAYS.seed },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.march = new ShaderPass(this.marchMaterial);
  }

  override setDepthTexture(depthTexture: THREE.Texture): void {
    this.marchMaterial.uniforms.tDepth.value = depthTexture;
  }

  override setSize(width: number, height: number): void {
    this.target.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)));
    this.sunUv.value.z = width / Math.max(height, 1);
    (this.marchMaterial.uniforms.uSun.value as THREE.Vector4).z = this.sunUv.value.z;
  }

  override update(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget): void {
    const dir = SHARED.uSunSkyDir.value;
    let k = raysElevationK(dir.y) * (1 - SHARED.uWeather.value.y);
    if (SHARED.uDebugMask.value > 0.5) k = 0;
    if (k > 0.001) {
      this.camera.getWorldDirection(this._f);
      if (this._f.dot(dir) <= 0.05) k = 0;
    }
    if (k > 0.001) {
      this.camera.getWorldPosition(this._v);
      this._v.addScaledVector(dir, 1000).project(this.camera);
      const u = this._v.x * 0.5 + 0.5;
      const v = this._v.y * 0.5 + 0.5;
      const out = Math.max(-u, u - 1, -v, v - 1, 0);
      k *= 1 - smooth(0, RAYS.edge, out);
      this.sunUv.value.x = u;
      this.sunUv.value.y = v;
      const s = this.marchMaterial.uniforms.uSun.value as THREE.Vector4;
      s.x = u;
      s.y = v;
    }
    this.k.value = k > 0.001 ? k * RAYS.intensity : 0;
    if (this.k.value === 0) return;
    this.color.value.copy(SHARED.uSunColor.value).multiply(this.tint);
    this.march.render(renderer, inputBuffer, this.target);
  }
}
