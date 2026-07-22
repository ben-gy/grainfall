// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * game.ts — the pure Grainfall simulation. No DOM, no rng-at-call-time: every
 * random outcome for a (seed, mode, year) is derived deterministically, so any
 * two players who open the same seed live the identical reign. This is what
 * makes the Daily Reign and challenge links fair, and what the balance sim and
 * determinism tests lean on.
 *
 * A YEAR resolves in a fixed order (this order IS the game's tension):
 *   1. Trade land at this year's price (buy low / sell high).
 *   2. Sow fields — each acre needs a bushel of seed; a farmer works 10 acres.
 *   3. Set aside grain to feed the people — 20 bushels each (mode-dependent).
 *   4. Harvest lands: sown acres x this year's yield.
 *   5. Rats may gnaw a fraction of the granary.
 *   6. Feeding resolves: under-fed people starve. Lose >45% in one year = deposed.
 *   7. A well-fed, well-provisioned city draws settlers.
 *   8. A plague may take a fraction of the (new) population.
 */

import { makeRng, randInt, randFloat, hashSeed } from './engine/rng';
import { modeOf, type Mode } from './modes';

export const SEED_PER_ACRE = 1;
export const ACRES_PER_FARMER = 10;
/** Lose more than this fraction of your people to starvation in one year and
 * the city rises up and deposes you. */
export const OVERTHROW_FRAC = 0.45;

export interface Decision {
  /** Acres to buy (positive) or sell (negative). */
  buy: number;
  /** Acres to sow. */
  sow: number;
  /** Bushels set aside to feed the people. */
  feed: number;
}

export interface Rolls {
  /** Land price this year, bushels per acre — known before you decide. */
  price: number;
  /** Harvest yield, bushels per sown acre. */
  yieldPerAcre: number;
  /** Fraction of the granary rats eat (0 if no rats this year). */
  ratBite: number;
  /** Fraction of the population a plague kills (0 if no plague). */
  plagueKill: number;
  /** True if a blight wrecked the harvest (Famine). */
  blight: boolean;
}

export interface YearResult {
  year: number;
  price: number;
  buy: number;
  sow: number;
  feed: number;
  harvest: number;
  yieldPerAcre: number;
  blight: boolean;
  ratLoss: number;
  fed: number;
  starved: number;
  settlers: number;
  plagueDead: number;
  /** State AFTER the year resolves. */
  grain: number;
  people: number;
  land: number;
  /** Human-readable narration lines for the log. */
  events: string[];
}

export type EndReason = 'reign' | 'overthrown' | 'extinct';

export interface GameState {
  seed: number;
  modeId: string;
  /** The year about to be played (1-based). */
  year: number;
  grain: number;
  people: number;
  land: number;
  over: boolean;
  endReason: EndReason | null;
  /** Rolls for the *current* (upcoming) year — price is shown before deciding. */
  rolls: Rolls;
  history: YearResult[];
  totalStarved: number;
  totalHarvest: number;
  peakPeople: number;
}

/** Derive every random outcome for one year, in a fixed draw order. Pure. */
export function computeRolls(seed: number, mode: Mode, year: number): Rolls {
  const yr = makeRng(hashSeed(`${seed}|${mode.id}|y${year}`));
  const price = randInt(yr, mode.price[0], mode.price[1]);
  const baseYield = randInt(yr, mode.yield[0], mode.yield[1]);
  const blight = mode.blightChance > 0 && yr() < mode.blightChance;
  const yieldPerAcre = blight ? randInt(yr, 0, 1) : baseYield;
  const rats = yr() < mode.ratChance;
  const ratBite = rats ? randFloat(yr, mode.ratBite[0], mode.ratBite[1]) : 0;
  const plague = yr() < mode.plagueChance;
  const plagueKill = plague ? randFloat(yr, mode.plagueKill[0], mode.plagueKill[1]) : 0;
  return { price, yieldPerAcre, ratBite, blight, plagueKill };
}

export function initGame(seed: number, modeId: string): GameState {
  const mode = modeOf(modeId);
  return {
    seed,
    modeId: mode.id,
    year: 1,
    grain: mode.start.grain,
    people: mode.start.people,
    land: mode.start.land,
    over: false,
    endReason: null,
    rolls: computeRolls(seed, mode, 1),
    history: [],
    totalStarved: 0,
    totalHarvest: 0,
    peakPeople: mode.start.people,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** How many bushels feed everyone this year. */
export function feedNeeded(state: GameState): number {
  return state.people * modeOf(state.modeId).feedPerPerson;
}

/** Most acres you could buy this year with the grain on hand. */
export function maxBuy(state: GameState): number {
  return Math.floor(state.grain / state.rolls.price);
}

/** Most acres you could sow: bounded by land, by farmers (10 acres each), and by
 * seed grain available after a hypothetical land trade. */
export function maxSow(state: GameState, afterBuy: number): number {
  const land = state.land + afterBuy;
  const grainAfterBuy = state.grain - afterBuy * state.rolls.price;
  return Math.max(
    0,
    Math.min(land, state.people * ACRES_PER_FARMER, Math.floor(grainAfterBuy / SEED_PER_ACRE)),
  );
}

/** Coerce any decision into a legal one, applied in the fixed order. Bots and the
 * UI both go through this, so an out-of-range slider can never break the sim. */
export function legalize(state: GameState, d: Decision): Decision {
  const price = state.rolls.price;
  // 1. Land trade: can't sell more than you own, can't buy more than you can pay for.
  const buy = Math.round(clamp(d.buy, -state.land, maxBuy(state)));
  const grainAfterBuy = state.grain - buy * price;
  // 2. Sow: bounded by land, farmers, and seed grain.
  const sow = Math.round(clamp(d.sow, 0, maxSow(state, buy)));
  const grainAfterSow = grainAfterBuy - sow * SEED_PER_ACRE;
  // 3. Feed: whatever grain is left is the ceiling.
  const feed = Math.round(clamp(d.feed, 0, grainAfterSow));
  return { buy, sow, feed };
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Resolve one year. Returns the next state and a YearResult for the log/juice. */
export function resolveYear(
  state: GameState,
  decision: Decision,
): { state: GameState; result: YearResult } {
  if (state.over) throw new Error('reign is over');
  const mode = modeOf(state.modeId);
  const rolls = state.rolls;
  const d = legalize(state, decision);
  const events: string[] = [];

  let grain = state.grain;
  let people = state.people;
  let land = state.land;

  // 1. Land trade
  land += d.buy;
  grain -= d.buy * rolls.price;
  if (d.buy > 0) events.push(`Bought ${fmt(d.buy)} acres at ${rolls.price} bushels each.`);
  else if (d.buy < 0) events.push(`Sold ${fmt(-d.buy)} acres at ${rolls.price} bushels each.`);

  // 2. Sow (seed consumed now)
  grain -= d.sow * SEED_PER_ACRE;

  // 3. Feed set aside (consumed regardless of surplus)
  grain -= d.feed;

  // 4. Harvest
  const harvest = d.sow * rolls.yieldPerAcre;
  grain += harvest;
  if (rolls.blight) events.push(`Blight struck the fields — a ruined harvest of ${rolls.yieldPerAcre}/acre.`);
  else events.push(`Harvest: ${rolls.yieldPerAcre} bushels an acre — ${fmt(harvest)} bushels in.`);

  // 5. Rats
  const ratLoss = Math.floor(grain * rolls.ratBite);
  grain -= ratLoss;
  if (ratLoss > 0) events.push(`Rats! ${fmt(ratLoss)} bushels gnawed from the granary.`);

  // 6. Feeding resolves
  const fed = Math.min(people, Math.floor(d.feed / mode.feedPerPerson));
  const starved = people - fed;
  const starveFrac = people > 0 ? starved / people : 1;
  if (starved > 0) events.push(`${fmt(starved)} souls starved for want of grain.`);
  let survivors = fed;

  const overthrown = starveFrac > OVERTHROW_FRAC;

  // 7. Settlers — only a fully-fed, well-provisioned city grows
  let settlers = 0;
  if (!overthrown && starved === 0 && survivors > 0) {
    const cushion = clamp(grain / (survivors * mode.feedPerPerson), 0, 1);
    // Capped by land: a city never grows past what its acres can feed, so growth
    // is never a death sentence. To grow further, buy land.
    const capByLand = Math.floor(land / mode.landPerHead);
    const room = Math.max(0, capByLand - survivors);
    settlers = Math.min(Math.floor(survivors * mode.growthRate * cushion), room);
    if (settlers > 0) events.push(`Word of plenty spreads — ${fmt(settlers)} settlers arrive.`);
  }
  let pop = survivors + settlers;

  // 8. Plague
  let plagueDead = 0;
  if (!overthrown && pop > 0 && rolls.plagueKill > 0) {
    plagueDead = Math.floor(pop * rolls.plagueKill);
    pop -= plagueDead;
    if (plagueDead > 0) events.push(`Plague swept the city; ${fmt(plagueDead)} lost.`);
  }

  grain = Math.max(0, Math.floor(grain));
  land = Math.max(0, Math.round(land));
  pop = Math.max(0, Math.floor(pop));

  const result: YearResult = {
    year: state.year,
    price: rolls.price,
    buy: d.buy,
    sow: d.sow,
    feed: d.feed,
    harvest,
    yieldPerAcre: rolls.yieldPerAcre,
    blight: rolls.blight,
    ratLoss,
    fed,
    starved,
    settlers,
    plagueDead,
    grain,
    people: pop,
    land,
    events,
  };

  // Assemble next state
  const history = [...state.history, result];
  const totalStarved = state.totalStarved + starved;
  const totalHarvest = state.totalHarvest + harvest;
  const peakPeople = Math.max(state.peakPeople, pop);

  let over = false;
  let endReason: EndReason | null = null;
  let nextYear = state.year + 1;
  if (overthrown) {
    over = true;
    endReason = 'overthrown';
    events.push(`The people rose up. Your reign ends in year ${state.year}.`);
  } else if (pop <= 0) {
    over = true;
    endReason = 'extinct';
    events.push(`The last of your people are gone. The city falls silent.`);
  } else if (nextYear > mode.years) {
    over = true;
    endReason = 'reign';
    events.push(`Your ${mode.years}-year reign is complete.`);
  }

  const next: GameState = {
    ...state,
    year: over ? state.year : nextYear,
    grain,
    people: pop,
    land,
    over,
    endReason,
    rolls: over ? rolls : computeRolls(state.seed, mode, nextYear),
    history,
    totalStarved,
    totalHarvest,
    peakPeople,
  };

  return { state: next, result };
}

export interface Standing {
  score: number;
  title: string;
  /** A one-line epitaph for the results scroll. */
  epitaph: string;
}

/** Judge the reign. Absolute-ish so a shared seed's scores compare directly. */
export function standing(state: GameState): Standing {
  const s = state;
  const raw = s.people * 10 + s.land * 2 + Math.floor(s.grain / 8) - s.totalStarved * 12;
  const score = Math.max(0, Math.round(raw));

  let title: string;
  let epitaph: string;
  if (s.endReason === 'overthrown') {
    title = 'Deposed';
    epitaph = 'The granary ran dry and the people would take no more.';
  } else if (s.endReason === 'extinct') {
    title = 'The Last Ruler';
    epitaph = 'You outlived your city. There was no one left to rule.';
  } else if (score >= 2600) {
    title = 'Legend of the Grainfall';
    epitaph = 'They will sing of these years for a hundred more.';
  } else if (score >= 1600) {
    title = 'A Golden Age';
    epitaph = 'Full granaries, growing streets — a reign remembered fondly.';
  } else if (score >= 900) {
    title = 'Beloved Ruler';
    epitaph = 'You kept them fed through the lean years. That is no small thing.';
  } else if (score >= 400) {
    title = 'A Steady Hand';
    epitaph = 'Not a golden age, but the city stood when you left it.';
  } else {
    title = 'Barely Remembered';
    epitaph = 'The city survived you — just. History moves on.';
  }
  return { score, title, epitaph };
}
