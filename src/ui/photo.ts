import { UI } from '../content/palette.ts';

/**
 * Photo mode (ART_BIBLE §9): HUD fades, bottom bar with shutter + sliders (time, FOV),
 * 120 ms white flash, polaroid thumbnail drops in, PNG downloads. Esc exits.
 */
export interface PhotoDeps {
  getHour(): number;
  setHour(h: number): void;
  getFov(): number;
  setFov(f: number): void;
  /** Render one frame synchronously and return the canvas. */
  snapshot(): HTMLCanvasElement;
  seed: number;
  onExit(): void;
}

export interface PhotoMode {
  el: HTMLElement;
  enter(): void;
  exit(): void;
  readonly active: boolean;
  dispose(): void;
}

export function createPhotoMode(root: HTMLElement, d: PhotoDeps): PhotoMode {
  const el = document.createElement('div');
  el.className = 'mar-photo';
  el.innerHTML = `
    <div class="mar-flash"></div>
    <div class="mar-polaroids"></div>
    <div class="mar-photo-bar">
      <label>Time <input type="range" class="mar-photo-time" min="0" max="24" step="0.05"></label>
      <button class="mar-shutter" aria-label="Take photo"><span></span></button>
      <label>FOV <input type="range" class="mar-photo-fov" min="15" max="60" step="1"></label>
      <button class="mar-photo-exit" aria-label="Exit photo mode">Esc</button>
    </div>`;
  root.appendChild(el);
  const flash = el.querySelector('.mar-flash') as HTMLElement;
  const polaroids = el.querySelector('.mar-polaroids') as HTMLElement;
  const timeIn = el.querySelector('.mar-photo-time') as HTMLInputElement;
  const fovIn = el.querySelector('.mar-photo-fov') as HTMLInputElement;
  let active = false;

  timeIn.addEventListener('input', () => d.setHour(Number(timeIn.value)));
  fovIn.addEventListener('input', () => d.setFov(Number(fovIn.value)));
  (el.querySelector('.mar-photo-exit') as HTMLButtonElement).addEventListener('click', () =>
    mode.exit(),
  );
  (el.querySelector('.mar-shutter') as HTMLButtonElement).addEventListener('click', () => {
    flash.classList.remove('mar-flash-on');
    void flash.offsetWidth;
    flash.classList.add('mar-flash-on');
    const canvas = d.snapshot();
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    const h = d.getHour();
    a.download = `marisland-${d.seed}-${String(Math.floor(h)).padStart(2, '0')}${String(Math.floor((h % 1) * 60)).padStart(2, '0')}.png`;
    a.href = url;
    a.click();
    const card = document.createElement('div');
    card.className = 'mar-polaroid';
    card.innerHTML = `<img src="${url}" alt="photo"><span>Marisland · seed ${d.seed}</span>`;
    polaroids.appendChild(card);
    setTimeout(() => card.remove(), 6000);
  });
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape' && active) mode.exit();
  };
  window.addEventListener('keydown', onKey);

  const mode: PhotoMode = {
    el,
    get active() {
      return active;
    },
    enter() {
      active = true;
      timeIn.value = String(d.getHour());
      fovIn.value = String(d.getFov());
      el.classList.add('mar-photo-on');
    },
    exit() {
      if (!active) return;
      active = false;
      el.classList.remove('mar-photo-on');
      d.onExit();
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
      el.remove();
    },
  };
  return mode;
}

export const PHOTO_CSS = `
.mar-photo{position:fixed;inset:0;pointer-events:none;z-index:35;font-family:'Nunito',sans-serif;color:${UI.ink};}
.mar-flash{position:absolute;inset:0;background:#fff;opacity:0;}
.mar-flash-on{animation:mar-flash .12s ease-out;}
@keyframes mar-flash{0%{opacity:1}100%{opacity:0}}
.mar-photo-bar{position:absolute;left:50%;bottom:16px;transform:translate(-50%,120%);display:flex;align-items:center;gap:18px;background:${UI.surface};border-radius:999px;padding:10px 20px;box-shadow:0 4px 0 #3B3A5A22;pointer-events:auto;transition:transform .3s cubic-bezier(.34,1.56,.64,1);font-weight:800;font-size:13px;}
.mar-photo-on .mar-photo-bar{transform:translate(-50%,0);}
.mar-photo-bar label{display:flex;align-items:center;gap:8px;}
.mar-photo-bar input[type=range]{width:120px;accent-color:${UI.primary};}
.mar-shutter{width:72px;height:72px;border-radius:50%;border:4px solid ${UI.ink};background:${UI.primary};cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 0 #3B3A5A33;}
.mar-shutter span{width:52px;height:52px;border-radius:50%;background:${UI.surface};display:block;}
.mar-shutter:active span{transform:scale(.9);}
.mar-photo-exit{border:0;background:${UI.ink};color:${UI.surface};border-radius:999px;padding:8px 14px;font:800 13px 'Nunito',sans-serif;cursor:pointer;}
.mar-polaroids{position:absolute;right:24px;bottom:120px;}
.mar-polaroid{background:#fff;padding:8px 8px 22px;box-shadow:0 8px 24px #3B3A5A44;transform:rotate(-4deg);animation:mar-drop .5s cubic-bezier(.34,1.56,.64,1);width:180px;}
.mar-polaroid img{width:100%;display:block;}
.mar-polaroid span{display:block;text-align:center;font:700 11px 'Nunito',sans-serif;margin-top:6px;}
@keyframes mar-drop{from{transform:translateY(-40px) rotate(6deg);opacity:0}to{transform:rotate(-4deg);opacity:1}}
@media (max-width:600px){.mar-photo-bar{gap:10px;padding:8px 12px}.mar-photo-bar input[type=range]{width:70px}}
`;
