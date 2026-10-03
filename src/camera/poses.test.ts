import { describe, expect, it } from 'vitest';
import { generateWorld, heightAt, type WorldData } from '../world/index.ts';
import { FRAMING } from '../content/camera.ts';
import { TIERS } from '../content/tiers.ts';
import { islandFrames } from './frames.ts';
import { fractionInFrame, projectNdc, ringPoints, type View } from './framing.ts';
import {
  framePose,
  heroPose,
  isHeroIsland,
  overviewPose,
  pitchBand,
  reachOf,
  type CameraWorld,
} from './poses.ts';

/** The camera-side world, as world-view builds it (minus the render-only anchor defaults). */
function cameraWorld(w: WorldData): CameraWorld {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const i of w.islands) {
    minX = Math.min(minX, i.minX);
    maxX = Math.max(maxX, i.maxX);
    minZ = Math.min(minZ, i.minZ);
    maxZ = Math.max(maxZ, i.maxZ);
  }
  return {
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    radius: Math.max(120, Math.hypot(maxX - minX, maxZ - minZ) / 2 + 60),
    islands: w.islands.map((i) => ({ ...i, frames: islandFrames(w, i.id) })),
    heightAt: (x, z) => heightAt(w.height, x, z),
  };
}

const LAND: View = { fov: 35, aspect: 16 / 9 };
const PORTRAIT: View = { fov: 35, aspect: 390 / 844 };
const vpLand = { width: 960, height: 540, insets: FRAMING.hudInsets };
const vpPortrait = { width: 390, height: 844, insets: FRAMING.hudInsets };
const o = { x: 0, y: 0, depth: 0 };

// The TASK-192 sweep seeds where `village` cropped the settlement (D1) + two that were fine.
const SEEDS = [1001, 1002, 2024, 3003, 4004];
const worlds = new Map<number, WorldData>();
const world = (s: number): WorldData => {
  let w = worlds.get(s);
  if (!w) {
    w = generateWorld(s);
    worlds.set(s, w);
  }
  return w;
};

describe('camera presets on generated worlds', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: village frames the whole settlement from over the water (D1)`, () => {
      const w = world(seed);
      const cw = cameraWorld(w);
      const id = w.islands.findIndex((i) => i.archetype === 'hearthholm');
      const hh = cw.islands[id];
      const f = hh.frames?.village;
      expect(f).toBeDefined();
      if (!f) return;
      const pose = framePose(f, 'village', LAND, vpLand, cw.heightAt(f.x, f.z));
      const s = w.settlements.find((v) => v.islandId === id);
      const lots = (s?.lots ?? []).map((k) => {
        const l = w.lots[k];
        return { x: l.x, y: Math.max(0, cw.heightAt(l.x, l.z)) + 2, z: l.z };
      });
      expect(lots.length).toBeGreaterThan(5);
      expect(fractionInFrame(pose, LAND, lots)).toBeGreaterThanOrEqual(0.8);
      // still the village tier
      expect(pose.dist).toBeLessThanOrEqual(TIERS[2].maxDist);
      // the harbour (camera side) sits below the settlement centre on screen
      const harbour = hh.anchors.harbour;
      if (harbour) {
        projectNdc(pose, LAND, { x: harbour.x, y: 0, z: harbour.z }, o);
        const hy = o.y;
        projectNdc(pose, LAND, { x: f.x, y: 0, z: f.z }, o);
        expect(hy).toBeLessThan(o.y);
      }
      const d = hh.frames?.dock;
      if (d) {
        const dp = framePose(d, 'dock', LAND, vpLand, 0);
        expect(fractionInFrame(dp, LAND, d.points)).toBeGreaterThanOrEqual(0.9);
      }
    });

    it(`seed ${seed}: overview keeps every shallow ring in the safe area, 16:9 and 9:16 (D2)`, () => {
      const cw = cameraWorld(world(seed));
      for (const [view, vp] of [
        [LAND, vpLand],
        [PORTRAIT, vpPortrait],
      ] as const) {
        const pose = overviewPose(cw, view, vp);
        expect(pose.dist).toBeGreaterThanOrEqual(TIERS[0].minDist);
        const top = 1 - (2 * vp.insets.top) / vp.height;
        const bottom = -1 + (2 * vp.insets.bottom) / vp.height;
        for (const i of cw.islands)
          for (const p of ringPoints(i.cx, i.cz, reachOf(i) + FRAMING.overview.ringPad, 0, 24)) {
            projectNdc(pose, view, p, o);
            expect(Math.abs(o.x)).toBeLessThanOrEqual(1.001);
            expect(o.y).toBeLessThanOrEqual(top + 1e-3);
            expect(o.y).toBeGreaterThanOrEqual(bottom - 1e-3);
          }
        // the default pose is reachable: inside the user pitch band
        const [lo, hi] = pitchBand(pose.dist);
        expect(pose.pitch).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(pose.pitch).toBeLessThanOrEqual(hi + 1e-9);
      }
    });
  }

  it('Lonely Palm hero framing: low look, horizon in the top third, palm and ring in frame (D13)', () => {
    let seen = 0;
    for (const seed of SEEDS) {
      const cw = cameraWorld(world(seed));
      const lp = cw.islands.find((i) => i.archetypeName === 'Lonely Palm');
      if (!lp) continue;
      seen++;
      expect(isHeroIsland(lp)).toBe(true);
      for (const vp of [vpLand, { ...vpLand, insets: FRAMING.bareInsets }]) {
        const pose = heroPose(lp, LAND, vp);
        // horizon: a far point at camera height is at NDC y = tan(pitch) / tan(fov / 2)
        const horizon = Math.tan((pose.pitch * Math.PI) / 180) / Math.tan((17.5 * Math.PI) / 180);
        expect(horizon).toBeGreaterThan(1 / 3);
        expect(horizon).toBeLessThan(1);
        // the camera sits below the palm crown: the crown reads against the sky
        expect(pose.dist * Math.sin((pose.pitch * Math.PI) / 180)).toBeLessThan(
          FRAMING.hero.landmarkTop - 1.5,
        );
        const palm = lp.anchors.palm ?? { x: lp.cx, z: lp.cz };
        const pts = [
          ...ringPoints(lp.cx, lp.cz, reachOf(lp) + FRAMING.hero.ringPad, 0, 16),
          { x: palm.x, y: FRAMING.hero.landmarkTop, z: palm.z },
        ];
        expect(fractionInFrame(pose, LAND, pts)).toBe(1);
        // reachable without a snap on the first drag
        const [lo, hi] = pitchBand(pose.dist);
        expect(pose.pitch).toBeGreaterThanOrEqual(lo);
        expect(pose.pitch).toBeLessThanOrEqual(hi);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('pitch band is continuous across the low-pitch blend and the tier boundaries', () => {
    let prev = pitchBand(12);
    for (let d = 12.5; d <= 800; d += 0.5) {
      const b = pitchBand(d);
      expect(Math.abs(b[0] - prev[0])).toBeLessThan(1.5);
      expect(b[0]).toBeLessThan(b[1]);
      prev = b;
    }
  });
});
