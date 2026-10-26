import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { Quality } from '../../core/params.ts';
import type { Rng } from '../../core/rng.ts';
import { BURSTS, type BurstGlyph, type BurstPattern, type BurstSpec } from '../../content/anim.ts';
import { makeLifeMaterial } from '../../life/life-material.ts';

/**
 * Click-reaction particle bursts (TASK-162): hearts, sparkles, leaves, "!" and puffs.
 *
 * Zero new programs and one draw call: all five glyphs are flat meshes merged into ONE geometry
 * drawn with the shared creature material (`mar-lit:life`). Per-vertex `limb = (glyph, 0, 0, 6)`
 * and per-instance `aGait.y = glyph` make the vertex shader collapse every glyph but the
 * instance's own (the same trick as the villager hat variants). Particles are billboarded and
 * animated on the CPU — a closed-form function of the engine clock, so capture mode replays them
 * exactly; with nothing alive the mesh draws nothing.
 */
export interface BurstAnchor {
  /** Target centre on the ground (world). */
  x: number;
  y: number;
  z: number;
  /** Proxy radius and height of the target (u, instance scale applied). */
  r: number;
  h: number;
  /** Ground height under the target (particles never sink below it). */
  floor: number;
}

export interface Bursts {
  mesh: THREE.InstancedMesh;
  /** Spawn one burst at engine time `time`. Deterministic given `rng`. */
  emit(spec: BurstSpec, a: BurstAnchor, time: number, rng: Rng): void;
  /**
   * Per frame: pose every live particle for engine time `time`; returns how many are alive.
   * `scale` (0..1) shrinks every particle (the firework show fades out in rain).
   */
  update(time: number, camera: THREE.Camera, scale?: number): number;
  /** Drop every particle (a re-seeded show). */
  clear(): void;
  readonly capacity: number;
}

export const GLYPH_ID: Record<BurstGlyph, number> = {
  puff: 0,
  heart: 1,
  sparkle: 2,
  leaf: 3,
  bang: 4,
  streak: 5,
  glow: 6,
};
const PATTERN_ID: Record<BurstPattern, number> = {
  ring: 0,
  rise: 1,
  fall: 2,
  pop: 3,
  sphere: 4,
  willow: 5,
  mirror: 6,
};
const SPH = BURSTS.sphere;
const WIL = BURSTS.willow;
const MIR = BURSTS.mirror;
/** Streak glyph: head circle centre (x) and radius in the ±1 box (the tail runs to x = −1). */
const STREAK_HEAD = { x: 0.6, r: 0.4 };
/** Streak head diameter as a share of the particle size. */
const STREAK_WIDTH = 0.6;

export interface BurstsOptions {
  /** Pool size (default BURSTS.capacity[quality]). */
  capacity?: number;
  /** Glyphs glow at night (the firework pool): emissive = 1 on every vertex. */
  emissive?: boolean;
  /** Quads never shrink below this fraction of the camera distance (default BURSTS.minScreenFrac). */
  minScreenFrac?: number;
}

/** Glyph outlines in a ±1 box, counter-clockwise (faces +z). */
function glyphShapes(): THREE.Shape[][] {
  const poly = (pts: Array<[number, number]>): THREE.Shape =>
    new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const circle = (cx: number, cy: number, r: number, n = 20): THREE.Shape =>
    poly(
      Array.from({ length: n }, (_, i): [number, number] => {
        const a = (i / n) * Math.PI * 2;
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
      }),
    );
  const heart = poly(
    Array.from({ length: 40 }, (_, i): [number, number] => {
      const t = (i / 40) * Math.PI * 2;
      return [
        (16 * Math.sin(t) ** 3) / 17,
        (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 +
          0.05,
      ];
    }),
  );
  const sparkle = poly(
    Array.from({ length: 8 }, (_, i): [number, number] => {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? 1 : 0.26;
      return [Math.cos(a) * r, Math.sin(a) * r];
    }),
  );
  const leafTop = Array.from({ length: 13 }, (_, i): [number, number] => {
    const x = -1 + (i / 12) * 2;
    return [x, 0.55 * Math.pow(Math.max(0, 1 - x * x), 0.85)];
  });
  const leafBottom = Array.from({ length: 11 }, (_, i): [number, number] => {
    const x = 0.83 - (i / 10) * 1.66;
    return [x, -0.55 * Math.pow(Math.max(0, 1 - x * x), 0.85)];
  });
  const leaf = poly([...leafTop, ...leafBottom]);
  const bar = poly([
    [-0.2, 0.95],
    [0.2, 0.95],
    [0.12, -0.35],
    [-0.12, -0.35],
  ]);
  return [[circle(0, 0, 1)], [heart], [sparkle], [leaf], [bar, circle(0, -0.75, 0.19)]];
}

/** Streak: a teardrop, round head at +x tapering to a point at x = −1 (TASK-496). */
function streakShape(): THREE.Shape {
  const { x, r } = STREAK_HEAD;
  const pts = [new THREE.Vector2(-1, 0)];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI;
    pts.push(new THREE.Vector2(x + Math.cos(a) * r, Math.sin(a) * r));
  }
  return new THREE.Shape(pts);
}

function buildGlyphGeometry(emissive: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const limb: number[] = [];
  const col: number[] = [];
  const em: number[] = [];
  // limb.z = dither-out share (life material, mode 6): the streak's tail and the glow's rim fade
  const vert = (id: number, x: number, y: number, cut: number): void => {
    pos.push(x, y, 0);
    nrm.push(0, 0, 1);
    limb.push(id, 0, cut, 6);
    col.push(1, 1, 1);
    em.push(1);
  };
  const shapes = glyphShapes();
  shapes.push([streakShape()]);
  shapes.forEach((list, id) => {
    for (const shape of list) {
      const g = new THREE.ShapeGeometry(shape).toNonIndexed();
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++)
        vert(id, p.getX(i), p.getY(i), id === GLYPH_ID.streak ? Math.max(0, -p.getX(i)) * 0.85 : 0);
      g.dispose();
    }
  });
  // glow: a fan disc, solid-ish centre, dithered out toward the rim
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    vert(GLYPH_ID.glow, 0, 0, 0.35);
    vert(GLYPH_ID.glow, Math.cos(a0), Math.sin(a0), 1);
    vert(GLYPH_ID.glow, Math.cos(a1), Math.sin(a1), 1);
  }
  const geo = new THREE.BufferGeometry();
  if (emissive) geo.setAttribute('emissive', new THREE.Float32BufferAttribute(em, 1));
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('limb', new THREE.Float32BufferAttribute(limb, 4));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _p0 = new THREE.Vector3();
const _cr = new THREE.Vector3();
const _cu = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export function createBursts(scope: Scope, quality: Quality, opts: BurstsOptions = {}): Bursts {
  const capacity = opts.capacity ?? BURSTS.capacity[quality];
  const minFrac = opts.minScreenFrac ?? BURSTS.minScreenFrac;
  const geo = scope.add(buildGlyphGeometry(opts.emissive ?? false));
  const aGait = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  aGait.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aGait', aGait);
  const mat = scope.add(makeLifeMaterial('life:burst', true));
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.name = 'bursts';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // allocate instanceColor up front (a later allocation would change the program parameters)
  for (let i = 0; i < capacity; i++) {
    mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    mesh.setMatrixAt(i, ZERO);
  }
  mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  scope.add(mesh);

  const colours = new Map<string, THREE.Color>();
  const colourOf = (hex: string): THREE.Color => {
    let c = colours.get(hex);
    if (!c) {
      c = new THREE.Color(hex);
      colours.set(hex, c);
    }
    return c;
  };

  // SoA particle records
  const o = new Float32Array(capacity * 3);
  const v = new Float32Array(capacity * 3);
  const born = new Float32Array(capacity).fill(1e9);
  const life = new Float32Array(capacity);
  const size = new Float32Array(capacity);
  const glyph = new Uint8Array(capacity);
  const floorY = new Float32Array(capacity);
  const seed = new Float32Array(capacity);
  const pat = new Uint8Array(capacity);
  const trail = new Float32Array(capacity);
  let next = 0;
  let high = 0;

  const put = (
    i: number,
    ox: number,
    oy: number,
    oz: number,
    t0: number,
    vx: number,
    vy: number,
    vz: number,
    lifeS: number,
    sz: number,
    g: number,
    fl: number,
    sd: number,
    pt: number,
    c: THREE.Color,
    tr: number,
  ): void => {
    o[i * 3] = ox;
    o[i * 3 + 1] = oy;
    o[i * 3 + 2] = oz;
    v[i * 3] = vx;
    v[i * 3 + 1] = vy;
    v[i * 3 + 2] = vz;
    born[i] = t0;
    life[i] = lifeS;
    size[i] = sz;
    glyph[i] = g;
    floorY[i] = fl;
    seed[i] = sd;
    pat[i] = pt;
    trail[i] = tr;
    aGait.setXYZ(i, 0, g, 0);
    mesh.setColorAt(i, c);
  };

  /** Position of particle `i` at `age` s (pattern motion; mirrors the design in content/anim). */
  const posAt = (i: number, age: number, u: number, out: THREE.Vector3): void => {
    const px = o[i * 3];
    const py = o[i * 3 + 1];
    const pz = o[i * 3 + 2];
    const vx = v[i * 3];
    const vy = v[i * 3 + 1];
    const vz = v[i * 3 + 2];
    const sd = seed[i];
    switch (pat[i]) {
      case 0: {
        // ring: fast out with drag, a little lift
        const k = (1 - Math.exp(-4 * age)) / 4;
        out.set(px + vx * k, py + vy * k + 0.25 * age, pz + vz * k);
        break;
      }
      case 1: {
        // rise: ease out, lateral sway
        const k = age * (1 - 0.4 * u);
        const sw = Math.sin(age * 3 + sd * 11) * 0.12;
        out.set(
          px + vx * k + Math.cos(sd * 6.2831853) * sw,
          py + vy * k,
          pz + vz * k + Math.sin(sd * 6.2831853) * sw,
        );
        break;
      }
      case 2:
        // fall: steady drift down, side to side
        out.set(
          px + vx * age + Math.sin(age * 4 + sd * 6.2831853) * 0.16,
          py + vy * age,
          pz + vz * age + Math.cos(age * 3.3 + sd * 9) * 0.16,
        );
        break;
      case 4:
      case 5:
      case 6: {
        // sphere (and its sea mirror): speed bleeds off with drag (a burst that hangs), then the
        // sparks sink; willow: less drag, a heavy sag (long drooping trails)
        const w = pat[i] === 5 ? WIL : SPH;
        const k = (1 - Math.exp(-w.drag * age)) / w.drag;
        out.set(px + vx * k, py + vy * k - 0.5 * BURSTS.gravity * w.droop * age * age, pz + vz * k);
        break;
      }
      default:
        out.set(px + vx * age, py + vy * age - 0.5 * BURSTS.gravity * age * age, pz + vz * age);
    }
    out.y = Math.max(out.y, floorY[i]);
  };

  return {
    mesh,
    capacity,
    emit(spec, a, time, rng) {
      const t0 = time + (spec.delay ?? 0);
      const y0 = spec.from === 'top' ? a.y + a.h : spec.from === 'mid' ? a.y + a.h * 0.5 : a.y;
      for (let n = 0; n < spec.count; n++) {
        const speed = rng.range(spec.speed[0], spec.speed[1]);
        const sz = rng.range(spec.size[0], spec.size[1]);
        const lifeS = rng.range(spec.life[0], spec.life[1]);
        const col = colourOf(rng.pick(spec.colors));
        const sd = rng.next();
        const ang =
          spec.pattern === 'ring'
            ? ((n + rng.range(-0.15, 0.15)) / spec.count) * Math.PI * 2
            : rng.next() * Math.PI * 2;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        let ox = a.x;
        let oz = a.z;
        let vx = 0;
        let vy = 0;
        let vz = 0;
        switch (spec.pattern) {
          case 'ring':
            ox += ca * a.r * 0.7;
            oz += sa * a.r * 0.7;
            vx = ca * speed;
            vz = sa * speed;
            break;
          case 'sphere':
          case 'willow':
          case 'mirror': {
            // uniform direction on the sphere
            const cy = rng.range(-1, 1);
            const sy = Math.sqrt(1 - cy * cy);
            vx = ca * sy * speed;
            vz = sa * sy * speed;
            vy = cy * speed;
            break;
          }
          case 'rise': {
            const j = rng.range(0, a.r * 0.25);
            ox += ca * j;
            oz += sa * j;
            vy = speed;
            break;
          }
          case 'fall': {
            const j = rng.range(0, a.r * 0.8);
            ox += ca * j;
            oz += sa * j;
            vx = ca * speed * 0.3;
            vz = sa * speed * 0.3;
            vy = -(0.5 + speed * 0.5);
            break;
          }
          default:
            vx = ca * speed * 0.6;
            vz = sa * speed * 0.6;
            vy = speed;
        }
        const i = next;
        next = (next + 1) % capacity;
        high = Math.max(high, i + 1);
        put(
          i,
          ox,
          y0,
          oz,
          t0,
          vx,
          vy,
          vz,
          lifeS,
          sz,
          GLYPH_ID[spec.glyph],
          a.floor + BURSTS.floorLift,
          sd,
          PATTERN_ID[spec.pattern],
          col,
          spec.trail ?? 0,
        );
      }
      aGait.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    },
    clear() {
      born.fill(1e9);
      next = 0;
      high = 0;
      mesh.count = 0;
    },
    update(time, camera, scale = 1) {
      let alive = 0;
      let pending = 0;
      camera.getWorldQuaternion(_q);
      _cr.set(1, 0, 0).applyQuaternion(_q);
      _cu.set(0, 1, 0).applyQuaternion(_q);
      const camPos = camera.position;
      const arr = mesh.instanceMatrix.array as Float32Array;
      for (let i = 0; i < high; i++) {
        const age = time - born[i];
        const dead = age > life[i];
        if (!dead) pending++;
        if (age < 0 || dead) {
          ZERO.toArray(arr, i * 16);
          continue;
        }
        alive++;
        const u = age / life[i];
        posAt(i, age, u, _p);
        const g = glyph[i];
        const sd = seed[i];
        let sz = size[i];
        let sx = 0.5;
        let sy = 0.5;
        let ang =
          g === 3
            ? sd * 6.2831853 + age * (2 + 2 * sd) * (sd > 0.5 ? 1 : -1)
            : g === 2
              ? age * 1.5 + sd * 3
              : (sd - 0.5) * 0.4;
        if (pat[i] === 6) {
          // the spark's mirror image: where the eye ray to (x, 2 sea − y, z) meets the sea, a
          // vertical shimmer streak of the spark's own apparent size
          const sea = floorY[i];
          const ch = camPos.y - sea;
          const hh = _p.y - sea;
          if (ch <= 0.01 || hh <= 0) {
            ZERO.toArray(arr, i * 16);
            continue;
          }
          const t = ch / (ch + hh);
          _p.set(camPos.x + (_p.x - camPos.x) * t, sea, camPos.z + (_p.z - camPos.z) * t);
          sz *= t;
          const f = 0.55 + 0.45 * Math.sin(age * MIR.flicker * 6.2831853 + sd * 40);
          sx = 0.5 * MIR.thin * f;
          sy = 0.5 * MIR.stretch * f;
          ang = 0;
        }
        const dist = _p.distanceTo(camPos);
        // quick pop-in, shrink out; never smaller than a screen fraction (readable at any zoom)
        const grow = 1 - Math.exp(-14 * age) * (1 + 14 * age);
        const out = 1 - THREE.MathUtils.smoothstep(u, 1 - BURSTS.outFrac, 1);
        const s = Math.max(sz, dist * minFrac) * Math.min(Math.max(grow, 0), 1) * out * scale;
        if (g === 5 && s > 1e-4) {
          // streak: the teardrop spans the path of the last `trail` s as seen on screen, head on
          // the spark (the tail shrinks to a round dot when the spark hangs)
          const a0 = Math.max(0, age - trail[i]);
          posAt(i, a0, a0 / life[i], _p0);
          _p0.sub(_p);
          const dx = -_p0.dot(_cr);
          const dy = -_p0.dot(_cu);
          const len = Math.hypot(dx, dy);
          ang = Math.atan2(dy, dx);
          // head diameter STREAK_WIDTH × s; tail (x = −1) to head centre spans the path
          sy = (0.5 * STREAK_WIDTH) / STREAK_HEAD.r;
          sx = Math.max(len / (s * (1 + STREAK_HEAD.x)), sy);
          const back = STREAK_HEAD.x * s * sx;
          const c = Math.cos(ang);
          const sn = Math.sin(ang);
          _p.addScaledVector(_cr, -back * c).addScaledVector(_cu, -back * sn);
        }
        _qz.setFromAxisAngle(_zAxis, ang);
        _m.compose(_p, _qc.copy(_q).multiply(_qz), _s.set(s * sx, s * sy, s * 0.5));
        _m.toArray(arr, i * 16);
      }
      mesh.count = pending > 0 ? high : 0;
      mesh.instanceMatrix.needsUpdate = true;
      return alive;
    },
  };
}
