import { describe, it, expect } from 'vitest';
import { parseShare, buildChallengeUrl, dailySeed } from '../src/share';
import { MODE_IDS } from '../src/modes';

describe('share', () => {
  it('round-trips a challenge through the URL', () => {
    const url = buildChallengeUrl(123456, 'famine', {
      origin: 'https://grainfall.benrichardson.dev/',
      score: 1875,
      by: 'Ada',
    });
    const p = parseShare('?' + url.split('?')[1]);
    expect(p.seed).toBe(123456);
    expect(p.modeId).toBe('famine');
    expect(p.target).toBe(1875);
    expect(p.by).toBe('Ada');
  });

  it('falls back to the default mode for an unknown mode id', () => {
    const p = parseShare('?seed=zz&mode=constructor');
    expect(MODE_IDS).toContain(p.modeId);
    expect(p.modeId).toBe('steward');
  });

  it('returns a null seed when none is present or it is garbage', () => {
    expect(parseShare('').seed).toBeNull();
    expect(parseShare('?seed=%%%').seed).toBeNull();
  });

  it('sanitizes a hostile challenger name', () => {
    const p = parseShare('?seed=1&by=' + encodeURIComponent('<script>x</script>'));
    expect(p.by).not.toContain('<');
    expect(p.by).not.toContain('>');
  });

  it('daily seed is stable per UTC day and changes across days', () => {
    const a = dailySeed(new Date('2026-07-18T05:00:00Z'));
    const b = dailySeed(new Date('2026-07-18T23:00:00Z'));
    const c = dailySeed(new Date('2026-07-19T01:00:00Z'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
