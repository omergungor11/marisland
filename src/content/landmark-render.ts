/**
 * Landmark kind → prop def drawn for it (M14b: moved from render/props/settlement-props.ts so
 * themes add landmark kinds without editing render code). `LandmarkData.kind` keys this table;
 * kinds without an entry draw nothing. `underwater`: the prop sits on the seabed (no flood hiding).
 */
export interface LandmarkRender {
  /** PROP_DEFS id. */
  def: string;
  scale: number;
  underwater?: boolean;
}

export const LANDMARK_RENDER: Readonly<Record<string, LandmarkRender>> = {
  lighthouse: { def: 'lighthouse', scale: 1 },
  clocktower: { def: 'clocktower', scale: 1 },
  windmill: { def: 'windmill', scale: 1 },
  hotSpring: { def: 'hotSpring', scale: 1 },
  volcanoCrater: { def: 'volcanoCrater', scale: 1 },
  sunkenShip: { def: 'sunkenShip', scale: 1, underwater: true },
  giantTree: { def: 'giantTree', scale: 1 },
  lonelyPalm: { def: 'palm', scale: 1.35 },
  windTurbine: { def: 'windTurbine', scale: 1 },
  qaTower: { def: 'qaTower', scale: 1 },
};
