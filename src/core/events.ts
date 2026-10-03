/** Typed, low-frequency event emitter. Per-frame data goes through Ctx, not here. */
export type Listener<T> = (payload: T) => void;

export class Emitter<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as Listener<never>);
    return () => this.off(event, fn);
  }

  off<K extends keyof Events>(event: K, fn: Listener<Events[K]>): void {
    this.listeners.get(event)?.delete(fn as Listener<never>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of Array.from(set)) (fn as Listener<Events[K]>)(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}

export interface AppEvents extends Record<string, unknown> {
  seedChanged: { seed: number };
  tierChanged: { tier: number; prev: number };
  picked: { kind: string; id: number };
  qualityChanged: { quality: 'low' | 'medium' | 'high' };
  resized: { width: number; height: number; dpr: number };
  /** HUD weather button (TASK-182). Weather/env systems subscribe and render the state. */
  weatherChanged: { weather: 'clear' | 'cloudy' | 'rain' | 'fog' };
  /**
   * Reduced motion toggled (HUD settings, persisted) or resolved at boot. Ambient systems scale
   * amplitudes by `motionScale` (0.3 when reduced, 1 otherwise).
   */
  reducedMotionChanged: { reduced: boolean; motionScale: number };
  /** Photo mode entered/left or frozen (the governor must not change quality while `frozen`). */
  photoMode: { active: boolean; frozen: boolean };
  /** The quality governor stepped (TASK-191): new pixel ratio and detail-tier cap. */
  governorChanged: { level: number; dpr: number; tierCap: number; p90: number };
  /** The WebGL context was lost (`lost: true`) or restored and the world rebuilt (`false`). */
  contextLost: { lost: boolean };
}
