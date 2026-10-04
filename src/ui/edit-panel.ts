import { EDIT_PROPS } from '../content/edit.ts';
import { EDIT_PANEL, EDIT_TOOLS, EDIT_UI, type EditToolKind } from '../content/edit-ui.ts';
import type { ZonePaint } from '../world/edit-types.ts';
import { renderPropThumbs, propThumb } from './edit-thumbs.ts';

/**
 * Sandbox edit panel (phase-2 TASK-221; the HUD dock collapses into it in edit mode). Plain DOM +
 * CSS (`styles.ts` EDIT_PANEL_CSS), inline SVG icons in the dock style.
 *
 *   tools row  — raise · lower · flatten · smooth · paint · place · erase · move (tap the active
 *                tool again: no tool, one finger looks around)
 *   context    — tool hint; size + strength sliders (brushes), zone swatches (paint), prop picker
 *                grid with rendered thumbnails (place)
 *   footer     — undo, redo, share, reset (2-tap), Done
 *   tab        — "Sandbox" / "edited · N changes" badge on the panel's top edge
 *
 * The panel drives an `EditPanelBinding` (the live `EditMode` satisfies it; capture uses a static
 * one) and mirrors its state: session events refresh the badge / undo / redo at once, `update()`
 * (every HUD frame while open) catches keyboard changes (`[` / `]`, strokes ending).
 */
export interface EditPanelTools {
  readonly tool: EditToolKind | null;
  readonly radius: number;
  readonly strength: number;
  readonly zone: ZonePaint;
  readonly def: string;
}

export interface EditPanelSession {
  readonly count: number;
  canUndo(): boolean;
  canRedo(): boolean;
  shareUrl(base: string): string;
  clear(): void;
  subscribe(cb: () => void): () => void;
}

/** What the panel edits (structurally: `EditMode`). */
export interface EditPanelBinding {
  readonly tools: EditPanelTools;
  readonly session: EditPanelSession;
  setTool(t: EditToolKind | null): void;
  setRadius(r: number): void;
  setStrength(s: number): void;
  setZone(z: ZonePaint): void;
  setDef(def: string, variant?: number): void;
  undo(): boolean;
  redo(): boolean;
}

export interface EditPanel {
  el: HTMLElement;
  bind(b: EditPanelBinding | null): void;
  setOpen(open: boolean): void;
  /** Per HUD frame while open: re-sync values changed outside the panel. */
  update(): void;
  /** Resolves when every visible thumbnail image has decoded (capture waits for it). */
  settled(): Promise<void>;
  /** Brief message above the panel. */
  toast(text: string): void;
  dispose(): void;
}

/** Inert binding for capture (`freeze=1`): shows `tools` and a fixed change count. */
export function staticEditBinding(tools: EditPanelTools, count: number): EditPanelBinding {
  return {
    tools,
    session: {
      count,
      canUndo: () => false,
      canRedo: () => false,
      shareUrl: (base) => base,
      clear() {},
      subscribe: () => () => {},
    },
    setTool() {},
    setRadius() {},
    setStrength() {},
    setZone() {},
    setDef() {},
    undo: () => false,
    redo: () => false,
  };
}

const ICONS: Record<string, string> = {
  raise: '<path d="M2.5 20l6.5-9 4 5 2.5-3 6 7z"/><path d="M17.5 3v7M15 5.5L17.5 3 20 5.5"/>',
  lower: '<path d="M2.5 9c3.5 0 4.5 8 9.5 8s6-8 9.5-8"/><path d="M12 3v8M9.5 8.5L12 11l2.5-2.5"/>',
  flatten:
    '<path d="M3 17h18"/><path d="M7 4v8M4.5 9.5L7 12l2.5-2.5M17 4v8M14.5 9.5L17 12l2.5-2.5"/>',
  smooth: '<path d="M3 10c3-4 6-4 9 0s6 4 9 0"/><path d="M3 17c3-2 6-2 9 0s6 2 9 0"/>',
  paint:
    '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.3-1-1.6-1-2.6 0-1 .9-1.6 2-1.6h2.2A3.8 3.8 0 0 0 21 11c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7" r="1.2" fill="currentColor"/><circle cx="15.5" cy="7.5" r="1.2" fill="currentColor"/>',
  prop: '<path d="M12 2.5l6 8.5h-3.5l4.5 6.5H5L9.5 11H6z"/><path d="M12 17.5V21"/>',
  erase:
    '<path d="M14.5 4.5l5 5L11 18H7l-3-3a1.4 1.4 0 0 1 0-2z"/><path d="M8.5 9.5l5 5M11 21h9"/>',
  move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  share:
    '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v4.5h4.5"/>',
};

const svg = (name: string, size = 24): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

/** `roundTree` → `Round tree`. */
export function propLabel(id: string): string {
  const s = id.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;

export interface EditPanelOptions {
  /** Capture (`freeze=1`): static, share does nothing. */
  capture?: boolean;
  /** The Done button (the HUD closes its edit panel → edit mode ends). */
  onDone(): void;
}

export function createEditPanel(root: HTMLElement, opts: EditPanelOptions): EditPanel {
  const capture = opts.capture ?? false;
  const P = EDIT_PANEL;
  const el = document.createElement('div');
  el.className = 'mar-edit';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Sandbox editor');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="mar-edit-tools" role="toolbar" aria-label="Edit tools">
      ${EDIT_TOOLS.map(
        (t) =>
          `<button class="mar-tool" data-tool="${t}" aria-pressed="false" aria-label="${P.tools[t].label}">${svg(t)}<span>${P.tools[t].label}</span></button>`,
      ).join('')}
    </div>
    <div class="mar-edit-ctx">
      <div class="mar-edit-hint" aria-live="polite"></div>
      <div class="mar-edit-sliders">
        <label class="mar-slider mar-edit-radius"><span>${P.radiusLabel}</span><input type="range" data-e="radius" min="${EDIT_UI.radius.min}" max="${EDIT_UI.radius.max}" step="1"><output data-o="radius"></output></label>
        <label class="mar-slider mar-edit-strength"><span>${P.strengthLabel}</span><input type="range" data-e="strength" min="${EDIT_UI.strength.min}" max="${EDIT_UI.strength.max}" step="0.05"><output data-o="strength"></output></label>
      </div>
      <div class="mar-edit-zones" role="radiogroup" aria-label="Ground">
        ${P.zones
          .map(
            (z) =>
              `<button class="mar-zone" data-zone="${z.id}" role="radio" aria-checked="false" aria-label="${z.label}"><i style="background:${z.color}"></i><span>${z.label}</span></button>`,
          )
          .join('')}
      </div>
      <div class="mar-edit-props" role="listbox" aria-label="Props"></div>
    </div>
    <span class="mar-edit-badge"></span>
    <div class="mar-edit-foot">
      <span class="mar-edit-acts">
        ${(['undo', 'redo', 'share', 'reset'] as const)
          .map(
            (k) =>
              `<button class="mar-ebtn" data-e="${k}" aria-label="${P.tips[k]}">${svg(k, 20)}<span class="mar-ereset">${k === 'reset' ? P.resetConfirm : ''}</span><span class="mar-tip">${P.tips[k]}</span></button>`,
          )
          .join('')}
      </span>
      <button class="mar-edone" data-e="done" aria-label="${P.tips.done}">${P.doneLabel}</button>
    </div>
    <div class="mar-toast" role="status"></div>`;
  root.appendChild(el);

  const q = <T extends Element>(sel: string): T => el.querySelector(sel) as T;
  const hint = q<HTMLElement>('.mar-edit-hint');
  const radiusIn = q<HTMLInputElement>('[data-e="radius"]');
  const strengthIn = q<HTMLInputElement>('[data-e="strength"]');
  const radiusOut = q<HTMLOutputElement>('[data-o="radius"]');
  const strengthOut = q<HTMLOutputElement>('[data-o="strength"]');
  const propsEl = q<HTMLElement>('.mar-edit-props');
  const badge = q<HTMLElement>('.mar-edit-badge');
  const undoBtn = q<HTMLButtonElement>('[data-e="undo"]');
  const redoBtn = q<HTMLButtonElement>('[data-e="redo"]');
  const resetBtn = q<HTMLButtonElement>('[data-e="reset"]');
  const toastEl = q<HTMLElement>('.mar-toast');
  const toolBtns = Array.from(el.querySelectorAll<HTMLButtonElement>('.mar-tool'));
  const zoneBtns = Array.from(el.querySelectorAll<HTMLButtonElement>('.mar-zone'));

  let binding: EditPanelBinding | null = null;
  let unsub: (() => void) | null = null;
  let open = false;
  let prefetch: ReturnType<typeof setTimeout> | null = null;
  const cleanups: Array<() => void> = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number): ReturnType<typeof setTimeout> => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const on = <K extends keyof HTMLElementEventMap>(
    t: HTMLElement,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
  ): void => {
    t.addEventListener(type, fn as EventListener);
    cleanups.push(() => t.removeEventListener(type, fn as EventListener));
  };

  // ---- prop picker: built on first show (thumbnails render then, once per page)
  let propBtns: HTMLButtonElement[] = [];
  const buildProps = (): void => {
    if (propBtns.length) return;
    const st = renderPropThumbs(EDIT_PROPS.placeable);
    if (st.rendered)
      console.info(`[marisland] prop thumbnails: ${st.rendered} in ${st.ms.toFixed(0)} ms`);
    propsEl.innerHTML = EDIT_PROPS.placeable
      .map((id) => {
        const src = propThumb(id);
        const label = propLabel(id);
        return `<button class="mar-prop" data-def="${id}" role="option" aria-selected="false" aria-label="${label}" title="${label}">${
          src ? `<img alt="" width="64" height="64" src="${src}">` : `<span>${label}</span>`
        }</button>`;
      })
      .join('');
    propBtns = Array.from(propsEl.querySelectorAll<HTMLButtonElement>('.mar-prop'));
    for (const b of propBtns)
      on(b, 'click', () => {
        binding?.setDef(b.dataset.def ?? '');
        sync(true);
      });
    last.def = '';
  };

  // ---- state mirror (DOM written only on change)
  const last = {
    tool: undefined as EditToolKind | null | undefined,
    radius: NaN,
    strength: NaN,
    zone: '',
    def: '',
    count: -1,
    undo: null as boolean | null,
    redo: null as boolean | null,
  };
  const sync = (force = false): void => {
    const b = binding;
    if (!b) return;
    const t = b.tools;
    if (force || t.tool !== last.tool) {
      last.tool = t.tool;
      el.dataset.tool = t.tool ?? 'none';
      for (const btn of toolBtns)
        btn.setAttribute('aria-pressed', String(btn.dataset.tool === t.tool));
      if (t.tool === 'prop') buildProps();
      last.def = '';
    }
    if (force || t.radius !== last.radius) {
      last.radius = t.radius;
      if (document.activeElement !== radiusIn) radiusIn.value = String(t.radius);
      radiusOut.textContent = String(Math.round(t.radius));
    }
    if (force || t.strength !== last.strength) {
      last.strength = t.strength;
      if (document.activeElement !== strengthIn) strengthIn.value = String(t.strength);
      strengthOut.textContent = pct(t.strength);
    }
    if (force || t.zone !== last.zone) {
      last.zone = t.zone;
      for (const z of zoneBtns) z.setAttribute('aria-checked', String(z.dataset.zone === t.zone));
    }
    if (force || t.def !== last.def) {
      last.def = t.def;
      for (const p of propBtns) p.setAttribute('aria-selected', String(p.dataset.def === t.def));
      hint.textContent =
        t.tool === null
          ? P.idleHint
          : t.tool === 'prop'
            ? `${P.tools.prop.hint} · ${propLabel(t.def)}`
            : P.tools[t.tool].hint;
    }
    const s = b.session;
    if (force || s.count !== last.count) {
      last.count = s.count;
      badge.textContent = s.count > 0 ? P.badge(s.count) : P.title;
      badge.classList.toggle('mar-edited', s.count > 0);
      resetBtn.disabled = s.count === 0;
    }
    const cu = s.canUndo();
    const cr = s.canRedo();
    if (force || cu !== last.undo) {
      last.undo = cu;
      undoBtn.disabled = !cu;
    }
    if (force || cr !== last.redo) {
      last.redo = cr;
      redoBtn.disabled = !cr;
    }
  };

  // ---- tools / sliders / swatches
  for (const btn of toolBtns)
    on(btn, 'click', () => {
      const t = btn.dataset.tool as EditToolKind;
      binding?.setTool(binding.tools.tool === t ? null : t);
      sync();
    });
  const blurOnRelease = (input: HTMLInputElement): void => {
    // pointer use must not keep focus (the editor's keys ignore focused inputs); keyboard keeps it
    on(input, 'pointerup', () => input.blur());
    on(input, 'pointercancel', () => input.blur());
  };
  on(radiusIn, 'input', () => {
    binding?.setRadius(Number(radiusIn.value));
    sync();
  });
  on(strengthIn, 'input', () => {
    binding?.setStrength(Number(strengthIn.value));
    sync();
  });
  blurOnRelease(radiusIn);
  blurOnRelease(strengthIn);
  for (const z of zoneBtns)
    on(z, 'click', () => {
      binding?.setZone(z.dataset.zone as ZonePaint);
      sync();
    });

  // ---- footer
  on(undoBtn, 'click', () => {
    binding?.undo();
    sync();
  });
  on(redoBtn, 'click', () => {
    binding?.redo();
    sync();
  });
  on(q<HTMLButtonElement>('[data-e="share"]'), 'click', () => {
    if (!binding || capture) return;
    const url = binding.session.shareUrl(location.href);
    const fallback = (): void => {
      window.prompt(P.copyPrompt, url);
    };
    const clip = navigator.clipboard as Clipboard | undefined;
    if (!clip?.writeText) {
      fallback();
      return;
    }
    clip.writeText(url).then(() => panel.toast(P.copied), fallback);
  });
  let armed: ReturnType<typeof setTimeout> | null = null;
  const disarm = (): void => {
    if (armed) clearTimeout(armed);
    timers.delete(armed as ReturnType<typeof setTimeout>);
    armed = null;
    resetBtn.classList.remove('mar-armed');
    resetBtn.setAttribute('aria-label', P.tips.reset);
  };
  on(resetBtn, 'click', () => {
    if (!binding || resetBtn.disabled) return;
    if (!armed) {
      resetBtn.classList.add('mar-armed');
      resetBtn.setAttribute('aria-label', P.resetConfirm);
      armed = later(disarm, P.resetArmMs);
      return;
    }
    disarm();
    binding.session.clear();
    sync(true);
  });
  on(q<HTMLButtonElement>('[data-e="done"]'), 'click', () => opts.onDone());

  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  const panel: EditPanel = {
    el,
    bind(b) {
      unsub?.();
      unsub = null;
      binding = b;
      disarm();
      if (b) {
        unsub = b.session.subscribe(() => sync());
        sync(true);
      }
    },
    setOpen(o) {
      open = o;
      el.setAttribute('aria-hidden', String(!o));
      if (!o) disarm();
      else {
        sync(true);
        // lazy: the thumbnails render once, shortly after the first open (or right away when the
        // place tool is picked first); capture renders them only when `panel=edit:prop` shows them
        if (!capture && !propBtns.length && !prefetch)
          prefetch = later(buildProps, EDIT_PANEL.thumbsDelayMs);
      }
    },
    update() {
      if (open) sync();
    },
    settled() {
      const imgs = Array.from(el.querySelectorAll<HTMLImageElement>('img'));
      return Promise.all(imgs.map((i) => i.decode().catch(() => undefined))).then(() => undefined);
    },
    toast(text) {
      toastEl.textContent = text;
      toastEl.classList.add('mar-toast-on');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = later(() => toastEl.classList.remove('mar-toast-on'), P.toastMs);
    },
    dispose() {
      unsub?.();
      unsub = null;
      binding = null;
      for (const c of cleanups) c();
      cleanups.length = 0;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      el.remove();
    },
  };
  return panel;
}
