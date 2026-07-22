// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * share.ts — the async multiplayer layer. No live connection: a reign is a
 * deterministic function of (seed, mode), so "play with friends" means sharing a
 * seed and comparing who ruled it better.
 *
 *  - Daily Reign: seed derived from the UTC date, same for everyone that day.
 *  - Challenge link: ?seed=&mode= (+ optional &t=<target score>&by=<name>) so a
 *    friend plays the byte-identical decade and sees your score to beat.
 */

import { hashSeed } from './engine/rng';
import { modeOf, DEFAULT_MODE, type ModeId } from './modes';

export interface ShareParams {
  seed: number | null;
  modeId: ModeId;
  /** A challenger's score to beat, if the link carried one. */
  target: number | null;
  /** A challenger's name, if any (already display-safe). */
  by: string | null;
}

/** Deterministic seed for a given UTC day (defaults to today). */
export function dailySeed(date = new Date()): number {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return hashSeed(`grainfall-${y}-${m}-${d}`);
}

/** Human label for a daily seed (UTC). */
export function dailyLabel(date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function sanitizeName(raw: string | null): string | null {
  if (!raw) return null;
  const clean = raw.replace(/[^\p{L}\p{N} _'-]/gu, '').trim().slice(0, 16);
  return clean.length ? clean : null;
}

/** Parse share params from a URL search string (defaults to the live location). */
export function parseShare(search: string = location.search): ShareParams {
  const q = new URLSearchParams(search);
  const rawSeed = q.get('seed');
  let seed: number | null = null;
  if (rawSeed != null) {
    const n = parseInt(rawSeed, 36);
    if (Number.isFinite(n) && n >= 0) seed = n >>> 0;
  }
  const modeId = modeOf(q.get('mode')).id as ModeId;
  const rawTarget = q.get('t');
  let target: number | null = null;
  if (rawTarget != null) {
    const n = parseInt(rawTarget, 36);
    if (Number.isFinite(n) && n >= 0) target = n;
  }
  return { seed, modeId, target, by: sanitizeName(q.get('by')) };
}

/** Build a challenge URL for a given reign, optionally carrying your result. */
export function buildChallengeUrl(
  seed: number,
  modeId: string,
  opts: { origin?: string; score?: number; by?: string } = {},
): string {
  const origin = opts.origin ?? `${location.origin}${location.pathname}`;
  const q = new URLSearchParams();
  q.set('seed', (seed >>> 0).toString(36));
  q.set('mode', modeOf(modeId).id);
  if (typeof opts.score === 'number') q.set('t', Math.max(0, Math.round(opts.score)).toString(36));
  const by = sanitizeName(opts.by ?? null);
  if (by) q.set('by', by);
  return `${origin}?${q.toString()}`;
}

/** Remove share params from the address bar so a reload starts fresh from the
 * menu rather than silently re-locking the player into the shared reign. */
export function clearShareInUrl(): void {
  try {
    const url = new URL(location.href);
    for (const k of ['seed', 'mode', 't', 'by']) url.searchParams.delete(k);
    history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
  } catch {
    /* ignore */
  }
}

export { DEFAULT_MODE };
