/**
 * Stair flights (TASK-485): on a `pathSparesSlopes` island the footpath paint stays off the steep
 * faces and the shader dresses every steep face as an earth wall, so a 'stair' link climbing a wall
 * was invisible and its walkers stood on bare cliff. Every steep leg of such a stair now carries a
 * `stairFlight` fixture (placed by world/gen/stair-flights.ts, geometry geo/themes/stairs.ts).
 * Lengths in u.
 */

/**
 * One theme's flight look. Flight = treads between two stringers, a hand rail on both sides;
 * `skirt` = how far each tread block reaches below its top (it hides the wall where the terrain
 * dips under the straight flight).
 */
export interface StairFlightLook {
  tread: string;
  riser: string;
  stringer: string;
  rail: string;
  /** Flight width, rail height above the treads, rail / post half-thickness. */
  width: number;
  railY: number;
  railR: number;
  skirt: number;
}

export const STAIR_FLIGHT = {
  /**
   * A leg (two consecutive stair path points) gets a flight when |rise| / run exceeds this; a
   * flatter leg whose middle lies on a spared face (Zone.rock / Zone.cliff) gets a landing (the
   * rise-0 variant: a deck on its skirt).
   */
  minGrade: 0.5,
  /**
   * Geometry is built for a 2 u run (`run`) at the rises `rises` (one variant per rise; variant =
   * look × rises.length + rise index). The placer scales a flight by leg length / run and picks
   * the rise nearest the leg's (scaled) rise; steeper legs take the last one. Rise 0 = a landing.
   */
  run: 2,
  rises: [0, 0.75, 1.5, 2.25, 3, 3.75, 4.5] as readonly number[],
  /** Riser height of one step (u, before scaling); the step count is rise / step rounded. */
  step: 0.32,
  /** Theme → look row (themes not listed get no flights). */
  byTheme: { marketing: 0 } as Readonly<Record<string, number>>,
  looks: [
    // 0 · Marketing (Beacon Rock): red-painted decking (the theme's stair paint), cream risers,
    // dark stringers and a gold rail
    {
      tread: '#C9675E',
      riser: '#FFF4E0',
      stringer: '#3A3F4D',
      rail: '#F5C84C',
      width: 1.3,
      railY: 0.85,
      railR: 0.035,
      skirt: 0.5,
    },
  ] as readonly StairFlightLook[],
} as const;
