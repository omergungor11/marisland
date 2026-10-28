/**
 * Emberpeak lava (TASK-509a, D-091; M26 D1 lava river + D2 lava fall / steam delta). Look numbers
 * only: render/lava.ts paints the river into the ONE terrain program (an analytic strip along the
 * channel polyline, no mesh) and adds the fall to the waterfall ribbon mesh on the shared lit
 * program (flow surface modes 2 / 3) with soft steam puffs at the foot. Colours come from the
 * palette tables (ART_BIBLE §2 emissive lava `#FF6A3D`, window `#FFC870`, DevOps basalt).
 * Distances in u, speeds in u/s, glows are emissive gains over the palette colour (linear).
 */
import { EMISSIVE } from './palette.ts';
import { DEVOPS_CULTURE_KIT as K } from './props-themes/devops.ts';
import { DEVOPS_GROWTH } from './themes/devops-growth.ts';

export const LAVA = {
  /** Molten stream half-width (= the D-083 channel width / 2) and the cooled bank band outside it. */
  halfWidth: DEVOPS_GROWTH.lava.width / 2,
  bank: 0.75,
  /** Paints only within ± this of the polyline's ground height (a terrace above / below stays plain). */
  heightBand: 3,
  /** Polyline slots in the terrain uniforms (≥ the longest channel: 13–16 samples on the test seeds). */
  maxPoints: 24,
  /** Downhill flow speed (plates drift with the stream), crust plate size, crack width (cell units). */
  flow: { speed: 0.55, plate: 1.45, crack: 0.13, wobble: 0.35 },
  /**
   * Cooling: share of the stream crusted over at the source (notch) and at the lip, + `edge` at the
   * banks (the edges cool first); the centre line stays molten longer (`coreOpen` near the notch).
   */
  crust: { source: 0.4, lip: 0.9, edge: 0.35, coreOpen: 0.5 },
  colors: {
    /** Molten lava (cracks, open stream) and its hot core. */
    lava: EMISSIVE.lava,
    hot: EMISSIVE.window,
    /** Cooled crust plates (darker than the cone's lifted basalt so the stream reads) + plate rims. */
    crust: K.basalt,
    crustRim: K.basaltDark,
    /** Cooled banks either side (slightly lighter, glassy). */
    bank: K.basaltDark,
  },
  /**
   * Emissive gain (× colour): cracks and open lava by day / at night (night = day + `night` × uNight),
   * the hot core on top; the warm spill on the banks / nearby ground at night (× albedo, medium+).
   * Night crack luminance stays near the 0.92 night bloom threshold so the river glows, not blows.
   */
  glow: { day: 1.2, night: 0.75, hot: 0.6, pulse: [0.85, 1.0] as const, period: 3.5 },
  spill: { radius: 4, night: 0.6, day: 0.06 },
  /** Lava fall ribbon (waterfall look numbers, render/waterfalls.ts profile) and its delta. */
  fall: {
    /** The ribbon starts this far inland of the lip (covers the steep chute above the wall). */
    inland: 4,
    width: DEVOPS_GROWTH.lava.width,
    /** Slow, heavy flow (u/s along the sheet), plate spacing (u). */
    speed: 0.9,
    spacing: 2,
    /** Emissive gain of the sheet (day / added at night) and of the delta disc core. */
    glow: { day: 1.1, night: 0.7, disc: 0.9 },
    /** Delta disc on the water: radius = width × `radius` + `pad`; cooled crust ring expansion u/s. */
    delta: { radius: 1.1, pad: 1.8, speed: 0.35 },
    /** Steam emitters at the foot (PUFFS.delta) per quality, spread across the delta. */
    steamEmitters: { low: 1, medium: 2, high: 3 },
  },
} as const;
