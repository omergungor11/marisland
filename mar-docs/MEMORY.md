# Project Memory

## Project Info
- Marisland: procedurally generated cute/cozy stylized archipelago in three.js (WebGL2), 5–7
  islands, zoom-revealed detail, living ambient life. Phase 1 diorama, Phase 2 sandbox building.

## Project Status
- **Planning**: COMPLETED 2026-10-03 — ARCHITECTURE.md, ART_BIBLE.md, skills, agents, PROMPT.md
- **Phase 0**: IN PROGRESS — TASK-001/002/003 done (scaffold, core loop, WebGL backend + test scene); TASK-004/005/006/007 in progress

## Where I left off
- (Update at the end of every session: last finished task, what's half-done, next step.)

## Important Patterns
- Pixel determinism: same URL → byte-identical PNG under SwiftShader
- Shader formulas shared with CPU have TS twins + parity tests
- Shot presets are data in `src/content/shots.ts`; both the harness (`scripts/shots.ts`) and the app read them — keep them in sync

## Known Issues / Gotchas
- three r186: `PCFSoftShadowMap` removed; `THREE.Clock` deprecated
- pmndrs `postprocessing@6.39.5` needs three `<0.187` — don't bump three
- SwiftShader fps is meaningless; assert counts from `renderer.info`
- Art bible W-shot seeds (1001, 2024, …) are placeholders until TASK-113 pins real ones
- **SMOKE-001 (2026-10-03):** Chromium 141 + Playwright 1.56 + SwiftShader: HalfFloat + MSAA render through pmndrs EffectComposer identical to low-quality path; 30 frames ≈9 ms CPU; determinism OK (same frame byte-identical); ready time ≈200 ms; KHR_parallel_shader_compile not supported (warning only)
- Playwright CDN unreachable from container; 1.56 stays pinned; cannot upgrade to 1.63

> Rules: read at session start; update gotchas/patterns as discovered; delete stale info; keep it
> short. Architecture decisions go to DECISIONS.md, not here.
