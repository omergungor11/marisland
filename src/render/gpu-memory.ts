import * as THREE from 'three';

/**
 * GPU memory from what is actually allocated (sweep D5b; replaces the old per-object guess):
 * - geometry: attribute + index `byteLength` of every mesh / points / line in the scene, plus
 *   instance matrices / colours — shared buffers (prop LOD groups share their base attributes,
 *   blobs share `aAppear`) counted once;
 * - textures: every uploaded texture referenced by a scene material (properties and uniforms),
 *   the scene background / environment and the post chain, `width × height × bytesPerTexel`
 *   (+⅓ for mips);
 * - targets: allocated render targets reachable from the post chain (colour attachments, depth
 *   textures or depth renderbuffers, × samples for MSAA renderbuffers);
 * - shadow: the lights' shadow maps (colour + depth attachments);
 * - canvas: the drawing buffer (colour + depth/stencil, × 4 samples + resolve when antialiased).
 * Hidden objects count too (their buffers are uploaded once drawn): the figure is what the world
 * holds, not what this frame happened to touch.
 */
export interface GpuMemory {
  geometry: number;
  textures: number;
  targets: number;
  shadow: number;
  canvas: number;
  total: number;
}

const MB = 1048576;

const channels = (format: number): number => {
  switch (format) {
    case THREE.RGBAFormat:
    case THREE.RGBAIntegerFormat:
      return 4;
    case THREE.RGFormat:
    case THREE.RGIntegerFormat:
      return 2;
    default:
      return 1; // Red, Alpha, Depth, DepthStencil (sized by its packed type)
  }
};

const typeBytes = (type: number): number => {
  switch (type) {
    case THREE.HalfFloatType:
    case THREE.ShortType:
    case THREE.UnsignedShortType:
    case THREE.UnsignedShort4444Type:
    case THREE.UnsignedShort5551Type:
      return 2;
    case THREE.FloatType:
    case THREE.IntType:
    case THREE.UnsignedIntType:
    case THREE.UnsignedInt248Type:
    case THREE.UnsignedInt5999Type:
      return 4;
    default:
      return 1;
  }
};

/** Bytes per texel of `t` (format × type; packed depth / depth-stencil types are whole texels). */
export function bytesPerTexel(t: THREE.Texture): number {
  if (t.type === THREE.UnsignedInt248Type || t.type === THREE.UnsignedInt5999Type) return 4;
  if (t.format === THREE.DepthFormat || t.format === THREE.DepthStencilFormat)
    return Math.max(typeBytes(t.type), 2);
  return channels(t.format) * typeBytes(t.type);
}

const MIP_FILTERS: readonly number[] = [
  THREE.NearestMipmapNearestFilter,
  THREE.NearestMipmapLinearFilter,
  THREE.LinearMipmapNearestFilter,
  THREE.LinearMipmapLinearFilter,
];

/** Bytes of texture `t` at `w × h` (× depth / 6 faces), +⅓ when it has a mip chain. */
export function textureBytes(t: THREE.Texture, w?: number, h?: number): number {
  const img = (t.image ?? {}) as { width?: number; height?: number; depth?: number };
  const width = w ?? img.width ?? 0;
  const height = h ?? img.height ?? 0;
  const layers = (t as THREE.CubeTexture).isCubeTexture ? 6 : Math.max(1, img.depth ?? 1);
  let bytes = width * height * layers * bytesPerTexel(t);
  if (t.mipmaps?.length || (t.generateMipmaps && MIP_FILTERS.includes(t.minFilter))) bytes *= 4 / 3;
  return bytes;
}

/** Bytes of a render target: colour attachments, depth texture / renderbuffer, MSAA copies. */
export function renderTargetBytes(rt: THREE.RenderTarget): number {
  const w = rt.width;
  const h = rt.height;
  const faces = (rt as { isWebGLCubeRenderTarget?: boolean }).isWebGLCubeRenderTarget ? 6 : 1;
  const textures = rt.textures ?? [rt.texture];
  let colour = 0;
  for (const t of textures) colour += textureBytes(t, w, h);
  colour *= faces;
  const depth = rt.depthTexture
    ? textureBytes(rt.depthTexture, w, h) * faces
    : rt.depthBuffer
      ? w * h * 4 * faces
      : 0;
  // MSAA: multisampled renderbuffers for every colour attachment + depth, resolved into the
  // textures above (the depth texture, if any, is the resolve target of the depth renderbuffer)
  const msaa =
    rt.samples > 0 ? rt.samples * (colour + (rt.depthBuffer ? w * h * 4 * faces : 0)) : 0;
  return colour + depth + msaa;
}

type Found = { targets: Set<THREE.RenderTarget>; textures: Set<THREE.Texture> };

/** Collect render targets / textures reachable from `root` (post passes, effects, materials). */
function walk(root: unknown, found: Found, seen: Set<object>, depth: number): void {
  if (!root || typeof root !== 'object' || seen.has(root) || depth > 12) return;
  seen.add(root);
  const o = root as Record<string, unknown> & {
    isWebGLRenderTarget?: boolean;
    isTexture?: boolean;
    isObject3D?: boolean;
    isWebGLRenderer?: boolean;
    isBufferGeometry?: boolean;
  };
  if (o.isWebGLRenderTarget) {
    found.targets.add(o as unknown as THREE.RenderTarget);
    return;
  }
  if (o.isTexture) {
    found.textures.add(o as unknown as THREE.Texture);
    return;
  }
  // the scene graph / renderer / geometry are counted elsewhere; typed arrays hold no targets
  if (o.isObject3D || o.isWebGLRenderer || o.isBufferGeometry || ArrayBuffer.isView(o)) return;
  if (o instanceof Map || o instanceof Set) {
    for (const v of o.values()) walk(v, found, seen, depth + 1);
    return;
  }
  for (const k of Object.keys(o)) walk(o[k], found, seen, depth + 1);
}

const materialsOf = (o: THREE.Object3D): THREE.Material[] => {
  const m = (o as THREE.Mesh).material;
  return !m ? [] : Array.isArray(m) ? m : [m];
};

export function measureGpuMemory(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  post: unknown,
  /** Optional per-target / per-texture list (debugging): `[name, MB]`. */
  detail?: [string, number][],
): GpuMemory {
  const buffers = new Set<ArrayBufferLike | ArrayBufferView>();
  let geometry = 0;
  const addArray = (a: ArrayBufferView | undefined | null): void => {
    if (!a || buffers.has(a)) return;
    buffers.add(a);
    geometry += a.byteLength;
  };
  const addAttr = (
    attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null | undefined,
  ): void => {
    if (!attr) return;
    const a = (attr as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute
      ? (attr as THREE.InterleavedBufferAttribute).data.array
      : (attr as THREE.BufferAttribute).array;
    addArray(a as ArrayBufferView);
  };
  const found: Found = { targets: new Set(), textures: new Set() };
  const seen = new Set<object>();
  const shadowTargets = new Set<THREE.RenderTarget>();
  scene.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (g?.isBufferGeometry) {
      for (const name of Object.keys(g.attributes)) addAttr(g.attributes[name]);
      addAttr(g.index);
    }
    const im = o as THREE.InstancedMesh;
    if (im.isInstancedMesh) {
      addAttr(im.instanceMatrix);
      addAttr(im.instanceColor);
    }
    for (const m of materialsOf(o)) walk(m, found, seen, 0);
    const shadow = (o as THREE.DirectionalLight).shadow as THREE.LightShadow | undefined;
    if ((o as THREE.Light).isLight && (o as THREE.Light).castShadow && shadow?.map)
      shadowTargets.add(shadow.map);
  });
  walk(scene.background, found, seen, 0);
  walk(scene.environment, found, seen, 0);
  if (post) walk(post, found, seen, 0);

  // only what the GPU holds: a target counts once it has a framebuffer, a texture once uploaded
  // (pmndrs allocates fallback passes it never renders, e.g. the Kawase blur next to mipmap bloom)
  const props = renderer.properties as unknown as { get(o: object): Record<string, unknown> };
  const live = (o: object): boolean => {
    const p = props.get(o);
    return p.__webglFramebuffer !== undefined || p.__webglTexture !== undefined;
  };
  const rtTextures = new Set<THREE.Texture>();
  let targets = 0;
  let shadow = 0;
  const note = (name: string, bytes: number): void => void detail?.push([name, bytes / MB]);
  for (const rt of shadowTargets) {
    for (const t of rt.textures ?? [rt.texture]) rtTextures.add(t);
    if (rt.depthTexture) rtTextures.add(rt.depthTexture);
    if (!live(rt)) continue;
    shadow += renderTargetBytes(rt);
    note(`shadow ${rt.width}×${rt.height}`, renderTargetBytes(rt));
  }
  for (const rt of found.targets) {
    for (const t of rt.textures ?? [rt.texture]) rtTextures.add(t);
    if (rt.depthTexture) rtTextures.add(rt.depthTexture);
    if (shadowTargets.has(rt) || !live(rt)) continue;
    targets += renderTargetBytes(rt);
    note(
      `target ${rt.texture.name || '?'} ${rt.width}×${rt.height} ×${rt.samples} t${rt.texture.type}`,
      renderTargetBytes(rt),
    );
  }
  let textures = 0;
  for (const t of found.textures) {
    if (rtTextures.has(t) || !live(t)) continue;
    textures += textureBytes(t);
    note(`texture ${t.name || '?'}`, textureBytes(t));
  }

  const c = renderer.domElement;
  const px = c.width * c.height;
  const attrs = renderer.getContext().getContextAttributes();
  const perPx = 4 + (attrs?.depth ? 4 : 0);
  // antialiased: 4× multisampled colour + depth, resolved into a single-sample colour buffer
  const canvas = attrs?.antialias ? px * (4 * perPx + 4) : px * perPx;

  return {
    geometry: geometry / MB,
    textures: textures / MB,
    targets: targets / MB,
    shadow: shadow / MB,
    canvas: canvas / MB,
    total: (geometry + textures + targets + shadow + canvas) / MB,
  };
}
