/**
 * Stair flights (TASK-485, content/stairs.ts): every steep leg of a 'stair' path on a theme listed
 * in STAIR_FLIGHT.byTheme gets a `stairFlight` fixture, foot on the lower path point, climbing to
 * the upper one; a flatter leg across a bare face gets one too (a landing when it is level).
 * Those themes spare their steep faces from the path paint and the shader dresses steep faces as
 * earth walls, so without a flight the leg (and the bots walking it) sat on bare
 * cliff. Run after the paths are written (carved heights).
 */
import { STAIR_FLIGHT as S } from '../../content/stairs.ts';
import { heightAt, type FixtureData, type Heightfield, type Polyline } from '../types.ts';

export function stairFlights(
  h: Heightfield,
  themeOf: (islandId: number) => string,
  /** True where the ground is a bare steep face (spared from the path paint). */
  bare: (x: number, z: number) => boolean,
  paths: readonly Polyline[],
): FixtureData[] {
  const out: FixtureData[] = [];
  const seen = new Set<string>();
  const nr = S.rises.length;
  for (const p of paths) {
    if (p.kind !== 'stair') continue;
    const look = S.byTheme[themeOf(p.islandId)];
    if (look === undefined) continue;
    for (let k = 0; k + 1 < p.points.length; k++) {
      const a = p.points[k];
      const b = p.points[k + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1e-3) continue;
      const ya = heightAt(h, a.x, a.z);
      const yb = heightAt(h, b.x, b.z);
      const rise = Math.abs(yb - ya);
      const flight = rise / len > S.minGrade;
      if (!flight && !bare((a.x + b.x) / 2, (a.z + b.z) / 2)) continue;
      const [lo, hi] = ya <= yb ? [a, b] : [b, a];
      // merged links walk the same leg twice: one flight
      const key = `${lo.x.toFixed(2)},${lo.z.toFixed(2)},${hi.x.toFixed(2)},${hi.z.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const scale = len / S.run;
      // the nearest rise (a gentle leg on a bare face may get the rise-0 landing)
      let ri = 0;
      for (let i = 1; i < nr; i++)
        if (Math.abs(S.rises[i] * scale - rise) < Math.abs(S.rises[ri] * scale - rise)) ri = i;
      out.push({
        defId: 'stairFlight',
        x: lo.x,
        z: lo.z,
        // local +z = (cos rotY, sin rotY) climbs to the upper point
        rotY: Math.atan2(hi.z - lo.z, hi.x - lo.x),
        islandId: p.islandId,
        variant: look * nr + ri,
        scale,
      });
    }
  }
  return out;
}
