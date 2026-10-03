/** Pure image metrics for the shots harness (raw RGBA/RGB pixel buffers). */
export interface ImageMetrics {
  meanLum: number;
  lumSigma: number;
  /** Fraction of pixels within ±8 of (255,0,255). */
  magentaFrac: number;
  /** 16-bin hue histogram, fractions of all pixels (saturated, non-dark pixels only). */
  hueHist: number[];
}

export function computeMetrics(data: Uint8Array, channels: number): ImageMetrics {
  const n = Math.floor(data.length / channels);
  let sum = 0;
  let sum2 = 0;
  let magenta = 0;
  const hist = new Array<number>(16).fill(0);
  for (let i = 0; i < n; i++) {
    const r = data[i * channels];
    const g = data[i * channels + 1];
    const b = data[i * channels + 2];
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    sum += lum;
    sum2 += lum * lum;
    if (r >= 247 && g <= 8 && b >= 247) magenta++;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (max > 25 && d / max > 0.15) {
      let h: number;
      if (max === r) h = ((g - b) / d + 6) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      hist[Math.min(15, Math.floor((h / 6) * 16))]++;
    }
  }
  const mean = n ? sum / n : 0;
  return {
    meanLum: mean,
    lumSigma: Math.sqrt(Math.max(0, (n ? sum2 / n : 0) - mean * mean)),
    magentaFrac: n ? magenta / n : 0,
    hueHist: hist.map((c) => (n ? c / n : 0)),
  };
}

export function isBlank(m: ImageMetrics): boolean {
  return m.lumSigma < 0.02;
}

export function isMagenta(m: ImageMetrics): boolean {
  return m.magentaFrac > 0.02;
}
