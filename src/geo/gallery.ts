import * as THREE from 'three';
import { PROP_GEO, buildProp } from './registry.ts';
import type { Lod } from './types.ts';

export interface GalleryItem {
  id: string;
  variant: number;
  lod: Lod;
  x: number;
  z: number;
}

/**
 * Every def x variant x lod on a grid: one row per def, variant-major then lod. `only` restricts the
 * rows to those def ids (the prop showcase: `?gallery=1&ids=m20` or `ids=cultureGate,goodsStall`).
 */
export function buildGalleryScene(only?: readonly string[]): {
  group: THREE.Group;
  items: GalleryItem[];
} {
  const group = new THREE.Group();
  group.name = 'geo-gallery';
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const items: GalleryItem[] = [];
  let z = 0;
  for (const def of Object.values(PROP_GEO)) {
    if (only && !only.includes(def.id)) continue;
    let spacing = Math.max(1.5, 3 * def.footprint);
    if (only) {
      // showcase: space by the real plan size (wide gates, 15 u conservatories)
      const bb = buildProp(def.id, 1, 0, 0).boundingBox;
      if (bb) spacing = Math.max(spacing, Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) + 1.5);
    }
    z += spacing / 2;
    let col = 0;
    for (let v = 0; v < def.variants; v++) {
      for (const lod of [0, 1] as const) {
        const x = col * spacing;
        const mesh = new THREE.Mesh(buildProp(def.id, 1, v, lod), material);
        mesh.position.set(x, 0, z);
        mesh.name = `${def.id}:${v}:${lod}`;
        mesh.userData.index = items.length;
        group.add(mesh);
        items.push({ id: def.id, variant: v, lod, x, z });
        col++;
      }
    }
    z += spacing / 2;
  }
  return { group, items };
}
