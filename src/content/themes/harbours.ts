/**
 * Shared ferry-harbour kit (M31 TASK-533, D-112 / D-114): numbers and palettes of the harbour light,
 * waiting shelter, ticket booth, timetable board and bollard. Every piece is a pair of VARIANTS of an
 * existing def (no ledger entry): a neutral one (warm cream + harbour red, usable by any island) and
 * a Research one (white + teal). Marketing / Design (TASK-536 / 537) add their own variants after
 * these. Geometry: geo/themes/harbours.ts; defs: PropDef edits in content/props-buildings.ts and
 * content/props-themes/signage.ts. Lengths in u (1 u = 1 m), pivot on the ground (the harbour light
 * and the booth stand on a quay / breakwater tip).
 */
import { RESEARCH_CULTURE_KIT as K } from '../props-themes/research.ts';

/** Colours shared by both liveries. */
const COMMON = {
  stone: '#D8CFBE',
  stoneDark: '#B7AD99',
  wood: K.wood,
  woodDark: K.woodDark,
  iron: '#6F7685',
  steel: K.steel,
  brass: K.brass,
  /** Lamp glow (emissive 1: the island's lamp set). */
  lamp: '#FFC870',
  /** Window / porthole glow (emissive < 1: window class). */
  glass: '#FFE0A0',
  chalk: '#FAFAF5',
  board: '#2E3C52',
} as const;

export const HARBOUR_PAL = {
  neutral: {
    ...COMMON,
    wall: '#F6EBD3',
    accent: '#E4604F',
    accentDeep: '#C24A3C',
    roof: '#D9604A',
    band: '#F6EBD3',
  },
  research: {
    ...COMMON,
    wall: '#FAFAF5',
    accent: K.teal,
    accentDeep: K.tealDeep,
    roof: K.roofTeal,
    band: '#FAFAF5',
  },
} as const;
export type HarbourLivery = keyof typeof HARBOUR_PAL;

/** First added variant index of each old def (neutral); the Research livery is +1. */
export const HARBOUR_VARIANTS = {
  lighthouse: 3,
  marketStall: 3,
  dock: 2,
  pierSignpost: 3,
  barrel: 2,
} as const;

export const HARBOUR = {
  /** Harbour light: a 6 u banded round tower for a breakwater tip (lighthouse v3 / v4). */
  light: {
    heightNominal: 6.1,
    footprint: 1.3,
    plinth: { r: 1.1, h: 0.5 },
    /** [radius at y, y] of the tower, bottom to top; bands are cut by y. */
    tower: { rBase: 0.78, rTop: 0.52, y0: 0.5, y1: 4.1, bands: 3 },
    gallery: { r: 0.82, y: 4.1, thick: 0.14, rail: 0.38, posts: 8 },
    lamp: { y: 4.78, r: 0.3, room: 0.34 },
    cap: { y: 5.35, r: 0.62, h: 0.62 },
    door: { w: 0.34, h: 0.62 },
    /** Beam hook (the beam is a render-side cone, TASK-534): length, period, tilt. */
    beam: { length: 24, secondsPerRev: 10, tiltDeg: 2 },
  },
  /** Waiting shelter: bench + roof, open to +z. */
  shelter: {
    heightNominal: 2.75,
    footprint: 1.7,
    w: 2.9,
    d: 1.4,
    wallH: 1.8,
    bench: { h: 0.46, deep: 0.46 },
    roofRise: 0.4,
    lampY: 1.68,
  },
  /** Ticket booth: counter window on +z, awning over it. */
  booth: {
    heightNominal: 2.75,
    footprint: 1.2,
    w: 1.5,
    d: 1.2,
    wallH: 2.05,
    window: { w: 0.78, h: 0.5, y: 1.1 },
    awning: { out: 0.52, y: 1.78 },
  },
  /** Timetable board on two posts: header with the ferry glyph + glyph rows. */
  board: {
    heightNominal: 2.33,
    footprint: 1.0,
    w: 1.7,
    h: 1.15,
    postH: 1.9,
    rows: 4,
    /** Row chip (time) and destination bar lengths come from the seed within these. */
    barRange: [0.4, 0.78] as const,
  },
  /** Bollard: 0.5 u. */
  bollard: {
    heightNominal: 0.5,
    footprint: 0.3,
    r: 0.15,
  },
} as const;
