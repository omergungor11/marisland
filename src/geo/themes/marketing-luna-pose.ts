/**
 * Gallery-only assemblies of the fun park kit (M53 TASK-670): `lunaPose` merges each base with its
 * moving part in a static pose, so a ride can be judged as the whole it will be. Not a PropDef, never
 * placed in a world. Variants: 0 swing, 1 drop tower (car mid-way), 2 carousel, 3 coaster (M) with the
 * worm train, 4 the whole park on the M deck (`lunaLayout(1)`), 5 the same on the S deck.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LUNA_KIT, lunaLayout } from '../../content/themes/marketing-luna.ts';
import { LUNA_LOOK, lunaCoasterPoints } from '../../content/themes/marketing-luna-look.ts';
import {
  createCoasterSpline,
  newCoasterSample,
  sampleCoaster,
} from '../../world/coaster-spline.ts';
import { createRng } from '../../core/rng.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { LUNA_COASTER_GEO } from './marketing-luna-coaster.ts';
import { LUNA_DECK_GEO } from './marketing-luna-deck.ts';
import { LUNA_RIDES_GEO } from './marketing-luna-rides.ts';
import { LUNA_STANDS_GEO } from './marketing-luna-stands.ts';
import { buildWheelRotor, ferrisWheel } from './marketing-media.ts';
import { MEDIA_ROCK } from '../../content/themes/marketing.ts';

type Part = { geo: THREE.BufferGeometry; m: THREE.Matrix4 };

const at = (x: number, y: number, z: number, rotY = 0, s = 1): THREE.Matrix4 =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
    new THREE.Vector3(s, s, s),
  );

function merge(parts: Part[]): THREE.BufferGeometry {
  const gs = parts.map(({ geo, m }) => {
    const g = geo.clone();
    g.deleteAttribute('aSpin');
    g.applyMatrix4(m);
    return g;
  });
  const out = mergeGeometries(gs, false);
  out.computeBoundingBox();
  out.computeBoundingSphere();
  out.userData = { tris: out.getAttribute('position').count / 3 };
  return out;
}

/** The seed stream of the assembly being built (set by lunaPose from its own rng). */
let seedRng = createRng(5);
const DEFS: Record<string, PropGeoDef> = Object.fromEntries(
  [...LUNA_DECK_GEO, ...LUNA_RIDES_GEO, ...LUNA_COASTER_GEO, ...LUNA_STANDS_GEO].map((d) => [
    d.id,
    d,
  ]),
);
function build(id: string, variant: number, lod: 0 | 1): THREE.BufferGeometry {
  const def = DEFS[id];
  return def.build({ rng: seedRng.fork('geo', variant).fork(id), lod, variant });
}

/** The train along the loop of length `length`: head at arc `s0`, cars behind it. */
function trainParts(
  length: number,
  lod: 0 | 1,
  s0: number,
  y0: number,
  base: THREE.Matrix4,
): Part[] {
  const sp = createCoasterSpline(lunaCoasterPoints(length), { closed: true, step: 0.25 });
  const out: Part[] = [];
  const T = LUNA_LOOK.train;
  const tmp = newCoasterSample();
  let s = s0;
  for (let i = 0; i < T.cars; i++) {
    const len = i === 0 ? T.head.len : T.car.len;
    sampleCoaster(sp, (((s - len / 2) % sp.length) + sp.length) % sp.length, tmp);
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...tmp.side),
      new THREE.Vector3(...tmp.up),
      new THREE.Vector3(...tmp.tangent),
    );
    m.setPosition(tmp.pos[0], tmp.pos[1] + y0, tmp.pos[2]);
    out.push({
      geo: build('lunaTrain', i === 0 ? 0 : 1 + ((i - 1) % 3), lod),
      m: base.clone().multiply(m),
    });
    s -= len + T.gap;
  }
  return out;
}

function ridePose(kind: 'swing' | 'drop' | 'carousel', lod: 0 | 1): Part[] {
  const K = LUNA_KIT.ride;
  const I = new THREE.Matrix4();
  if (kind === 'swing')
    return [
      { geo: build('lunaRide', 0, lod), m: I },
      { geo: build('lunaSwingTop', 0, lod), m: at(...K.swing.top.at) },
    ];
  if (kind === 'drop')
    return [
      { geo: build('lunaRide', 1, lod), m: I },
      {
        geo: build('lunaDropCar', 0, lod),
        m: at(0, LUNA_LOOK.drop.lo + (LUNA_LOOK.drop.hi - LUNA_LOOK.drop.lo) * 0.7, 0),
      },
    ];
  return [
    { geo: build('lunaRide', 2, lod), m: I },
    { geo: build('lunaCarouselTop', 0, lod), m: at(...K.carousel.top.at) },
  ];
}

function park(size: 0 | 1 | 2, lod: 0 | 1): Part[] {
  const out: Part[] = [{ geo: build('lunaDeck', size, lod), m: new THREE.Matrix4() }];
  const top = LUNA_KIT.deckY;
  for (const p of lunaLayout(size)) {
    const base = at(p.x, p.on === 'deck' ? top : 0, p.z, p.rotY, p.scale ?? 1);
    const R = p.ref;
    if (p.key === 'swing' || p.key === 'drop' || p.key === 'carousel') {
      for (const q of ridePose(p.key, lod)) out.push({ geo: q.geo, m: base.clone().multiply(q.m) });
    } else if (p.key === 'wheel') {
      out.push({
        geo: ferrisWheel({ rng: seedRng.fork('wheel'), lod, variant: 0 }),
        m: base,
      });
      out.push({
        geo: buildWheelRotor(lod),
        m: base
          .clone()
          .multiply(at(0, MEDIA_ROCK.wheel.hubY, 0, 0, 1))
          .multiply(new THREE.Matrix4().makeRotationZ(0.3)),
      });
    } else if (p.key === 'coaster') {
      out.push({ geo: build(R.defId, R.variant, lod), m: base });
      out.push(...trainParts(LUNA_LOOK.coaster.lengths[size], lod, 5, 0, base));
    } else {
      out.push({ geo: build(R.defId, R.variant, lod), m: base });
    }
  }
  return out;
}

function lunaPose({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  seedRng = rng.fork('pose');
  if (variant <= 2) return merge(ridePose((['swing', 'drop', 'carousel'] as const)[variant], lod));
  if (variant === 3) {
    const base = new THREE.Matrix4();
    return merge([
      { geo: build('lunaCoaster', 1, lod), m: base },
      ...trainParts(LUNA_LOOK.coaster.lengths[1], lod, 5, 0, base),
    ]);
  }
  return merge(park(variant === 4 ? 1 : 0, lod));
}

export const LUNA_POSE_GEO: readonly PropGeoDef[] = [
  {
    id: 'lunaPose',
    variants: 6,
    build: lunaPose,
    footprint: 4,
    height: 8,
    heights: [7.5, 10, 7.5, 4.3, 11.3, 11.3],
    windy: false,
  },
];
