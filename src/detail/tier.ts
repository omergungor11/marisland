import { TIERS, TIER_HYSTERESIS } from '../content/tiers.ts';

/** Tier from orbit distance with ±hysteresis around the current tier (ARCHITECTURE §4). */
export function tierForDistance(d: number, current: number): number {
  const cur = TIERS[current];
  if (cur) {
    const lo = cur.minDist * (1 - TIER_HYSTERESIS);
    const hi = cur.maxDist * (1 + TIER_HYSTERESIS);
    if (d >= lo && d <= hi) return current;
  }
  for (let i = 0; i < TIERS.length; i++) {
    const t = TIERS[i];
    if (d >= t.minDist && d <= t.maxDist) return t.id;
  }
  return d > TIERS[0].maxDist ? 0 : 3;
}

/** Pitch curve: degrees from horizontal as a function of distance (piecewise in log-distance). */
export function pitchForDistance(d: number): number {
  const knots: [number, number][] = [];
  for (let i = TIERS.length - 1; i >= 0; i--) {
    const t = TIERS[i];
    if (i === TIERS.length - 1) knots.push([t.minDist, t.pitchMin]);
    knots.push([t.maxDist, t.pitchMax]);
  }
  if (d <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const [d0, p0] = knots[i - 1];
    const [d1, p1] = knots[i];
    if (d <= d1) {
      const t = (Math.log(d) - Math.log(d0)) / (Math.log(d1) - Math.log(d0));
      return p0 + (p1 - p0) * t;
    }
  }
  return knots[knots.length - 1][1];
}
