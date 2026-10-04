import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bytesPerTexel, renderTargetBytes, textureBytes } from './gpu-memory.ts';

describe('gpu memory (D-022)', () => {
  it('bytes per texel from format × type', () => {
    const t = (format: THREE.AnyPixelFormat, type: THREE.TextureDataType): THREE.Texture => {
      const x = new THREE.Texture();
      x.format = format;
      x.type = type;
      return x;
    };
    expect(bytesPerTexel(t(THREE.RGBAFormat, THREE.UnsignedByteType))).toBe(4);
    expect(bytesPerTexel(t(THREE.RGBAFormat, THREE.HalfFloatType))).toBe(8);
    expect(bytesPerTexel(t(THREE.RedFormat, THREE.HalfFloatType))).toBe(2);
    expect(bytesPerTexel(t(THREE.RGFormat, THREE.UnsignedByteType))).toBe(2);
    expect(bytesPerTexel(t(THREE.DepthFormat, THREE.UnsignedIntType))).toBe(4);
    expect(bytesPerTexel(t(THREE.DepthStencilFormat, THREE.UnsignedInt248Type))).toBe(4);
  });

  it('data textures: size × texel, +⅓ with a mip chain', () => {
    const d = new THREE.DataTexture(new Uint8Array(64 * 32 * 2), 64, 32, THREE.RGFormat);
    expect(textureBytes(d)).toBe(64 * 32 * 2);
    d.generateMipmaps = true;
    d.minFilter = THREE.LinearMipmapLinearFilter;
    expect(textureBytes(d)).toBeCloseTo((64 * 32 * 2 * 4) / 3, 6);
  });

  it('render targets: colour + depth, MSAA renderbuffers × samples', () => {
    const rt = new THREE.WebGLRenderTarget(100, 50, { type: THREE.HalfFloatType });
    // RGBA16F + depth renderbuffer (4 B)
    expect(renderTargetBytes(rt)).toBe(100 * 50 * (8 + 4));
    rt.samples = 4;
    expect(renderTargetBytes(rt)).toBe(100 * 50 * (8 + 4) * 5);
    const shadow = new THREE.WebGLRenderTarget(64, 64);
    shadow.depthTexture = new THREE.DepthTexture(64, 64, THREE.UnsignedIntType);
    expect(renderTargetBytes(shadow)).toBe(64 * 64 * (4 + 4));
    rt.dispose();
    shadow.dispose();
  });
});
