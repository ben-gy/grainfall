/**
 * determinism.test.ts — the async-multiplayer invariant. Two players who open
 * the same seed MUST live the byte-identical reign, or the Daily and challenge
 * comparisons are meaningless. Adapted from patterns/tests/rng.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { makeRng, randInt, pick } from '../src/engine/rng';
import { initGame, resolveYear, standing, type GameState } from '../src/game';
import { cautious } from '../src/bots';
import { MODE_IDS } from '../src/modes';

describe('rng', () => {
  it('two generators from the same seed produce identical streams', () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    for (let i = 0; i < 500; i++) expect(a()).toBe(b());
  });

  it('a string seed is stable and different seeds diverge', () => {
    const a = makeRng('grainfall-2026-07-18');
    const b = makeRng('grainfall-2026-07-18');
    const c = makeRng('grainfall-2026-07-19');
    expect(a()).toBe(b());
    expect(a()).not.toBe(c());
  });

  it('randInt stays in range and pick returns a member', () => {
    const r = makeRng(7);
    for (let i = 0; i < 200; i++) {
      const n = randInt(r, 3, 9);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(9);
    }
    const arr = ['a', 'b', 'c'] as const;
    expect(arr).toContain(pick(makeRng(1), arr));
  });
});

function replay(seed: number, modeId: string): GameState {
  let s = initGame(seed, modeId);
  let guard = 0;
  while (!s.over && guard++ < 40) s = resolveYear(s, cautious(s)).state;
  return s;
}

describe('reign determinism', () => {
  it('the same seed + mode replays an identical reign for every player', () => {
    for (const id of MODE_IDS) {
      const a = replay(778899, id);
      const b = replay(778899, id);
      expect(a.history).toEqual(b.history);
      expect(a.grain).toBe(b.grain);
      expect(a.people).toBe(b.people);
      expect(a.land).toBe(b.land);
      expect(standing(a).score).toBe(standing(b).score);
    }
  });

  it('different seeds give different reigns', () => {
    const a = replay(1, 'steward');
    const b = replay(2, 'steward');
    expect(a.history).not.toEqual(b.history);
  });
});
