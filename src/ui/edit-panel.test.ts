import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SHARED } from '../render/uniforms.ts';
import { HOVER_UNIFORMS } from '../render/materials/hover.ts';
import { EDIT_PROPS } from '../content/edit.ts';
import { EDIT_PANEL, EDIT_TOOLS } from '../content/edit-ui.ts';
import { withNeutralShared } from './edit-thumbs.ts';
import { propLabel, staticEditBinding } from './edit-panel.ts';

describe('edit panel (TASK-221)', () => {
  it('labels every placeable def and every tool', () => {
    expect(propLabel('roundTree')).toBe('Round tree');
    expect(propLabel('messageBottle')).toBe('Message bottle');
    expect(propLabel('pine')).toBe('Pine');
    for (const id of EDIT_PROPS.placeable) expect(propLabel(id).length).toBeGreaterThan(2);
    for (const t of EDIT_TOOLS) expect(EDIT_PANEL.tools[t].label.length).toBeGreaterThan(0);
    expect(EDIT_PANEL.badge(1)).toBe('edited · 1 change');
    expect(EDIT_PANEL.badge(12)).toBe('edited · 12 changes');
  });

  it('static binding is inert and reports the fixed count', () => {
    const b = staticEditBinding(
      { tool: 'prop', radius: 10, strength: 0.5, zone: 'meadow', def: 'pine' },
      7,
    );
    expect(b.session.count).toBe(7);
    expect(b.session.canUndo()).toBe(false);
    expect(b.undo()).toBe(false);
    expect(b.session.shareUrl('https://x.test/?seed=1')).toBe('https://x.test/?seed=1');
  });

  it('thumbnail pass restores the shared uniforms by value and textures by reference', () => {
    const tex = new THREE.Texture();
    SHARED.uPoolTex.value = tex;
    SHARED.uNight.value = 0.8;
    SHARED.uLamps.value.set(1, 0.5, 0.25);
    HOVER_UNIFORMS.uHover.value.set(1, 2, 3, 0.7);
    const lamps = SHARED.uLamps.value;
    const horizon = SHARED.uHorizon.value.clone();
    let inside: { night: number; tex: unknown; lamps: number; hover: number } | null = null;
    withNeutralShared(() => {
      inside = {
        night: SHARED.uNight.value,
        tex: SHARED.uPoolTex.value,
        lamps: SHARED.uLamps.value.x,
        hover: HOVER_UNIFORMS.uHover.value.w,
      };
    });
    expect(inside).toEqual({ night: 0, tex: null, lamps: 0, hover: 0 });
    // a cloned texture would be a new GPU upload (the regen self-test caught it)
    expect(SHARED.uPoolTex.value).toBe(tex);
    expect(SHARED.uNight.value).toBe(0.8);
    expect(SHARED.uLamps.value).toBe(lamps);
    expect(SHARED.uLamps.value.toArray()).toEqual([1, 0.5, 0.25]);
    expect(SHARED.uHorizon.value.equals(horizon)).toBe(true);
    expect(HOVER_UNIFORMS.uHover.value.w).toBeCloseTo(0.7);
    SHARED.uPoolTex.value = null;
    SHARED.uNight.value = 0;
    SHARED.uLamps.value.set(0, 0, 0);
    HOVER_UNIFORMS.uHover.value.set(0, 0, 0, 0);
  });
});
