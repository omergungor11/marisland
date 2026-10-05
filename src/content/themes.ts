/**
 * Department themes (Phase 3, D-024): every island is one department of the agent org.
 * Data only — worldgen (campus lots), render (decor, landmark variants), life (workers) and
 * the HUD (labels) read these tables. Def ids may name geometry that lands in a later task:
 * `appendSettlementProps.push` returns −1 for unknown defs.
 */
import type { ArchetypeId, ThemeId } from '../world/types.ts';

/** Icon keys drawn by ui/theme-icons.ts (24-viewBox stroke icons). */
export type ThemeIconKey =
  'hub' | 'code' | 'megaphone' | 'magnifier' | 'palette' | 'gear' | 'flask';

export interface ThemeDef {
  id: ThemeId;
  /** Label text, e.g. 'Coding'. */
  displayName: string;
  /** Short chip text. */
  short: string;
  icon: ThemeIconKey;
  /** Label dot / chip colour and worker body base. */
  accent: string;
  /** Worker body tints around the accent (team colours). */
  teamTints: readonly string[];
  /** Campus lane lots: [lot def id, weight]. */
  lotMix: readonly (readonly [string, number])[];
  /** Def for the highest lot of the campus (like the tower house today); null = none. */
  crown: string | null;
  /** Legacy archetype lot def → themed def (applied in tryLot). */
  defSwap: Readonly<Record<string, string>>;
  /** Landmark kind → geometry variant override (clocktower 2 = orchestrator, lighthouse 2 = broadcast). */
  landmarkVariant: Readonly<Record<string, number>>;
  /** Decor beside themed lots: [prop def id, weight]. */
  decor: readonly (readonly [string, number])[];
  /** Worker allocation weight, cap per island, share seated at t = 0. */
  workers: { weight: number; cap: number; deskShare: number };
  /** Worker accessory index (creature shader mode 8). */
  accessory: number;
}

export const THEMES: Readonly<Record<ThemeId, ThemeDef>> = {
  hq: {
    id: 'hq',
    displayName: 'HQ',
    short: 'HQ',
    icon: 'hub',
    accent: '#E8735A',
    teamTints: ['#E8735A', '#F09A7E', '#D45F4A'],
    lotMix: [
      ['hqOffice', 3],
      ['meetingPavilion', 1],
    ],
    crown: 'hqAnnex',
    defSwap: { cottage: 'hqOffice', towerHouse: 'hqAnnex', marketStall: 'coffeeKiosk' },
    landmarkVariant: { clocktower: 2 },
    decor: [
      ['bench', 2],
      ['flowerBed', 2],
      ['lanternPost', 1],
    ],
    workers: { weight: 1.4, cap: 12, deskShare: 0.5 },
    accessory: 0,
  },
  coding: {
    id: 'coding',
    displayName: 'Coding',
    short: 'CODE',
    icon: 'code',
    accent: '#5B9BE6',
    teamTints: ['#5B9BE6', '#82B6F0', '#4479C9'],
    lotMix: [
      ['devOffice', 3],
      ['devPod', 2],
      ['serverShed', 1],
    ],
    crown: null,
    defSwap: { barn: 'devOffice', cottage: 'devPod' },
    landmarkVariant: {},
    decor: [
      ['bench', 2],
      ['crate', 1],
      ['lanternPost', 1],
    ],
    workers: { weight: 1.6, cap: 12, deskShare: 0.6 },
    accessory: 1,
  },
  marketing: {
    id: 'marketing',
    displayName: 'Marketing',
    short: 'MKT',
    icon: 'megaphone',
    accent: '#E35D6A',
    teamTints: ['#E35D6A', '#EE8790', '#C9465A'],
    lotMix: [
      ['broadcastStudio', 2],
      ['billboard', 1],
    ],
    crown: null,
    defSwap: { cottage: 'broadcastStudio' },
    landmarkVariant: { lighthouse: 2 },
    decor: [
      ['flowerBed', 2],
      ['bench', 1],
    ],
    workers: { weight: 0.7, cap: 5, deskShare: 0.5 },
    accessory: 2,
  },
  qa: {
    id: 'qa',
    displayName: 'QA',
    short: 'QA',
    icon: 'magnifier',
    accent: '#3FBF8F',
    teamTints: ['#3FBF8F', '#7FD8B3', '#2E9E74'],
    lotMix: [
      ['testLab', 2],
      ['inspectionTower', 1],
    ],
    crown: 'inspectionTower',
    defSwap: { stiltHut: 'testLabStilt' },
    landmarkVariant: {},
    decor: [
      ['crate', 1],
      ['bench', 1],
    ],
    workers: { weight: 0.9, cap: 7, deskShare: 0.4 },
    accessory: 3,
  },
  design: {
    id: 'design',
    displayName: 'Design',
    short: 'ART',
    icon: 'palette',
    accent: '#B07CE0',
    teamTints: ['#B07CE0', '#C9A2EC', '#9260C4'],
    lotMix: [
      ['atelier', 2],
      ['galleryPavilion', 1],
    ],
    crown: null,
    defSwap: { logCabin: 'atelier' },
    landmarkVariant: {},
    decor: [
      ['flowerBed', 3],
      ['bench', 1],
    ],
    workers: { weight: 0.9, cap: 7, deskShare: 0.5 },
    accessory: 4,
  },
  devops: {
    id: 'devops',
    displayName: 'DevOps',
    short: 'OPS',
    icon: 'gear',
    accent: '#FF9F43',
    teamTints: ['#FF9F43', '#FFBC78', '#E5822A'],
    lotMix: [
      ['dataCenter', 2],
      ['rackShed', 2],
      ['antennaMast', 1],
    ],
    crown: 'antennaMast',
    defSwap: {},
    landmarkVariant: {},
    decor: [
      ['crate', 2],
      ['barrel', 1],
    ],
    workers: { weight: 1.0, cap: 8, deskShare: 0.4 },
    accessory: 5,
  },
  research: {
    id: 'research',
    displayName: 'Research',
    short: 'R&D',
    icon: 'flask',
    accent: '#4FC3C9',
    teamTints: ['#4FC3C9', '#86D9DD', '#36A3A9'],
    lotMix: [['researchHut', 1]],
    crown: null,
    defSwap: {},
    landmarkVariant: {},
    decor: [['telescope', 1]],
    workers: { weight: 0.3, cap: 2, deskShare: 0.5 },
    accessory: 6,
  },
};

/** Archetype → department (D-024). Swapping two themes is a one-line change here. */
export const THEME_BY_ARCHETYPE: Readonly<Record<ArchetypeId, ThemeId>> = {
  hearthholm: 'hq',
  millbrook: 'coding',
  emberpeak: 'devops',
  beaconrock: 'marketing',
  palmlagoon: 'qa',
  mossgrove: 'design',
  lonelypalm: 'research',
};
