# Phase 2: Sandbox (sketch)

Phase 2 is not yet broken into tasks. This section sketches the four pillars of the sandbox editor.

## Edit commands (`world/edit.ts`)

Terrain and prop manipulation commands, each with an inverse for undo/redo. Terrain brushes operate on the heightfield and derived data (zones, SDF, props affected by height changes); prop commands add, remove, or move individual props with placement validation.

Each command marks dirty chunks (32×32 cells) and tracks which heightfield cells were modified. The edit log is a deterministic replay sequence, versioned and stored in localStorage. Users can share edits via URL (seed + compressed log).

**Terrain brushes:**
- Raise / lower: modal altitude adjustment
- Flatten: set all cells in radius to target height
- Smooth: blur heightfield locally (Laplacian)
- Paint: change zone type (terrain classification: grass → forest, sand → wet beach, etc.)

**Prop commands:**
- Add: place a prop instance (def, position, rotation, scale, variant); validates against OccupancyGrid
- Remove: delete a prop instance
- Move: translate/rotate a prop; re-validates against updated OccupancyGrid

All commands are pure functions of (state, params) → (new state, inverse command), enabling deterministic replay and undo.

## Dirty chunk rebuild within one frame

When a chunk is marked dirty, the next frame's render pass rebuilds it atomically:

1. **Remesh the chunk.** Regenerate faceted triangles from the modified heightfield, re-bake AO, re-apply jitter.
2. **Update height texture.** Call `texSubImage2D` on the R16F heightfield texture for the affected region. This is a GPU upload, not a re-bind.
3. **Local EDT.** Re-run the Euclidean Distance Transform (EDT) on the zone map for the chunk and its neighbours (to refresh SDF at boundaries).
4. **PropBatcher rewrite.** Identify which prop instances are in or near the chunk; re-run Poisson + OccupancyGrid for affected layers; update InstancedMesh attribute buffers (if prop positions changed).

The cost is paid frame-by-frame, amortized over multiple strokes. In capture mode, all dirty chunks are rebuilt synchronously before the final screenshot.

## Ghost previews and placement validation

Before committing a placement (add or move), a ghost preview renders the prop or terrain delta in dithered/translucent mode. The OccupancyGrid validates that the placement does not collide with existing props or terrain constraints.

If validation fails, the preview does not render and the user gets visual feedback (invalid placement message or a red tint on the brush cursor). Accepted placements are committed to the edit log immediately; rejected ones are transient previews only.

Ghost previews are implemented as temporary InstancedMesh entries or shader overlays; they dither in instead of blend, maintaining the opaque rendering model.

## Save & share (seed + edit log)

An edit is stored as:

```
{
  seed: "abc123xyz",
  edits: [
    { cmd: "raise", x: 100, y: 50, radius: 30, delta: 2.5 },
    { cmd: "place_prop", def: "pine", pos: [105, 0, 52], rot: 1.2, scale: 1.0 },
    ...
  ],
  version: 1
}
```

**Storage:** compressed JSON in localStorage (typical edit is <10 KB uncompressed; localStorage quota is ≥10 MB on most browsers).

**Replay:** loading an edit re-runs the same commands in order on the base seed's world, ensuring deterministic output. Because RNG is label-fork, adding or removing an edit earlier in the log only affects subsequent edits' randomness within that edit's scope.

**Sharing:** the seed + compressed log are encoded in a URL query string (e.g., `?edit=seed:abc123xyz,log:<base64>…`). The full URL is copyable and shareable.

**Versioning:** the log includes a version field. If the edit schema changes (e.g., a brush parameter is renamed), the loader can migrate old logs or warn the user.

---

These four components—editable commands, frame-amortized rebuild, validation feedback, and deterministic replay—form a lightweight in-browser terrain and prop editor. The architecture avoids the complexity of a full real-time destructible world by batching edits into a deterministic replay log and rebuilding chunks only when needed.
