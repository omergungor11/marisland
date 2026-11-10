/**
 * Horseshoe Harbour quay houses and the mole tower (M52 TASK-660, D-170): `quayHouse` variants 0-5
 * are the row houses (seafood restaurant, café, bakery, gelato, souvenir shop, chandlery), variant 6
 * the round stone tower. Numbers: content/themes/marketing-marina-look.ts.
 *
 * Frames: pivot on the quay, front = +z, x across the front. A house is centred on its plan box
 * (body, awning and sign together), side walls are plain and 0.02 u inside the plan width so a row
 * has no coplanar faces. Windows are emissive 1 (the shared lamp set, night glow); awnings are
 * fabric class, panes glass class, door and shutters wood.
 */
import * as THREE from 'three';
import {
  MARINA_LOOK as L,
  type HouseExtra,
  type HouseSpec,
} from '../../content/themes/marketing-marina-look.ts';
import { Acc, col, mat, qEuler } from '../kit.ts';
import { addAwning, hipGeo } from '../building-kit.ts';
import { V, V2, baseBox, cylB, doorAt, put, ropePoints, tubeAlong } from '../parts.ts';
import type { Rng } from '../../core/rng.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { addHook, pennant } from './hq.ts';
import { addGlyph } from './marketing-marina-glyph.ts';

const H = L.house;
const P = L.pal;
const D = H.d;
/** The plan box is centred with the awning in it: the body sits this far back. */
const SHIFT_Z = -0.37;
const lit = { emissive: 1, aoAmt: 0, ao: () => 1, noJitter: true, cls: 'glass' } as const;
const flat = { aoAmt: 0, ao: () => 1 } as const;

/** The seeded height of a house (storeys differ by a few cm): the row never lines up too neatly. */
let yScale = 1;
const frame = (): THREE.Matrix4 => mat([0, 0, SHIFT_Z], null, [1, yScale, 1]);
const newAcc = (): Acc => {
  const a = new Acc();
  a.xf = frame();
  return a;
};

const has = (s: HouseSpec, e: HouseExtra): boolean => s.extras.includes(e);

/** Window on the wall plane z = `z`: frame, emissive pane, optional sill, mullions and shutters. */
function win(
  acc: Acc,
  hi: boolean,
  o: {
    x: number;
    y: number;
    z: number;
    w: number;
    h: number;
    shutters?: string;
    mullion?: boolean;
    sill?: boolean;
    rng?: Rng;
  },
): void {
  const { x, y, z, w, h } = o;
  if (!hi) {
    put(acc, new THREE.PlaneGeometry(w, h), [x, y, z + 0.01], P.window, lit);
    return;
  }
  put(acc, new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.07), [x, y, z + 0.035], P.trim, {
    aoAmt: 0,
  });
  put(acc, new THREE.PlaneGeometry(w, h), [x, y, z + 0.085], P.window, lit);
  if (o.mullion) {
    put(acc, new THREE.BoxGeometry(0.05, h, 0.04), [x, y, z + 0.1], P.trim, flat);
    put(acc, new THREE.BoxGeometry(w, 0.05, 0.04), [x, y + h * 0.18, z + 0.1], P.trim, flat);
  }
  if (o.sill)
    put(acc, new THREE.BoxGeometry(w + 0.28, 0.08, 0.2), [x, y - h / 2 - 0.1, z + 0.1], P.trim, {
      aoAmt: 0.1,
    });
  if (o.shutters)
    for (const s of [-1, 1]) {
      // some shutters stand ajar (seeded), swung out about their own centre
      const a = o.rng?.chance(0.4) ? o.rng.range(0.25, 0.6) : 0;
      put(
        acc,
        new THREE.BoxGeometry(H.win.shutter, h + 0.1, 0.05),
        [
          x + s * (w / 2 + 0.07 + H.win.shutter / 2 + 0.01),
          y,
          z + 0.03 + (H.win.shutter / 2) * Math.sin(a),
        ],
        o.shutters,
        { aoAmt: 0, cls: 'wood', q: qEuler(0, -s * a, 0) },
      );
    }
}

/** Gable roof of two slabs over a gable-wall triangle; ridge along z, eave at y = `top`. */
function gable(
  acc: Acc,
  o: {
    hx: number;
    hz: number;
    top: number;
    rise: number;
    roof: string;
    wall: string;
    endOver: number;
  },
): void {
  const { hx, hz, top, rise } = o;
  const tri = new THREE.Shape([V2(-hx, 0), V2(hx, 0), V2(0, rise)]);
  put(
    acc,
    new THREE.ExtrudeGeometry(tri, { depth: 2 * hz, bevelEnabled: false }).translate(0, 0, -hz),
    [0, top, 0],
    o.wall,
    { aoAmt: 0.05 },
  );
  const len = Math.hypot(hx, rise);
  const ux = hx / len;
  const uy = rise / len;
  const ext = 0.1;
  const depth = 2 * hz + 2 * o.endOver;
  for (const s of [-1, 1]) {
    const cx = s * (hx / 2 + (ux * ext) / 2 + uy * 0.05);
    const cy = rise / 2 - (uy * ext) / 2 + ux * 0.05;
    put(acc, new THREE.BoxGeometry(len + ext + 0.04, 0.1, depth), [cx, top + cy, 0], o.roof, {
      q: qEuler(0, 0, -s * Math.atan2(rise, hx)),
      aoAmt: 0.05,
      cls: 'matte',
    });
  }
  put(acc, new THREE.BoxGeometry(0.2, 0.09, depth), [0, top + rise + 0.07, 0], o.roof, {
    aoAmt: 0,
    noJitter: true,
  });
}

/** The ground floor: shop window, door, awning, hanging sign. */
function shopFront(acc: Acc, hi: boolean, s: HouseSpec, i: number): void {
  const w = s.w - 0.04;
  const zf = D / 2;
  const side = s.doorSide;
  const doorX = side * (w / 2 - 0.8);
  const winW = s.w * H.shopW;
  const winX = -side * (w / 2 - 0.5 - winW / 2);
  win(acc, hi, {
    x: winX,
    y: H.shopSill + H.shopH / 2,
    z: zf,
    w: winW,
    h: H.shopH,
    mullion: true,
    sill: true,
  });
  // door (+ a stone step); LOD1 gets none
  if (hi) {
    doorAt(acc, V(doorX, 0, zf + 0.04), 0, s.doorCol, P.trim, H.doorW, H.doorH);
    put(acc, baseBox(H.doorW + 0.5, 0.14, 0.34), [doorX, 0, zf + 0.2], P.stone, { aoAmt: 0.1 });
    // lantern over the door: the night accent of the shop
    put(acc, new THREE.OctahedronGeometry(0.09, 0), [doorX, H.doorH + 0.34, zf + 0.12], P.lantern, {
      ...lit,
      cls: undefined,
    });
  }
  // striped awning along the whole front
  acc.cls = 'fabric';
  if (hi) {
    addAwning(acc, {
      at: V(0, 0, zf + 0.02),
      yaw: 0,
      width: w - H.awningInset,
      y: H.awningY,
      colours: s.awning,
    });
  } else {
    put(
      acc,
      new THREE.BoxGeometry(w - H.awningInset, 0.12, 0.72),
      [0, H.awningY, zf + 0.38],
      s.awning[0],
      { aoAmt: 0 },
    );
  }
  acc.cls = null;
  // hanging sign on an arm, board parallel to the wall, glyph on its face
  const sx = side * (w / 2 - H.sign.inset);
  const bs = H.sign.board;
  const bz = zf + H.sign.arm + 0.02;
  const by = H.sign.y + bs / 2;
  if (!hi) return;
  put(acc, baseBox(0.05, 0.05, H.sign.arm + 0.04), [sx, by + bs / 2 + 0.16, zf], P.wood, {
    aoAmt: 0,
    cls: 'wood',
  });
  for (const cx of [-bs * 0.34, bs * 0.34])
    put(acc, baseBox(0.025, 0.2, 0.025), [sx + cx, by + bs / 2 + 0.02, bz], P.ink, flat);
  put(
    acc,
    new THREE.BoxGeometry(bs + 2 * H.sign.frame, bs + 2 * H.sign.frame, 0.08),
    [sx, by, bz],
    P.wood,
    { aoAmt: 0, cls: 'wood' },
  );
  put(acc, new THREE.BoxGeometry(bs, bs, 0.1), [sx, by, bz], P.trim, { ...flat, noJitter: true });
  addGlyph(acc, s.glyph, [sx, by, bz + 0.05], bs * 0.94);
  void i;
}

/** Upper floors: cornice lines, windows with shutters, balcony, flower boxes, lifebuoy. */
function upperFloors(acc: Acc, hi: boolean, s: HouseSpec, rng: Rng): void {
  const w = s.w - 0.04;
  const zf = D / 2;
  const wx = s.w * 0.27;
  for (let j = 1; j < s.storeys; j++) {
    const y0 = s.groundH + (j - 1) * s.upperH;
    const yc = y0 + s.upperH / 2 + 0.12;
    const balcony = has(s, 'balcony') && j === 1;
    if (balcony) {
      win(acc, hi, { x: 0, y: y0 + 0.85, z: zf, w: 0.9, h: 1.5, mullion: true });
      for (const sx of [-1, 1])
        win(acc, hi, {
          x: sx * (wx + 0.3),
          y: yc,
          z: zf,
          w: 0.5,
          h: H.win.h,
          shutters: hi ? s.shutters : undefined,
          sill: hi,
          rng,
        });
    } else {
      for (const sx of [-1, 1]) {
        win(acc, hi, {
          x: sx * wx,
          y: yc,
          z: zf,
          w: H.win.w,
          h: H.win.h,
          shutters: hi ? s.shutters : undefined,
          sill: hi && !has(s, 'flowerBoxes'),
          rng,
        });
        if (hi && has(s, 'flowerBoxes') && j === 1)
          flowerBox(acc, sx * wx, yc - H.win.h / 2 - 0.12, zf + 0.14, H.win.w + 0.18);
      }
    }
    if (hi && j === 1 && has(s, 'lifebuoy')) lifebuoy(acc, 0, yc, zf + 0.09);
    if (hi && balcony) {
      const bw = 2.1;
      put(acc, baseBox(bw, 0.1, 0.62), [0, y0 - 0.02, zf + 0.31], P.stone, { aoAmt: 0.15 });
      for (const sx of [-1, 1])
        put(acc, baseBox(0.12, 0.28, 0.12), [sx * (bw / 2 - 0.1), y0 - 0.3, zf + 0.1], P.stone, {
          aoAmt: 0.2,
        });
      put(acc, baseBox(bw, 0.5, 0.08), [0, y0 + 0.08, zf + 0.6], s.shutters, flat);
      for (const sx of [-1, 1])
        put(
          acc,
          baseBox(0.08, 0.5, 0.56),
          [sx * (bw / 2 - 0.04), y0 + 0.08, zf + 0.32],
          s.shutters,
          flat,
        );
      put(acc, baseBox(bw + 0.04, 0.07, 0.12), [0, y0 + 0.58, zf + 0.6], P.trim, flat);
    }
  }
  void w;
}

function flowerBox(acc: Acc, x: number, y: number, z: number, w: number): void {
  put(acc, baseBox(w, 0.2, 0.24), [x, y, z], P.wood, { aoAmt: 0.1, cls: 'wood' });
  put(acc, new THREE.PlaneGeometry(w - 0.04, 0.2).rotateX(-Math.PI / 2), [x, y + 0.21, z], P.leaf, {
    ...flat,
    noJitter: true,
  });
  const f = [P.pink, P.yellow, P.white];
  for (let k = 0; k < 3; k++)
    put(
      acc,
      new THREE.OctahedronGeometry(0.075, 0),
      [x + (k - 1) * (w / 3.2), y + 0.27, z + (k % 2 ? 0.03 : -0.03)],
      f[k],
      { aoAmt: 0, noJitter: true },
    );
}

function lifebuoy(acc: Acc, x: number, y: number, z: number): void {
  const c = V(x, y, z);
  put(
    acc,
    new THREE.TorusGeometry(0.2, 0.07, 4, 8),
    c,
    (p) =>
      Math.floor((Math.atan2(p.y - c.y, p.x - c.x) / Math.PI) * 2 + 8) % 2
        ? col(P.accent)
        : col(P.white),
    { aoAmt: 0, noJitter: true },
  );
}

function house({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const s: HouseSpec = L.houses[variant];
  const hi = lod === 0;
  yScale = 1 + rng.fork('height').range(-0.02, 0.02);
  const acc = newAcc();
  const w = s.w - 0.04;
  const upperTotal = (s.storeys - 1) * s.upperH;
  const top = s.groundH + upperTotal;
  const hz = D / 2;

  // body: shop-front colour below, wall colour above; plinth, cornice between the floors
  put(acc, baseBox(w, s.groundH, D), [0, 0, 0], s.front, { aoAmt: 0.2 });
  put(acc, baseBox(w, upperTotal, D), [0, s.groundH, 0], s.wall, { aoAmt: 0.08 });
  if (hi) {
    put(
      acc,
      baseBox(w + 2 * H.plinthGrow, H.plinthH, D + 2 * H.plinthGrow),
      [0, 0, 0],
      P.stoneWarm,
      {
        aoAmt: 0.15,
      },
    );
    for (let j = 0; j < s.storeys - 1; j++)
      put(
        acc,
        baseBox(w + 0.08, H.corniceH, D + 0.08),
        [0, s.groundH + j * s.upperH - H.corniceH / 2, 0],
        P.trim,
        { aoAmt: 0 },
      );
  }
  shopFront(acc, hi, s, variant);
  upperFloors(acc, hi, s, rng.fork('trim'));

  // roof
  const hx = w / 2;
  if (s.roof === 'gableFront') {
    if (hi)
      gable(acc, {
        hx: hx - 0.06,
        hz,
        top,
        rise: s.rise,
        roof: s.roofCol,
        wall: s.wall,
        endOver: 0.2,
      });
    else
      put(
        acc,
        new THREE.ExtrudeGeometry(new THREE.Shape([V2(-hx, 0), V2(hx, 0), V2(0, s.rise)]), {
          depth: D,
          bevelEnabled: false,
        }).translate(0, 0, -hz),
        [0, top, 0],
        s.roofCol,
        { aoAmt: 0.05 },
      );
    if (hi && has(s, 'atticWindow')) {
      put(
        acc,
        new THREE.CircleGeometry(0.26, 8),
        [0, top + s.rise * 0.36, hz + 0.012],
        P.window,
        lit,
      );
      put(
        acc,
        new THREE.RingGeometry(0.26, 0.36, 8),
        [0, top + s.rise * 0.36, hz + 0.006],
        P.trim,
        flat,
      );
    }
  } else if (s.roof === 'gableSide') {
    const keep = acc.xf;
    acc.xf = mat([0, 0, SHIFT_Z], qEuler(0, Math.PI / 2, 0), [1, yScale, 1]);
    if (hi)
      gable(acc, {
        hx: hz + 0.3,
        hz: hx,
        top,
        rise: s.rise,
        roof: s.roofCol,
        wall: s.wall,
        endOver: 0.0,
      });
    else
      put(
        acc,
        new THREE.ExtrudeGeometry(new THREE.Shape([V2(-hz, 0), V2(hz, 0), V2(0, s.rise)]), {
          depth: 2 * hx,
          bevelEnabled: false,
        }).translate(0, 0, -hx),
        [0, top, 0],
        s.roofCol,
        { aoAmt: 0.05 },
      );
    acc.xf = keep;
  } else if (s.roof === 'hip') {
    const ex = hx;
    const ez = hz + 0.3;
    put(acc, hipGeo(ex, ez, Math.max(0, ez - ex), s.rise), [0, top + 0.04, 0], s.roofCol, {
      aoAmt: 0.06,
    });
    if (hi)
      put(acc, baseBox(2 * ex, 0.1, 2 * ez), [0, top - 0.05, 0], s.roofCol, {
        aoAmt: 0.3,
        noJitter: true,
      });
  } else {
    // flat roof with a parapet all round
    const t = 0.16;
    put(acc, baseBox(w, 0.06, D), [0, top, 0], s.roofCol, { aoAmt: 0.1 });
    const pr = s.rise;
    put(acc, baseBox(w + 0.04, pr, t), [0, top, hz - t / 2 + 0.02], s.wall, { aoAmt: 0.05 });
    put(acc, baseBox(w + 0.04, pr, t), [0, top, -hz + t / 2 - 0.02], s.wall, { aoAmt: 0.05 });
    for (const sx of [-1, 1])
      put(acc, baseBox(t, pr, D - 2 * t + 0.04), [sx * (hx - t / 2), top, 0], s.wall, {
        aoAmt: 0.05,
      });
    if (hi)
      put(acc, baseBox(w + 0.12, 0.07, t + 0.1), [0, top + pr, hz - t / 2 + 0.02], P.trim, {
        aoAmt: 0,
      });
  }

  // extras
  if (hi && has(s, 'chimney')) {
    put(acc, baseBox(0.5, 1.15, 0.5), [-0.9, top + s.rise * 0.3, -0.5], P.stoneRed, {
      aoAmt: 0.15,
    });
    put(acc, baseBox(0.62, 0.1, 0.62), [-0.9, top + s.rise * 0.3 + 1.1, -0.5], P.stoneDark, {
      aoAmt: 0,
    });
  }
  if (has(s, 'finial')) {
    const fy = top + s.rise;
    if (hi) put(acc, baseBox(0.34, 0.1, 0.34), [0, fy, hz - 0.1], P.trim, { aoAmt: 0 });
    put(acc, cylB(0.01, 0.26, 0.46, 6), [0, fy + (hi ? 0.1 : 0), hz - 0.1], P.stoneWarm, {
      aoAmt: 0,
    });
    put(
      acc,
      new THREE.IcosahedronGeometry(0.3, 0),
      [0, fy + (hi ? 0.52 : 0.42), hz - 0.1],
      P.pink,
      { aoAmt: 0, noJitter: true },
    );
  }
  if (hi && has(s, 'hoist')) {
    const hy = top + s.rise * 0.62;
    put(acc, baseBox(0.14, 0.14, 0.7), [0, hy, hz + 0.0], P.wood, { aoAmt: 0.1, cls: 'wood' });
    put(acc, cylB(0.1, 0.1, 0.12, 6), [0, hy + 0.07, hz + 0.65], P.ink, {
      aoAmt: 0,
      q: qEuler(0, 0, Math.PI / 2),
    });
    put(acc, baseBox(0.025, 0.8, 0.025), [0, hy - 0.8, hz + 0.65], P.ink, flat);
    put(acc, baseBox(0.34, 0.3, 0.34), [0, hy - 1.1, hz + 0.65], P.woodLight, {
      aoAmt: 0.1,
      cls: 'wood',
    });
  }
  if (hi && has(s, 'bunting')) {
    const zb = hz + 0.74;
    const xa = -(w / 2 - 0.25);
    const xb = w / 2 - 0.25;
    const pts = ropePoints(V(xa, H.awningY - 0.1, zb), V(xb, H.awningY - 0.1, zb), 0.12, 6);
    put(acc, tubeAlong(pts, 0.012, 3), [0, 0, 0], P.ink, flat);
    const cs = [P.accent, P.gold, P.teal, P.white, P.sky];
    for (let k = 1; k < pts.length - 1; k++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([-0.09, 0, 0, 0.09, 0, 0, 0, -0.24, 0], 3),
      );
      put(acc, g, pts[k], cs[k % cs.length], { double: true, aoAmt: 0, noJitter: true });
    }
  }
  const g = acc.finish(rng, false, true);
  return g;
}

/* ------------------------------------ mole tower ------------------------------------ */

function tower({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const T = L.tower;
  const hi = lod === 0;
  const acc = new Acc();
  const seg = hi ? T.seg : 6;
  put(acc, cylB(T.r + 0.14, T.r + 0.04, T.plinthH, seg, !hi), [0, 0, 0], T.plinth, {
    aoAmt: 0.25,
  });
  const yb = T.plinthH;
  put(acc, cylB(T.r, T.bodyTop, T.bodyH, seg, true), [0, yb, 0], T.stone, { aoAmt: 0.15 });
  const yt = yb + T.bodyH;
  if (hi) {
    // two stone bands
    for (const f of [0.34, 0.68]) {
      const r = T.r + (T.bodyTop - T.r) * f;
      put(acc, cylB(r + 0.05, r + 0.05, 0.14, seg, true), [0, yb + T.bodyH * f, 0], T.band, {
        aoAmt: 0,
      });
    }
  }
  // corbelled gallery
  put(acc, cylB(T.bodyTop + 0.02, T.corbelR, T.corbelH, seg, !hi), [0, yt, 0], T.band, {
    aoAmt: 0.1,
  });
  const yf = yt + T.corbelH;
  put(
    acc,
    new THREE.CircleGeometry(T.corbelR - 0.02, seg).rotateX(-Math.PI / 2),
    [0, yf + 0.01, 0],
    T.floorCol,
    flat,
  );
  // crenellations (far: one open ring)
  const n = hi ? T.merlons : 0;
  const rm = T.corbelR - 0.2;
  if (!hi)
    put(acc, cylB(rm + 0.12, rm + 0.12, T.merlonH, 6, true), [0, yf, 0], T.stone, { aoAmt: 0.1 });
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.PI / n;
    put(
      acc,
      baseBox(hi ? 0.62 : 0.7, T.merlonH, 0.34),
      [Math.sin(a) * rm, yf, Math.cos(a) * rm],
      T.stone,
      { aoAmt: 0.1, q: qEuler(0, a, 0) },
    );
  }
  // flag pole with the Marketing streamer (rim, away from the door side), lamp in the middle
  const pa = -2.2;
  const px = Math.sin(pa) * (rm - 0.35);
  const pz = Math.cos(pa) * (rm - 0.35);
  put(acc, cylB(0.04, 0.03, T.pole, 4, true), [px, yf, pz], P.wood, { aoAmt: 0 });
  pennant(acc, V(px, yf + T.pole - 0.22, pz), T.flag.len, T.flag.h, P.accent, 0);
  put(acc, cylB(0.04, 0.04, T.lamp.post, 4, true), [0, yf, 0], P.ink, { aoAmt: 0 });
  put(
    acc,
    hi ? new THREE.IcosahedronGeometry(T.lamp.r, 0) : new THREE.OctahedronGeometry(T.lamp.r, 0),
    [0, yf + T.lamp.post + 0.1, 0],
    P.lantern,
    { ...lit, cls: undefined },
  );
  if (hi) {
    // arched door and arrow slits toward +z / the sides
    const dw = 0.78;
    const dh = 1.25;
    const door = new THREE.Shape([
      V2(-dw / 2, 0),
      V2(dw / 2, 0),
      V2(dw / 2, dh - dw / 2),
      V2(dw * 0.3, dh - 0.08),
      V2(0, dh),
      V2(-dw * 0.3, dh - 0.08),
      V2(-dw / 2, dh - dw / 2),
    ]);
    put(
      acc,
      new THREE.ExtrudeGeometry(door, { depth: 0.1, bevelEnabled: false }),
      [0, yb, T.r + 0.1],
      P.wood,
      { aoAmt: 0.05, cls: 'wood' },
    );
    for (const [a, y] of [
      [0.5, 3.4],
      [-0.9, 3.4],
      [2.6, 3.7],
      [Math.PI, 3.4],
    ] as const) {
      const rr = T.r + (T.bodyTop - T.r) * ((y - yb) / T.bodyH) + 0.01;
      put(
        acc,
        new THREE.PlaneGeometry(0.16, 0.5),
        [Math.sin(a) * rr, y, Math.cos(a) * rr],
        P.window,
        { ...lit, q: qEuler(0, a, 0) },
      );
    }
  }
  const g = acc.finish(rng, false, true);
  addHook(g, 'flag', { at: [px, yf + T.pole - 0.22, pz] });
  return g;
}

function quayHouse(o: BuildOpts): THREE.BufferGeometry {
  return o.variant === L.houses.length ? tower(o) : house(o);
}

export const MARINA_QUAY_GEO: readonly PropGeoDef[] = [
  {
    id: 'quayHouse',
    variants: L.houses.length + 1,
    build: quayHouse,
    footprint: 2.6,
    height: 6.5,
    heights: [6.36, 5.59, 6.36, 7.53, 5.17, 6.16, 6.6],
    windy: true,
  },
];
