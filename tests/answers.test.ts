// Tests for hooks/answers.ts, run by `claude plugin test .`. The cases are
// the answer formats people type after a Questions round, the readings the
// parser must hand to the model instead of guessing, and the messages that
// must answer nothing.

import { describe, expect, test } from 'claude-code/testing';
import { answeredOf, closersOf, latestRound, openQuestions, readAnswers } from '../hooks/answers';
import type { Round } from '../hooks/answers';

const R12: Round = [
  { code: 'Q1', options: ['a', 'b'] },
  { code: 'Q2', options: ['a', 'b', 'c'] },
];
const R34: Round = [
  { code: 'Q3', options: ['a', 'b'] },
  { code: 'Q4', options: ['a', 'b', 'c'] },
];
const R5: Round = [{ code: 'Q5', options: ['a', 'b', 'c'] }];
const ASKED = new Map([
  ['Q1', ['a', 'b']],
  ['Q2', ['a', 'b', 'c']],
  ['Q3', ['a', 'b']],
  ['Q4', ['a', 'b', 'c']],
  ['Q5', ['a', 'b', 'c']],
]);

const read = (msg: string, round: Round) => readAnswers(msg, round, ASKED);
const picks = (msg: string, round: Round) => read(msg, round).answers.map((a) => `${a.code} ${a.letter || '-'} ${a.how}`);

describe('readAnswers', () => {
  const cases: [string, Round, string[]][] = [
    // The formats tab completion and people write.
    ['1. a, 2. b', R12, ['Q1 a number', 'Q2 b number']],
    ['1. a - I hlakdsflaksdjf', R12, ['Q1 a number']],
    ['1a 2b', R12, ['Q1 a number', 'Q2 b number']],
    ['1a\n2a', R12, ['Q1 a number', 'Q2 a number']],
    ['2. a I don\'t really care about the old version', R12, ['Q2 a number']],
    ['2. a - I don\'t really care', R12, ['Q2 a number']],
    ['3.a; 4.c', R34, ['Q3 a number', 'Q4 c number']],
    ['3) a', R34, ['Q3 a number']],
    ['3 - b', R34, ['Q3 b number']],
    ['sounds good; 4 b', R34, ['Q4 b number']],
    // An explicit code, in any case and with any separator.
    ['Q3: b', R34, ['Q3 b code']],
    ['q4=c', R34, ['Q4 c code']],
    ['Q3a', R34, ['Q3 a code']],
    ['q1 b', R34, ['Q1 b code']],
    // A numbered line of prose answers that question in prose.
    ['3. I fixed it in Jira', R34, ['Q3 - prose']],
    ['Q4. do whatever is cheaper', R34, ['Q4 - prose']],
    // A letter the question lacks, followed by words, is the first word of prose.
    ['3 I think so', R34, ['Q3 - prose']],
    // z on any question is an answer of the user's own.
    ['Q3 z - neither, keep both', R34, ['Q3 z own']],
    ['4z', R34, ['Q4 z own']],
    // x, or the word dismiss or cancel, dismisses the question.
    ['Q3 x', R34, ['Q3 x dismissed']],
    ['4x', R34, ['Q4 x dismissed']],
    ['Q3 dismiss', R34, ['Q3 x dismissed']],
    ['q4 dismissed - no longer matters', R34, ['Q4 x dismissed']],
    ['3. cancel', R34, ['Q3 x dismissed']],
    ['Q3 cancelled', R34, ['Q3 x dismissed']],
    ['1a, 2 dismiss', R12, ['Q1 a number', 'Q2 x dismissed']],
    ['Q3 dismissive of it', R34, []],
    ['Q3 x-axis labels are wrong', R34, []],
    ['Q3 x is undefined there', R34, ['Q3 - prose']],
    ['3. Cancel the nightly build', R34, ['Q3 - prose']],
    ['Also, 4 dismiss events fired', R34, ['Q4 - prose']],
    // A bare number past the round naming an earlier question answers it.
    ['2 a\n3 a - the code has it\n4 a', R5, ['Q2 a number', 'Q3 a number', 'Q4 a number']],
    ['3 x', R5, ['Q3 x dismissed']],
    ['2. Fix the tests', R5, []],
    ['2. A large file was found', R5, []],
    ['2. Cancel the nightly build', R5, []],
    ['Yes, 3 cancel buttons were added', R5, []],
    ['3 x is undefined', R5, []],
    ['3 c', R5, []],
    // The first answer to a question wins.
    ['1a\n1b', R12, ['Q1 a number']],
    // Nothing to answer.
    ['I merged 2 a while ago', R12, []],
    ['ok. 3 a', R34, []],
    ['6 a', R12, []],
    ['q9 a', R12, []],
    ['go ahead', R12, []],
  ];
  for (const [msg, round, want] of cases) {
    test(JSON.stringify(msg), () => {
      expect(picks(msg, round)).toEqual(want);
    });
  }

  test('x dismisses even a question that offers an option x', () => {
    const r = readAnswers('Q7 x', [{ code: 'Q7', options: ['w', 'x'] }], new Map([['Q7', ['w', 'x']]]));
    expect(r.answers).toEqual([{ code: 'Q7', letter: 'x', how: 'dismissed' }]);
  });

  test('a number outside the round is read by position and left for the model to confirm', () => {
    const r = read('1. a, 2. b', R34);
    expect(r.answers).toEqual([]);
    expect(r.unclear).toEqual([
      { code: 'Q3', letter: 'a', said: '1. a', why: 'position' },
      { code: 'Q4', letter: 'b', said: '2. b', why: 'position' },
    ]);
  });

  test('a numbered prose line outside the round is never read by position', () => {
    expect(read('1. Fix the tests\n2. Update the docs', R34)).toEqual({ answers: [], unclear: [] });
  });

  test('a letter the question does not offer is left for the model to ask about', () => {
    expect(read('3 c', R34)).toEqual({ answers: [], unclear: [{ code: 'Q3', letter: 'c', said: '3 c', why: 'option' }] });
    expect(read('q1 d', R34).unclear.map((u) => u.code)).toEqual(['Q1']);
  });
});

type Q = { code: string; prefix: string; n: number; ts: string; title: string; summary: string; options: { key: string }[] };
const T1 = '2026-09-23T10:00:00+00:00';
const T2 = '2026-09-23T11:00:00+00:00';
const T3 = '2026-09-23T12:00:00+00:00';
const item = (code: string, ts: string, title = '', options: string[] = []): Q => {
  const m = code.match(/^([A-Z-]+)(\d+)$/)!;
  return { code, prefix: m[1]!, n: Number(m[2]), ts, title, summary: '', options: options.map((key) => ({ key })) };
};

describe('latestRound', () => {
  test('is the questions the newest reply with a round wrote, in number order', () => {
    const items = [item('Q1', T1, '', ['a']), item('Q3', T2, '', ['A', 'B']), item('Q2', T2, '', ['a']), item('F1', T3)];
    expect(latestRound(items)).toEqual([
      { code: 'Q2', options: ['a'] },
      { code: 'Q3', options: ['a', 'b'] },
    ]);
  });

  test('is empty with no questions on record', () => {
    expect(latestRound([item('F1', T1)])).toEqual([]);
  });
});

describe('openQuestions', () => {
  test('drops answered questions and keeps every other one, however many', () => {
    const items = [item('Q1', T1), item('Q2', T1), item('Q3', T2), item('Q4', T2)];
    expect(openQuestions(items, new Map()).map((q) => q.code)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(openQuestions(items, new Map([['Q4', 'a']])).map((q) => q.code)).toEqual(['Q1', 'Q2', 'Q3']);
  });

  test('a later action-taken line citing a question settles it', () => {
    const items = [item('Q1', T1), item('Q2', T1), item('AT1', T2, 'shipped the fix, per Q1')];
    expect(openQuestions(items, new Map()).map((q) => q.code)).toEqual(['Q2']);
  });

  test('a citation must be the whole code, and later than the question', () => {
    const items = [item('Q1', T2), item('AT1', T1, 'per Q1'), item('AT2', T3, 'per Q12 and XQ1')];
    expect(openQuestions(items, new Map()).map((q) => q.code)).toEqual(['Q1']);
  });
});

describe('answeredOf', () => {
  test('names every code in the files with its latest letter, skipping blank and partial lines', () => {
    const texts = ['{"code":"q1","letter":"a"}\n\n{"code":', '{"code":"Q3","letter":""}\n{"code":"Q1","letter":"b"}\n'];
    expect([...answeredOf(texts)]).toEqual([['Q1', 'b'], ['Q3', '']]);
  });
});

describe('closersOf', () => {
  test('a later verification line settles a question too', () => {
    const items = [item('Q1', T1), item('V1', T2, 'checked it, per Q1')];
    expect(openQuestions(items, new Map())).toEqual([]);
    expect(closersOf(items, new Map([['Q1', 'b']])).get('Q1')).toEqual({ letter: 'b', by: 'V1', prefix: 'V', title: 'checked it, per Q1' });
  });

  test('owed work closes on a later action or check, never on another finding', () => {
    const items = [item('NA1', T1), item('MV1', T1), item('W1', T1), item('F2', T2, 'NA1 and MV1 matter'), item('AT1', T2, 'did W1'), item('V1', T3, 'ran NA1')];
    const closed = closersOf(items, new Map());
    expect([...closed.keys()].sort()).toEqual(['NA1', 'W1']);
    expect(closed.get('NA1')?.by).toBe('V1');
  });

  test('an exclusion line drops owed work, and a question stays open under one', () => {
    const items = [item('NA1', T1), item('MV1', T1), item('Q1', T1), item('X1', T2, 'NA1 and Q1 no longer needed'), item('X2', T2, 'skipping MV1')];
    const closed = closersOf(items, new Map());
    expect([...closed.keys()].sort()).toEqual(['MV1', 'NA1']);
    expect(closed.get('NA1')).toEqual({ letter: '', by: 'X1', prefix: 'X', title: 'NA1 and Q1 no longer needed' });
  });

  test('a block or a risk closes on any later coded line, the first one winning', () => {
    const items = [item('B1', T1), item('R1', T1), item('F1', T1), item('S1', T2, 'B1 cleared: access granted'), item('F2', T2, 'R1 removed'), item('AT1', T3, 'per R1 and F1')];
    const closed = closersOf(items, new Map());
    expect(closed.get('B1')?.by).toBe('S1');
    expect(closed.get('R1')).toEqual({ letter: '', by: 'F2', prefix: 'F', title: 'R1 removed' });
    expect(closed.has('F1')).toBe(false);
  });
});
