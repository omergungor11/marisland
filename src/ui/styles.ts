import { LOADER_CSS } from './loader.ts';
import { CURTAIN_CSS } from './curtain.ts';
import { UI } from '../content/palette.ts';
import { HUD } from '../content/ui.ts';
import { mixHex } from './hud-math.ts';
import { FLEET_BOTS, FLEET_GATE, FLEET_PANEL, FLEET_STATUS, FLEET_TERM } from '../content/fleet.ts';

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
${FLEET_PANEL_CSS}
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
/* theme labels (Phase 3): [accent disc + white glyph] Theme · muted island name (≥ 600 px) */
.mar-label-theme{gap:6px;padding:0 12px 0 5px;}
.mar-label-disc{width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;flex:none;box-shadow:inset 0 -1.5px 0 #3B3A5A1F;}
.mar-label-disc svg{display:block;}
.mar-label-sub{font:700 12px/1 'Nunito',sans-serif;color:${mixHex(UI.ink, UI.muted, 0.45)};padding-left:2px;}
.mar-label-sub::before{content:'·';margin-right:5px;}
@media (max-width:599px){.mar-label-sub{display:none;}}

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

/**
 * Fleet island panel (TASK-563, `fleet-panel.ts`): a cream card on the left under the wordmark,
 * clear of the bottom dock; `--acc` is the island accent (header rule, running dot).
 */
const F = FLEET_PANEL;
export const FLEET_PANEL_CSS = `
.mar-fleet{position:absolute;left:16px;top:${F.top}px;width:${F.width}px;max-width:calc(100vw - 32px);max-height:calc(100% - ${F.top + F.bottomClear}px);display:flex;flex-direction:column;
  background:${UI.surface};border-radius:18px;box-shadow:${lip},${soft};padding:10px 8px 8px;pointer-events:auto;isolation:isolate;opacity:0;visibility:hidden;transform:translateX(-12px);
  transition:opacity ${fade},transform .3s ${ease},visibility 0s ${fade};}
.mar-fleet.mar-fleet-on{opacity:1;visibility:visible;transform:none;transition:opacity ${fade},transform .3s ${ease},visibility 0s;}
.mar-fleet-head{display:flex;align-items:center;gap:8px;padding:0 6px 8px;margin-bottom:4px;border-bottom:2.5px solid var(--acc,${UI.secondary});}
.mar-fleet-disc{width:26px;height:26px;border-radius:50%;flex:none;display:inline-flex;align-items:center;justify-content:center;color:#fff;box-shadow:inset 0 -2px 0 #3B3A5A1F;}
.mar-fleet-disc svg{display:block;}
.mar-fleet-name{flex:1;min-width:0;font:${F.fonts.header};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mar-fleet-isle{font:700 12px/1 'Nunito',sans-serif;color:${mixHex(UI.ink, UI.muted, 0.45)};padding-left:6px;}
.mar-fleet-isle::before{content:'·';margin-right:5px;}
.mar-fleet-live{flex:none;font:800 12px/1 'Nunito',sans-serif;color:${UI.ink};background:#3B3A5A10;border-radius:999px;padding:5px 9px;}
.mar-fleet-rows{position:relative;list-style:none;margin:0;padding:0;overflow-y:auto;overscroll-behavior:contain;min-height:0;scrollbar-width:thin;scrollbar-color:${UI.muted} transparent;}
.mar-fleet-scroll .mar-fleet-rows{-webkit-mask-image:linear-gradient(#000 calc(100% - ${F.fadePx}px),transparent);mask-image:linear-gradient(#000 calc(100% - ${F.fadePx}px),transparent);padding-bottom:20px;}
.mar-frow{display:grid;grid-template-columns:14px 1fr auto;column-gap:6px;row-gap:1px;width:100%;text-align:left;border:0;background:none;border-radius:12px;padding:6px 8px;cursor:pointer;
  font:${F.fonts.row};color:${UI.ink};transition:background-color .15s;}
@media (hover:hover){.mar-hud .mar-frow:hover{background:#3B3A5A0A;}}
.mar-frow[aria-pressed="true"]{background:#3B3A5A12;box-shadow:inset 3px 0 0 var(--acc,${UI.secondary});}
.mar-fdot{grid-row:1;align-self:center;display:flex;width:${FLEET_STATUS.sizePx}px;height:${FLEET_STATUS.sizePx}px;color:var(--acc,${UI.secondary});}
.mar-fdot svg{display:block;overflow:visible;}
/* status reads from the glyph (FLEET_STATUS), not the colour; the running halo pulses only when interactive */
.mar-fdot[data-s="running"] .mar-fhalo{transform-origin:6px 6px;animation:mar-fpulse ${F.pulseSeconds}s ease-in-out infinite;}
@keyframes mar-fpulse{0%,100%{opacity:.3;transform:none}50%{opacity:.08;transform:scale(1.25)}}
.mar-fagent{font:800 11px/1.2 'Nunito',sans-serif;letter-spacing:.3px;text-transform:uppercase;color:${mixHex(UI.ink, UI.muted, 0.35)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mar-fdur{font:800 12px/1.2 'Nunito',sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap;}
.mar-ftitle{grid-column:2 / 4;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;}
.mar-fline{grid-column:2 / 4;font:700 12px/1.3 'Nunito',sans-serif;color:${mixHex(UI.ink, UI.muted, 0.5)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mar-fleet-more{flex:none;padding:6px 10px 2px;font:800 12px/1 'Nunito',sans-serif;color:${mixHex(UI.ink, UI.muted, 0.45)};}
.mar-fleet-more[hidden],.mar-fleet-live[hidden],.mar-fline[hidden]{display:none;}
/* M41: fleet view (no island focused) and an open terminal widen the card; the terminal takes its full height */
.mar-fleet-wide{width:${F.fleetWidth}px;}
.mar-fleet-termon{height:calc(100% - ${F.top + F.bottomClear}px);}
/* TASK-572: the terminal is opaque and on top; the list layer behind it does not paint (sticky block heads used to bleed through) */
.mar-fleet-termon>:not(.mar-fterm){visibility:hidden;}
/* close-up tiers: a narrow strip, the live rows' titles only */
.mar-fleet-compact{width:${F.compact.width}px;}
.mar-fleet-compact .mar-fleet-head{gap:6px;padding:0 4px 6px;}
.mar-fleet-compact .mar-fleet-disc{width:22px;height:22px;}
.mar-fleet-compact .mar-fleet-name{font-size:15px;}
.mar-fleet-compact .mar-fleet-head .mar-fleet-isle{display:none;}
.mar-fleet-compact .mar-frow{padding:4px 6px;row-gap:0;}
.mar-fleet-compact .mar-fagent,.mar-fleet-compact .mar-fdur,.mar-fleet-compact .mar-fline{display:none;}
.mar-fleet-compact .mar-ftitle{grid-row:1;grid-column:2 / 4;font-size:12.5px;line-height:1.25;}
.mar-fleet-all .mar-fleet-head .mar-fleet-disc{display:none;}
.mar-fleet-search{flex:none;margin:2px 4px 6px;height:34px;border:0;border-radius:999px;background:#3B3A5A0D;padding:0 14px;font:700 13px/1 'Nunito',sans-serif;color:${UI.ink};outline:none;-webkit-appearance:none;appearance:none;}
.mar-fleet-search:focus-visible{box-shadow:inset 0 0 0 2px ${UI.secondary};outline:none;}
.mar-fleet-search::placeholder{color:${mixHex(UI.ink, UI.muted, 0.5)};}
.mar-fleet-search[hidden]{display:none;}
.mar-fblock{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:7px;padding:8px 8px 4px;background:${UI.surface};font:600 15px/1.1 'Fredoka',sans-serif;}
.mar-fblock:not(:first-child){margin-top:4px;border-top:1.5px solid #3B3A5A12;}
.mar-fblock .mar-fleet-disc{width:20px;height:20px;}
.mar-fblock-name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mar-fblock .mar-fleet-live{padding:4px 8px;font-size:11px;}
/* terminal view (M41, fleet-term.ts): slides in over the list */
.mar-fterm{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;background:${UI.surface};border-radius:18px;padding:10px 8px 8px;
  opacity:0;visibility:hidden;transform:translateX(18px);transition:opacity .18s ease,transform .3s ${ease},visibility 0s .3s;}
.mar-fterm.mar-fterm-on{opacity:1;visibility:visible;transform:none;transition:opacity .18s ease,transform .3s ${ease},visibility 0s;}
.mar-fterm [hidden]{display:none!important;}
.mar-fterm-head{flex:none;display:flex;align-items:flex-start;gap:7px;padding:0 4px 8px 0;border-bottom:2.5px solid var(--acc,${UI.secondary});}
.mar-fterm-back{flex:none;width:30px;height:30px;border:0;border-radius:50%;padding:0;background:#3B3A5A10;display:flex;align-items:center;justify-content:center;cursor:pointer;}
@media (hover:hover){.mar-hud .mar-fterm-back:hover{background:#3B3A5A1C;}}
.mar-fterm-head .mar-fdot{flex:none;margin-top:8px;}
.mar-fterm-id{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;padding-top:2px;}
.mar-fterm-title{font:600 15px/1.25 'Fredoka',sans-serif;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;}
.mar-fterm-meta{font:800 11px/1.2 'Nunito',sans-serif;font-variant-numeric:tabular-nums;color:${mixHex(UI.ink, UI.muted, 0.4)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mar-fterm-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:8px 2px 4px;scrollbar-width:thin;scrollbar-color:${UI.muted} transparent;}
.mar-fterm-lines{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;}
.mar-fl{position:relative;padding:1px 4px 1px 18px;font:${FLEET_TERM.fonts.line};color:${UI.ink};overflow-wrap:anywhere;}
.mar-fl-mark{position:absolute;left:4px;top:1px;width:11px;text-align:center;color:${mixHex(UI.ink, UI.muted, 0.45)};font-weight:800;}
.mar-fl[data-k="assistant"]{white-space:pre-line;}
.mar-fl[data-k="tool_use"]{font:${FLEET_TERM.fonts.mono};}
.mar-fl[data-k="tool_use"] b{font-weight:800;color:${UI.ink};}
.mar-fl[data-k="tool_use"] .mar-fl-mark{color:var(--acc,${UI.secondary});}
.mar-fl[data-k="tool_result"],.mar-fl[data-k="system"]{font:${FLEET_TERM.fonts.mono};color:${mixHex(UI.ink, UI.muted, 0.55)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mar-fl[data-k="system"]{font-size:10.5px;}
.mar-fl[data-k="user"]{white-space:pre-wrap;margin:4px 0 2px;padding:5px 8px 5px 20px;border-radius:10px;background:${FLEET_TERM.colors.userBg};font-weight:800;}
.mar-fl[data-k="user"] .mar-fl-mark,.mar-fl[data-k="result"] .mar-fl-mark{left:6px;top:5px;}
.mar-fl[data-k="result"]{margin-top:4px;padding:5px 8px 5px 20px;border-radius:8px;background:${FLEET_TERM.colors.resultBg};font:800 12px/1.35 'Nunito',sans-serif;font-variant-numeric:tabular-nums;}
.mar-fl[data-fail]{background:${FLEET_TERM.colors.failBg};}
.mar-fl[data-k="stderr"]{font:${FLEET_TERM.fonts.mono};color:${FLEET_TERM.colors.stderr};}
.mar-fl[data-k="stderr"] .mar-fl-mark{color:${FLEET_TERM.colors.stderr};}
.mar-fterm-note{padding:6px 4px;font:700 12px/1.35 'Nunito',sans-serif;color:${mixHex(UI.ink, UI.muted, 0.45)};}
.mar-fterm-note:empty{display:none;}
.mar-fterm .mar-fterm-pill{position:absolute;left:50%;bottom:62px;transform:translateX(-50%);border:0;border-radius:999px;background:${UI.ink};color:${UI.surface};font:800 12px/1 'Nunito',sans-serif;padding:7px 12px;box-shadow:${lip};cursor:pointer;white-space:nowrap;}
.mar-fterm-foot{flex:none;display:flex;align-items:flex-end;gap:6px;padding-top:8px;border-top:1.5px solid #3B3A5A14;}
.mar-fterm-prompt{flex:1;min-width:0;height:${FLEET_TERM.promptPx[0]}px;resize:none;border:0;border-radius:12px;background:#3B3A5A0D;padding:10px 12px 8px;font:700 13px/1.4 'Nunito',sans-serif;color:${UI.ink};outline:none;}
.mar-fterm-prompt::placeholder{color:${mixHex(UI.ink, UI.muted, 0.5)};}
.mar-fterm-prompt:focus-visible{box-shadow:inset 0 0 0 2px var(--acc,${UI.secondary});outline:none;}
.mar-fterm-prompt:disabled{cursor:not-allowed;background:#3B3A5A08;}
.mar-fterm .mar-fterm-go,.mar-fterm .mar-fterm-stop{flex:none;height:${FLEET_TERM.promptPx[0]}px;border:0;border-radius:999px;padding:0 14px;font:800 13px/1 'Nunito',sans-serif;cursor:pointer;box-shadow:0 3px 0 #3B3A5A22;}
.mar-fterm .mar-fterm-go{background:var(--acc,${UI.secondary});color:var(--on-acc,#fff);}
.mar-fterm .mar-fterm-stop{background:#3B3A5A12;color:${UI.ink};}
.mar-hud-instant .mar-fhalo{animation:none!important;}
@media (max-width:${F.minViewport - 1}px){.mar-fleet{display:none;}}
@media (max-height:480px){.mar-fleet{top:60px;max-height:calc(100% - ${60 + 84}px);}}
@media (prefers-reduced-motion:reduce){.mar-fdot .mar-fhalo{animation:none;}}
/* M42 hand-off gates (fleet-panel.ts): cards over the list; HUD-scoped (.mar-hud button rule, D-146) */
.mar-fleet-gatecount{flex:none;font:800 12px/1 'Nunito',sans-serif;color:#3B3A5A;background:${FLEET_GATE.colors.bar};border-radius:999px;padding:5px 9px;}
.mar-fleet-gatecount[hidden]{display:none;}
.mar-fgates{flex:0 0.05 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;display:flex;flex-direction:column;gap:6px;margin:0 0 6px;}
.mar-fgates>*{flex:none;}
.mar-fgates:empty{display:none;}
.mar-fgroup{display:flex;flex-direction:column;gap:6px;}
.mar-fgroup-on{background:${FLEET_GATE.colors.cardBg};border-radius:14px;box-shadow:inset 4px 0 0 ${FLEET_GATE.colors.bar};padding:8px 8px 8px 12px;}
.mar-fgroup-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font:600 15px/1.15 'Fredoka',sans-serif;color:${UI.ink};}
.mar-fgroup-head span:last-child{flex:1 0 100%;font:700 12px/1.25 'Nunito',sans-serif;color:${mixHex(UI.ink, UI.muted, 0.45)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mar-fgate{display:flex;flex-direction:column;gap:5px;background:${FLEET_GATE.colors.cardBg};border-radius:14px;box-shadow:inset 4px 0 0 ${FLEET_GATE.colors.bar};padding:9px 10px 10px 14px;}
.mar-fgroup-on .mar-fgate{background:${UI.surface};box-shadow:0 1px 0 #3B3A5A14;padding:8px 9px 9px 10px;}
.mar-fgate-route{display:flex;align-items:center;gap:6px;font:600 16px/1.1 'Fredoka',sans-serif;color:${UI.ink};}
.mar-fgate-disc{width:22px;height:22px;border-radius:50%;flex:none;display:inline-flex;align-items:center;justify-content:center;color:#fff;box-shadow:inset 0 -2px 0 #3B3A5A1F;}
.mar-fgate-disc svg{display:block;width:13px;height:13px;}
.mar-fgate-arrow{font-style:normal;font-weight:700;color:${FLEET_GATE.colors.bar};padding:0 1px;}
.mar-fgate-label{font:800 10.5px/1 'Nunito',sans-serif;letter-spacing:.4px;text-transform:uppercase;color:#A87412;}
.mar-fgate-prompt{margin:0;font:700 12.5px/1.35 'Nunito',sans-serif;color:${UI.ink};display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${FLEET_GATE.promptLines};overflow:hidden;overflow-wrap:anywhere;}
.mar-fgate-acts{display:flex;gap:6px;margin-top:2px;}
.mar-fgates .mar-fgate-allow,.mar-fgates .mar-fgate-deny{flex:1;height:32px;border:0;border-radius:999px;font:800 13px/1 'Nunito',sans-serif;cursor:pointer;}
.mar-fgates .mar-fgate-allow{background:${FLEET_GATE.colors.allowBg};color:${FLEET_GATE.colors.allowInk};box-shadow:0 3px 0 #2A6B3C;}
.mar-fgates .mar-fgate-deny{flex:0 0 auto;padding:0 16px;background:${FLEET_GATE.colors.denyBg};color:${UI.ink};}
.mar-fgates button:disabled{opacity:.5;cursor:default;}
.mar-fgroup-on .mar-fgate-route{gap:5px;font-size:15px;}
.mar-fgroup-on .mar-fgate-acts{margin:0 0 0 auto;gap:5px;}
.mar-fgates .mar-fgroup-on .mar-fgate-allow,.mar-fgates .mar-fgroup-on .mar-fgate-deny{flex:none;height:28px;padding:0 12px;font-size:12.5px;}
.mar-fgates .mar-fgroup-on .mar-fgate-allow{box-shadow:0 2px 0 #2A6B3C;}
@media (hover:hover){.mar-fgates .mar-fgate-allow:hover:not(:disabled){filter:brightness(1.08);}.mar-fgates .mar-fgate-deny:hover:not(:disabled){background:#3B3A5A22;}}
.mar-fgate-done{font:700 12px/1.3 'Nunito',sans-serif;color:${mixHex(UI.ink, UI.muted, 0.5)};padding:2px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mar-fleet-compact .mar-fgate-label,.mar-fleet-compact .mar-fgroup-head span:last-child{display:none;}
.mar-fleet-compact .mar-fgate-prompt{-webkit-line-clamp:2;font-size:12px;}
.mar-fgate-route b{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mar-fleet-compact .mar-fgate-route{flex-wrap:wrap;font-size:14px;}
.mar-fleet-compact .mar-fgate-route>b:not(:last-of-type){display:none;}
/* M42 fleet view: request group label, hand-off children indented with a connector */
.mar-freq{padding:6px 8px 1px 28px;font:800 11px/1.2 'Nunito',sans-serif;letter-spacing:.2px;color:${mixHex(UI.ink, UI.muted, 0.45)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mar-fleet-rows li[data-depth]{position:relative;padding-left:calc(var(--depth) * ${FLEET_GATE.indentPx}px);}
.mar-fleet-rows li[data-depth]::before{content:'';position:absolute;left:calc(var(--depth) * ${FLEET_GATE.indentPx}px - 6px);top:0;height:18px;width:7px;border-left:2px solid #3B3A5A2A;border-bottom:2px solid #3B3A5A2A;border-bottom-left-radius:6px;}
/* M42 terminal: request line + chain strip (fleet-term.ts) */
.mar-fterm-head{flex-wrap:wrap;}
.mar-fterm-req{display:flex;min-width:0;font:800 11.5px/1.25 'Nunito',sans-serif;color:${UI.ink};white-space:nowrap;}
.mar-fterm-req span{min-width:0;overflow:hidden;text-overflow:ellipsis;}
.mar-fterm-req b{flex:none;font-weight:800;color:${mixHex(UI.ink, UI.muted, 0.4)};}
.mar-fchain{flex:1 0 100%;padding:8px 0 2px 37px;overflow-x:auto;scrollbar-width:none;}
.mar-fchain-tree{display:flex;gap:${FLEET_GATE.strip.gapPx}px;}
.mar-fchain-node{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:${FLEET_GATE.strip.currentPx + 26}px;}
.mar-fchain-kids{position:relative;display:flex;gap:${FLEET_GATE.strip.gapPx}px;margin-top:14px;}
.mar-fchain-kids::before{content:'';position:absolute;left:50%;top:-14px;height:6px;border-left:2px solid #3B3A5A33;}
.mar-fchain-kids>.mar-fchain-node::before{content:'';position:absolute;top:-8px;left:50%;height:8px;border-left:2px solid #3B3A5A33;}
.mar-fchain-kids>.mar-fchain-node::after{content:'';position:absolute;top:-8px;left:-${FLEET_GATE.strip.gapPx / 2}px;right:-${FLEET_GATE.strip.gapPx / 2}px;border-top:2px solid #3B3A5A33;}
.mar-fchain-kids>.mar-fchain-node:first-child::after{left:50%;}
.mar-fchain-kids>.mar-fchain-node:last-child::after{right:50%;}
.mar-fchain-kids>.mar-fchain-node:only-child::after{display:none;}
.mar-fchain .mar-fchain-disc{position:relative;width:${FLEET_GATE.strip.discPx}px;height:${FLEET_GATE.strip.discPx}px;border-radius:50%;border:0;padding:0;display:inline-flex;align-items:center;justify-content:center;color:#fff;cursor:pointer;opacity:.62;box-shadow:inset 0 -2px 0 #3B3A5A1F;}
.mar-fchain .mar-fchain-disc svg{display:block;width:${FLEET_GATE.strip.iconPx}px;height:${FLEET_GATE.strip.iconPx}px;}
.mar-fchain .mar-fchain-on{width:${FLEET_GATE.strip.currentPx}px;height:${FLEET_GATE.strip.currentPx}px;opacity:1;cursor:default;box-shadow:0 0 0 3px ${UI.surface},0 0 0 5px var(--acc,${UI.secondary});}
.mar-fchain .mar-fchain-gate{background:${UI.surface};border:2px dashed var(--acc);cursor:default;opacity:1;box-shadow:none;}
@media (hover:hover){.mar-fchain button.mar-fchain-disc:not(.mar-fchain-on):hover{opacity:.9;}}
.mar-fchain-badge{position:absolute;right:-4px;bottom:-4px;width:${FLEET_GATE.strip.badgePx + 2}px;height:${FLEET_GATE.strip.badgePx + 2}px;border-radius:50%;background:${UI.surface};display:flex;align-items:center;justify-content:center;}
.mar-fchain .mar-fchain-badge svg{width:${FLEET_GATE.strip.badgePx - 2}px;height:${FLEET_GATE.strip.badgePx - 2}px;}
.mar-fchain-name{font:800 10px/1.1 'Nunito',sans-serif;color:${mixHex(UI.ink, UI.muted, 0.4)};white-space:nowrap;}
/* hover tip of a bound bot (TASK-564) */
.mar-ftip{position:absolute;left:0;top:0;max-width:${FLEET_BOTS.tip.maxWidth}px;display:flex;flex-direction:column;gap:1px;background:${UI.surface};border-radius:12px;
  box-shadow:inset 3px 0 0 var(--acc,${UI.secondary}),${lip},${soft};padding:6px 10px 7px 12px;font:${F.fonts.row};color:${UI.ink};pointer-events:none;opacity:0;visibility:hidden;transition:opacity .12s;}
.mar-ftip.mar-ftip-on{opacity:1;visibility:visible;}
`;
