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
  };
}

// The ledger files' rows as items: a later record for a code supersedes an
// earlier one, and equal stamps fall to file order.
export function itemsOf(texts: string[]): Item[] {
  const latest = new Map<string, Item>();
  for (const text of texts) {
    for (const line of text.split('\n')) {
      let item: Item | undefined;
      try {
        item = toItem(JSON.parse(line) as Record<string, unknown>);
      } catch {
        continue; // a blank or partial line
      }
      if (!item) continue;
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

// A session's record, katharsis-data/sessions/<id>.json. The prompt hook
// (register.ts) writes it; kref reads it to name the session. transcript is
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

// The session's record, or null when it has none or the file is unreadable.
export async function readRecord(io: Io, data: string, sid: string): Promise<SessionRecord | null> {
  const text = await io.read(recordPath(data, sid));
  if (text === null) return null;
  try {
    const r = JSON.parse(text) as SessionRecord;
    return r && typeof r === 'object' && r.id === sid ? { ...r, katharsis: Array.isArray(r.katharsis) ? r.katharsis : [] } : null;
  } catch {
    return null;
  }
}
