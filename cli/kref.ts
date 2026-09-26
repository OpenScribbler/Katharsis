// kref.ts: the ledger reader for a terminal or an agent, run by node 22.18
// or later with no dependencies. It reads through hooks/ledger.ts, the same
// module the drawer and the prompt hook use, so the three never disagree on
// what a code says or where numbering resumes.
//
// A bare kref shows exactly one session and names it, chosen by the scoping
// rules in ledger.ts: a flag, then the Claude Code session it runs inside,
// then the newest session in this folder, then the sessions below it, as a
// picker in a terminal and as a list anywhere else. A code the scope lacks is
// looked up in the 5 newest sessions that define it rather than widening
// silently. kref search matches text across every session, and kref sessions
// lists them.
//
// Ledger text is model-written, so every printed title and body is stripped
// of control characters and bidi overrides, --json names its untrusted
// fields, and --html escapes every HTML metacharacter on a page whose CSP
// allows no script. Results go to stdout, messages about scope and errors to
// stderr, and exit codes follow grep: 0 a result, 1 no match, 2 a usage error.
//
// Sessions recorded before session records existed are named from Claude
// Code's own files at lookup time, and nothing here writes but the --html
// page: the folder from history.jsonl, the branch and title from the
// transcript's last 64 KB, and the first coded line's title when Claude
// Code's title only says the session continued a handoff.

import { spawn, spawnSync } from 'node:child_process';
import { accessSync, constants, realpathSync } from 'node:fs';
import { chmod, mkdir, open, readdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { createInterface, type Interface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  below,
  itemsOf,
  LIST_CAP,
  ledgerTexts,
  readRecord,
  scope,
  search,
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
  // Shows text on the terminal and returns the line typed, or null at the
  // end of input. Present only when stdin and stdout are both terminals.
  ask?: (text: string) => Promise<string | null>;
  // Writes a page named name into dir, opens it, and returns its path.
  page(dir: string, name: string, html: string): Promise<string>;
};
export type Result = { code: number; out: string; err: string };
type ErrorCode = 'not_found' | 'ambiguous_session' | 'usage' | 'io';
type Group = { info: SessionInfo; items: Item[]; dated: boolean };

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
  kref search <text>       every code whose title, body or options mention text
  kref sessions            the sessions at or under this folder, newest first
  kref --session <ref>     a session by ID, a prefix of 8 or more characters, or last
  kref --all               every session, with no cap on lists

Flags
  --here                   narrow search to the session kref would show here
  --short                  titles only
  --chrono                 one flat list in the order the codes were written
  --json                   one JSON document on stdout, schema ${SCHEMA}
  --html                   write the result as a page and open it
  -h, --help               this text
  --version                the Katharsis version

Inside Claude Code, kref reads that session and its handoff ancestors. Elsewhere it reads
the newest session that ran in this folder, or offers the sessions below it.

Exit codes: 0 a result, 1 no match, 2 a usage error or a failure.
`;

// Every C0 and C1 control character but newline and tab, which drops every
// escape sequence, and the bidi overrides.
const UNSAFE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/g;
export const clean = (s: string) => s.replace(UNSAFE, '');
const oneLine = (s: string) => clean(s).replace(/\s*\n\s*/g, ' ').trim();
const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string) => clean(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
// Backticks and bold survive as markup, applied after escaping.
const inline = (s: string) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

const parseTime = (s: string | undefined) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? undefined : t;
};
const iso = (t: number | undefined) => (t === undefined ? undefined : new Date(t).toISOString());
const newestFirst = (a: SessionInfo, b: SessionInfo) => ((a.updated ?? '') < (b.updated ?? '') ? 1 : -1);
const byTime = (a: Item, b: Item) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);

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

// The page's style. The tabs are radio buttons, so the
// page switches views with no script and its CSP can forbid every script.
const STYLE = `:root{color-scheme:light dark;--fg:#1c1c1c;--muted:#6b6b6b;--rule:#ddd;--bg:#fbfbf9;--code:#eef1f5}
@media(prefers-color-scheme:dark){:root{--fg:#e8e8e8;--muted:#9a9a9a;--rule:#333;--bg:#161616;--code:#24282e}}
body{margin:0 auto;max-width:60rem;padding:2rem 1.5rem;font:15px/1.5 system-ui,sans-serif;color:var(--fg);background:var(--bg)}
h1{font-size:1.25rem;margin:0 0 1.5rem}
h3{font-size:.95rem;margin:1.25rem 0 .35rem;color:var(--muted)}
details{margin:1rem 0;border:1px solid var(--rule);border-radius:6px;padding:.25rem 1rem}
summary{cursor:pointer;font-weight:600;padding:.5rem 0}
.tabs{display:flex;gap:.25rem;border-bottom:1px solid var(--rule);margin-bottom:1rem}
.tabs label{padding:.4rem .9rem;cursor:pointer;border:1px solid transparent;border-bottom:0;border-radius:6px 6px 0 0;color:var(--muted)}
input.tab{position:absolute;opacity:0;pointer-events:none}
.pane{display:none}
#t-sections:checked~.tabs label[for=t-sections],#t-chrono:checked~.tabs label[for=t-chrono]{color:var(--fg);border-color:var(--rule);background:var(--bg);margin-bottom:-1px;font-weight:600}
#t-sections:focus-visible~.tabs label[for=t-sections],#t-chrono:focus-visible~.tabs label[for=t-chrono]{outline:2px solid var(--fg)}
#t-sections:checked~#p-sections,#t-chrono:checked~#p-chrono{display:block}
table{border-collapse:collapse;width:100%}
th{text-align:left;padding:.35rem .5rem;border-bottom:2px solid var(--rule);color:var(--muted);font-weight:600}
td{vertical-align:top;padding:.35rem .5rem;border-bottom:1px solid var(--rule)}
td.code{white-space:nowrap;font-family:ui-monospace,monospace;font-weight:600;width:4rem}
td.when,td.sess{white-space:nowrap;color:var(--muted);font-family:ui-monospace,monospace}
.title{font-weight:600} .summary{color:var(--muted);margin:.15rem 0 0}
.opts{list-style:none;margin:.25rem 0 0;padding-left:1.25rem} .opts li{margin:.1rem 0}
.opts .key{font-weight:600;margin-right:.35rem} .rec{margin-top:.25rem}
code{background:var(--code);padding:0 .25em;border-radius:3px;font-size:.9em}`;

const document_ = (title: string, body: string) => `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
${STYLE}
</style>
<body>
<h1>${esc(title)}</h1>
${body}
</body>
</html>
`;

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
        here: { type: 'boolean' },
        short: { type: 'boolean' },
        chrono: { type: 'boolean' },
        json: { type: 'boolean' },
        html: { type: 'boolean' },
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

  // Subcommand names are 5 letters or more, so they never collide with a
  // code prefix, which is 4 at most.
  const [first, ...rest] = parsed.positionals;
  const command = first === 'search' || first === 'sessions' ? first : undefined;
  const text = command === 'search' ? rest.join(' ').trim() : '';
  if (command === 'search' && !text) return fail(2, 'usage', 'kref search takes the text to find, such as kref search keytab');
  if (command === 'sessions' && (rest.length || f.session !== undefined)) {
    return fail(2, 'usage', 'kref sessions takes no arguments; open a session with kref --session <id>');
  }
  if (f.here && command !== 'search') return fail(2, 'usage', '--here narrows kref search to the current scope');
  if (f.json && f.html) return fail(2, 'usage', '--json and --html are two outputs; pick one');
  if (!command && parsed.positionals.length > 1) return fail(2, 'usage', 'kref takes one code or prefix, such as F3 or F');
  const query = command ? undefined : first;
  const m = query === undefined ? null : CODE.exec(query);
  if (query !== undefined && !m) return fail(2, 'usage', `${query} is not a code or a code prefix, such as F3 or F`);
  const want = (i: Item) =>
    !m || (i.prefix.toUpperCase() === m[1].toUpperCase() && (!m[2] || i.n === Number(m[2])));

  const data = ctx.env.KATHARSIS_DATA || `${ctx.home}/.claude/katharsis-data`;
  const config = ctx.env.CLAUDE_CONFIG_DIR || `${ctx.home}/.claude`;
  const io = ctx.io;
  const here = ctx.cwd.length > 1 ? ctx.cwd.replace(/\/+$/, '') : ctx.cwd;

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
      const first = [...(own.get(s.id) ?? [])].sort(byTime)[0];
      if (!out.title && first) Object.assign(out, { title: first.title, titleSource: 'ledger' });
    }
    return out;
  };

  const env = ctx.env.CLAUDE_CODE_SESSION_ID;
  const scoped = command !== 'search' || f.here || f.session !== undefined;
  const needCwd =
    command === 'sessions' || (scoped && f.session === undefined && !f.all && !(env && SESSION_ID.test(env)));
  const infos = await Promise.all([...new Set([...own.keys(), ...records.keys()])].map((id) => base(id, needCwd)));
  const sc = scope({ ref: f.session, all: f.all, env, cwd: here, home: ctx.home, sessions: infos });
  if (sc.kind === 'error') return fail(sc.code === 'not_found' ? 1 : 2, sc.code, sc.message);

  // Text output.
  const width = ctx.tty ? Math.max(40, Math.min(ctx.cols || 100, 100)) : 100;
  const folder = (p: string | undefined) =>
    p === undefined ? '' : p === ctx.home ? '~' : p.startsWith(`${ctx.home}/`) ? `~${p.slice(ctx.home.length)}` : p;
  // A listed session's folder, relative to where kref runs when it's below.
  const rel = (p: string | undefined) =>
    p === undefined ? '' : p === here ? '.' : here !== '/' && p.startsWith(`${here}/`) ? p.slice(here.length + 1) : folder(p);
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
  const flatView = Boolean(m) || command === 'search' || Boolean(f.chrono);
  const flat = (items: Item[], indent: string, dated: boolean) => {
    const sorted = f.chrono ? [...items].sort(byTime) : items;
    return sorted.flatMap((i, k) => [
      ...(k > 0 ? gap : []),
      ...block(i, indent, f.chrono ? `${i.ts.slice(0, 16).replace('T', ' ')}  ` : dated ? `${i.ts.slice(0, 10)}  ` : ''),
    ]);
  };
  // A session's codes by section, or one flat list for --chrono, a query or
  // a search.
  const body = (items: Item[], dated: boolean) =>
    flatView
      ? flat(items, '', dated)
      : sections(items).flatMap((sec, k) => [...(k > 0 ? [''] : []), sec.name, ...flat(sec.items, '  ', dated)]);
  const rows = (list: SessionInfo[]) =>
    list.map((s, k) =>
      [
        `${String(k + 1).padStart(2)}`,
        oneLine(s.title ?? '') || '(untitled)',
        rel(s.cwd) || '-',
        s.branch ? oneLine(s.branch) : '-',
        age(s.updated, ctx.now),
        `${s.codes} code${s.codes === 1 ? '' : 's'}`,
        s.id.slice(0, 8),
      ].join('  '),
    );

  // The page: every session collapsible, one tab by section and one in the
  // order the codes were written.
  const itemRow = (i: Item, lead: string) => {
    const detail = f.short
      ? ''
      : [
          ...clean(i.summary).split(/\n+/).filter((p) => p.trim()).map((p) => `<p class="summary">${inline(p)}</p>`),
          i.options.length
            ? `<ul class="opts">${i.options.map((o) => `<li><span class="key">${esc(o.key)}.</span>${inline(o.text)}</li>`).join('')}</ul>`
            : '',
          i.rec ? `<div class="rec">&rarr; ${inline(i.rec)}</div>` : '',
        ].join('');
    return `<tr>${lead}<td class="code">${esc(i.code)}</td><td><div class="title">${inline(i.title)}</div>${detail}</td></tr>`;
  };
  const table = (items: Item[], dated: boolean) =>
    `<table>${items.map((i) => itemRow(i, dated ? `<td class="when">${esc(i.ts.slice(0, 10))}</td>` : '')).join('')}</table>`;
  const groupHtml = (g: Group) =>
    flatView
      ? table(g.items, g.dated)
      : sections(g.items)
          .map((sec) => `<h3>${esc(sec.name)}</h3>${table(sec.items, g.dated)}`)
          .join('\n');
  const pageOf = (title: string, groups: Group[]) => {
    const bySection =
      groups.length === 1
        ? `<p>${esc(header(groups[0].info))}</p>\n${groupHtml(groups[0])}`
        : groups
            .map((g, k) => `<details${k === 0 ? ' open' : ''}><summary>${esc(header(g.info))}</summary>\n${groupHtml(g)}\n</details>`)
            .join('\n');
    const many = new Set(groups.flatMap((g) => g.items.map((i) => i.session))).size > 1;
    const chrono = `<table>${groups
      .flatMap((g) => g.items)
      .sort(byTime)
      .map((i) =>
        itemRow(
          i,
          `<td class="when">${esc(i.ts.slice(0, 16).replace('T', ' '))}</td>${many ? `<td class="sess">${esc(i.session.slice(0, 8))}</td>` : ''}`,
        ),
      )
      .join('')}</table>`;
    return document_(
      title,
      `<input class="tab" type="radio" name="view" id="t-sections" checked>
<input class="tab" type="radio" name="view" id="t-chrono">
<div class="tabs"><label for="t-sections">${flatView ? 'Results' : 'By section'}</label><label for="t-chrono">In writing order</label></div>
<div class="pane" id="p-sections">
${bySection}
</div>
<div class="pane" id="p-chrono">
${chrono}
</div>`,
    );
  };
  const listPage = (title: string, list: SessionInfo[]) =>
    document_(
      title,
      `<table><tr><th>#</th><th>Session</th><th>Folder</th><th>Branch</th><th>Last reply</th><th>Codes</th><th>ID</th></tr>
${list
  .map(
    (s, k) =>
      `<tr><td>${k + 1}</td><td class="title">${esc(oneLine(s.title ?? '') || '(untitled)')}</td><td>${esc(folder(s.cwd))}</td>` +
      `<td>${esc(s.branch ?? '')}</td><td>${esc(age(s.updated, ctx.now))}</td><td>${s.codes}</td><td class="sess">${esc(s.id)}</td></tr>`,
  )
  .join('\n')}
</table>`,
    );
  const publish = async (name: string, html: string, err = ''): Promise<Result> => {
    try {
      const file = `${name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'kref'}.html`;
      return { code: 0, out: `${await ctx.page(`${data}/kref-out`, file, html)}\n`, err };
    } catch (e) {
      return fail(2, 'io', `couldn't write the page: ${(e as Error).message}`);
    }
  };

  // Every output of codes, grouped by session.
  const showGroups = async (
    scopeDoc: object,
    groups: Group[],
    listed: SessionInfo[],
    title: string,
    name: string,
    err = '',
  ): Promise<Result> => {
    const items = groups.flatMap((g) => g.items);
    const code = items.length ? 0 : 1;
    if (asJson) return { code, out: dump(document(scopeDoc, items, listed, null)), err: '' };
    if (f.html && items.length) return publish(name, pageOf(title, groups), err);
    const out = groups.flatMap((g, k) => [
      ...(k > 0 ? [''] : []),
      header(g.info),
      ...(g.items.length ? ['', ...body(g.items, g.dated)] : []),
    ]);
    return { code, out: `${out.join('\n')}\n`, err };
  };
  const showList = (scopeDoc: object, list: SessionInfo[], lead: string, name: string): Promise<Result> | Result => {
    if (asJson) return { code: 0, out: dump(document(scopeDoc, [], list, null)), err: '' };
    if (f.html) return publish(name, listPage(`kref: sessions at or under ${folder(here)}`, list));
    return { code: 0, out: `${rows(list).join('\n')}\n`, err: `${lead}\n` };
  };
  const codesOf = (id: string) => (own.get(id) ?? []).filter(want);

  // One session and its handoff ancestors.
  const thisThread = async (id: string, reason: string) => {
    const ids = await thread(io, data, id);
    const kind = ids.length > 1 ? 'thread' : 'session';
    const info = await named(infos.find((s) => s.id === id) ?? (await base(id, false)));
    return { ids, kind, info, scopeDoc: { kind, reason, session: { ...info, thread: ids } } };
  };
  const showSession = async (id: string, reason: string, more: number): Promise<Result> => {
    const { ids, kind, info, scopeDoc } = await thisThread(id, reason);
    const items = (await threadItems(io, data, id)).filter(want);
    if (items.length === 0 && query) return elsewhere(ids, `${query} isn't in this ${kind}. The newest sessions that define it:`, scopeDoc);
    const notes = [
      ...(more > 0 ? [`${more} more session${more === 1 ? '' : 's'} here: kref sessions`] : []),
      ...(items.length === 0 ? [`No codes yet in this ${kind}.`] : []),
    ];
    const title = query ? `kref ${query}: ${header(info)}` : header(info);
    return showGroups(scopeDoc, [{ info, items, dated: kind === 'thread' }], [], title, `${id.slice(0, 8)}-${query ?? 'session'}`, notes.map((n) => `${n}\n`).join(''));
  };

  // A code the scope lacks: the newest sessions that define it.
  const elsewhere = async (skip: string[], lead: string, scopeDoc: object): Promise<Result> => {
    const hits = [...infos]
      .filter((s) => !skip.includes(s.id) && codesOf(s.id).length)
      .sort(newestFirst)
      .slice(0, f.all ? undefined : LOOKUP_CAP);
    if (hits.length === 0) return fail(1, 'not_found', `${query} isn't in the ledger`, scopeDoc);
    const shown = await Promise.all(hits.map(named));
    const groups = shown.map((info) => ({ info, items: codesOf(info.id), dated: false }));
    return showGroups(scopeDoc, groups, shown, `kref ${query}`, `elsewhere-${query}`, `${lead}\n`);
  };

  // A session list in a terminal: type a number to open one, or text to
  // filter every session at or under this folder by title and folder.
  const pick = async (ask: (text: string) => Promise<string | null>, initial: SessionInfo[]): Promise<string | null> => {
    let pool: SessionInfo[] | undefined;
    let shown = initial;
    let filtered = false;
    let note = '';
    for (;;) {
      const answer = await ask(`${note}${rows(shown).join('\n')}\nNumber, or text to filter: `);
      note = '';
      if (answer === null) return null;
      const a = answer.trim();
      if (/^\d+$/.test(a)) {
        const s = shown[Number(a) - 1];
        if (s) return s.id;
        note = `No session ${a} in this list.\n`;
      } else if (!a) {
        if (!filtered) return null;
        [shown, filtered] = [initial, false];
      } else {
        pool ??= await Promise.all(below(infos, here).map(named));
        const needle = a.toLowerCase();
        const hits = pool.filter((s) => `${s.title ?? ''}\n${s.cwd ?? ''}`.toLowerCase().includes(needle)).slice(0, LIST_CAP);
        if (hits.length) [shown, filtered] = [hits, true];
        else note = `No session title or folder contains "${oneLine(a)}".\n`;
      }
    }
  };

  if (command === 'sessions') {
    const scopeDoc = { kind: 'sessions', reason: f.all ? '--all' : 'sessions' };
    const pool = f.all ? [...infos].sort(newestFirst) : below(infos, here).slice(0, LIST_CAP);
    if (pool.length === 0) return fail(1, 'not_found', `no session ran at or under ${folder(here)}`, scopeDoc);
    return showList(scopeDoc, await Promise.all(pool.map(named)), 'Open one with kref --session <id>.', 'sessions');
  }

  if (command === 'search') {
    const title = `kref search: ${text}`;
    const name = `search-${text}`;
    const fail0 = (scopeDoc: object) => fail(1, 'not_found', `no code mentions "${oneLine(text)}"`, scopeDoc);
    if (scoped && sc.kind === 'session') {
      const { kind, info, scopeDoc } = await thisThread(sc.id, sc.reason);
      const items = search(await threadItems(io, data, sc.id), text);
      if (!items.length) return fail0(scopeDoc);
      return showGroups(scopeDoc, [{ info, items, dated: kind === 'thread' }], [], title, name);
    }
    const list = scoped && sc.kind === 'sessions';
    const scopeDoc = list ? { kind: 'sessions', reason: sc.reason } : { kind: 'all', reason: sc.kind === 'all' ? sc.reason : 'search' };
    const pool = list ? below(infos, here) : [...infos].sort(newestFirst);
    const hits = pool.filter((s) => search(own.get(s.id) ?? [], text).length);
    if (!hits.length) return fail0(scopeDoc);
    const shown = await Promise.all(hits.map(named));
    const groups = shown.map((info) => ({ info, items: search(own.get(info.id) ?? [], text), dated: false }));
    return showGroups(scopeDoc, groups, shown, title, name);
  }

  if (sc.kind === 'all') {
    const scopeDoc = { kind: 'all', reason: sc.reason };
    const hits = [...infos].filter((s) => codesOf(s.id).length).sort(newestFirst);
    if (hits.length === 0) return fail(1, 'not_found', query ? `${query} isn't in the ledger` : 'the ledger is empty', scopeDoc);
    const shown = await Promise.all(hits.map(named));
    const groups = shown.map((info) => ({ info, items: codesOf(info.id), dated: false }));
    return showGroups(scopeDoc, groups, shown, query ? `kref ${query}` : 'kref: every session', `all-${query ?? 'sessions'}`);
  }

  if (sc.kind === 'sessions') {
    const scopeDoc = { kind: 'sessions', reason: sc.reason };
    if (query) return elsewhere([], `Sessions that define ${query}, newest first:`, scopeDoc);
    const list = await Promise.all(sc.sessions.map(named));
    if (list.length === 0) return fail(1, 'not_found', `no session ran at or under ${folder(here)}`, scopeDoc);
    // A terminal gets a picker; an agent or a pipe gets the list as data.
    if (ctx.ask && !asJson) {
      const id = await pick(ctx.ask, list);
      return id ? showSession(id, 'picker', 0) : { code: 0, out: '', err: '' };
    }
    const lead = `No session is chosen here. The ${list.length} newest at or under ${folder(here)}; open one with kref --session <id>:`;
    return showList(scopeDoc, list, lead, 'sessions');
  }

  return showSession(sc.id, sc.reason, sc.more);
}

const self = fileURLToPath(import.meta.url);
const invoked = (() => {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(self);
  } catch {
    return false;
  }
})();

// True when cmd is an executable on PATH.
const onPath = (cmd: string) =>
  (process.env.PATH ?? '').split(':').some((d) => {
    try {
      accessSync(`${d}/${cmd}`, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });

// Opens a file in the default browser. Every opener gets an argument array,
// never a shell, so a path can't inject a command.
function launch(path: string) {
  const detach = (cmd: string, args: string[]) => {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  };
  if (process.platform === 'win32') return detach('cmd', ['/c', 'start', '', path]);
  if (process.platform === 'darwin') return detach('open', [path]);
  if (onPath('wslview')) return detach('wslview', [path]);
  if (onPath('explorer.exe') && onPath('wslpath')) {
    const win = spawnSync('wslpath', ['-w', path], { encoding: 'utf8' }).stdout?.trim();
    if (win) return detach('explorer.exe', [win]);
  }
  if (onPath('xdg-open')) detach('xdg-open', [path]);
}

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
  // The page stays readable by its owner alone: the folder is 0700 and the
  // file 0600, set again in case either existed with a wider mode.
  const page = async (dir: string, name: string, html: string) => {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await chmod(dir, 0o700);
    const path = `${dir}/${name}`;
    await writeFile(path, html, { mode: 0o600 });
    await chmod(path, 0o600);
    if (!process.env.KREF_NO_OPEN) launch(path);
    return path;
  };
  // The picker's prompt goes to stderr, so stdout carries only the result.
  let rl: Interface | undefined;
  let closed = false;
  let pending: ((line: string | null) => void) | undefined;
  const ask = (text: string) =>
    new Promise<string | null>((resolve) => {
      if (!rl) {
        rl = createInterface({ input: process.stdin, output: process.stderr });
        rl.on('SIGINT', () => rl?.close());
        rl.on('close', () => {
          closed = true;
          pending?.(null);
        });
      }
      if (closed) return resolve(null);
      pending = resolve;
      rl.question(text, (line) => {
        pending = undefined;
        resolve(line);
      });
    });
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
    ask: process.stdin.isTTY && process.stdout.isTTY ? ask : undefined,
    page,
  });
  rl?.close();
  process.stdout.write(r.out);
  process.stderr.write(r.err);
  process.exitCode = r.code;
}
