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
  stripes: ['#EBC27A', '#EBCF98', '#E08F6A', '#6FB7A6'],
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
    patchChance: 0.2,
    /** Darker patch cells (burgundy, tobacco, deep teal) and the stitched-seam thread. */
    patches: ['#A5524B', '#8F6A3A', '#3F8077'],
    thread: '#6B4A32',
    /** Per-balloon colourway: instance colour tint (rgb multiplier) by balloon index. */
    tints: [
      [1, 1, 1],
      [1.1, 0.88, 0.78],
      [0.82, 1.0, 1.06],
      [1.06, 0.82, 0.92],
    ],
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
    hull: '#FFE2AE',
    /** Alternate panel tone (every other longitudinal panel / ring band). */
    panel: '#F6CF90',
    belly: '#EEBF7C',
    band: '#E88A62',
    fins: ['#F0B050', '#7CC6B4'],
    cabin: '#EDB96C',
    /** Second plank tone for the gondola siding. */
    cabin2: '#D69A52',
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
