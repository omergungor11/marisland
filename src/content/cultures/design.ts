/**
 * Cam ve Işık Stüdyosu (Glass & Light Studio) — kit ledger filled by TASK-415
 * (geo/themes/culture-design.ts, defs in content/props-themes/design.ts); story spots, rhythm and
 * relay by waves 2–3.
 *
 * Ledger ORDER = priority: if the per-island cap drops (10 -> 6) the kit is cut from the END. The
 * first four are the tier-2 identity (hot shop, prism, stained screen, gather ring); then the
 * caustic decal (the prism's light), the orb and the cheap tier-3 props; the one tier-1 def
 * (rainbowArc, the only entry that costs W11 calls) comes last. Variants of existing defs
 * (giantTree canopy vitray, galleryPavilion glass roof, bunting glass chime line) are not entries.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { CultureDef } from './types.ts';

const { grounded, noShadow } = PropFlag;

export const DESIGN_CULTURE: CultureDef = {
  theme: 'design',
  id: 'glassAndLight',
  name: 'Cam ve Işık Stüdyosu',
  nameEn: 'Glass & Light Studio',
  palette: {
    accent: '#B07CE0',
    roofs: ['#9C8CE0'],
    walls: ['#FFF4E0'],
    trims: ['#FF8FB1'],
  },
  pennant: { cut: 'scallop', accent: '#B07CE0' },
  kit: [
    { id: 'hotShop', tier: 2, flags: grounded },
    { id: 'prismSculpture', tier: 2, flags: grounded },
    { id: 'stainedScreen', tier: 2, flags: grounded },
    { id: 'gatherRing', tier: 2, flags: grounded },
    { id: 'causticDecal', tier: 3, flags: grounded | noShadow },
    { id: 'glassOrb', tier: 3, flags: grounded | noShadow },
    { id: 'culletCrate', tier: 3, flags: grounded | noShadow },
    { id: 'sampleShelf', tier: 3, flags: grounded | noShadow },
    { id: 'blowpipeRack', tier: 3, flags: grounded | noShadow },
    { id: 'rainbowArc', tier: 1, flags: grounded | noShadow },
  ],
  storySpots: [],
  rhythm: [],
  relay: { order: 6, id: 'lanternNight' },
};
