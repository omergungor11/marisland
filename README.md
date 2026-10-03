# Marisland

A cute, cozy, fully procedural 3D archipelago in the browser — built with three.js.
5–7 hand-crafted-looking islands generated from a seed: zoom in and the world blooms open,
from island silhouettes down to crabs scuttling on the beach. Living boats, gulls, villagers,
day/night and weather. No downloaded assets: every mesh and texture is generated in code.

**Live demo:** https://omergungor11.github.io/marisland/ *(available once Phase 0 ships)*

## Status

Planning complete — development in progress.

| Doc | What |
|---|---|
| [`mar-docs/ART_BIBLE.md`](mar-docs/ART_BIBLE.md) | Look & motion: palette, islands, props, zoom tiers, animation, reference shots |
| [`mar-plans/ARCHITECTURE.md`](mar-plans/ARCHITECTURE.md) | Systems: world generation, rendering, LOD, capture/QA, budgets, phases |
| [`mar-tasks/task-index.md`](mar-tasks/task-index.md) | Task board |

## Stack

Vite · TypeScript · three.js r186 (WebGL2) · pmndrs postprocessing · camera-controls ·
Vitest · Playwright (headless screenshot QA)

```bash
pnpm install
pnpm dev
```
