// Tests for cli/kref.ts and the scoping rules in hooks/ledger.ts, run by
// node --test through tests/test-kref-cli.sh. The fixture is an in-memory
// filesystem, so the cases cover the 4 scoping rules, code lookup inside and
// outside the scope, legacy session naming, sanitizing, the JSON contract,
// search, the session list, the picker and the HTML page. The last group runs
// the real filesystem, opener, and prompt code the CLI's entry point wires in.

import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import { fsIo, onPath, opener, run, SCHEMA, tail, terminalAsk, writePage, type Ctx } from '../cli/kref.ts';
import { scope, type SessionInfo } from '../hooks/ledger.ts';

const HOME = '/home/u';
const DATA = `${HOME}/.claude/katharsis-data`;
const NOW = new Date('2026-09-25T18:00:00Z');
const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';
const C = 'cccccccc-0000-0000-0000-000000000003';
const D = 'dddddddd-0000-0000-0000-000000000004';
const E = 'eeeeeeee-0000-0000-0000-000000000005';

const row = (sid: string, code: string, ts: string, title: string, extra: object = {}) =>
  JSON.stringify({ ts, session_id: sid, code, prefix: code.replace(/\d+$/, ''), n: Number(code.match(/\d+$/)?.[0]), title, summary: '', ...extra });
const ledger = (sid: string, ...rows: string[]) => ({ [`${DATA}/ledger/proj/${sid}.jsonl`]: `${rows.join('\n')}\n` });
const record = (sid: string, fields: object) => ({
  [`${DATA}/sessions/${sid}.json`]: JSON.stringify({ id: sid, katharsis: [], started: '2026-09-25T10:00:00Z', updated: '2026-09-25T16:00:00Z', ...fields }),
});

const pages: { dir: string; name: string; html: string }[] = [];

function ctx(files: Record<string, string>, over: Partial<Ctx> = {}): Ctx {
  return {
    env: {},
    cwd: '/work/app',
    home: HOME,
    root: '/plugin',
    now: NOW,
    tty: false,
    cols: 100,
    io: {
      read: async (p) => files[p] ?? null,
      list: async (d) => {
        const kids = new Map<string, string>();
        for (const k of Object.keys(files)) {
          if (!k.startsWith(`${d}/`)) continue;
          const [name, ...rest] = k.slice(d.length + 1).split('/');
          kids.set(name, rest.length ? 'dir' : 'file');
        }
        return [...kids].map(([name, kind]) => ({ name, kind }));
      },
    },
    tail: async (p, bytes) => (files[p] === undefined ? null : files[p].slice(-bytes)),
    page: async (dir, name, html) => {
      pages.push({ dir, name, html });
      return `${dir}/${name}`;
    },
    ...over,
  };
}

const info = (id: string, cwd: string | undefined, updated: string): SessionInfo => ({ id, cwd, updated, codes: 1 });

describe('scope', () => {
  const sessions = [
    info(A, '/work/app', '2026-09-25T12:00:00Z'),
    info(B, '/work/app', '2026-09-25T15:00:00Z'),
    info(C, '/work/app/sub', '2026-09-25T17:00:00Z'),
  ];

  test('rule 1: --all and --session win over everything else', () => {
    assert.deepEqual(scope({ all: true, env: A, cwd: '/work/app', home: HOME, sessions }), { kind: 'all', reason: '--all' });
    assert.deepEqual(scope({ ref: 'aaaaaaaa', env: B, cwd: '/work/app', home: HOME, sessions }), { kind: 'session', reason: '--session', id: A, more: 0 });
    assert.deepEqual(scope({ ref: 'last', cwd: '/', home: HOME, sessions }), { kind: 'session', reason: '--session', id: C, more: 0 });
  });

  test('rule 1: a bad, short, unknown or ambiguous --session is an error', () => {
    const twins = [info('abcdef01-1', '/x', '1'), info('abcdef01-2', '/x', '2')];
    assert.equal(scope({ ref: '../etc', cwd: '/', home: HOME, sessions }).kind, 'error');
    assert.deepEqual(
      [scope({ ref: 'aaaa', cwd: '/', home: HOME, sessions }), scope({ ref: 'dddddddd', cwd: '/', home: HOME, sessions }), scope({ ref: 'abcdef01', cwd: '/', home: HOME, sessions: twins })].map((s) => s.kind === 'error' && s.code),
      ['usage', 'not_found', 'ambiguous_session'],
    );
  });

  test('rule 2: inside Claude Code, the session ID decides, whatever the folder', () => {
    assert.deepEqual(scope({ env: A, cwd: '/work/app', home: HOME, sessions }), { kind: 'session', reason: 'CLAUDE_CODE_SESSION_ID', id: A, more: 0 });
    assert.deepEqual(scope({ env: '../x', cwd: '/work/app', home: HOME, sessions }), scope({ cwd: '/work/app', home: HOME, sessions }));
  });

  test('rule 3: the newest session in exactly this folder, counting the rest', () => {
    assert.deepEqual(scope({ cwd: '/work/app/', home: HOME, sessions }), { kind: 'session', reason: 'cwd', id: B, more: 1 });
  });

  test('rule 3 never picks a session that ran in /, even from /', () => {
    assert.equal(scope({ cwd: '/', home: HOME, sessions: [info(A, '/', '2026-09-25T12:00:00Z')] }).kind, 'sessions');
  });

  test('rule 4: ~, / and folders with no session of their own list the newest 20 at or under them', () => {
    const home = scope({ cwd: HOME, home: HOME, sessions: [info(A, HOME, '1'), info(B, `${HOME}/x`, '2'), info(C, '/elsewhere', '3')] });
    assert.deepEqual(home.kind === 'sessions' && home.sessions.map((s) => s.id), [B, A]);
    const parent = scope({ cwd: '/work', home: HOME, sessions });
    assert.deepEqual(parent.kind === 'sessions' && parent.sessions.map((s) => s.id), [C, B, A]);
    const many = Array.from({ length: 25 }, (_, k) => info(`${k}`.padStart(8, '0'), '/r', `2026-01-${String(k + 1).padStart(2, '0')}`));
    const root = scope({ cwd: '/', home: HOME, sessions: [...many, info(A, undefined, '2027')] });
    assert.equal(root.kind === 'sessions' && root.sessions.length, 20);
    assert.equal(root.kind === 'sessions' && root.sessions[0].id, '00000024');
  });
});

// Session A is B's handoff ancestor; C ran in another folder and has no record.
const FILES: Record<string, string> = {
  ...ledger(A, row(A, 'F1', '2026-09-24T09:00:00Z', 'Ancestor finding')),
  ...ledger(
    B,
    row(B, 'F2', '2026-09-25T15:00:00Z', 'The cache is stale', { summary: 'It never expires.' }),
    row(B, 'Q1', '2026-09-25T15:00:00Z', 'Which branch?', { options: [{ key: 'a', text: 'main' }, { key: 'b', text: 'dev' }], rec: 'a - it ships' }),
    row(B, 'NA1', '2026-09-25T15:01:00Z', 'Run the suite'),
  ),
  [`${DATA}/ledger/chains/${B}`]: `${A}\n`,
  ...record(B, { cwd: '/work/app', branch: 'main', title: 'Fixing the cache', titleSource: 'katharsis' }),
  ...ledger(C, row(C, 'F3', '2026-09-25T17:00:00Z', 'Elsewhere finding')),
  [`${HOME}/.claude/history.jsonl`]: `${JSON.stringify({ sessionId: C, project: '/work/other' })}\n{broken\n`,
  [`${HOME}/.claude/projects/-work-other/${C}.jsonl`]: `{"gitBranch":"dev","type":"x"}\n{"type":"ai-title","aiTitle":"Other work","sessionId":"${C}"}\n`,
  '/plugin/.claude-plugin/plugin.json': '{"version":"1.2.3"}',
};

describe('kref', () => {
  const files = FILES;

  test('inside a session: a header, then its thread by section with questions last', async () => {
    const r = await run([], ctx(files, { env: { CLAUDE_CODE_SESSION_ID: B } }));
    assert.equal(r.code, 0);
    assert.equal(r.err, '');
    assert.equal(
      r.out,
      [
        'Fixing the cache · /work/app · main · 2 hours ago',
        '',
        'Findings',
        '  F1  2026-09-24  Ancestor finding',
        '',
        '  F2  2026-09-25  The cache is stale',
        '      It never expires.',
        '',
        'Next Actions',
        '  NA1  2026-09-25  Run the suite',
        '',
        'Questions',
        '  Q1  2026-09-25  Which branch?',
        '      a. main',
        '      b. dev',
        '      -> a - it ships',
        '',
      ].join('\n'),
    );
  });

  test('a code in scope prints alone, and --short keeps only titles', async () => {
    const r = await run(['f2', '--short'], ctx(files, { env: { CLAUDE_CODE_SESSION_ID: B } }));
    assert.deepEqual([r.code, r.out], [0, 'Fixing the cache · /work/app · main · 2 hours ago\n\nF2  2026-09-25  The cache is stale\n']);
  });

  test('a code the scope lacks says so and shows the sessions that define it', async () => {
    const r = await run(['F3'], ctx(files, { env: { CLAUDE_CODE_SESSION_ID: B } }));
    assert.equal(r.code, 0);
    assert.equal(r.err, "F3 isn't in this thread. The newest sessions that define it:\n");
    assert.equal(r.out, 'Other work · /work/other · dev · 1 hour ago\n\nF3  Elsewhere finding\n');
  });

  test('a prefix alone prints every code with that prefix in scope', async () => {
    const r = await run(['f', '--short'], ctx(files, { env: { CLAUDE_CODE_SESSION_ID: B } }));
    assert.equal(r.out, 'Fixing the cache · /work/app · main · 2 hours ago\n\nF1  2026-09-24  Ancestor finding\nF2  2026-09-25  The cache is stale\n');
  });

  test('a code asked for where no session is chosen shows the sessions that define it', async () => {
    const r = await run(['F3'], ctx(files, { cwd: '/work' }));
    assert.deepEqual(r, { code: 0, out: 'Other work · /work/other · dev · 1 hour ago\n\nF3  Elsewhere finding\n', err: 'Sessions that define F3, newest first:\n' });
  });

  test('a session with no codes says so and exits 1', async () => {
    const empty = { ...files, ...record(D, { cwd: '/work/empty', title: 'Empty', titleSource: 'katharsis' }) };
    const r = await run([], ctx(empty, { env: { CLAUDE_CODE_SESSION_ID: D } }));
    assert.deepEqual(r, { code: 1, out: 'Empty · /work/empty · 2 hours ago\n', err: 'No codes yet in this session.\n' });
  });

  test('the home folder prints as ~', async () => {
    const homes = {
      ...files,
      ...ledger(D, row(D, 'F1', '2026-09-25T15:00:00Z', 'Home')),
      ...record(D, { cwd: `${HOME}/proj`, title: 'Proj', titleSource: 'katharsis' }),
      ...ledger(E, row(E, 'F1', '2026-09-25T15:00:00Z', 'Home')),
      ...record(E, { cwd: HOME, title: 'Home', titleSource: 'katharsis' }),
    };
    assert.match((await run(['--short'], ctx(homes, { env: { CLAUDE_CODE_SESSION_ID: D } }))).out, /^Proj · ~\/proj · /);
    assert.match((await run(['--short'], ctx(homes, { env: { CLAUDE_CODE_SESSION_ID: E } }))).out, /^Home · ~ · /);
  });

  test('a terminal wraps long text to its width, never under 40 columns, with a hanging indent', async () => {
    const long = { ...files, ...ledger(B, row(B, 'F2', '2026-09-25T15:00:00Z', 'The cache is stale', { summary: 'It never expires because nothing ever writes the timestamp the reader compares against.' })) };
    const r = await run(['F2'], ctx(long, { env: { CLAUDE_CODE_SESSION_ID: B }, tty: true, cols: 20 }));
    assert.equal(
      r.out.split('\n').slice(2).join('\n'),
      'F2  2026-09-25  The cache is stale\n    It never expires because nothing\n    ever writes the timestamp the reader\n    compares against.\n',
    );
  });

  test('a code nowhere in the ledger exits 1', async () => {
    const r = await run(['X9'], ctx(files, { env: { CLAUDE_CODE_SESSION_ID: B } }));
    assert.deepEqual([r.code, r.out, r.err], [1, '', "kref: X9 isn't in the ledger\n"]);
  });

  test('rule 3 names a session with no record from Claude Code files, and counts the others', async () => {
    const more = { ...files, ...ledger('dddddddd-0', row('dddddddd-0', 'F9', '2026-09-20T00:00:00Z', 'Old')), [`${HOME}/.claude/history.jsonl`]: `${files[`${HOME}/.claude/history.jsonl`]}${JSON.stringify({ sessionId: 'dddddddd-0', project: '/work/other' })}\n` };
    const r = await run(['--short'], ctx(more, { cwd: '/work/other' }));
    assert.equal(r.out, 'Other work · /work/other · dev · 1 hour ago\n\nFindings\n  F3  Elsewhere finding\n');
    assert.equal(r.err, '1 more session here: kref sessions\n');
  });

  test('a handoff title from Claude Code gives way to the first coded line', async () => {
    const punt = { ...files, [`${HOME}/.claude/projects/-work-other/${C}.jsonl`]: '{"aiTitle":"Punt file continuation"}\n' };
    const r = await run(['--short'], ctx(punt, { cwd: '/work/other' }));
    assert.match(r.out, /^Elsewhere finding · \/work\/other · 1 hour ago\n/);
  });

  test('rule 4 lists sessions on a pipe and never prompts', async () => {
    const r = await run([], ctx(files, { cwd: '/work' }));
    assert.equal(r.code, 0);
    assert.equal(r.out, ' 1  Other work  other  dev  1 hour ago  1 code  cccccccc\n 2  Fixing the cache  app  main  2 hours ago  3 codes  bbbbbbbb\n');
    assert.match(r.err, /^No session is chosen here\. The 2 newest at or under \/work;/);
  });

  test('--all shows every session newest first, and --chrono one flat list', async () => {
    const r = await run(['--all', '--short'], ctx(files));
    assert.deepEqual(r.out.split('\n').filter((l) => l.includes(' · ')).map((l) => l.split(' · ')[0]), ['Other work', 'Fixing the cache', 'Ancestor finding']);
    const c = await run(['--chrono', '--short'], ctx(files, { env: { CLAUDE_CODE_SESSION_ID: B } }));
    assert.deepEqual(c.out.split('\n').slice(2, 6), ['F1  2026-09-24 09:00  Ancestor finding', 'F2  2026-09-25 15:00  The cache is stale', 'Q1  2026-09-25 15:00  Which branch?', 'NA1  2026-09-25 15:01  Run the suite']);
  });

  test('control characters and bidi overrides never reach the terminal', async () => {
    const evil = { ...files, ...ledger(B, row(B, 'F2', '2026-09-25T15:00:00Z', 'Safe\u001b]52;c;cGF3bmVk\u0007 title‮', { summary: 'body\u001b[2Jend' })) };
    const r = await run(['F2'], ctx(evil, { env: { CLAUDE_CODE_SESSION_ID: B } }));
    assert.ok(!/[\u001b\u0007‮]/.test(r.out));
    assert.match(r.out, /F2  2026-09-25  Safe\]52;c;cGF3bmVk title\n {4}body\[2Jend\n/);
  });

  test('options, the recommendation, and the session header are sanitized too', async () => {
    const evil = {
      ...files,
      ...ledger(B, row(B, 'Q1', '2026-09-25T15:00:00Z', 'Which?', { options: [{ key: 'a\u001b[1m', text: 'opt\u0007ion\u202e' }], rec: 'a\u001b]0;x\u0007 rec' })),
      ...record(B, { cwd: '/work/app', branch: 'ma\u001b[31min', title: 'Ti\u001b[2Jtle\u202e', titleSource: 'katharsis' }),
    };
    const r = await run([], ctx(evil, { env: { CLAUDE_CODE_SESSION_ID: B } }));
    assert.ok(!/[\u001b\u0007\u202e]/.test(r.out + r.err));
    assert.ok((r.out + r.err).includes('Ti[2Jtle'));
    assert.ok(r.out.includes('a[1m. option'));
    assert.ok(r.out.includes('-> a]0;x rec'));
  });

  test('a session whose rows sit in two project folders reads as one', async () => {
    const split = { ...files, [`${DATA}/ledger/other/${B}.jsonl`]: `${row(B, 'F9', '2026-09-25T15:30:00Z', 'Split finding')}\n` };
    const one = await run(['F9', '--short'], ctx(split, { env: { CLAUDE_CODE_SESSION_ID: B } }));
    assert.equal(one.code, 0);
    assert.ok(one.out.includes('F9  2026-09-25  Split finding'));
    const all = await run(['--short'], ctx(split, { env: { CLAUDE_CODE_SESSION_ID: B } }));
    assert.ok(all.out.includes('  F2  2026-09-25  The cache is stale\n  F9  2026-09-25  Split finding\n'));
    const found = await run(['search', 'split', '--json'], ctx(split));
    assert.deepEqual(JSON.parse(found.out).items.map((i: { code: string }) => i.code), ['F9']);
  });

  test('usage errors exit 2', async () => {
    for (const argv of [['search'], ['F1', 'F2'], ['--bogus']]) assert.equal((await run(argv, ctx(files))).code, 2);
    assert.equal((await run(['--session', 'zz'], ctx(files))).code, 2);
    assert.deepEqual(await run(['--version'], ctx(files)), { code: 0, out: 'kref 1.2.3\n', err: '' });
  });
});

describe('--json', () => {
  const files = {
    ...ledger(A, row(A, 'F1', '2026-09-24T09:00:00Z', 'Ancestor finding')),
    ...ledger(B, row(B, 'F2', '2026-09-25T15:00:00Z', 'The cache is stale', { summary: 'It never expires.' })),
    [`${DATA}/ledger/chains/${B}`]: `${A}\n`,
    ...record(B, { cwd: '/work/app', branch: 'main', title: 'Fixing the cache', titleSource: 'katharsis' }),
  };

  test('one versioned document naming its scope and its untrusted fields', async () => {
    const r = await run(['--json'], ctx(files, { env: { CLAUDE_CODE_SESSION_ID: B } }));
    assert.equal(r.code, 0);
    assert.ok(!r.out.trimEnd().includes('\n'), 'compact on a pipe');
    const doc = JSON.parse(r.out);
    assert.deepEqual(Object.keys(doc), ['schema', 'scope', 'untrusted', 'items', 'sessions', 'error']);
    assert.equal(doc.schema, 'katharsis.kref/1');
    assert.equal(SCHEMA, 'katharsis.kref/1');
    assert.deepEqual(doc.scope, {
      kind: 'thread',
      reason: 'CLAUDE_CODE_SESSION_ID',
      session: { id: B, cwd: '/work/app', branch: 'main', title: 'Fixing the cache', titleSource: 'katharsis', started: '2026-09-25T10:00:00.000Z', updated: '2026-09-25T16:00:00.000Z', codes: 1, thread: [B, A] },
    });
    assert.deepEqual(doc.untrusted, ['items[].title', 'items[].body', 'items[].options', 'items[].rec', 'items[].section', 'scope.session.title', 'sessions[].title']);
    assert.deepEqual(doc.items[1], { code: 'F2', prefix: 'F', n: 2, section: 'Findings', title: 'The cache is stale', body: 'It never expires.', options: [], rec: '', session: B, ts: '2026-09-25T15:00:00Z' });
    assert.equal(doc.error, null);
  });

  test('pretty in a terminal, with the same data', async () => {
    const pipe = await run(['--json'], ctx(files, { env: { CLAUDE_CODE_SESSION_ID: B } }));
    const tty = await run(['--json'], ctx(files, { env: { CLAUDE_CODE_SESSION_ID: B }, tty: true }));
    assert.ok(tty.out.includes('\n  "schema"'));
    assert.deepEqual(JSON.parse(tty.out), JSON.parse(pipe.out));
  });

  test('a list scope returns the candidates as data', async () => {
    const doc = JSON.parse((await run(['--json'], ctx(files, { cwd: '/work' }))).out);
    assert.deepEqual([doc.scope, doc.sessions.map((s: SessionInfo) => s.id), doc.items], [{ kind: 'sessions', reason: 'below-cwd' }, [B], []]);
  });

  test('errors come back in the same shape, with the exit code of the table', async () => {
    const missing = await run(['--json', 'X9'], ctx(files, { env: { CLAUDE_CODE_SESSION_ID: B } }));
    assert.equal(missing.code, 1);
    assert.deepEqual(JSON.parse(missing.out).error, { code: 'not_found', message: "X9 isn't in the ledger" });
    const bad = await run(['--json', 'searchable'], ctx(files));
    assert.equal(bad.code, 2);
    const doc = JSON.parse(bad.out);
    assert.deepEqual([doc.schema, doc.scope, doc.items, doc.error.code], [SCHEMA, null, [], 'usage']);
  });
});

describe('kref search', () => {
  test('matches titles, bodies and options without case, across every session, newest first', async () => {
    const r = await run(['search', 'cache'], ctx(FILES));
    assert.deepEqual([r.code, r.out], [0, 'Fixing the cache · /work/app · main · 2 hours ago\n\nF2  The cache is stale\n    It never expires.\n']);
    assert.match((await run(['search', 'MAIN', '--short'], ctx(FILES))).out, /\n\nQ1  Which branch\?\n$/);
    const many = await run(['search', 'finding', '--short'], ctx(FILES, { env: { CLAUDE_CODE_SESSION_ID: B } }));
    assert.equal(many.out, 'Other work · /work/other · dev · 1 hour ago\n\nF3  Elsewhere finding\n\nAncestor finding · yesterday\n\nF1  Ancestor finding\n');
  });

  test('matches text literally, never as a pattern, and exits 1 on no match', async () => {
    assert.deepEqual(await run(['search', '.*'], ctx(FILES)), { code: 1, out: '', err: 'kref: no code mentions ".*"\n' });
  });

  test('--here narrows to the thread kref would show', async () => {
    const r = await run(['search', 'finding', '--here', '--short'], ctx(FILES, { env: { CLAUDE_CODE_SESSION_ID: B } }));
    assert.equal(r.out, 'Fixing the cache · /work/app · main · 2 hours ago\n\nF1  2026-09-24  Ancestor finding\n');
  });

  test('--here where no session is chosen narrows to the sessions at or under this folder', async () => {
    const doc = JSON.parse((await run(['search', 'finding', '--here', '--json'], ctx(FILES, { cwd: '/work' }))).out);
    assert.deepEqual([doc.scope, doc.items.map((i: { code: string }) => i.code)], [{ kind: 'sessions', reason: 'below-cwd' }, ['F3']]);
  });

  test('--json names the search as its scope and lists the sessions that matched', async () => {
    const doc = JSON.parse((await run(['search', '--json', 'finding'], ctx(FILES))).out);
    assert.deepEqual(doc.scope, { kind: 'all', reason: 'search' });
    assert.deepEqual([doc.sessions.map((s: SessionInfo) => s.id), doc.items.map((i: { code: string }) => i.code)], [[C, A], ['F3', 'F1']]);
  });
});

describe('kref sessions', () => {
  test('lists the sessions at or under this folder, whatever session it runs in', async () => {
    const r = await run(['sessions'], ctx(FILES, { cwd: '/work/other', env: { CLAUDE_CODE_SESSION_ID: B } }));
    assert.deepEqual(r, { code: 0, out: ' 1  Other work  .  dev  1 hour ago  1 code  cccccccc\n', err: 'Open one with kref --session <id>.\n' });
    const doc = JSON.parse((await run(['sessions', '--json'], ctx(FILES, { cwd: '/work' }))).out);
    assert.deepEqual([doc.scope, doc.sessions.map((s: SessionInfo) => s.id)], [{ kind: 'sessions', reason: 'sessions' }, [C, B]]);
  });

  test('--all lists every session, folder or not', async () => {
    const r = await run(['sessions', '--all'], ctx(FILES, { cwd: '/work' }));
    assert.equal(r.out.split('\n')[2], ' 3  Ancestor finding  -  -  yesterday  1 code  aaaaaaaa');
  });

  test('flags that make no sense together are usage errors', async () => {
    for (const argv of [['sessions', 'x'], ['sessions', '--session', 'aaaaaaaa'], ['--here'], ['F1', '--here'], ['search'], ['--json', '--html']]) {
      assert.equal((await run(argv, ctx(FILES))).code, 2, argv.join(' '));
    }
  });
});

describe('the picker', () => {
  const asker = (answers: (string | null)[]) => {
    const prompts: string[] = [];
    const ask = async (text: string) => {
      prompts.push(text);
      return answers.length ? answers.shift()! : null;
    };
    return { prompts, ask };
  };
  const both = ' 1  Other work  other  dev  1 hour ago  1 code  cccccccc\n 2  Fixing the cache  app  main  2 hours ago  3 codes  bbbbbbbb\nNumber, or text to filter: ';

  test('filters by text, says when nothing matches, and opens the number typed', async () => {
    const { prompts, ask } = asker(['9', 'nomatch', 'OTHER', '1']);
    const r = await run([], ctx(FILES, { cwd: '/work', ask }));
    assert.deepEqual(prompts, [
      both,
      `No session 9 in this list.\n${both}`,
      `No session title or folder contains "nomatch".\n${both}`,
      ' 1  Other work  other  dev  1 hour ago  1 code  cccccccc\nNumber, or text to filter: ',
    ]);
    assert.deepEqual(r, { code: 0, out: 'Other work · /work/other · dev · 1 hour ago\n\nFindings\n  F3  Elsewhere finding\n', err: '' });
  });

  test('an empty line clears a filter, then quits', async () => {
    const { prompts, ask } = asker(['app', '', '']);
    assert.deepEqual(await run([], ctx(FILES, { cwd: '/work', ask })), { code: 0, out: '', err: '' });
    assert.equal(prompts[2], both);
  });

  test('the end of input quits, and --json never prompts', async () => {
    const first = asker([]);
    assert.deepEqual(await run([], ctx(FILES, { cwd: '/work', ask: first.ask })), { code: 0, out: '', err: '' });
    assert.equal(first.prompts.length, 1);
    const second = asker([]);
    const doc = JSON.parse((await run(['--json'], ctx(FILES, { cwd: '/work', ask: second.ask }))).out);
    assert.deepEqual([second.prompts.length, doc.sessions.length], [0, 2]);
  });
});

describe('--html', () => {
  test('writes one page with no script, a CSP that forbids one, and two tabs', async () => {
    pages.length = 0;
    const r = await run(['--html'], ctx(FILES, { env: { CLAUDE_CODE_SESSION_ID: B } }));
    assert.deepEqual(r, { code: 0, out: `${DATA}/kref-out/bbbbbbbb-session.html\n`, err: '' });
    const { html } = pages[0];
    assert.ok(!/<script/i.test(html));
    assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`));
    for (const s of ['id="t-sections" checked', 'id="t-chrono"', '<h3>Findings</h3>', '<h3>Questions</h3>', '<td class="when">2026-09-25 15:01</td>']) assert.ok(html.includes(s), s);
  });

  test('escapes every HTML metacharacter in ledger text', async () => {
    pages.length = 0;
    const evil = { ...FILES, ...ledger(B, row(B, 'F2', '2026-09-25T15:00:00Z', `<img src=x onerror=alert(1)> "q" 'a' & b`)) };
    await run(['--html', 'F2'], ctx(evil, { env: { CLAUDE_CODE_SESSION_ID: B } }));
    assert.ok(!pages[0].html.includes('<img'));
    assert.ok(pages[0].html.includes('&lt;img src=x onerror=alert(1)&gt; &quot;q&quot; &#39;a&#39; &amp; b'));
  });

  test('collapses each session of a multi-session result and marks the session in writing order', async () => {
    pages.length = 0;
    const r = await run(['search', 'finding', '--html'], ctx(FILES));
    assert.equal(r.out, `${DATA}/kref-out/search-finding.html\n`);
    assert.equal(pages[0].html.match(/<details/g)?.length, 2);
    assert.ok(pages[0].html.includes('<details open><summary>Other work'));
    assert.ok(pages[0].html.includes(`<td class="sess">aaaaaaaa</td>`));
  });

  test('escapes options, the recommendation, and the session header', async () => {
    pages.length = 0;
    const evil = {
      ...FILES,
      ...ledger(B, row(B, 'Q1', '2026-09-25T15:00:00Z', 'Which?', { options: [{ key: '<k>', text: '<img src=x>' }], rec: '<script>r</script>' })),
      ...record(B, { cwd: '/work/<d>', branch: '<br>', title: '<u>&x', titleSource: 'katharsis' }),
    };
    await run(['--html'], ctx(evil, { env: { CLAUDE_CODE_SESSION_ID: B } }));
    const { html } = pages[0];
    for (const bad of ['<k>', '<img', '<script>', '<br>', '<u>&x', '<d>']) assert.ok(!html.includes(bad), bad);
    for (const good of ['&lt;k&gt;', '&lt;img src=x&gt;', '&lt;script&gt;r&lt;/script&gt;', '&lt;u&gt;&amp;x', '&lt;br&gt;', '/work/&lt;d&gt;']) assert.ok(html.includes(good), good);
  });

  test('escapes the session headers of a multi-session page', async () => {
    pages.length = 0;
    const evil = { ...FILES, ...record(B, { cwd: '/work/app', branch: '<br>', title: '<u>&x', titleSource: 'katharsis' }) };
    await run(['search', 'e', '--html'], ctx(evil));
    const { html } = pages[0];
    assert.ok(html.includes('<details open><summary>'));
    assert.ok(!html.includes('<u>&x') && !html.includes('<br>'));
    assert.ok(html.includes('<summary>&lt;u&gt;&amp;x'));
  });

  test('backticks and bold become markup, after escaping', async () => {
    pages.length = 0;
    const md = { ...FILES, ...ledger(B, row(B, 'F2', '2026-09-25T15:00:00Z', 'Run `kref F3` **now**', { summary: 'a `<b>` and **x < y**' })) };
    await run(['--html', 'F2'], ctx(md, { env: { CLAUDE_CODE_SESSION_ID: B } }));
    assert.ok(pages[0].html.includes('Run <code>kref F3</code> <strong>now</strong>'));
    assert.ok(pages[0].html.includes('a <code>&lt;b&gt;</code> and <strong>x &lt; y</strong>'));
  });

  test('a session list becomes a table, one row per session', async () => {
    pages.length = 0;
    const r = await run(['sessions', '--html'], ctx(FILES, { cwd: '/work' }));
    assert.equal(r.out, `${DATA}/kref-out/sessions.html\n`);
    assert.ok(pages[0].html.includes('<tr><td>1</td><td class="title">Other work</td><td>/work/other</td><td>dev</td><td>1 hour ago</td><td>1</td>'));
    assert.ok(pages[0].html.includes('<tr><td>2</td><td class="title">Fixing the cache</td><td>/work/app</td><td>main</td><td>2 hours ago</td><td>3</td>'));
  });

  test('a page that cannot be written exits 2', async () => {
    const r = await run(['--html'], ctx(FILES, { env: { CLAUDE_CODE_SESSION_ID: B }, page: async () => { throw new Error('EACCES'); } }));
    assert.deepEqual(r, { code: 2, out: '', err: "kref: couldn't write the page: EACCES\n" });
  });
});

describe('the entry point', () => {
  const dirs: string[] = [];
  const temp = async () => {
    const dir = await mkdtemp(`${tmpdir()}/kref-`);
    dirs.push(dir);
    return dir;
  };
  after(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));
  const none = () => false;
  const noWin = () => undefined;

  test('opens with the platform opener, passing the path as one argument', () => {
    const path = '/tmp/a b; touch pwned $(id).html';
    assert.deepEqual(opener(path, 'win32', none, noWin), ['cmd', ['/c', 'start', '', path]]);
    assert.deepEqual(opener(path, 'darwin', none, noWin), ['open', [path]]);
  });

  test('on Linux prefers wslview, then explorer.exe with a Windows path, then xdg-open', () => {
    const has = (...cmds: string[]) => (c: string) => cmds.includes(c);
    const win = () => 'C:\\p.html';
    assert.deepEqual(opener('/p.html', 'linux', has('wslview', 'explorer.exe', 'wslpath', 'xdg-open'), win), ['wslview', ['/p.html']]);
    assert.deepEqual(opener('/p.html', 'linux', has('explorer.exe', 'wslpath', 'xdg-open'), win), ['explorer.exe', ['C:\\p.html']]);
    assert.deepEqual(opener('/p.html', 'linux', has('explorer.exe', 'wslpath', 'xdg-open'), noWin), ['xdg-open', ['/p.html']]);
    assert.deepEqual(opener('/p.html', 'linux', has('explorer.exe', 'xdg-open'), win), ['xdg-open', ['/p.html']]);
    assert.equal(opener('/p.html', 'linux', none, win), null);
  });

  test('finds only executable files on PATH', async () => {
    const dir = await temp();
    await writeFile(`${dir}/runs`, '', { mode: 0o755 });
    await writeFile(`${dir}/plain`, '', { mode: 0o644 });
    assert.equal(onPath('runs', `/nonexistent:${dir}`), true);
    assert.equal(onPath('plain', dir), false);
    assert.equal(onPath('absent', dir), false);
  });

  test('writes the page 0600 in a 0700 folder, narrowing modes that were wider', async () => {
    const root = await temp();
    const dir = `${root}/kref-out`;
    await mkdir(dir, { mode: 0o755 });
    await chmod(dir, 0o755);
    await writeFile(`${dir}/p.html`, 'old', { mode: 0o644 });
    await chmod(`${dir}/p.html`, 0o644);
    const opened: string[] = [];
    const path = await writePage(dir, 'p.html', '<p>new</p>', {}, (p) => opened.push(p));
    assert.equal(path, `${dir}/p.html`);
    assert.equal((await stat(dir)).mode & 0o777, 0o700);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal(await fsIo.read(path), '<p>new</p>');
    assert.deepEqual(opened, [path]);
  });

  test('KREF_NO_OPEN writes the page without opening it', async () => {
    const root = await temp();
    const opened: string[] = [];
    await writePage(`${root}/a/b`, 'p.html', 'x', { KREF_NO_OPEN: '1' }, (p) => opened.push(p));
    assert.deepEqual(opened, []);
    assert.equal((await stat(`${root}/a/b`)).mode & 0o777, 0o700);
  });

  test('reads files and folders, and answers null or empty for what is missing', async () => {
    const dir = await temp();
    await mkdir(`${dir}/sub`);
    await writeFile(`${dir}/f.txt`, 'hi');
    assert.equal(await fsIo.read(`${dir}/f.txt`), 'hi');
    assert.equal(await fsIo.read(`${dir}/missing`), null);
    assert.deepEqual((await fsIo.list(dir)).sort((a, b) => a.name.localeCompare(b.name)), [
      { name: 'f.txt', kind: 'file' },
      { name: 'sub', kind: 'dir' },
    ]);
    assert.deepEqual(await fsIo.list(`${dir}/missing`), []);
  });

  test('tail returns the last bytes, the whole file when it is shorter, and null when missing', async () => {
    const dir = await temp();
    await writeFile(`${dir}/t`, '0123456789');
    assert.equal(await tail(`${dir}/t`, 4), '6789');
    assert.equal(await tail(`${dir}/t`, 64), '0123456789');
    assert.equal(await tail(`${dir}/missing`, 4), null);
  });

  test('the prompt returns each typed line and writes the question to its output', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let shown = '';
    output.on('data', (d) => (shown += d));
    const t = terminalAsk(input, output);
    const first = t.ask('Number: ');
    input.write('2\n');
    assert.equal(await first, '2');
    const second = t.ask('Number: ');
    input.write('keytab\n');
    assert.equal(await second, 'keytab');
    assert.equal(shown, 'Number: Number: ');
    t.close();
  });

  test('the end of input answers null, now and for every later question', async () => {
    const input = new PassThrough();
    const t = terminalAsk(input, new PassThrough());
    const waiting = t.ask('? ');
    input.end();
    assert.equal(await waiting, null);
    assert.equal(await t.ask('? '), null);
  });

  test('closing before the first question is safe, and closing twice too', () => {
    const t = terminalAsk(new PassThrough(), new PassThrough());
    t.close();
    t.close();
  });
});
