/** Post-run bounds check (FLEET.md "Kontrol (HQ)" 2). Pure: `git status --porcelain` text in, verdict out. */

/** Paths from `git status --porcelain` (v1). Renames yield both sides; quoted paths are unquoted. */
export function porcelainPaths(out: string): string[] {
  const unq = (s: string): string =>
    s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1).replace(/\\(.)/g, '$1') : s;
  const paths: string[] = [];
  for (const line of out.split('\n')) {
    if (line.length < 4) continue;
    const rest = line.slice(3);
    for (const part of rest.split(' -> ')) paths.push(unq(part));
  }
  return paths;
}

/**
 * First path that changed since `before` (the status when the session started) and is not under
 * one of the `allowed` prefixes (trailing slash). `fleet/runs/` is always allowed. A path counts
 * as changed when its porcelain line is new; edits to an already-dirty file are not detected.
 */
export function firstOutOfBounds(
  before: string,
  after: string,
  allowed: readonly string[],
): string | undefined {
  const old = new Set(before.split('\n'));
  const fresh = after.split('\n').filter((l) => l && !old.has(l));
  const ok = [...allowed, 'fleet/runs/'];
  for (const p of porcelainPaths(fresh.join('\n')))
    if (!ok.some((a) => p.startsWith(a) || `${p}/` === a)) return p;
  return undefined;
}
