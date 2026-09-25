// Tests for hooks/ledger.ts, run by `claude plugin test .`. The cases are the
// supersede rule, the chain walk, and the next-free line's order.

import { describe, expect, test } from 'claude-code/testing';
import { itemsOf, nextFree, thread, type Io } from '../hooks/ledger.ts';

const row = (code: string, n: number, ts: string, title = code) =>
  JSON.stringify({ ts, code, prefix: code.replace(/\d+$/, ''), n, title, summary: '' });

function io(files: Record<string, string>): Io {
  return { read: async (p) => files[p] ?? null, list: async () => [] };
}

describe('itemsOf', () => {
  test('a later record supersedes, equal stamps fall to file order, and bad lines are skipped', () => {
    const items = itemsOf([
      [row('F1', 1, '2026-01-01T00:00:00Z', 'old'), '{partial', row('f1', 1, '2026-01-02T00:00:00Z', 'new')].join('\n'),
      [row('A2', 2, '2026-01-01T00:00:00Z', 'first'), row('A2', 2, '2026-01-01T00:00:00Z', 'second')].join('\n'),
    ]);
    expect(items.map((i) => `${i.code} ${i.title}`)).toEqual(['A2 second', 'f1 new']);
  });
});

describe('thread', () => {
  test('walks parents newest first and stops at a loop', async () => {
    const files = { '/d/ledger/chains/c': 'b\n', '/d/ledger/chains/b': 'a\n', '/d/ledger/chains/a': 'c\n' };
    expect(await thread(io(files), '/d', 'c')).toEqual(['c', 'b', 'a']);
  });
});

describe('nextFree', () => {
  test('lists stock prefixes in their order, then invented ones sorted', () => {
    const items = itemsOf([[row('Q2', 2, 't'), row('ZZ1', 1, 't'), row('AT3', 3, 't'), row('F9', 9, 't'), row('BB4', 4, 't')].join('\n')]);
    expect(nextFree(items)).toBe('Katharsis codes continue, never restart. Next free: F10  AT4  Q3  BB5  ZZ2');
  });

  test('is empty with no items', () => {
    expect(nextFree([])).toBe('');
  });
});
