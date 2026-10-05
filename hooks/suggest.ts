// suggest.ts: the autonomy level a person's own answers support. Like
// ledger.ts, it holds no JSX and no engine calls, and its imports spell their
// extensions.
//
// At guided, the drawer suggests standard once the person has answered at
// least SUGGEST_MIN questions that carried a recommendation and took it on at
// least SUGGEST_RATE of them. A count gates it rather than time since
// install: a month of light use holds too few answers to judge from, and a
// week of heavy use holds plenty. The rate was set against the one history on
// hand, 94 of 127 answers taken (74%), and 80% would never have suggested
// standard to the person the level was built for.

import { itemsOf, threadTexts, type Io } from './ledger.ts';

export const SUGGEST_MIN = 50;
export const SUGGEST_RATE = 0.7;

export type Agreement = { answered: number; took: number };

// The option letter a recommendation line opens with: "a - why", "**b**. why".
// The letter must stand alone before a separator, so "A cleaner fix - b" and
// "I'd take b" name no option.
export function recLetter(rec: string): string {
  return rec.trim().match(/^\**([a-z])\**(?=\s*(?:[-–—.):,]|$))/i)?.[1]?.toLowerCase() ?? '';
}

// The session and every ancestor its chain file names, newest first. Unlike
// thread() it has no cap of 20, so every session of a long chain sees the
// chain's questions and keys them alike.
async function chainOf(io: Io, data: string, sid: string): Promise<string[]> {
  const ids = [sid];
  for (;;) {
    const next = (await io.read(`${data}/ledger/chains/${ids[ids.length - 1]}`))?.trim() ?? '';
    if (!/^[\w-]+$/.test(next) || ids.includes(next)) return ids;
    ids.push(next);
  }
}

// Every answered question that carried a recommendation, across every
// session's answers file, and how many took it. A question is its code in
// one handoff chain's numbering space, keyed by the chain's oldest session,
// and its latest answer by stamp is the one that counts, whichever session of
// the chain gave it, and on equal stamps the later session's answer wins.
// Two sessions punted from one parent share that numbering space, so their
// two Q8s count as one question: an undercount, never an overcount. A
// dismissed question (x) counts for neither side; the person's own
// answer, a prose answer, or another letter counts as answered and not taken.
export async function agreement(io: Io, data: string): Promise<Agreement> {
  const latest = new Map<string, { ts: string; depth: number; letter: string; own: boolean; rec: string }>();
  for (const f of await io.list(`${data}/answers`)) {
    if (f.kind !== 'file' || !f.name.endsWith('.jsonl')) continue;
    const text = await io.read(`${data}/answers/${f.name}`);
    if (text === null) continue;
    const rows: { ts: string; code: string; letter: string; own: boolean }[] = [];
    for (const line of text.split('\n')) {
      try {
        const r = JSON.parse(line) as Record<string, unknown>;
        if (typeof r.code === 'string') rows.push({ ts: String(r.ts ?? ''), code: r.code.toUpperCase(), letter: String(r.letter ?? '').toLowerCase(), own: r.how === 'own' });
      } catch {
        continue; // a blank or partial line
      }
    }
    if (rows.length === 0) continue;
    const ids = await chainOf(io, data, f.name.slice(0, -'.jsonl'.length));
    const root = ids[ids.length - 1];
    const depth = ids.length - 1;
    const items = new Map(itemsOf(await threadTexts(io, `${data}/ledger`, ids, true)).map((i) => [i.code.toUpperCase(), i]));
    for (const r of rows) {
      const q = items.get(r.code);
      // A recommendation must name one of the question's options, so "I'd
      // take b" reads as no recommendation rather than as option i.
      const rec = q ? recLetter(q.rec) : '';
      const offered = !q || q.options.length === 0 || q.options.some((o) => o.key.toLowerCase() === rec);
      const key = `${root}:${r.code}`;
      const old = latest.get(key);
      const later = !old || r.ts > old.ts || (r.ts === old.ts && depth >= old.depth);
      if (q?.prefix === 'Q' && later) latest.set(key, { ts: r.ts, depth, letter: r.letter, own: r.own, rec: offered ? rec : '' });
    }
  }
  const counted = [...latest.values()].filter((a) => a.rec && a.letter !== 'x');
  return { answered: counted.length, took: counted.filter((a) => a.letter === a.rec && !a.own).length };
}

// Whether the answers support moving from guided to standard.
export function suggestsStandard(a: Agreement): boolean {
  return a.answered >= SUGGEST_MIN && a.took / a.answered >= SUGGEST_RATE;
}
