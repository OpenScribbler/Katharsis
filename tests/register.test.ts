// Tests for hooks/register.ts, run by `claude plugin test .` with
// CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1. Each test stands beneath the plugin
// and answers the nouns it reaches (settings, session id, env, fs, process)
// from memory, then submits a prompt through the engine and reads the context
// the plugin attached. The cases mirror tests/test-turn-reminder.sh: silent
// for any style but Katharsis (the engine's own attachment names the active
// style), two classify lines for Katharsis, the inherited stamp on an untyped
// turn, the chain link, the marker's life, and the model note.

import { describe, expect, mock, test } from 'claude-code/testing';
import type { Engine } from 'claude-code/testing';
import type { On, PromptOrigin } from 'claude-code';

type World = {
  settings: Record<string, unknown>;
  files: Map<string, string>;
  runs: string[][];
  krefLine: string;
  model: string;
  noteBody: string;
};

const SID = 's9';
const DATA = '/data';

function world(on: On, settings: Record<string, unknown>, files: Record<string, string> = {}): World {
  const w: World = { settings, files: new Map(Object.entries(files)), runs: [], krefLine: '', model: '', noteBody: '' };
  mock.env(on, { HOME: '/home/u', KATHARSIS_DATA: DATA });
  on('settings.read', () => ({ value: w.settings }));
  on('session.id', () => ({ value: SID }));
  on('session.model', () => ({ value: w.model }));
  // A model note answers at any plugin root, since the engine picks the root.
  const isNote = (p: string) => w.noteBody !== '' && p.endsWith('/styles/models/opus.md');
  on('fs.exists', (_$, e) => ({ value: w.files.has(e.path) || isNote(e.path) }));
  on('fs.read', (_$, e) => {
    if (isNote(e.path)) return { value: w.noteBody };
    const text = w.files.get(e.path);
    if (text === undefined) throw new Error(`ENOENT ${e.path}`);
    return { value: text };
  });
  on('fs.write', (_$, e) => {
    w.files.set(e.path, e.text);
    return { value: undefined };
  });
  on('process.run', (_$, e) => {
    const argv = [...e.argv];
    w.runs.push(argv);
    if (argv[0] === 'rm') {
      for (const p of argv.slice(2)) w.files.delete(p);
      return { value: { exitCode: 0, stdout: '', stderr: '' } };
    }
    return { value: { exitCode: 0, stdout: w.krefLine ? `${w.krefLine}\n` : '', stderr: '' } };
  });
  on('env.set', () => ({ value: undefined }));
  // The bottom of the chain: echo what the plugin passed down, so the test
  // reads the context it attached.
  on('prompt.submit', (_$, e) => ({ text: e.text, context: e.context, origin: e.origin }));
  return w;
}

async function submit($: Engine, text: string, origin: PromptOrigin = { kind: 'composer' }): Promise<string[]> {
  const r = await $.prompt.submit({ text, wait: false, origin });
  if ('drop' in r) throw new Error(`dropped: ${r.drop}`);
  return [...(r.context ?? [])];
}

function lines(context: string[]): string[] {
  return context.flatMap((c) => c.split('\n')).filter((l) => l.trim());
}

describe('reminder', () => {
  test('a built-in style attaches nothing', async ($, on) => {
    world(on, { outputStyle: 'Concise' });
    expect(lines(await submit($, 'x'))).toEqual([]);
  });

  test('no style attaches nothing', async ($, on) => {
    world(on, {});
    expect(lines(await submit($, 'x'))).toEqual([]);
  });

  test('another custom style attaches nothing and gets no marker', async ($, on) => {
    const w = world(on, { outputStyle: 'Foo Style' });
    expect(lines(await submit($, 'x'))).toEqual([]);
    expect(w.files.has(`${DATA}/.active-${SID}`)).toBe(false);
  });

  for (const name of ['Katharsis', 'katharsis:Katharsis', 'Katharsis coding', 'katharsis:Katharsis coding']) {
    test(`${name} gets the two classify lines and the marker`, async ($, on) => {
      const w = world(on, { outputStyle: name });
      const out = lines(await submit($, 'x'));
      expect(out.length).toBe(2);
      expect(out[0]).toContain('~/.claude/katharsis/styles/');
      expect(out[1]).toContain('Verification section');
      expect(w.files.has(`${DATA}/.active-${SID}`)).toBe(true);
    });
  }

  test('the counter line is appended when kref answers', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' });
    w.krefLine = 'Katharsis codes continue, never restart. Next free: F4  Q2';
    const out = lines(await submit($, 'x'));
    expect(out.length).toBe(3);
    expect(out[2]).toBe(w.krefLine);
    const kref = w.runs.find((r) => r[0] === 'bash');
    expect(kref?.[2]).toBe('--next');
  });

  test('switching to a built-in style removes the marker', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' });
    await submit($, 'x');
    expect(w.files.has(`${DATA}/.active-${SID}`)).toBe(true);
    w.settings = { outputStyle: 'default' };
    await submit($, 'y');
    expect(w.files.has(`${DATA}/.active-${SID}`)).toBe(false);
  });
});

describe('untyped turns', () => {
  const last = `${DATA}/.exchange-last-${SID}`;
  const stamp = `${DATA}/.exchange-state-${SID}`;

  test('a task notification inherits the last type and is stamped', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' }, { [last]: '2026-09-21T00:00:00Z\twork-request\t\n' });
    const out = lines(await submit($, 'Agent finished', { kind: 'task-notification' }));
    expect(out.length).toBe(1);
    expect(out[0]).toContain('Untyped turn (task-notification)');
    expect(out[0]).toContain('`work-request`');
    expect(w.files.get(stamp)?.split('\t').slice(1)).toEqual(['work-request', 'inherited\n']);
  });

  test('a skill load from the composer is untyped by its text', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' }, { [last]: 'ts\tdiagnosis\t\n' });
    const out = lines(await submit($, '<command-name>/punt</command-name>'));
    expect(out[0]).toContain('Untyped turn (skill)');
    expect(w.files.get(stamp)).toContain('\tdiagnosis\tinherited');
  });

  test('an untyped turn with no earlier type asks for status-and-resume', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' });
    const out = lines(await submit($, 'x', { kind: 'scheduled-trigger' }));
    expect(out[0]).toContain('no earlier type');
    expect(out[0]).toContain('`status-and-resume`');
    expect(w.files.has(stamp)).toBe(false);
  });

  test('a typed turn is never stamped by the module', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' }, { [last]: 'ts\tdiagnosis\t\n' });
    await submit($, 'why does this fail?');
    expect(w.files.has(stamp)).toBe(false);
  });
});

describe('handoff chain', () => {
  test('a punt file naming a parent links the chain', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' }, { '/tmp/punt-abc123.md': '# Punt\nLedger parent: parent-77\n' });
    await submit($, 'read /tmp/punt-abc123.md and continue');
    expect(w.files.get(`${DATA}/ledger/chains/${SID}`)).toBe('parent-77\n');
  });

  test('a punt file naming this session links nothing', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' }, { '/tmp/punt-abc123.md': `Ledger parent: ${SID}\n` });
    await submit($, 'read /tmp/punt-abc123.md');
    expect(w.files.has(`${DATA}/ledger/chains/${SID}`)).toBe(false);
  });

  test('a missing punt file links nothing', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' });
    await submit($, 'read /tmp/punt-gone.md');
    expect(w.files.has(`${DATA}/ledger/chains/${SID}`)).toBe(false);
  });
});

describe('model note', () => {
  const NOTE = 'Model note for Opus. test body';
  const withNote = (on: On) => {
    const w = world(on, { outputStyle: 'Katharsis' }, {});
    w.noteBody = NOTE;
    return w;
  };

  test('the family note goes out once, then again after a compaction', async ($, on) => {
    const w = withNote(on);
    w.model = 'claude-opus-5-5';
    expect(lines(await submit($, 'x'))).toContain(NOTE);
    expect(w.files.get(`${DATA}/.model-${SID}`)).toBe('opus\n');
    expect(lines(await submit($, 'y'))).not.toContain(NOTE);
    const resumed = lines(await submit($, 'This session is being continued from a previous conversation'));
    expect(resumed).toContain(NOTE);
  });

  test('an unknown model sends no note', async ($, on) => {
    const w = withNote(on);
    w.model = 'some-other-model';
    expect(lines(await submit($, 'x')).length).toBe(2);
  });
});
