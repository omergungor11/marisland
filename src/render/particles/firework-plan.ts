import { createRng } from '../../core/rng.ts';
import { DOCK } from '../../content/settlements.ts';
import { FIREWORKS } from '../../content/signature.ts';
import { heightAt, type ThemeId, type WorldData } from '../../world/types.ts';

/**
 * The 22:01 show (M23 TASK-490, W:G7), pure: where each shell hangs over the HQ harbour and when it
 * goes off (seconds into the show). A function of the world seed and the HQ pier only — the driver
 * (fireworks.ts) turns it into particles, so a capture and a live run agree.
 */
export interface Shell {
  /** Show second the shell bursts. */
  t: number;
  /** Burst centre (world): the rocket rises from the sea straight below it. */
  x: number;
  y: number;
  z: number;
  /** Culture whose accent colours the shell. */
  theme: ThemeId;
}

export interface FireworkPlan {
  /** The pier head the show is staged from (world xz). */
  pier: { x: number; z: number };
  shells: Shell[];
}

/** The plan, or null when the HQ has no pier (no harbour, no show). */
export function fireworkPlan(
  world: Pick<WorldData, 'seed' | 'islands' | 'docks' | 'height'>,
): FireworkPlan | null {
  const hq = world.islands.find((i) => i.theme === 'hq');
  const dock = hq ? world.docks.find((d) => d.islandId === hq.id) : undefined;
  if (!dock) return null;
  const dx = Math.cos(dock.rotY);
  const dz = Math.sin(dock.rotY);
  const len = dock.segments * DOCK.segment;
  const pier = { x: dock.x + dx * len, z: dock.z + dz * len };
  const rng = createRng(world.seed).fork('fireworks');
  const n = FIREWORKS.themes.length;
  // lateral slots across the bay, taken in a seeded order so the colours don't run left to right
  const slots = Array.from({ length: n }, (_, k) => k);
  for (let i = n - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const [a0, a1] = FIREWORKS.along;
  const shells: Shell[] = FIREWORKS.themes.map((theme, k) => {
    const along = a0 + ((a1 - a0) * (slots[k] + 0.5 + rng.range(-0.25, 0.25))) / n;
    let out = rng.range(FIREWORKS.out[0], FIREWORKS.out[1]);
    const at = (): { x: number; z: number } => ({
      x: pier.x + dx * out - dz * along,
      z: pier.z + dz * out + dx * along,
    });
    // the rocket rises from the sea: shells hang over water, so a spot on land moves further out
    let p = at();
    for (
      let tries = 0;
      tries < 12 && heightAt(world.height, p.x, p.z) > FIREWORKS.seaMax;
      tries++
    ) {
      out += FIREWORKS.outStep;
      p = at();
    }
    return {
      t: FIREWORKS.times[k],
      x: p.x,
      y: rng.range(FIREWORKS.height[0], FIREWORKS.height[1]),
      z: p.z,
      theme,
    };
  });
  return { pier, shells };
}
