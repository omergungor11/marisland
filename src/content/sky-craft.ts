/**
 * Sky craft (TASK-335, D-038): hot-air balloons and one airship drifting over the archipelago.
 * Data only — geo/sky-craft.ts builds the models, render/sky-craft.ts flies them on closed-form
 * orbits. Altitudes sit just under / between the cloud layer (`CLOUDS.altitude` 60–90 u).
 */
export const SKY_CRAFT = {
  count: {
    low: { balloons: 2, airships: 0 },
    medium: { balloons: 4, airships: 1 },
    high: { balloons: 5, airships: 1 },
  },
  /** Balloon altitude band (u above sea level); balloons take evenly spaced, shuffled layers. */
  balloonY: [34, 60],
  airshipY: 96,
  /** Ground speed along the orbit (u/s) — deliberately lazy. */
  balloonSpeed: 1.6,
  airshipSpeed: 3.2,
  /**
   * Orbits are concentric, same-aspect ellipses over the islands' bounding box (radius = fraction of
   * its half-extent), balloons all turning the same way at one angular speed → the horizontal gap
   * between two balloons never drops below the radius step. The airship counter-rotates, higher up.
   */
  radiusFrac: [0.3, 0.9],
  airshipRadiusFrac: 0.7,
  /** Jitter on each balloon's start angle (fraction of its even slot). */
  phaseJitter: 0.35,
  /**
   * Model scale (models are 10 u / 26 u across): readable from the T0 overview (~500 u) without
   * dwarfing islands in the low postcard view. Balloons get a per-instance jitter inside the range.
   */
  scale: [1.1, 1.4],
  airshipScale: 1.2,
  /** Vertical bob (u, period s) and swing (rad, period s). */
  bob: { amp: 0.6, period: 7 },
  sway: { amp: 0.035, period: 9 },
  airshipBank: 0.06,
  /** Dither fade by camera distance (u): gone close up so they never fly into the shot. */
  fadeNear: 30,
  fadeFar: 12,
  /** Colours. Envelope gores cycle through `stripes`; trim = band at the mouth. */
  stripes: ['#FF9E8A', '#FFE9A8', '#9FE0D0', '#B7A8F0'],
  trim: '#FFF4E0',
  basket: '#C9A06B',
  rope: '#D9C3A0',
  flame: '#FFB347',
  burner: '#8A909C',
  /** Steampunk metals (TASK-404): warm brass / copper fittings, cool iron, shared by both craft. */
  brass: '#E0B050',
  copper: '#C9754A',
  iron: '#8E98AB',
  /** Balloon (TASK-404): patched gores, brass hoops and rivets, wicker basket with sandbags. */
  balloon: {
    gores: 16,
    goresLod: 10,
    /** Rings of the envelope profile (each ring band = one patch row). */
    rings: 14,
    ringsLod: 8,
    /** Chance a gore cell is a patch in another stripe colour. */
    patchChance: 0.1,
    /** Height of a patch cell in rings. */
    patchRows: 3,
    /** Seam ribs (rope tubes) on every n-th gore boundary; 0 = none. */
    seamEvery: 1,
    /** Hoop heights (y) and the rivets studded on them. */
    hoops: [-3.2, 3.0],
    rivetsPerHoop: 16,
    wicker: ['#C9A06B', '#B88B55'],
    leather: '#8A5A3C',
    sandbag: ['#E8D5A8', '#D9B98A'],
  },
  airship: {
    hull: '#FFF4E0',
    /** Alternate panel tone (every other longitudinal panel / ring band). */
    panel: '#F6E8CB',
    belly: '#F2E3C4',
    band: '#FF9E8A',
    fins: ['#FF9E8A', '#9FE0D0'],
    cabin: '#C9A06B',
    window: '#FFE9A8',
    /** Hull tessellation: radial segments and stations (lod 1 uses the `Lod` pair). */
    radial: 24,
    stations: 20,
    radialLod: 12,
    stationsLod: 10,
    /** Rib rings (z as a fraction of the half length) with rivets per ring. */
    ribs: [-0.82, -0.58, -0.32, -0.06, 0.2, 0.46, 0.7],
    rivetsPerRib: 12,
  },
} as const;
