/**
 * What the `village` / `dock` presets frame, derived from the settlement pipeline's output
 * (lots, plaza, docks, moorings). Pure data in, pure data out (no three) so the framing can be
 * tested in Node against generated worlds.
 */
import { heightAt, sampleGrid, type WorldData } from '../world/index.ts';
import { FRAMING } from '../content/camera.ts';
import type { Pt3 } from './framing.ts';

/** A point set to fit plus the side (xz angle, radians) the camera sits on. */
export interface CameraFrame {
  /** Target the preset orbits (the anchor). */
  x: number;
  z: number;
  /** xz angle (radians) from the target toward the camera: over the water. */
  facing: number;
  points: Pt3[];
}

export interface IslandFrames {
  village?: CameraFrame;
  dock?: CameraFrame;
}

const ground = (w: WorldData, x: number, z: number): number =>
  Math.max(0, heightAt(w.height, x, z));

/** Direction (radians) from (x, z) toward the deepest nearby water. */
function towardWater(w: WorldData, x: number, z: number, r: number): number {
  let sx = 0;
  let sz = 0;
  for (let i = 0; i < 32; i++) {
    const t = (i / 32) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const sdf = sampleGrid(w.height, w.shoreSdf, x + c * r, z + s * r, 0);
    if (sdf < 0) {
      sx += c * -sdf;
      sz += s * -sdf;
    }
  }
  return sx === 0 && sz === 0 ? 0 : Math.atan2(sz, sx);
}

/** Village + dock frames for island `id` (undefined when it has no settlement). */
export function islandFrames(w: WorldData, id: number): IslandFrames {
  const isl = w.islands[id];
  const s = w.settlements.find((v) => v.islandId === id);
  if (!isl || !s) return {};
  const out: IslandFrames = {};
  const roof = FRAMING.village.roofY;

  // ---- village: the lots nearest the plaza / hub (roof height) + plaza + the settlement's
  // piers; the farthest few (stilt huts strung along the shore) would only shrink the village
  const lots = s.lots.map((i) => w.lots[i]).filter((l) => l !== undefined);
  const core = s.plaza ?? s.hub;
  const keep = Math.ceil(lots.length * FRAMING.village.keepFraction);
  const tall = FRAMING.village.tall;
  const near = lots
    .map((l, k) => ({ l, k, d: Math.hypot(l.x - core.x, l.z - core.z) }))
    .sort((a, b) => a.d - b.d || a.k - b.k)
    .filter((e, rank) => rank < keep || tall[e.l.defId] !== undefined)
    .map((e) => e.l);
  const pts: Pt3[] = near.map((l) => ({
    x: l.x,
    y: ground(w, l.x, l.z) + (tall[l.defId] ?? roof),
    z: l.z,
  }));
  // a tall lot is framed foot to top (it may stand on the near side of the frame)
  for (const l of near)
    if (tall[l.defId] !== undefined) pts.push({ x: l.x, y: ground(w, l.x, l.z), z: l.z });
  let cx = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p.x;
    cz += p.z;
  }
  if (s.plaza) {
    pts.push({ x: s.plaza.x, y: ground(w, s.plaza.x, s.plaza.z), z: s.plaza.z });
    cx += s.plaza.x;
    cz += s.plaza.z;
  }
  const n = pts.length;
  if (n > 0) {
    cx /= n;
    cz /= n;
  } else {
    cx = s.hub.x;
    cz = s.hub.z;
    pts.push({ x: cx, y: ground(w, cx, cz) + roof, z: cz });
  }
  // tall fixtures (cooling towers) foot to top
  for (const f of w.fixtures)
    if (
      f.islandId === id &&
      tall[f.defId] !== undefined &&
      Math.hypot(f.x - cx, f.z - cz) <= FRAMING.village.landmarkRadius
    ) {
      const g = ground(w, f.x, f.z);
      pts.push({ x: f.x, y: g + tall[f.defId], z: f.z }, { x: f.x, y: g, z: f.z });
    }
  // landmarks (clocktower, windmills, lighthouse) up to their tops
  for (const li of s.landmarks) {
    const m = w.landmarks[li];
    if (m && Math.hypot(m.x - cx, m.z - cz) <= FRAMING.village.landmarkRadius)
      pts.push({ x: m.x, y: ground(w, m.x, m.z) + FRAMING.village.landmarkY, z: m.z });
  }
  // the harbour piers belong to the village frame; an outpost's lone jetty would only add sea
  const harbour = isl.anchors.harbour;
  for (const di of harbour ? s.docks : []) {
    const d = w.docks[di];
    if (!d) continue;
    const len = d.segments * 2;
    pts.push({ x: d.x, y: 0.5, z: d.z });
    pts.push({ x: d.x + Math.cos(d.rotY) * len, y: 0.5, z: d.z + Math.sin(d.rotY) * len });
  }
  // over the water: toward the harbour bay when there is one, else the deepest nearby water
  const facing = harbour
    ? Math.atan2(harbour.z - cz, harbour.x - cx)
    : towardWater(w, cx, cz, Math.max(24, isl.reach * 0.6));
  out.village = { x: cx, z: cz, facing, points: pts };

  // ---- dock: the first pier, its moorings and the waterfront lots by its root
  const di = s.docks[0];
  const d = di !== undefined ? w.docks[di] : undefined;
  if (d) {
    const dc = FRAMING.dock;
    const len = d.segments * 2;
    const ux = Math.cos(d.rotY);
    const uz = Math.sin(d.rotY);
    const dp: Pt3[] = [
      { x: d.x, y: 0.5, z: d.z },
      { x: d.x + ux * len, y: 0.5, z: d.z + uz * len },
    ];
    for (const m of w.moorings) if (m.dock === di) dp.push({ x: m.x, y: 1, z: m.z });
    for (const l of lots)
      if (Math.hypot(l.x - d.x, l.z - d.z) <= dc.lotRadius)
        dp.push({ x: l.x, y: ground(w, l.x, l.z) + roof, z: l.z });
    // camera off the pier axis, on whichever side looks over more water
    const skew = dc.skewDeg * (Math.PI / 180);
    const probe = (a: number): number =>
      sampleGrid(
        w.height,
        w.shoreSdf,
        d.x + ux * len * 0.5 + Math.cos(a) * dc.probe,
        d.z + uz * len * 0.5 + Math.sin(a) * dc.probe,
        0,
      );
    const a0 = d.rotY + skew;
    const a1 = d.rotY - skew;
    const dockFacing = probe(a0) <= probe(a1) ? a0 : a1;
    out.dock = {
      x: d.x + ux * len * 0.5,
      z: d.z + uz * len * 0.5,
      facing: dockFacing,
      points: dp,
    };
  }
  return out;
}
