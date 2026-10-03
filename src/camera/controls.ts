import * as THREE from 'three';
import CameraControls from 'camera-controls';
import type { System } from '../core/loop.ts';
import { CAMERA, CAMERA_MOVE } from '../content/tiers.ts';
import { pitchForDistance, tierForDistance } from '../detail/tier.ts';
import { DEG, clamp } from '../core/math/index.ts';
import type { Emitter, AppEvents } from '../core/events.ts';

CameraControls.install({ THREE });

/** What the camera needs from the world: bounds, island anchors and the ground height. */
export interface CameraWorld {
  centerX: number;
  centerZ: number;
  /** Radius of the archipelago for the overview pose and the target clamp. */
  radius: number;
  islands: Array<{
    name: string;
    archetypeName?: string;
    cx: number;
    cz: number;
    radius: number;
    peakY: number;
    anchors: Record<string, { x: number; z: number; rotY: number }>;
  }>;
  heightAt(x: number, z: number): number;
}

export interface CameraSystem extends System {
  controls: CameraControls;
  camera: THREE.PerspectiveCamera;
  /** Current orbit distance (u). */
  readonly distance: number;
  readonly tier: number;
  setWorld(world: CameraWorld): void;
  /** Apply a preset instantly (capture) or with a transition. Grammar in ARCHITECTURE §6. */
  applyPreset(preset: string, transition: boolean): void;
  /** Start / stop the slow idle orbit. */
  setIdleOrbit(on: boolean): void;
  /** Reduced motion: no orbit, snappier moves. */
  setReducedMotion(on: boolean): void;
}

const _target = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _box = new THREE.Box3();
const _sphere = new THREE.Sphere();

export function createCameraSystem(
  camera: THREE.PerspectiveCamera,
  dom: HTMLElement,
  events: Emitter<AppEvents>,
  interactive: boolean,
): CameraSystem {
  camera.fov = CAMERA.fov;
  camera.near = 0.5;
  camera.far = 3000;
  camera.updateProjectionMatrix();

  const controls = new CameraControls(camera, interactive ? dom : undefined);
  controls.minDistance = CAMERA.minDist;
  controls.maxDistance = CAMERA.maxDist;
  controls.dollyToCursor = true;
  controls.infinityDolly = false;
  controls.smoothTime = CAMERA.smoothTime;
  controls.draggingSmoothTime = CAMERA.draggingSmoothTime;
  controls.restThreshold = 0.001;
  controls.mouseButtons.left = CameraControls.ACTION.TRUCK;
  controls.mouseButtons.right = CameraControls.ACTION.ROTATE;
  controls.mouseButtons.middle = CameraControls.ACTION.DOLLY;
  controls.mouseButtons.wheel = CameraControls.ACTION.DOLLY;
  controls.touches.one = CameraControls.ACTION.TOUCH_TRUCK;
  controls.touches.two = CameraControls.ACTION.TOUCH_DOLLY_ROTATE;
  controls.touches.three = CameraControls.ACTION.TOUCH_TRUCK;
  controls.verticalDragToForward = false;

  let world: CameraWorld = {
    centerX: 0,
    centerZ: 0,
    radius: 300,
    islands: [],
    heightAt: () => 0,
  };
  let tier = 0;
  let idleOrbit = false;
  let reduced = false;
  let idleTimer = 0;
  let userActive = false;

  const applyPitchClamp = (): void => {
    const d = controls.distance;
    const pitch = pitchForDistance(d);
    const polar = 90 - pitch;
    controls.minPolarAngle = (polar - CAMERA.pitchSlack) * DEG;
    controls.maxPolarAngle = (polar + CAMERA.pitchSlack) * DEG;
  };

  const applyBounds = (): void => {
    const r = world.radius;
    _box.min.set(world.centerX - r, -5, world.centerZ - r);
    _box.max.set(world.centerX + r, 60, world.centerZ + r);
    controls.setBoundary(_box);
    controls.boundaryFriction = 0.2;
  };

  const markActive = (): void => {
    userActive = true;
    idleTimer = 0;
  };
  if (interactive) {
    controls.addEventListener('controlstart', markActive);
    controls.addEventListener('control', markActive);
    controls.addEventListener('controlend', () => {
      userActive = false;
    });
  }

  const sys: CameraSystem = {
    name: 'camera',
    controls,
    camera,
    get distance() {
      return controls.distance;
    },
    get tier() {
      return tier;
    },
    setWorld(w) {
      world = w;
      applyBounds();
    },
    applyPreset(preset, transition) {
      const t = transition && !reduced;
      const [kind, arg] = splitPreset(preset);
      switch (kind) {
        case 'overview': {
          const o = CAMERA.overview;
          // Fit the archipelago: distance so the cluster radius fills ~80 % of the vertical FOV
          // at the overview pitch (foreshortened), clamped to the T0 range.
          // Portrait: the horizontal FOV is the limiting one.
          const vFov = camera.fov * DEG;
          const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
          const fit =
            (world.radius * 1.15) /
            Math.sin(Math.min(vFov, hFov) / 2) /
            Math.max(0.6, Math.sin(o.pitch * DEG));
          const dist = clamp(Math.max(o.dist, fit), o.dist, CAMERA.maxDist);
          lookFromOrbit(controls, world.centerX, 0, world.centerZ, dist, o.pitch, o.azimuthDeg, t);
          break;
        }
        case 'island': {
          const isl = findIsland(world, arg);
          if (isl) {
            // T1 framing: fit the island sphere, then settle on the pitch curve.
            _sphere.center.set(isl.cx, Math.max(0, isl.peakY * 0.3), isl.cz);
            _sphere.radius = isl.radius * 1.35;
            // Small islands (Lonely Palm) get a T3 framing: the fit is clamped only by the global bounds.
            const dist = clamp(
              _sphere.radius / Math.sin((camera.fov * DEG) / 2),
              CAMERA.minDist * 2.2,
              380,
            );
            lookFromOrbit(
              controls,
              _sphere.center.x,
              _sphere.center.y,
              _sphere.center.z,
              dist,
              pitchForDistance(dist),
              30,
              t,
            );
          } else {
            sys.applyPreset('overview', transition);
          }
          break;
        }
        case 'village':
        case 'dock':
        case 'shore':
        case 'macro-beach': {
          const dist = kind === 'village' ? 80 : kind === 'dock' ? 70 : kind === 'shore' ? 40 : 18;
          const a = findAnchor(
            world,
            kind === 'macro-beach' ? 'beach' : kind === 'shore' ? 'beach' : kind,
            arg,
          );
          const y = world.heightAt(a.x, a.z);
          const azimuth = (a.rotY / DEG + 180) % 360;
          lookFromOrbit(
            controls,
            a.x,
            Math.max(0, y),
            a.z,
            dist,
            pitchForDistance(dist),
            azimuth,
            t,
          );
          break;
        }
        default: {
          const parts = preset.split(',').map(Number);
          if (parts.length === 6 && parts.every((n) => Number.isFinite(n))) {
            void controls.setLookAt(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], t);
          } else {
            sys.applyPreset('overview', transition);
          }
        }
      }
      if (!t) controls.update(0);
      applyPitchClamp();
      if (!t) controls.update(0);
      updateTier();
    },
    setIdleOrbit(on) {
      idleOrbit = on;
    },
    setReducedMotion(on) {
      reduced = on;
      if (on) idleOrbit = false;
    },
    update(dt) {
      applyPitchClamp();
      // Idle orbit after inactivity (ARCHITECTURE §6).
      if (idleOrbit && !reduced && !userActive) {
        idleTimer += dt;
        if (idleTimer > CAMERA.idleAfter) controls.azimuthAngle += CAMERA.idleOrbit * DEG * dt;
      }
      controls.update(dt);
      // Keep the camera above the terrain.
      controls.getPosition(_pos);
      const ground = world.heightAt(_pos.x, _pos.z) + CAMERA.terrainClearance;
      if (_pos.y < ground) {
        controls.getTarget(_target);
        void controls.setLookAt(_pos.x, ground, _pos.z, _target.x, _target.y, _target.z, false);
        controls.update(0);
      }
      updateTier();
    },
    dispose() {
      controls.dispose();
    },
  };

  function updateTier(): void {
    const next = tierForDistance(controls.distance, tier);
    if (next !== tier) {
      const prev = tier;
      tier = next;
      events.emit('tierChanged', { tier, prev });
    }
  }

  return sys;
}

function splitPreset(preset: string): [string, string] {
  const i = preset.indexOf(':');
  if (i < 0) return [preset.trim(), ''];
  return [preset.slice(0, i).trim(), preset.slice(i + 1).trim()];
}

function findIsland(world: CameraWorld, name: string): CameraWorld['islands'][number] | undefined {
  const norm = (v: string | undefined): string => (v ?? '').toLowerCase().replace(/\s+/g, '');
  const n = norm(name);
  return (
    world.islands.find((i) => norm(i.name) === n) ??
    world.islands.find((i) => norm(i.archetypeName) === n) ??
    (n === '' ? world.islands[0] : undefined)
  );
}

function findAnchor(
  world: CameraWorld,
  anchor: string,
  islandName: string,
): { x: number; z: number; rotY: number } {
  const isl = findIsland(world, islandName) ?? world.islands[0];
  if (!isl) return { x: world.centerX, z: world.centerZ, rotY: 0 };
  const a = isl.anchors[anchor] ?? isl.anchors.beach ?? isl.anchors.peak;
  if (a) return a;
  return { x: isl.cx, z: isl.cz + isl.radius * 0.7, rotY: 0 };
}

/** Place the camera on an orbit: target, distance, pitch (deg from horizontal), azimuth (deg). */
function lookFromOrbit(
  controls: CameraControls,
  tx: number,
  ty: number,
  tz: number,
  dist: number,
  pitchDeg: number,
  azimuthDeg: number,
  transition: boolean,
): void {
  const pitch = pitchDeg * DEG;
  const az = azimuthDeg * DEG;
  const px = tx + Math.sin(az) * Math.cos(pitch) * dist;
  const pz = tz + Math.cos(az) * Math.cos(pitch) * dist;
  const py = ty + Math.sin(pitch) * dist;
  void controls.setLookAt(px, py, pz, tx, ty, tz, transition);
}

export { CAMERA_MOVE };
