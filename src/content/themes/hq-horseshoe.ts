/**
 * Marketing "Horseshoe Harbour" kit contract (M52, D-170): the pieces the marina town is built
 * from. The plan (world/gen/plans/hq-horseshoe.ts, TASK-661) places fixtures by these refs and
 * reads only the keys and sizes; the props task (TASK-660) owns the values and swaps the
 * placeholders for the real defs. Layout numbers live in hq-horseshoe-site.ts.
 *
 * Frames: pivot on the ground (floating pieces: on the water), front = +z, x and z centred on the
 * piece's box. `w` across the front, `d` front to back, `h` to the roof ridge / mast top (u); the
 * numbers are the measured bounds of the built geometry (geo/themes/hq-horseshoe.test.ts pins
 * them within 3 %). Three defs: quayHouse (houses + tower), quayFurnish (terraces + stalls), quayBoat.
 */
export interface KitRef {
  defId: string;
  variant: number;
  w: number;
  d: number;
  h: number;
}

const ref = (defId: string, variant: number, w: number, d: number, h: number): KitRef => ({
  defId,
  variant,
  w,
  d,
  h,
});

export const MARINA_KIT = {
  /**
   * Quay houses, 2–3 storeys, a restaurant or shop on the ground floor (awning, sign, door, lit
   * windows at night): 0 seafood restaurant · 1 café · 2 bakery · 3 gelato · 4 souvenir shop ·
   * 5 chandlery. Placed side by side in rows, so the side walls are plain. `quayHouse` (TASK-660);
   * the plan box is centred on the pivot and includes the awning, the sign arm and the eaves.
   */
  house: [
    ref('quayHouse', 0, 4.15, 4.85, 6.36),
    ref('quayHouse', 1, 4.04, 4.94, 5.59),
    ref('quayHouse', 2, 3.64, 5.1, 6.36),
    ref('quayHouse', 3, 3.68, 4.72, 7.53),
    ref('quayHouse', 4, 4.08, 4.69, 5.17),
    ref('quayHouse', 5, 4.55, 4.92, 6.16),
  ],
  /** Outdoor seating in front of a house, on the water's edge: tables, chairs, parasols. */
  terrace: [
    ref('quayFurnish', 0, 3.9, 2.13, 2.3),
    ref('quayFurnish', 1, 4.25, 2.15, 2.3),
    ref('quayFurnish', 2, 3.2, 2.14, 2.3),
  ],
  /** Market stalls on the quay: 0 fish · 1 fruit · 2 postcards. */
  stall: [
    ref('quayFurnish', 3, 2.12, 1.7, 2.3),
    ref('quayFurnish', 4, 2.12, 1.7, 2.3),
    ref('quayFurnish', 5, 2.12, 1.7, 2.3),
  ],
  /**
   * Moored boats, stern to the quay: 0 sailing yacht · 1 motor cruiser · 2 day boat · 3 caique.
   * `quayBoat`, floating fixtures (FLOATING_FIXTURES); `h` is the height above the water line (the
   * hull sinks 0.2 u under it).
   */
  yacht: [
    ref('quayBoat', 0, 1.84, 5.5, 6.57),
    ref('quayBoat', 1, 2.13, 5.33, 2.67),
    ref('quayBoat', 2, 1.51, 3.23, 1.3),
    ref('quayBoat', 3, 1.66, 4.48, 2.1),
  ],
  /** One finger pontoon segment (floats, planks, cleats); chained along `d`. */
  pontoon: ref('quayBoat', 4, 1.22, 6, 0.46),
  /** The round stone tower on the second mole's head, opposite the harbour light. */
  tower: ref('quayHouse', 6, 3.2, 3.34, 6.6),
} as const;
