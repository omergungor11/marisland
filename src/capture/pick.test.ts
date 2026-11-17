import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { pickPoint, projectPx, type PickShips } from './pick.ts';

const camera = new THREE.PerspectiveCamera(35, 960 / 540, 0.5, 3000);
camera.position.set(0, 50, 100);
camera.lookAt(0, 0, 0);

// marketing is THEME_IDS[2] (hq, coding, marketing, …)
const ships: PickShips = {
  positions(out, ids) {
    out.set([0, 0, 0, 3]);
    if (ids) ids[0] = 2;
    return 1;
  },
};

describe('capture pick', () => {
  it('projects the look-at target to the canvas centre', () => {
    const p = projectPx(new THREE.Vector3(0, 0, 0), camera, 960, 540);
    expect(p?.x).toBeCloseTo(480, 3);
    expect(p?.y).toBeCloseTo(270, 3);
  });

  it('a point behind the camera or outside the canvas has no pixel', () => {
    expect(projectPx(new THREE.Vector3(0, 50, 400), camera, 960, 540)).toBeNull();
    expect(projectPx(new THREE.Vector3(900, 0, 0), camera, 960, 540)).toBeNull();
  });

  it('ship:<theme> resolves to that ship, an absent ship to null, xy passes through', () => {
    const at = pickPoint({ kind: 'ship', theme: 'marketing' }, ships, camera, 960, 540);
    expect(at?.x).toBeCloseTo(480, 3);
    expect(pickPoint({ kind: 'ship', theme: 'qa' }, ships, camera, 960, 540)).toBeNull();
    expect(pickPoint({ kind: 'ship', theme: 'marketing' }, null, camera, 960, 540)).toBeNull();
    expect(pickPoint({ kind: 'xy', x: 12, y: 34 }, null, camera, 960, 540)).toEqual({
      x: 12,
      y: 34,
    });
  });
});
