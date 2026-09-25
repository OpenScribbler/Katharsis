// Tests for hooks/register.ts, run by `claude plugin test .` with
// CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1. Each test stands beneath the plugin
// and answers the nouns it reaches (settings, session id, env, fs, process)
// from memory, then submits a prompt through the engine and reads the context
// the plugin attached. The cases: silent
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
  failWrite?: string;
  notes?: Record<string, string>;
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
  const noteOf = (p: string) => {
    const name = p.match(/\/styles\/models\/([^/]+)\.md$/)?.[1];
    if (!name) return undefined;
    if (w.notes && name in w.notes) return w.notes[name];
    return name === 'opus' && w.noteBody !== '' ? w.noteBody : undefined;
  };
  const isNote = (p: string) => noteOf(p) !== undefined;
  on('fs.exists', (_$, e) => ({
    value: w.files.has(e.path) || isNote(e.path) || [...w.files.keys()].some((k) => k.startsWith(`${e.path}/`)),
  }));
  on('fs.list', (_$, e) => {
    const dir = `${e.path}/`;
    const names = new Map<string, 'file' | 'dir'>();
    for (const k of w.files.keys()) {
      if (!k.startsWith(dir)) continue;
      const rest = k.slice(dir.length);
      names.set(rest.split('/')[0] ?? '', rest.includes('/') ? 'dir' : 'file');
    }
    return { value: [...names].map(([name, kind]) => ({ name, kind, size: 0, isLink: false })) };
  });
  on('fs.read', (_$, e) => {
    if (isNote(e.path)) return { value: noteOf(e.path) };
    const text = w.files.get(e.path);
    if (text === undefined) throw new Error(`ENOENT ${e.path}`);
    return { value: text };
  });
  on('fs.write', (_$, e) => {
    if (w.failWrite && e.path.includes(w.failWrite)) throw new Error(`EACCES ${e.path}`);
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

  test('the full model id is recorded for telemetry, known family or not', async ($, on) => {
    const w = withNote(on);
    w.model = 'claude-opus-5-5';
    await submit($, 'x');
    expect(w.files.get(`${DATA}/.model-id-${SID}`)).toBe('claude-opus-5-5\n');
    w.model = 'some-other-model';
    await submit($, 'y');
    expect(w.files.get(`${DATA}/.model-id-${SID}`)).toBe('some-other-model\n');
  });

  test('a version note wins over the family note, and the state names it', async ($, on) => {
    const w = withNote(on);
    w.notes = { 'opus-5-5': 'Model note for Opus 5.5.' };
    w.model = 'claude-opus-5-5-20260901';
    const got = lines(await submit($, 'x'));
    expect(got).toContain('Model note for Opus 5.5.');
    expect(got).not.toContain(NOTE);
    expect(w.files.get(`${DATA}/.model-${SID}`)).toBe('opus-5-5\n');
  });

  test('a version with no note of its own falls back to the family note', async ($, on) => {
    const w = withNote(on);
    w.notes = { 'opus-5-5': 'Model note for Opus 5.5.' };
    w.model = 'claude-opus-5';
    expect(lines(await submit($, 'x'))).toContain(NOTE);
    expect(w.files.get(`${DATA}/.model-${SID}`)).toBe('opus\n');
  });

  test('switching versions inside one family sends the new note', async ($, on) => {
    const w = withNote(on);
    w.notes = { 'opus-5-5': 'Model note for Opus 5.5.' };
    w.model = 'claude-opus-5';
    await submit($, 'x');
    w.model = 'claude-opus-5-5';
    expect(lines(await submit($, 'y'))).toContain('Model note for Opus 5.5.');
  });

  test('a date suffix is not read as a version', async ($, on) => {
    const w = withNote(on);
    w.notes = { 'opus-5': 'Model note for Opus 5.' };
    w.model = 'claude-opus-5-20250101';
    expect(lines(await submit($, 'x'))).toContain('Model note for Opus 5.');
  });

  test('a failed note lookup keeps every other line', async ($, on) => {
    const w = withNote(on);
    w.model = 'claude-opus-5-5';
    w.failWrite = '.model-';
    const got = lines(await submit($, 'x'));
    expect(got.some((l) => l.startsWith('Classify the user'))).toBe(true);
  });

  test('a failed model-id write keeps every other line', async ($, on) => {
    const w = withNote(on);
    w.model = 'claude-opus-5-5';
    w.failWrite = '.model-id';
    expect(lines(await submit($, 'x'))).toContain(NOTE);
  });
});

describe('answers', () => {
  const LEDGER = `${DATA}/ledger/x-p/${SID}.jsonl`;
  const ANSWERS = `${DATA}/answers/${SID}.jsonl`;
  const q = (code: string, ts: string, keys: string[]) =>
    JSON.stringify({ ts, code, prefix: 'Q', n: Number(code.slice(1)), title: `${code} title`, summary: '', options: keys.map((key) => ({ key, text: key })) });
  // Q1 from an earlier reply; Q3 and Q4 are the latest round.
  const ledger = [q('Q1', '2026-09-23T09:00:00Z', ['a', 'b']), q('Q3', '2026-09-23T10:00:00Z', ['a', 'b']), q('Q4', '2026-09-23T10:00:00Z', ['a', 'b', 'c'])].join('\n') + '\n';
  const rows = (w: World) => (w.files.get(ANSWERS) ?? '').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, string>);

  test('answers to the latest round are recorded, and the rest stay open', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' }, { [LEDGER]: ledger });
    const out = lines(await submit($, '3. a - fine\nq1 b'));
    expect(rows(w).map((r) => `${r.code} ${r.letter} ${r.how}`)).toEqual(['Q3 a number', 'Q1 b code']);
    expect(out.at(-1)).toBe('Open questions: Q4. The drawer lists them under the reply, so the reply does not restate them.');
  });

  test('z records an answer of the user\'s own', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' }, { [LEDGER]: ledger });
    await submit($, 'Q4 z - neither, keep both');
    expect(rows(w).map((r) => `${r.code} ${r.letter} ${r.how}`)).toEqual(['Q4 z own']);
  });

  test('a later answer appends to the file', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' }, { [LEDGER]: ledger, [ANSWERS]: '{"ts":"t","code":"Q1","letter":"a","how":"code"}\n' });
    const out = lines(await submit($, '4c'));
    expect(rows(w).map((r) => r.code)).toEqual(['Q1', 'Q4']);
    expect(out.at(-1)).toContain('Open questions: Q3.');
  });

  test('a positional reading asks the model to confirm it and records nothing', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' }, { [LEDGER]: ledger });
    const out = lines(await submit($, '1. a, 2. b'));
    expect(w.files.has(ANSWERS)).toBe(false);
    expect(out.filter((l) => l.includes('reads by position'))).toEqual([
      'The message\'s "1. a" names no question in the round, so it reads by position as Q3 a. Confirm that reading in one line before acting on it, and suggest answering as `Q3 a` next time, or `Q3 z` for an answer of their own.',
      'The message\'s "2. b" names no question in the round, so it reads by position as Q4 b. Confirm that reading in one line before acting on it, and suggest answering as `Q4 b` next time, or `Q4 z` for an answer of their own.',
    ]);
    expect(out.at(-1)).toContain('Open questions: Q1, Q3, Q4.');
  });

  test('an option the question lacks asks the model which was meant', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' }, { [LEDGER]: ledger });
    const out = lines(await submit($, '3 c'));
    expect(w.files.has(ANSWERS)).toBe(false);
    expect(out).toContain('The message\'s "3 c" picks option c, which Q3 does not offer. Ask which option was meant, and suggest answering as `Q3 <letter>`, or `Q3 z` for an answer of their own.');
  });

  test('an untyped turn reads no answers', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' }, { [LEDGER]: ledger });
    const out = lines(await submit($, '3 a', { kind: 'task-notification' }));
    expect(w.files.has(ANSWERS)).toBe(false);
    expect(out.some((l) => l.startsWith('Open questions'))).toBe(false);
  });

  test('a session with no questions adds no line', async ($, on) => {
    world(on, { outputStyle: 'Katharsis' });
    expect(lines(await submit($, '1a')).length).toBe(2);
  });
});
