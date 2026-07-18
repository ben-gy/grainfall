/**
 * layout.test.ts — invariant guards for mobile-layout fixes that jsdom cannot
 * measure (it has no layout engine). These pin CSS rules whose absence caused a
 * real bug at ~375px, so a revert turns the suite red.
 *
 * The bug: at phone width the 4-column HUD clipped its numbers ("3,20" instead
 * of "3,200") because the label + value rendered inline in a box too narrow for
 * both. The fix stacks them (block) and keeps the number on one line.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, '..', 'src', 'styles', 'main.css'), 'utf8');
const rule = (selector: string): string => {
  const i = css.indexOf(selector);
  if (i < 0) return '';
  return css.slice(i, css.indexOf('}', i));
};

describe('mobile layout guards', () => {
  it('the `hidden` attribute always wins (Safari overlay-eats-taps guard)', () => {
    // Lives in mobile.css; assert it survives in the shipped stylesheet chain.
    const mobile = readFileSync(join(__dirname, '..', 'src', 'styles', 'mobile.css'), 'utf8');
    expect(mobile).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  });

  it('HUD stat label and value stack (block) so wide numbers do not clip', () => {
    expect(rule('.stat .k')).toContain('display: block');
    const v = rule('.stat .v');
    expect(v).toContain('display: block');
    expect(v).toContain('white-space: nowrap');
  });

  it('the decision value stays on one line', () => {
    expect(rule('.dec-val')).toContain('white-space: nowrap');
  });
});
