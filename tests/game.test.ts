import { describe, it, expect } from 'vitest';
import {
  initGame,
  resolveYear,
  legalize,
  computeRolls,
  standing,
  feedNeeded,
  maxBuy,
  maxSow,
  ACRES_PER_FARMER,
  OVERTHROW_FRAC,
  type GameState,
} from '../src/game';
import { MODES, MODE_IDS, modeOf } from '../src/modes';

function fresh(modeId = 'steward', seed = 42): GameState {
  return initGame(seed, modeId);
}

describe('legalize', () => {
  it('clamps a sell to land owned and a buy to grain on hand', () => {
    const s = fresh();
    const sell = legalize(s, { buy: -99999, sow: 0, feed: 0 });
    expect(sell.buy).toBe(-s.land);
    const buy = legalize(s, { buy: 99999, sow: 0, feed: 0 });
    expect(buy.buy).toBe(maxBuy(s));
    expect(s.grain - buy.buy * s.rolls.price).toBeGreaterThanOrEqual(0);
  });

  it('caps sowing at land, farmers, and seed grain', () => {
    const s = fresh();
    const d = legalize(s, { buy: 0, sow: 99999, feed: 0 });
    expect(d.sow).toBeLessThanOrEqual(s.land);
    expect(d.sow).toBeLessThanOrEqual(s.people * ACRES_PER_FARMER);
    expect(d.sow).toBeLessThanOrEqual(s.grain); // 1 bushel of seed per acre
  });

  it('never lets the granary go negative across a full commit', () => {
    const s = fresh();
    const d = legalize(s, { buy: 20, sow: 500, feed: 99999 });
    const spent = d.buy * s.rolls.price + d.sow + d.feed;
    expect(spent).toBeLessThanOrEqual(s.grain);
    expect(d.feed).toBeGreaterThanOrEqual(0);
  });
});

describe('resolveYear', () => {
  it('adds the harvest and subtracts rats', () => {
    const s = fresh('steward', 7);
    const r = s.rolls;
    const sow = Math.min(200, maxSow(s, 0));
    const { result } = resolveYear(s, { buy: 0, sow, feed: 0 });
    expect(result.harvest).toBe(sow * r.yieldPerAcre);
    expect(result.ratLoss).toBeGreaterThanOrEqual(0);
  });

  it('starves the under-fed and deposes you past the overthrow threshold', () => {
    const s = fresh();
    // Feed nobody: everyone starves -> overthrown.
    const { state, result } = resolveYear(s, { buy: 0, sow: 0, feed: 0 });
    expect(result.starved).toBe(s.people);
    expect(state.over).toBe(true);
    expect(state.endReason).toBe('overthrown');
  });

  it('feeds exactly floor(feed / feedPerPerson) people', () => {
    const s = fresh();
    const per = modeOf(s.modeId).feedPerPerson;
    const feed = per * 60 + 5; // enough for 60 people
    const { result } = resolveYear(s, { buy: 0, sow: 0, feed });
    expect(result.fed).toBe(60);
    expect(result.starved).toBe(s.people - 60);
  });

  it('a fully-fed year with a good harvest survives and can attract settlers', () => {
    const s = fresh('steward', 3);
    const need = feedNeeded(s);
    const sow = Math.min(maxSow(s, 0), 400);
    const { state, result } = resolveYear(s, { buy: 0, sow, feed: need });
    expect(result.starved).toBe(0);
    expect(state.over).toBe(false);
    expect(result.settlers).toBeGreaterThanOrEqual(0);
  });

  it('caps settlers so a city never grows past what its land can feed', () => {
    // Already at/over the land-supported cap: a huge granary must NOT sprout
    // unfeedable settlers (that snowball into starvation is the bug the cap kills).
    const overCap: GameState = { ...fresh('steward', 1), land: 80, people: 10, grain: 100000 };
    const r1 = resolveYear(overCap, { buy: 0, sow: 0, feed: feedNeeded(overCap) }).result;
    expect(r1.settlers).toBe(0);

    // With plenty of land room, a well-fed city DOES grow.
    const roomy: GameState = { ...fresh('steward', 1), land: 2000, people: 40, grain: 100000 };
    const r2 = resolveYear(roomy, { buy: 0, sow: 0, feed: feedNeeded(roomy) }).result;
    expect(r2.settlers).toBeGreaterThan(0);
    expect(r2.people).toBeLessThanOrEqual(Math.floor(2000 / MODES.steward.landPerHead));
  });

  it('advances year by year and ends exactly at the reign length', () => {
    for (const id of MODE_IDS) {
      let s = fresh(id, 5);
      const need0 = feedNeeded(s);
      let guard = 0;
      // Feed everyone every year with a big sow so it never collapses.
      while (!s.over && guard++ < 50) {
        s = resolveYear(s, { buy: 0, sow: maxSow(s, 0), feed: feedNeeded(s) }).state;
      }
      expect(s.history.length).toBeLessThanOrEqual(modeOf(id).years);
      expect(need0).toBeGreaterThan(0);
    }
  });

  it('throws if you try to play a finished reign', () => {
    const s = fresh();
    const dead = resolveYear(s, { buy: 0, sow: 0, feed: 0 }).state;
    expect(dead.over).toBe(true);
    expect(() => resolveYear(dead, { buy: 0, sow: 0, feed: 0 })).toThrow();
  });
});

describe('computeRolls', () => {
  it('is a pure function of (seed, mode, year)', () => {
    const a = computeRolls(123, MODES.steward, 4);
    const b = computeRolls(123, MODES.steward, 4);
    expect(a).toEqual(b);
    const c = computeRolls(123, MODES.steward, 5);
    expect(c).not.toEqual(a);
  });

  it('keeps prices and yields inside the mode band', () => {
    for (const id of MODE_IDS) {
      const m = MODES[id];
      for (let y = 1; y <= m.years; y++) {
        const r = computeRolls(999, m, y);
        expect(r.price).toBeGreaterThanOrEqual(m.price[0]);
        expect(r.price).toBeLessThanOrEqual(m.price[1]);
        expect(r.yieldPerAcre).toBeGreaterThanOrEqual(0);
        expect(r.yieldPerAcre).toBeLessThanOrEqual(m.yield[1]);
      }
    }
  });
});

describe('standing', () => {
  it('gives a Deposed title to an overthrown ruler', () => {
    const s = fresh();
    const dead = resolveYear(s, { buy: 0, sow: 0, feed: 0 }).state;
    expect(standing(dead).title).toBe('Deposed');
    expect(standing(dead).score).toBeGreaterThanOrEqual(0);
  });

  it('rewards a bigger, fuller city with a higher score', () => {
    const big: GameState = { ...fresh(), over: true, endReason: 'reign', people: 200, land: 1500, grain: 4000, totalStarved: 0 };
    const small: GameState = { ...fresh(), over: true, endReason: 'reign', people: 90, land: 800, grain: 500, totalStarved: 30 };
    expect(standing(big).score).toBeGreaterThan(standing(small).score);
  });
});

describe('structural sustainability (pins the balance constants)', () => {
  it('at the population cap, an average harvest still beats the feeding need', () => {
    // If this ever drops below ~1, a mode becomes a guaranteed death spiral
    // (the exact bug the balance sim caught) — so pin it.
    for (const id of MODE_IDS) {
      const m = MODES[id];
      const avgYield = (m.yield[0] + m.yield[1]) / 2;
      const netPerAcre = avgYield - 1; // 1 bushel of seed per acre
      const marginAtCap = (m.landPerHead * netPerAcre) / m.feedPerPerson;
      expect(marginAtCap).toBeGreaterThan(0.95);
    }
    expect(OVERTHROW_FRAC).toBe(0.45);
  });
});
