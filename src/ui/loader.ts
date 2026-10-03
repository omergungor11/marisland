import { UI } from '../content/palette.ts';

/**
 * Loading screen (ART_BIBLE §8 "Loading screen"): gradient, canvas island blob with
 * a turquoise ring, a tiny boat whose lap is the progress bar, rotating captions.
 */
const CAPTIONS = [
  'Raising islands…',
  'Planting palms…',
  'Teaching crabs to walk sideways…',
  'Filling the lagoon…',
  'Hanging the laundry…',
];

export interface Loader {
  setProgress(p: number): void;
  setCaption(text: string): void;
  /** Exit animation; resolves when removed. */
  finish(): Promise<void>;
  fail(message: string): void;
  el: HTMLElement;
}

export function createLoader(root: HTMLElement, animate: boolean): Loader {
  const el = document.createElement('div');
  el.className = 'mar-loader';
  el.innerHTML = `
    <canvas class="mar-loader-canvas" width="240" height="240"></canvas>
    <div class="mar-loader-caption">${CAPTIONS[0]}</div>
  `;
  root.appendChild(el);
  const canvas = el.querySelector('canvas') as HTMLCanvasElement;
  const caption = el.querySelector('.mar-loader-caption') as HTMLElement;
  const ctx = canvas.getContext('2d');
  let progress = 0;
  let captionIdx = 0;
  let raf = 0;
  let last = 0;
  let captionTimer = 0;

  const draw = (t: number): void => {
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    // turquoise ring
    ctx.fillStyle = '#4FD1D9';
    blob(ctx, cx, cy + 6, 86, 0.08, 1);
    ctx.fillStyle = '#8EEBE0';
    blob(ctx, cx, cy + 6, 70, 0.1, 1.3);
    // sand + green
    ctx.fillStyle = '#F7E1AE';
    blob(ctx, cx, cy + 4, 58, 0.12, 1.7);
    ctx.fillStyle = '#7BC950';
    blob(ctx, cx, cy, 42, 0.16, 2.3);
    ctx.fillStyle = '#A6DB5E';
    blob(ctx, cx - 4, cy - 6, 26, 0.2, 3.1);
    // boat circling: lap = progress
    const a = -Math.PI / 2 + progress * Math.PI * 2;
    const bx = cx + Math.cos(a) * 100;
    const by = cy + 6 + Math.sin(a) * 100 * 0.7;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(a + Math.PI / 2 + Math.sin(t * 0.004) * 0.05);
    ctx.fillStyle = '#A8754F';
    ctx.beginPath();
    ctx.moveTo(-8, -3);
    ctx.lineTo(8, -3);
    ctx.lineTo(5, 4);
    ctx.lineTo(-5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(0, -16);
    ctx.lineTo(7, -5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const tick = (t: number): void => {
    if (animate) {
      captionTimer += t - last;
      if (captionTimer > 1200) {
        captionTimer = 0;
        captionIdx = (captionIdx + 1) % CAPTIONS.length;
        caption.textContent = CAPTIONS[captionIdx];
      }
    }
    last = t;
    draw(t);
    raf = requestAnimationFrame(tick);
  };
  if (animate) raf = requestAnimationFrame(tick);
  else draw(0);

  return {
    el,
    setProgress(p) {
      progress = Math.max(progress, Math.min(1, p));
      if (!animate) draw(0);
    },
    setCaption(text) {
      caption.textContent = text;
    },
    async finish() {
      cancelAnimationFrame(raf);
      progress = 1;
      draw(0);
      if (animate) {
        el.classList.add('mar-loader-exit');
        await new Promise((r) => setTimeout(r, 420));
      }
      el.remove();
    },
    fail(message) {
      cancelAnimationFrame(raf);
      caption.textContent = message;
      el.classList.add('mar-loader-error');
    },
  };
}

function blob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  amp: number,
  phase: number,
): void {
  ctx.beginPath();
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + amp * (Math.sin(a * 3 + phase) * 0.6 + Math.sin(a * 5 + phase * 1.7) * 0.4);
    const x = cx + Math.cos(a) * r * k;
    const y = cy + Math.sin(a) * r * k * 0.72;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

export const LOADER_CSS = `
.mar-loader{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
  background:linear-gradient(180deg,${UI.loadingGradient[0]} 0%,${UI.loadingGradient[1]} 100%);z-index:50;transition:opacity .4s ease, transform .4s ease;}
.mar-loader-canvas{width:240px;height:240px;}
.mar-loader-caption{font-family:'Nunito',system-ui,sans-serif;font-weight:700;font-size:18px;color:${UI.ink};}
.mar-loader-exit{opacity:0;transform:scale(1.15);pointer-events:none;}
.mar-loader-error .mar-loader-caption{color:#C0392B;max-width:80vw;text-align:center;white-space:pre-wrap;font-size:14px;}
`;
