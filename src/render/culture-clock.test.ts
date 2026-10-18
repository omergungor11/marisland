import { describe, expect, it } from 'vitest';
import { Clock } from '../core/clock.ts';
import { CULTURES } from '../content/cultures/index.ts';
import {
  CULTURE_CLOCK,
  CULTURE_GATES,
  CULTURE_RHYTHM,
  RELAY,
  SEA_LAMPS,
  cultureGateOf,
  cultureLampTheme,
} from '../content/cultures/rhythm.ts';
import { PROP_DEFS } from '../content/props.ts';
import { THEME_IDS, type ThemeId } from '../world/types.ts';
import { createCultureClock, createCultureState, evalCulture } from './culture-clock.ts';
import { GATES, SHARED } from './uniforms.ts';

const SPH = CULTURE_CLOCK.secondsPerHour;
const at = (hour: number, extraS = 0, rain = 0) =>
  evalCulture(hour * SPH + extraS, rain, createCultureState());
const byOrder = (o: number): ThemeId => THEME_IDS.find((t) => CULTURES[t].relay.order === o)!;

describe('culture clock (TASK-430)', () => {
  it('day seconds match the game clock', () => {
    expect(new Clock().dayLength / 24).toBe(SPH);
  });

  it('the rhythm table names real defs and fills every culture', () => {
    const ids = new Set(PROP_DEFS.map((d) => d.id));
    for (const t of THEME_IDS) {
      for (const id of CULTURE_RHYTHM[t].lamps.defs) {
        expect(ids.has(id), id).toBe(true);
        expect(cultureLampTheme(id)).toBe(t);
      }
      expect(CULTURES[t].rhythm.length).toBeGreaterThan(0);
    }
    for (const [g, c] of Object.entries(CULTURE_GATES)) {
      expect(ids.has(c.def)).toBe(true);
      expect(cultureGateOf(c.def)).toBe(g);
    }
  });

  it('relay step k is active at 21:00 + k·10 s, islands in relay order', () => {
    for (let k = 0; k < 7; k++) {
      const s = at(RELAY.hour, k * RELAY.stepS + RELAY.stepS / 2);
      expect(s.relay.step).toBe(k);
      const who = byOrder(k + 1);
      // the stepping island flashes above the hold glow; later islands are still dark
      expect(s.boost[who]).toBeGreaterThan(RELAY.glow);
      for (let o = 1; o <= 7; o++) {
        if (o <= k) expect(s.boost[byOrder(o)]).toBeCloseTo(RELAY.glow, 5);
        if (o > k + 1) expect(s.boost[byOrder(o)]).toBe(0);
      }
    }
    expect(at(RELAY.hour, -1).relay.step).toBe(-1);
    expect(at(RELAY.hour, RELAY.lengthS + 1).relay.step).toBe(-1);
    // fades out, then nothing
    const after = at(RELAY.hour, RELAY.lengthS + RELAY.fadeS + 1);
    for (const t of THEME_IDS) expect(after.boost[t]).toBe(0);
  });

  it('rainbow shows in its dawn / prism-hour windows, never at night or in heavy rain', () => {
    expect(at(6.75).gates.rainbow).toBe(1);
    expect(at(17.5).gates.rainbow).toBe(1);
    expect(at(12).gates.rainbow).toBe(0);
    expect(at(21).gates.rainbow).toBe(0);
    expect(at(2).gates.rainbow).toBe(0);
    expect(at(17.5, 0, 1).gates.rainbow).toBe(0);
    // dithered in, not popped: the edge passes through intermediate values
    const mid = at(16.5, CULTURE_GATES.rainbow.fadeS / 2).gates.rainbow;
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
  });

  it('lamp sets follow their island: marquee before dusk, research at comet night', () => {
    expect(at(17.75).lamps.marketing).toBe(1);
    expect(at(17.75).lamps.research).toBe(0);
    expect(at(21.5).lamps.research).toBe(0);
    expect(at(23).lamps.research).toBe(1);
    expect(at(3).lamps.qa).toBe(1);
    expect(at(12).lamps.qa).toBe(0);
  });

  it('the sea lamp set (channel buoys) runs 20:00 → 06:00 on every seed (TASK-474)', () => {
    expect(SEA_LAMPS.defs.every((d) => PROP_DEFS.some((p) => p.id === d))).toBe(true);
    expect(at(19.9).sea).toBe(0);
    expect(at(20, SEA_LAMPS.rampS).sea).toBe(1);
    expect(at(3).sea).toBe(1);
    expect(at(6.1).sea).toBe(0);
    expect(at(12).sea).toBe(0);
  });

  it('rituals report their phase', () => {
    expect(at(14, 30).festival.coding).toEqual({ id: 'kiteDay', phase: 0.5 });
    expect(at(13.9).festival.coding).toBeNull();
    expect(at(21, 20).festival.devops?.id).toBe('releaseNight');
  });

  it('deterministic, and a frozen day runs on sim time from the build time', () => {
    const a = JSON.stringify(at(21, 33.3, 0.2));
    expect(JSON.stringify(at(21, 33.3, 0.2))).toBe(a);
    const isles = THEME_IDS.map((theme, i) => ({ theme, cx: i * 100, cz: 0, reach: 40 }));
    const clock = createCultureClock(isles, 21, 0);
    clock.update(21, 25, 0); // frozen at 21:00, 25 s of sim time
    expect(clock.state.relay.step).toBe(2);
    const qa = THEME_IDS.indexOf(byOrder(3));
    expect(SHARED.uCultureLamps.value[qa].y).toBeGreaterThan(RELAY.glow);
    expect(SHARED.uCultureIsle.value[qa].w).toBe(1);
    expect(GATES.rainbow.value).toBe(0);
    // the running day: the clock follows the hour
    clock.update(21.2, 30, 0);
    expect(clock.state.day).toBeCloseTo(21.2 * SPH, 6);
    clock.dispose();
    expect(SHARED.uCultureIsle.value[qa].w).toBe(0);
    expect(GATES.rainbow.value).toBe(1);
  });
});
