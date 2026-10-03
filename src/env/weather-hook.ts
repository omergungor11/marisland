import type { WeatherName } from '../core/params.ts';
import type { EnvState } from './env-state.ts';

/**
 * Weather ↔ EnvState hand-off (TASK-172). `sampleEnv` calls `WEATHER_HOOK.apply`
 * last, so every EnvState consumer sees the weather deltas. `createWeather`
 * registers itself here; if nothing registered by the first `sampleEnv`, one is
 * booted from `WEATHER_BOOT` (set it from params before the first frame).
 */
export const WEATHER_BOOT: { seed: number; forced: WeatherName | '' } = { seed: 1, forced: '' };

export const WEATHER_HOOK: { apply?: (env: EnvState) => void } = {};
