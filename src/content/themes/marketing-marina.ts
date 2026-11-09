/**
 * Marketing "Horseshoe Harbour" kit contract (M52, D-170): the pieces the marina town is built
 * from. The plan (world/gen/plans/marketing-marina.ts, TASK-661) places fixtures by these refs and
 * reads only the keys and sizes; the props task (TASK-660) owns the values and swaps the
 * placeholders for the real defs. Layout numbers live in marketing-marina-site.ts.
 *
 * Frames: pivot on the ground (floating pieces: on the water), front = +z. `w` across the front,
 * `d` front to back, `h` to the roof ridge / mast top (u).
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
   * 5 chandlery. Placed side by side in rows, so the side walls are plain.
   */
  house: [
    ref('mediaShop', 0, 4, 4.5, 6.5),
    ref('mediaShop', 0, 4, 4.5, 5.5),
    ref('mediaShop', 0, 3.6, 4.5, 6),
    ref('mediaShop', 0, 3.6, 4.5, 7.2),
    ref('mediaShop', 0, 4, 4.5, 5.5),
    ref('mediaShop', 0, 4.4, 4.5, 6),
  ],
  /** Outdoor seating in front of a house, on the water's edge: tables, chairs, parasols. */
  terrace: [
    ref('popcornCart', 0, 4, 2.2, 2.4),
    ref('popcornCart', 0, 4, 2.2, 2.4),
    ref('popcornCart', 0, 3.2, 2.2, 2.4),
  ],
  /** Market stalls on the quay: 0 fish · 1 fruit · 2 postcards. */
  stall: [
    ref('fairBooth', 0, 2, 1.6, 2.4),
    ref('fairBooth', 0, 2, 1.6, 2.4),
    ref('fairBooth', 0, 2, 1.6, 2.4),
  ],
  /** Moored boats, stern to the quay: 0 sailing yacht · 1 motor cruiser · 2 day boat · 3 caique. */
  yacht: [
    ref('sailboat', 0, 1.8, 5.5, 7),
    ref('sailboat', 0, 2, 5, 2.6),
    ref('sailboat', 0, 1.4, 3.2, 1.4),
    ref('sailboat', 0, 1.6, 4, 2.2),
  ],
  /** One finger pontoon segment (floats, planks, cleats); chained along `d`. */
  pontoon: ref('sailboat', 0, 1.2, 6, 0.5),
  /** The round stone tower on the second mole's head, opposite the harbour light. */
  tower: ref('megaphoneKiosk', 0, 3, 3, 6.5),
} as const;
