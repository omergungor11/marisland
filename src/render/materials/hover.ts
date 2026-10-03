import * as THREE from 'three';
import { HOVER } from '../../content/anim.ts';

/**
 * Hover / click-flash highlight (TASK-162) shared by every lit material (props and creatures —
 * no extra program, the factory reads these two uniforms). `uHover.xyz` is the world-space
 * origin of the highlighted instance (matched against each instance's matrix translation in the
 * vertex shader), `uHover.w` the tint strength (0 = off); `uHoverCol` the additive tint colour.
 */
export const HOVER_UNIFORMS = {
  uHover: { value: new THREE.Vector4(0, 0, 0, 0) },
  uHoverCol: { value: new THREE.Color(HOVER.color) },
};

/** Origin match tolerance (u): static props match exactly, agents come from the same matrix. */
export const HOVER_RADIUS = 0.05;

export function setHover(x: number, y: number, z: number, strength: number): void {
  HOVER_UNIFORMS.uHover.value.set(x, y, z, strength);
}

export function clearHover(): void {
  HOVER_UNIFORMS.uHover.value.w = 0;
}
