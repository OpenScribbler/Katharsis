// Tests that a question page's Copy answers text is what the drawer's send
// posts and that the prompt hook reads it the same way, run by
// `claude plugin test .`. assets/pages/katharsis.js sets KatharsisPage on the
// global object when it loads with no document, which is how this file loads it.

import { describe, expect, test } from 'claude-code/testing';
import '../assets/pages/katharsis.js';
import { readAnswers } from '../hooks/answers';
import type { Round } from '../hooks/answers';
import { answerText } from '../hooks/drawer.tsx';

type Pick = { code: string; letter: string };
const page = (globalThis as unknown as { KatharsisPage: { answerLines(q: Pick[]): string } }).KatharsisPage;

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
