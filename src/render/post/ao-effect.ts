import * as THREE from 'three';
import { Effect, EffectAttribute, ShaderPass } from 'postprocessing';
import { AO } from '../../content/lighting.ts';
import { SHARED } from '../uniforms.ts';

/**
 * Stylized screen-space AO, high tier only (TASK-606, D-182; numbers in content/lighting.ts `AO`).
 * Depth only: view positions come from the composer's depth texture and normals are rebuilt from
 * depth (the smaller-difference neighbour per axis, so silhouettes do not smear) — no normal pass,
 * no second scene render, nothing that could miss the props' wind / dither-fade vertex work.
 *   update(): AO at half resolution (spiral taps rotated by interleaved gradient noise + AO.seed,
 *             fixed pattern → same URL, same pixels) → bilateral blur H → V (depth-weighted).
 *   mainImage: depth-aware upsample (4 half-res taps weighted by view-distance match) and a warm
 *             multiplier toward AO.tint; emissives (HDR luminance) are spared.
 * The range term (taps further than AO.radius count nothing) keeps a prop in front of the ground
 * from shading it (no halo); the cosine bias keeps flat facets from occluding themselves (no acne);
 * AO.maxOcclusion keeps the ground under props from going black.
 */

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`;

const AO_FRAG = /* glsl */ `
#define SAMPLES ${AO.samples}
uniform highp sampler2D tDepth;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform float uSeaBand;
uniform vec2 uTexel;
uniform vec2 uRes;
uniform vec4 uParams; // -, intensity, bias, maxOcclusion
uniform vec3 uRadius; // min u, max u, u per u of view distance
uniform vec2 uFade;
uniform float uMaxPx;
uniform float uSeed;
varying vec2 vUv;

vec3 viewPos(vec2 uv, float d) {
  vec4 p = uInvProj * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
// snap to the full-res depth texel centre: the depth texture is nearest-filtered and a half-res
// pixel centre sits on a texel corner, where rounding flips row by row (banded normals)
vec2 snapUv(vec2 uv) { return (floor(uv / uTexel) + 0.5) * uTexel; }
vec3 viewAt(vec2 uv) {
  uv = snapUv(uv);
  return viewPos(uv, texture(tDepth, uv).r);
}

void main() {
  vec2 uv = snapUv(vUv);
  float d = texture(tDepth, uv).r;
  if (d >= 1.0) { gl_FragColor = vec4(1.0, 1e4, 0.0, 1.0); return; }
  vec3 p = viewPos(uv, d);
  float dist = -p.z;
  float fade = 1.0 - smoothstep(uFade.x, uFade.y, dist);
  float radius = clamp(dist * uRadius.z, uRadius.x, uRadius.y);
  float rPx = min(radius * uProj[1][1] * 0.5 / dist * uRes.y, uMaxPx);
  if (fade <= 0.0 || rPx < 1.0) { gl_FragColor = vec4(1.0, dist, 0.0, 1.0); return; }

  vec3 pr = viewAt(uv + vec2(uTexel.x, 0.0));
  vec3 pl = viewAt(uv - vec2(uTexel.x, 0.0));
  vec3 pu = viewAt(uv + vec2(0.0, uTexel.y));
  vec3 pd = viewAt(uv - vec2(0.0, uTexel.y));
  vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl;
  vec3 dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
  vec3 n = normalize(cross(dx, dy));
  // the sea surface (flat-up receiver within the swell band of y = 0) takes no AO: the swell
  // troughs would band it and hulls would get dark rings
  vec3 pw = (uCamWorld * vec4(p, 1.0)).xyz;
  if (abs(pw.y) < uSeaBand && (uCamWorld * vec4(n, 0.0)).y > 0.9) {
    gl_FragColor = vec4(1.0, dist, 0.0, 1.0);
    return;
  }

  // interleaved gradient noise on the half-res pixel grid: deterministic, blur-friendly
  vec2 g = gl_FragCoord.xy + uSeed * 64.0;
  float phi = fract(52.9829189 * fract(dot(g, vec2(0.06711056, 0.00583715)))) * 6.2831853;
  vec2 stp = rPx / uRes;
  float sum = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    float r = sqrt((float(i) + 0.5) / float(SAMPLES));
    float th = float(i) * 2.399963 + phi;
    vec3 q = viewAt(uv + vec2(cos(th), sin(th)) * r * stp);
    vec3 v = q - p;
    float vv = dot(v, v);
    float range = max(0.0, 1.0 - sqrt(vv) / radius); // linear: a readable contact band
    sum += range * max(0.0, dot(n, v) * inversesqrt(vv + 1e-4) - uParams.z);
  }
  float occ = min(sum / float(SAMPLES) * uParams.y, 1.0) * uParams.w * fade;
  gl_FragColor = vec4(1.0 - occ, dist, 0.0, 1.0);
}`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D tAO;
uniform vec2 uDir;
uniform float uDepthK;
varying vec2 vUv;
void main() {
  vec4 c = texture(tAO, vUv);
  float z = c.g;
  float tol = max(z * uDepthK, 1e-3);
  float sum = c.r * 0.4;
  float wsum = 0.4;
  for (int i = 1; i <= 2; i++) {
    float gw = i == 1 ? 0.24 : 0.06;
    for (int s = -1; s <= 1; s += 2) {
      vec4 t = texture(tAO, vUv + uDir * float(i * s));
      float w = gw * max(0.0, 1.0 - abs(t.g - z) / tol);
      sum += t.r * w;
      wsum += w;
    }
  }
  gl_FragColor = vec4(sum / wsum, z, 0.0, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tAO;
uniform vec2 uAoTexel;
uniform vec3 uTint;
uniform vec2 uSpare;
uniform float uNightK;

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  if (depth >= 1.0) { outputColor = inputColor; return; }
  float z = -getViewZ(depth);
  float sum = 0.0;
  float wsum = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(float(i & 1) - 0.5, float(i >> 1) - 0.5) * uAoTexel;
    vec4 t = texture(tAO, uv + o);
    float w = 1.0 / (1e-3 + abs(t.g - z) / max(z, 1.0));
    sum += t.r * w;
    wsum += w;
  }
  float ao = sum / wsum;
  float l = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  ao = mix(ao, 1.0, smoothstep(uSpare.x, uSpare.y, l));
  ao = 1.0 - (1.0 - ao) * uNightK;
  // alpha 1: alpha-to-coverage fades (TASK-687) leave the resolved scene alpha < 1 at fading
  // ground cover, which the later passes read as a lighter ghost; AO is the first effect on high
  outputColor = vec4(inputColor.rgb * mix(uTint, vec3(1.0), ao), 1.0);
}`;

function fullscreen(frag: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: frag,
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

export class MarAOEffect extends Effect {
  private readonly aoTarget: THREE.WebGLRenderTarget;
  private readonly blurTarget: THREE.WebGLRenderTarget;
  private readonly aoPass: ShaderPass;
  private readonly blurPass: ShaderPass;
  private readonly aoMaterial: THREE.ShaderMaterial;
  private readonly blurMaterial: THREE.ShaderMaterial;
  private readonly nightK: THREE.Uniform<number>;

  constructor(camera: THREE.PerspectiveCamera) {
    const nightK = new THREE.Uniform(1);
    const aoTex = new THREE.Uniform<THREE.Texture | null>(null);
    super('MarAOEffect', COMPOSITE_FRAG, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ['tAO', aoTex],
        ['uAoTexel', new THREE.Uniform(new THREE.Vector2())],
        ['uTint', new THREE.Uniform(new THREE.Color(AO.tint))],
        ['uSpare', new THREE.Uniform(new THREE.Vector2(AO.spare[0], AO.spare[1]))],
        ['uNightK', nightK],
      ]),
    });
    this.nightK = nightK;
    const rt = (): THREE.WebGLRenderTarget =>
      new THREE.WebGLRenderTarget(1, 1, {
        // RG16F (AO, view distance): 4 B / px, 2 × 2 MB at 1920×1080 half res
        type: THREE.HalfFloatType,
        format: THREE.RGFormat,
        depthBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
    this.aoTarget = rt();
    this.aoTarget.texture.name = 'MarAO.Target';
    this.blurTarget = rt();
    this.blurTarget.texture.name = 'MarAO.Blur';
    aoTex.value = this.aoTarget.texture;

    this.aoMaterial = fullscreen(AO_FRAG, {
      tDepth: { value: null },
      uProj: { value: camera.projectionMatrix },
      uInvProj: { value: camera.projectionMatrixInverse },
      uCamWorld: { value: camera.matrixWorld },
      uSeaBand: { value: AO.seaBand },
      uTexel: { value: new THREE.Vector2() },
      uRes: { value: new THREE.Vector2() },
      uParams: { value: new THREE.Vector4(0, AO.intensity, AO.bias, AO.maxOcclusion) },
      uRadius: { value: new THREE.Vector3(AO.radius[0], AO.radius[1], AO.radiusPerU) },
      uFade: { value: new THREE.Vector2(AO.fade[0], AO.fade[1]) },
      uMaxPx: { value: AO.maxPx },
      uSeed: { value: AO.seed },
    });
    this.blurMaterial = fullscreen(BLUR_FRAG, {
      tAO: { value: null },
      uDir: { value: new THREE.Vector2() },
      uDepthK: { value: AO.blurDepth },
    });
    this.aoPass = new ShaderPass(this.aoMaterial);
    this.blurPass = new ShaderPass(this.blurMaterial, 'tAO');
  }

  override setDepthTexture(depthTexture: THREE.Texture): void {
    this.aoMaterial.uniforms.tDepth.value = depthTexture;
  }

  override setSize(width: number, height: number): void {
    const w = Math.max(1, Math.ceil(width / 2));
    const h = Math.max(1, Math.ceil(height / 2));
    this.aoTarget.setSize(w, h);
    this.blurTarget.setSize(w, h);
    this.aoMaterial.uniforms.uTexel.value.set(1 / width, 1 / height);
    this.aoMaterial.uniforms.uRes.value.set(w, h);
    (this.uniforms.get('uAoTexel')!.value as THREE.Vector2).set(1 / w, 1 / h);
  }

  override update(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget): void {
    // debug-mask mode (metric masks) bypasses AO like the grade does: k = 0 → colour × 1
    this.nightK.value =
      SHARED.uDebugMask.value > 0.5 ? 0 : 1 + (AO.night - 1) * SHARED.uNight.value;
    const dir = this.blurMaterial.uniforms.uDir.value as THREE.Vector2;
    const { width: w, height: h } = this.aoTarget;
    this.aoPass.render(renderer, inputBuffer, this.aoTarget);
    dir.set(1 / w, 0);
    this.blurPass.render(renderer, this.aoTarget, this.blurTarget);
    dir.set(0, 1 / h);
    this.blurPass.render(renderer, this.blurTarget, this.aoTarget);
  }
}
