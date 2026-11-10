// Tests for hooks/style.ts, run by `claude plugin test .`. The cases are
// how an outputStyle value stands for Katharsis given the style the engine
// resolved: qualified names on without asking, other styles off, a bare name
// or another spelling of one on only when the engine loaded a style by that
// name or the qualified style, or cannot say, and the qualified name each
// spelling means.

import { describe, expect, test } from 'claude-code/testing';
import { qualifiedFor, styleState } from '../hooks/style.ts';

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
      ['Katharsis', 'Katharsis coding'],
      ['Katharsis coding', 'Katharsis'],
    ];
    const states = await Promise.all(cases.map(([style, name]) => styleState(style, async () => name)));
    expect(states).toEqual(['unloaded', 'on', 'on', 'on', 'on', 'unloaded', 'unloaded']);
  });

  test('another case or spaces around a Katharsis name is checked as a bare name is', async () => {
    const styles = ['katharsis', ' Katharsis ', 'KATHARSIS CODING', 'Katharsis:katharsis'];
    const unloaded = await Promise.all(styles.map((s) => styleState(s, async () => null)));
    const loaded = await Promise.all(styles.map((s) => styleState(s, async () => s)));
    expect({ unloaded, loaded }).toEqual({ unloaded: ['unloaded', 'unloaded', 'unloaded', 'unloaded'], loaded: ['on', 'on', 'on', 'on'] });
  });
});

describe('qualifiedFor', () => {
  test('each spelling of a Katharsis name means its qualified style, and any other value none', () => {
    const named = ['Katharsis', ' katharsis', 'katharsis:katharsis coding', 'Katharsis coding', 'Concise', 'Katharsis2'].map(qualifiedFor);
    expect(named).toEqual(['katharsis:Katharsis', 'katharsis:Katharsis', 'katharsis:Katharsis coding', 'katharsis:Katharsis coding', undefined, undefined]);
  });
});
