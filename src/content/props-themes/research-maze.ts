/**
 * Research hedge maze tiles (M22 TASK-483, R12 / R3-16): `hedgeParterre` variants 2-5. Each tile is a
 * 4 x 4 cell maze inside the parterre frame, carved once at module load by a recursive backtracker
 * seeded per pattern (pure integer LCG: no Math.random), with two openings in the frame. The four
 * patterns differ in the walls and in where the frame is open, so neighbouring tiles can be paired
 * (world/gen/plans/research.ts) with openings facing each other. Local frame: x right, z ahead
 * (cell (c, r): centre x = -1.35 + 0.9 c, z = -1.35 + 0.9 r). `pace` is the straight corridor of
 * three cells the maze bot walks back and forth (story spot `mazePace`).
 */

export const MAZE = {
  /** Parterre variants that are mazes (v0-v1 stay the classic tiles). */
  firstVariant: 2,
  patterns: 4,
  cells: 4,
  pitch: 0.9,
  /** Frame centre line (u) = half of cells x pitch; frame / wall thickness. */
  half: 1.8,
  frame: 0.34,
  wall: 0.3,
  height: 0.46,
  /** The bot paces over this many cells (centre to centre = (run - 1) x pitch). */
  run: 3,
  /** Pace: half length (u), walk speed (u/s) and the pause at each end (s): a stop about every 6 s. */
  pace: { reach: 0.9, speed: 0.5, pause: 2.4 },
} as const;

export type MazeSide = 'S' | 'N' | 'E' | 'W';

/** Frame openings per pattern: the side (S = +z, N = -z, E = +x, W = -x) and the cell index along it. */
const OPENINGS: readonly (readonly { side: MazeSide; at: number }[])[] = [
  [
    { side: 'S', at: 1 },
    { side: 'N', at: 2 },
  ],
  [
    { side: 'W', at: 2 },
    { side: 'E', at: 1 },
  ],
  [
    { side: 'S', at: 2 },
    { side: 'E', at: 2 },
  ],
  [
    { side: 'N', at: 1 },
    { side: 'W', at: 1 },
  ],
];

export interface MazePattern {
  /** Inner walls between (c, r) and (c + 1, r): the wall on the line x = -half + pitch (c + 1), row r. */
  vWalls: readonly (readonly [number, number])[];
  /** Inner walls between (c, r) and (c, r + 1): on the line z = -half + pitch (r + 1), column c. */
  hWalls: readonly (readonly [number, number])[];
  open: readonly { side: MazeSide; at: number }[];
  /** Pace corridor: centre (x, z) in the tile frame and whether it runs along z. */
  pace: { x: number; z: number; alongZ: boolean };
}

/** Cell centre coordinate (u) of index `i`. */
export const mazeCentre = (i: number): number => -MAZE.half + MAZE.pitch * (i + 0.5);

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function carve(pattern: number, attempt: number): MazePattern | null {
  const N = MAZE.cells;
  const rnd = lcg(0x6d617a65 + pattern * 7919 + attempt * 104729);
  // passage[a][b]: cells a, b (index c + N r) are joined
  const joined = new Set<number>();
  const key = (a: number, b: number): number => (a < b ? a * 64 + b : b * 64 + a);
  const seen = new Array<boolean>(N * N).fill(false);
  const stack = [rnd() < 0.5 ? 0 : N * N - 1];
  seen[stack[0]] = true;
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const c = cur % N;
    const r = Math.floor(cur / N);
    const next: number[] = [];
    if (c > 0 && !seen[cur - 1]) next.push(cur - 1);
    if (c < N - 1 && !seen[cur + 1]) next.push(cur + 1);
    if (r > 0 && !seen[cur - N]) next.push(cur - N);
    if (r < N - 1 && !seen[cur + N]) next.push(cur + N);
    if (next.length === 0) {
      stack.pop();
      continue;
    }
    const to = next[Math.floor(rnd() * next.length) % next.length];
    joined.add(key(cur, to));
    seen[to] = true;
    stack.push(to);
  }
  const vWalls: [number, number][] = [];
  const hWalls: [number, number][] = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const a = c + N * r;
      if (c < N - 1 && !joined.has(key(a, a + 1))) vWalls.push([c, r]);
      if (r < N - 1 && !joined.has(key(a, a + N))) hWalls.push([c, r]);
    }
  // the first straight run of `run` joined cells (rows along x first, then columns along z)
  let pace: MazePattern['pace'] | null = null;
  const R = MAZE.run;
  search: for (const alongZ of [false, true])
    for (let l = 0; l < N; l++)
      for (let s = 0; s + R <= N; s++) {
        let ok = true;
        for (let k = 0; k + 1 < R; k++) {
          const a = alongZ ? l + N * (s + k) : s + k + N * l;
          const b = alongZ ? a + N : a + 1;
          if (!joined.has(key(a, b))) ok = false;
        }
        if (!ok) continue;
        const mid = s + (R - 1) / 2;
        pace = alongZ
          ? { x: mazeCentre(l), z: mazeCentre(mid), alongZ }
          : { x: mazeCentre(mid), z: mazeCentre(l), alongZ };
        break search;
      }
  if (!pace) return null;
  return { vWalls, hWalls, open: OPENINGS[pattern], pace };
}

/** The four patterns (variant `firstVariant + i`), carved at load. */
export const MAZE_PATTERNS: readonly MazePattern[] = Array.from(
  { length: MAZE.patterns },
  (_, k) => {
    for (let a = 0; a < 64; a++) {
      const p = carve(k, a);
      if (p) return p;
    }
    throw new Error(`maze ${k}: no straight corridor`);
  },
);

/** Pattern of a hedgeParterre variant (variant >= firstVariant). */
export const mazeOf = (variant: number): MazePattern =>
  MAZE_PATTERNS[(variant - MAZE.firstVariant) % MAZE.patterns];

/** Unit tile-frame direction of a side (x right, z ahead). */
export const SIDE_VEC: Readonly<Record<MazeSide, readonly [number, number]>> = {
  S: [0, 1],
  N: [0, -1],
  E: [1, 0],
  W: [-1, 0],
};
