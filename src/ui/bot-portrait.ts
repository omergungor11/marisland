import {
  botLook,
  eyesFor,
  type BotEyes,
  type BotHead,
  type BotLook,
  type RoleItem,
} from '../content/bot-look.ts';
import { PORTRAIT as P, type PortraitChassis } from '../content/fleet-portrait.ts';
import { THEMES } from '../content/themes.ts';
import type { FleetSession } from '../fleet/protocol.ts';
import { mixHex } from './hud-math.ts';

/**
 * 2D bot portrait (TASK-591, M45): the same `BotLook` the 3D bot is built from, as an inline SVG
 * string (no asset, no script, no user text: only our own enums and numbers go in). Drawn in a
 * 48 × 48 viewBox: accent backdrop → antenna → legs / treads → arms → torso → head kind → eye
 * state → role item badge at the hand. Same look + size → byte-identical string.
 */

const C = P.colors;
/** Fixed 2-decimal numbers (a stable string on every engine). */
const n = (x: number): string => String(Math.round(x * 100) / 100);

interface Face {
  x: number;
  y: number;
  w: number;
  h: number;
}

function eyeGlyph(eyes: BotEyes, single: boolean, color: string, lw: number): string {
  const line = `fill="none" stroke="${color}" stroke-width="${n(lw)}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (eyes) {
    case 'idle':
      return single
        ? `<circle r="2.9" fill="${color}"/>`
        : `<rect x="-4.4" y="-2.1" width="2.8" height="4.2" rx="1.4" fill="${color}"/><rect x="1.6" y="-2.1" width="2.8" height="4.2" rx="1.4" fill="${color}"/>`;
    case 'working':
      return `<g fill="${color}"><circle cx="-3.7" cy="0.6" r="1.25"/><circle cy="0.6" r="1.25"/><circle cx="3.7" cy="0.6" r="1.25"/></g>`;
    case 'gate':
      return `<path d="M-2.1 -1.3C-2.1 -4.1 2.3 -4.1 2.3 -1.5C2.3 0 0 -0.1 0 1.3" ${line}/><circle cy="3.3" r="${n(lw * 0.62)}" fill="${color}"/>`;
    case 'error':
      return `<path d="M-5.3 -2.3L-2.3 0.7M-2.3 -2.3L-5.3 0.7M2.3 -2.3L5.3 0.7M5.3 -2.3L2.3 0.7M-1.3 3H1.3" ${line}/>`;
    case 'done':
      return `<path d="M-5.3 1.1L-3.5 -1.6L-1.7 1.1M1.7 1.1L3.5 -1.6L5.3 1.1" ${line}/>`;
  }
}

/** Role item drawn in a 10 × 10 local box around 0, 0 (ink outlines `lw` wide). */
function itemGlyph(item: Exclude<RoleItem, 'none'>, lw: number): string {
  const col = P.item.colors[item];
  const ink = `stroke="${C.ink}" stroke-width="${n(lw)}" stroke-linejoin="round"`;
  const bar = (d: string, w: number): string =>
    `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="${n(w)}" stroke-linecap="round"/>`;
  switch (item) {
    case 'brush':
      return `${bar('M-3.6 3.6L0.6 -0.6', lw * 2)}<ellipse cx="2" cy="-2" rx="1.9" ry="3.1" transform="rotate(45 2 -2)" fill="${col}" ${ink}/>`;
    case 'wrench':
      return `${bar('M-3.4 3.4L1 -1', lw * 2.2)}<circle cx="2" cy="-2" r="2.7" fill="${col}" ${ink}/><path d="M2.4 -5L5 -2.4" stroke="${C.surface}" stroke-width="1.7" stroke-linecap="round"/>`;
    case 'map':
      return `<rect x="-4.2" y="-3.2" width="8.4" height="6.4" rx="0.7" fill="${col}" ${ink}/><path d="M-1.4 -3.2V3.2M1.4 -3.2V3.2" stroke="${C.ink}" stroke-width="${n(lw * 0.6)}"/><circle cx="2.8" cy="-1" r="1" fill="${P.eyes.color.error}"/>`;
    case 'hammer':
      return `${bar('M-3.4 3.8L0.8 -0.4', lw * 2)}<rect x="-2" y="-5" width="7.4" height="3.6" rx="0.8" transform="rotate(45 1.7 -3.2)" fill="${col}" ${ink}/>`;
    case 'duck':
      return `<ellipse cx="-0.6" cy="1.5" rx="4" ry="2.7" fill="${col}" ${ink}/><circle cx="1.7" cy="-2" r="2.1" fill="${col}" ${ink}/><path d="M3.6 -2.3L5.4 -1.6L3.6 -0.9Z" fill="#FF9B3D"/><circle cx="2" cy="-2.4" r="0.55" fill="${C.ink}"/>`;
    case 'magnifier':
      return `${bar('M1.4 1.4L4.2 4.2', lw * 2.2)}<circle cx="-1" cy="-1" r="3.1" fill="${col}" ${ink}/>`;
    case 'hardhat':
      return `<path d="M-3.9 1.4A3.9 4.2 0 0 1 3.9 1.4Z" fill="${col}" ${ink}/><rect x="-5" y="1.2" width="10" height="2" rx="1" fill="${col}" ${ink}/>`;
    case 'book':
      return `<rect x="-3.8" y="-4.2" width="7.6" height="8.4" rx="1" fill="${col}" ${ink}/><path d="M-2 -4.2V4.2" stroke="${C.ink}" stroke-width="${n(lw)}"/><path d="M-0.2 -1.4H2.2M-0.2 0.8H2.2" stroke="${C.surface}" stroke-width="0.9" stroke-linecap="round"/>`;
  }
}

/** Head kind into the chassis' head box; returns the markup and the face the eyes go on. */
function head(
  kind: BotHead,
  b: PortraitChassis['head'],
  shell: string,
): { svg: string; face: Face; top: number } {
  const x0 = b.cx - b.w / 2;
  const y0 = b.cy - b.h / 2;
  switch (kind) {
    case 'monitor': {
      const H = P.head.monitor;
      const i = H.inset;
      return {
        svg: `<rect x="${n(x0)}" y="${n(y0)}" width="${n(b.w)}" height="${n(b.h)}" rx="${H.r}" fill="${shell}"/><rect x="${n(x0 + i)}" y="${n(y0 + i)}" width="${n(b.w - 2 * i)}" height="${n(b.h - 2 * i)}" rx="${n(H.r - 1)}" fill="${C.screen}" stroke="none"/>`,
        face: { x: x0 + i, y: y0 + i, w: b.w - 2 * i, h: b.h - 2 * i },
        top: y0,
      };
    }
    case 'visor': {
      const H = P.head.visor;
      const x1 = x0 + b.w;
      const y1 = y0 + b.h;
      const ry = b.h * 0.72;
      const bh = b.h * H.band;
      const by = y0 + b.h * H.at - bh / 2;
      const bx = x0 + 1.8;
      const bw = b.w - 3.6;
      return {
        svg: `<path d="M${n(x0)} ${n(y1)}V${n(y0 + ry)}A${n(b.w / 2)} ${n(ry)} 0 0 1 ${n(x1)} ${n(y0 + ry)}V${n(y1)}Z" fill="${shell}"/><rect x="${n(bx)}" y="${n(by)}" width="${n(bw)}" height="${n(bh)}" rx="${n(bh / 2)}" fill="${C.screen}"/>`,
        face: { x: bx + bh * 0.3, y: by, w: bw - bh * 0.6, h: bh },
        top: y0,
      };
    }
    case 'cam': {
      const r = Math.min(b.h / 2 + 2, b.w / 2);
      const lr = r * P.head.cam.lens;
      const s = lr * 1.42;
      return {
        svg: `<circle cx="${n(b.cx)}" cy="${n(b.cy)}" r="${n(r)}" fill="${shell}"/><circle cx="${n(b.cx)}" cy="${n(b.cy)}" r="${n(lr)}" fill="${C.screen}"/>`,
        face: { x: b.cx - s / 2, y: b.cy - s / 2, w: s, h: s },
        top: b.cy - r,
      };
    }
  }
}

export function botPortraitSvg(look: BotLook, size: number): string {
  const V = P.view;
  const ch: PortraitChassis = P.chassis[look.chassis];
  const accent = THEMES[look.dept].accent;
  const t = P.shades[look.shade];
  const body = t < 0 ? mixHex(accent, C.ink, -t) : mixHex(accent, C.white, t);
  const shell = mixHex(body, C.white, P.headLift);
  const back = mixHex(accent, C.surface, P.backdrop.mix);
  const sw = Math.max(P.stroke, (P.minStrokePx * V) / size);
  const eyeCol = P.eyes.color[look.eyes];
  const out: string[] = [];

  out.push(`<rect width="${V}" height="${V}" rx="${P.backdrop.r}" fill="${back}" stroke="none"/>`);
  const h = head(look.head, ch.head, shell);
  // antenna behind the head: a ring hoop (spire) or a ball lit in the eye colour
  const a = ch.antenna;
  const tipY = h.top - a.h;
  out.push(`<path d="M${n(ch.head.cx)} ${n(h.top + 1)}V${n(tipY)}" fill="none"/>`);
  out.push(
    a.ring > 0
      ? `<circle cx="${n(ch.head.cx)}" cy="${n(tipY - a.ring)}" r="${a.ring}" fill="${eyeCol}"/>`
      : `<circle cx="${n(ch.head.cx)}" cy="${n(tipY)}" r="1.9" fill="${eyeCol}"/>`,
  );
  // legs: two posts, or one tread block with wheels
  const L = ch.legs;
  if (L.tread) {
    const th = L.y1 - L.y0;
    const x0 = L.xs[0] - L.w / 2;
    out.push(
      `<rect x="${n(x0)}" y="${n(L.y0)}" width="${n(L.w)}" height="${n(th)}" rx="${n(th / 2)}" fill="${C.metal}"/>`,
    );
    const wheel = mixHex(C.metal, C.white, 0.45);
    const wx0 = x0 + th / 2;
    const step = (L.w - th) / 3;
    const cy = L.y0 + th / 2;
    out.push(
      `<g fill="${wheel}" stroke="none">${[0, 1, 2, 3].map((i) => `<circle cx="${n(wx0 + step * i)}" cy="${n(cy)}" r="${n(th * 0.26)}"/>`).join('')}</g>`,
    );
  } else
    for (const x of L.xs)
      out.push(
        `<rect x="${n(x - L.w / 2)}" y="${n(L.y0)}" width="${n(L.w)}" height="${n(L.y1 - L.y0)}" rx="${n(L.w * 0.42)}" fill="${C.metal}"/>`,
      );
  // neck, arms, torso (+ a lighter belly panel)
  const B = ch.body;
  const bx0 = B.cx - B.w / 2;
  const by0 = B.cy - B.h / 2;
  const hb = ch.head.cy + ch.head.h / 2;
  out.push(
    `<rect x="${n(ch.head.cx - 3)}" y="${n(hb - 1.5)}" width="6" height="${n(by0 - hb + 3)}" fill="${C.metal}"/>`,
  );
  const A = ch.arms;
  out.push(
    `<rect x="${n(bx0 - A.w + 1)}" y="${n(A.y0)}" width="${A.w}" height="${n(A.y1 - A.y0)}" rx="${n(A.w / 2)}" fill="${body}"/>`,
    `<rect x="${n(bx0 + B.w - 1)}" y="${n(A.y0)}" width="${A.w}" height="${n(A.y1 - A.y0)}" rx="${n(A.w / 2)}" fill="${body}"/>`,
  );
  out.push(
    `<rect x="${n(bx0)}" y="${n(by0)}" width="${B.w}" height="${B.h}" rx="${B.r}" fill="${body}"/>`,
    `<rect x="${n(B.cx - B.w * 0.22)}" y="${n(B.cy - B.h * 0.05)}" width="${n(B.w * 0.44)}" height="${n(B.h * 0.32)}" rx="${n(B.h * 0.16)}" fill="${shell}" stroke="none"/>`,
  );
  // head + eye state on its face (cam: one lens → one idle eye)
  out.push(h.svg);
  const [gw, gh] = P.eyes.box;
  const f = h.face;
  const k = Math.min((f.w * 0.84) / gw, (f.h * 0.84) / gh);
  const lw = Math.max(P.eyes.line, (P.minStrokePx * 1.3 * V) / size / k);
  out.push(
    `<g transform="translate(${n(f.x + f.w / 2)} ${n(f.y + f.h / 2)}) scale(${n(k)})" stroke="none">${eyeGlyph(look.eyes, look.head === 'cam', eyeCol, lw)}</g>`,
  );
  // role item: a cream badge at the hand (dropped below `item.minPx`: a smudge at chip size)
  if (look.item !== 'none' && size >= P.item.minPx) {
    const g = P.item.glyph / 10;
    out.push(
      `<circle cx="${n(ch.hand.x)}" cy="${n(ch.hand.y)}" r="${P.item.badge}" fill="${C.surface}"/>`,
      `<g transform="translate(${n(ch.hand.x)} ${n(ch.hand.y)}) scale(${n(g)})" stroke="none">${itemGlyph(look.item, sw / g)}</g>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" class="mar-bot" width="${size}" height="${size}" viewBox="0 0 ${V} ${V}" aria-hidden="true"><g stroke="${C.ink}" stroke-width="${n(sw)}" stroke-linejoin="round" stroke-linecap="round">${out.join('')}</g></svg>`;
}

/** A fleet session's look: seed = id, department = its island, role = its agent (TASK-591). */
export function sessionLook(
  s: Pick<FleetSession, 'id' | 'island' | 'agent' | 'status'>,
  pendingGate: boolean,
): BotLook {
  return botLook(s.id, s.island, s.agent, eyesFor(s.status, pendingGate));
}

const shown = new WeakMap<Element, string>();
/** Put a portrait into `el`; the DOM is touched only when the SVG string changed. */
export function putPortrait(el: Element, look: BotLook, size: number): void {
  const svg = botPortraitSvg(look, size);
  if (shown.get(el) === svg) return;
  shown.set(el, svg);
  el.innerHTML = svg;
}

/**
 * Portrait layout CSS (row column, terminal header, tip): its own `<style>`, injected once by the
 * first panel / tip (the HUD stylesheet is another task's file). Selectors carry one class more
 * than the `styles.ts` rules they extend, so the order of the two sheets does not matter.
 */
export const PORTRAIT_CSS = `
.mar-fbot{display:block;flex:none;line-height:0;}
.mar-fbot svg{display:block;}
.mar-fleet .mar-frow{grid-template-columns:${P.px.row}px 14px 1fr auto;}
.mar-fleet.mar-fleet-all .mar-frow{grid-template-columns:${P.px.fleetRow}px 14px 1fr auto;}
.mar-frow .mar-fbot{grid-row:1 / 3;grid-column:1;align-self:start;}
.mar-frow .mar-fdot{grid-column:2;}
.mar-frow .mar-fagent{grid-row:1;grid-column:3;}
.mar-frow .mar-fdur{grid-row:1;grid-column:4;}
.mar-frow .mar-ftitle,.mar-frow .mar-fline{grid-column:2 / 5;}
.mar-fleet.mar-fleet-compact .mar-frow{grid-template-columns:14px 1fr auto;}
.mar-fleet-compact .mar-frow .mar-fbot{display:none;}
.mar-fleet-compact .mar-frow .mar-fdot{grid-column:1;}
.mar-fleet-compact .mar-frow .mar-ftitle{grid-column:2 / 4;}
.mar-fterm-head .mar-fterm-bot{margin-top:-2px;}
.mar-fleet .mar-fcrew{flex:none;display:flex;align-items:center;gap:${P.crew.gapPx}px;margin:0 6px 6px;min-height:${P.px.fleetRow + 4}px;overflow:hidden;}
.mar-fleet .mar-fcrew[hidden]{display:none;}
.mar-fleet .mar-fchip{border:0;padding:0;background:none;cursor:pointer;border-radius:6px;}
@media (hover:hover){.mar-hud .mar-fleet .mar-fchip:hover{transform:translateY(-2px);}}
.mar-fleet .mar-fchip:focus-visible{outline:2px solid #3B3A5A;outline-offset:1px;}
.mar-fleet .mar-fcrew-more{font:800 11px/1 'Nunito',sans-serif;color:#7D7A96;padding-left:2px;white-space:nowrap;}
.mar-ftip.mar-ftip{flex-direction:row;align-items:center;gap:9px;padding-left:9px;}
.mar-ftip .mar-ftip-txt{display:flex;flex-direction:column;gap:1px;min-width:0;}
`;

/** Add `PORTRAIT_CSS` to the document once (idempotent; a plain style element, nothing to dispose). */
export function injectPortraitCss(doc: Document = document): void {
  if (doc.getElementById('mar-bot-css')) return;
  const style = doc.createElement('style');
  style.id = 'mar-bot-css';
  style.textContent = PORTRAIT_CSS;
  doc.head.appendChild(style);
}
