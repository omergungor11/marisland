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
${EDIT_PANEL_CSS}
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
  .mar-dock{gap:6px;max-width:calc(100vw - 24px);}
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

/**
 * Sandbox edit panel (TASK-221, `edit-panel.ts`): replaces the dock in edit mode. Desktop: a card
 * at the bottom centre; portrait phones: a full-width bottom sheet; short landscape phones: a side
 * sheet on the right under the compass (labels avoid whichever box it is).
 */
export const EDIT_PANEL_CSS = `
.mar-edit{position:absolute;left:50%;bottom:16px;width:452px;max-width:calc(100vw - 32px);transform:translate(-50%,12px);display:flex;flex-direction:column;gap:8px;
  padding:16px 12px 10px;background:${UI.surface};border-radius:20px;box-shadow:${lip},${soft};opacity:0;visibility:hidden;pointer-events:none;touch-action:manipulation;
  transition:opacity ${fade},transform .3s ${ease},visibility 0s ${fade};}
.mar-panel-edit .mar-edit{opacity:1;visibility:visible;pointer-events:auto;transform:translate(-50%,0);transition:opacity ${fade},transform .3s ${ease},visibility 0s;}
.mar-panel-edit .mar-dock,.mar-panel-edit .mar-settings{opacity:0;visibility:hidden;pointer-events:none;transition:opacity ${fade},visibility 0s ${fade};}
.mar-edit-tools{display:grid;grid-template-columns:repeat(8,1fr);gap:4px;}
.mar-tool{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;height:54px;min-width:0;border:0;border-radius:14px;padding:4px 0 3px;
  background:#3B3A5A0D;color:${UI.ink};cursor:pointer;transition:transform .12s ease,background-color .15s;}
.mar-tool span{font:800 11px/1 'Nunito',sans-serif;letter-spacing:.1px;white-space:nowrap;}
.mar-tool[aria-pressed="true"]{background:${UI.secondary};box-shadow:0 3px 0 #3B3A5A22;}
@media (hover:hover){.mar-hud .mar-tool:hover{transform:translateY(-2px);}}
.mar-tool:active{transform:scale(.92);}
.mar-edit-ctx{display:flex;flex-direction:column;gap:4px;min-height:0;}
.mar-edit-hint{font:700 13px/18px 'Nunito',sans-serif;color:#3B3A5AB3;padding:0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mar-edit-sliders{display:grid;gap:0;padding:0 4px;}
.mar-edit .mar-slider{grid-template-columns:68px 1fr 44px;height:34px;}
.mar-edit .mar-slider input{height:32px;}
.mar-edit-zones,.mar-edit-props{display:none;}
.mar-edit[data-tool="flatten"] .mar-edit-strength,.mar-edit[data-tool="paint"] .mar-edit-strength{display:none;}
.mar-edit[data-tool="prop"] .mar-edit-sliders,.mar-edit[data-tool="erase"] .mar-edit-sliders,.mar-edit[data-tool="move"] .mar-edit-sliders,.mar-edit[data-tool="none"] .mar-edit-sliders{display:none;}
.mar-edit[data-tool="paint"] .mar-edit-zones{display:flex;}
.mar-edit-zones{gap:6px;justify-content:space-between;padding:2px 2px 0;}
.mar-zone{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;border:0;background:none;padding:2px 0;cursor:pointer;min-width:0;}
.mar-zone i{width:30px;height:30px;border-radius:50%;box-shadow:inset 0 -3px 0 #3B3A5A22,0 0 0 2px #3B3A5A1A;transition:transform .15s ${ease};}
.mar-zone span{font:800 11px/1 'Nunito',sans-serif;}
.mar-zone[aria-checked="true"] i{box-shadow:inset 0 -3px 0 #3B3A5A22,0 0 0 3px ${UI.surface},0 0 0 5.5px ${UI.secondary};transform:scale(1.08);}
.mar-edit[data-tool="prop"] .mar-edit-props{display:grid;}
.mar-edit-props{grid-template-columns:repeat(auto-fill,minmax(50px,1fr));gap:5px;max-height:146px;overflow-y:auto;overscroll-behavior:contain;padding:3px 3px 4px;
  scrollbar-width:thin;scrollbar-color:${UI.muted} transparent;}
.mar-prop{position:relative;height:52px;min-width:0;border:0;border-radius:12px;padding:0;background:#3B3A5A0D;cursor:pointer;display:flex;align-items:center;justify-content:center;overflow:hidden;
  transition:transform .12s ease,background-color .15s;}
.mar-prop img{width:50px;height:50px;display:block;pointer-events:none;}
.mar-prop span{font:800 9px/1.1 'Nunito',sans-serif;padding:2px;text-align:center;}
.mar-prop[aria-selected="true"]{background:#4FC3C933;box-shadow:inset 0 0 0 3px ${UI.secondary};}
@media (hover:hover){.mar-hud .mar-prop:hover{transform:translateY(-2px);}}
.mar-edit-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:38px;}
/* title tab on the panel's top edge: "Sandbox", then "edited · N changes" */
.mar-edit-badge{position:absolute;left:16px;top:0;transform:translateY(-60%);height:26px;display:flex;align-items:center;padding:0 12px;border-radius:999px;white-space:nowrap;
  background:${UI.surface};box-shadow:${lip};font:700 15px/1 'Fredoka',sans-serif;color:${UI.ink};pointer-events:none;}
.mar-edit-badge.mar-edited{background:${UI.secondary};font:800 13px/1 'Nunito',sans-serif;}
.mar-edit-acts{display:flex;align-items:center;gap:6px;flex:none;}
.mar-ebtn{position:relative;height:38px;min-width:38px;border-radius:999px;border:0;padding:0 9px;background:#3B3A5A10;color:${UI.ink};cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;
  transition:transform .12s ease,background-color .15s;}
.mar-ebtn:disabled{opacity:.38;cursor:default;}
@media (hover:hover){.mar-hud .mar-ebtn:not(:disabled):hover{transform:translateY(-2px);}.mar-ebtn:not(:disabled):hover .mar-tip{opacity:1;transition-delay:.4s;}}
.mar-ereset{display:none;font:800 12px/1 'Nunito',sans-serif;white-space:nowrap;}
.mar-ebtn.mar-armed{background:${UI.primary};color:#FFFFFF;}
.mar-ebtn.mar-armed .mar-ereset{display:inline;}
.mar-ebtn.mar-armed .mar-tip{display:none;}
.mar-edone{height:38px;border:0;border-radius:999px;padding:0 16px;background:${UI.primary};color:#FFFFFF;font:700 16px/1 'Fredoka',sans-serif;box-shadow:0 3px 0 #3B3A5A26;cursor:pointer;
  transition:transform .12s ease;}
@media (hover:hover){.mar-hud .mar-edone:hover{transform:translateY(-2px);}}
.mar-toast{position:absolute;left:50%;bottom:calc(100% + 10px);transform:translate(-50%,6px);background:${UI.ink};color:${UI.surface};font:700 14px/1 'Nunito',sans-serif;
  padding:10px 14px;border-radius:999px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .18s,transform .25s ${ease};}
.mar-toast.mar-toast-on{opacity:1;transform:translate(-50%,0);}

/* portrait phones: full-width bottom sheet */
@media (max-width:480px){
  .mar-edit{left:8px;right:8px;bottom:8px;width:auto;max-width:none;transform:translateY(12px);padding:16px 10px 10px;border-radius:20px;}
  .mar-panel-edit .mar-edit{transform:none;}
  .mar-tool{height:52px;}
  .mar-tool svg{width:22px;height:22px;}
  .mar-tool span{font-size:10px;}
  .mar-edit-props{max-height:132px;}
  .mar-ebtn{min-width:40px;height:40px;}
  .mar-edone{height:40px;padding:0 14px;}
}
/* short landscape phones: side sheet on the right, below the compass */
@media (max-height:480px) and (min-width:481px){
  .mar-edit{left:auto;right:10px;top:78px;bottom:10px;width:304px;max-width:calc(100vw - 20px);transform:translateX(12px);padding:14px 10px 8px;gap:6px;}
  .mar-panel-edit .mar-edit{transform:none;}
  .mar-edit-tools{grid-template-columns:repeat(4,1fr);}
  .mar-tool{height:44px;flex-direction:row;gap:5px;padding:0 4px;}
  .mar-tool svg{width:20px;height:20px;flex:none;}
  .mar-tool span{font-size:10px;}
  .mar-edit-ctx{flex:1 1 auto;overflow-y:auto;}
  .mar-edit-props{max-height:none;flex:1 1 auto;}
  .mar-edit .mar-slider{height:32px;}
}
`;
