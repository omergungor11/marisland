import * as THREE from 'three';

/**
 * Sub-rectangle uploads of world-grid DataTextures (TASK-211). three r186 has no 2-D sub-rect
 * update for data textures (`Texture.updateRanges` assumes RGBA rows), so after an edit the
 * touched rows/columns go up with one `gl.texSubImage2D` straight from the texture's own
 * `image.data` (UNPACK_ROW_LENGTH / SKIP_*), through three's state cache so its pixel-store and
 * texture-binding shadows stay coherent. Anything unexpected falls back to a full re-upload
 * (`needsUpdate`), which is always correct because `image.data` already holds the new values.
 *
 * Grid convention: texel x = heightfield column i, texel y = row j (`flipY = false`).
 */
export interface TexRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Inclusive cell bounds (+ `pad`) → texel rect clamped to an `n`×`n` texture; null when empty. */
export function rectFromBounds(
  minI: number,
  maxI: number,
  minJ: number,
  maxJ: number,
  n: number,
  pad = 0,
): TexRect | null {
  if (maxI < minI || maxJ < minJ) return null;
  const x0 = Math.max(0, Math.floor(minI) - pad);
  const y0 = Math.max(0, Math.floor(minJ) - pad);
  const x1 = Math.min(n - 1, Math.ceil(maxI) + pad);
  const y1 = Math.min(n - 1, Math.ceil(maxJ) + pad);
  if (x1 < x0 || y1 < y0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Bounding rect of two rects (either may be null). */
export function unionRect(a: TexRect | null, b: TexRect | null): TexRect | null {
  if (!a) return b;
  if (!b) return a;
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w);
  const y1 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Tracks the bounding rect of changed texels while values are written into a texture's
 * `image.data` (`set` returns true when the stored value changed).
 */
export class DirtyRect {
  private x0 = Infinity;
  private y0 = Infinity;
  private x1 = -Infinity;
  private y1 = -Infinity;

  mark(x: number, y: number): void {
    if (x < this.x0) this.x0 = x;
    if (y < this.y0) this.y0 = y;
    if (x > this.x1) this.x1 = x;
    if (y > this.y1) this.y1 = y;
  }

  /** Write `v` at element `idx` (texel x, y) and mark the texel when it changed. */
  set(
    arr: Uint16Array | Uint8Array | Float32Array,
    idx: number,
    v: number,
    x: number,
    y: number,
  ): boolean {
    if (arr[idx] === v) return false;
    arr[idx] = v;
    this.mark(x, y);
    return true;
  }

  get rect(): TexRect | null {
    if (this.x1 < this.x0) return null;
    return { x: this.x0, y: this.y0, w: this.x1 - this.x0 + 1, h: this.y1 - this.y0 + 1 };
  }

  clear(): void {
    this.x0 = this.y0 = Infinity;
    this.x1 = this.y1 = -Infinity;
  }
}

/** Minimal WebGL2 surface the upload needs (a fake in unit tests). */
export interface SubImageGl {
  TEXTURE_2D: number;
  RED: number;
  RG: number;
  RGBA: number;
  HALF_FLOAT: number;
  FLOAT: number;
  UNSIGNED_BYTE: number;
  UNPACK_ROW_LENGTH: number;
  UNPACK_SKIP_PIXELS: number;
  UNPACK_SKIP_ROWS: number;
  UNPACK_ALIGNMENT: number;
  UNPACK_FLIP_Y_WEBGL: number;
  UNPACK_PREMULTIPLY_ALPHA_WEBGL: number;
}

/** The slice of `THREE.WebGLRenderer` used here (structural, so tests can fake it). */
export interface SubImageRenderer {
  getContext(): unknown;
  properties: { get(o: object): unknown };
  state: {
    bindTexture(target: number, tex: unknown): void;
    pixelStorei(name: number, value: number | boolean): void;
    getParameter(name: number): unknown;
    texSubImage2D(...args: unknown[]): void;
  };
}

export type UploadKind = 'sub' | 'full' | 'none';

/** WebGL format/type enums for a DataTexture, or null when not handled here. */
export function glFormatOf(
  gl: SubImageGl,
  tex: Pick<THREE.Texture, 'format' | 'type'>,
): { format: number; type: number; comps: number } | null {
  let format: number;
  let comps: number;
  if (tex.format === THREE.RedFormat) {
    format = gl.RED;
    comps = 1;
  } else if (tex.format === THREE.RGFormat) {
    format = gl.RG;
    comps = 2;
  } else if (tex.format === THREE.RGBAFormat) {
    format = gl.RGBA;
    comps = 4;
  } else return null;
  let type: number;
  if (tex.type === THREE.HalfFloatType) type = gl.HALF_FLOAT;
  else if (tex.type === THREE.FloatType) type = gl.FLOAT;
  else if (tex.type === THREE.UnsignedByteType) type = gl.UNSIGNED_BYTE;
  else return null;
  return { format, type, comps };
}

const isGl2 = (gl: unknown): gl is SubImageGl =>
  !!gl &&
  typeof (gl as SubImageGl).UNPACK_ROW_LENGTH === 'number' &&
  typeof (gl as SubImageGl).HALF_FLOAT === 'number';

/**
 * Upload `rect` of `tex.image.data` (already updated by the caller). Returns 'sub' when a
 * `texSubImage2D` was issued, 'full' when it fell back to `needsUpdate` (no renderer, not WebGL2,
 * texture not uploaded yet or a full upload already pending, unknown format), 'none' for an
 * empty rect.
 */
export function uploadTextureRect(
  renderer: SubImageRenderer | null,
  tex: THREE.DataTexture,
  rect: TexRect | null,
): UploadKind {
  if (!rect || rect.w <= 0 || rect.h <= 0) return 'none';
  const full = (): UploadKind => {
    tex.needsUpdate = true;
    return 'full';
  };
  if (!renderer) return full();
  const gl = renderer.getContext();
  if (!isGl2(gl)) return full();
  const p = renderer.properties.get(tex) as { __webglTexture?: unknown; __version?: number };
  // not on the GPU yet, or a full upload is already queued (it carries the new data)
  if (!p.__webglTexture || p.__version !== tex.version) return full();
  const f = glFormatOf(gl, tex);
  const img = tex.image as { data: ArrayBufferView | null; width: number; height: number };
  if (!f || !img.data) return full();
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  const w = Math.min(img.width, rect.x + rect.w) - x;
  const h = Math.min(img.height, rect.y + rect.h) - y;
  if (w <= 0 || h <= 0) return 'none';
  const s = renderer.state;
  const rowLen = s.getParameter(gl.UNPACK_ROW_LENGTH) ?? 0;
  const skipPx = s.getParameter(gl.UNPACK_SKIP_PIXELS) ?? 0;
  const skipRows = s.getParameter(gl.UNPACK_SKIP_ROWS) ?? 0;
  s.bindTexture(gl.TEXTURE_2D, p.__webglTexture);
  s.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  s.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  s.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  s.pixelStorei(gl.UNPACK_ROW_LENGTH, img.width);
  s.pixelStorei(gl.UNPACK_SKIP_PIXELS, x);
  s.pixelStorei(gl.UNPACK_SKIP_ROWS, y);
  s.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, f.format, f.type, img.data);
  s.pixelStorei(gl.UNPACK_ROW_LENGTH, rowLen as number);
  s.pixelStorei(gl.UNPACK_SKIP_PIXELS, skipPx as number);
  s.pixelStorei(gl.UNPACK_SKIP_ROWS, skipRows as number);
  return 'sub';
}

/**
 * CPU twin of the sub-rect upload (tests): copy `rect` of a `width`-wide, `comps`-channel source
 * into `dst` exactly as `texSubImage2D` with UNPACK_ROW_LENGTH = width and SKIP = (x, y) reads it.
 */
export function blitRect<T extends Uint16Array | Uint8Array | Float32Array>(
  src: T,
  dst: T,
  width: number,
  comps: number,
  rect: TexRect,
): void {
  for (let r = 0; r < rect.h; r++) {
    const o = ((rect.y + r) * width + rect.x) * comps;
    dst.set(src.subarray(o, o + rect.w * comps), o);
  }
}
