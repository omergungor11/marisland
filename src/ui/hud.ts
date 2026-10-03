import * as THREE from 'three';
import { UI } from '../content/palette.ts';
import type { CameraWorld } from '../camera/controls.ts';

/**
 * HUD (ART_BIBLE §9): wordmark, compass, dock (Time, Weather, New Seed, Photo, Sound),
 * island labels at T0. Plain DOM + CSS + inline SVG. `?hud=0` skips it entirely.
 */
export interface HudActions {
  onNewSeed(): void;
  onTime(): void;
  onWeather(): void;
  onPhoto(): void;
  onSound(): void;
  onCompass(): void;
  onLabel(name: string): void;
}

export interface Hud {
  el: HTMLElement;
  update(
    camera: THREE.PerspectiveCamera,
    azimuth: number,
    tier: number,
    world: CameraWorld,
    width: number,
    height: number,
  ): void;
  setWorld(world: CameraWorld, accents: Record<string, string>): void;
  /** Pop the HUD in (staggered 60 ms). */
  show(): void;
  hide(): void;
  dispose(): void;
}

const ICONS: Record<string, string> = {
  time: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  weather: '<path d="M7 17h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6-1.5A3.5 3.5 0 0 0 7 17z"/>',
  seed: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  photo:
    '<rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13.5" r="3.5"/><path d="M9 7l1.5-2.5h3L15 7"/>',
  sound: '<path d="M4 10v4h3l4 3V7l-4 3H4z"/><path d="M15 9.5a3.5 3.5 0 0 1 0 5"/>',
};

const icon = (name: string): string =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

const _v = new THREE.Vector3();

export function createHud(root: HTMLElement, actions: HudActions, instant = false): Hud {
  const el = document.createElement('div');
  el.className = instant ? 'mar-hud mar-hud-instant' : 'mar-hud';
  el.innerHTML = `
    <div class="mar-wordmark mar-pop">Marisland</div>
    <button class="mar-compass mar-pop" aria-label="Reset north">
      <svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="30" fill="${UI.surface}" stroke="${UI.ink}22" stroke-width="2"/>
      <g class="mar-compass-needle"><path d="M32 8 L38 32 L32 28 L26 32 Z" fill="${UI.primary}"/><path d="M32 56 L38 32 L32 36 L26 32 Z" fill="${UI.muted}"/></g>
      <text x="32" y="23" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="11" fill="${UI.ink}" class="mar-compass-n">N</text></svg>
    </button>
    <div class="mar-labels"></div>
    <div class="mar-dock">
      ${['time', 'weather', 'seed', 'photo', 'sound']
        .map(
          (k) =>
            `<button class="mar-btn mar-pop" data-action="${k}" aria-label="${k}">${icon(k)}<span class="mar-tip">${tip(k)}</span></button>`,
        )
        .join('')}
    </div>`;
  root.appendChild(el);
  const labelsEl = el.querySelector('.mar-labels') as HTMLElement;
  const needle = el.querySelector('.mar-compass-needle') as SVGGElement;
  const nText = el.querySelector('.mar-compass-n') as SVGTextElement;

  const handlers: Record<string, () => void> = {
    time: actions.onTime,
    weather: actions.onWeather,
    seed: actions.onNewSeed,
    photo: actions.onPhoto,
    sound: actions.onSound,
  };
  el.querySelectorAll<HTMLButtonElement>('.mar-btn').forEach((b) => {
    b.addEventListener('click', () => {
      b.classList.remove('mar-press');
      void b.offsetWidth;
      b.classList.add('mar-press');
      handlers[b.dataset.action ?? '']?.();
    });
  });
  (el.querySelector('.mar-compass') as HTMLButtonElement).addEventListener(
    'click',
    actions.onCompass,
  );

  let labels: { name: string; el: HTMLElement; x: number; y: number; z: number }[] = [];
  const hud: Hud = {
    el,
    setWorld(world, accents) {
      labelsEl.innerHTML = '';
      labels = world.islands.map((i) => {
        const l = document.createElement('button');
        l.className = 'mar-label';
        l.innerHTML = `<span class="mar-dot" style="background:${accents[i.name] ?? UI.secondary}"></span>${i.name}`;
        l.addEventListener('click', () => actions.onLabel(i.name));
        labelsEl.appendChild(l);
        return { name: i.name, el: l, x: i.cx, y: i.peakY + 8, z: i.cz };
      });
    },
    update(camera, azimuth, tier, _world, width, height) {
      needle.setAttribute('transform', `rotate(${(-azimuth * 180) / Math.PI} 32 32)`);
      nText.setAttribute('transform', `rotate(${(-azimuth * 180) / Math.PI} 32 32)`);
      const showLabels = tier === 0;
      labelsEl.style.display = showLabels ? '' : 'none';
      if (!showLabels) return;
      const placed: { x: number; y: number; w: number; h: number }[] = [];
      for (const l of labels) {
        _v.set(l.x, l.y, l.z).project(camera);
        if (_v.z > 1 || _v.z < -1) {
          l.el.style.display = 'none';
          continue;
        }
        l.el.style.display = '';
        let sx = (_v.x * 0.5 + 0.5) * width;
        let sy = (-_v.y * 0.5 + 0.5) * height;
        const w = l.el.offsetWidth || 90;
        const h = 28;
        // screen-space collision nudge: push down until free (bounded)
        for (let n = 0; n < 6; n++) {
          const hit = placed.find(
            (p) => Math.abs(p.x - sx) < (p.w + w) / 2 + 6 && Math.abs(p.y - sy) < (p.h + h) / 2 + 4,
          );
          if (!hit) break;
          sy = hit.y + hit.h + 6;
          sx += 4;
        }
        placed.push({ x: sx, y: sy, w, h });
        l.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`;
      }
    },
    show() {
      el.classList.add('mar-hud-on');
    },
    hide() {
      el.classList.remove('mar-hud-on');
    },
    dispose() {
      el.remove();
    },
  };
  return hud;
}

function tip(k: string): string {
  return (
    {
      time: 'Time of day',
      weather: 'Weather',
      seed: 'New seed',
      photo: 'Photo mode',
      sound: 'Sound',
    }[k] ?? k
  );
}

export const HUD_CSS = `
.mar-hud{position:fixed;inset:0;pointer-events:none;font-family:'Fredoka','Nunito',system-ui,sans-serif;color:${UI.ink};z-index:30;}
.mar-hud *{box-sizing:border-box;}
.mar-pop{opacity:0;transform:scale(0.6);}
.mar-hud-on .mar-pop{animation:mar-pop .42s cubic-bezier(.34,1.56,.64,1) forwards;}
.mar-hud-on .mar-dock .mar-btn:nth-child(1){animation-delay:.06s}.mar-hud-on .mar-dock .mar-btn:nth-child(2){animation-delay:.12s}
.mar-hud-on .mar-dock .mar-btn:nth-child(3){animation-delay:.18s}.mar-hud-on .mar-dock .mar-btn:nth-child(4){animation-delay:.24s}.mar-hud-on .mar-dock .mar-btn:nth-child(5){animation-delay:.3s}
@keyframes mar-pop{to{opacity:1;transform:scale(1)}}
.mar-wordmark{position:absolute;left:16px;top:12px;font-weight:700;font-size:32px;letter-spacing:.5px;text-shadow:0 2px 0 #FFF8EC,0 4px 12px #3B3A5A22;pointer-events:auto;user-select:none;}
.mar-compass{position:absolute;right:16px;top:16px;width:64px;height:64px;border:0;background:none;padding:0;cursor:pointer;pointer-events:auto;filter:drop-shadow(0 4px 0 #3B3A5A22);}
.mar-compass-needle,.mar-compass-n{transform-origin:32px 32px;transition:transform .12s linear;}
.mar-dock{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:12px;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 32px);pointer-events:auto;}
.mar-btn{position:relative;width:52px;height:52px;border-radius:999px;border:0;background:${UI.surface};color:${UI.ink};box-shadow:0 4px 0 #3B3A5A22;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .12s ease,box-shadow .12s ease;}
.mar-btn:hover{transform:translateY(-2px) scale(1.06);}
.mar-btn:hover .mar-tip{opacity:1;transition-delay:.4s;}
.mar-btn.mar-press{animation:mar-press .35s cubic-bezier(.34,1.56,.64,1);}
@keyframes mar-press{0%{transform:scale(.9)}100%{transform:scale(1)}}
.mar-tip{position:absolute;bottom:62px;left:50%;transform:translateX(-50%);white-space:nowrap;background:${UI.ink};color:${UI.surface};font:700 13px/1 'Nunito',sans-serif;padding:8px 12px;border-radius:999px;opacity:0;pointer-events:none;transition:opacity .15s;}
.mar-hud-instant .mar-pop,.mar-hud-instant .mar-label{animation:none!important;opacity:1;transform:none;}
.mar-labels{position:absolute;inset:0;}
.mar-label{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;border:0;display:inline-flex;align-items:center;gap:8px;height:28px;padding:0 12px 0 10px;border-radius:999px;background:#FFF8ECDD;color:${UI.ink};font:600 16px/1 'Fredoka',sans-serif;box-shadow:0 2px 0 #3B3A5A22;white-space:nowrap;animation:mar-pop .25s cubic-bezier(.34,1.56,.64,1) both;}
.mar-dot{width:8px;height:8px;border-radius:50%;display:inline-block;}
@media (max-width:480px){.mar-wordmark{font-size:24px}.mar-btn{width:46px;height:46px}.mar-dock{gap:8px}}
`;
