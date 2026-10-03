import { LOADER_CSS } from './loader.ts';
import { HUD_CSS } from './hud.ts';
import { CURTAIN_CSS } from './curtain.ts';
import { DIAL_CSS } from './time-dial.ts';
import { PHOTO_CSS } from './photo.ts';
import { UI } from '../content/palette.ts';

export function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
html,body{margin:0;height:100%;overflow:hidden;background:${UI.loadingGradient[0]};}
#app{position:fixed;inset:0;}
canvas.mar-canvas{display:block;width:100%;height:100%;touch-action:none;outline:none;}
.mar-stats{position:fixed;left:8px;bottom:8px;font:11px/1.35 ui-monospace,Menlo,monospace;color:#FFF8EC;background:#3B3A5ACC;
  padding:6px 8px;border-radius:8px;white-space:pre;z-index:40;pointer-events:none;}
${LOADER_CSS}
${HUD_CSS}
${CURTAIN_CSS}
${DIAL_CSS}
${PHOTO_CSS}
`;
  document.head.appendChild(style);
}
