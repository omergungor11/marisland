# Tech Stack

> Versions verified on npm 2026-10-03. Major upgrades go to `mar-docs/DECISIONS.md`.

## Runtime
- Node ≥22.12 (pnpm@10.28.0), pnpm@10.28.0
- Browser target: evergreen with WebGL2 (desktop Chrome/Safari/Firefox, iOS Safari 16+, Android Chrome)

## App
- `three@0.186.1` — **exact pin** (pmndrs `postprocessing` peer range is `<0.187`)
- `@types/three@0.186.0`
- `postprocessing@6.39.5` — bloom, tilt-shift, DOF, vignette, tone mapping, SMAA/FXAA
- `camera-controls@3.1.2` — damping, dolly-to-cursor, boundary box, `fitToSphere`, touch
- `simplex-noise@4.0.3` + inline seeded PRNG (sfc32/mulberry32) in `core/rng.ts`
- `@fontsource/fredoka@5.3.0`, `@fontsource/nunito@5.3.0` — self-hosted fonts (deterministic offline)
- UI: plain DOM + CSS (no framework); inline SVG icons

## Tooling
- `vite@8.3.2`, `typescript@6.0.3` (peer range `<6.1` from `typescript-eslint@8.71.0`), strict mode
- `eslint@10.12.0` + `typescript-eslint@8.71.0` + `prettier@3.9.9` (flat config)
  - Custom rule: no `Math.random` / `Date.now` / `performance.now` in determinism-critical dirs
- Dev-only: `lil-gui@0.21.0`

## Testing & capture
- `vitest@5.0.3` — world-gen snapshots, property tests, shader-formula twins
- `playwright@1.56.0` (library, not `@playwright/test` — CDN unreachable from container) — Chromium 141
  - SwiftShader via `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`
- `pixelmatch@7.2.0`, `sharp@0.35.5`, `pngjs@7.0.0` — determinism diffs, contact sheets

## Build scripts
- `tsx@4.23.15` — TypeScript runner for `scripts/shots.ts`

## Infrastructure
- GitHub Actions: `ci.yml` (typecheck → lint → test → build → `shots ci --assert`, artifact),
  `deploy.yml` (build with `VITE_BASE=/marisland/` → GitHub Pages)
- Hosting: GitHub Pages (https://omergungor11.github.io/marisland/)
