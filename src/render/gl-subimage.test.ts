import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DirtyRect,
  blitRect,
  rectFromBounds,
  unionRect,
  uploadTextureRect,
  type SubImageGl,
  type SubImageRenderer,
} from './gl-subimage.ts';

const GL: SubImageGl = {
  TEXTURE_2D: 0x0de1,
  RED: 0x1903,
  RG: 0x8227,
  RGBA: 0x1908,
  HALF_FLOAT: 0x140b,
  FLOAT: 0x1406,
  UNSIGNED_BYTE: 0x1401,
  UNPACK_ROW_LENGTH: 0x0cf2,
  UNPACK_SKIP_PIXELS: 0x0cf4,
  UNPACK_SKIP_ROWS: 0x0cf3,
  UNPACK_ALIGNMENT: 0x0cf5,
  UNPACK_FLIP_Y_WEBGL: 0x9240,
  UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
};

/**
 * Fake renderer whose texSubImage2D reads the source exactly like WebGL2 with the current
 * UNPACK_ROW_LENGTH / SKIP_PIXELS / SKIP_ROWS into a "GPU" copy of the texture.
 */
function fakeRenderer(tex: THREE.DataTexture, comps: number, uploaded = true) {
  const img = tex.image as { data: Uint16Array; width: number; height: number };
  const gpu = img.data.slice();
  const pixel = new Map<number, number | boolean>([
    [GL.UNPACK_ROW_LENGTH, 0],
    [GL.UNPACK_SKIP_PIXELS, 0],
    [GL.UNPACK_SKIP_ROWS, 0],
  ]);
  const calls: unknown[][] = [];
  const props = uploaded ? { __webglTexture: {}, __version: tex.version } : {};
  const r: SubImageRenderer = {
    getContext: () => GL,
    properties: { get: () => props },
    state: {
      bindTexture: () => {},
      pixelStorei: (k, v) => void pixel.set(k, v),
      getParameter: (k) => pixel.get(k),
      texSubImage2D: (...a: unknown[]) => {
        calls.push(a);
        const [, , x, y, w, h, , , src] = a as [
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          Uint16Array,
        ];
        const rowLen = (pixel.get(GL.UNPACK_ROW_LENGTH) as number) || w;
        const sx = pixel.get(GL.UNPACK_SKIP_PIXELS) as number;
        const sy = pixel.get(GL.UNPACK_SKIP_ROWS) as number;
        for (let row = 0; row < h; row++)
          for (let col = 0; col < w * comps; col++)
            gpu[((y + row) * img.width + x) * comps + col] =
              src[((sy + row) * rowLen + sx) * comps + col];
      },
    },
  };
  return { r, gpu, calls, pixel };
}

function mkTex(n: number, comps: number): THREE.DataTexture {
  const data = new Uint16Array(n * n * comps).map((_, i) => i % 65521);
  const t = new THREE.DataTexture(
    data,
    n,
    n,
    comps === 1 ? THREE.RedFormat : THREE.RGFormat,
    THREE.HalfFloatType,
  );
  t.needsUpdate = true; // version 1, "uploaded" by the fake
  return t;
}

describe('gl-subimage rect math (TASK-211)', () => {
  it('bounds → clamped texel rect, empty → null', () => {
    expect(rectFromBounds(3, 5, 7, 7, 10)).toEqual({ x: 3, y: 7, w: 3, h: 1 });
    expect(rectFromBounds(0, 9, 0, 9, 10, 2)).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(rectFromBounds(8, 12, -3, 1, 10, 1)).toEqual({ x: 7, y: 0, w: 3, h: 3 });
    expect(rectFromBounds(5, 4, 0, 1, 10)).toBeNull();
    expect(unionRect({ x: 1, y: 1, w: 2, h: 2 }, { x: 5, y: 0, w: 1, h: 1 })).toEqual({
      x: 1,
      y: 0,
      w: 5,
      h: 3,
    });
    expect(unionRect(null, null)).toBeNull();
  });

  it('DirtyRect tracks only texels whose value changed', () => {
    const a = new Uint16Array(16);
    const d = new DirtyRect();
    expect(d.set(a, 5, 0, 1, 1)).toBe(false);
    expect(d.rect).toBeNull();
    d.set(a, 6, 3, 2, 1);
    d.set(a, 13, 4, 1, 3);
    expect(d.rect).toEqual({ x: 1, y: 1, w: 2, h: 3 });
    d.clear();
    expect(d.rect).toBeNull();
  });

  it('sub upload reads exactly the rect (R and RG), restores the unpack state', () => {
    for (const comps of [1, 2]) {
      const n = 17;
      const tex = mkTex(n, comps);
      const { r, gpu, calls, pixel } = fakeRenderer(tex, comps);
      const src = (tex.image as { data: Uint16Array }).data;
      // change a block on the CPU, upload only its rect
      const rect = { x: 4, y: 9, w: 6, h: 5 };
      for (let y = rect.y; y < rect.y + rect.h; y++)
        for (let x = rect.x; x < rect.x + rect.w; x++)
          for (let c = 0; c < comps; c++) src[(y * n + x) * comps + c] = 7 + c;
      const expected = gpu.slice();
      blitRect(src, expected, n, comps, rect);
      expect(uploadTextureRect(r, tex, rect)).toBe('sub');
      expect(calls).toHaveLength(1);
      expect(Array.from(gpu)).toEqual(Array.from(expected));
      expect(pixel.get(GL.UNPACK_ROW_LENGTH)).toBe(0);
      expect(pixel.get(GL.UNPACK_SKIP_PIXELS)).toBe(0);
      expect(pixel.get(GL.UNPACK_SKIP_ROWS)).toBe(0);
      // a rect hanging over the edge is clipped
      expect(uploadTextureRect(r, tex, { x: 15, y: 15, w: 9, h: 9 })).toBe('sub');
      expect(calls[1].slice(2, 6)).toEqual([15, 15, 2, 2]);
    }
  });

  it('falls back to a full upload when the sub path cannot be used', () => {
    const tex = mkTex(8, 1);
    const v0 = tex.version;
    expect(uploadTextureRect(null, tex, { x: 0, y: 0, w: 1, h: 1 })).toBe('full');
    expect(tex.version).toBe(v0 + 1);
    // not uploaded yet
    const a = fakeRenderer(tex, 1, false);
    expect(uploadTextureRect(a.r, tex, { x: 0, y: 0, w: 1, h: 1 })).toBe('full');
    // a full upload is already pending (version moved past the uploaded one)
    const b = fakeRenderer(tex, 1);
    tex.needsUpdate = true;
    expect(uploadTextureRect(b.r, tex, { x: 0, y: 0, w: 1, h: 1 })).toBe('full');
    expect(b.calls).toHaveLength(0);
    // WebGL1-like context
    const c = fakeRenderer(tex, 1);
    c.r.getContext = () => ({});
    expect(uploadTextureRect(c.r, tex, { x: 0, y: 0, w: 1, h: 1 })).toBe('full');
    // empty rect: nothing
    expect(uploadTextureRect(c.r, tex, null)).toBe('none');
  });
});
