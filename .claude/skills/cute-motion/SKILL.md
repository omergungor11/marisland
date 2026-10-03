---
name: cute-motion
description: Use when adding or tuning any animation in Marisland — idle loops, creature behaviour, pop-ins, click reactions, camera moves, the opening sequence. Gives timing tables, spring/easing presets, squash-and-stretch rules, phase-offset tricks, the GPU-vs-CPU split and the determinism contract for capture mode.
---

# Cute motion

Motion is half of "cute". Static pretty geometry reads as a render; the same scene with
well-tuned bob, sway and pop reads as a *world*. The content list (what moves, where) lives in
`mar-docs/ART_BIBLE.md`; this skill is about *how* it should move.

## Principles

1. **Overshoot, then settle.** Objects pop with an underdamped spring (damping ratio ζ ≈ 0.4–0.6).
   Cameras never overshoot (ζ ≈ 1, critically damped).
2. **Squash & stretch keeps volume.** `scale.y = s`, `scale.x = scale.z = 1 / Math.sqrt(s)`.
   Typical squash 0.85–0.9, stretch 1.08–1.15.
3. **Anticipation.** Big moves start with a small opposite move (5–10 % amplitude, 60–120 ms).
4. **Never in sync.** Every instance gets a phase offset from `hash(seed, id)` and a period jitter
   of ±10–15 %. Ten neighbours in the same pose = screensaver.
5. **Secondary motion lags.** Attached parts follow with 0.15–0.3 period delay (leaves after
   trunk, flag after pole, boat roll after bob).
6. **Idle small and slow, reactions big and fast.** Idle amplitude is tiny; reactions are 3–5×
   larger and 5–10× faster. Large idle amplitude feels seasick.
7. **Ease everything.** Loops use `sin`; one-shots use springs or easeOutBack. Even mechanical
   rotation (windmill, lighthouse) gets gust variation (±15 % speed, slow noise).

## Timing table

| Motion | Duration / period | Curve |
|---|---|---|
| Prop pop-in (detail bloom) | 350–450 ms | spring k=300 c=14, or easeOutBack(1.7) from scale 0.6 |
| Dithered fade-in | 250–350 ms | smoothstep on dither threshold |
| Click squash | 100–120 ms down, 350–400 ms spring back | squash 0.85 → spring to 1 |
| Villager hop step | 280–340 ms | parabola height 0.15 u, land squash 0.88/1.07 |
| Boat bob / roll | 2.8–3.6 s / roll lags 0.25 period | sin, roll 4–7° |
| Tree sway | 2.5–4 s + gust wave crossing island every 6–10 s | sin × height² weight |
| Grass / flower sway | 1.5–2.5 s, spatial wave | sin(t + dot(pos, windDir) * k) |
| Bird flap | 0.25–0.35 s flapping, glide 1–3 s | flap bursts, then glide |
| Smoke puff | 2.5–4 s life | scale 0.3 → 1.2 easeOut, opacity 1 → 0, rise + drift |
| Camera fly-to | 1.2–2.0 s | critically damped spring or easeInOutCubic |
| UI button press | 80 ms down, 250 ms spring back | scale 0.92 |

## Implementation helpers

Frame-rate independent smoothing (use for follow/aim, never `lerp(a, b, 0.1)` per frame):

```ts
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  a + (b - a) * (1 - Math.exp(-lambda * dt));
```

Damped spring with substeps (stable at 30–144 fps and after tab-switch spikes):

```ts
export interface Spring { x: number; v: number }
export function stepSpring(s: Spring, target: number, k: number, c: number, dt: number): void {
  const steps = Math.max(1, Math.ceil(Math.min(dt, 0.1) / (1 / 120)));
  const h = Math.min(dt, 0.1) / steps;
  for (let i = 0; i < steps; i++) {
    s.v += (-k * (s.x - target) - c * s.v) * h;
    s.x += s.v * h;
  }
}
```

Clamp `dt` (≤ 0.1 s) everywhere so returning from a background tab never explodes a simulation.

## GPU vs CPU split

- **More than ~50 of a kind → vertex shader.** Per-instance attributes (`aPhase`, `aSpeed`,
  `aScale`) + one `uTime` uniform from the engine clock. Weight sway by local height
  (`h*h`) so bases stay planted. Grass, flowers, leaves, water, buoys, flags, fireflies.
- **Hero creatures (≲ 60 total) → CPU** state machines writing into an `InstancedMesh` per kind
  (one draw call per kind). Boats, villagers, crabs, seagulls that land, fish jumps.
- **Reactions on mass instances without CPU per-frame work:** keep a per-instance float attribute
  `aReactStart` (time the reaction began, `-1` idle). On click write `uTime` into that slot and set
  `needsUpdate` for that range; the shader evaluates the squash curve from `uTime - aReactStart`.

## Determinism contract (capture mode)

- Every animation reads time from the engine clock (`clock.t`, seconds). Never call
  `performance.now()`, `Date.now()` or `Math.random()` in animation code.
- Per-entity randomness = `hash(seed, entityId)`.
- Prefer **closed-form motion**: `pos = path(t * speed + phase)`. A frozen frame at
  `?freeze=1&time=T` is then exact. Stateful CPU agents must be re-simulated from 0 to T with a
  fixed step on load in capture mode, or expose `evaluate(t)`.
- Check: three captures at different `time` values show different, plausible poses; two
  captures at the same `time` are pixel-identical.

## Click reactions

Raycast → resolve `(kind, instanceId)` → play reaction → 600 ms cooldown. Escalate on repeated
clicks (1st: squash + sparkle, 3rd: special — tree drops an apple, crab dives into sand, boat
honks and does a little spin). Feedback particles are procedural sprites (hearts, leaves, stars,
ripples) from a pooled `Points`/instanced quad system. Hover: subtle 1.04 scale + cursor change.

## Reduced motion

`matchMedia('(prefers-reduced-motion: reduce)')` (and a HUD toggle): camera fly-tos become short
cross-fades or cuts, ambient amplitudes × 0.3, no shake, opening sequence jumps to its final frame.

## Anti-patterns

- Same frequency on every instance; linear interpolation pops; camera overshoot.
- Animations driven by frame count instead of `dt`/`t`.
- Per-frame CPU matrix updates for hundreds of instances (move it to the shader).
- New objects allocated in the update loop (`new Vector3()` per frame) — reuse scratch objects.

## Done checklist

- [ ] Looks right with forced `dt` of 1/30, 1/60 and 1/120.
- [ ] Neighbouring instances visibly out of phase.
- [ ] Frozen captures at 3 `time` values differ and look plausible; same `time` → identical.
- [ ] Reduced-motion path verified.
- [ ] CPU cost noted (agents × ms/frame) in the task report.
