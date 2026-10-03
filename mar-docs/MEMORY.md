# Project Memory

## Project Info
- Marisland: procedurally generated cute/cozy stylized archipelago in three.js (WebGL2), 5–7
  islands, zoom-revealed detail, living ambient life. Phase 1 diorama, Phase 2 sandbox building.

## Project Status
- **Planning**: COMPLETED 2026-10-03 — ARCHITECTURE.md, ART_BIBLE.md, skills, agents, PROMPT.md
- **Phase 0**: COMPLETED 2026-10-03 — CI + Pages deploy green on first push
- **Phase 1**: M1 in progress (terrain, water done; lighting/post landing), M2 worldgen in progress, M3 batcher/scatter done early

## Where I left off
- 2026-10-03 (session 2): Phase 0 + M1–M6 done and pushed (contact sheets `mar-docs/shots/M1–M4.jpg`); M5
  lives inside the PropBatcher. The previous session's in-progress M7/M8/M9 agent work was never committed
  and is gone — restarted from main. In flight via worktree agents: TASK-161 (`life`), TASK-171 (`shader`),
  TASK-181/182 (`engine`); next: TASK-162 (picking/reactions) and TASK-172 (weather).
- Known debts: W9 dusk water tint (water agent cut off mid-polish, partial diff committed and green),
  stair-stepped ring edges in the mask frame, D-golden foliage slightly grey-blue, no rain/mist yet.

## Important Patterns
- Pixel determinism: same URL → byte-identical PNG under SwiftShader
- Shader formulas shared with CPU have TS twins + parity tests
- Shot presets are data in `src/content/shots.ts`; both the harness (`scripts/shots.ts`) and the app read them — keep them in sync

## Known Issues / Gotchas
- Never `git stash` in the shared tree (even for a quick baseline): it removes other agents' WIP files until
  `stash pop`. Baseline via a worktree instead
- Every program is compiled twice on medium/high: `compileAsync(scene, camera)` targets the canvas (srgb) while
  frames render into the composer target (srgb-linear) → `info.programs` ≈ 2× real variants (TASK-153 finding)
- NEVER `git add -A src` (or `git add src/render`) while agents are active — it sweeps their half-done files
  into HEAD and turns CI red (happened twice). Stage explicit paths; agents never commit
- Parallel agents share ONE working tree: `pnpm shots --tag=<name> --port=<n>` gives each its own `dist-<tag>/` and
  `shots/<set>-<tag>/`; `git add src/render` can sweep up another agent's half-done files — add paths explicitly
- `.claude/worktrees/` (Agent isolation=worktree) sits inside the repo: ignored in eslint/prettier/git
- CSS: a second `animation` on an element replaces a `forwards`-filled pop animation → element vanishes / inline
  transform ignored. Animate an inner span, or add a `.shown` class that sets final styles after the pop
- PropBatcher: the first `setTier`/ground-cover reveal must be instant (before the first frame) or `hardPops` > 0
- SwiftShader leaves sub-pixel cracks even on bit-identical shared chunk edges → terrain skirts 0.15 u below edge
- Water fogs itself with the FogExp2 curve (`1-exp(-(d·dist)²)`); keep `SHARED.uFogDensity` = scene.fog.density
- Spring k=180,c=12 overshoots 21 %; bible's "8 %/300 ms" needs c=17 (D-008)
- three r186: `PCFSoftShadowMap` removed; `THREE.Clock` deprecated
- pmndrs `postprocessing@6.39.5` needs three `<0.187` — don't bump three
- SwiftShader fps is meaningless; assert counts from `renderer.info`
- Art bible W-shot seeds (1001, 2024, …) are placeholders until TASK-113 pins real ones
- **SMOKE-001 (2026-10-03):** Chromium 141 + Playwright 1.56 + SwiftShader: HalfFloat + MSAA render through pmndrs EffectComposer identical to low-quality path; 30 frames ≈9 ms CPU; determinism OK (same frame byte-identical); ready time ≈200 ms; KHR_parallel_shader_compile not supported (warning only)
- Playwright CDN unreachable from container; 1.56 stays pinned; cannot upgrade to 1.63
- `pnpm shots --port=<n>` reuses a port that is already served by *another* agent's preview ("already served
  (not ours)") → wrong build gets captured. Every parallel agent needs a unique port
- Camera: a pose set via `setLookAt` is not clamped, but the next rotate is → preset poses must sit inside
  `pitchBand()` or the first input snaps the pitch
- CSS: unitless `0` inside `calc()` in `translate()` invalidates the whole transform — use `0vmax`
- World timing tests (`< 150 ms`, "full world generation time") are wall-clock: they fail under load
  (parallel shots runs); re-run `pnpm vitest run src/world` on an idle machine before calling it a regression

> Rules: read at session start; update gotchas/patterns as discovered; delete stale info; keep it
> short. Architecture decisions go to DECISIONS.md, not here.
