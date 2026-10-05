import * as THREE from 'three';
import { ENV_KEYS, UI } from '../content/palette.ts';
import { HUD, INTRO } from '../content/ui.ts';
import { EDIT_PANEL } from '../content/edit-ui.ts';
import { createEditPanel, type EditPanelBinding } from './edit-panel.ts';
import { CAMERA } from '../content/tiers.ts';
import type { CameraWorld } from '../camera/controls.ts';
import { themeOf } from '../camera/poses.ts';
import { THEMES } from '../content/themes.ts';
import { themeIcon } from './theme-icons.ts';
import type { HudPanel, Quality, WeatherName } from '../core/params.ts';
import {
  compassDeg,
  dialStops,
  formatHour,
  hourToAngle,
  isDay,
  mixHex,
  nextTimeStop,
  nextWeather,
  placeLabel,
  pointerToHour,
  type LabelBox,
  type LabelSpot,
} from './hud-math.ts';

/**
 * HUD (ART_BIBLE §9): wordmark, compass, dock (time dial, weather, new seed, edit, photo, sound,
 * settings), settings sheet, photo bar, sandbox edit panel (TASK-221: the dock collapses into
 * it), island labels at T0, hidden-HUD ghost button.
 * Plain DOM + CSS (styles.ts) + inline SVG. `?hud=0` skips it entirely. The HUD owns its
 * display state; the app reacts through `HudActions`.
 */
export interface HudActions {
  onNewSeed(): void;
  /** Dial drag / scroll / click (next bible time stop). */
  onHour(hour: number): void;
  onWeather(weather: WeatherName): void;
  onSound(): void;
  /** Compass click: back to north. */
  onCompass(): void;
  onLabel(name: string): void;
  onQuality(q: Quality): void;
  onReducedMotion(on: boolean): void;
  onCompassVisible(on: boolean): void;
  onPhotoMode(active: boolean): void;
  /** The edit panel opened / closed (dock button, Done, photo mode, Esc): enter / leave edit mode. */
  onEditPanel(open: boolean): void;
  onFov(deg: number): void;
  onFreeze(on: boolean): void;
  /** Render a frame and grab the canvas. `null` when the export failed. */
  onShutter(): Promise<{ blob: Blob; filename: string } | null>;
}

export interface HudState {
  quality: Quality;
  reducedMotion: boolean;
  compass: boolean;
  weather: WeatherName;
  fov: number;
  frozen: boolean;
}

export interface Hud {
  el: HTMLElement;
  update(
    camera: THREE.PerspectiveCamera,
    azimuth: number,
    tier: number,
    hour: number,
    width: number,
    height: number,
  ): void;
  setWorld(world: CameraWorld, accents: Record<string, string>): void;
  setState(s: Partial<HudState>): void;
  /** Pop the HUD in (dock staggered 60 ms). */
  show(): void;
  /** Intro: only the wordmark pops (0–1.5 s). */
  showWordmark(): void;
  /** Intro: the clouds part, the wordmark slides to its corner. */
  dockWordmark(): void;
  setLabelsHidden(hidden: boolean): void;
  /** Hide everything for clean screenshots (key `h`); a ghost button brings it back. */
  setVisible(visible: boolean): void;
  readonly visible: boolean;
  openPanel(panel: HudPanel): void;
  readonly photoMode: boolean;
  /** The edit panel is open. */
  readonly editing: boolean;
  /** What the edit panel drives (the live world's edit mode, a static binding in capture). */
  bindEdit(b: EditPanelBinding | null): void;
  /** Resolves when the open panels finished loading (edit-panel thumbnails decoded). */
  settled(): Promise<void>;
  dispose(): void;
}

const ICONS: Record<string, string> = {
  clear:
    '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  cloudy: '<path d="M7 18h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6-1.5A3.5 3.5 0 0 0 7 18z"/>',
  rain: '<path d="M7 14h10a3.6 3.6 0 0 0 0-7.2 4.6 4.6 0 0 0-8.8-1.3A3.2 3.2 0 0 0 7 14z"/><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5"/>',
  fog: '<path d="M4 9h12M7 13h13M4 17h11"/><path d="M16 9a3 3 0 0 1 0 0"/>',
  seed: '<rect x="4" y="4" width="16" height="16" rx="4"/><g fill="currentColor" stroke="none"><circle cx="9" cy="9" r="1.6"/><circle cx="15" cy="9" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="9" cy="15" r="1.6"/><circle cx="15" cy="15" r="1.6"/></g>',
  photo:
    '<rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13.5" r="3.5"/><path d="M9 7l1.5-2.5h3L15 7"/>',
  sound: '<path d="M4 10v4h3l4 3V7l-4 3H4z"/><path d="M15 9.5a3.5 3.5 0 0 1 0 5"/>',
  settings:
    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  close: '<path d="M7 7l10 10M17 7L7 17"/>',
  freeze:
    '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M18.5 3.5l2 2-8.5 8.5-2-2z"/><path d="M9.5 12.5c-2.6 0-4 1.7-4 4 0 1.5-.9 2.7-2.5 3h5.5a4 4 0 0 0 4-4"/>',
  hide: '<path d="M2.5 12S6 5.5 12 5.5c2 0 3.7.7 5 1.6M21.5 12S18 18.5 12 18.5c-2 0-3.7-.7-5-1.6"/><path d="M4 20L20 4"/>',
};

const icon = (name: string, size = 24): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const SUN_SVG = `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="#FFD25C" stroke="${UI.surface}" stroke-width="2.5"/></svg>`;
const MOON_SVG = `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="#F1EEFF" stroke="${UI.surface}" stroke-width="2.5"/><circle cx="13" cy="8" r="5" fill="#3E4C9A" opacity=".55"/></svg>`;

const WEATHER_TIP: Record<WeatherName, string> = {
  clear: 'Weather · Clear',
  cloudy: 'Weather · Cloudy',
  rain: 'Weather · Rain',
  fog: 'Weather · Fog',
};

/** Sky ring of the dial from the time-of-day keys (zenith/horizon mix). */
function dialGradient(): string {
  const stops = dialStops(
    ENV_KEYS.map((k) => ({ hour: k.hour, color: mixHex(k.zenith, k.horizon, 0.45) })),
  );
  return `conic-gradient(from 180deg, ${stops.map((s) => `${s.color} ${s.deg}deg`).join(', ')})`;
}

const _v = new THREE.Vector3();

export function createHud(
  root: HTMLElement,
  actions: HudActions,
  initial: HudState,
  instant = false,
): Hud {
  const state: HudState = { ...initial };
  const el = document.createElement('div');
  el.className = instant ? 'mar-hud mar-hud-instant' : 'mar-hud';
  const dockButtons = ['weather', 'seed', 'edit', 'photo', 'sound', 'settings'];
  const tips: Record<string, string> = {
    seed: 'New seed',
    edit: EDIT_PANEL.tips.edit,
    photo: 'Photo mode',
    sound: 'Sound',
    settings: 'Settings',
  };
  el.innerHTML = `
    <div class="mar-wordmark"><span class="mar-wm-in">Marisland</span></div>
    <button class="mar-compass mar-pop" aria-label="Compass: reset north">
      <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="${UI.surface}" stroke="${UI.ink}22" stroke-width="2"/>
      <g class="mar-compass-rose">
        <circle cx="32" cy="56" r="1.8" fill="${UI.muted}"/><circle cx="8" cy="32" r="1.8" fill="${UI.muted}"/><circle cx="56" cy="32" r="1.8" fill="${UI.muted}"/>
        <text x="32" y="16.5" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="12" fill="${UI.primary}">N</text>
        <path d="M32 20 L37.5 32 L26.5 32 Z" fill="${UI.primary}" stroke="${UI.primary}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M32 47 L37.5 32 L26.5 32 Z" fill="${UI.muted}" stroke="${UI.muted}" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="32" cy="32" r="3" fill="${UI.surface}" stroke="${UI.ink}" stroke-width="1.5"/></g></svg>
    </button>
    <div class="mar-labels"></div>
    <div class="mar-dock" role="toolbar" aria-label="Marisland">
      <div class="mar-dial mar-pop" role="slider" tabindex="0" aria-label="Time of day" aria-valuemin="0" aria-valuemax="24" style="animation-delay:0ms">
        <div class="mar-dial-ring" style="background:${dialGradient()}"></div>
        <div class="mar-dial-face"><span class="mar-dial-time">15:00</span></div>
        <div class="mar-dial-arm"><span class="mar-dial-icon">${SUN_SVG}</span></div>
        <span class="mar-tip">Time · drag, scroll or tap</span>
      </div>
      ${dockButtons
        .map(
          (k, i) =>
            `<button class="mar-btn mar-pop" data-action="${k}" aria-label="${k === 'weather' ? WEATHER_TIP[state.weather] : tips[k]}" style="animation-delay:${(i + 1) * HUD.dockStaggerMs}ms">${icon(k === 'weather' ? state.weather : k)}<span class="mar-tip">${k === 'weather' ? WEATHER_TIP[state.weather] : tips[k]}</span></button>`,
        )
        .join('')}
    </div>
    <div class="mar-sheet mar-settings" role="dialog" aria-label="Settings">
      <div class="mar-sheet-title">Settings</div>
      <div class="mar-row"><span>Quality</span><div class="mar-seg">${(
        ['low', 'medium', 'high'] as const
      )
        .map(
          (q) =>
            `<button data-q="${q}">${q === 'medium' ? 'Med' : q[0].toUpperCase() + q.slice(1)}</button>`,
        )
        .join('')}</div></div>
      <div class="mar-row"><span>Reduce motion</span><button class="mar-switch" data-set="rm" role="switch" aria-label="Reduce motion"><i></i></button></div>
      <div class="mar-row"><span>Compass</span><button class="mar-switch" data-set="compass" role="switch" aria-label="Compass"><i></i></button></div>
      <button class="mar-wide" data-set="hide">${icon('hide', 20)}<span>Hide HUD</span><kbd>H</kbd></button>
    </div>
    <div class="mar-photo" role="toolbar" aria-label="Photo mode">
      <div class="mar-photo-panel">
        <label class="mar-slider"><span>Time</span><input type="range" data-p="time" min="0" max="24" step="0.05"><output data-o="time">15:00</output></label>
        <label class="mar-slider"><span>FOV</span><input type="range" data-p="fov" min="${CAMERA.photoFov[0]}" max="${CAMERA.photoFov[1]}" step="1"><output data-o="fov">35°</output></label>
      </div>
      <button class="mar-btn mar-photo-exit" data-photo="exit" aria-label="Leave photo mode">${icon('close')}<span class="mar-tip">Exit · Esc</span></button>
      <button class="mar-shutter" data-photo="shutter" aria-label="Take photo"><i></i></button>
      <button class="mar-btn mar-photo-freeze" data-photo="freeze" aria-label="Freeze" aria-pressed="false">${icon('freeze')}<span class="mar-tip">Freeze time &amp; camera</span></button>
    </div>
    <button class="mar-ghost" aria-label="Show HUD (H)">${icon('eye', 20)}</button>
    <div class="mar-flash"></div>`;
  root.appendChild(el);

  const q = <T extends Element>(sel: string): T => el.querySelector(sel) as T;
  const labelsEl = q<HTMLElement>('.mar-labels');
  const dockEl = q<HTMLElement>('.mar-dock');
  const rose = q<SVGGElement>('.mar-compass-rose');
  const compassBtn = q<HTMLButtonElement>('.mar-compass');
  const dial = q<HTMLElement>('.mar-dial');
  const dialTime = q<HTMLElement>('.mar-dial-time');
  const dialArm = q<HTMLElement>('.mar-dial-arm');
  const dialIcon = q<HTMLElement>('.mar-dial-icon');
  const settings = q<HTMLElement>('.mar-settings');
  const weatherBtn = q<HTMLButtonElement>('[data-action="weather"]');
  const timeInput = q<HTMLInputElement>('[data-p="time"]');
  const fovInput = q<HTMLInputElement>('[data-p="fov"]');
  const timeOut = q<HTMLOutputElement>('[data-o="time"]');
  const fovOut = q<HTMLOutputElement>('[data-o="fov"]');
  const freezeBtn = q<HTMLButtonElement>('[data-photo="freeze"]');
  const ghost = q<HTMLButtonElement>('.mar-ghost');
  const flash = q<HTMLElement>('.mar-flash');
  const editBtn = q<HTMLButtonElement>('[data-action="edit"]');
  const editPanel = createEditPanel(el, {
    capture: instant,
    onDone: () => hud.openPanel(''),
  });
  // the panel sits before the flash / ghost so `.mar-hud-hidden` fades it like the dock
  el.insertBefore(editPanel.el, ghost);

  const cleanups: Array<() => void> = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number): void => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  function on<K extends keyof WindowEventMap>(
    target: EventTarget,
    type: K,
    fn: (e: WindowEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void {
    const h = fn as EventListener;
    target.addEventListener(type, h, opts);
    cleanups.push(() => target.removeEventListener(type, h, opts));
  }
  const press = (b: HTMLElement): void => {
    b.classList.remove('mar-press');
    void b.offsetWidth;
    b.classList.add('mar-press');
  };

  // ---- dock
  let hour = 15;
  let photo = false;
  let editing = false;
  let visible = true;
  const handlers: Record<string, () => void> = {
    weather: () => {
      const w = nextWeather(state.weather, HUD.weatherCycle);
      hud.setState({ weather: w });
      actions.onWeather(w);
    },
    seed: actions.onNewSeed,
    edit: () => hud.openPanel(editing ? '' : 'edit'),
    photo: () => hud.openPanel('photo'),
    sound: actions.onSound,
    settings: () => hud.openPanel(el.classList.contains('mar-panel-settings') ? '' : 'settings'),
  };
  el.querySelectorAll<HTMLButtonElement>('.mar-dock .mar-btn').forEach((b) => {
    on(b, 'click', () => {
      press(b);
      handlers[b.dataset.action ?? '']?.();
    });
  });
  on(compassBtn, 'click', () => {
    press(compassBtn);
    actions.onCompass();
  });

  // ---- time dial: drag / scroll / tap / keys
  let drag: { id: number; x: number; y: number; moved: boolean } | null = null;
  const dialHour = (e: PointerEvent): number => {
    const r = dial.getBoundingClientRect();
    return pointerToHour(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  };
  on(dial, 'pointerdown', (e) => {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    dial.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  on(dial, 'pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < CAMERA.clickMaxPx)
      return;
    drag.moved = true;
    dial.classList.add('mar-dial-drag');
    const h = dialHour(e);
    if (Number.isFinite(h)) setHour(h);
  });
  const dialUp = (e: PointerEvent): void => {
    if (!drag || drag.id !== e.pointerId) return;
    const wasClick = !drag.moved && e.type === 'pointerup';
    drag = null;
    dial.classList.remove('mar-dial-drag');
    if (wasClick) {
      press(dial);
      setHour(nextTimeStop(hour, HUD.timeStops));
    }
  };
  on(dial, 'pointerup', dialUp);
  on(dial, 'pointercancel', dialUp);
  on(
    dial,
    'wheel',
    (e) => {
      e.preventDefault();
      const notches = Math.max(-4, Math.min(4, e.deltaY / 100 || Math.sign(e.deltaY)));
      setHour(hour + notches * HUD.dialWheelHours);
    },
    { passive: false },
  );
  on(dial, 'keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowUp') setHour(hour + HUD.dialWheelHours);
    else if (k === 'ArrowLeft' || k === 'ArrowDown') setHour(hour - HUD.dialWheelHours);
    else if (k === 'Enter' || k === ' ') setHour(nextTimeStop(hour, HUD.timeStops));
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  function setHour(h: number): void {
    hour = ((h % 24) + 24) % 24;
    actions.onHour(hour);
    renderDial(true);
  }

  // ---- settings
  el.querySelectorAll<HTMLButtonElement>('.mar-seg button').forEach((b) =>
    on(b, 'click', () => {
      const ql = b.dataset.q as Quality;
      if (ql === state.quality) return;
      hud.setState({ quality: ql });
      actions.onQuality(ql);
    }),
  );
  on(q<HTMLButtonElement>('[data-set="rm"]'), 'click', () => {
    hud.setState({ reducedMotion: !state.reducedMotion });
    actions.onReducedMotion(state.reducedMotion);
  });
  on(q<HTMLButtonElement>('[data-set="compass"]'), 'click', () => {
    hud.setState({ compass: !state.compass });
    actions.onCompassVisible(state.compass);
  });
  on(q<HTMLButtonElement>('[data-set="hide"]'), 'click', () => hud.setVisible(false));

  // ---- photo bar
  on(timeInput, 'input', () => setHour(Number(timeInput.value)));
  on(fovInput, 'input', () => {
    hud.setState({ fov: Number(fovInput.value) });
    actions.onFov(state.fov);
  });
  on(q<HTMLButtonElement>('[data-photo="exit"]'), 'click', () => hud.openPanel(''));
  on(freezeBtn, 'click', () => {
    press(freezeBtn);
    hud.setState({ frozen: !state.frozen });
    actions.onFreeze(state.frozen);
  });
  let shooting = false;
  on(q<HTMLButtonElement>('[data-photo="shutter"]'), 'click', () => {
    if (shooting) return;
    shooting = true;
    flash.classList.remove('mar-flash-on');
    void flash.offsetWidth;
    flash.classList.add('mar-flash-on');
    void actions
      .onShutter()
      .then((shot) => {
        if (!shot) return;
        const url = URL.createObjectURL(shot.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = shot.filename;
        a.click();
        polaroid(url);
      })
      .finally(() => {
        shooting = false;
      });
  });
  const polaroid = (url: string): void => {
    const p = document.createElement('div');
    p.className = 'mar-polaroid';
    p.innerHTML = `<img alt="Photo" src="${url}">`;
    el.appendChild(p);
    later(() => {
      p.remove();
      URL.revokeObjectURL(url);
    }, HUD.polaroidMs);
  };

  // ---- hidden-HUD ghost button + keys
  let ghostTimer: ReturnType<typeof setTimeout> | null = null;
  const wakeGhost = (): void => {
    if (visible) return;
    ghost.classList.add('mar-ghost-awake');
    if (ghostTimer) clearTimeout(ghostTimer);
    ghostTimer = setTimeout(() => ghost.classList.remove('mar-ghost-awake'), HUD.ghostButtonMs);
  };
  on(ghost, 'click', () => hud.setVisible(true));
  on(window, 'pointermove', wakeGhost, { passive: true });
  on(window, 'pointerdown', wakeGhost, { passive: true });
  on(window, 'keydown', (e) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
      if (e.key !== 'Escape') return;
    }
    if (e.key === 'h' || e.key === 'H') {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      hud.setVisible(!visible);
    } else if (e.key === 'Escape') {
      if (photo || editing || el.classList.contains('mar-panel-settings')) hud.openPanel('');
      else if (!visible) hud.setVisible(true);
    }
  });
  cleanups.push(() => {
    if (ghostTimer) clearTimeout(ghostTimer);
  });

  // ---- per-frame rendering (only touches the DOM when something changed)
  let lastCompass = NaN;
  let lastDialDeg = NaN;
  let lastDialText = '';
  let lastDay: boolean | null = null;
  function renderDial(force = false): void {
    const deg = (hourToAngle(hour) * 180) / Math.PI;
    if (force || Math.abs(deg - lastDialDeg) > 0.05) {
      lastDialDeg = deg;
      dialArm.style.transform = `rotate(${deg.toFixed(2)}deg)`;
      dialIcon.style.transform = `rotate(${(-deg).toFixed(2)}deg)`;
    }
    const text = formatHour(hour);
    if (text !== lastDialText) {
      lastDialText = text;
      dialTime.textContent = text;
      timeOut.textContent = text;
      dial.setAttribute('aria-valuenow', hour.toFixed(2));
      dial.setAttribute('aria-valuetext', text);
      if (document.activeElement !== timeInput) timeInput.value = hour.toFixed(2);
    }
    const day = isDay(hour);
    if (day !== lastDay) {
      lastDay = day;
      dialIcon.innerHTML = day ? SUN_SVG : MOON_SVG;
    }
  }

  let labels: {
    name: string;
    el: HTMLElement;
    x: number;
    y: number;
    z: number;
    cx: number;
    cz: number;
    ring: number;
  }[] = [];
  let labelsHidden = false;
  /** Last `update` arguments: opening / closing the edit panel re-lays the labels at once. */
  let lastUpdate: Parameters<Hud['update']> | null = null;
  const hud: Hud = {
    el,
    get visible() {
      return visible;
    },
    get photoMode() {
      return photo;
    },
    get editing() {
      return editing;
    },
    bindEdit(b) {
      editPanel.bind(b);
    },
    settled() {
      return editPanel.settled();
    },
    setWorld(world, accents) {
      labelsEl.innerHTML = '';
      labels = world.islands.map((i, n) => {
        const l = document.createElement('button');
        l.className = 'mar-label';
        const t = themeOf(i);
        const theme = t ? THEMES[t] : null;
        const accent =
          accents[i.archetypeName ?? i.name] ?? accents[i.name] ?? theme?.accent ?? UI.secondary;
        const text = theme ? `${theme.displayName} · ${i.name}` : i.name;
        l.setAttribute('aria-label', `Fly to ${text}`);
        l.title = text;
        // [accent disc + white glyph] Theme name, then the muted island name (hidden < 600 px)
        l.innerHTML = theme
          ? `<span class="mar-label-in mar-label-theme" style="animation-delay:${n * INTRO.labelStaggerMs}ms"><span class="mar-label-disc" style="background:${accent}">${themeIcon(theme.icon, 12)}</span>${theme.displayName}<span class="mar-label-sub">${i.name}</span></span>`
          : `<span class="mar-label-in" style="animation-delay:${n * INTRO.labelStaggerMs}ms"><span class="mar-dot" style="background:${accent}"></span>${i.name}</span>`;
        on(l, 'click', () => actions.onLabel(i.name));
        labelsEl.appendChild(l);
        return {
          name: i.name,
          el: l,
          x: i.peakX ?? i.cx,
          y: i.peakY + 8,
          z: i.peakZ ?? i.cz,
          cx: i.cx,
          cz: i.cz,
          ring: (i.reach ?? i.radius * 1.4) + HUD.labelRingPad,
        };
      });
    },
    setState(s) {
      Object.assign(state, s);
      if (s.weather !== undefined) {
        const tip = WEATHER_TIP[state.weather];
        weatherBtn.innerHTML = `${icon(state.weather)}<span class="mar-tip">${tip}</span>`;
        weatherBtn.setAttribute('aria-label', tip);
      }
      if (s.quality !== undefined)
        el.querySelectorAll<HTMLButtonElement>('.mar-seg button').forEach((b) =>
          b.setAttribute('aria-pressed', String(b.dataset.q === state.quality)),
        );
      if (s.reducedMotion !== undefined)
        q('[data-set="rm"]').setAttribute('aria-checked', String(state.reducedMotion));
      if (s.compass !== undefined) {
        q('[data-set="compass"]').setAttribute('aria-checked', String(state.compass));
        el.classList.toggle('mar-no-compass', !state.compass);
      }
      if (s.fov !== undefined) {
        fovInput.value = String(Math.round(state.fov));
        fovOut.textContent = `${Math.round(state.fov)}°`;
      }
      if (s.frozen !== undefined) {
        freezeBtn.setAttribute('aria-pressed', String(state.frozen));
        freezeBtn.classList.toggle('mar-on', state.frozen);
      }
    },
    update(camera, azimuth, tier, h, width, height) {
      lastUpdate = [camera, azimuth, tier, h, width, height];
      const deg = compassDeg(azimuth);
      if (Math.abs(deg - lastCompass) > 0.05 || !Number.isFinite(lastCompass)) {
        lastCompass = deg;
        rose.setAttribute('transform', `rotate(${deg.toFixed(2)} 32 32)`);
      }
      if (!drag) hour = h;
      renderDial();
      if (editing) editPanel.update();
      const showLabels = tier === 0 && !labelsHidden && !photo && visible;
      labelsEl.style.display = showLabels ? '' : 'none';
      if (!showLabels) return;
      const placed: LabelBox[] = [];
      // Keep labels off the dock (layout box: unaffected by the pop-in transform).
      const dockTop = dockEl.offsetTop - 8;
      const dockHalf = dockEl.offsetWidth / 2 + 6;
      // In edit mode the panel replaces the dock: a bottom card / sheet (labels go above it) or
      // the landscape side sheet (labels go left of it).
      // (bounding box: the desktop card is centred with a transform; `t` clears the title tab)
      const pr = editing ? editPanel.el.getBoundingClientRect() : null;
      const panel = pr
        ? { l: pr.left - 6, t: pr.top - 22, r: pr.right + 6, side: pr.height > height * 0.6 }
        : null;
      const underDock = (x: number, y: number, w: number, h: number): boolean =>
        panel
          ? y + h / 2 > panel.t && x + w / 2 > panel.l && x - w / 2 < panel.r
          : y + h / 2 > dockTop && Math.abs(x - width / 2) < dockHalf + w / 2;
      /** Move a label off the panel / dock: above it, or left of a side sheet. */
      const offDock = (x: number, w: number, lh: number): { x: number; y?: number } =>
        panel?.side ? { x: panel.l - w / 2 } : { x, y: (panel ? panel.t : dockTop) - lh / 2 };
      for (const l of labels) {
        // Above the island's top shelf edge (D2): the highest projected point of the shelf ring
        // and of the peak + 8 u anchor; x follows the island centre.
        _v.set(l.cx, 0, l.cz).project(camera);
        if (_v.z > 1 || _v.z < -1) {
          l.el.style.display = 'none';
          continue;
        }
        l.el.style.display = '';
        const sx = (_v.x * 0.5 + 0.5) * width;
        let top = Infinity;
        let bottom = -Infinity;
        for (let k = 0; k <= HUD.labelRingSamples; k++) {
          if (k === HUD.labelRingSamples) _v.set(l.x, l.y, l.z);
          else {
            const a = (k / HUD.labelRingSamples) * Math.PI * 2;
            _v.set(l.cx + Math.cos(a) * l.ring, 0, l.cz + Math.sin(a) * l.ring);
          }
          _v.project(camera);
          if (_v.z > 1 || _v.z < -1) continue;
          const y = (-_v.y * 0.5 + 0.5) * height;
          top = Math.min(top, y);
          if (k < HUD.labelRingSamples) bottom = Math.max(bottom, y);
        }
        // measured pill size: the theme labels are wider than the old name-only pills
        const w = l.el.offsetWidth || 90;
        const lh = l.el.offsetHeight || 28;
        const minY = lh / 2 + 8;
        // Off the land: above the shelf ring (preferred), else below it; off the dock / panel when
        // the dock covers the above spot. placeLabel nudges around placed labels (upward first).
        const above = Math.max(top - HUD.labelGapPx - lh / 2, minY);
        const spots: LabelSpot[] = [
          { x: sx, y: above, cost: 0 },
          { x: sx, y: bottom + HUD.labelGapPx + lh / 2, cost: lh * 1.5 },
        ];
        if (underDock(sx, above, w, lh)) {
          const o = offDock(sx, w, lh);
          spots.push({ x: o.x, y: o.y ?? above, cost: 0 });
        }
        const p = placeLabel(w, lh, spots, placed, { width, height }, (b) =>
          underDock(b.x, b.y, b.w, b.h),
        );
        placed.push(p);
        l.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`;
      }
    },
    show() {
      el.classList.add('mar-hud-on');
      if (instant) el.classList.add('mar-hud-shown');
      else later(() => el.classList.add('mar-hud-shown'), 900);
    },
    showWordmark() {
      el.classList.add('mar-hud-wordmark');
    },
    dockWordmark() {
      el.classList.add('mar-hud-wmdock');
    },
    setLabelsHidden(hidden) {
      labelsHidden = hidden;
    },
    setVisible(v) {
      if (v === visible) return;
      visible = v;
      el.classList.toggle('mar-hud-hidden', !v);
      if (!v) {
        hud.openPanel('');
        wakeGhost();
      } else {
        ghost.classList.remove('mar-ghost-awake');
      }
    },
    openPanel(panel) {
      const wasPhoto = photo;
      const wasEditing = editing;
      el.classList.toggle('mar-panel-settings', panel === 'settings');
      photo = panel === 'photo';
      el.classList.toggle('mar-panel-photo', photo);
      settings.setAttribute('aria-hidden', String(panel !== 'settings'));
      editing = panel === 'edit';
      el.classList.toggle('mar-panel-edit', editing);
      editBtn.setAttribute('aria-pressed', String(editing));
      editPanel.setOpen(editing);
      if (photo !== wasPhoto) {
        if (!photo && state.frozen) {
          hud.setState({ frozen: false });
          actions.onFreeze(false);
        }
        actions.onPhotoMode(photo);
      }
      // photo mode, settings, Esc and Done all leave edit mode through here
      if (editing !== wasEditing) {
        actions.onEditPanel(editing);
        // labels move off / back over the panel now (capture renders no further HUD frame)
        if (lastUpdate) hud.update(...lastUpdate);
      }
    },
    dispose() {
      editPanel.dispose();
      for (const c of cleanups) c();
      cleanups.length = 0;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      el.remove();
    },
  };
  hud.setState(state);
  renderDial(true);
  return hud;
}
