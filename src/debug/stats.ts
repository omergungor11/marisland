import type { WebGLRenderer } from 'three';
import type { Counters, RenderInfo } from '../capture/api.ts';

/** Stats overlay (TASK-006): fps, CPU ms, renderer.info, tier, counters. */
export interface StatsOverlay {
  update(
    fps: number,
    cpuMs: number,
    info: RenderInfo,
    tier: number,
    counters: Counters,
    extra: string,
  ): void;
  dispose(): void;
}

export function readInfo(renderer: WebGLRenderer, out: RenderInfo): RenderInfo {
  const r = renderer.info.render;
  out.calls = r.calls;
  out.triangles = r.triangles;
  out.points = r.points;
  out.lines = r.lines;
  out.programs = renderer.info.programs?.length ?? 0;
  out.geometries = renderer.info.memory.geometries;
  out.textures = renderer.info.memory.textures;
  return out;
}

export function createStatsOverlay(root: HTMLElement): StatsOverlay {
  const el = document.createElement('div');
  el.className = 'mar-stats';
  root.appendChild(el);
  let frames = 0;
  let acc = 0;
  let shownFps = 0;
  return {
    update(fps, cpuMs, info, tier, c, extra) {
      frames++;
      acc += 1 / Math.max(fps, 1e-3);
      if (acc >= 0.5) {
        shownFps = frames / acc;
        frames = 0;
        acc = 0;
      }
      el.textContent =
        `fps ${shownFps.toFixed(0)}  cpu ${cpuMs.toFixed(1)} ms  T${tier}\n` +
        `calls ${info.calls}  tris ${(info.triangles / 1000).toFixed(0)}k  prog ${info.programs}\n` +
        `geo ${info.geometries}  tex ${info.textures}  inst ${c.instances}  gc ${c.groundCover}\n` +
        `agents ${c.agents}  parts ${c.particles}  pops ${c.hardPops}${extra ? '\n' + extra : ''}`;
    },
    dispose() {
      el.remove();
    },
  };
}
