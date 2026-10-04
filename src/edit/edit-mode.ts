import CameraControls from 'camera-controls';
import type { System } from '../core/loop.ts';
import type { AppEvents, Emitter } from '../core/events.ts';
import type { CameraSystem } from '../camera/controls.ts';
import type { PickHit } from '../interact/picking.ts';
import { PROP_DEFS } from '../content/props.ts';
import { PropFlag } from '../world/prop-store.ts';
import {
  EMPTY_DIRTY,
  type EditCommand,
  type EditLog,
  type EditResult,
} from '../world/edit-types.ts';
import { EDIT_UI, type EditToolKind } from '../content/edit-ui.ts';
import type { ZonePaint } from '../world/edit-types.ts';
import type { EditSession } from './session.ts';
import type { HistoryLike } from './session-types.ts';
import type { BrushCursor } from './cursor.ts';
import type { Ghost } from './ghost.ts';
import {
  StrokeSampler,
  isBrushTool,
  nextPlacement,
  setRadius,
  setStrength,
  type EditHit,
  type ToolState,
} from './tools.ts';

/**
 * Edit mode (phase-2 TASK-212): owns the editor's input routing for one world.
 *
 * - `E` toggles; `Escape` leaves; `Ctrl/⌘+Z` undo, `Shift+Ctrl/⌘+Z` (or `Ctrl+Y`) redo;
 *   `[` / `]` radius. Keys are ignored while typing in a form field.
 * - With a tool selected, the primary drag (left mouse / one finger) is a stroke: the camera's
 *   primary pan is unbound for the whole edit mode (middle mouse pans instead), the camera is
 *   suspended while a stroke runs (no idle orbit / pitch push under the brush); the wheel,
 *   right-drag orbit and two-finger pinch/pan still navigate. A second finger ends the stroke.
 * - Picking hover/click reactions are suspended in edit mode.
 * - The cursor ring and the prop ghost follow the pointer at 60 Hz (no animation of their own;
 *   the ring's radius ease snaps under reduced motion). Capture (`freeze=1`) never creates it.
 */
export interface EditPicking {
  /** Full pick (props) at canvas CSS px — erase / move grab the prop under the pointer. */
  pickAt(x: number, y: number): PickHit | null;
  setSuspended(on: boolean): void;
}

export interface EditCamera {
  /** Stroke running: no idle orbit / terrain push (`CameraSystem.setSuspended`). */
  setSuspended(on: boolean): void;
  poke(): void;
  /** Bind (true) / unbind the primary-drag pan (left mouse, one finger). */
  setPrimaryPan(on: boolean): void;
}

export interface EditModeDeps {
  session: EditSession;
  tools: ToolState;
  cursor: BrushCursor;
  ghost: Ghost;
  interaction: EditPicking;
  cam: EditCamera;
  events: Emitter<AppEvents>;
  dom: HTMLElement;
  /** Placement validation (`canPlace(world, cmd)`, TASK-201). */
  canPlace(cmd: EditCommand): { ok: boolean; reason?: string };
  /** Raw terrain height. */
  heightAt(x: number, z: number): number;
  /** Rotation of a world prop (move keeps it). */
  propRotY(id: number): number;
  reduced(): boolean;
  /** Attach pointer / key listeners. */
  listen: boolean;
}

export interface EditMode {
  readonly active: boolean;
  readonly tools: ToolState;
  readonly session: EditSession;
  setActive(on: boolean): void;
  toggle(): void;
  setTool(t: EditToolKind | null): void;
  setRadius(r: number): void;
  setStrength(s: number): void;
  setZone(z: ZonePaint): void;
  /** Prop tool selection; `variant` −1 = drawn per placement. */
  setDef(def: string, variant?: number): void;
  /** Replace the validation (harness / evidence: a `canPlace` that always refuses). */
  setCanPlace(fn: ((cmd: EditCommand) => { ok: boolean; reason?: string }) | null): void;
  /** Pointer routing at canvas CSS px (what the DOM listeners call; harness hooks). */
  pointerMove(x: number, y: number): void;
  pointerDown(x: number, y: number): boolean;
  pointerUp(x: number, y: number): void;
  undo(): boolean;
  redo(): boolean;
  /** Runs after the interaction system. */
  system: System;
  dispose(): void;
}

declare global {
  interface Window {
    /** Edit mode of the live world (harness / evidence; absent in capture). */
    __marislandEdit?: EditMode;
  }
}

const ACTION = CameraControls.ACTION;

/** `EditCamera` over the app's camera system (camera-controls button bindings). */
export function editCameraOf(cam: CameraSystem): EditCamera {
  const c = cam.controls;
  const saved = { left: c.mouseButtons.left, middle: c.mouseButtons.middle, one: c.touches.one };
  let bound = true;
  return {
    setSuspended: (on) => cam.setSuspended(on),
    poke: () => cam.poke(),
    setPrimaryPan(on) {
      if (on === bound) return;
      bound = on;
      if (on) {
        c.mouseButtons.left = saved.left;
        c.mouseButtons.middle = saved.middle;
        c.touches.one = saved.one;
      } else {
        saved.left = c.mouseButtons.left;
        saved.middle = c.mouseButtons.middle;
        saved.one = c.touches.one;
        c.mouseButtons.left = ACTION.NONE;
        c.mouseButtons.middle = ACTION.TRUCK;
        c.touches.one = ACTION.NONE;
      }
    },
  };
}

/** Fallbacks while the world edit API (TASK-201) / history (TASK-211) are not wired. */
export const EDIT_FALLBACKS = {
  apply: (): EditResult => ({
    ok: false,
    reason: 'world edit API unavailable',
    inverse: [],
    dirty: EMPTY_DIRTY,
  }),
  canPlace: (): { ok: boolean; reason?: string } => ({ ok: true }),
  history: {
    push() {},
    beginGroup() {},
    endGroup() {},
    undo: () => null,
    redo: () => null,
    canUndo: () => false,
    canRedo: () => false,
    clear() {},
  } satisfies HistoryLike,
  encode: (log: EditLog): string =>
    btoa(JSON.stringify(log)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  decode: (s: string): EditLog =>
    JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/'))) as EditLog,
};

const isTyping = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
};

export function createEditMode(d: EditModeDeps): EditMode {
  const { session, tools, cursor, ghost, cam, dom } = d;
  let active = false;
  let canPlace = d.canPlace;
  let stroking = false;
  let strokePointer = -1;
  const touches = new Set<number>();
  const cleanups: Array<() => void> = [];
  // ghost validity cache: re-check only when the candidate changes
  let lastKey = '';
  let lastOk = true;

  const defOf = (id: string) => PROP_DEFS.find((p) => p.id === id);
  const applyDef = (): void => {
    const def = defOf(tools.def);
    tools.variants = def?.variants ?? 1;
  };
  applyDef();

  const sampler = new StrokeSampler(tools, (cmd) => session.apply(cmd).ok);

  /** Edit hit with the prop under the pointer (erase / move). */
  const withProp = (h: EditHit, x: number, y: number): EditHit => {
    if (tools.tool !== 'erase' && tools.tool !== 'move') return h;
    const p = d.interaction.pickAt(x, y);
    // `p.id` is the edit-model prop id (scatter index or EDIT_PROP_ID_BASE + k, TASK-213);
    // render-only settlement props (id −1) cannot be erased / moved
    return {
      ...h,
      prop:
        p && p.kind === 'prop' && p.id >= 0 ? { id: p.id, rotY: p.rotY ?? d.propRotY(p.id) } : null,
    };
  };

  const syncBindings = (): void => {
    cam.setPrimaryPan(!(active && tools.tool !== null));
    d.interaction.setSuspended(active);
    cursor.setVisible(active && tools.tool !== null);
    ghost.setVisible(active && tools.tool === 'prop');
    if (tools.tool === 'prop') ghost.setDef(tools.def, nextPlacement(tools).variant);
    else ghost.setDef(null, 0);
  };

  const endStroke = (x?: number, y?: number): void => {
    if (!stroking) return;
    let h: EditHit | undefined;
    if (x !== undefined && y !== undefined) {
      cursor.setPointer(x, y);
      const c = cursor.sample();
      if (c) h = withProp(c, x, y);
    }
    sampler.end(h);
    session.endStroke();
    stroking = false;
    strokePointer = -1;
    cam.setSuspended(false);
    lastKey = '';
  };

  const cancelStroke = (): void => {
    if (!stroking) return;
    sampler.cancel();
    session.endStroke();
    stroking = false;
    strokePointer = -1;
    cam.setSuspended(false);
  };

  const mode: EditMode = {
    get active() {
      return active;
    },
    tools,
    session,
    setActive(on) {
      if (on === active) return;
      if (!on) cancelStroke();
      active = on;
      syncBindings();
      cursor.setRadius(tools.radius, true);
      d.events.emit('editModeChanged', { active });
    },
    toggle() {
      mode.setActive(!active);
    },
    setTool(t) {
      cancelStroke();
      tools.tool = t;
      lastKey = '';
      syncBindings();
    },
    setRadius(r) {
      setRadius(tools, r);
      if (tools.tool !== 'prop') cursor.setRadius(tools.radius);
    },
    setStrength(s) {
      setStrength(tools, s);
    },
    setZone(z) {
      tools.zone = z;
    },
    setDef(def, variant = -1) {
      tools.def = def;
      tools.variant = variant;
      applyDef();
      lastKey = '';
      syncBindings();
    },
    setCanPlace(fn) {
      canPlace = fn ?? d.canPlace;
      lastKey = '';
    },
    pointerMove(x, y) {
      cursor.setPointer(x, y);
      if (!stroking) return;
      const h = cursor.sample();
      if (h) sampler.move(withProp(h, x, y));
    },
    pointerDown(x, y) {
      if (!active || tools.tool === null || stroking) return false;
      cursor.setPointer(x, y);
      const h = cursor.sample();
      if (!h) return false;
      stroking = true;
      cam.setSuspended(true);
      cam.poke();
      session.beginStroke();
      sampler.begin(withProp(h, x, y));
      return true;
    },
    pointerUp(x, y) {
      endStroke(x, y);
    },
    undo: () => (stroking ? false : session.undo()),
    redo: () => (stroking ? false : session.redo()),
    system: {
      name: 'edit-mode',
      update(dt) {
        if (!active) return;
        cam.poke(); // no idle orbit while editing
        cursor.update(dt);
        const hit = cursor.hit;
        if (tools.tool === 'prop') {
          const def = defOf(tools.def);
          const p = nextPlacement(tools);
          ghost.setDef(tools.def, p.variant);
          if (hit && def) {
            const under = (def.flags & PropFlag.underwater) !== 0;
            const y = under ? hit.ground : Math.max(0, hit.ground);
            ghost.setPose(hit.x, y, hit.z, p.rotY, p.scale);
            const key = `${hit.x},${hit.z},${tools.def},${tools.placed}`;
            if (key !== lastKey) {
              lastKey = key;
              lastOk = canPlace({
                k: 'propAdd',
                def: tools.def,
                x: hit.x,
                z: hit.z,
                rotY: p.rotY,
                scale: p.scale,
                variant: p.variant,
              }).ok;
            }
            ghost.setValid(lastOk);
            cursor.setInvalid(!lastOk);
            cursor.setRadius(
              Math.max(EDIT_UI.pointerRing, def.footprint * p.scale * EDIT_UI.propRingScale),
              true,
            );
            cursor.setStrength(EDIT_UI.propRingStrength);
            ghost.setVisible(true);
          } else ghost.setVisible(false);
          ghost.update();
        } else {
          cursor.setInvalid(false);
          cursor.setStrength(isBrushTool(tools.tool) ? tools.strength : EDIT_UI.propRingStrength);
          cursor.setRadius(isBrushTool(tools.tool) ? tools.radius : EDIT_UI.pointerRing);
        }
      },
    },
    dispose() {
      cancelStroke();
      for (const c of cleanups.splice(0)) c();
      if (active) {
        active = false;
        cam.setPrimaryPan(true);
        d.interaction.setSuspended(false);
        d.events.emit('editModeChanged', { active: false });
      }
      cursor.dispose();
      ghost.setVisible(false);
      if (window.__marislandEdit === mode) delete window.__marislandEdit;
    },
  };

  if (d.listen) {
    const on = <K extends keyof HTMLElementEventMap>(
      t: HTMLElement | Window,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
    ): void => {
      t.addEventListener(type, fn as EventListener);
      cleanups.push(() => t.removeEventListener(type, fn as EventListener));
    };
    const local = (e: PointerEvent): [number, number] => {
      const r = dom.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    on(dom, 'pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        touches.add(e.pointerId);
        if (touches.size > 1) {
          // two fingers navigate: keep what the stroke applied, stop painting
          if (stroking) endStroke();
          return;
        }
      } else if (e.button !== 0) return;
      const [x, y] = local(e);
      if (mode.pointerDown(x, y)) {
        strokePointer = e.pointerId;
        try {
          dom.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic events */
        }
      }
    });
    on(dom, 'pointermove', (e) => {
      if (stroking && e.pointerId !== strokePointer) return;
      const [x, y] = local(e);
      mode.pointerMove(x, y);
    });
    const up = (e: PointerEvent): void => {
      touches.delete(e.pointerId);
      if (!stroking || e.pointerId !== strokePointer) return;
      if (e.type === 'pointercancel') {
        endStroke();
        return;
      }
      const [x, y] = local(e);
      mode.pointerUp(x, y);
    };
    on(dom, 'pointerup', up);
    on(dom, 'pointercancel', up);
    on(dom, 'pointerleave', () => {
      if (!stroking) cursor.clearPointer();
    });
    on(window, 'keydown', (e) => {
      if (isTyping(e.target)) return;
      const k = e.key;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod && !e.altKey && k.toLowerCase() === EDIT_UI.keys.toggle) {
        if (!e.repeat) mode.toggle();
        return;
      }
      if (!active) return;
      if (mod && (k === 'z' || k === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) mode.redo();
        else mode.undo();
      } else if (mod && (k === 'y' || k === 'Y')) {
        e.preventDefault();
        mode.redo();
      } else if (k === EDIT_UI.keys.radiusDown) {
        mode.setRadius(tools.radius - EDIT_UI.radius.step);
      } else if (k === EDIT_UI.keys.radiusUp) {
        mode.setRadius(tools.radius + EDIT_UI.radius.step);
      } else if (k === EDIT_UI.keys.exit) {
        mode.setActive(false);
      }
    });
  }
  window.__marislandEdit = mode;
  return mode;
}
