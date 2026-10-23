// Tests that a question page's Copy answers text is what the drawer's send
// posts and that the prompt hook reads it the same way, and that a copy's
// fallback never runs once the other path has settled or a later copy has
// started, run by
// `claude plugin test .`. assets/pages/katharsis.js sets KatharsisPage on the
// global object when it loads with no document, which is how this file loads it.

import { describe, expect, test } from 'claude-code/testing';
import '../assets/pages/katharsis.js';
import { readAnswers } from '../hooks/answers';
import type { Round } from '../hooks/answers';
import { answerText } from '../hooks/drawer.tsx';

type Pick = { code: string; letter: string };
type CopyIO = {
  clipboard: { writeText(text: string): Promise<void> } | undefined;
  legacy(text: string): boolean;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
};
const page = (
  globalThis as unknown as {
    KatharsisPage: {
      answerLines(q: Pick[]): string;
      copy(text: string, io: CopyIO, done: (ok: boolean) => void): void;
    };
  }
).KatharsisPage;

// What the drawer's queue send posts for the same picks with no notes.
function drawerSend(picks: Pick[]): string {
  return picks
    .filter((p) => p.letter !== '')
    .map((p) => answerText(p.code, p.letter, ''))
    .join('\n');
}

const ROUND: Round = [
  { code: 'Q12', options: ['a', 'b', 'c'] },
  { code: 'Q13', options: ['a', 'b', 'c'] },
  { code: 'Q14', options: ['a', 'b'] },
];
const ASKED = new Map(ROUND.map((q) => [q.code, q.options]));

describe('question page copy text', () => {
  test('two picks match the drawer send and read as two coded answers', () => {
    const picks = [
      { code: 'Q12', letter: 'b' },
      { code: 'Q13', letter: 'c' },
    ];
    const text = page.answerLines(picks);
    expect(text).toBe('Q12 b\nQ13 c');
    expect(text).toBe(drawerSend(picks));
    expect(readAnswers(text, ROUND, ASKED)).toEqual({
      answers: [
        { code: 'Q12', letter: 'b', how: 'code' },
        { code: 'Q13', letter: 'c', how: 'code' },
      ],
      unclear: [],
    });
  });

  test('an unanswered question in the middle is left out', () => {
    const picks = [
      { code: 'Q12', letter: 'a' },
      { code: 'Q13', letter: '' },
      { code: 'Q14', letter: 'b' },
    ];
    const text = page.answerLines(picks);
    expect(text).toBe('Q12 a\nQ14 b');
    expect(text).toBe(drawerSend(picks));
    expect(readAnswers(text, ROUND, ASKED)).toEqual({
      answers: [
        { code: 'Q12', letter: 'a', how: 'code' },
        { code: 'Q14', letter: 'b', how: 'code' },
      ],
      unclear: [],
    });
  });

  test('no picks copy nothing', () => {
    const picks = [
      { code: 'Q12', letter: '' },
      { code: 'Q13', letter: '' },
    ];
    expect(page.answerLines(picks)).toBe('');
    expect(drawerSend(picks)).toBe('');
  });
});

// A stubbed clipboard whose writeText calls settle only when the test says,
// timers that fire only when the test says, and a legacy path that records
// what it copied.
function stubs() {
  const writes: { resolve(): void; reject(): void }[] = [];
  const timers = new Map<number, () => void>();
  const legacy: string[] = [];
  const done: boolean[] = [];
  let next = 1;
  let legacyWorks = true;
  const io: CopyIO = {
    clipboard: {
      writeText: () =>
        new Promise<void>((resolve, reject) => {
          writes.push({ resolve, reject: () => reject(new Error('denied')) });
        }),
    },
    legacy: (text) => {
      legacy.push(text);
      return legacyWorks;
    },
    setTimeout: (fn) => {
      timers.set(next, fn);
      return next++;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
  };
  function fireTimers() {
    const pending = [...timers.values()];
    timers.clear();
    for (const fn of pending) fn();
  }
  const tick = () => Promise.resolve().then(() => undefined);
  const failLegacy = () => {
    legacyWorks = false;
  };
  return { io, writes, legacy, done, fireTimers, tick, failLegacy };
}

describe('question page copy', () => {
  test('a resolved Clipboard API write never runs the fallback later', async () => {
    const s = stubs();
    page.copy('Q12 a', s.io, (ok) => s.done.push(ok));
    s.writes[0].resolve();
    await s.tick();
    s.fireTimers();
    expect(s.legacy).toEqual([]);
    expect(s.done).toEqual([true]);
  });

  test('an earlier copy still pending never falls back over a later one', async () => {
    const s = stubs();
    page.copy('Q12 a', s.io, (ok) => s.done.push(ok));
    page.copy('Q12 b', s.io, (ok) => s.done.push(ok));
    s.writes[1].resolve();
    await s.tick();
    s.fireTimers();
    s.writes[0].resolve();
    await s.tick();
    expect(s.legacy).toEqual([]);
    expect(s.done).toEqual([true]);
  });

  test('an earlier copy that rejects after a later one started stays silent', async () => {
    const s = stubs();
    page.copy('Q12 a', s.io, (ok) => s.done.push(ok));
    page.copy('Q12 b', s.io, (ok) => s.done.push(ok));
    s.writes[0].reject();
    await s.tick();
    s.writes[1].resolve();
    await s.tick();
    expect(s.legacy).toEqual([]);
    expect(s.done).toEqual([true]);
  });

  test('an API write that succeeds after a failed fallback reports success', async () => {
    const s = stubs();
    s.failLegacy();
    page.copy('Q12 a', s.io, (ok) => s.done.push(ok));
    s.fireTimers();
    expect(s.done).toEqual([false]);
    s.writes[0].resolve();
    await s.tick();
    expect(s.legacy).toEqual(['Q12 a']);
    expect(s.done).toEqual([false, true]);
  });

  test('a write that never settles falls back once at the timeout', async () => {
    const s = stubs();
    page.copy('Q12 a', s.io, (ok) => s.done.push(ok));
    s.fireTimers();
    s.writes[0].reject();
    await s.tick();
    expect(s.legacy).toEqual(['Q12 a']);
    expect(s.done).toEqual([true]);
  });

  test('a rejected write falls back once and the timer adds nothing', async () => {
    const s = stubs();
    page.copy('Q12 a', s.io, (ok) => s.done.push(ok));
    s.writes[0].reject();
    await s.tick();
    s.fireTimers();
    expect(s.legacy).toEqual(['Q12 a']);
    expect(s.done).toEqual([true]);
  });

  test('no Clipboard API uses the fallback at once', () => {
    const s = stubs();
    s.io.clipboard = undefined;
    page.copy('Q12 a', s.io, (ok) => s.done.push(ok));
    expect(s.legacy).toEqual(['Q12 a']);
    expect(s.done).toEqual([true]);
  });
});
