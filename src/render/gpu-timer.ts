/**
 * GPU frame timer for `?perf=1` (ARCHITECTURE §8): `EXT_disjoint_timer_query_webgl2`
 * TIME_ELAPSED queries around each rendered frame, read back a few frames later. Results
 * from a disjoint period (GPU reset, power state change) are dropped. Null when the
 * extension is missing (SwiftShader, most mobiles, Firefox without the pref).
 */
interface TimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

export interface GpuTimer {
  begin(): void;
  end(): void;
  /** Read back finished queries; returns the GPU ms collected so far. */
  poll(): readonly number[];
  dispose(): void;
}

export function createGpuTimer(gl: WebGL2RenderingContext): GpuTimer | null {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
  if (!ext) return null;
  const free: WebGLQuery[] = [];
  const pending: WebGLQuery[] = [];
  const results: number[] = [];
  let active: WebGLQuery | null = null;
  let disposed = false;

  const poll = (): readonly number[] => {
    while (pending.length) {
      const q = pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
      pending.shift();
      free.push(q);
      if (!disjoint) results.push(ns / 1e6);
    }
    return results;
  };

  return {
    begin() {
      if (disposed || active) return;
      const q = free.pop() ?? gl.createQuery();
      if (!q) return;
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      active = q;
    },
    end() {
      if (!active) return;
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(active);
      active = null;
      poll();
    },
    poll,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (active) gl.endQuery(ext.TIME_ELAPSED_EXT);
      for (const q of [...free, ...pending]) gl.deleteQuery(q);
      if (active) gl.deleteQuery(active);
      free.length = 0;
      pending.length = 0;
      active = null;
    },
  };
}
