# Phase 2 edit sweep — 2026-10-04 (TASK-222, low 960×540, SwiftShader)

10 seeds (7, 42, 1000, 1001, 1002, 2024, 3003, 4004, 5005, 6006) × 4 scripted logs (hill behind the
plaza, flood the harbour shore, 20 props, mixed on the 2nd island) × village/dock/island cams = 160 frames
+ 80 close-ups. Contact sheet `../shots/M13-sweep.jpg`; manifest + logs next to this file.

## Pass
- `shots edit --assert`: low 7/7, programs 9/12; medium (own driver) programs 15–17/20, calls ≤ 207/220;
  every frame byte-identical across two runs.
- Regression vs `ca9f26b`: dev 22/25 at 0 px (D-hud / D-land-hud / D-mobile-hud differ only by the new
  brush button), wow W1–W10 incl. masks 0 px.
- Undo: every seed × log → `editLog` empty, residual 42–1241 px = life agents only (terrain identical).
- 200 added props: +2…+5 calls, +5–65k tris, within budget.
- Interactive: E, drag stroke (7 cmds = one undo step), Ctrl+Z / Ctrl+Shift+Z, share URL (153 chars),
  autosave restore on reload, share URL in a fresh context.

## Defects (severe → minor)

| # | Defect | Seeds | Owner |
|---|---|---|---|
| 1 | Flooding leaves cottages, stalls, bunting, wells under water (no stilts), dock root detached | 7, 42, 1002, 5005, 2024, 3003, 4004, 6006 | engine (settlement mirror) |
| 2 | `rederiveZones` recolours untouched terrace cells 13–15 u outside the brush (meadow → rock/cliff) | 2024 | worldgen |
| 3 | Hills on the shore bury the dock root / extend the coast (product case: dock lift or warning) | 1000, 1001 | worldgen/engine |
| 4 | `selftest=regen` at `cam=village` −1 geometry on 3/3 seeds; `edit` +1 on 1001 (plateau, not a leak) | 1001, 42, 4004 | engine |
| 5 | Pre-existing: seed 42 `island:Hearthholm` 129/120 calls (low), 260/220 (medium); medium gpuMemoryMB 91–118/90 | 42; all | engine/shader |
| 6 | `worldHash` ignores edits (manifest cannot tell edited worlds apart); raise stacks into a balloon dome; no "edited" hint outside edit mode | — | engine/worldgen/ui |
