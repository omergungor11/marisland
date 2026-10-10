import { describe, expect, it } from 'vitest';
import { generateWorld, heightAt, type WorldData } from '../world/index.ts';
import { FRAMING } from '../content/camera.ts';
import { TIERS } from '../content/tiers.ts';
import { islandFrames } from './frames.ts';
import { fractionInFrame, projectNdc, ringPoints, type View } from './framing.ts';
import {
  findIsland,
  framePose,
  heroPose,
  isHeroIsland,
  overviewPose,
  pitchBand,
  postcardPoints,
  postcardPose,
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
const DEG = Math.PI / 180;

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

  for (const seed of SEEDS) {
    it(`seed ${seed}: postcard is a low 3/4 look with every island in frame and the horizon in the top third (TASK-392)`, () => {
      const cw = cameraWorld(world(seed));
      for (const [view, vp] of [
        [LAND, vpLand],
        [LAND, { ...vpLand, insets: FRAMING.bareInsets }],
      ] as const) {
        const pose = postcardPose(cw, view, vp);
        // horizon: NDC y = tan(pitch) / tan(fov / 2), in the top third and on screen
        const horizon = Math.tan(pose.pitch * DEG) / Math.tan((view.fov / 2) * DEG);
        expect(horizon).toBeGreaterThan(1 / 3);
        expect(horizon).toBeLessThan(1);
        // every island's land, cliffs, peak and landmark tops inside the safe area, under the horizon
        const top = Math.min(
          1 - (2 * vp.insets.top) / vp.height,
          FRAMING.postcard.horizon - FRAMING.postcard.horizonGap,
        );
        const bottom = -1 + (2 * vp.insets.bottom) / vp.height;
        const left = -1 + (2 * vp.insets.left) / vp.width;
        for (const p of postcardPoints(cw)) {
          projectNdc(pose, view, p, o);
          expect(o.depth).toBeGreaterThan(0);
          expect(o.x).toBeGreaterThanOrEqual(left - 1e-3);
          expect(o.x).toBeLessThanOrEqual(-left + 1e-3);
          expect(o.y).toBeGreaterThanOrEqual(bottom - 1e-3);
          expect(o.y).toBeLessThanOrEqual(top + 1e-3);
        }
        expect(cw.islands.length).toBeGreaterThanOrEqual(5);
        // the nearest islands are seen at a 3/4 angle: the bottom edge looks down 26–34°
        const bottomLook = pose.pitch + (view.fov / 2) * (1 - 0.02);
        expect(bottomLook).toBeGreaterThan(26);
        expect(bottomLook).toBeLessThan(34);
        // reachable (no snap on the first drag) and inside the camera-controls target box
        const [lo, hi] = pitchBand(pose.dist);
        expect(pose.pitch).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(pose.pitch).toBeLessThanOrEqual(hi + 1e-9);
        expect(pose.ty).toBeGreaterThanOrEqual(0);
        expect(pose.ty).toBeLessThanOrEqual(60);
        expect(Math.abs(pose.tx - cw.centerX)).toBeLessThanOrEqual(cw.radius);
        expect(Math.abs(pose.tz - cw.centerZ)).toBeLessThanOrEqual(cw.radius);
        // the camera clears the terrain
        const cy = pose.ty + pose.dist * Math.sin(pose.pitch * DEG);
        const cx = pose.tx + pose.dist * Math.cos(pose.pitch * DEG) * Math.sin(pose.az * DEG);
        const cz = pose.tz + pose.dist * Math.cos(pose.pitch * DEG) * Math.cos(pose.az * DEG);
        expect(cy).toBeGreaterThan(cw.heightAt(cx, cz) + 10);
      }
    });
  }

  it('postcard falls back to the overview on portrait screens', () => {
    const cw = cameraWorld(world(1001));
    expect(postcardPose(cw, PORTRAIT, vpPortrait)).toEqual(overviewPose(cw, PORTRAIT, vpPortrait));
  });

  it('postcard follows island height: raised islands lift the camera, nothing is cropped', () => {
    const cw = cameraWorld(world(1001));
    const base = postcardPose(cw, LAND, vpLand);
    const tall: CameraWorld = {
      ...cw,
      islands: cw.islands.map((i) => ({ ...i, peakY: i.peakY * 2.5 })),
      heightAt: (x, z) => cw.heightAt(x, z) * 2.5,
    };
    const raised = postcardPose(tall, LAND, vpLand);
    const camY = (p: typeof base): number => p.ty + p.dist * Math.sin(p.pitch * DEG);
    expect(camY(raised)).toBeGreaterThanOrEqual(camY(base) - 1e-6);
    for (const p of postcardPoints(tall)) {
      projectNdc(raised, LAND, p, o);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(1.001);
      expect(o.y).toBeLessThanOrEqual(
        FRAMING.postcard.horizon - FRAMING.postcard.horizonGap + 1e-3,
      );
      expect(o.y).toBeGreaterThanOrEqual(-1.001);
    }
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

describe('island lookup by theme (TASK-308)', () => {
  it('cam=island:<theme> finds the department island, with or without CameraWorld.theme', () => {
    const cw = cameraWorld(world(1001));
    expect(findIsland(cw, 'qa')?.archetypeName).toBe('Palmlagoon');
    expect(findIsland(cw, 'coding')?.archetypeName).toBe('Millbrook');
    expect(findIsland(cw, 'Design')?.archetypeName).toBe('Mossgrove');
    // world-view before the theme field: derived from the archetype display name
    const bare: CameraWorld = {
      ...cw,
      islands: cw.islands.map((i) => ({ ...i, theme: undefined })),
    };
    expect(findIsland(bare, 'qa')?.archetypeName).toBe('Palmlagoon');
    expect(findIsland(bare, 'Marketing')?.archetypeName).toBe('Beacon Rock');
    expect(findIsland(cw, cw.islands[2].name)).toBe(cw.islands[2]);
    expect(findIsland(cw, 'nope')).toBeUndefined();
  });
});
