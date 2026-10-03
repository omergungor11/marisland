import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateWorld } from '../index.ts';
import { renderMinimapPng } from './minimap.ts';

/** Visual self-check: `MAR_MINIMAP=1 pnpm vitest run src/world/debug` → shots/tmp/minimap-<seed>.png */
const enabled = Boolean(process.env.MAR_MINIMAP);
const SEEDS = (process.env.MAR_MINIMAP_SEEDS ?? '1001,2024,3003,4004,5005,6006')
  .split(',')
  .map(Number);

describe.skipIf(!enabled)('minimap (MAR_MINIMAP)', () => {
  it('writes shots/tmp/minimap-<seed>.png', () => {
    mkdirSync('shots/tmp', { recursive: true });
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      const png = renderMinimapPng(w, { discs: process.env.MAR_MINIMAP === 'discs' });
      writeFileSync(`shots/tmp/minimap-${seed}.png`, png);
      const focus = process.env.MAR_MINIMAP_FOCUS;
      const isl = focus ? w.islands.find((i) => i.archetype === focus) : undefined;
      if (isl)
        writeFileSync(
          `shots/tmp/minimap-${seed}-${focus}.png`,
          renderMinimapPng(w, {
            scale: 6,
            window: { cx: isl.cx, cz: isl.cz, half: isl.reach + 30 },
          }),
        );
      console.info(
        `seed ${seed}: ` +
          w.islands
            .map((i) => `${i.name}=${i.archetypeName}@${i.cx.toFixed(0)},${i.cz.toFixed(0)}`)
            .join(' '),
      );
      expect(png.length).toBeGreaterThan(1000);
    }
  });
});

describe('minimap', () => {
  it('renders a PNG of the grid size', () => {
    const w = generateWorld(7, { islands: 1 });
    const png = renderMinimapPng(w, { scale: 1 });
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
  });
});
