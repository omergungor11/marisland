/**
 * Raw-bit fingerprint of a value tree (TASK-552, D-132): every number's full 64 bits, typed
 * arrays included, object keys in sorted order. Stage hashes quantise floats to 1e-4, so a 1-ulp
 * platform difference only shows there when it flips a decision; this shows it always.
 */
const F = new Float64Array(1);
const U = new Uint32Array(F.buffer);

export function bitDigest(root: unknown): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  const num = (v: number): void => {
    F[0] = v;
    a = Math.imul(a ^ U[0], 0x01000193) >>> 0;
    a = Math.imul(a ^ U[1], 0x01000193) >>> 0;
    b = Math.imul(b ^ U[1], 0x85ebca6b) >>> 0;
    b = Math.imul(b ^ U[0], 0xc2b2ae35) >>> 0;
  };
  const str = (s: string): void => {
    num(s.length);
    for (let i = 0; i < s.length; i++) num(s.charCodeAt(i));
  };
  const walk = (o: unknown): void => {
    if (typeof o === 'number') return num(o);
    if (typeof o === 'string') return str(o);
    if (typeof o === 'boolean') return num(o ? 1 : 0);
    if (o === null || o === undefined) return num(-1);
    if (ArrayBuffer.isView(o)) {
      const arr = o as unknown as ArrayLike<number>;
      num(arr.length);
      for (let i = 0; i < arr.length; i++) num(arr[i]);
      return;
    }
    if (Array.isArray(o)) {
      num(o.length);
      for (const v of o) walk(v);
      return;
    }
    if (o instanceof Map) return walk([...o.entries()]);
    if (typeof o === 'object')
      for (const k of Object.keys(o).sort()) {
        str(k);
        walk((o as Record<string, unknown>)[k]);
      }
  };
  walk(root);
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
