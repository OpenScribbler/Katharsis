// Tests for hooks/style.ts, run by `claude plugin test .`. The cases are
// how an outputStyle value stands for Katharsis given the style the engine
// resolved: qualified names on without asking, other styles off, and a bare
// name on only when the engine loaded a style by that name or cannot say.

import { describe, expect, test } from 'claude-code/testing';
import { styleState } from '../hooks/style.ts';

describe('styleState', () => {
  test('qualified names are on and other styles off, without asking the engine', async () => {
    const never = async (): Promise<string | null> => {
      throw new Error('asked the engine');
    };
    const states = await Promise.all(['katharsis:Katharsis', 'katharsis:Katharsis coding', 'Concise', undefined, 3].map((s) => styleState(s, never)));
    expect(states).toEqual(['on', 'on', 'off', 'off', 'off']);
  });

  test('a bare name is on only when the engine loaded a style by that name or the qualified style, or gave no answer', async () => {
    const cases: [string, string | null | undefined][] = [
      ['Katharsis', null],
      ['Katharsis', 'katharsis:Katharsis'],
      ['Katharsis', 'Katharsis'],
      ['Katharsis coding', 'Katharsis coding'],
      ['Katharsis coding', undefined],
    ];
    const states = await Promise.all(cases.map(([style, name]) => styleState(style, async () => name)));
    expect(states).toEqual(['unloaded', 'on', 'on', 'on', 'on']);
  });
});
