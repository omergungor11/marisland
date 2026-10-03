import { LOADER_CSS } from './loader.ts';
import { CURTAIN_CSS } from './curtain.ts';
import { UI } from '../content/palette.ts';
import { HUD } from '../content/ui.ts';

export function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
html,body{margin:0;height:100%;overflow:hidden;background:${UI.loadingGradient[0]};}
#app{position:fixed;inset:0;}
canvas.mar-canvas{display:block;width:100%;height:100%;touch-action:none;outline:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}
.mar-stats{position:fixed;left:8px;bottom:8px;font:11px/1.35 ui-monospace,Menlo,monospace;color:#FFF8EC;background:#3B3A5ACC;
  padding:6px 8px;border-radius:8px;white-space:pre;z-index:40;pointer-events:none;}
${LOADER_CSS}
${HUD_CSS}
${CURTAIN_CSS}
`;
  document.head.appendChild(style);
}

/** Make sure the HUD fonts are loaded before `document.fonts.ready` resolves (capture determinism). */
export function preloadFonts(): Promise<unknown> {
  const f = document.fonts;
  return Promise.all(
    ['600 16px Fredoka', '700 32px Fredoka', '700 14px Nunito', '800 12px Nunito'].map((s) =>
      f.load(s).catch(() => []),
    ),
  );
}

const lip = '0 4px 0 #3B3A5A22';
const soft = '0 10px 28px #3B3A5A26';
const ease = 'cubic-bezier(.34,1.56,.64,1)';
const fade = `${HUD.photoFadeMs}ms`;
/** Cream sticker outline so the ink wordmark reads on night water too. */
const halo = [
  [2, 0],
  [-2, 0],
  [0, 2],
  [0, -2],
  [1.5, 1.5],
  [-1.5, 1.5],
  [1.5, -1.5],
  [-1.5, -1.5],
]
  .map(([x, y]) => `${x}px ${y}px 0 ${UI.surface}`)
  .concat(['0 4px 0 #3B3A5A33', '0 6px 14px #3B3A5A33'])
  .join(',');

/** HUD (ART_BIBLE §9). Tokens from content/palette UI. */
export const HUD_CSS = `
.mar-hud{position:fixed;inset:0;pointer-events:none;font-family:'Fredoka','Nunito',system-ui,sans-serif;color:${UI.ink};z-index:30;-webkit-tap-highlight-color:transparent;}
.mar-hud *{box-sizing:border-box;}
.mar-hud button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent;}
.mar-hud :focus-visible{outline:3px solid ${UI.secondary};outline-offset:2px;}

/* pop-ins: stagger via inline animation-delay; .mar-hud-shown pins the final state so press/hover work */
.mar-pop{opacity:0;transform:scale(0.6);}
.mar-hud-on .mar-pop{animation:mar-pop .42s ${ease} forwards;}
@keyframes mar-pop{to{opacity:1;transform:scale(1)}}
.mar-hud-shown .mar-pop{animation:none;opacity:1;transform:none;}
.mar-hud .mar-pop.mar-press{animation:mar-press .32s ${ease};}
@keyframes mar-press{0%{transform:scale(.9)}100%{transform:scale(1)}}

/* wordmark: centred 64 px during the intro, top-left 32 px after */
.mar-wordmark{position:absolute;left:16px;top:12px;font-weight:700;font-size:32px;line-height:1.1;letter-spacing:.5px;white-space:nowrap;
  transform:translate(0,0);text-shadow:${halo};user-select:none;pointer-events:none;}
.mar-hud-on .mar-wordmark,.mar-hud-wmdock .mar-wordmark{transition:left .8s cubic-bezier(.4,0,.2,1),top .8s cubic-bezier(.4,0,.2,1),font-size .8s cubic-bezier(.4,0,.2,1),transform .8s cubic-bezier(.4,0,.2,1),opacity ${fade};}
.mar-hud.mar-hud-wordmark:not(.mar-hud-on){z-index:46;}
.mar-hud-wordmark:not(.mar-hud-on):not(.mar-hud-wmdock) .mar-wordmark{left:50%;top:38%;font-size:64px;transform:translate(-50%,-50%);}
.mar-wm-in{display:inline-block;opacity:0;transform:scale(.6);}
.mar-hud-on .mar-wm-in,.mar-hud-wordmark .mar-wm-in{animation:mar-pop .6s ${ease} forwards;}

/* compass */
.mar-compass{position:absolute;right:16px;top:16px;width:64px;height:64px;border:0;background:none;padding:0;cursor:pointer;pointer-events:auto;border-radius:50%;filter:drop-shadow(${lip});transition:opacity ${fade},visibility 0s;}
.mar-compass svg{width:100%;height:100%;display:block;}
.mar-no-compass .mar-compass{display:none;}

/* dock */
.mar-dock{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center;
  width:max-content;max-width:calc(100vw - 32px);pointer-events:auto;transition:opacity ${fade},visibility 0s;}
.mar-btn{position:relative;flex:none;width:52px;height:52px;border-radius:999px;border:0;padding:0;background:${UI.surface};color:${UI.ink};box-shadow:${lip};cursor:pointer;
  display:flex;align-items:center;justify-content:center;transition:transform .12s ease,background-color .15s;pointer-events:auto;}
.mar-hud .mar-btn:hover{transform:translateY(-2px) scale(1.06);}
.mar-hud .mar-btn.mar-on{background:${UI.secondary};}
.mar-tip{position:absolute;bottom:calc(100% + 10px);left:50%;transform:translateX(-50%);white-space:nowrap;background:${UI.ink};color:${UI.surface};
  font:700 13px/1 'Nunito',sans-serif;padding:8px 12px;border-radius:999px;opacity:0;pointer-events:none;transition:opacity .15s;}
@media (hover:hover){.mar-btn:hover .mar-tip,.mar-dial:hover:not(.mar-dial-drag) .mar-tip{opacity:1;transition-delay:.4s;}}

/* time dial: sky ring, sun/moon riding it, time in the face */
.mar-dial{--d:64px;position:relative;flex:none;width:var(--d);height:var(--d);border-radius:50%;cursor:grab;touch-action:none;filter:drop-shadow(${lip});user-select:none;}
.mar-dial-drag{cursor:grabbing;}
.mar-dial-ring{position:absolute;inset:0;border-radius:50%;box-shadow:inset 0 0 0 2px #FFFFFF55;}
.mar-dial-face{position:absolute;inset:calc(var(--d) * .17);border-radius:50%;background:${UI.surface};display:flex;align-items:center;justify-content:center;}
.mar-dial-time{font:800 12px/1 'Nunito',sans-serif;font-variant-numeric:tabular-nums;letter-spacing:.2px;}
.mar-dial-arm{position:absolute;left:50%;top:50%;width:0;height:0;}
.mar-dial-icon{position:absolute;width:20px;height:20px;left:-10px;top:calc(var(--d) * -.414 - 10px);display:block;}
.mar-dial-icon svg{display:block;filter:drop-shadow(0 1px 1px #3B3A5A44);}

/* sheets (settings) */
.mar-sheet{position:absolute;left:50%;bottom:${16 + 64 + 14}px;width:292px;max-width:calc(100vw - 32px);transform:translate(-50%,8px) scale(.97);transform-origin:50% 100%;
  background:${UI.surface};border-radius:16px;box-shadow:${lip},${soft};padding:12px 16px 14px;opacity:0;visibility:hidden;pointer-events:none;
  transition:opacity .16s ease,transform .22s ${ease},visibility 0s .22s;}
.mar-panel-settings .mar-settings{opacity:1;visibility:visible;pointer-events:auto;transform:translate(-50%,0) scale(1);transition:opacity .16s ease,transform .22s ${ease},visibility 0s;}
.mar-sheet-title{font:700 18px/1.2 'Fredoka',sans-serif;margin:2px 0 6px;}
.mar-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;font:700 15px/1.2 'Nunito',sans-serif;}
.mar-seg{display:flex;background:#3B3A5A14;border-radius:999px;padding:3px;gap:2px;}
.mar-seg button{border:0;background:none;border-radius:999px;padding:7px 11px;font:700 14px/1 'Nunito',sans-serif;color:#3B3A5AAA;cursor:pointer;}
.mar-seg button[aria-pressed="true"]{background:#FFFFFF;color:${UI.ink};box-shadow:0 2px 0 #3B3A5A22;}
.mar-switch{position:relative;width:48px;height:28px;border-radius:999px;border:0;padding:0;background:${UI.muted};cursor:pointer;transition:background-color .15s;flex:none;}
.mar-switch i{position:absolute;left:3px;top:3px;width:22px;height:22px;border-radius:50%;background:#FFFFFF;box-shadow:0 2px 0 #3B3A5A22;transition:transform .25s ${ease};}
.mar-switch[aria-checked="true"]{background:${UI.secondary};}
.mar-switch[aria-checked="true"] i{transform:translateX(20px);}
.mar-wide{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:44px;margin-top:8px;border:0;border-radius:999px;background:#3B3A5A10;
  font:700 15px/1 'Nunito',sans-serif;cursor:pointer;}
.mar-wide kbd{font:800 12px/1 'Nunito',sans-serif;padding:4px 7px;border-radius:6px;background:${UI.surface};box-shadow:0 2px 0 #3B3A5A22;}

/* photo mode: HUD fades out, the photo bar fades in */
.mar-panel-photo .mar-wordmark,.mar-hud.mar-panel-photo .mar-compass,.mar-panel-photo .mar-dock,.mar-panel-photo .mar-labels,.mar-panel-photo .mar-settings{opacity:0;visibility:hidden;pointer-events:none;transition:opacity ${fade},visibility 0s ${fade};}
.mar-photo{position:absolute;left:50%;bottom:16px;transform:translate(-50%,12px);display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;
  width:max-content;max-width:calc(100vw - 24px);opacity:0;visibility:hidden;pointer-events:none;transition:opacity ${fade},transform .3s ${ease},visibility 0s ${fade};}
.mar-panel-photo .mar-photo{opacity:1;visibility:visible;pointer-events:auto;transform:translate(-50%,0);transition:opacity ${fade},transform .3s ${ease},visibility 0s;}
.mar-photo .mar-btn{opacity:1;transform:none;}
.mar-photo-panel{display:grid;gap:2px;width:280px;max-width:100%;padding:8px 14px;background:${UI.surface};border-radius:16px;box-shadow:${lip};}
.mar-slider{display:grid;grid-template-columns:40px 1fr 46px;align-items:center;gap:8px;height:34px;font:700 14px/1 'Nunito',sans-serif;}
.mar-slider input{width:100%;margin:0;accent-color:${UI.primary};cursor:pointer;height:28px;}
.mar-slider output{text-align:right;font:800 13px/1 'Nunito',sans-serif;font-variant-numeric:tabular-nums;}
.mar-shutter{position:relative;flex:none;width:72px;height:72px;border-radius:50%;border:0;padding:0;background:${UI.surface};box-shadow:${lip},${soft};cursor:pointer;transition:transform .12s ease;}
.mar-shutter i{position:absolute;inset:8px;border-radius:50%;background:${UI.primary};box-shadow:inset 0 -4px 0 #3B3A5A22;}
.mar-shutter:hover{transform:scale(1.05);}
.mar-shutter:active{transform:scale(.9);}
.mar-flash{position:fixed;inset:0;background:#FFFFFF;opacity:0;pointer-events:none;z-index:2;}
.mar-flash-on{animation:mar-flash .36s ease-out;}
@keyframes mar-flash{0%{opacity:0}${Math.round((HUD.flashMs / 360) * 30)}%{opacity:.9}${Math.round((HUD.flashMs / 360) * 100)}%{opacity:.6}100%{opacity:0}}
.mar-polaroid{position:absolute;right:24px;bottom:112px;width:156px;padding:8px 8px 30px;background:#FFFFFF;border-radius:4px;box-shadow:${soft};transform:rotate(-4deg);
  animation:mar-drop .55s ${ease} both,mar-fadeout .4s ease ${HUD.polaroidMs - 450}ms forwards;pointer-events:none;}
.mar-polaroid img{display:block;width:100%;border-radius:2px;}
@keyframes mar-drop{from{opacity:0;transform:translateY(-60px) rotate(-14deg) scale(.9)}to{opacity:1;transform:rotate(-4deg)}}
@keyframes mar-fadeout{to{opacity:0;transform:translateY(16px) rotate(-4deg)}}

/* hidden HUD (key H): everything fades; a ghost eye button wakes on pointer movement */
.mar-hud-hidden>*:not(.mar-ghost):not(.mar-flash):not(.mar-polaroid){opacity:0!important;visibility:hidden;pointer-events:none!important;transition:opacity ${fade},visibility 0s ${fade};}
.mar-ghost{position:absolute;right:16px;bottom:16px;width:40px;height:40px;border-radius:50%;border:0;padding:0;background:#FFF8ECCC;box-shadow:${lip};cursor:pointer;
  display:none;align-items:center;justify-content:center;opacity:0;transition:opacity .3s;pointer-events:auto;}
.mar-hud-hidden .mar-ghost{display:flex;}
.mar-hud-hidden .mar-ghost.mar-ghost-awake{opacity:.9;}

/* island labels (T0) */
.mar-labels{position:absolute;inset:0;transition:opacity ${fade};}
.mar-label{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;border:0;background:none;padding:0;white-space:nowrap;}
.mar-label-in{display:inline-flex;align-items:center;gap:8px;height:28px;padding:0 12px 0 10px;border-radius:999px;background:#FFF8ECDD;color:${UI.ink};
  font:600 16px/1 'Fredoka',sans-serif;box-shadow:0 2px 0 #3B3A5A22;animation:mar-label-pop .25s ${ease} both;}
@keyframes mar-label-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
.mar-dot{width:8px;height:8px;border-radius:50%;display:inline-block;}

/* capture (freeze=1): no motion at all */
.mar-hud-instant.mar-hud-on .mar-pop,.mar-hud-instant.mar-hud-on .mar-wm-in,.mar-hud-instant.mar-hud-wordmark .mar-wm-in,.mar-hud-instant .mar-label-in{animation:none!important;opacity:1;transform:none;}
.mar-hud-instant,.mar-hud-instant *{transition:none!important;}

/* narrow portrait phones */
@media (max-width:480px){
  .mar-wordmark{font-size:24px;}
  .mar-compass{width:52px;height:52px;}
  .mar-btn{width:44px;height:44px;}
  .mar-dial{--d:56px;}
  .mar-dock{gap:8px;max-width:calc(100vw - 24px);}
  .mar-sheet{bottom:${16 + 56 + 12}px;}
  .mar-photo{gap:10px;}
  .mar-photo-panel{order:-1;flex-basis:100%;width:100%;}
  .mar-polaroid{width:124px;bottom:200px;right:16px;}
  .mar-panel-settings .mar-labels{opacity:0;pointer-events:none;}
}
/* short landscape phones: tighten the vertical rhythm */
@media (max-height:480px){
  .mar-wordmark{font-size:24px;top:8px;}
  .mar-compass{width:52px;height:52px;top:10px;}
  .mar-dock{bottom:10px;}
  .mar-sheet{bottom:${10 + 64 + 10}px;padding:8px 14px 10px;}
  .mar-row{min-height:38px;}
  .mar-wide{height:38px;}
  .mar-photo{bottom:10px;}
  .mar-polaroid{bottom:96px;width:132px;}
}
@media (prefers-reduced-motion:reduce){
  .mar-hud *{transition-duration:0s!important;animation-duration:.01s!important;}
}
`;
