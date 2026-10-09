# Project Memory

## Project Info
- Marisland: procedurally generated cute/cozy stylized archipelago in three.js (WebGL2), 5–7
  islands, zoom-revealed detail, living ambient life. Phase 1 diorama, Phase 2 sandbox building.

## Project Status
- **Planning**: COMPLETED 2026-10-03 — ARCHITECTURE.md, ART_BIBLE.md, skills, agents, PROMPT.md
- **Phase 0**: COMPLETED 2026-10-03 — CI + Pages deploy green on first push
- **Phase 1**: M1 in progress (terrain, water done; lighting/post landing), M2 worldgen in progress, M3 batcher/scatter done early

## Where I left off
- **2026-10-09 (short session, weekly limit ~4 %)**: TASK-382 partly done (haiku docs agent):
  DECISIONS backfill D-024…D-027, D-029…D-033 + new D-034 (aSpin.w tag channel), D-035 (ladder
  metric calibration), D-036 (carried-item two-slot decode — code wins over phase-3 §3); ART_BIBLE
  §1/2/4/5/6/11 touched (also fixed bloom-in c=12→17, W9 D-017→D-019). **Left**: ARCHITECTURE
  §3/§4/§10 — DONE in a follow-up (TASK-382 COMPLETED; §8 program row synced to budgets.ts 12/20/24).
  Still stale: ART_BIBLE §4 roster/W5–W7 archetype-era, ARCHITECTURE §5 "villagers", §6/§8 cite
  D-017 where D-019 is meant, §9 ladder text pre-M14b; "blob p95 4.5" not written (no source).
  D-034…D-036 dates approximate. Fixed: fixtures added live in edit mode now get their steam
  (`fixtureEmitters` + `addChimney` in world-view `after`; not covered by a shot — check by hand).
  Moved fixtures still steam at their old x/z (emitters only follow re-grounding). Full `pnpm test`
  can flake the two world/ timing tests under parallel load; they pass alone.
  TASK-381 started: ladder ×3 qualities + live set run, numbers in `mar-docs/qa/ladder-2026-10-09.md`
  (live 7/7 pass; Marketing/Design medium misses are mostly region drift > 4; drift fixed by D-037 (shadow cells out of regionDrift); medium HQ 0, Marketing 3, Design 1 step misses left).
  Pipes stepping on climbs needs a pitch channel / sloped variant (PropStore has rotY only).
  High after D-037: 12 misses (was 21); the remaining Marketing/DevOps/HQ step blobs are tall near-camera
  props sliding by parallax (lattice mast, cone), not pops — fix in the ladder camera or registration.
  **Next**: TASK-381 10-seed sweep (then close it), then M15–M18.
- **2026-10-06 (session close, orchestrator)**: Phase 3 M14 + M14b (theme-first redesign) + M14c (living
  close-up) are merged on `main` and pushed (Pages deployed). 1208 tests green; shots ci/dev/edit/wow
  green with `--assert`; new `live` set (`pnpm shots live --assert`): all 7 `L-live-<theme>` pass
  (3.2–7.2 % changed, 17–76 clusters; Coding/QA close to the 3 % line). Programs 9/17/24, D-028 budgets.
  What landed after TASK-380: TASK-383 activity sim (ambient workers by camera *target* focus, kiosk
  queues, chat pairs, carried items via two-slot mode-8 decode `aSeed = acc + 100·(slot−6) + phase`,
  theme micro-activities at fixture WORK_SPOTS; low plan workers 8), TASK-384 living surfaces (`aSpin.w`
  tag channel: 1 spin, 2/3 turbine yaw, 4+ solar tracker, negative = screen kinds; per-theme monitor
  content, rack LEDs, billboard slides, pipe pulses, window occupancy, drones in `render/drones.ts`),
  monitors angled to the windows + wall dashboards, ground polish (relief/zone-gated cliff facets,
  class-crisp borders, carved cliffs, `GroundSpec.ramp`), Design ladder target avoids the Atelier Tree.
  **Next**: TASK-381 QA (ladder ×7 × 3 qualities, 10-seed sweep, live set), TASK-382 docs (ART_BIBLE §1/2/4/5/6/11,
  DECISIONS backfill D-024…D-027 + D-029…D-033 + aSpin.w tag channel + ladder metric changes: plane
  mapping, ±1 cell slack, minLandFrac 0.05, regional drift vs 170 u; Lonely Palm 17–21 u; muted label
  colour; DevOps basalt #7A7584; blossom canopy kind; blob p95 4.5), then M15–M18 (phase-3 §8).
  **Open**: ladder misses — DevOps drift 30 u ≈ 4.9 / 21 u 4.06 (parallax on the 35 u cone, not the
  material: unlit-albedo test still 3.87), Design drift 30 u 5.34 and far 700/480 u ≈ 5.9/5.1,
  Marketing pair 250 blob 0.7 %, Research tiny-land pairs; QA inner-shore saw-tooth silhouette
  (heightfield); pipes step on steep climbs; inspection
  tower is a lot, not a landmark kind; front-row bots partly hide their angled screens; Design live
  frame shifted off the foreground pine onto the studio (2026-10-09); Research live re-aimed from the west 2026-10-09 (3 of its 4 outpost bots in frame; the hut dome hid them).
  **Git**: history rewritten 2026-10-06 so every commit is `omergungor11 <omergungor99@gmail.com>`
  (user asked to remove Claude from GitHub contributors). The cloud session's parallel 24-commit line
  (app.ts → boot/ split, QA sweep) was dropped from `main`; it is kept LOCALLY only as
  `archive/cloud-phase3` (+ `archive/claude-inspiring-pascal`, `backup/main-before-rewrite`) — never
  push those. Before any push: `git fetch` and check divergence + `%an <%ae>` of origin/main.
  Stale agent worktrees live under `.claude/worktrees/` (all merged; safe to `git worktree remove`).
- 2026-10-05 (TASK-380 M14b integration, engine): tests green on the theme-first world (hash pins
  re-done, layout hash unchanged); shots ci/dev/edit/wow green with `--assert`. W5 = Forge & Steam
  (village:devops, seed 1001), W6 = QA Lagoon (village:qa, 4004), W7 = Turbine Morning (raw cam over
  Coding, 1001), W10 = Atelier Tree in the rain (village:design, 6006). DESK_CAM on devPod lot 12.
  New content hooks: `ThemeDef.plazaDecor`, `FIXTURE_EMITTERS` (per-variant, prop render index →
  emitter `prop`), `FLOATING_FIXTURES`, `FRAMING.village.tall`, `LANDMARKS.windTurbine`. Open: a low
  horizon W5 look costs 281–373 calls on medium (> D-028 255); DevOps basalt reads as grey blotches;
  QA ring ridge shows stepped facets; T0 blob p95 4.42 (Design pine + blossom residue).
  Ladder (seed 1001, low): HQ / Coding / QA pairs pass; misses are Design 42→21 u (the ladder camera
  dollies into the Atelier Tree canopy), Research (tiny land, 480→340 p95 13.4 / pair 380), DevOps
  (drift 30 u 4.74, blob 1.9 % at 42→30, pair 380 IoU 0.908), QA drift 21 u 4.07, Marketing pair 250
  blob 0.7 %. Sheets: `mar-docs/shots/M14b.jpg`, `M14b-ladder.jpg`.
- 2026-10-05 (TASK-309 + M14 integration, engine): shots ci/dev/edit/wow green with `--assert` on
  low/medium/high (`pnpm shots <set> --quality=<q>`), programs 9/17/24, budgets D-028. Seats stand on
  `Seat.floor` (lot pivot + `floorOf(def)`), desk sit drop 0.06; LOD1 office proxies scale by
  `PropDef.lod1.size`. Open: stilt-lab seats are unreachable (door node over water, boardwalks are not
  walk-graph decks) so its interior stays empty; D-desk shows 1 typing bot (low has 6 workers); a
  scatter tree stands at the Coding devOffice door; D-campus-qa village frame crops the campus at the
  bottom; night screens read faint at T2.
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
- Shot cams / EDIT_LOGS are absolute world coords: any layout change (roster, campus) moves them —
  re-record (translate by the island-centre delta, drop rejected placements) and re-check E-* and D-desk
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
