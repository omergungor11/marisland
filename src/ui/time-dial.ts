import { UI } from '../content/palette.ts';
import type { EnvState } from '../env/env-state.ts';

/**
 * Time dial (ART_BIBLE §9): a 120 px arc filled with the live sky gradient; a sun/moon icon rides it.
 * Drag to scrub (pauses live time); double-click returns to live time.
 */
export interface TimeDial {
  el: HTMLElement;
  toggle(): void;
  update(hour: number, env: EnvState): void;
  dispose(): void;
}

const R = 52;
const CX = 60;
const CY = 62;

function arcPoint(hour: number): [number, number] {
  // 0 h at the left, 12 h at the top, 24 h at the right (semi-circle)
  const t = ((hour % 24) + 24) % 24;
  const a = Math.PI - (t / 24) * Math.PI;
  return [CX + Math.cos(a) * R, CY - Math.sin(a) * R];
}

const rgb = (c: { r: number; g: number; b: number }): string => {
  const f = (v: number): number =>
    Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  return `rgb(${f(c.r)},${f(c.g)},${f(c.b)})`;
};

export function createTimeDial(
  root: HTMLElement,
  onScrub: (hour: number | null) => void,
): TimeDial {
  const el = document.createElement('div');
  el.className = 'mar-dial';
  el.innerHTML = `<svg viewBox="0 0 120 70" width="120" height="70">
    <defs><linearGradient id="mar-sky" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#CDEFFF"/><stop offset="1" stop-color="#5CB8F2"/></linearGradient></defs>
    <path class="mar-dial-arc" d="M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}" fill="none" stroke="url(#mar-sky)" stroke-width="10" stroke-linecap="round"/>
    <circle class="mar-dial-knob" cx="${CX}" cy="${CY - R}" r="9" fill="#FFE45C" stroke="${UI.ink}" stroke-width="2"/>
    <text class="mar-dial-label" x="${CX}" y="${CY + 4}" text-anchor="middle" font-family="Fredoka" font-weight="600" font-size="13" fill="${UI.ink}">15:00</text>
  </svg>`;
  root.appendChild(el);
  const svg = el.querySelector('svg') as SVGSVGElement;
  const knob = el.querySelector('.mar-dial-knob') as SVGCircleElement;
  const label = el.querySelector('.mar-dial-label') as SVGTextElement;
  const stops = el.querySelectorAll<SVGStopElement>('stop');
  let dragging = false;
  let open = false;

  const hourFromEvent = (ev: PointerEvent): number => {
    const r = svg.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * 120 - CX;
    const y = CY - ((ev.clientY - r.top) / r.height) * 70;
    let a = Math.atan2(Math.max(y, 0), x); // 0..π
    a = Math.min(Math.PI, Math.max(0, a));
    return ((Math.PI - a) / Math.PI) * 24;
  };
  svg.addEventListener('pointerdown', (ev) => {
    dragging = true;
    svg.setPointerCapture(ev.pointerId);
    onScrub(hourFromEvent(ev));
  });
  svg.addEventListener('pointermove', (ev) => {
    if (dragging) onScrub(hourFromEvent(ev));
  });
  const stop = (): void => {
    dragging = false;
  };
  svg.addEventListener('pointerup', stop);
  svg.addEventListener('pointercancel', stop);
  svg.addEventListener('dblclick', () => onScrub(null));

  return {
    el,
    toggle() {
      open = !open;
      el.classList.toggle('mar-dial-on', open);
    },
    update(hour, env) {
      if (!open) return;
      const [x, y] = arcPoint(hour);
      knob.setAttribute('cx', x.toFixed(1));
      knob.setAttribute('cy', y.toFixed(1));
      knob.setAttribute('fill', env.night > 0.6 ? '#BFD4FF' : '#FFE45C');
      const h = Math.floor(hour);
      const m = Math.floor((hour - h) * 60);
      label.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      stops[0].setAttribute('stop-color', rgb(env.horizon));
      stops[1].setAttribute('stop-color', rgb(env.zenith));
    },
    dispose() {
      el.remove();
    },
  };
}

export const DIAL_CSS = `
.mar-dial{position:absolute;left:50%;bottom:84px;transform:translateX(-50%) scale(.6);opacity:0;pointer-events:none;background:${UI.surface};border-radius:16px;padding:6px 8px 2px;box-shadow:0 4px 0 #3B3A5A22;transition:transform .25s cubic-bezier(.34,1.56,.64,1),opacity .2s;}
.mar-dial-on{opacity:1;transform:translateX(-50%) scale(1);pointer-events:auto;}
.mar-dial svg{display:block;touch-action:none;cursor:ew-resize;}
`;
