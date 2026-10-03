import { it } from 'vitest';
import { generateWorld } from '../../world/index.ts';
import { buildColorGrid } from './terrain-colors.ts';
it('ao stats', () => {
  const w = generateWorld(1001);
  const g = buildColorGrid(w);
  const bins = new Array(6).fill(0);
  let land = 0;
  for (let i = 0; i < g.ao.length; i++) {
    if (w.height.data[i] <= 0) continue;
    land++;
    const occ = (1 - g.ao[i]) / 0.25;
    bins[Math.min(5, Math.floor(occ * 5))]++;
  }
  console.log(
    'land',
    land,
    'occl bins (0..1 in 5 + full)',
    bins.map((b) => ((b / land) * 100).toFixed(1) + '%').join(' '),
  );
});
