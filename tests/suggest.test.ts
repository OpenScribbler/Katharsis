// Tests for hooks/suggest.ts, run by `claude plugin test .`. The cases are
// the recommendation's letter, which answers count toward the rate, and the
// two thresholds.

import { describe, expect, test } from 'claude-code/testing';
import type { Io } from '../hooks/ledger.ts';
import { agreement, recLetter, SUGGEST_MIN, suggestsStandard } from '../hooks/suggest.ts';

function io(files: Record<string, string>): Io {
  return {
    read: async (p) => files[p] ?? null,
    list: async (dir) => {
      const names = new Map<string, string>();
      for (const k of Object.keys(files)) {
        if (!k.startsWith(`${dir}/`)) continue;
        const rest = k.slice(dir.length + 1);
        names.set(rest.split('/')[0] ?? '', rest.includes('/') ? 'dir' : 'file');
      }
      return [...names].map(([name, kind]) => ({ name, kind }));
    },
  };
}

const q = (sid: string, code: string, rec: string, options: string[] = []) =>
  JSON.stringify({ ts: 't', session_id: sid, code, prefix: 'Q', n: Number(code.slice(1)), title: code, summary: '', options: options.map((key) => ({ key, text: key })), rec });
const ans = (code: string, letter: string, ts = 't', how = 'code') => JSON.stringify({ ts, code, letter, how });

describe('recLetter', () => {
  test('reads the letter a recommendation opens with, in either case and inside bold', () => {
    expect(['a - why', 'B. why', '**c** - why', 'a', 'about this', ''].map(recLetter)).toEqual(['a', 'b', 'c', 'a', '', '']);
  });

  test('reads no letter from a word that opens the line', () => {
    expect(['A cleaner fix - b', "I'd take b", 'a because b'].map(recLetter)).toEqual(['', '', '']);
  });
});

describe('agreement', () => {
  test('a dismissal and a question with no recommendation count for neither side; z, prose and another letter count as not taken', async () => {
    const files = {
      '/d/ledger/x-p/s1.jsonl': [q('s1', 'Q1', 'a - why'), q('s1', 'Q2', 'b - why'), q('s1', 'Q3', 'a - why'), q('s1', 'Q4', ''), q('s1', 'Q5', 'a - why'), q('s1', 'Q6', 'a - why')].join('\n'),
      '/d/answers/s1.jsonl': [ans('Q1', 'a'), ans('Q2', 'B'), ans('Q3', 'x'), ans('Q4', 'a'), ans('Q5', 'z'), ans('Q6', '')].join('\n'),
    };
    expect(await agreement(io(files), '/d')).toEqual({ answered: 4, took: 2 });
  });

  test('a later answer to the same question replaces the earlier one', async () => {
    const files = {
      '/d/ledger/x-p/s1.jsonl': q('s1', 'Q1', 'a - why'),
      '/d/answers/s1.jsonl': [ans('Q1', 'b'), ans('Q1', 'a')].join('\n'),
    };
    expect(await agreement(io(files), '/d')).toEqual({ answered: 1, took: 1 });
  });

  // A question from a parent session, answered in both sessions of the
  // chain: the later answer counts, in either listing order.
  for (const order of ['parent first', 'child first']) {
    test(`across a handoff chain the latest answer counts once, ${order}`, async () => {
      const answers: Record<string, string> = { '/d/answers/p.jsonl': ans('Q1', 'a', 't1'), '/d/answers/c.jsonl': ans('Q1', 'b', 't2') };
      const keys = order === 'parent first' ? ['/d/answers/p.jsonl', '/d/answers/c.jsonl'] : ['/d/answers/c.jsonl', '/d/answers/p.jsonl'];
      const files: Record<string, string> = { '/d/ledger/chains/c': 'p\n', '/d/ledger/x-p/p.jsonl': q('p', 'Q1', 'a - why') };
      for (const k of keys) files[k] = answers[k]!;
      expect(await agreement(io(files), '/d')).toEqual({ answered: 1, took: 0 });
    });
  }

  test("a child session's dismissal removes the parent's earlier answer", async () => {
    const files = {
      '/d/ledger/chains/c': 'p\n',
      '/d/ledger/x-p/p.jsonl': q('p', 'Q1', 'a - why'),
      '/d/answers/p.jsonl': ans('Q1', 'a', 't1'),
      '/d/answers/c.jsonl': ans('Q1', 'x', 't2'),
    };
    expect(await agreement(io(files), '/d')).toEqual({ answered: 0, took: 0 });
  });

  // A parent's answer and a child's dismissal stamped the same second: the
  // child's wins in either listing order.
  for (const order of ['parent first', 'child first']) {
    test(`on equal stamps the later session's answer counts, ${order}`, async () => {
      const answers: Record<string, string> = { '/d/answers/p.jsonl': ans('Q1', 'a', 't1'), '/d/answers/c.jsonl': ans('Q1', 'x', 't1') };
      const keys = order === 'parent first' ? ['/d/answers/p.jsonl', '/d/answers/c.jsonl'] : ['/d/answers/c.jsonl', '/d/answers/p.jsonl'];
      const files: Record<string, string> = { '/d/ledger/chains/c': 'p\n', '/d/ledger/x-p/p.jsonl': q('p', 'Q1', 'a - why') };
      for (const k of keys) files[k] = answers[k]!;
      expect(await agreement(io(files), '/d')).toEqual({ answered: 0, took: 0 });
    });
  }

  // Past thread()'s cap of 20: a question asked and answered at the root,
  // or ten sessions in, and dismissed 24 sessions later.
  for (const at of [1, 10]) {
    test(`a chain longer than 20 sessions keys a question from session ${at} once`, async () => {
      const files: Record<string, string> = { [`/d/ledger/x-p/s${at}.jsonl`]: q(`s${at}`, 'Q1', 'a - why') };
      for (let i = 2; i <= 25; i++) files[`/d/ledger/chains/s${i}`] = `s${i - 1}\n`;
      files[`/d/answers/s${at}.jsonl`] = ans('Q1', 'a', 't1');
      files['/d/answers/s25.jsonl'] = ans('Q1', 'x', 't2');
      expect(await agreement(io(files), '/d')).toEqual({ answered: 0, took: 0 });
    });
  }

  test('a question the child session restated still counts once', async () => {
    const files = {
      '/d/ledger/chains/c': 'p\n',
      '/d/ledger/x-p/p.jsonl': q('p', 'Q1', 'a - why'),
      '/d/ledger/x-p/c.jsonl': JSON.stringify({ ...JSON.parse(q('c', 'Q1', 'a - why')), ts: 't9' }),
      '/d/answers/p.jsonl': ans('Q1', 'b', 't1'),
      '/d/answers/c.jsonl': ans('Q1', 'a', 't2'),
    };
    expect(await agreement(io(files), '/d')).toEqual({ answered: 1, took: 1 });
  });

  test('unrelated sessions that both answered Q1 count as two questions', async () => {
    const files = {
      '/d/ledger/x-p/s1.jsonl': q('s1', 'Q1', 'a - why'),
      '/d/ledger/x-p/s2.jsonl': q('s2', 'Q1', 'b - why'),
      '/d/answers/s1.jsonl': ans('Q1', 'a'),
      '/d/answers/s2.jsonl': ans('Q1', 'b'),
    };
    expect(await agreement(io(files), '/d')).toEqual({ answered: 2, took: 2 });
  });

  test("a recommendation that names none of the question's options counts for neither side", async () => {
    const files = {
      '/d/ledger/x-p/s1.jsonl': [q('s1', 'Q1', "I'd take b - why", ['a', 'b']), q('s1', 'Q2', 'b - why', ['a', 'b']), q('s1', 'Q3', 'c - why', ['a', 'b'])].join('\n'),
      '/d/answers/s1.jsonl': [ans('Q1', 'b'), ans('Q2', 'b'), ans('Q3', 'c')].join('\n'),
    };
    expect(await agreement(io(files), '/d')).toEqual({ answered: 1, took: 1 });
  });

  // The recorder writes z as an own answer only when the question offers no
  // option z; where it does, z is an ordinary pick.
  test('an own answer never counts as taken, and a picked option z does', async () => {
    const files = {
      '/d/ledger/x-p/s1.jsonl': [q('s1', 'Q1', 'z - why', ['y', 'z']), q('s1', 'Q2', 'z - why')].join('\n'),
      '/d/answers/s1.jsonl': [ans('Q1', 'z'), ans('Q2', 'z', 't', 'own')].join('\n'),
    };
    expect(await agreement(io(files), '/d')).toEqual({ answered: 2, took: 1 });
  });

  test('no answers directory gives nothing', async () => {
    expect(await agreement(io({}), '/d')).toEqual({ answered: 0, took: 0 });
  });
});

describe('suggestsStandard', () => {
  test('needs 50 answers and 70% of them taken', () => {
    expect(SUGGEST_MIN).toBe(50);
    expect(suggestsStandard({ answered: 50, took: 35 })).toBe(true);
    expect(suggestsStandard({ answered: 50, took: 34 })).toBe(false);
    expect(suggestsStandard({ answered: 49, took: 49 })).toBe(false);
  });
});
