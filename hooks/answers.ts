// answers.ts: which questions are still open, decided without the model.
//
// The prompt hook (register.ts) reads each typed message for answers to the
// latest Questions round and records them to answers/<sid>.jsonl in the data
// directory. The drawer reads that file to draw the Still open row. No
// model call is made: a replay over 1,226 real answers found the patterns
// below catch the answers people type. A miss leaves the question listed
// until it is answered again as `Q3 a` or a later line settles it; a
// question never drops out of sight unsettled.
//
// An answer is a number, an optional separator, and a letter: `1. a`, `1a`,
// `Q2: b`, `1a, 2b`, `1a 2b`, one per line, with anything after the letter
// ignored. A token starts a line or follows a comma or semicolon, or follows
// another token on the same line, so "I merged 2 a while ago" matches
// nothing. A number with prose after it, "54. I fixed it in Jira", answers
// that question in prose.
//
// The number resolves in this order:
//   1. Q2 or q2 is always Q2.
//   2. A bare number naming a question in the latest round is that question.
//   3. Otherwise a bare number with a letter is a position in the round, and
//      the model is asked to confirm that reading rather than act on a guess.
//   4. A bare number past the round's length naming an earlier question is
//      that question, when the letter is one it offers, `z`, or `x` and no
//      word follows it: the drawer keeps an unanswered question listed, and
//      "2 a" answers it there. A numbered prose line, "2. A file was found",
//      never reaches that far back.
// A letter the question does not offer is not guessed at either, except `z`,
// which every question takes as "my own answer": the drawer's Still open
// row says so, and `x`, which dismisses any question, even one offering an
// option x. The words dismiss, dismissed, cancel, and canceled stand in for
// the `x`. A dismissal needs nothing but a separator after it: "Q3 x - stale"
// dismisses, and "Q3 x is undefined" answers in prose.

export type Round = { code: string; options: string[] }[];
export type Answer = { code: string; letter: string; how: 'code' | 'number' | 'prose' | 'own' | 'dismissed' };
export type Unclear = { code: string; letter: string; said: string; why: 'position' | 'option' };

const TOKEN = String.raw`(q?)(\d{1,3})\s*[.):=\-]?\s*(dismiss(?:ed)?|cancel(?:l?ed)?|[a-z])(?![a-z0-9]|-[a-z0-9])`;
const LEAD = new RegExp(String.raw`^\s*` + TOKEN, 'iy');
const CHAIN = new RegExp(String.raw`(?:\s*[,;]\s*|\s+)` + TOKEN, 'iy');
const SEP = new RegExp(String.raw`[,;]\s*` + TOKEN, 'ig');
const PROSE = /^\s*(q?)(\d{1,3})\s*[.):]\s+[a-z]{2,}/i;

type Token = { explicit: boolean; n: number; letter: string; wordAfter: boolean; said: string };

function tokensOf(msg: string): Token[] {
  const out: Token[] = [];
  const take = (m: RegExpExecArray, line: string) => {
    const end = m.index + m[0].length;
    const wordAfter = /^\s+[a-z]/i.test(line.slice(end));
    out.push({
      explicit: m[1] !== '',
      n: Number(m[2]),
      // "1. Cancel the build" is a sentence, not a dismissal.
      letter: m[3]!.length > 1 ? (wordAfter ? '' : 'x') : m[3]!.toLowerCase(),
      wordAfter,
      said: m[0].replace(/^[\s,;]+/, ''),
    });
    return end;
  };
  for (const line of msg.split('\n')) {
    let pos = 0;
    LEAD.lastIndex = 0;
    let m = LEAD.exec(line);
    const led = m !== null;
    while (m) {
      pos = take(m, line);
      CHAIN.lastIndex = pos;
      m = CHAIN.exec(line);
    }
    SEP.lastIndex = pos;
    for (let s = SEP.exec(line); s; s = SEP.exec(line)) take(s, line);
    if (!led) {
      const p = line.match(PROSE);
      if (p) out.push({ explicit: p[1] !== '', n: Number(p[2]), letter: '', wordAfter: true, said: p[0].trim() });
    }
  }
  return out;
}

// The answers a message gives to the latest round, and the readings it leaves
// for the model to confirm. `asked` holds every question on record, so an
// explicit code outside the round still resolves.
export function readAnswers(msg: string, round: Round, asked: Map<string, string[]>): { answers: Answer[]; unclear: Unclear[] } {
  const answers: Answer[] = [];
  const unclear: Unclear[] = [];
  const inRound = new Map(round.map((q) => [q.code, q.options]));
  const seen = new Set<string>();
  for (const t of tokensOf(msg)) {
    let code = `Q${t.n}`;
    let opts: string[] | undefined;
    let how: Answer['how'] = t.explicit ? 'code' : 'number';
    let far = false;
    if (t.explicit) opts = asked.get(code);
    else if (inRound.has(code)) opts = inRound.get(code);
    else if (t.letter !== '' && t.n >= 1 && t.n <= round.length) {
      // A numbered prose line is never read by position: "1. Fix the tests"
      // is more often a list than an answer.
      code = round[t.n - 1]!.code;
      if (!seen.has(code)) unclear.push({ code, letter: t.letter, said: t.said, why: 'position' });
      seen.add(code);
      continue;
    } else if (t.letter !== '') {
      opts = asked.get(code);
      far = true;
    }
    if (opts === undefined || seen.has(code)) continue;
    if (far && (t.wordAfter || (!opts.includes(t.letter) && t.letter !== 'z' && t.letter !== 'x'))) continue;
    seen.add(code);
    if (t.letter === 'z' && !opts.includes('z')) {
      answers.push({ code, letter: 'z', how: 'own' });
    } else if (t.letter === 'x' && !t.wordAfter) {
      answers.push({ code, letter: 'x', how: 'dismissed' });
    } else if (t.letter === '' || (!opts.includes(t.letter) && t.wordAfter)) {
      // "54. I fixed it in Jira": the letter is the first word of a prose answer.
      answers.push({ code, letter: '', how: 'prose' });
    } else if (opts.length > 0 && !opts.includes(t.letter)) {
      unclear.push({ code, letter: t.letter, said: t.said, why: 'option' });
    } else {
      answers.push({ code, letter: t.letter, how });
    }
  }
  return { answers, unclear };
}

// Every question code an answers file's rows name, with the letter the
// latest row for it gave.
export function answeredOf(texts: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const text of texts) {
    for (const line of text.split('\n')) {
      try {
        const r = JSON.parse(line) as Record<string, unknown>;
        if (typeof r.code === 'string') out.set(r.code.toUpperCase(), String(r.letter ?? ''));
      } catch {
        continue; // a blank or partial line
      }
    }
  }
  return out;
}

type Q = { code: string; prefix: string; n: number; ts: string; title: string; summary: string };

// What closed a code: the answer letter, the line that cited it, or both.
export type Closer = { letter: string; by: string; prefix: string; title: string };

const CITE = /(?<![A-Za-z0-9-])[A-Z][A-Z-]{0,3}\d+(?!\d)/g;

// Every code a later coded line cites, with the citing items, oldest first.
// A mention in the reply's prose is not on record, so only a coded line's
// title and body count.
export function citersOf<T extends Q>(items: T[]): Map<string, T[]> {
  const byTs = [...items].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const ts = new Map(items.map((i) => [i.code.toUpperCase(), i.ts]));
  const out = new Map<string, T[]>();
  for (const j of byTs) {
    for (const c of new Set(`${j.title}\n${j.summary}`.match(CITE) ?? [])) {
      const at = ts.get(c);
      if (at === undefined || c === j.code.toUpperCase() || j.ts <= at) continue;
      out.set(c, [...(out.get(c) ?? []), j]);
    }
  }
  return out;
}

// Which lines close each type: a question closes on an answer too, owed work
// on the action or check that did it or the exclusion that dropped it, a
// block on any word that it cleared, and a risk on whatever line says it was
// mitigated or removed. The other types record something and never close.
const CLOSES: Record<string, (p: string) => boolean> = {
  Q: (p) => p === 'AT' || p === 'V',
  NA: (p) => p === 'AT' || p === 'V' || p === 'X',
  MV: (p) => p === 'AT' || p === 'V' || p === 'X',
  W: (p) => p === 'AT' || p === 'V' || p === 'X',
  B: () => true,
  R: () => true,
};

// Every closed code and what closed it.
export function closersOf(items: Q[], answered: ReadonlyMap<string, string>): Map<string, Closer> {
  const citers = citersOf(items);
  const out = new Map<string, Closer>();
  for (const i of items) {
    const closes = CLOSES[i.prefix];
    if (!closes) continue;
    const key = i.code.toUpperCase();
    const by = (citers.get(key) ?? []).find((j) => closes(j.prefix));
    const letter = i.prefix === 'Q' ? (answered.get(key) ?? '') : '';
    if (by || answered.has(key)) out.set(key, { letter, by: by?.code ?? '', prefix: by?.prefix ?? '', title: by?.title ?? '' });
  }
  return out;
}

// The open questions, oldest first: every question on record that no answer
// row names and no later action-taken or verification line cites.
export function openQuestions<T extends Q>(items: T[], answered: ReadonlyMap<string, string>): T[] {
  const closed = closersOf(items, answered);
  return items
    .filter((i) => i.prefix === 'Q' && !closed.has(i.code.toUpperCase()))
    .sort((a, b) => a.n - b.n);
}

// The latest Questions round: the Q rows the newest reply with a round wrote,
// which share that reply's timestamp.
export function latestRound(items: (Q & { options: { key: string }[] })[]): Round {
  const qs = items.filter((i) => i.prefix === 'Q');
  const last = qs.reduce((m, i) => (i.ts > m ? i.ts : m), '');
  return qs
    .filter((i) => i.ts === last)
    .sort((a, b) => a.n - b.n)
    .map((i) => ({ code: i.code, options: i.options.map((o) => o.key.toLowerCase()) }));
}
