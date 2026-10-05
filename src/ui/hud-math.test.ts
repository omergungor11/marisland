import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  angleDelta,
  angleToHour,
  compassDeg,
  dialStops,
  formatHour,
  hourToAngle,
  isDay,
  labelsOverlap,
  mixHex,
  nearestNorth,
  nextTimeStop,
  nextWeather,
  photoFilename,
  placeLabel,
  pointerToHour,
  type LabelBox,
} from './hud-math.ts';

const DEG = Math.PI / 180;

describe('time dial mapping', () => {
  it('puts noon at the top, 18:00 right, midnight bottom, 06:00 left', () => {
    expect(hourToAngle(12)).toBeCloseTo(0);
    expect(hourToAngle(18)).toBeCloseTo(Math.PI / 2);
    expect(hourToAngle(0)).toBeCloseTo(Math.PI);
    expect(hourToAngle(6)).toBeCloseTo((3 * Math.PI) / 2);
  });
  it('round-trips hour ↔ angle', () => {
    for (let h = 0; h < 24; h += 0.37) expect(angleToHour(hourToAngle(h))).toBeCloseTo(h, 9);
  });
  it('maps screen pointer offsets (y down) to hours', () => {
    expect(pointerToHour(0, -10)).toBeCloseTo(12);
    expect(pointerToHour(10, 0)).toBeCloseTo(18);
    expect(pointerToHour(0, 10)).toBeCloseTo(0);
    expect(pointerToHour(-10, 0)).toBeCloseTo(6);
    expect(Number.isNaN(pointerToHour(0, 0))).toBe(true);
  });
  it('formats hours', () => {
    expect(formatHour(15)).toBe('15:00');
    expect(formatHour(17.75)).toBe('17:45');
    expect(formatHour(23.999999)).toBe('23:59');
    expect(formatHour(-1)).toBe('23:00');
    expect(formatHour(24.5)).toBe('00:30');
  });
  it('cycles bible time stops from the current hour', () => {
    const stops = [7, 12, 15, 17.75, 19.25, 22, 2];
    expect(nextTimeStop(15, stops)).toBe(17.75);
    expect(nextTimeStop(15.01, stops)).toBe(17.75);
    expect(nextTimeStop(14.9, stops)).toBe(15);
    expect(nextTimeStop(23, stops)).toBe(2);
    expect(nextTimeStop(2, stops)).toBe(7);
    expect(nextTimeStop(3, [])).toBe(3);
  });
  it('day/night icon switch', () => {
    expect(isDay(12)).toBe(true);
    expect(isDay(22)).toBe(false);
    expect(isDay(3)).toBe(false);
  });
  it('builds sorted conic stops with a wrapped midnight colour', () => {
    const s = dialStops([
      { hour: 7, color: '#000000' },
      { hour: 20, color: '#FFFFFF' },
      { hour: 29, color: '#FFFFFF' },
    ]);
    expect(s[0].deg).toBe(0);
    expect(s[s.length - 1].deg).toBe(360);
    for (let i = 1; i < s.length; i++) expect(s[i].deg).toBeGreaterThanOrEqual(s[i - 1].deg);
    // 29 → 05:00 sorts first
    expect(s[1].deg).toBe(75);
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });
});

describe('photo + weather helpers', () => {
  it('names exported PNGs marisland-<seed>-<HH>.png', () => {
    expect(photoFilename(1001, 15.5)).toBe('marisland-1001-15.png');
    expect(photoFilename(42, 7.99)).toBe('marisland-42-07.png');
    expect(photoFilename(3, 0)).toBe('marisland-3-00.png');
  });
  it('cycles weather', () => {
    const c = ['clear', 'cloudy', 'rain', 'fog'] as const;
    expect(nextWeather('clear', c)).toBe('cloudy');
    expect(nextWeather('fog', c)).toBe('clear');
  });
});

describe('compass', () => {
  /** Screen-space angle (deg, clockwise from up) of world north (−z) for a camera azimuth. */
  function northOnScreen(az: number): number {
    const cam = new THREE.PerspectiveCamera(35, 1, 0.5, 3000);
    // Near top-down: the compass follows yaw; tilt only foreshortens it.
    const pitch = 89 * DEG;
    const d = 450;
    cam.position.set(
      Math.sin(az) * Math.cos(pitch) * d,
      Math.sin(pitch) * d,
      Math.cos(az) * Math.cos(pitch) * d,
    );
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const a = new THREE.Vector3(0, 0, 0).project(cam);
    const b = new THREE.Vector3(0, 0, -50).project(cam);
    // NDC y up → screen y down
    const dx = b.x - a.x;
    const dy = -(b.y - a.y);
    return (((Math.atan2(dx, -dy) / DEG) % 360) + 360) % 360;
  }
  it('needle follows north as the camera orbits', () => {
    for (const azDeg of [0, 30, 90, 135, 200, 300]) {
      const want = northOnScreen(azDeg * DEG);
      const got = (((compassDeg(azDeg * DEG) % 360) + 360) % 360) % 360;
      expect(Math.abs(angleDelta(want * DEG, got * DEG)) / DEG).toBeLessThan(1);
    }
  });
  it('resets to the nearest north without spinning', () => {
    expect(nearestNorth(0.3)).toBeCloseTo(0);
    expect(nearestNorth(4 * Math.PI + 0.2)).toBeCloseTo(4 * Math.PI);
    expect(nearestNorth(-Math.PI * 1.8)).toBeCloseTo(-2 * Math.PI);
  });
  it('angleDelta picks the short way', () => {
    expect(angleDelta(0.1, -0.1)).toBeCloseTo(-0.2);
    expect(angleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6);
  });
});

describe('label placement (width-aware collision)', () => {
  /** Portrait pill widths (disc + theme name, no island name): HQ … Research. */
  const PORTRAIT_W = [63, 91, 113, 63, 91, 97, 107];
  const H = 28;
  function layout(
    anchors: readonly { x: number; above: number; below: number }[],
    widths: readonly number[],
    view: { width: number; height: number },
    blocked?: (b: LabelBox) => boolean,
  ): LabelBox[] {
    const placed: LabelBox[] = [];
    anchors.forEach((a, i) =>
      placed.push(
        placeLabel(
          widths[i],
          H,
          [
            { x: a.x, y: a.above, cost: 0 },
            { x: a.x, y: a.below, cost: H * 1.5 },
          ],
          placed,
          view,
          blocked,
        ),
      ),
    );
    return placed;
  }
  function expectClean(boxes: LabelBox[], view: { width: number; height: number }): void {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      expect(b.x - b.w / 2).toBeGreaterThanOrEqual(8 - 1e-6);
      expect(b.x + b.w / 2).toBeLessThanOrEqual(view.width - 8 + 1e-6);
      expect(b.y - b.h / 2).toBeGreaterThanOrEqual(8 - 1e-6);
      for (let j = 0; j < i; j++) expect(labelsOverlap(b, boxes[j])).toBe(false);
    }
  }

  it('keeps a free label exactly at its wanted spot', () => {
    const b = placeLabel(100, H, [{ x: 200, y: 300, cost: 0 }], [], { width: 800, height: 600 });
    expect(b).toEqual({ x: 200, y: 300, w: 100, h: H });
  });

  it('nudges a colliding label upward first, measuring both widths', () => {
    const view = { width: 800, height: 600 };
    const first = placeLabel(160, H, [{ x: 400, y: 300, cost: 0 }], [], view);
    // 120 px away: clear for narrow pills, colliding for these wide ones
    const second = placeLabel(140, H, [{ x: 520, y: 300, cost: 0 }], [first], view);
    expect(labelsOverlap(first, second)).toBe(false);
    expect(second.y).toBeLessThan(300);
  });

  it('places 7 theme labels at 390×844 with no overlap (overview cluster)', () => {
    const view = { width: 390, height: 844 };
    // a portrait overview: the archipelago overhangs both edges, islands stacked closely
    const anchors = [
      { x: 190, above: 380, below: 470 },
      { x: 60, above: 300, below: 360 },
      { x: 330, above: 290, below: 350 },
      { x: 210, above: 250, below: 300 },
      { x: -40, above: 470, below: 540 },
      { x: 430, above: 450, below: 520 },
      { x: 180, above: 560, below: 600 },
    ];
    expectClean(layout(anchors, PORTRAIT_W, view), view);
  });

  it('never overlaps across a seeded sweep of crowded portrait layouts, dock kept clear', () => {
    const view = { width: 390, height: 844 };
    const dock = { top: 844 - 90, half: 150 };
    const blocked = (b: LabelBox): boolean =>
      b.y + b.h / 2 > dock.top && Math.abs(b.x - view.width / 2) < dock.half + b.w / 2;
    let s = 12345;
    const rnd = (): number => (s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32;
    for (let n = 0; n < 200; n++) {
      const anchors = PORTRAIT_W.map(() => {
        const x = -60 + rnd() * 510;
        const above = 150 + rnd() * 500;
        return { x, above, below: above + 30 + rnd() * 80 };
      });
      const boxes = layout(anchors, PORTRAIT_W, view, blocked);
      expectClean(boxes, view);
      for (const b of boxes) expect(blocked(b)).toBe(false);
    }
  });

  it('places 7 wide labels (with island names) at 1920×1080 with no overlap', () => {
    const view = { width: 1920, height: 1080 };
    const wide = PORTRAIT_W.map((w) => w + 80);
    const anchors = [
      { x: 960, above: 420, below: 640 },
      { x: 700, above: 380, below: 520 },
      { x: 1210, above: 360, below: 500 },
      { x: 880, above: 300, below: 380 },
      { x: 520, above: 600, below: 720 },
      { x: 1400, above: 580, below: 700 },
      { x: 1010, above: 400, below: 470 },
    ];
    expectClean(layout(anchors, wide, view), view);
  });
});
