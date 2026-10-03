/* eslint-disable no-console */
/**
 * Program inventory (shader budget audit): `tsx scripts/programs-dump.ts <base> <query> [frames]`
 * Hooks three's __THREE_DEVTOOLS__ to grab the renderer and lists `renderer.info.programs`
 * (name, usedTimes, cache key head) at ready and after N more frames.
 */
import { chromium } from 'playwright';

const [base, query, framesArg] = process.argv.slice(2);
const frames = Number(framesArg ?? 60);
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const w = /quality=low/.test(query) ? 1280 : 1920;
const page = await browser.newPage({ viewport: { width: w, height: (w * 9) / 16 } });
await page.addInitScript(() => {
  const t = new EventTarget();
  t.addEventListener('observe', (e) => {
    const d = (e as CustomEvent).detail as { isWebGLRenderer?: boolean };
    if (d?.isWebGLRenderer) (globalThis as unknown as { __r: unknown }).__r = d;
    if ((d as { isScene?: boolean })?.isScene)
      (globalThis as unknown as { __s: unknown }).__s ??= d;
  });
  (globalThis as unknown as { __THREE_DEVTOOLS__: EventTarget }).__THREE_DEVTOOLS__ = t;
});
page.on('console', (m) => {
  if (m.type() === 'error') console.log('console error:', m.text().slice(0, 200));
});
await page.goto(`${base}?${query}`);
await page.waitForFunction(
  '!!(window.__marisland && (window.__marisland.ready || window.__marisland.error))',
  null,
  { timeout: 300_000 },
);
const dump = `(() => {
  const r = window.__r;
  return r.info.programs.map((p) => {
    const k = p.cacheKey;
    return { name: p.name, used: p.usedTimes, key: k.length > 160 ? k.slice(0, 160) + '…' : k, full: k };
  });
})()`;
type P = { name: string; used: number; key: string; full: string };
const infoExpr =
  '({...window.__marisland.info, gpu: window.__marisland.counters.gpuMemoryMB, err: window.__marisland.error})';
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, timeout: 600_000 });
const a = (await page.evaluate(dump)) as P[];
const info0 = await page.evaluate(infoExpr);
await page.evaluate(`window.__marisland.step(1/30, ${frames})`);
const b = (await page.evaluate(dump)) as P[];
const info1 = await page.evaluate(infoExpr);
const mem = await page.evaluate(
  '({...window.__r.info.memory, w: window.__r.domElement.width, h: window.__r.domElement.height})',
);
console.log(`query: ${query}`);
console.log(`ready: ${a.length} programs; after ${frames} frames: ${b.length}`);
console.log(JSON.stringify(info0));
console.log(JSON.stringify(info1));
console.log(JSON.stringify(mem));
for (const [i, p] of b.entries())
  console.log(`${String(i).padStart(2)} used=${p.used} ${p.name || '(no name)'} | ${p.key}`);
if (process.env.ATTRS) {
  const rows = await page.evaluate(`(() => {
    const r = window.__r;
    const gl = r.getContext();
    const out = [];
    for (const p of r.info.programs) {
      const a = p.getAttributes();
      out.push((p.name || '?') + ': ' + Object.entries(a).sort((x, y) => x[1].location - y[1].location).map(([n, v]) => v.location + '=' + n).join(' '));
    }
    const cur = [];
    for (let i = 0; i < 16; i++) cur.push(i + ':' + Array.from(gl.getVertexAttrib(i, gl.CURRENT_VERTEX_ATTRIB)).map((v) => +v.toFixed(2)).join('/'));
    out.push('generic: ' + cur.join(' '));
    return out;
  })()`);
  for (const r of rows as string[]) console.log(r);
}
if (process.env.MESHES) {
  const rows = await page.evaluate(`(() => {
    const out = [];
    window.__s.traverse((o) => {
      if (!o.isMesh) return;
      for (const [kind, m] of [['col', o.material], ['depth', o.customDepthMaterial]]) {
        const d = m && m.defaultAttributeValues;
        if (!d) continue;
        const miss = Object.keys(d).filter((n) => !o.geometry.attributes[n]);
        out.push(kind + ' ' + (o.name || '?') + ' [' + m.name + '] missing: ' + miss.join(','));
      }
    });
    return out;
  })()`);
  for (const r of rows as string[]) console.log(r);
}
if (process.env.FULL) for (const p of b) console.log('\n#', p.name, '\n', p.full);
await browser.close();
