import { CLOUD } from '../content/palette.ts';

/**
 * Cloud curtain (ART_BIBLE §8/§9): cream cloud blobs that close over the screen
 * (0.8 s) and part radially (1.2 s). Used by New Seed and the intro. Pure DOM/CSS.
 */
export interface Curtain {
  close(): Promise<void>;
  open(): Promise<void>;
  /** Show instantly closed (intro start). */
  setClosed(): void;
  dispose(): void;
}

const N = 14;

export function createCurtain(root: HTMLElement, reducedMotion: boolean): Curtain {
  const el = document.createElement('div');
  el.className = 'mar-curtain';
  let html = '';
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = 18 + (i % 3) * 12;
    const x = 50 + Math.cos(a) * r;
    const y = 50 + Math.sin(a) * r * 0.9;
    const s = 46 + ((i * 37) % 30);
    html += `<div class="mar-cloud" style="left:${x}%;top:${y}%;width:${s}vmax;height:${s * 0.62}vmax;--dx:${Math.cos(a) * 120}vmax;--dy:${Math.sin(a) * 120}vmax;--d:${(i * 53) % 220}ms"></div>`;
  }
  html += `<div class="mar-cloud mar-cloud-centre" style="left:50%;top:50%;width:70vmax;height:44vmax;--dx:0;--dy:120vmax;--d:60ms"></div>`;
  el.innerHTML = html;
  root.appendChild(el);
  const wait = (ms: number): Promise<void> =>
    new Promise((r) => setTimeout(r, reducedMotion ? 0 : ms));
  return {
    async close() {
      el.classList.remove('mar-curtain-open');
      el.classList.add('mar-curtain-on', 'mar-curtain-closed');
      await wait(800);
    },
    async open() {
      el.classList.remove('mar-curtain-closed');
      el.classList.add('mar-curtain-open');
      await wait(1300);
      el.classList.remove('mar-curtain-on', 'mar-curtain-open');
    },
    setClosed() {
      el.classList.add('mar-curtain-on', 'mar-curtain-closed', 'mar-curtain-instant');
      void el.offsetWidth;
      el.classList.remove('mar-curtain-instant');
    },
    dispose() {
      el.remove();
    },
  };
}

export const CURTAIN_CSS = `
.mar-curtain{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:45;display:none;}
.mar-curtain-on{display:block;}
.mar-cloud{position:absolute;border-radius:50%;background:radial-gradient(circle at 50% 40%, #FFFFFF 0%, ${CLOUD.intro} 55%, ${CLOUD.intro}00 72%);
  transform:translate(-50%,-50%) translate(var(--dx),var(--dy)) scale(0.6);opacity:0;
  transition:transform .8s cubic-bezier(.2,.7,.3,1) var(--d), opacity .5s ease var(--d);filter:blur(2px);}
.mar-curtain-closed .mar-cloud{transform:translate(-50%,-50%) translate(0,0) scale(1.1);opacity:1;}
.mar-curtain-open .mar-cloud{transform:translate(-50%,-50%) translate(var(--dx),var(--dy)) scale(1.3);opacity:0;transition:transform 1.2s cubic-bezier(.3,0,.6,1) var(--d), opacity .9s ease calc(var(--d) + .3s);}
.mar-curtain-instant .mar-cloud{transition:none!important;}
`;
