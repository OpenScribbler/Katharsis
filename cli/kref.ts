// kref.ts: the ledger reader for a terminal or an agent, run by node 22.18
// or later with no dependencies. It reads through hooks/ledger.ts, the same
// module the drawer and the prompt hook use, so the three never disagree on
// what a code says or where numbering resumes.
//
// A bare kref shows exactly one session and names it, chosen by the scoping
// rules in ledger.ts: a flag, then the Claude Code session it runs inside,
// then the newest session in this folder, then a list of the sessions below
// it. A code the scope lacks is looked up in the 5 newest sessions that
// define it rather than widening silently.
//
// Ledger text is model-written, so every printed title and body is stripped
// of control characters and bidi overrides, and --json names its untrusted
// fields. Results go to stdout, messages about scope and errors to stderr,
// and exit codes follow grep: 0 a result, 1 no match, 2 a usage error.
//
// Sessions recorded before session records existed are named from Claude
// Code's own files at lookup time, and nothing here writes anywhere: the
// folder from history.jsonl, the branch and title from the transcript's last
// 64 KB, and the first coded line's title when Claude Code's title only
// says the session continued a handoff.

import { realpathSync } from 'node:fs';
import { open, readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  itemsOf,
  ledgerTexts,
  readRecord,
  scope,
  sectionOf,
  sections,
  SESSION_ID,
  thread,
  threadItems,
  type Io,
  type Item,
  type SessionInfo,
  type SessionRecord,
} from '../hooks/ledger.ts';

export type Ctx = {
  env: Record<string, string | undefined>;
  cwd: string;
  home: string;
  root: string; // the plugin root, for --version
  now: Date;
  tty: boolean; // stdout is a terminal
  cols: number;
  io: Io;
  tail(path: string, bytes: number): Promise<string | null>;
};
export type Result = { code: number; out: string; err: string };
type ErrorCode = 'not_found' | 'ambiguous_session' | 'usage' | 'io';

export const SCHEMA = 'katharsis.kref/1';
const UNTRUSTED = [
  'items[].title',
  'items[].body',
  'items[].options',
  'items[].rec',
  'items[].section',
  'scope.session.title',
  'sessions[].title',
];
const CODE = /^([A-Za-z][A-Za-z-]{0,3})(\d*)$/;
const LOOKUP_CAP = 5;
// Claude Code names a session for its opening prompt, so a session opened
// on a handoff file gets a title like "Punt file continuation".
const HANDOFF_TITLE = /\b(punt|handoff)\b.*\bcontinu|\bcontinu\w*\b.*\b(punt|handoff)\b/i;

const HELP = `kref: read back the codes Katharsis replies defined.

Usage
  kref                     the session's codes, grouped by section
  kref F3                  one code
  kref F                   every code with that prefix
  kref --session <ref>     a session by ID, a prefix of 8 or more characters, or last
  kref --all               every session

Flags
  --short                  titles only
  --chrono                 one flat list in the order the codes were written
  --json                   one JSON document on stdout, schema ${SCHEMA}
  -h, --help               this text
  --version                the Katharsis version

Inside Claude Code, kref reads that session and its handoff ancestors. Elsewhere it reads
the newest session that ran in this folder, or lists the sessions below it.

Exit codes: 0 a result, 1 no match, 2 a usage error or a failure.
`;

// Every C0 and C1 control character but newline and tab, which drops every
// escape sequence, and the bidi overrides.
const UNSAFE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/g;
export const clean = (s: string) => s.replace(UNSAFE, '');
const oneLine = (s: string) => clean(s).replace(/\s*\n\s*/g, ' ').trim();

const parseTime = (s: string | undefined) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? undefined : t;
};
const iso = (t: number | undefined) => (t === undefined ? undefined : new Date(t).toISOString());

export function age(then: string | undefined, now: Date): string {
  const t = parseTime(then);
  if (t === undefined) return '';
  const min = Math.floor((now.getTime() - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

// The last capture of a JSON string field in raw JSONL text, unescaped.
function lastField(text: string, field: string): string | undefined {
  let found: string | undefined;
  for (const m of text.matchAll(new RegExp(`"${field}":"((?:[^"\\\\]|\\\\.)*)"`, 'g'))) found = m[1];
  if (found === undefined) return undefined;
  try {
    return JSON.parse(`"${found}"`) as string;
  } catch {
    return undefined;
  }
}

function wrap(text: string, first: string, hang: string, width: number): string[] {
  const lines: string[] = [];
  let line = first;
  let empty = true;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!empty && line.length + 1 + word.length > width) {
      lines.push(line);
      line = hang + word;
    } else {
      line += (empty ? '' : ' ') + word;
    }
    empty = false;
  }
  lines.push(line);
  return lines;
}

export async function run(argv: string[], ctx: Ctx): Promise<Result> {
  const asJson = argv.includes('--json');
  const dump = (doc: object) => `${JSON.stringify(doc, null, ctx.tty ? 2 : undefined)}\n`;
  const document = (scopeDoc: object | null, items: Item[], sessions: SessionInfo[], error: object | null) => ({
    schema: SCHEMA,
    scope: scopeDoc,
    untrusted: UNTRUSTED,
    items: items.map((i) => ({
      code: i.code,
      prefix: i.prefix,
      n: i.n,
      section: sectionOf(i),
      title: i.title,
      body: i.summary,
      options: i.options,
      rec: i.rec,
      session: i.session,
      ts: i.ts,
    })),
    sessions,
    error,
  });
  const fail = (code: number, kind: ErrorCode, message: string, scopeDoc: object | null = null): Result =>
    asJson
      ? { code, out: dump(document(scopeDoc, [], [], { code: kind, message })), err: '' }
      : { code, out: '', err: `kref: ${message}\n` };

  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        session: { type: 'string' },
        all: { type: 'boolean' },
        short: { type: 'boolean' },
        chrono: { type: 'boolean' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean' },
      },
    });
  } catch (e) {
    return fail(2, 'usage', `${(e as Error).message}. Run kref --help for usage.`);
  }
  const f = parsed.values;
  if (f.help) return { code: 0, out: HELP, err: '' };
  if (f.version) {
    let version = 'unknown';
    try {
      version = String(JSON.parse((await ctx.io.read(`${ctx.root}/.claude-plugin/plugin.json`)) ?? '{}').version ?? version);
    } catch {}
    return { code: 0, out: `kref ${version}\n`, err: '' };
  }
  if (parsed.positionals.length > 1) return fail(2, 'usage', 'kref takes one code or prefix, such as F3 or F');
  const query = parsed.positionals[0];
  const m = query === undefined ? null : CODE.exec(query);
  if (query !== undefined && !m) return fail(2, 'usage', `${query} is not a code or a code prefix, such as F3 or F`);
  const want = (i: Item) =>
    !m || (i.prefix.toUpperCase() === m[1].toUpperCase() && (!m[2] || i.n === Number(m[2])));

  const data = ctx.env.KATHARSIS_DATA || `${ctx.home}/.claude/katharsis-data`;
  const config = ctx.env.CLAUDE_CONFIG_DIR || `${ctx.home}/.claude`;
  const io = ctx.io;

  // Every session the ledger or a record knows, with its own codes.
  const own = new Map<string, Item[]>();
  for (const [id, texts] of await ledgerTexts(io, data)) if (SESSION_ID.test(id)) own.set(id, itemsOf(texts));
  const records = new Map<string, SessionRecord>();
  for (const e of await io.list(`${data}/sessions`)) {
    const id = e.name.replace(/\.json$/, '');
    if (id === e.name || !SESSION_ID.test(id)) continue;
    const r = await readRecord(io, data, id);
    if (r) records.set(id, r);
  }

  // Each index loads once, as a promise, so concurrent lookups share it.
  let history: Promise<Map<string, string>> | undefined;
  const historyCwd = async (id: string) => {
    history ??= io.read(`${config}/history.jsonl`).then((text) => {
      const map = new Map<string, string>();
      for (const line of (text ?? '').split('\n')) {
        if (!line.includes('"sessionId"')) continue;
        try {
          const r = JSON.parse(line) as { sessionId?: unknown; project?: unknown };
          if (typeof r.sessionId === 'string' && typeof r.project === 'string') map.set(r.sessionId, r.project);
        } catch {}
      }
      return map;
    });
    return (await history).get(id);
  };
  let transcripts: Promise<Map<string, string>> | undefined;
  const transcriptOf = async (id: string) => {
    const known = records.get(id)?.transcript;
    if (known) return known;
    transcripts ??= (async () => {
      const map = new Map<string, string>();
      const projects = `${config}/projects`;
      for (const d of await io.list(projects)) {
        if (d.kind !== 'dir') continue;
        for (const e of await io.list(`${projects}/${d.name}`)) {
          if (e.name.endsWith('.jsonl')) map.set(e.name.slice(0, -6), `${projects}/${d.name}/${e.name}`);
        }
      }
      return map;
    })();
    return (await transcripts).get(id);
  };

  // What scoping needs: the record's fields, else the ledger's times, and
  // the folder from history.jsonl only when a rule will compare folders.
  const base = async (id: string, needCwd: boolean): Promise<SessionInfo> => {
    const r = records.get(id);
    const items = own.get(id) ?? [];
    const times = [r?.updated, ...items.map((i) => i.ts)].map(parseTime).filter((t) => t !== undefined);
    const firsts = [r?.started, ...items.map((i) => i.ts)].map(parseTime).filter((t) => t !== undefined);
    return {
      id,
      cwd: r?.cwd ?? (needCwd ? await historyCwd(id) : undefined),
      branch: r?.branch,
      title: r?.title,
      titleSource: r?.title ? r.titleSource : undefined,
      started: iso(firsts.length ? Math.min(...firsts) : undefined),
      updated: iso(times.length ? Math.max(...times) : undefined),
      codes: items.length,
    };
  };
  // What a header needs on top: the folder, the branch and a title for a
  // session with no Katharsis title yet.
  const named = async (s: SessionInfo): Promise<SessionInfo> => {
    const out = { ...s, cwd: s.cwd ?? (await historyCwd(s.id)) };
    if (!out.title || !out.branch) {
      const path = await transcriptOf(s.id);
      const tail = path ? await ctx.tail(path, 64 * 1024) : null;
      if (tail) {
        out.branch ??= lastField(tail, 'gitBranch');
        const t = out.title ? undefined : lastField(tail, 'aiTitle');
        if (t && !HANDOFF_TITLE.test(t)) Object.assign(out, { title: t, titleSource: 'claude-code' });
      }
      const first = [...(own.get(s.id) ?? [])].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))[0];
      if (!out.title && first) Object.assign(out, { title: first.title, titleSource: 'ledger' });
    }
    return out;
  };

  const env = ctx.env.CLAUDE_CODE_SESSION_ID;
  const needCwd = f.session === undefined && !f.all && !(env && SESSION_ID.test(env));
  const infos = await Promise.all([...new Set([...own.keys(), ...records.keys()])].map((id) => base(id, needCwd)));
  const sc = scope({ ref: f.session, all: f.all, env, cwd: ctx.cwd, home: ctx.home, sessions: infos });
  if (sc.kind === 'error') return fail(sc.code === 'not_found' ? 1 : 2, sc.code, sc.message);

  // Text output.
  const width = ctx.tty ? Math.max(40, Math.min(ctx.cols || 100, 100)) : 100;
  const folder = (p: string | undefined) =>
    p === undefined ? '' : p === ctx.home ? '~' : p.startsWith(`${ctx.home}/`) ? `~${p.slice(ctx.home.length)}` : p;
  const header = (s: SessionInfo) =>
    [oneLine(s.title ?? '') || s.id.slice(0, 8), folder(s.cwd), s.branch ? oneLine(s.branch) : '', age(s.updated, ctx.now)]
      .filter(Boolean)
      .join(' · ');
  const block = (i: Item, indent: string, stamp: string): string[] => {
    const head = `${indent}${i.code}  ${stamp}`;
    const lines = wrap(oneLine(i.title), head, ' '.repeat(head.length), width);
    if (f.short) return lines;
    const inner = `${indent}    `;
    for (const para of clean(i.summary).split(/\n+/).filter((p) => p.trim())) lines.push(...wrap(para, inner, inner, width));
    for (const o of i.options) lines.push(...wrap(oneLine(o.text), `${inner}${oneLine(o.key)}. `, `${inner}   `, width));
    if (i.rec) lines.push(...wrap(oneLine(i.rec), `${inner}-> `, `${inner}   `, width));
    return lines;
  };
  const gap = f.short ? [] : [''];
  const flat = (items: Item[], indent: string, dated: boolean) => {
    const sorted = f.chrono ? [...items].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0)) : items;
    return sorted.flatMap((i, k) => [
      ...(k > 0 ? gap : []),
      ...block(i, indent, f.chrono ? `${i.ts.slice(0, 16).replace('T', ' ')}  ` : dated ? `${i.ts.slice(0, 10)}  ` : ''),
    ]);
  };
  // A session's codes by section, or one flat list for --chrono or a query.
  const body = (items: Item[], dated: boolean) =>
    m || f.chrono
      ? flat(items, '', dated)
      : sections(items).flatMap((sec, k) => [...(k > 0 ? [''] : []), sec.name, ...flat(sec.items, '  ', dated)]);

  // A code the scope lacks: the newest sessions that define it.
  const elsewhere = async (skip: string[], lead: string, scopeDoc: object): Promise<Result> => {
    const hits = [...infos]
      .filter((s) => !skip.includes(s.id) && (own.get(s.id) ?? []).some(want))
      .sort((a, b) => ((a.updated ?? '') < (b.updated ?? '') ? 1 : -1))
      .slice(0, LOOKUP_CAP);
    if (hits.length === 0) return fail(1, 'not_found', `${query} isn't in the ledger`, scopeDoc);
    const shown = await Promise.all(hits.map(named));
    const items = hits.flatMap((s) => (own.get(s.id) ?? []).filter(want));
    if (asJson) return { code: 0, out: dump(document(scopeDoc, items, shown, null)), err: '' };
    const out = shown.flatMap((s, k) => [...(k > 0 ? [''] : []), header(s), '', ...body((own.get(s.id) ?? []).filter(want), false)]);
    return { code: 0, out: `${out.join('\n')}\n`, err: `${lead}\n` };
  };

  if (sc.kind === 'all') {
    const scopeDoc = { kind: 'all', reason: sc.reason };
    const hits = [...infos].filter((s) => (own.get(s.id) ?? []).some(want)).sort((a, b) => ((a.updated ?? '') < (b.updated ?? '') ? 1 : -1));
    if (hits.length === 0) return fail(1, 'not_found', query ? `${query} isn't in the ledger` : 'the ledger is empty', scopeDoc);
    const shown = await Promise.all(hits.map(named));
    const items = hits.flatMap((s) => (own.get(s.id) ?? []).filter(want));
    if (asJson) return { code: 0, out: dump(document(scopeDoc, items, shown, null)), err: '' };
    const out = shown.flatMap((s, k) => [...(k > 0 ? [''] : []), header(s), '', ...body((own.get(s.id) ?? []).filter(want), false)]);
    return { code: 0, out: `${out.join('\n')}\n`, err: '' };
  }

  if (sc.kind === 'sessions') {
    const scopeDoc = { kind: 'sessions', reason: sc.reason };
    if (query) return elsewhere([], `Sessions that define ${query}, newest first:`, scopeDoc);
    const list = await Promise.all(sc.sessions.map(named));
    if (list.length === 0) return fail(1, 'not_found', `no session ran at or under ${folder(ctx.cwd)}`, scopeDoc);
    if (asJson) return { code: 0, out: dump(document(scopeDoc, [], list, null)), err: '' };
    const rows = list.map((s, k) =>
      [
        `${String(k + 1).padStart(2)}`,
        oneLine(s.title ?? '') || '(untitled)',
        folder(s.cwd),
        s.branch ? oneLine(s.branch) : '-',
        age(s.updated, ctx.now),
        `${s.codes} code${s.codes === 1 ? '' : 's'}`,
        s.id.slice(0, 8),
      ].join('  '),
    );
    const lead = `No session is chosen here. The ${list.length} newest at or under ${folder(ctx.cwd)}; open one with kref --session <id>:`;
    return { code: 0, out: `${rows.join('\n')}\n`, err: `${lead}\n` };
  }

  // One session and its handoff ancestors.
  const ids = await thread(io, data, sc.id);
  const kind = ids.length > 1 ? 'thread' : 'session';
  const info = await named(infos.find((s) => s.id === sc.id) ?? (await base(sc.id, false)));
  const scopeDoc = { kind, reason: sc.reason, session: { ...info, thread: ids } };
  const items = (await threadItems(io, data, sc.id)).filter(want);
  if (items.length === 0 && query) return elsewhere(ids, `${query} isn't in this ${kind}. The newest sessions that define it:`, scopeDoc);
  if (asJson) {
    return { code: items.length ? 0 : 1, out: dump(document(scopeDoc, items, [], null)), err: '' };
  }
  const notes = [
    ...(sc.more > 0 ? [`${sc.more} more session${sc.more === 1 ? '' : 's'} here: kref sessions`] : []),
    ...(items.length === 0 ? [`No codes yet in this ${kind}.`] : []),
  ];
  const out = [header(info), ...(items.length ? ['', ...body(items, kind === 'thread')] : [])];
  return { code: items.length ? 0 : 1, out: `${out.join('\n')}\n`, err: notes.map((n) => `${n}\n`).join('') };
}

const self = fileURLToPath(import.meta.url);
const invoked = (() => {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(self);
  } catch {
    return false;
  }
})();

if (invoked) {
  const io: Io = {
    read: (p) => readFile(p, 'utf8').catch(() => null),
    list: async (d) => {
      try {
        return (await readdir(d, { withFileTypes: true })).map((e) => ({ name: e.name, kind: e.isDirectory() ? 'dir' : 'file' }));
      } catch {
        return [];
      }
    },
  };
  const tail = async (p: string, bytes: number) => {
    const fh = await open(p, 'r').catch(() => null);
    if (!fh) return null;
    try {
      const { size } = await fh.stat();
      const len = Math.min(size, bytes);
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, size - len);
      return buf.toString('utf8');
    } catch {
      return null;
    } finally {
      await fh.close();
    }
  };
  const r = await run(process.argv.slice(2), {
    env: process.env,
    cwd: process.cwd(),
    home: process.env.HOME || homedir(),
    root: dirname(dirname(self)),
    now: new Date(),
    tty: Boolean(process.stdout.isTTY),
    cols: process.stdout.columns ?? 100,
    io,
    tail,
  });
  process.stdout.write(r.out);
  process.stderr.write(r.err);
  process.exitCode = r.code;
}
