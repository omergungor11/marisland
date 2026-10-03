---
name: visual-qa
description: Use after ANY change that affects what Marisland looks or moves like, at every milestone exit, and before calling a visual task done. Explains how to capture deterministic screenshots headless (Playwright + SwiftShader, no GPU), how to actually look at them critically, the common stylized-three.js failure signatures and their likely causes, motion and budget checks, and the report format.
---

# Visual QA

"It compiles" and "the test passes" say nothing about whether it is beautiful. In this project a
visual task is only done when you have **looked at the pixels** and compared them with
`mar-docs/ART_BIBLE.md` §11 (and `mar-docs/VISUAL_QA.md` once it exists).

## Loop

1. `pnpm shots dev` (milestone) or `pnpm shots ci` (quick check). Use `wow` only at milestone
   exits — it is slow under SwiftShader.
2. `Read` the generated `contact.jpg` first (one image, all shots labelled).
3. Open single PNGs only where something looks off, or for the shot your change targets.
4. Score each shot against its criteria → PASS/FAIL with a one-line observation.
5. Compare with the previous contact sheet (`mar-docs/shots/M<n-1>.jpg`): name at least three
   concrete visible differences. If you cannot name them, the change did not land.
6. Milestone exit: copy the contact sheet to `mar-docs/shots/M<n>.jpg` and commit it.

## Headless capture (cloud container, no GPU)

Chromium renders WebGL2 on the CPU through SwiftShader. Playwright (1.63, Chromium 153) already
appends `--enable-unsafe-swiftshader`, and the default `chromium-headless-shell` handles WebGL2;
the explicit flags below just make it obvious and also work for a manually launched Chrome
(Chromium ≥ 137 no longer falls back to SwiftShader on its own):

```ts
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await page.goto(`${base}?seed=1001&shot=W1&freeze=1`);
await page.waitForFunction(
  () => (window as any).__marisland?.ready || (window as any).__marisland?.error,
  null, { timeout: 180_000 },
);
```

- First run in a fresh container: `pnpm exec playwright install --with-deps chromium` (fall back
  to `pnpm exec playwright install chromium` if apt is unavailable).
- Before trusting any image, check the console for WebGL context errors and confirm the renderer
  string mentions SwiftShader/ANGLE.
- SwiftShader is slow: keep `dev` at 960×540, `ci` at 640×360, `quality=low` unless the check needs
  post-processing. Its **fps numbers mean nothing** — budgets are checked as counts
  (`renderer.info`), never as frame times.
- Colours match real GPUs closely; MSAA, precision and some extensions can differ. Anything
  that depends on them must be confirmed on a real GPU (`pnpm shots dev --gpu` on the user's Mac,
  or the deployed Pages build). Flag it in the report instead of guessing.

## How to look

Do these in order, every time:

1. **Thumbnail test.** Imagine the image at 25 % size. Can you count the islands and tell them
   apart? Is there one clear focal point? Does it read as islands in a sea within one second?
2. **Rings test.** Every coast: deep → turquoise ring → foam → sand → green (bible P3).
3. **Light test.** Warm lit faces, blue-violet shade, nothing pure black, islands brighter than
   the water.
4. **Density test.** Clusters and clearings, not an even sprinkle; size variety; nothing floating
   or buried.
5. **Edge test.** Zoom into one PNG region: seams, acne, z-fighting, jaggies, flicker-prone thin
   geometry.

## Failure signatures → likely cause

| You see | Likely cause |
|---|---|
| Whole frame washed-out / grey | Colour space: vertex colours not converted to linear, wrong output colour space, or double tone mapping |
| Neon, garish colours | Saturation rule broken; tone mapping off; palette applied in the wrong space |
| Black or grey shadows | Shadow tint / hemisphere term missing; ambient too low |
| Stripes or moiré on lit terrain | Shadow acne → tune `bias` / `normalBias`; shadow camera too large |
| Objects float above their shadows | Peter-panning → bias too high |
| Flicker / zig-zag at the shoreline | Foam or water z-fighting with terrain; handle foam inside the water shader |
| Thin cracks between terrain chunks | Missing skirts or mismatched LOD edges |
| Islands look like pancakes or blobs | No shallow shelf, too little height variety, circular masks |
| Water looks like flat plastic | Depth ramp, foam bands or glints missing; no transparency where shallow |
| Hard line at the horizon | Fog missing or wrong colour (must equal the horizon colour) |
| Solid magenta / black canvas | Shader compile error / context lost — read console logs |
| Trees in a perfect even sprinkle | Cluster noise missing in scatter rules |
| Labels overlap | Screen-space collision nudge missing |

## Motion checks

Frozen frames cannot show motion, so capture pairs: same shot at `time=T` and `time=T+Δt`
(the harness `+Δt` frame). Diff them: foliage, water and creatures should change; terrain and
buildings must not. Two captures with the same parameters must be byte-identical (determinism).

## Budget checks

`manifest.json` carries `renderer.info` and counters per shot. `pnpm shots … --assert` fails on
a budget breach (`src/content/budgets.ts`), a blank frame, a shader error, `__marisland.error`, or
`counters.hardPops > 0`. A failing assert is a blocker, not a warning.

## Report format

```
Shot      Verdict  Observation
W1        PASS     6 islands, rings continuous, 2 cloud shadows
D-village FAIL     shadows near-black under eaves (L≈8%) → shader: shadow tint
...
vs previous: 1) …  2) …  3) …
Budgets: calls 143/220, tris 612k/800k, programs 11/16, hardPops 0
Needs real-GPU check: bloom halo size, MSAA on fences
Top 3 issues: …
```

Write what you saw. If you are inferring rather than seeing, say "probably".
