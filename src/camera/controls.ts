import * as THREE from 'three';
import CameraControls from 'camera-controls';
import type { System } from '../core/loop.ts';
import { CAMERA, CAMERA_MOVE, TIERS } from '../content/tiers.ts';
import { pitchForDistance, tierForDistance } from '../detail/tier.ts';
import { DEG, clamp } from '../core/math/index.ts';
import type { Emitter, AppEvents } from '../core/events.ts';
import { angleDelta, nearestNorth } from '../ui/hud-math.ts';

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

/** An orbit pose: target, distance (u), pitch (deg from horizontal), azimuth (deg). */
export interface OrbitPose {
  tx: number;
  ty: number;
  tz: number;
  dist: number;
  pitch: number;
  /** camera-controls convention: the camera sits at (sin az, ·, cos az) around the target. */
  az: number;
}

export interface CameraSystem extends System {
  controls: CameraControls;
  camera: THREE.PerspectiveCamera;
  /** Current orbit distance (u). */
  readonly distance: number;
  readonly tier: number;
  readonly reducedMotion: boolean;
  setWorld(world: CameraWorld): void;
  /** Apply a preset instantly (capture) or with a transition. Grammar in ARCHITECTURE §6. */
  applyPreset(preset: string, transition: boolean): void;
  /** Start / stop the slow idle orbit. `immediate` skips the idle wait (end of the intro). */
  setIdleOrbit(on: boolean, immediate?: boolean): void;
  /** Reduced motion: no orbit, cuts instead of fly-tos. */
  setReducedMotion(on: boolean): void;
  /** The T0 default pose — `applyPreset('overview')` and the intro's last key use it. */
  overviewPose(): OrbitPose;
  /** Fly to an island (fit its sphere, keep the heading). A cut under reduced motion. */
  flyToIsland(name: string): boolean;
  /** Island under a CSS-pixel point of the canvas (terrain ray-march), or null. */
  islandAt(clientX: number, clientY: number): string | null;
  /** Spring the heading back to north, the short way round. */
  resetNorth(): void;
  /** Any user input: restarts the idle timer and stops a running orbit. */
  poke(): void;
  /** The intro drives the pose: no orbit, no terrain push. */
  setSuspended(on: boolean): void;
  /** Photo-mode freeze: no idle orbit while on. */
  setFrozen(on: boolean): void;
  /** Vertical FOV in degrees, clamped to the photo range (photo mode). */
  setFov(deg: number): void;
}

const _target = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _box = new THREE.Box3();
const _sphere = new THREE.Sphere();
const _ndc = new THREE.Vector2();
const _ray = new THREE.Raycaster();

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
  // Touch (ARCHITECTURE §6): one finger pans; two fingers pan + pinch-zoom toward the pinch
  // centre + twist-rotate (the twist is ours, camera-controls has none); three fingers orbit/tilt.
  controls.touches.one = CameraControls.ACTION.TOUCH_TRUCK;
  controls.touches.two = CameraControls.ACTION.TOUCH_DOLLY_TRUCK;
  controls.touches.three = CameraControls.ACTION.TOUCH_ROTATE;
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
  let suspended = false;
  let frozen = false;
  let flying = false;
  /** Current orbit speed (deg/s), eased in. */
  let orbitSpeed = 0;

  const applyPitchClamp = (): void => {
    const [lo, hi] = pitchBand(controls.distance);
    controls.minPolarAngle = (90 - hi) * DEG;
    controls.maxPolarAngle = (90 - lo) * DEG;
  };

  const applyBounds = (): void => {
    const r = world.radius;
    _box.min.set(world.centerX - r, -5, world.centerZ - r);
    _box.max.set(world.centerX + r, 60, world.centerZ + r);
    controls.setBoundary(_box);
    controls.boundaryFriction = 0.2;
  };

  /** Fly-tos use a slower critically damped smoothTime until the camera rests. */
  const startFly = (): void => {
    flying = true;
    controls.smoothTime = CAMERA_MOVE.flySmoothTime;
  };
  const endFly = (): void => {
    if (!flying) return;
    flying = false;
    controls.smoothTime = CAMERA.smoothTime;
  };
  const poke = (): void => {
    idleTimer = 0;
    orbitSpeed = 0;
  };
  const markActive = (): void => {
    userActive = true;
    poke();
  };

  const cleanups: Array<() => void> = [];
  function listen<K extends keyof WindowEventMap>(
    target: EventTarget,
    type: K,
    fn: (e: WindowEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void {
    const h = fn as EventListener;
    target.addEventListener(type, h, opts);
    cleanups.push(() => target.removeEventListener(type, h, opts));
  }

  /** The archipelago-fitting T0 pose; pitch kept inside the pitch-curve slack. */
  const overviewPose = (): OrbitPose => {
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
    // User rotation and the idle orbit clamp the polar angle to the pitch band; a pose outside
    // it would snap on the first touch, so keep the default reachable.
    const [lo, hi] = pitchBand(dist);
    const pitch = clamp(o.pitch, lo, hi);
    return { tx: world.centerX, ty: 0, tz: world.centerZ, dist, pitch, az: o.azimuthDeg };
  };

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
    get reducedMotion() {
      return reduced;
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
          const p = overviewPose();
          lookFromOrbit(controls, p.tx, p.ty, p.tz, p.dist, p.pitch, p.az, t);
          break;
        }
        case 'island': {
          const isl = findIsland(world, arg);
          if (isl) {
            // T1 framing: fit the island sphere, then settle on the pitch curve.
            _sphere.center.set(isl.cx, Math.max(0, isl.peakY * 0.3), isl.cz);
            _sphere.radius = isl.radius * CAMERA_MOVE.islandFitScale;
            // Small islands (Lonely Palm) get a T3 framing: the fit is clamped only by the global bounds.
            const dist = clamp(
              _sphere.radius / Math.sin((camera.fov * DEG) / 2),
              CAMERA.minDist * 2.2,
              CAMERA_MOVE.islandMaxDist,
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
            return;
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
            return;
          }
        }
      }
      // Transitions take the short way round (the idle orbit accumulates whole turns).
      if (t) {
        controls.normalizeRotations();
        startFly();
      } else {
        endFly();
        controls.update(0);
      }
      applyPitchClamp();
      if (!t) controls.update(0);
      updateTier();
    },
    setIdleOrbit(on, immediate = false) {
      idleOrbit = on;
      orbitSpeed = 0;
      idleTimer = on && immediate ? CAMERA.idleAfter : 0;
    },
    setReducedMotion(on) {
      reduced = on;
      orbitSpeed = 0;
    },
    overviewPose,
    flyToIsland(name) {
      const isl = findIsland(world, name);
      if (!isl) return false;
      _sphere.center.set(isl.cx, Math.max(0, isl.peakY * 0.3), isl.cz);
      _sphere.radius = isl.radius * CAMERA_MOVE.islandFitScale;
      const dist = clamp(
        _sphere.radius / Math.sin((camera.fov * DEG) / 2),
        CAMERA.minDist * 2.2,
        CAMERA_MOVE.islandMaxDist,
      );
      const t = !reduced;
      lookFromOrbit(
        controls,
        _sphere.center.x,
        _sphere.center.y,
        _sphere.center.z,
        dist,
        pitchForDistance(dist),
        controls.azimuthAngle / DEG,
        t,
      );
      controls.normalizeRotations();
      if (t) startFly();
      else controls.update(0);
      applyPitchClamp();
      poke();
      return true;
    },
    islandAt(clientX, clientY) {
      const rect = dom.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      _ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      camera.updateMatrixWorld();
      _ray.setFromCamera(_ndc, camera);
      const o = _ray.ray.origin;
      const d = _ray.ray.direction;
      // March to the first point under the terrain (or the sea plane at y = 0);
      // the step grows with distance (coarse far away, fine near the camera).
      let hit = false;
      for (let s = camera.near; s < camera.far; s += CAMERA_MOVE.pickStep * Math.max(1, s / 400)) {
        _pos.copy(d).multiplyScalar(s).add(o);
        if (_pos.y <= Math.max(0, world.heightAt(_pos.x, _pos.z))) {
          hit = true;
          break;
        }
      }
      if (!hit) return null;
      let best: string | null = null;
      let bestScore = Infinity;
      for (const i of world.islands) {
        // Land scores < 1; a click on the shallows around an island still counts.
        const score = Math.hypot(_pos.x - i.cx, _pos.z - i.cz) / Math.max(1, i.radius);
        if (score < CAMERA_MOVE.pickSlack && score < bestScore) {
          bestScore = score;
          best = i.name;
        }
      }
      return best;
    },
    resetNorth() {
      controls.normalizeRotations();
      void controls.rotateAzimuthTo(nearestNorth(controls.azimuthAngle), !reduced);
      poke();
    },
    poke,
    setSuspended(on) {
      suspended = on;
      orbitSpeed = 0;
    },
    setFrozen(on) {
      frozen = on;
      orbitSpeed = 0;
    },
    setFov(deg) {
      camera.fov = clamp(deg, CAMERA.photoFov[0], CAMERA.photoFov[1]);
      camera.updateProjectionMatrix();
    },
    update(dt) {
      if (suspended) {
        // The intro owns the pose; keep the controls' internal state in sync only.
        controls.update(dt);
        updateTier();
        return;
      }
      applyPitchClamp();
      // Idle orbit after inactivity (ARCHITECTURE §6): eases in, distance untouched.
      if (idleOrbit && !reduced && !frozen && !userActive && !flying) {
        idleTimer += dt;
        const want = idleTimer >= CAMERA.idleAfter ? CAMERA.idleOrbit : 0;
        const k = 1 - Math.exp((-3 * Math.min(dt, 0.1)) / CAMERA_MOVE.orbitRampSeconds);
        orbitSpeed += (want - orbitSpeed) * k;
        if (orbitSpeed > 1e-4) void controls.rotate(orbitSpeed * DEG * dt, 0, false);
      } else {
        orbitSpeed = 0;
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
      for (const c of cleanups) c();
      cleanups.length = 0;
      controls.dispose();
    },
  };

  if (interactive) {
    controls.addEventListener('controlstart', () => {
      markActive();
      endFly();
    });
    controls.addEventListener('control', markActive);
    controls.addEventListener('controlend', () => {
      userActive = false;
    });
    controls.addEventListener('rest', endFly);
    // Any input anywhere (HUD included) restarts the idle timer.
    for (const type of ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const)
      listen(window, type, poke, { passive: true });

    // Two-finger twist → azimuth: the map turns with the fingers.
    const touches = new Map<number, { x: number; y: number }>();
    let twist = NaN;
    const twistAngle = (): number => {
      const [a, b] = Array.from(touches.values());
      return Math.atan2(b.y - a.y, b.x - a.x);
    };
    // Tap / double-tap → fly to the island (a click moved < 6 px within < 300 ms).
    let down = { x: 0, y: 0, t: 0, id: -1 };
    let lastTap = { x: 0, y: 0, t: -1e9 };
    listen(dom, 'pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId };
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      twist = touches.size === 2 ? twistAngle() : NaN;
    });
    listen(dom, 'pointermove', (e) => {
      if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size !== 2 || !controls.enabled) return;
      const a = twistAngle();
      if (Number.isFinite(twist)) {
        const d = angleDelta(twist, a);
        if (Math.abs(d) > 1e-4) {
          void controls.rotate(d, 0, false);
          markActive();
        }
      }
      twist = a;
    });
    const up = (e: PointerEvent): void => {
      const wasTouch = touches.delete(e.pointerId);
      twist = touches.size === 2 ? twistAngle() : NaN;
      if (e.type !== 'pointerup' || e.pointerId !== down.id || (wasTouch && touches.size > 0))
        return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved >= CAMERA.clickMaxPx || e.timeStamp - down.t >= CAMERA.clickMaxMs) return;
      const isDouble =
        e.timeStamp - lastTap.t < CAMERA.doubleTapMs &&
        Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < CAMERA.doubleTapPx;
      if (!isDouble) {
        lastTap = { x: e.clientX, y: e.clientY, t: e.timeStamp };
        return;
      }
      lastTap.t = -1e9;
      if (!controls.enabled || suspended) return;
      const name = sys.islandAt(e.clientX, e.clientY);
      if (name) sys.flyToIsland(name);
    };
    listen(dom, 'pointerup', up);
    listen(dom, 'pointercancel', up);
  }

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

/**
 * Allowed pitch (deg from horizontal) at an orbit distance: the pitch curve ± slack, widened at
 * T0 down to the tier's `pitchMin` (ART_BIBLE §6: T0 58–70°) so the overview default (58° at a
 * fitted distance up to 800 u) is a reachable pose and the first rotate / idle orbit never snaps.
 */
export function pitchBand(dist: number): [number, number] {
  const curve = pitchForDistance(dist);
  let lo = curve - CAMERA.pitchSlack;
  if (dist >= TIERS[0].minDist) lo = Math.min(lo, TIERS[0].pitchMin);
  return [lo, curve + CAMERA.pitchSlack];
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
export function lookFromOrbit(
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
