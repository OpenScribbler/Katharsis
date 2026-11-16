// Tests for hooks/links.ts: which terminals show a link, and the codes in a reply as links, run by `claude plugin test .`.

import { describe, expect, test } from 'claude-code/testing';
import { linkify, terminalShowsLinks } from '../hooks/links.ts';

describe('terminalShowsLinks', () => {
  test('follows Claude Code 2.1.301 on each terminal it names', () => {
    const cases: [Record<string, string>, boolean][] = [
      [{ TERM_PROGRAM: 'herdr' }, false],
      [{}, false],
      [{ TERM_PROGRAM: 'ghostty' }, true],
      [{ LC_TERMINAL: 'iTerm2' }, true],
      [{ WT_SESSION: '' }, true],
      [{ TERM_PROGRAM: 'tmux', TERM_PROGRAM_VERSION: '3.4' }, true],
      [{ TERM_PROGRAM: 'tmux', TERM_PROGRAM_VERSION: '3.3a' }, false],
      [{ TERM_PROGRAM: 'vscode', TERM_PROGRAM_VERSION: '1.71.0' }, false],
      [{ TERM_PROGRAM: 'vscode', TERM_PROGRAM_VERSION: '1.72.0' }, true],
      [{ VTE_VERSION: '0.50.0' }, false],
      [{ VTE_VERSION: '7602' }, true],
      [{ TERM: 'xterm-kitty' }, true],
      [{ TERM_PROGRAM: 'ghostty', FORCE_HYPERLINK: '0' }, false],
      [{ TERM_PROGRAM: 'herdr', FORCE_HYPERLINK: '1' }, true],
      [{ TERM_PROGRAM: 'ghostty', CI: 'true' }, true],
      // Claude Code answers from supports-hyperlinks alone once the variable is set, even empty.
      [{ TERM_PROGRAM: 'tmux', TERM_PROGRAM_VERSION: '3.4', FORCE_HYPERLINK: '' }, false],
    ];
    expect(cases.map(([env]) => terminalShowsLinks(env))).toEqual(cases.map(([, want]) => want));
  });
});

describe('linkify', () => {
  test('a shorter fence inside a longer one stays inside it, so no code there becomes a link', () => {
    const items = [{ code: 'MV1', prefix: 'MV', n: 1 }] as Parameters<typeof linkify>[1];
    const text = ['````', '```', 'echo MV1', '```', 'echo MV1', '````', 'Per MV1.'].join('\n');
    const out = linkify(text, items);
    expect(out.text.split('\n').slice(0, 6)).toEqual(['````', '```', 'echo MV1', '```', 'echo MV1', '````']);
    expect(out.text.split('\n')[6]).toMatch(/^Per \[MV1\]\(/);
  });

  test('a fence line with an info string closes nothing, so a code after it stays unlinked', () => {
    const items = [{ code: 'MV1', prefix: 'MV', n: 1 }] as Parameters<typeof linkify>[1];
    const text = ['```', '```js', 'echo MV1', '```', 'Per MV1.'].join('\n');
    const out = linkify(text, items).text.split('\n');
    expect(out.slice(0, 4)).toEqual(['```', '```js', 'echo MV1', '```']);
    expect(out[4]).toMatch(/^Per \[MV1\]\(/);
  });

  test('a backtick fence inside a tilde one closes nothing, so a code after it stays unlinked', () => {
    const items = [{ code: 'MV1', prefix: 'MV', n: 1 }] as Parameters<typeof linkify>[1];
    const text = ['~~~', '```', 'echo MV1', '~~~', 'Per MV1.'].join('\n');
    const out = linkify(text, items).text.split('\n');
    expect(out.slice(0, 4)).toEqual(['~~~', '```', 'echo MV1', '~~~']);
    expect(out[4]).toMatch(/^Per \[MV1\]\(/);
  });
});
