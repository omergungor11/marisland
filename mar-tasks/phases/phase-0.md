# Phase 0: Tooling & harness

## TASK-001: Scaffold: Vite, TS, pnpm, ESLint (random ban), Prettier, Vitest, `VITE_BASE`

**Agent**: devops | **Complexity**: S | **Status**: PENDING | **Dependencies**: –

### Acceptance Criteria
- [ ] Vite configured with `base: process.env.VITE_BASE ?? '/'`
- [ ] TypeScript `strict` mode enabled with `noUncheckedIndexedAccess` off
- [ ] ESLint ban on `Math.random()` and `Date.now()` in `src/world/`, `src/life/` enforced
- [ ] Prettier configured for consistent formatting
- [ ] Vitest configured and fork-independence tests pass
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
- [ ] `pnpm preview` works under `/marisland/` path

### Notes
See ARCHITECTURE §1 (module tree) for stack rationale. Tool ban prevents non-determinism in simulation and world gen code.

---

## TASK-002: `core/`: clock, loop, scope, params, rng, noise, events, quality

**Agent**: engine | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-001

### Acceptance Criteria
- [ ] Clock runs at fixed 30 Hz; RAF-based loop with interpolation
- [ ] RNG fork-independence test passes (label-fork does not shift sibling streams)
- [ ] `simplex-noise` seeded noise function integrated
- [ ] Scope/dispose pattern implemented for GPU resource cleanup
- [ ] Params system for tunables (quality presets, budgets, visual knobs)
- [ ] Event emitter carries low-frequency signals only (`seedChanged`, `tierChanged`, etc.)
- [ ] Fixed-step count is exact; capture mode advances only via `step()`

### Notes
See ARCHITECTURE §1 (loop) and §2 (determinism). Label-fork RNG is critical for Phase 2 prop placement.

---

## TASK-003: WebGLBackend, loader, test scene, `__marisland` ready/error

**Agent**: engine | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-002

### Acceptance Criteria
- [ ] WebGL2 renderer initialized behind RendererBackend interface (future: WebGPU option)
- [ ] Three.js loader with progress reporting
- [ ] Fonts (`@fontsource` Fredoka/Nunito) preloaded synchronously
- [ ] Test scene renders (cube + lights)
- [ ] `__marisland.ready` set within ≤5 s from page load
- [ ] `__marisland.error` set if any error thrown during init
- [ ] `__marisland.step()`, `setCamera()`, `pick()`, `perf` methods exposed for testing

### Notes
See ARCHITECTURE §3 (rendering) and §9 (capture). Ready sequence drives `shots` harness timeout.

---

## TASK-004: `shots` harness: sets, manifest, contact sheet, fail checks

**Agent**: qa | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-003

### Acceptance Criteria
- [ ] `pnpm shots ci|dev|wow` command defined in package.json
- [ ] Playwright Chromium launched with SwiftShader flags (`--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`)
- [ ] Waits up to 180 s for `__marisland.ready`
- [ ] Captures PNG + optional mask frame + motion delta frame
- [ ] Writes `manifest.json` (timings, `renderer.info`, metrics, hash)
- [ ] Writes contact sheet as `contact.jpg` with labels
- [ ] Fails on: blank frame (σ < 0.02), magenta shader error, `__marisland.error`, hardPops > 0
- [ ] Runs in cloud container without errors

### Notes
See ARCHITECTURE §9 (capture params and ready sequence). `shots ci` is lightweight (4 shots, 640×360); `dev` ≈12 shots; `wow` is W1–W10 at 1920×1080.

---

## TASK-005: `ci.yml` + `deploy.yml`

**Agent**: devops | **Complexity**: S | **Status**: PENDING | **Dependencies**: TASK-001, TASK-004

### Acceptance Criteria
- [ ] `ci.yml`: install (frozen lockfile) → typecheck → lint → test → build → `shots ci --assert` → upload artifact
- [ ] PR receives shots artifact
- [ ] `deploy.yml`: runs on push to `main`, calls `upload-pages-artifact` then `deploy-pages`
- [ ] VITE_BASE environment variable set to `/marisland/` during build
- [ ] Main branch deploys to GitHub Pages

### Notes
See ARCHITECTURE §9 (CI). Build artifact stored and linked in PR checks.

---

## TASK-006: Stats overlay, `debug=` views

**Agent**: engine | **Complexity**: S | **Status**: PENDING | **Dependencies**: TASK-003

### Acceptance Criteria
- [ ] Overlay displays FPS, CPU ms per frame, call count, triangle count, program count
- [ ] `?debug=stats` toggles overlay visibility
- [ ] `?debug=mask` shows semantic colour mask (for bible §11 checks)
- [ ] `?debug=overdraw` shows depth complexity
- [ ] `?debug=wire` shows wireframe
- [ ] Values synced to manifest JSON from `renderer.info`

### Notes
See ARCHITECTURE §6 (stats overlay) and §8 (performance budget). Overlay is dev-only.

---

## TASK-007: Verify D-001 in the container; VISUAL_QA.md

**Agent**: docs | **Complexity**: S | **Status**: PENDING | **Dependencies**: TASK-003

### Acceptance Criteria
- [ ] Smoke test in the cloud container: `WEBGL_debug_renderer_info` renderer string contains SwiftShader/ANGLE; a HalfFloat + MSAA frame renders through pmndrs `postprocessing`; time for 30 frames recorded
- [ ] Result written to `mar-docs/MEMORY.md`; if D-001 must change, a new DECISIONS entry explains why
- [ ] `mar-docs/VISUAL_QA.md` created from ART_BIBLE §11 (W1–W10 + global fails) and ARCHITECTURE §9, marking which criteria are computed from the `mask` frame and which need eyes
- [ ] `mar-config/tech-stack.md` / `conventions.md` refreshed with the versions actually installed

### Notes
The renderer decision itself was made during planning (D-001, `mar-docs/RESEARCH.md`); this task only verifies it in the real container. Skill: `visual-qa`.
