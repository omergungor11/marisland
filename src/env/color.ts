/** Linear-RGB helpers shared by env-state and weather (no three import → Node-testable). */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

export function hexToLinear(hex: string, out: Rgb = { r: 0, g: 0, b: 0 }): Rgb {
  const n = parseInt(hex.replace('#', ''), 16);
  out.r = srgbToLinear(((n >> 16) & 255) / 255);
  out.g = srgbToLinear(((n >> 8) & 255) / 255);
  out.b = srgbToLinear((n & 255) / 255);
  return out;
}

export function hexToSrgb(hex: string, out: Rgb = { r: 0, g: 0, b: 0 }): Rgb {
  const n = parseInt(hex.replace('#', ''), 16);
  out.r = ((n >> 16) & 255) / 255;
  out.g = ((n >> 8) & 255) / 255;
  out.b = (n & 255) / 255;
  return out;
}

/** Relative luminance of a linear rgb. */
export const luminance = (c: Rgb): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

export const lerpRgb = (a: Rgb, b: Rgb, t: number, out: Rgb): Rgb => {
  out.r = a.r + (b.r - a.r) * t;
  out.g = a.g + (b.g - a.g) * t;
  out.b = a.b + (b.b - a.b) * t;
  return out;
};
