// Tests for hooks/ledger.ts, run by `claude plugin test .`. The cases are the
// supersede rule, the chain walk, the next-free line's order, and the folder
// and text filters kref uses, and the heading each code groups under.

import { describe, expect, test } from 'claude-code/testing';
import { below, itemsOf, nextFree, search, sectionOf, thread, type Io, type Item, type SessionInfo } from '../hooks/ledger.ts';

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

describe('below', () => {
  const s = (id: string, cwd: string | undefined, updated: string): SessionInfo => ({ id, cwd, updated, codes: 1 });
  const all = [
    s('old', '/work/app', '2026-09-01'),
    s('new', '/work/app/', '2026-09-03'),
    s('sub', '/work/app/web', '2026-09-02'),
    s('sibling', '/work/apps', '2026-09-04'),
    s('nowhere', undefined, '2026-09-05'),
  ];

  test('keeps the folder and its subfolders, newest first, ignoring a trailing slash', () => {
    expect(below(all, '/work/app/').map((x) => x.id)).toEqual(['new', 'sub', 'old']);
  });

  test('never counts a sibling whose name only starts the same', () => {
    expect(below(all, '/work/app').map((x) => x.id)).toEqual(['new', 'sub', 'old']);
  });

  test('the root folder holds every session that has a folder', () => {
    expect(below(all, '/').map((x) => x.id)).toEqual(['sibling', 'new', 'sub', 'old']);
  });
});

describe('search', () => {
  const item = (code: string, title: string, summary = '', options: string[] = []): Item => ({
    code, prefix: code.replace(/\d+$/, ''), n: 1, known: true, ts: '', title, summary,
    options: options.map((text, i) => ({ key: String.fromCharCode(97 + i), text })), rec: '', session: '', section: '',
  });
  const items = [item('F1', 'Keytab expired'), item('F2', 'other', 'the KEYTAB path'), item('Q1', 'pick', '', ['renew the keytab']), item('F3', 'unrelated')];

  test('matches title, body, and option text, ignoring case', () => {
    expect(search(items, 'keytab').map((i) => i.code)).toEqual(['F1', 'F2', 'Q1']);
  });

  test('treats regex characters as literal text', () => {
    expect(search([...items, item('F4', 'a.*b')], '.*').map((i) => i.code)).toEqual(['F4']);
  });
});

describe('sectionOf', () => {
  const item = (prefix: string, section: string) => ({ prefix, section }) as Item;

  test('a standard prefix takes its own heading, whatever the record says', () => {
    expect(sectionOf(item('f', 'Custom'))).toBe('Findings');
  });

  test('an invented prefix takes the heading it was written under, else Other codes', () => {
    expect(sectionOf(item('ZZ', ' Custom section '))).toBe('Custom section');
    expect(sectionOf(item('ZZ', '  '))).toBe('Other codes');
  });
});
