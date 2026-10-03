import type { PathGraph } from '../world/types.ts';

/** Undirected footpath graph with cached adjacency; tiny (≈ 300 nodes), so plain arrays are fine. */
export class PathNet {
  readonly count: number;
  readonly adj: number[][];
  readonly comp: Int32Array;

  constructor(readonly g: PathGraph) {
    this.count = g.nodes.length / 2;
    this.adj = Array.from({ length: this.count }, () => []);
    for (let e = 0; e + 1 < g.edges.length; e += 2) {
      const a = g.edges[e];
      const b = g.edges[e + 1];
      if (a === b || a >= this.count || b >= this.count) continue;
      if (!this.adj[a].includes(b)) this.adj[a].push(b);
      if (!this.adj[b].includes(a)) this.adj[b].push(a);
    }
    this.comp = new Int32Array(this.count).fill(-1);
    let c = 0;
    for (let s = 0; s < this.count; s++) {
      if (this.comp[s] >= 0) continue;
      const stack = [s];
      this.comp[s] = c;
      while (stack.length) {
        const n = stack.pop() as number;
        for (const m of this.adj[n]) {
          if (this.comp[m] < 0) {
            this.comp[m] = c;
            stack.push(m);
          }
        }
      }
      c++;
    }
  }

  x(i: number): number {
    return this.g.nodes[i * 2];
  }
  z(i: number): number {
    return this.g.nodes[i * 2 + 1];
  }

  dist(a: number, b: number): number {
    return Math.hypot(this.x(a) - this.x(b), this.z(a) - this.z(b));
  }

  nearestNode(x: number, z: number): number {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < this.count; i++) {
      const d = (this.x(i) - x) ** 2 + (this.z(i) - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /** Dijkstra (node lists are tiny); returns node indices from `a` to `b` inclusive, or null. */
  route(a: number, b: number): number[] | null {
    if (a === b) return [a];
    if (this.comp[a] !== this.comp[b]) return null;
    const n = this.count;
    const d = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    d[a] = 0;
    for (;;) {
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        if (!done[i] && d[i] < best) {
          best = d[i];
          u = i;
        }
      }
      if (u < 0) return null;
      if (u === b) break;
      done[u] = 1;
      for (const v of this.adj[u]) {
        const nd = d[u] + this.dist(u, v);
        if (nd < d[v]) {
          d[v] = nd;
          prev[v] = u;
        }
      }
    }
    const out: number[] = [];
    for (let v = b; v >= 0; v = prev[v]) out.push(v);
    return out.reverse();
  }

  /** Distance from (x, z) to the nearest edge segment. */
  distToEdges(x: number, z: number): number {
    let best = Infinity;
    const e = this.g.edges;
    for (let k = 0; k + 1 < e.length; k += 2) {
      const ax = this.x(e[k]);
      const az = this.z(e[k]);
      const bx = this.x(e[k + 1]);
      const bz = this.z(e[k + 1]);
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
      best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    }
    return best;
  }
}
