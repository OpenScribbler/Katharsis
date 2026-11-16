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
  BLOCK_CUT,
  BLOCK_CUT_ASIDE,
  clean,
  itemsOf,
  LIST_CAP,
  ledgerTexts,
  readSession,
  scope,
  search,
  sectionOf,
  sections,
  SESSION_ID,
  thread,
  threadItems,
  type Io,
  type Item,
  type Scope,
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
  'items[].block',
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
  kref search <text>       every code whose title, body, options, or command block mention text
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
const byTime = (a: Item, b: Item) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.seq - b.seq);

const ago = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

export function age(then: string | undefined, now: Date): string {
  const t = parseTime(then);
  if (t === undefined) return '';
  const min = Math.floor((now.getTime() - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return ago(min, 'minute');
  const h = Math.floor(min / 60);
  if (h < 24) return ago(h, 'hour');
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : ago(d, 'day');
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
.block{margin:.35rem 0 0;padding:.4rem .6rem;background:var(--code);border-radius:4px;overflow-x:auto;font:13px/1.4 ui-monospace,monospace}
.cut{color:var(--muted);font-style:italic;margin-top:.15rem}
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


// A text item's lines after its body: a question's options and recommendation,
// then a user step's command block at the left margin, line for line with its
// whitespace as written, so a heredoc's indentation and closing line survive a
// copy from the terminal. Control characters and bidi overrides are removed,
// as in every field kref prints, so a block that held one prints changed. A
// block the Stop hook cut says so after it.
function answerLines(i: Item, inner: string, width: number): string[] {
  const lines = i.options.flatMap((o) => wrap(oneLine(o.text), `${inner}${oneLine(o.key)}. `, `${inner}   `, width));
  if (i.rec) lines.push(...wrap(oneLine(i.rec), `${inner}-> `, `${inner}   `, width));
  if (i.block) lines.push(...clean(i.block).split('\n'));
  if (i.blockCut) lines.push(`${inner}${BLOCK_CUT_ASIDE}`);
  return lines;
}

// The page's same tail: the recommendation, then the command block, escaped
// and with control characters removed.
function answerHtml(i: Item): string {
  return (
    (i.rec ? `<div class="rec">&rarr; ${inline(i.rec)}</div>` : '') +
    (i.block ? `<pre class="block">${esc(i.block)}</pre>` : '') +
    (i.blockCut ? `<div class="cut">${BLOCK_CUT}</div>` : '')
  );
}

// Whether kref needs the folder it runs in: for kref sessions, and when the
// scoping rules fall through to that folder, the one rule that compares
// session folders.
function needsFolder(command: string | undefined, scoped: boolean, f: { session?: string; all?: boolean }, env: string | undefined): boolean {
  if (command === 'sessions') return true;
  if (!scoped || f.session !== undefined || f.all) return false;
  return !(env && SESSION_ID.test(env));
}

const OPTIONS = {
  session: { type: 'string' },
  all: { type: 'boolean' },
  here: { type: 'boolean' },
  short: { type: 'boolean' },
  chrono: { type: 'boolean' },
  json: { type: 'boolean' },
  html: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean' },
} as const;
type Flags = { session?: string; all?: boolean; here?: boolean; short?: boolean; chrono?: boolean; json?: boolean; html?: boolean; help?: boolean; version?: boolean };

// What the positionals ask for. Subcommand names are 5 letters or more, so
// they never collide with a code prefix, which is 4 at most.
type Request = { command?: 'search' | 'sessions'; text: string; query?: string; m: RegExpExecArray | null };

function usageError(command: Request['command'], text: string, positionals: string[], f: Flags): string | undefined {
  if (command === 'search' && !text) return 'kref search takes the text to find, such as kref search keytab';
  if (command === 'sessions' && (positionals.length > 1 || f.session !== undefined)) {
    return 'kref sessions takes no arguments; open a session with kref --session <id>';
  }
  if (f.here && command !== 'search') return '--here narrows kref search to the current scope';
  if (f.json && f.html) return '--json and --html are two outputs; pick one';
  if (!command && positionals.length > 1) return 'kref takes one code or prefix, such as F3 or F';
  return undefined;
}

// The request, or the usage error that stops it.
function request(positionals: string[], f: Flags): Request | string {
  const [first, ...rest] = positionals;
  const command = first === 'search' || first === 'sessions' ? first : undefined;
  const text = command === 'search' ? rest.join(' ').trim() : '';
  const bad = usageError(command, text, positionals, f);
  if (bad) return bad;
  const query = command ? undefined : first;
  const m = query === undefined ? null : CODE.exec(query);
  if (query !== undefined && !m) return `${query} is not a code or a code prefix, such as F3 or F`;
  return { command, text, query, m };
}

async function versionOf(ctx: Ctx): Promise<string> {
  try {
    return String(JSON.parse((await ctx.io.read(`${ctx.root}/.claude-plugin/plugin.json`)) ?? '{}').version ?? 'unknown');
  } catch {
    return 'unknown';
  }
}

// history.jsonl's folder for each session it names.
function historyMap(text: string | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of (text ?? '').split('\n').filter((l) => l.includes('"sessionId"'))) {
    try {
      const r = JSON.parse(line) as { sessionId?: unknown; project?: unknown };
      if (typeof r.sessionId === 'string' && typeof r.project === 'string') map.set(r.sessionId, r.project);
    } catch {}
  }
  return map;
}

// Every transcript under Claude Code's projects folder, by session ID.
async function transcriptMap(io: Io, config: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const projects = `${config}/projects`;
  for (const d of (await io.list(projects)).filter((x) => x.kind === 'dir')) {
    for (const e of await io.list(`${projects}/${d.name}`)) {
      if (e.name.endsWith('.jsonl')) map.set(e.name.slice(0, -6), `${projects}/${d.name}/${e.name}`);
    }
  }
  return map;
}

const itemDoc = (i: Item) => ({
  code: i.code,
  prefix: i.prefix,
  n: i.n,
  section: sectionOf(i),
  title: i.title,
  body: i.summary,
  options: i.options,
  rec: i.rec,
  block: i.block,
  block_cut: i.blockCut,
  session: i.session,
  ts: i.ts,
});

const timeOf = (list: (string | undefined)[]) => list.map(parseTime).filter((t) => t !== undefined);

type Label = { title: string; name: string; err?: string };
type Picker = { initial: SessionInfo[]; shown: SessionInfo[]; filtered: boolean; note: string };
type ScopeOf<K> = Extract<Scope, { kind: K }>;

// How a result leaves: one JSON document under --json, else text on stdout
// and messages on stderr.
class Out {
  readonly ctx: Ctx;
  readonly asJson: boolean;

  constructor(ctx: Ctx, asJson: boolean) {
    this.ctx = ctx;
    this.asJson = asJson;
  }

  dump(doc: object): string {
    return `${JSON.stringify(doc, null, this.ctx.tty ? 2 : undefined)}\n`;
  }

  document(scopeDoc: object | null, items: Item[], sessions: SessionInfo[], error: object | null) {
    return { schema: SCHEMA, scope: scopeDoc, untrusted: UNTRUSTED, items: items.map(itemDoc), sessions, error };
  }

  fail(code: number, kind: ErrorCode, message: string, scopeDoc: object | null = null): Result {
    if (this.asJson) return { code, out: this.dump(this.document(scopeDoc, [], [], { code: kind, message })), err: '' };
    return { code, out: '', err: `kref: ${message}\n` };
  }
}

// One run of kref over the ledger: every session the ledger or a record
// knows, with its own codes, and the request to answer from them.
class Kref extends Out {
  readonly data: string;
  readonly config: string;
  readonly io: Io;
  readonly here: string;
  readonly own = new Map<string, Item[]>();
  readonly records = new Map<string, SessionRecord>();
  infos: SessionInfo[] = [];
  // Each index loads once, as a promise, so concurrent lookups share it.
  history?: Promise<Map<string, string>>;
  transcripts?: Promise<Map<string, string>>;
  pool?: SessionInfo[];
  readonly f: Flags;
  readonly req: Request;

  constructor(ctx: Ctx, asJson: boolean, f: Flags, req: Request) {
    super(ctx, asJson);
    this.f = f;
    this.req = req;
    this.data = ctx.env.KATHARSIS_DATA || `${ctx.home}/.claude/katharsis-data`;
    this.config = ctx.env.CLAUDE_CONFIG_DIR || `${ctx.home}/.claude`;
    this.io = ctx.io;
    this.here = ctx.cwd.length > 1 ? ctx.cwd.replace(/\/+$/, '') : ctx.cwd;
  }

  async load(): Promise<void> {
    for (const [id, texts] of await ledgerTexts(this.io, this.data)) if (SESSION_ID.test(id)) this.own.set(id, itemsOf(texts));
    for (const e of await this.io.list(`${this.data}/sessions`)) await this.loadRecord(e.name);
  }

  async loadRecord(name: string): Promise<void> {
    const id = name.replace(/\.json$/, '');
    if (id === name || !SESSION_ID.test(id)) return;
    const r = await readSession(this.io, this.data, id);
    if (r) this.records.set(id, r);
  }

  want(i: Item): boolean {
    const m = this.req.m;
    return !m || (i.prefix.toUpperCase() === m[1].toUpperCase() && (!m[2] || i.n === Number(m[2])));
  }

  codesOf(id: string): Item[] {
    return (this.own.get(id) ?? []).filter((i) => this.want(i));
  }

  async historyCwd(id: string): Promise<string | undefined> {
    this.history ??= this.io.read(`${this.config}/history.jsonl`).then(historyMap);
    return (await this.history).get(id);
  }

  async transcriptOf(id: string): Promise<string | undefined> {
    const known = this.records.get(id)?.transcript;
    if (known) return known;
    this.transcripts ??= transcriptMap(this.io, this.config);
    return (await this.transcripts).get(id);
  }

  // What scoping needs: the record's fields, else the ledger's times, and
  // the folder from history.jsonl only when a rule will compare folders.
  async base(id: string, needCwd: boolean): Promise<SessionInfo> {
    const r = this.records.get(id);
    const items = this.own.get(id) ?? [];
    const times = timeOf([r?.updated, ...items.map((i) => i.ts)]);
    const firsts = timeOf([r?.started, ...items.map((i) => i.ts)]);
    return {
      id,
      cwd: r?.cwd ?? (needCwd ? await this.historyCwd(id) : undefined),
      branch: r?.branch,
      title: r?.title,
      titleSource: r?.title ? r.titleSource : undefined,
      started: iso(firsts.length ? Math.min(...firsts) : undefined),
      updated: iso(times.length ? Math.max(...times) : undefined),
      codes: items.length,
    };
  }

  // What a header needs on top: the folder, the branch and a title for a
  // session with no Katharsis title yet.
  async named(s: SessionInfo): Promise<SessionInfo> {
    const out = { ...s, cwd: s.cwd ?? (await this.historyCwd(s.id)) };
    if (out.title && out.branch) return out;
    await this.fromTranscript(out);
    const first = [...(this.own.get(s.id) ?? [])].sort(byTime)[0];
    if (!out.title && first) Object.assign(out, { title: first.title, titleSource: 'ledger' });
    return out;
  }

  async fromTranscript(out: SessionInfo): Promise<void> {
    const path = await this.transcriptOf(out.id);
    const tail = path ? await this.ctx.tail(path, 64 * 1024) : null;
    if (!tail) return;
    out.branch ??= lastField(tail, 'gitBranch');
    const t = out.title ? undefined : lastField(tail, 'aiTitle');
    if (t && !HANDOFF_TITLE.test(t)) Object.assign(out, { title: t, titleSource: 'claude-code' });
  }

  namedAll(list: SessionInfo[]): Promise<SessionInfo[]> {
    return Promise.all(list.map((s) => this.named(s)));
  }

  // Text output.
  get width(): number {
    return this.ctx.tty ? Math.max(40, Math.min(this.ctx.cols || 100, 100)) : 100;
  }

  get flatView(): boolean {
    return Boolean(this.req.m) || this.req.command === 'search' || Boolean(this.f.chrono);
  }

  folder(p: string | undefined): string {
    if (p === undefined) return '';
    const home = this.ctx.home;
    if (p === home) return '~';
    return oneLine(p.startsWith(`${home}/`) ? `~${p.slice(home.length)}` : p);
  }

  // A listed session's folder, relative to where kref runs when it's below.
  rel(p: string | undefined): string {
    if (p === undefined) return '';
    if (p === this.here) return '.';
    return this.here !== '/' && p.startsWith(`${this.here}/`) ? p.slice(this.here.length + 1) : this.folder(p);
  }

  header(s: SessionInfo): string {
    return [oneLine(s.title ?? '') || s.id.slice(0, 8), this.folder(s.cwd), s.branch ? oneLine(s.branch) : '', age(s.updated, this.ctx.now)]
      .filter(Boolean)
      .join(' · ');
  }

  block(i: Item, indent: string, stamp: string): string[] {
    const head = `${indent}${i.code}  ${stamp}`;
    const lines = wrap(oneLine(i.title), head, ' '.repeat(head.length), this.width);
    if (this.f.short) return lines;
    const inner = `${indent}    `;
    for (const para of clean(i.summary).split(/\n+/).filter((p) => p.trim())) lines.push(...wrap(para, inner, inner, this.width));
    return [...lines, ...answerLines(i, inner, this.width)];
  }

  stamp(i: Item, dated: boolean): string {
    if (this.f.chrono) return `${i.ts.slice(0, 16).replace('T', ' ')}  `;
    return dated ? `${i.ts.slice(0, 10)}  ` : '';
  }

  flat(items: Item[], indent: string, dated: boolean): string[] {
    const sorted = this.f.chrono ? [...items].sort(byTime) : items;
    const gap = this.f.short ? [] : [''];
    return sorted.flatMap((i, k) => [...(k > 0 ? gap : []), ...this.block(i, indent, this.stamp(i, dated))]);
  }

  // A session's codes by section, or one flat list for --chrono, a query or
  // a search.
  body(items: Item[], dated: boolean): string[] {
    if (this.flatView) return this.flat(items, '', dated);
    return sections(items).flatMap((sec, k) => [...(k > 0 ? [''] : []), oneLine(sec.name), ...this.flat(sec.items, '  ', dated)]);
  }

  rows(list: SessionInfo[]): string[] {
    return list.map((s, k) =>
      [
        `${String(k + 1).padStart(2)}`,
        oneLine(s.title ?? '') || '(untitled)',
        this.rel(s.cwd) || '-',
        s.branch ? oneLine(s.branch) : '-',
        age(s.updated, this.ctx.now),
        `${s.codes} code${s.codes === 1 ? '' : 's'}`,
        s.id.slice(0, 8),
      ].join('  '),
    );
  }

  // The page: every session collapsible, one tab by section and one in the
  // order the codes were written.
  itemRow(i: Item, lead: string): string {
    const detail = this.f.short ? '' : itemDetail(i);
    return `<tr>${lead}<td class="code">${esc(i.code)}</td><td><div class="title">${inline(i.title)}</div>${detail}</td></tr>`;
  }

  table(items: Item[], dated: boolean): string {
    return `<table>${items.map((i) => this.itemRow(i, dated ? `<td class="when">${esc(i.ts.slice(0, 10))}</td>` : '')).join('')}</table>`;
  }

  groupHtml(g: Group): string {
    if (this.flatView) return this.table(g.items, g.dated);
    return sections(g.items)
      .map((sec) => `<h3>${esc(sec.name)}</h3>${this.table(sec.items, g.dated)}`)
      .join('\n');
  }

  bySection(groups: Group[]): string {
    if (groups.length === 1) return `<p>${esc(this.header(groups[0].info))}</p>\n${this.groupHtml(groups[0])}`;
    return groups
      .map((g, k) => `<details${k === 0 ? ' open' : ''}><summary>${esc(this.header(g.info))}</summary>\n${this.groupHtml(g)}\n</details>`)
      .join('\n');
  }

  chronoTable(groups: Group[]): string {
    const many = new Set(groups.flatMap((g) => g.items.map((i) => i.session))).size > 1;
    const lead = (i: Item) =>
      `<td class="when">${esc(i.ts.slice(0, 16).replace('T', ' '))}</td>${many ? `<td class="sess">${esc(i.session.slice(0, 8))}</td>` : ''}`;
    const rows = groups
      .flatMap((g) => g.items)
      .sort(byTime)
      .map((i) => this.itemRow(i, lead(i)));
    return `<table>${rows.join('')}</table>`;
  }

  pageOf(title: string, groups: Group[]): string {
    return document_(
      title,
      `<input class="tab" type="radio" name="view" id="t-sections" checked>
<input class="tab" type="radio" name="view" id="t-chrono">
<div class="tabs"><label for="t-sections">${this.flatView ? 'Results' : 'By section'}</label><label for="t-chrono">In writing order</label></div>
<div class="pane" id="p-sections">
${this.bySection(groups)}
</div>
<div class="pane" id="p-chrono">
${this.chronoTable(groups)}
</div>`,
    );
  }

  listRow(s: SessionInfo, k: number): string {
    return (
      `<tr><td>${k + 1}</td><td class="title">${esc(oneLine(s.title ?? '') || '(untitled)')}</td><td>${esc(this.folder(s.cwd))}</td>` +
      `<td>${esc(s.branch ?? '')}</td><td>${esc(age(s.updated, this.ctx.now))}</td><td>${s.codes}</td><td class="sess">${esc(s.id)}</td></tr>`
    );
  }

  listPage(title: string, list: SessionInfo[]): string {
    return document_(
      title,
      `<table><tr><th>#</th><th>Session</th><th>Folder</th><th>Branch</th><th>Last reply</th><th>Codes</th><th>ID</th></tr>
${list.map((s, k) => this.listRow(s, k)).join('\n')}
</table>`,
    );
  }

  async publish(name: string, html: string, err = ''): Promise<Result> {
    try {
      const file = `${name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'kref'}.html`;
      return { code: 0, out: `${await this.ctx.page(`${this.data}/kref-out`, file, html)}\n`, err };
    } catch (e) {
      return this.fail(2, 'io', `couldn't write the page: ${(e as Error).message}`);
    }
  }

  // Every output of codes, grouped by session.
  async showGroups(scopeDoc: object, groups: Group[], listed: SessionInfo[], label: Label): Promise<Result> {
    const items = groups.flatMap((g) => g.items);
    const code = items.length ? 0 : 1;
    const err = label.err ?? '';
    if (this.asJson) return { code, out: this.dump(this.document(scopeDoc, items, listed, null)), err: '' };
    if (this.f.html && items.length) return this.publish(label.name, this.pageOf(label.title, groups), err);
    const out = groups.flatMap((g, k) => [
      ...(k > 0 ? [''] : []),
      this.header(g.info),
      ...(g.items.length ? ['', ...this.body(g.items, g.dated)] : []),
    ]);
    return { code, out: `${out.join('\n')}\n`, err };
  }

  showList(scopeDoc: object, list: SessionInfo[], lead: string, name: string): Promise<Result> | Result {
    if (this.asJson) return { code: 0, out: this.dump(this.document(scopeDoc, [], list, null)), err: '' };
    if (this.f.html) return this.publish(name, this.listPage(`kref: sessions at or under ${this.folder(this.here)}`, list));
    return { code: 0, out: `${this.rows(list).join('\n')}\n`, err: `${lead}\n` };
  }

  // One session and its handoff ancestors.
  async thisThread(id: string, reason: string) {
    const ids = await thread(this.io, this.data, id);
    const kind = ids.length > 1 ? 'thread' : 'session';
    const info = await this.named(this.infos.find((s) => s.id === id) ?? (await this.base(id, false)));
    return { ids, kind, info, scopeDoc: { kind, reason, session: { ...info, thread: ids } } };
  }

  async showSession(id: string, reason: string, more: number): Promise<Result> {
    const { ids, kind, info, scopeDoc } = await this.thisThread(id, reason);
    const items = (await threadItems(this.io, this.data, id)).filter((i) => this.want(i));
    const query = this.req.query;
    if (items.length === 0 && query) return this.elsewhere(ids, `${query} isn't in this ${kind}. The newest sessions that define it:`, scopeDoc);
    const notes = [
      ...(more > 0 ? [`${more} more session${more === 1 ? '' : 's'} here: kref sessions`] : []),
      ...(items.length === 0 ? [`No codes yet in this ${kind}.`] : []),
    ];
    const title = query ? `kref ${query}: ${this.header(info)}` : this.header(info);
    const name = `${id.slice(0, 8)}-${query ?? 'session'}`;
    return this.showGroups(scopeDoc, [{ info, items, dated: kind === 'thread' }], [], { title, name, err: notes.map((n) => `${n}\n`).join('') });
  }

  // A code the scope lacks: the newest sessions that define it.
  async elsewhere(skip: string[], lead: string, scopeDoc: object): Promise<Result> {
    const query = this.req.query;
    const hits = [...this.infos]
      .filter((s) => !skip.includes(s.id) && this.codesOf(s.id).length)
      .sort(newestFirst)
      .slice(0, this.f.all ? undefined : LOOKUP_CAP);
    if (hits.length === 0) return this.fail(1, 'not_found', `${query} isn't in the ledger`, scopeDoc);
    const shown = await this.namedAll(hits);
    const groups = shown.map((info) => ({ info, items: this.codesOf(info.id), dated: false }));
    return this.showGroups(scopeDoc, groups, shown, { title: `kref ${query}`, name: `elsewhere-${query}`, err: `${lead}\n` });
  }

  // A session list in a terminal: type a number to open one, or text to
  // filter every session at or under this folder by title and folder.
  async pick(ask: (text: string) => Promise<string | null>, initial: SessionInfo[]): Promise<string | null> {
    const p: Picker = { initial, shown: initial, filtered: false, note: '' };
    for (;;) {
      const answer = await ask(`${p.note}${this.rows(p.shown).join('\n')}\nNumber, or text to filter: `);
      p.note = '';
      if (answer === null) return null;
      const picked = await this.pickStep(p, answer.trim());
      if (picked !== undefined) return picked;
    }
  }

  // The ID picked, null to leave, or undefined to ask again.
  async pickStep(p: Picker, a: string): Promise<string | null | undefined> {
    if (/^\d+$/.test(a)) {
      const s = p.shown[Number(a) - 1];
      if (s) return s.id;
      p.note = `No session ${a} in this list.\n`;
      return undefined;
    }
    if (a) return this.filterPick(p, a);
    if (!p.filtered) return null;
    [p.shown, p.filtered] = [p.initial, false];
    return undefined;
  }

  async filterPick(p: Picker, a: string): Promise<undefined> {
    this.pool ??= await this.namedAll(below(this.infos, this.here));
    const needle = a.toLowerCase();
    const hits = this.pool.filter((s) => `${s.title ?? ''}\n${s.cwd ?? ''}`.toLowerCase().includes(needle)).slice(0, LIST_CAP);
    if (hits.length) [p.shown, p.filtered] = [hits, true];
    else p.note = `No session title or folder contains "${oneLine(a)}".\n`;
    return undefined;
  }

  async sessionsCommand(): Promise<Result> {
    const all = this.f.all;
    const scopeDoc = { kind: 'sessions', reason: all ? '--all' : 'sessions' };
    const pool = all ? [...this.infos].sort(newestFirst) : below(this.infos, this.here).slice(0, LIST_CAP);
    if (pool.length === 0) return this.fail(1, 'not_found', all ? 'the ledger has no sessions' : `no session ran at or under ${this.folder(this.here)}`, scopeDoc);
    return this.showList(scopeDoc, await this.namedAll(pool), 'Open one with kref --session <id>.', 'sessions');
  }

  searchLabel(): Label {
    return { title: `kref search: ${this.req.text}`, name: `search-${this.req.text}` };
  }

  noMention(scopeDoc: object): Result {
    return this.fail(1, 'not_found', `no code mentions "${oneLine(this.req.text)}"`, scopeDoc);
  }

  async searchThread(sc: ScopeOf<'session'>): Promise<Result> {
    const { kind, info, scopeDoc } = await this.thisThread(sc.id, sc.reason);
    const items = search(await threadItems(this.io, this.data, sc.id), this.req.text);
    if (!items.length) return this.noMention(scopeDoc);
    return this.showGroups(scopeDoc, [{ info, items, dated: kind === 'thread' }], [], this.searchLabel());
  }

  async searchCommand(sc: Scope, scoped: boolean): Promise<Result> {
    if (scoped && sc.kind === 'session') return this.searchThread(sc);
    const text = this.req.text;
    const list = scoped && sc.kind === 'sessions';
    const scopeDoc = list ? { kind: 'sessions', reason: sc.reason } : { kind: 'all', reason: sc.kind === 'all' ? sc.reason : 'search' };
    const pool = list ? below(this.infos, this.here) : [...this.infos].sort(newestFirst);
    const hits = pool.filter((s) => search(this.own.get(s.id) ?? [], text).length);
    if (!hits.length) return this.noMention(scopeDoc);
    const shown = await this.namedAll(hits);
    const groups = shown.map((info) => ({ info, items: search(this.own.get(info.id) ?? [], text), dated: false }));
    return this.showGroups(scopeDoc, groups, shown, this.searchLabel());
  }

  async allScope(sc: ScopeOf<'all'>): Promise<Result> {
    const query = this.req.query;
    const scopeDoc = { kind: 'all', reason: sc.reason };
    const hits = [...this.infos].filter((s) => this.codesOf(s.id).length).sort(newestFirst);
    if (hits.length === 0) return this.fail(1, 'not_found', query ? `${query} isn't in the ledger` : 'the ledger is empty', scopeDoc);
    const shown = await this.namedAll(hits);
    const groups = shown.map((info) => ({ info, items: this.codesOf(info.id), dated: false }));
    return this.showGroups(scopeDoc, groups, shown, { title: query ? `kref ${query}` : 'kref: every session', name: `all-${query ?? 'sessions'}` });
  }

  async sessionsScope(sc: ScopeOf<'sessions'>): Promise<Result> {
    const scopeDoc = { kind: 'sessions', reason: sc.reason };
    if (this.req.query) return this.elsewhere([], `Sessions that define ${this.req.query}, newest first:`, scopeDoc);
    const list = await this.namedAll(sc.sessions);
    if (list.length === 0) return this.fail(1, 'not_found', `no session ran at or under ${this.folder(this.here)}`, scopeDoc);
    // A terminal gets a picker; an agent or a pipe gets the list as data.
    if (this.ctx.ask && !this.asJson) {
      const id = await this.pick(this.ctx.ask, list);
      return id ? this.showSession(id, 'picker', 0) : { code: 0, out: '', err: '' };
    }
    const lead = `No session is chosen here. The ${list.length} newest at or under ${this.folder(this.here)}; open one with kref --session <id>:`;
    return this.showList(scopeDoc, list, lead, 'sessions');
  }

  async answer(): Promise<Result> {
    const { command } = this.req;
    const f = this.f;
    const env = this.ctx.env.CLAUDE_CODE_SESSION_ID;
    const scoped = command !== 'search' || Boolean(f.here) || f.session !== undefined;
    const needCwd = needsFolder(command, scoped, f, env);
    const ids = [...new Set([...this.own.keys(), ...this.records.keys()])];
    this.infos = await Promise.all(ids.map((id) => this.base(id, needCwd)));
    const sc = scope({ ref: f.session, all: f.all, env, cwd: this.here, home: this.ctx.home, sessions: this.infos });
    if (sc.kind === 'error') return this.fail(sc.code === 'not_found' ? 1 : 2, sc.code, sc.message);
    if (command === 'sessions') return this.sessionsCommand();
    if (command === 'search') return this.searchCommand(sc, scoped);
    if (sc.kind === 'all') return this.allScope(sc);
    if (sc.kind === 'sessions') return this.sessionsScope(sc);
    return this.showSession(sc.id, sc.reason, sc.more);
  }
}

// A body, its options, and its answer, under the title on the page.
function itemDetail(i: Item): string {
  const paras = clean(i.summary)
    .split(/\n+/)
    .filter((p) => p.trim())
    .map((p) => `<p class="summary">${inline(p)}</p>`);
  const opts = i.options.length
    ? `<ul class="opts">${i.options.map((o) => `<li><span class="key">${esc(o.key)}.</span>${inline(o.text)}</li>`).join('')}</ul>`
    : '';
  return [...paras, opts, answerHtml(i)].join('');
}

export async function run(argv: string[], ctx: Ctx): Promise<Result> {
  const out = new Out(ctx, argv.includes('--json'));
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, strict: true, options: OPTIONS });
  } catch (e) {
    return out.fail(2, 'usage', `${(e as Error).message}. Run kref --help for usage.`);
  }
  const f: Flags = parsed.values;
  if (f.help) return { code: 0, out: HELP, err: '' };
  if (f.version) return { code: 0, out: `kref ${await versionOf(ctx)}\n`, err: '' };
  const req = request(parsed.positionals, f);
  if (typeof req === 'string') return out.fail(2, 'usage', req);
  const k = new Kref(ctx, out.asJson, f, req);
  await k.load();
  return k.answer();
}

const self = fileURLToPath(import.meta.url);
const invoked = (() => {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(self);
  } catch {
    return false;
  }
})();

// True when cmd is an executable in one of the PATH folders.
export const onPath = (cmd: string, path = process.env.PATH ?? '') =>
  path.split(':').some((d) => {
    try {
      accessSync(`${d}/${cmd}`, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });

// The command that opens a file in the default browser, or null when this
// machine has none. Every opener gets an argument array, never a shell, so a
// path can't inject a command. WSL gets a Windows path, which explorer.exe
// needs and wslview accepts either way.
export function opener(
  path: string,
  platform: string,
  has: (cmd: string) => boolean,
  winPath: (p: string) => string | undefined,
): [string, string[]] | null {
  if (platform === 'win32') return ['cmd', ['/c', 'start', '', path]];
  if (platform === 'darwin') return ['open', [path]];
  if (has('wslview')) return ['wslview', [path]];
  if (has('explorer.exe') && has('wslpath')) {
    const win = winPath(path);
    if (win) return ['explorer.exe', [win]];
  }
  if (has('xdg-open')) return ['xdg-open', [path]];
  return null;
}

function launch(path: string) {
  const cmd = opener(path, process.platform, (c) => onPath(c), (p) =>
    spawnSync('wslpath', ['-w', p], { encoding: 'utf8' }).stdout?.trim() || undefined,
  );
  if (cmd) spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
}

export const fsIo: Io = {
  read: (p) => readFile(p, 'utf8').catch(() => null),
  list: async (d) => {
    try {
      return (await readdir(d, { withFileTypes: true })).map((e) => ({ name: e.name, kind: e.isDirectory() ? 'dir' : 'file' }));
    } catch {
      return [];
    }
  },
};

// The last bytes of a file, or null when it can't be read.
export async function tail(p: string, bytes: number) {
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
}

// The page stays readable by its owner alone: the folder is 0700 and the
// file 0600, set again in case either existed with a wider mode. show opens
// it unless KREF_NO_OPEN is set.
export async function writePage(dir: string, name: string, html: string, env: NodeJS.ProcessEnv, show: (path: string) => void) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const path = `${dir}/${name}`;
  await writeFile(path, html, { mode: 0o600 });
  await chmod(path, 0o600);
  if (!env.KREF_NO_OPEN) show(path);
  return path;
}

// The picker's question. The prompt goes to output, which the CLI points at
// stderr so stdout carries only the result. Ctrl-C and the end of input both
// answer null, and so does every question after them: with no SIGINT
// listener, readline closes itself on Ctrl-C.
export function terminalAsk(input: NodeJS.ReadableStream, output: NodeJS.WritableStream) {
  let rl: Interface | undefined;
  let closed = false;
  let pending: ((line: string | null) => void) | undefined;
  const ask = (text: string) =>
    new Promise<string | null>((resolve) => {
      if (!rl) {
        rl = createInterface({ input, output });
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
  return { ask, close: () => rl?.close() };
}

if (invoked) {
  const terminal = terminalAsk(process.stdin, process.stderr);
  const r = await run(process.argv.slice(2), {
    env: process.env,
    cwd: process.cwd(),
    home: process.env.HOME || homedir(),
    root: dirname(dirname(self)),
    now: new Date(),
    tty: Boolean(process.stdout.isTTY),
    cols: process.stdout.columns ?? 100,
    io: fsIo,
    tail,
    ask: process.stdin.isTTY && process.stdout.isTTY ? terminal.ask : undefined,
    page: (dir, name, html) => writePage(dir, name, html, process.env, launch),
  });
  terminal.close();
  process.stdout.write(r.out);
  process.stderr.write(r.err);
  process.exitCode = r.code;
}
