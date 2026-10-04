# Phase 2: Sandbox

Goal: edit the generated world in the browser — terrain brushes and prop place/remove/move — with
undo/redo, deterministic replay from a seed + edit log, autosave and a shareable URL. The architecture
sketch (ARCHITECTURE §10 "Phase 2") is the design; this file breaks it into tasks.

**Shared contract**: `src/world/edit-types.ts` (`EditCommand`, `EditLog`, `DirtyRegion`, `EditResult`,
`EDIT_PROP_ID_BASE`, `mergeDirty`). Every task codes against it; changes to it go through the orchestrator.

Pipeline per command: UI/stroke → `EditSession.apply(cmd)` → `applyEdit(world, cmd)` (pure, mutates
`WorldData` in place, returns inverse + dirty) → `worldView.rebuildDirty(dirty)` (chunks remeshed, height /
SDF textures `texSubImage2D`'d, PropBatcher groups rewritten) → log appended → autosave.

---

## M11 — Edit core (pure data)

### TASK-201: Edit commands, inverse, replay, log codec

**Agent**: worldgen | **Complexity**: L | **Status**: PENDING | **Dependencies**: Phase 1

### Acceptance Criteria
- [ ] `src/world/edit.ts`: `applyEdit(world, cmd): EditResult` for raise / lower / flatten / smooth / paint /
      propAdd / propRemove / propMove. Terrain brushes use a smooth radial falloff (content:
      `src/content/edit.ts` → falloff curve, max radius, max delta per stroke, smooth kernel); heights are
      clamped to `[SEABED_Y, maxY]`; cells outside the island map still edit (the user can raise new land).
- [ ] Every result carries exact `inverse` commands: terrain inverses restore the previous cell heights/zones
      (store a compact patch `{i0,j0,w,h,data}` inside a private inverse command kind, e.g. `k:'patch'`
      — allowed, add it to `edit-types.ts` via the orchestrator if needed); prop inverses are the mirror
      command. `apply(inverse)` after `apply(cmd)` restores byte-identical `height`, `zone`, `shoreSdf` and
      props (test).
- [ ] `DirtyRegion` is exact: touched cells → chunks (+ neighbours when a touched cell is on a chunk edge
      or `sdf` changed within `SDF_MARGIN` cells of the chunk border), `props` lists ids touched.
- [ ] Prop placement validation: `propAdd`/`propMove` reject (ok:false, reason) when the spot collides with
      the OccupancyGrid (reuse `world/gen` occupancy), is under water for non-`underwater` defs, is on a
      slope above the def's limit, or is outside the world; otherwise the prop is appended to
      `world.props` (grow the `PropStore` — add a `grow()` or allocate spare capacity) with id
      `EDIT_PROP_ID_BASE + n`, `y` from `heightAt`, `chunkId` set. `propRemove` of a scatter prop (id <
      base) hides it (flag bit, e.g. `PROP_FLAGS.removed`) instead of compacting the store.
- [ ] After terrain edits, props inside the region are re-grounded (`y` = heightAt) and props whose cell
      became water (non-underwater def) are removed and listed in `dirty.props` (with inverses).
- [ ] `replay(world, log): DirtyRegion` applies all commands (ids resolved deterministically);
      `encodeLog(log): string` / `decodeLog(s): EditLog` — compact, URL-safe (base64url of a delta/varint
      binary or deflate via `CompressionStream` is NOT allowed because it is async; keep it sync and pure),
      versioned (`v:1`), round-trips exactly; a 200-command log encodes under ~4 KB.
- [ ] Determinism: `generateWorld(seed)` + `replay(log)` twice → identical hashes (add `editHash`).
- [ ] Tests (`src/world/edit.test.ts`): each command's inverse round trip, dirty-region exactness, rejections,
      replay determinism, codec round trip + size, 1 000 random commands fuzz (seeded) never throws and
      keeps `height` finite.

### TASK-202: Incremental derived data

**Agent**: worldgen | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-201

### Acceptance Criteria
- [ ] After a terrain edit, `zone` is re-derived locally for the touched cells + margin using the same rules
      as generation (`world/gen/zones.ts`: beach bands by shore distance, slope → rock/cliff, keep `path` /
      `plaza` / `field` where untouched); `paint` sets the zone directly and wins over derivation until the
      height there changes again (store a `zonePainted` bit mask).
- [ ] `shoreSdf` is updated with a local EDT over the touched bounds + `SDF_MARGIN` (content) and matches a
      full recompute within 1 cell everywhere (test on 20 random edits).
- [ ] `islandMap` / `chunkFlags` (`CHUNK_HAS_LAND`, `CHUNK_HAS_SHALLOW`) are refreshed for touched chunks so
      previously deep (unmeshed) chunks become meshable when land is raised there.
- [ ] `fieldColor` / `slope` caches (if any) are kept consistent; `pathGraph` is NOT rebuilt (paths may now
      float/sink — acceptable, documented).
- [ ] Performance: a 30 u brush edit (incl. derived data) ≤ 4 ms warm in Node (test, best of 3).

---

## M12 — Live rebuild (render)

### TASK-211: Dirty-chunk rebuild within one frame

**Agent**: engine | **Complexity**: L | **Status**: PENDING | **Dependencies**: TASK-201 (contract only)

### Acceptance Criteria
- [ ] `WorldView.rebuildDirty(region: DirtyRegion): void` (in `src/render/world-view.ts`, implemented in
      `src/render/rebuild.ts`): remeshes every chunk in `region.chunks` (all LODs, AO, jitter, skirts) via a
      new `terrain.rebuildChunk(cx, cz)` that swaps geometry in place (dispose old, keep the mesh/material
      objects so instancing/program state is untouched); chunks that become meshable are created, chunks
      that become all-deep are hidden.
- [ ] Height texture (R16F) and SDF texture (RG16F, incl. the ring-scale G channel) are updated with
      `texSubImage2D` for the region bounds only (three: `texture.needsUpdate` on a sub-rect is not
      supported — use `renderer.copyTextureToTexture` or a manual `gl.texSubImage2D` via
      `renderer.getContext()` + `properties.get(texture).__webglTexture`; keep it behind one helper with a
      unit-tested fallback that re-uploads the whole texture).
- [ ] PropBatcher: `props.rewrite(ids)` updates the instance matrices of touched ids (position/rotation/
      scale/removed) and appends new instances (edit-added ids) to the right group, growing the
      `InstancedMesh` capacity when needed (reallocate with headroom from content); contact blobs and
      ground-cover follow. Removed props disappear without a pop (fade via `aAppear` reversed or instant in
      capture).
- [ ] Budget: a single 32×32 chunk rebuild ≤ 6 ms CPU on this container (log `timings.rebuildMs`, test via
      `__marisland.edit(cmd)` and reading timings); multiple dirty chunks are spread over frames (≤ 2
      chunks per frame) except in capture mode where all rebuild synchronously before the screenshot.
- [ ] `?edit=<encoded>` URL param: decoded and replayed right after `generateWorld` and before the first
      build (so no rebuild path is needed at boot); `api.edit(cmd)`, `api.undo()`, `api.redo()`,
      `api.editLog()` on `__marisland` for tests/harness.
- [ ] Water: raised land inside water reads correctly (depth ramp/foam follow the new SDF); lowered land
      floods.
- [ ] No GPU leak across 50 rebuilds (`?selftest=edit` runs 50 random brush edits + undo all and asserts
      `renderer.info.memory` returns to baseline).

### TASK-212: Brush cursor, strokes, ghost previews

**Agent**: engine | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-211, TASK-162

### Acceptance Criteria
- [ ] `src/edit/session.ts`: `EditSession` — `apply(cmd)`, `undo()`, `redo()`, `canUndo/canRedo`, `log`,
      `serialize()`, `load(log)`, `clear()`, `subscribe(cb)`; wraps `applyEdit` + `rebuildDirty`; autosave
      to localStorage (debounced 500 ms, key per seed, versioned) and restore on boot unless `?edit=` is
      given; share URL = `location` with `edit=` set (encoded log).
- [ ] `src/edit/tools.ts`: tool state (tool, radius 4–40 u, strength, zone paint, prop def + variant,
      random rotation/scale from a label-forked rng) and a stroke sampler: pointer-down starts a stroke,
      samples are emitted when the terrain hit moved ≥ `radius × 0.35` (content), each sample is one
      command; one stroke = one undo step (commands grouped).
- [ ] Brush cursor: a ring decal on the terrain (shader overlay in the terrain material via a `uBrush`
      uniform: centre, radius, strength tint, invalid = red) following the pointer at 60 Hz using the
      picking ray-march; hidden when not in edit mode.
- [ ] Ghost preview for prop tools: the selected def rendered at the cursor through the prop material with
      the dither fade (`aAppear`-style alpha 0.5), tinted red when placement is invalid (validation via a
      dry-run `applyEdit` on a cheap check function exposed by TASK-201, e.g. `canPlace(world, cmd)`).
- [ ] Reduced motion / capture: cursor and ghost are plain, no animation; `freeze=1` renders no cursor.
- [ ] Camera: while a stroke is active the camera does not pan (controls suspended), wheel still zooms.
- [ ] Tests: stroke sampler spacing/grouping, session undo/redo stack semantics, autosave key/version,
      share URL round trip (jsdom-free: pure modules).

---

## M13 — Editor UI, persistence, QA

### TASK-221: Edit panel + HUD integration

**Agent**: engine | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-212

### Acceptance Criteria
- [ ] HUD dock gains an **Edit** button (and key `E`): toggles edit mode; the dock collapses to the edit
      panel (`src/ui/edit-panel.ts`): tool row (raise, lower, flatten, smooth, paint, prop, erase, move),
      radius + strength sliders, zone paint swatches, a prop picker (grid of the placeable defs with
      procedurally rendered thumbnails — render each def once into a small offscreen canvas at boot of the
      panel, cached), undo / redo (keys `Ctrl/⌘+Z`, `Shift+Ctrl/⌘+Z`), share (copies the URL, toast
      "Link copied"), reset (confirm), and a small "edited · N changes" badge.
- [ ] Mobile (390×844 / 844×390): panel as a bottom sheet, sliders usable with touch, no overlap with
      labels/compass; one-finger drag paints when a tool is active, two fingers still navigate.
- [ ] Idle orbit, intro and governor tier-cap are suspended in edit mode; photo mode exits edit mode.
- [ ] Shots: new `edit` shot set (`pnpm shots edit`) with `?edit=` logs that raise a hill, flood a bay,
      paint a meadow, place 20 props — presets in `src/content/shots.ts`, `panel=edit` shows the panel.
      All deterministic; dev set unchanged (0 px) when no edit is given.
- [ ] README: Sandbox section (controls, URL `edit=`), ART_BIBLE/ARCHITECTURE updated where behaviour
      differs from the sketch; DECISIONS entry for the storage/codec choice.

### TASK-222: Phase 2 QA

**Agent**: qa | **Complexity**: S | **Status**: PENDING | **Dependencies**: TASK-221

### Acceptance Criteria
- [ ] `pnpm shots edit --assert` green and deterministic on low + medium; budgets hold with 200 added props.
- [ ] 10-seed edit sweep: the same 4 edit scripts on the sweep seeds; contact sheet `mar-docs/shots/M13.jpg`;
      defects filed like `mar-docs/qa/sweep-2026-10-03.md`.
- [ ] Regression: Phase 1 dev + wow sets are 0 px vs the pre-Phase-2 baseline when no edit log is given.

## Milestone exit criteria

- M11: TASK-201/202 green; replay determinism and inverse round trips locked by tests.
- M12: brush a hill at the village in the browser, undo it, no visual glitch, `?selftest=edit` clean.
- M13: share a link, open it in a fresh tab, the edited world loads; phone usable; QA sweep filed.
