// ledger.ts: the one reader of the ledger's format. The drawer and the prompt
// hook import it inside the engine, and a CLI under node can import it too,
// so it holds no JSX, no enums and no engine calls, and every import it ever
// takes spells its extension. Files arrive through an Io the caller builds on
// whatever filesystem its runtime has.
//
// A handoff chain is one numbering space: ledger/chains/<sid> holds the
// parent session's ID, and a session's thread is itself plus every ancestor.
// A later record for a code supersedes an earlier one anywhere in the thread.

export type Io = {
  // The file's text, or null when it does not exist.
  read(path: string): Promise<string | null>;
  // The directory's entries, or none when it does not exist.
  list(dir: string): Promise<{ name: string; kind: string }[]>;
};

export type Option = { key: string; text: string };
export type Item = {
  code: string;
  prefix: string;
  n: number;
  known: boolean;
  ts: string;
  title: string;
  summary: string;
  options: Option[];
  rec: string;
  // The session that wrote the row, and the heading it sat under.
  session: string;
  section: string;
  // The row's place in the files read, so items stamped in the same second
  // keep the order the reply wrote them in.
  seq: number;
};

// The stock prefixes in the order the next-free line lists them. D is
// retired but still appears in older ledgers.
export const ORDER = ['F', 'D', 'A', 'R', 'C', 'AT', 'V', 'NA', 'B', 'MV', 'W', 'X', 'S', 'T-O', 'E', 'Q'];

const alpha = (a: string, b: string) => a.localeCompare(b, 'en');

// Codes in a row, by type then number: A1, AT2, C1, F3, F10.
export function codeOrder<T extends { prefix: string; n: number }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => alpha(a.prefix, b.prefix) || a.n - b.n);
}

// The session and every ancestor its chain file names, newest first.
export async function thread(io: Io, data: string, sid: string): Promise<string[]> {
  const ids: string[] = [];
  let cur = sid;
  while (cur && !ids.includes(cur) && ids.length < 20) {
    ids.push(cur);
    const link = await io.read(`${data}/ledger/chains/${cur}`);
    if (link === null) break;
    cur = link.trim();
    if (!/^[\w-]+$/.test(cur)) break; // a link names a session, never a path
  }
  return ids;
}

// The text of every <id>.jsonl for the thread's ids, oldest session first, in
// one directory or in each project directory under it. A session can span
// two project directories, since rows written before the Stop hook keyed the
// project on the transcript's directory sit under whichever cwd it saw.
export async function threadTexts(io: Io, dir: string, ids: string[], nested: boolean): Promise<string[]> {
  const dirs = nested
    ? (await io.list(dir)).filter((d) => d.kind === 'dir' && d.name !== 'chains').map((d) => `${dir}/${d.name}`)
    : [dir];
  const texts: string[] = [];
  for (const id of [...ids].reverse()) {
    for (const d of dirs) {
      const text = await io.read(`${d}/${id}.jsonl`);
      if (text !== null) texts.push(text);
    }
  }
  return texts;
}

function toItem(r: Record<string, unknown>): Item | undefined {
  if (typeof r.code !== 'string' || !r.code) return undefined;
  const options = Array.isArray(r.options)
    ? r.options.map((o: Record<string, unknown>) => ({ key: String(o?.key ?? ''), text: String(o?.text ?? '') }))
    : [];
  return {
    code: r.code,
    prefix: String(r.prefix ?? ''),
    n: Number(r.n ?? 0) || 0,
    known: Boolean(r.known),
    ts: String(r.ts ?? ''),
    title: String(r.title ?? ''),
    summary: String(r.summary ?? ''),
    options,
    rec: String(r.rec ?? ''),
    session: String(r.session_id ?? ''),
    section: String(r.section ?? ''),
    seq: 0,
  };
}

// The ledger files' rows as items: a later record for a code supersedes an
// earlier one, and equal stamps fall to file order.
export function itemsOf(texts: string[]): Item[] {
  const latest = new Map<string, Item>();
  let seq = 0;
  for (const text of texts) {
    for (const line of text.split('\n')) {
      if (line.length > 1_000_000) continue; // a pathological row, never a real one
      let item: Item | undefined;
      try {
        item = toItem(JSON.parse(line) as Record<string, unknown>);
      } catch {
        continue; // a blank or partial line
      }
      if (!item) continue;
      item.seq = seq++;
      const key = item.code.toUpperCase();
      const old = latest.get(key);
      if (!old || item.ts >= old.ts) latest.set(key, item);
    }
  }
  return codeOrder([...latest.values()]);
}

// Every item in the session's thread.
export async function threadItems(io: Io, data: string, sid: string): Promise<Item[]> {
  return itemsOf(await threadTexts(io, `${data}/ledger`, await thread(io, data, sid), true));
}

// The line that tells the model where numbering resumes: the next free
// number per prefix, stock prefixes in ORDER and invented ones after them.
// Empty when the thread has no items.
export function nextFree(items: Item[]): string {
  const top = new Map<string, number>();
  for (const i of items) {
    if (i.prefix) top.set(i.prefix, Math.max(top.get(i.prefix) ?? 0, i.n));
  }
  if (top.size === 0) return '';
  const keys = [
    ...ORDER.filter((p) => top.has(p)),
    ...[...top.keys()].filter((p) => !ORDER.includes(p)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  ];
  return `Katharsis codes continue, never restart. Next free: ${keys.map((p) => `${p}${(top.get(p) ?? 0) + 1}`).join('  ')}`;
}

// A session's record, katharsis-data/sessions/<id>.json. Only Katharsis's
// hooks write it: the prompt hook creates and touches it, the Stop hook adds
// the transcript, and turn.complete adds the title. kref reads it to name the
// session. transcript is
// the path Claude Code reported, and transcriptSeen says the file existed at
// some Stop: a path never seen belongs to a session that saved nothing, and
// a record with no path at all means the Stop hook never ran.
export type Release = { version: string; commit?: string };
export type SessionRecord = {
  id: string;
  parent?: string;
  cwd: string;
  branch?: string;
  started: string;
  updated: string;
  title?: string;
  titleSource?: string;
  katharsis: Release[];
  transcript?: string;
  transcriptSeen?: boolean;
};

export function recordPath(data: string, sid: string): string {
  return `${data}/sessions/${sid}.json`;
}

const RECORD_TEXT = ['parent', 'cwd', 'branch', 'started', 'updated', 'title', 'titleSource', 'transcript'];

// The session's record, or null when it has none or the file is unreadable.
// A text field holding anything but text is dropped, as if never written.
export async function readRecord(io: Io, data: string, sid: string): Promise<SessionRecord | null> {
  const text = await io.read(recordPath(data, sid));
  if (text === null) return null;
  try {
    const r = JSON.parse(text) as Record<string, unknown>;
    if (!r || typeof r !== 'object' || r.id !== sid) return null;
    const out: Record<string, unknown> = { ...r, katharsis: Array.isArray(r.katharsis) ? r.katharsis : [] };
    for (const k of RECORD_TEXT) if (k in out && typeof out[k] !== 'string') delete out[k];
    return out as SessionRecord;
  } catch {
    return null;
  }
}

// The section each stock prefix groups under.
export const SECTIONS: Record<string, string> = {
  F: 'Findings', D: 'Decisions', A: 'Assumptions', R: 'Risks', C: 'Caveats', AT: 'Actions Taken',
  V: 'Verified', NA: 'Next Actions', B: 'Blocked', MV: 'Your Move', W: 'Waiting', X: 'Excluded',
  S: 'State', 'T-O': 'Trade-offs', E: 'Errata', Q: 'Questions',
};

// The section an item groups under.
export function sectionOf(i: Item): string {
  return SECTIONS[i.prefix.toUpperCase()] ?? (i.section.trim() || 'Other codes');
}

// Items grouped by section: stock prefixes in ORDER, invented ones by the
// heading they were written under, and questions last.
export function sections(items: Item[]): { name: string; items: Item[] }[] {
  const rank = (i: Item) => {
    const p = i.prefix.toUpperCase();
    if (p === 'Q') return 1000;
    const k = ORDER.indexOf(p);
    return k >= 0 ? k : 500;
  };
  const name = sectionOf;
  const groups = new Map<string, { rank: number; items: Item[] }>();
  for (const i of codeOrder(items)) {
    const g = groups.get(name(i)) ?? { rank: rank(i), items: [] };
    g.items.push(i);
    groups.set(name(i), g);
  }
  return [...groups.entries()]
    .sort(([a, x], [b, y]) => x.rank - y.rank || alpha(a, b))
    .map(([n, g]) => ({ name: n, items: g.items }));
}

// Every session's ledger text, by session ID, across every project
// directory.
export async function ledgerTexts(io: Io, data: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const root = `${data}/ledger`;
  for (const d of await io.list(root)) {
    if (d.kind !== 'dir' || d.name === 'chains') continue;
    for (const f of await io.list(`${root}/${d.name}`)) {
      if (!f.name.endsWith('.jsonl')) continue;
      const text = await io.read(`${root}/${d.name}/${f.name}`);
      if (text === null) continue;
      const id = f.name.slice(0, -'.jsonl'.length);
      out.set(id, [...(out.get(id) ?? []), text]);
    }
  }
  return out;
}

// What kref knows about a session, from its record or from Claude Code's
// own files. updated is when it last prompted or replied, codes counts the
// codes it defined itself.
export type SessionInfo = {
  id: string;
  cwd?: string;
  branch?: string;
  title?: string;
  titleSource?: string;
  started?: string;
  updated?: string;
  codes: number;
};

export type Scope =
  | { kind: 'all'; reason: '--all' }
  | { kind: 'session'; reason: '--session' | 'CLAUDE_CODE_SESSION_ID' | 'cwd'; id: string; more: number }
  | { kind: 'sessions'; reason: 'below-cwd'; sessions: SessionInfo[] }
  | { kind: 'error'; code: 'not_found' | 'ambiguous_session' | 'usage'; message: string };

export type ScopeInput = {
  ref?: string; // --session
  all?: boolean; // --all
  env?: string; // CLAUDE_CODE_SESSION_ID
  cwd: string;
  home: string;
  sessions: SessionInfo[];
};

export const SESSION_ID = /^[0-9a-f-]+$/i;
export const LIST_CAP = 20;

const newest = (a: SessionInfo, b: SessionInfo) => ((a.updated ?? '') < (b.updated ?? '') ? 1 : (a.updated ?? '') > (b.updated ?? '') ? -1 : 0);
const trim = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

// The scoping rules, first match wins: a flag, then the Claude Code session
// kref runs inside, then the newest session that ran in exactly this folder
// (never ~ or /), then a list of the newest sessions at or under it.
export function scope(input: ScopeInput): Scope {
  const sessions = [...input.sessions].sort(newest);
  if (input.all) return { kind: 'all', reason: '--all' };
  if (input.ref !== undefined) {
    const ref = input.ref.trim();
    if (ref === 'last') {
      return sessions[0]
        ? { kind: 'session', reason: '--session', id: sessions[0].id, more: 0 }
        : { kind: 'error', code: 'not_found', message: 'the ledger has no sessions' };
    }
    if (!SESSION_ID.test(ref) || ref.length < 8) {
      return { kind: 'error', code: 'usage', message: `--session takes a session ID, a prefix of 8 or more of its characters, or last` };
    }
    const hits = sessions.filter((s) => s.id.toLowerCase().startsWith(ref.toLowerCase()));
    if (hits.length === 0) return { kind: 'error', code: 'not_found', message: `no session starts with ${ref}` };
    if (hits.length > 1) return { kind: 'error', code: 'ambiguous_session', message: `${hits.length} sessions start with ${ref}` };
    return { kind: 'session', reason: '--session', id: hits[0].id, more: 0 };
  }
  if (input.env && SESSION_ID.test(input.env)) {
    return { kind: 'session', reason: 'CLAUDE_CODE_SESSION_ID', id: input.env, more: 0 };
  }
  const cwd = trim(input.cwd);
  if (cwd !== trim(input.home) && cwd !== '/') {
    const here = sessions.filter((s) => s.cwd !== undefined && trim(s.cwd) === cwd);
    if (here.length > 0) return { kind: 'session', reason: 'cwd', id: here[0].id, more: here.length - 1 };
  }
  return { kind: 'sessions', reason: 'below-cwd', sessions: below(sessions, cwd).slice(0, LIST_CAP) };
}

// The sessions that ran at or under a folder, newest first.
export function below(sessions: SessionInfo[], folder: string): SessionInfo[] {
  const cwd = trim(folder);
  return [...sessions].sort(newest).filter((s) => {
    if (s.cwd === undefined) return false;
    const c = trim(s.cwd);
    return cwd === '/' || c === cwd || c.startsWith(`${cwd}/`);
  });
}

// A literal, case-insensitive match on a code's title, body and question
// options. No regex, so a pattern can't run away.
export function search(items: Item[], text: string): Item[] {
  const needle = text.toLowerCase();
  const hit = (s: string) => s.toLowerCase().includes(needle);
  return items.filter((i) => hit(i.title) || hit(i.summary) || i.options.some((o) => hit(o.text)));
}
