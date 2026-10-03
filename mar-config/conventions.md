# Code Conventions

## TypeScript
- `strict` on; `noUncheckedIndexedAccess` off (typed-array hot loops)
- No `any` — `unknown` + type guards. Interfaces for object shapes, `type` for unions
- Explicit return types on exported functions
- Files `kebab-case.ts`; one system per file; tests next to source as `*.test.ts`

## Module boundaries
- `src/world/` imports nothing from `three` or the DOM — pure data, runs in Node/Worker
- `src/content/` is data only (tables from `mar-docs/ART_BIBLE.md`); no logic beyond typing
- GLSL and anything WebGL-specific stays in `src/render/`
- Systems implement `{ init, fixedUpdate?, update?, onTier?, dispose }` and register GPU resources
  in the app or world scope

## Determinism
- Randomness only via `rng.fork(label)` / `hash(seed, …)`; never `Math.random`
- Time only via the engine clock (`clock.t`, `uTime`); never `Date.now` / `performance.now` in
  sim, gen or animation code
- No iteration over `Map`/`Set` where order affects output

## Performance
- No allocations in per-frame code (module-level scratch objects)
- Shared materials/geometries; per-instance data in instanced attributes
- New feature → state its cost (draw calls, triangles, programs) in the commit/PR body

## Shaders
- GLSL in `.glsl` files imported as strings (`?raw`) or template literals in `render/shaders/`
- Every formula shared with CPU (swell, gust, spring) has a TS twin + parity test
- Feature toggles as `#define`s, never per-frame branches on uniforms for big features

## Testing
- Gen: snapshot hashes for seeds 1, 42, 1001 + property tests over many seeds
- Visual: `pnpm shots` + review per `.claude/skills/visual-qa/SKILL.md`
- A visual task is not done without a looked-at screenshot

## Git
- Conventional commits `feat|fix|refactor|perf|docs|chore|test(scope): …`, no attribution lines
- One task per commit where possible; push at every milestone exit
