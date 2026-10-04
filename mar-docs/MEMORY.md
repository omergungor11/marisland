# Project Memory

## Project Info
- Marisland: procedurally generated cute/cozy stylized archipelago in three.js (WebGL2), 5–7
  islands, zoom-revealed detail, living ambient life. Phase 1 diorama, Phase 2 sandbox building.

## Project Status
- **Planning**: COMPLETED 2026-10-03 — ARCHITECTURE.md, ART_BIBLE.md, skills, agents, PROMPT.md
- **Phase 0**: COMPLETED 2026-10-03 — CI + Pages deploy green on first push
- **Phase 1**: M1 in progress (terrain, water done; lighting/post landing), M2 worldgen in progress, M3 batcher/scatter done early

## Where I left off
- 2026-10-04: Phase 2 (sandbox) M11–M13 implemented on `claude/inspiring-pascal-19nwjr` and polished
  after the edit sweep (`mar-docs/qa/edit-sweep-2026-10-04.md`); sets ci/dev/edit/wow green with
  `--assert` (incl. gpuMemoryMB, now real and asserted — D-022), 6 self-tests. Sheets:
  `mar-docs/shots/M13-edit.jpg`, `M13-sweep.jpg`.
- Merged to `main` 2026-10-04 with the user's approval (D-023: main's parallel session-1 line superseded,
  kept in history). Still owed by the user: real-GPU checks (M1 60 fps high, phone 30 fps medium, `?perf=1`).
- Open items: villagers/sheep/crabs still walk onto flooded ground (walk graph built once); the lighthouse
  beam does not follow a reshaped lighthouse; high-quality composer `outputBuffer` carries MSAA×4 for
  nothing (~95 MB at 1080p); T0 tree-blob groups per island × variant (~18 calls); landmarks are not in
  `EDIT_BRUSH.protect`; no "edited" hint outside edit mode; rejected-brush reasons (`dock`/`plaza`) have
  no UI text; Phase 1 debts still listed in the 2026-10-03 note below are unchanged.
- Phase 1 debts (2026-10-03): D10 stepped beach/cliff bands; W5 camera looks along the steam plume;
  portrait overview ~1700 u fogs pale; W9 no sun glint; `marGridUv` ±1 u at the world edge; boats sample
  content SWELL on CPU (rain float ~0.06 u); high quality has no program headroom (24/24).

## Important Patterns
- Pixel determinism: same URL → byte-identical PNG under SwiftShader
- Shader formulas shared with CPU have TS twins + parity tests
- Shot presets are data in `src/content/shots.ts`; both the harness (`scripts/shots.ts`) and the app read them — keep them in sync

## Known Issues / Gotchas
- Picking/reactions (TASK-162): `src/interact/` (pure `picking.ts`, per-world `interaction.ts`), `src/anim/` (pose maths +
  matrix writer), bursts in `src/render/particles/bursts.ts`. `api.pick/hover/click(x, y)` (canvas CSS px) are the capture
  hooks. Reaction matrices must be written after `life.update` (interaction runs after the world view); prop reactions
  use partial `addUpdateRange`, agent meshes are re-uploaded whole every frame so never add ranges to them
- `pkill -f` from an agent shell matches the shell itself (exit 144) — kill preview servers by pid
- Two angle conventions: anchors / `rotY` are xz angles (cos, sin); camera-controls azimuth puts the camera at
  (sin az, cos az). `rotY + 180°` is NOT an azimuth (mirrors about x = z, D1) — use `azimuthToward(rotY)`
  (`camera/framing.ts`). Camera presets are fits over generated points (`camera/poses.ts`, D-017); the pure
  pose maths runs in vitest against generated worlds (`poses.test.ts`)
- FOV 35°: a horizon is in frame only when the camera looks down < 17.5° (top third: 6–17.5°)
- Never `git stash` in the shared tree (even for a quick baseline): it removes other agents' WIP files until
  `stash pop`. Baseline via a worktree instead
- Prewarm compiles against the composer target (fixed in app.ts): `programs` at ready == after 60 frames (checked
  in the D-016 audit). Program inventory: `tsx scripts/programs-dump.ts <url> "<query>"` (FULL=1 keys,
  ATTRS=1 attribute locations + generic values, MESHES=1 meshes relying on default attributes)
- three `defaultAttributeValues` are applied only at VAO build and generic attribute values are context state →
  any attribute that may be missing from a geometry needs a fixed `layout(location)` (`ATTR_LOCATION`, D-016),
  otherwise another program's default leaks in (fish were black for that reason)
- Program key gotchas: `instanceColor` present/absent, `transparent` (opaque flag), Mesh vs InstancedMesh and a
  missing `normal` each split a program even with the same `customProgramCacheKey`
- The session scratchpad is shared by all agents: use a unique sub-dir (e.g. `prog-base-wow/`), not `base-wow/`
- NEVER `git add -A src` (or `git add src/render`) while agents are active — it sweeps their half-done files
  into HEAD and turns CI red (happened twice). Stage explicit paths; agents never commit
- Parallel agents share ONE working tree: `pnpm shots --tag=<name> --port=<n>` gives each its own `dist-<tag>/` and
  `shots/<set>-<tag>/`; `git add src/render` can sweep up another agent's half-done files — add paths explicitly
- `.claude/worktrees/` (Agent isolation=worktree) sits inside the repo: ignored in eslint/prettier/git. The
  harness may create the worktree from an OLD commit (not the orchestrator's HEAD) → tell every worktree agent
  to `git merge <orchestrator-branch>` before editing, and verify with `git log -1`
- Agent worktrees were created from `origin/main` (not the orchestrator's HEAD) on 2026-10-04: every
  worktree agent must `git fetch` + `git reset --hard <orchestrator-branch>` (not merge) when its base has
  unrelated history, then verify `git log -1`
- `renderer.info.memory.geometries` counts a geometry from its FIRST DRAW: leak checks must draw every
  scene object once (forced visible, culling off) before counting, or hidden/culled life meshes read ±1
- Zones are generated before settlements terrace lots / carve docks, so `world.zone` is stale there (20–80
  samples per world); recomputing after settlements would change every hash and shot — edits re-derive
  shore-driven changes only (D-020 addendum)
- Stale `vite preview` servers from other agents can hold a port for an hour: pick a port, check it is
  free (`curl -s localhost:<p>` fails), never reuse another agent's
- A second WebGL context's synchronous calls (context creation, `readPixels`) wait for the main context's
  queued frames (0.9–2.5 s under SwiftShader) — do such work at idle time, once, and cache
- Swap textures in shared uniforms by reference, never `texture.clone()` (a clone is a second GPU texture
  that survives regen → `selftest=regen` leaks 5→6)
- `selftest=regen` / `selftest=edit` report a ±1 geometry delta with `cam=village` (pre-existing, not with
  `cam=overview` where the harness runs them) — open item
- The first `gl.texSubImage2D` of a session stalls until the in-flight frame finishes (50–950 ms under
  SwiftShader) → the rebuild path is prewarmed at idle time after `ready` (interactive mode only)
- `PickHit.id` for props is the edit-model id (scatter index / ≥ 2²⁰ for edit-added / −1 settlement);
  the render-store slot is `instanceIndex`
- `freeze=1` + `api.edit` steps the loop once per command: compare frames only at equal step counts
  (`step(1/30, n)`), never "before" vs "after" directly
- Vertex attribute limit: a 17th attribute fails to link under SwiftShader/ANGLE — pack per-instance data
  into vec4s (`aGait`) and share materials (D-013)
- CSS: a second `animation` on an element replaces a `forwards`-filled pop animation → element vanishes / inline
  transform ignored. Animate an inner span, or add a `.shown` class that sets final styles after the pop
- PropBatcher: the first `setTier`/ground-cover reveal must be instant (before the first frame) or `hardPops` > 0
- SwiftShader leaves sub-pixel cracks even on bit-identical shared chunk edges → terrain skirts 0.15 u below edge
- Water fogs itself with the FogExp2 curve (`1-exp(-(d·dist)²)`); keep `SHARED.uFogDensity` = scene.fog.density
- Spring k=180,c=12 overshoots 21 %; bible's "8 %/300 ms" needs c=17 (D-008)
- `InstancedMesh.dispose()` frees the instance matrix only — dispose `.geometry` yourself (the regen leak
  99→130 geometries was contact-blob `InstancedBufferGeometry`s)
- Regen: keep the OLD world's materials alive until the new world's `compileAsync` finished, then dispose
  them — otherwise three re-links every program (1218 → 144 ms over 3 regens)
- Context loss: dispose the world WHILE the context is lost (after restore it spams "object does not belong
  to this context"); `restoreContext()` must not be called from a microtask inside the lost event (wait a
  `setTimeout(0)`); `gl.finish` does not sync under SwiftShader (use a 1-px `readPixels`)
- `scripts/shots.ts` runs `selftest=regen` + `selftest=ctxloss` on the first preset of ci/dev (~15 s);
  `--no-selftest` skips
- Water foam-trail texture is 256 texels over 384 u (3 u/texel): never splat anything < 2 u wide into it
  (the sailboat wake became a 10 u smear) — fine foam goes through instanced discs on the creature program
- `geo/buildings.ts` keeps its own per-variant palette; `content/settlements.ts` `LOT_ROOFS` mirrors it (a
  test checks counts, not colours) — change both together
- three r186: `PCFSoftShadowMap` removed; `THREE.Clock` deprecated
- pmndrs `postprocessing@6.39.5` needs three `<0.187` — don't bump three
- pmndrs `BloomEffect` defaults to `BlendFunction.SCREEN` → rings around HDR sources; use ADD (D-012)
- Sky stars on an (az·cos el, el) grid shear into streaks; use per-row cells with an integer count
  around the sky; stars < ~1.5 px alias into diagonal dashes under FXAA
- Night grade + flat-shaded facets: a luminance-only "spare highlights" test flips facets of lamp-lit
  ground between warm and blue → spare by hue (r − b) too
- `renderer.compileAsync(scene)` compiles EVERY mesh's material (`scene.traverse`, not
  `traverseVisible`): a hidden mesh still costs a program in `info.programs`
- Sharing one ShaderMaterial between meshes only shares the program if the geometries agree on
  program-keyed attributes: a missing `normal` (`vertexNormals`) compiled a 2nd program (rain on
  the puff material, TASK-172)
- Weather: a fully clear blend must stay the exact identity (clear shots 0 px diff vs pre-weather);
  guard new weather terms with `if (uX > 0.0)` / identity multipliers, not approximations
- SwiftShader fps is meaningless; assert counts from `renderer.info`
- Art bible W-shot seeds (1001, 2024, …) are placeholders until TASK-113 pins real ones
- **SMOKE-001 (2026-10-03):** Chromium 141 + Playwright 1.56 + SwiftShader: HalfFloat + MSAA render through pmndrs EffectComposer identical to low-quality path; 30 frames ≈9 ms CPU; determinism OK (same frame byte-identical); ready time ≈200 ms; KHR_parallel_shader_compile not supported (warning only)
- Playwright CDN unreachable from container; 1.56 stays pinned; cannot upgrade to 1.63
- `pnpm shots --port=<n>` reuses a port that is already served by *another* agent's preview ("already served
  (not ours)") → wrong build gets captured. Every parallel agent needs a unique port
- Camera: a pose set via `setLookAt` is not clamped, but the next rotate is → preset poses must sit inside
  `pitchBand()` or the first input snaps the pitch
- CSS: unitless `0` inside `calc()` in `translate()` invalidates the whole transform — use `0vmax`
- Wall-clock perf tests use `perfLimit()` (`src/test/perf.ts`): ×2 under `CI` (2-core runners), ×1 locally,
  `MAR_PERF_SCALE=0` disables them; on a loaded container re-run `pnpm vitest run src/world` alone before
  calling a failure a regression (best-of-N already filters worker contention)

> Rules: read at session start; update gotchas/patterns as discovered; delete stale info; keep it
> short. Architecture decisions go to DECISIONS.md, not here.
