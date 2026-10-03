# Tech Stack

> Versions verified on npm 2026-10-03. Major upgrades go to `mar-docs/DECISIONS.md`.

## Runtime
- Node ≥ 22.12 (Vite 8 needs ≥ 20.19 / ≥ 22.12), pnpm
- Browser target: evergreen with WebGL2 (desktop Chrome/Safari/Firefox, iOS Safari 16+, Android Chrome)

## App
- `three@0.186.1` — **exact pin** (pmndrs `postprocessing` peer range is `<0.187`)
- `@types/three@0.186.0`
- `postprocessing@6.39.5` (pmndrs) — bloom, tilt-shift, DOF, vignette, tone mapping, SMAA/FXAA
- `camera-controls@3.1.2` — damping, dolly-to-cursor, boundary box, `fitToSphere`, touch
- `simplex-noise@4.0.3` + inline seeded PRNG (sfc32/mulberry32) in `core/rng.ts`
- `@fontsource/fredoka`, `@fontsource/nunito` — self-hosted fonts (deterministic offline captures)
- Optional, only when needed: `three-custom-shader-material@6.4.0` (if `onBeforeCompile` patching
  gets fragile), `n8ao@2.0.1` (AO, high tier only)
- UI: plain DOM + CSS (no framework); inline SVG icons

## Tooling
- `vite@8.3.2`, `typescript` (7.x if `typescript-eslint`'s peer range accepts it, else `6.0.3`) —
  strict mode
- ESLint (flat config, `typescript-eslint`) + Prettier; custom rule: no `Math.random` /
  `Date.now` / `performance.now` in `src/world`, `src/life`, `src/core/rng*`
- Dev-only: `lil-gui@0.21.0`, `stats-gl@4.2.3`, `spectorjs@0.9.33`

## Testing
- `vitest` — world-gen determinism snapshots, property tests, shader-formula TS twins
- `@playwright/test@1.63.0` (Chromium 153; WebGL2 via SwiftShader headless) — `scripts/shots.ts`
- `pixelmatch@7.2.0` — determinism / motion diffs; `sharp` or canvas for contact sheets

## Infrastructure
- GitHub Actions: `ci.yml` (typecheck → lint → test → build → `shots ci --assert`, artifact upload),
  `deploy.yml` (build with `VITE_BASE=/marisland/` → GitHub Pages)
- Hosting: GitHub Pages — https://omergungor11.github.io/marisland/
