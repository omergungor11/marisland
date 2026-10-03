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

/** Every def x variant x lod on a grid: one row per def, variant-major then lod. */
export function buildGalleryScene(): { group: THREE.Group; items: GalleryItem[] } {
  const group = new THREE.Group();
  group.name = 'geo-gallery';
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const items: GalleryItem[] = [];
  let z = 0;
  for (const def of Object.values(PROP_GEO)) {
    const spacing = Math.max(1.5, 3 * def.footprint);
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
