// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * modes.ts — the three reigns. A mode changes how the game *plays*, not just a
 * number on the dial:
 *
 *  - Steward: a balanced 10-year reign. Learn the loop; a competent ruler thrives.
 *  - Famine:  a 12-year war of attrition. Land is exhausted (poor harvests, frequent
 *             rats, hungrier people) but cheap. You play DEFENCE — hoard, survive
 *             the bad harvests, keep your people alive. Growth barely happens.
 *  - Dynasty: a 20-year boom. Fertile land, big harvests, and land prices that swing
 *             wildly so speculation is a real lever — but a large well-fed city is a
 *             huge feeding liability through one bad year. You play OFFENCE: expand,
 *             time the market, and survive your own success over a long horizon.
 *
 * The host's pick (in async terms, the seed's mode) is frozen into the reign, so a
 * shared seed replays the same regime for everyone.
 */

export interface Mode {
  id: string;
  name: string;
  blurb: string;
  /** How the mode plays differently, one line — shown under the name. */
  feel: string;
  years: number;
  start: { grain: number; people: number; land: number };
  feedPerPerson: number;
  /** Acres of land a person needs to be sustainably feedable at this mode's
   * average yield. Caps settler arrivals so a city can't grow past what its land
   * can feed (to grow further you must buy land). Set ≈ feed / (avgYield − 1). */
  landPerHead: number;
  /** Land price range [min, max], bushels per acre. */
  price: [number, number];
  /** Harvest yield range [min, max], bushels per acre. */
  yield: [number, number];
  ratChance: number;
  /** Fraction of the granary rats eat [min, max]. */
  ratBite: [number, number];
  plagueChance: number;
  /** Fraction of the population a plague kills [min, max]. */
  plagueKill: [number, number];
  /** Settler draw rate for a fully-fed, well-provisioned city. */
  growthRate: number;
  /** Chance a harvest is blighted near zero (Famine only). */
  blightChance: number;
}

export const MODES: Record<string, Mode> = {
  steward: {
    id: 'steward',
    name: 'Steward',
    blurb: 'A balanced ten-year reign. The place to learn the grain.',
    feel: '10 years · fair harvests · learn the loop',
    years: 10,
    start: { grain: 2800, people: 100, land: 1000 },
    feedPerPerson: 20,
    landPerHead: 9,
    price: [17, 26],
    yield: [1, 6],
    ratChance: 0.4,
    ratBite: [0.05, 0.2],
    plagueChance: 0.12,
    plagueKill: [0.15, 0.3],
    growthRate: 0.1,
    blightChance: 0,
  },
  famine: {
    id: 'famine',
    name: 'Famine',
    blurb: 'Exhausted land, hungry people, and rats everywhere. Just survive.',
    feel: '11 years · lean harvests, cheap land · play defence',
    years: 11,
    start: { grain: 3200, people: 100, land: 1000 },
    feedPerPerson: 20,
    landPerHead: 11,
    price: [10, 18],
    yield: [1, 5],
    ratChance: 0.5,
    ratBite: [0.05, 0.22],
    plagueChance: 0.16,
    plagueKill: [0.15, 0.32],
    growthRate: 0.08,
    blightChance: 0.08,
  },
  dynasty: {
    id: 'dynasty',
    name: 'Dynasty',
    blurb: 'An eighteen-year boom. Fertile fields, wild land prices, high stakes.',
    feel: '18 years · big harvests, swinging market · play offence',
    years: 18,
    start: { grain: 3200, people: 100, land: 1000 },
    feedPerPerson: 20,
    landPerHead: 7,
    price: [14, 40],
    yield: [2, 7],
    ratChance: 0.35,
    ratBite: [0.05, 0.22],
    plagueChance: 0.12,
    plagueKill: [0.15, 0.3],
    growthRate: 0.1,
    blightChance: 0,
  },
};

export const MODE_IDS = ['steward', 'famine', 'dynasty'] as const;
export type ModeId = (typeof MODE_IDS)[number];
export const DEFAULT_MODE: ModeId = 'steward';

/** Validate an id off a URL/wire; unknown ids fall back to the default, never
 * reaching the generator as `undefined`. */
export function modeOf(id: string | null | undefined): Mode {
  if (id && Object.hasOwn(MODES, id)) return MODES[id];
  return MODES[DEFAULT_MODE];
}
