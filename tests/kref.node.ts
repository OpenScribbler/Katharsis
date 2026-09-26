// Tests for cli/kref.ts and the scoping rules in hooks/ledger.ts, run by
// node --test through tests/test-kref-cli.sh. The fixture is an in-memory
// filesystem, so the cases cover the 4 scoping rules, code lookup inside and
// outside the scope, legacy session naming, sanitizing and the JSON contract.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { run, SCHEMA, type Ctx } from '../cli/kref.ts';
import { scope, type SessionInfo } from '../hooks/ledger.ts';

const HOME = '/home/u';
const DATA = `${HOME}/.claude/katharsis-data`;
const NOW = new Date('2026-09-25T18:00:00Z');
const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';
const C = 'cccccccc-0000-0000-0000-000000000003';

const row = (sid: string, code: string, ts: string, title: string, extra: object = {}) =>
  JSON.stringify({ ts, session_id: sid, code, prefix: code.replace(/\d+$/, ''), n: Number(code.match(/\d+$/)?.[0]), title, summary: '', ...extra });
const ledger = (sid: string, ...rows: string[]) => ({ [`${DATA}/ledger/proj/${sid}.jsonl`]: `${rows.join('\n')}\n` });
const record = (sid: string, fields: object) => ({
  [`${DATA}/sessions/${sid}.json`]: JSON.stringify({ id: sid, katharsis: [], started: '2026-09-25T10:00:00Z', updated: '2026-09-25T16:00:00Z', ...fields }),
});

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
    assert.equal(scope({ env: '../x', cwd: '/work/app', home: HOME, sessions }).kind, 'session'); // ignored, falls to rule 3
  });

  test('rule 3: the newest session in exactly this folder, counting the rest', () => {
    assert.deepEqual(scope({ cwd: '/work/app/', home: HOME, sessions }), { kind: 'session', reason: 'cwd', id: B, more: 1 });
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

describe('kref', () => {
  const files = {
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
    assert.equal(r.out, ' 1  Other work  /work/other  dev  1 hour ago  1 code  cccccccc\n 2  Fixing the cache  /work/app  main  2 hours ago  3 codes  bbbbbbbb\n');
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
    assert.equal(doc.schema, SCHEMA);
    assert.deepEqual(doc.scope, {
      kind: 'thread',
      reason: 'CLAUDE_CODE_SESSION_ID',
      session: { id: B, cwd: '/work/app', branch: 'main', title: 'Fixing the cache', titleSource: 'katharsis', started: '2026-09-25T10:00:00.000Z', updated: '2026-09-25T16:00:00.000Z', codes: 1, thread: [B, A] },
    });
    for (const f of ['items[].title', 'items[].body', 'items[].options', 'items[].rec', 'sessions[].title']) assert.ok(doc.untrusted.includes(f), f);
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
