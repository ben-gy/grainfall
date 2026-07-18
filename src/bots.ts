/**
 * bots.ts — reference policies used by the balance sim (and to sanity-check the
 * economy). Two contrasting rulers:
 *
 *   cautious — feeds everyone, keeps a granary cushion, sells land to cover a
 *              feeding gap, sows within its means. A competent, careful ruler.
 *   greedy   — over-buys cheap land, over-sows, keeps no cushion. Plausible but
 *              reckless; one bad harvest or rat year and its people starve.
 *
 * The balance sim asserts cautious out-survives greedy in every mode: if a
 * reckless policy did as well, skill wouldn't matter and the game would be a
 * slot machine.
 */

import {
  type GameState,
  type Decision,
  feedNeeded,
  maxSow,
  legalize,
} from './game';
import { modeOf } from './modes';

export type Policy = (state: GameState) => Decision;

export const cautious: Policy = (state) => {
  const mode = modeOf(state.modeId);
  const price = state.rolls.price;
  const need = feedNeeded(state);

  // If the granary can't feed everyone, sell just enough land to close the gap.
  let buy = 0;
  if (state.grain < need) {
    const gap = need - state.grain;
    buy = -Math.min(state.land, Math.ceil(gap / price));
  } else if (state.grain > need * 2 && price <= mode.price[1] * 0.75) {
    // Flush and land is reasonably priced — reinvest surplus into acres to raise
    // the city's ceiling, keeping ~1.5 years of feeding liquid. More land = a
    // higher sustainable population and a bigger granary to ride out bad years.
    const invest = (state.grain - need * 1.5) * 0.6;
    buy = Math.max(0, Math.floor(invest / price));
  }

  const grainAfterBuy = state.grain - buy * price;
  const feed = Math.min(grainAfterBuy, need);
  const afterFeed = grainAfterBuy - feed;
  // Sow every acre you can farm and afford, keeping only a thin liquidity buffer.
  // Idle fields are the real killer: a city that under-plants runs at a loss even
  // in a good year. Once land caps the sowing, leftover grain becomes the granary
  // cushion on its own — no need to hoard it deliberately.
  const buffer = Math.floor(afterFeed * 0.15);
  const seedGrain = afterFeed - buffer;
  const sow = Math.min(maxSow(state, buy), seedGrain);

  return legalize(state, { buy, sow, feed });
};

export const greedy: Policy = (state) => {
  const mode = modeOf(state.modeId);
  const price = state.rolls.price;
  const need = feedNeeded(state);

  // Buy aggressively when land looks cheap; keep nothing back.
  let buy = 0;
  if (price <= (mode.price[0] + mode.price[1]) / 2) {
    buy = Math.floor((state.grain * 0.4) / price);
  }
  const grainAfterBuy = state.grain - buy * price;
  const feed = Math.min(grainAfterBuy, need); // exactly enough, no cushion
  const seedGrain = Math.max(0, grainAfterBuy - feed);
  const sow = Math.min(maxSow(state, buy), seedGrain);

  return legalize(state, { buy, sow, feed });
};
