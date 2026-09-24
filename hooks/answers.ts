// answers.ts: which questions are still open, decided without the model.
//
// The prompt hook (register.ts) reads each typed message for answers to the
// latest Questions round and records them to answers/<sid>.jsonl in the data
// directory. The drawer reads that file to draw the open-questions line. No
// model call is made: a replay over 1,226 real answers found the patterns
// below catch the answers people type, and a miss only leaves a question
// listed until two newer ones displace it.
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
// A letter the question does not offer is not guessed at either, except `z`,
// which every question takes as "my own answer": the drawer's open-questions
// row says so.

export type Round = { code: string; options: string[] }[];
export type Answer = { code: string; letter: string; how: 'code' | 'number' | 'prose' | 'own' };
export type Unclear = { code: string; letter: string; said: string; why: 'position' | 'option' };

const TOKEN = String.raw`(q?)(\d{1,3})\s*[.):=\-]?\s*([a-z])(?![a-z0-9])`;
const LEAD = new RegExp(String.raw`^\s*` + TOKEN, 'iy');
const CHAIN = new RegExp(String.raw`(?:\s*[,;]\s*|\s+)` + TOKEN, 'iy');
const SEP = new RegExp(String.raw`[,;]\s*` + TOKEN, 'ig');
const PROSE = /^\s*(q?)(\d{1,3})\s*[.):]\s+[a-z]{2,}/i;

type Token = { explicit: boolean; n: number; letter: string; wordAfter: boolean; said: string };

function tokensOf(msg: string): Token[] {
  const out: Token[] = [];
  const take = (m: RegExpExecArray, line: string) => {
    const end = m.index + m[0].length;
    out.push({
      explicit: m[1] !== '',
      n: Number(m[2]),
      letter: m[3]!.toLowerCase(),
      wordAfter: /^\s+[a-z]/i.test(line.slice(end)),
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
    if (t.explicit) opts = asked.get(code);
    else if (inRound.has(code)) opts = inRound.get(code);
    else if (t.letter !== '' && t.n >= 1 && t.n <= round.length) {
      // A numbered prose line is never read by position: "1. Fix the tests"
      // is more often a list than an answer.
      code = round[t.n - 1]!.code;
      if (!seen.has(code)) unclear.push({ code, letter: t.letter, said: t.said, why: 'position' });
      seen.add(code);
      continue;
    }
    if (opts === undefined || seen.has(code)) continue;
    seen.add(code);
    if (t.letter === 'z' && !opts.includes('z')) {
      answers.push({ code, letter: 'z', how: 'own' });
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

// Every question code an answers file's rows name.
export function answeredOf(texts: string[]): Set<string> {
  const out = new Set<string>();
  for (const text of texts) {
    for (const line of text.split('\n')) {
      try {
        const code = (JSON.parse(line) as Record<string, unknown>).code;
        if (typeof code === 'string') out.add(code.toUpperCase());
      } catch {
        continue; // a blank or partial line
      }
    }
  }
  return out;
}

type Q = { code: string; prefix: string; n: number; ts: string; title: string; summary: string };

// The open questions, oldest first: every question on record that no answer
// row names and no later action-taken line cites, capped at the two newest,
// the most the output style lets stay open.
export function openQuestions(items: Q[], answered: Set<string>): Q[] {
  const acted = items.filter((i) => i.prefix === 'AT');
  const cites = (text: string, code: string) => new RegExp(String.raw`(?<![A-Za-z0-9-])${code}(?!\d)`).test(text);
  return items
    .filter((i) => i.prefix === 'Q' && !answered.has(i.code.toUpperCase()))
    .filter((q) => !acted.some((a) => a.ts > q.ts && cites(`${a.title}\n${a.summary}`, q.code)))
    .sort((a, b) => a.n - b.n)
    .slice(-2);
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
