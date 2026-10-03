/* eslint-disable no-console */
/** `tsx scripts/pixdiff.ts <dirA> <dirB>`: exact differing-pixel count for every PNG present in both. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';

const [a, b] = process.argv.slice(2);
for (const f of readdirSync(a)
  .filter((n) => n.endsWith('.png'))
  .sort()) {
  const pb = resolve(b, f);
  if (!existsSync(pb)) {
    console.log(`${f}: missing in B`);
    continue;
  }
  const A = PNG.sync.read(readFileSync(resolve(a, f)));
  const B = PNG.sync.read(readFileSync(pb));
  if (A.width !== B.width || A.height !== B.height) {
    console.log(`${f}: size differs`);
    continue;
  }
  let n = 0;
  let max = 0;
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < A.data.length; i += 4) {
    let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.data[i + c] - B.data[i + c]));
    if (d > 0) {
      n++;
      const x = (i / 4) % A.width;
      const y = Math.floor(i / 4 / A.width);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    max = Math.max(max, d);
  }
  const box = n ? ` bbox ${x0},${y0}–${x1},${y1}` : '';
  console.log(`${f}: ${n} px differ (max channel delta ${max})${box}`);
}
