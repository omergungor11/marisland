import { FLEET_BOTS as B } from '../content/fleet.ts';
import { PORTRAIT } from '../content/fleet-portrait.ts';
import type { FleetSession } from '../fleet/protocol.ts';
import { injectPortraitCss, putPortrait, sessionLook } from './bot-portrait.ts';

/**
 * Hover tip of a bound bot (TASK-564): agent (small caps) + session title, in the fleet panel's
 * look (`styles.ts` FLEET_PANEL_CSS `.mar-ftip`), accent bar on the left. Inside the HUD element,
 * so hiding the HUD hides it. Pointer positions are canvas CSS px (the HUD is full-viewport).
 */
export interface FleetTip {
  /** `pendingGate`: the session has a gate waiting (the portrait asks `?`). */
  show(s: FleetSession, accent: string, x: number, y: number, pendingGate?: boolean): void;
  hide(): void;
  dispose(): void;
}

export function createFleetTip(root: HTMLElement): FleetTip {
  injectPortraitCss();
  const el = document.createElement('div');
  el.className = 'mar-ftip';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<span class="mar-fbot"></span><span class="mar-ftip-txt"><span class="mar-fagent"></span><span class="mar-ftip-title"></span></span>';
  root.appendChild(el);
  const bot = el.firstElementChild as HTMLElement;
  const agent = el.querySelector('.mar-fagent') as HTMLElement;
  const title = el.querySelector('.mar-ftip-title') as HTMLElement;
  let shownId = '';
  return {
    show(s, accent, x, y, pendingGate = false) {
      putPortrait(bot, sessionLook(s, pendingGate), PORTRAIT.px.tip);
      if (shownId !== s.id) {
        shownId = s.id;
        agent.textContent = s.agent;
        title.textContent = s.title;
        el.style.setProperty('--acc', accent);
      }
      // flip to the left / above near the right / bottom edge
      const w = Math.min(B.tip.maxWidth, el.offsetWidth || B.tip.maxWidth);
      const left = x + B.tip.dx + w > root.clientWidth ? x - B.tip.dx - w : x + B.tip.dx;
      el.style.transform = `translate(${Math.max(8, left)}px,${y + B.tip.dy}px)`;
      el.classList.add('mar-ftip-on');
    },
    hide() {
      shownId = '';
      el.classList.remove('mar-ftip-on');
    },
    dispose() {
      el.remove();
    },
  };
}
