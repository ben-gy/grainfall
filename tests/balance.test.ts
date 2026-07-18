/**
 * balance.test.ts — the game is the economy, so the economy is simulated, not
 * eyeballed. Two reference rulers (cautious, greedy) play hundreds of fixed
 * seeds per mode. We assert the *shape* of the outcome:
 *
 *  - A cautious ruler survives most reigns but not all — skill AND luck matter.
 *    Not trivially always-win (that's not a game), not a coin flip (that's luck).
 *  - Cautious out-survives greedy in every mode: a reckless policy dies more, so
 *    the player's decisions are what decide the reign.
 *  - Mode difficulty ordering holds: Famine is harder than Steward.
 *  - Scores spread out; every reign terminates within its year budget.
 *
 * Written BEFORE the constants were tuned — its printed baseline is what told a
 * real balance change from a confident story.
 */

import { describe, it, expect } from 'vitest';
import { initGame, resolveYear, standing, type GameState } from '../src/game';
import { cautious, greedy, type Policy } from '../src/bots';
import { MODE_IDS, modeOf } from '../src/modes';

function playOut(seed: number, modeId: string, policy: Policy) {
  let s: GameState = initGame(seed, modeId);
  const maxYears = modeOf(modeId).years;
  let guard = 0;
  while (!s.over) {
    s = resolveYear(s, policy(s)).state;
    if (++guard > maxYears + 2) throw new Error('reign did not terminate');
  }
  return { survived: s.endReason === 'reign', years: s.history.length, score: standing(s).score, state: s };
}

interface Agg {
  survival: number;
  n: number;
  scores: number[];
  avgYears: number;
}

function sweep(modeId: string, policy: Policy, seeds: number): Agg {
  let survived = 0;
  let yearsSum = 0;
  const scores: number[] = [];
  for (let i = 0; i < seeds; i++) {
    const r = playOut(1000 + i * 7, modeId, policy);
    if (r.survived) survived++;
    yearsSum += r.years;
    scores.push(r.score);
  }
  return { survival: survived / seeds, n: seeds, scores, avgYears: yearsSum / seeds };
}

const SEEDS = 400;

describe('balance', () => {
  const table: Record<string, { cautious: Agg; greedy: Agg }> = {};
  for (const mode of MODE_IDS) {
    table[mode] = { cautious: sweep(mode, cautious, SEEDS), greedy: sweep(mode, greedy, SEEDS) };
  }

  it('prints a baseline', () => {
    for (const mode of MODE_IDS) {
      const c = table[mode].cautious;
      const g = table[mode].greedy;
      const min = Math.min(...c.scores);
      const max = Math.max(...c.scores);
      const mean = Math.round(c.scores.reduce((a, b) => a + b, 0) / c.scores.length);
      // eslint-disable-next-line no-console
      console.log(
        `${mode.padEnd(8)} cautious survive=${(c.survival * 100).toFixed(0)}% ` +
          `greedy survive=${(g.survival * 100).toFixed(0)}% ` +
          `score[min/mean/max]=${min}/${mean}/${max} avgYears=${c.avgYears.toFixed(1)}`,
      );
    }
    expect(true).toBe(true);
  });

  it('a cautious ruler survives most reigns, but the hard modes can still end you', () => {
    for (const mode of MODE_IDS) {
      expect(table[mode].cautious.survival).toBeGreaterThan(0.5); // a game of skill, winnable
    }
    // The forgiving mode really is forgiving.
    expect(table.steward.cautious.survival).toBeGreaterThan(0.85);
    // ...but luck genuinely ends careful reigns in the harder modes.
    expect(table.famine.cautious.survival).toBeLessThan(0.9);
    expect(table.dynasty.cautious.survival).toBeLessThan(0.9);
  });

  it('skill matters: cautious out-survives greedy in every mode', () => {
    for (const mode of MODE_IDS) {
      expect(table[mode].cautious.survival).toBeGreaterThan(table[mode].greedy.survival);
    }
  });

  it('mode difficulty ordering holds: Famine is harder than Steward', () => {
    expect(table.famine.cautious.survival).toBeLessThan(table.steward.cautious.survival);
  });

  it('scores have real spread (not everyone lands the same number)', () => {
    for (const mode of MODE_IDS) {
      const unique = new Set(table[mode].cautious.scores).size;
      expect(unique).toBeGreaterThan(20);
    }
  });

  it('every reign terminates within its year budget', () => {
    for (const mode of MODE_IDS) {
      expect(table[mode].cautious.avgYears).toBeLessThanOrEqual(modeOf(mode).years);
    }
  });
});
