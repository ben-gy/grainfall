/**
 * source-hygiene.test.ts — no literal control bytes in source. A raw control
 * byte compiles and runs, but `file` calls the source "data", git treats it as
 * binary, and plain grep silently matches nothing in it — so an audit that greps
 * gets a false all-clear. Write \x00-style escapes instead. (Copied convention;
 * this has bitten the factory twice.)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs|css|html|json|md)$/.test(name)) out.push(p);
  }
  return out;
}

describe('source hygiene', () => {
  it('has no literal control bytes in tracked source', () => {
    // Allow tab (0x09), newline (0x0A), carriage return (0x0D).
    const bad = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;
    const root = join(__dirname, '..');
    const offenders: string[] = [];
    for (const f of walk(root)) {
      if (bad.test(readFileSync(f, 'utf8'))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
