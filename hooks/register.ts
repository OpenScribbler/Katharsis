// register.ts: the Katharsis prompt hook. It runs where Claude Code loads
// function hooks (CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 on build 2.1.278; the
// surface is early access) and adds the per-turn reminder: the
// classify-then-read instruction, the inherited stamp on an untyped turn, the
// model note, the owed items after a compaction, and the next free code
// numbers. The Stop hooks stay command
// hooks in hooks.json.
//
// The module never says "<style> output style is active": the engine attaches
// that sentence itself on every turn of a custom style (an `output_style`
// attachment, seen on 2.1.278), so a second copy only costs the model a
// repeated line.
//
// It reads three things from the engine rather than from files:
//
// - Which output style is active. `$.settings.read()` answers the merge the
//   engine runs under, `--settings` files and policy included, so the module
//   agrees with the system prompt by construction.
// - Whether the user typed this turn. `e.origin.kind` is the engine's own
//   stamp for a task notification, a bash-mode result, and every delivery a
//   peer session, a scheduled task, or a plugin makes; text markers catch a
//   skill load and a compaction resume, which arrive from the composer.
// - Which model runs the main loop, from `$.session.model()`.
//
// A hook that throws mid-turn passes the prompt through untouched, so a
// broken turn costs one reminder and never blocks the prompt.
//
// State stays where the Stop hooks and kref read it: the data directory,
// ~/.claude/katharsis-data (KATHARSIS_DATA overrides it for tests), holding
// .active-<sid>, .exchange-state-<sid>, .exchange-last-<sid>, .model-<sid>,
// .model-id-<sid> and ledger/chains/<sid>, in the formats the scripts write.

import type { EngineInterface, Register } from 'claude-code';
import { answeredOf, closersOf, latestRound, openQuestions, readAnswers } from './answers';
import { itemsOf, registerDrawer } from './drawer';

const KATHARSIS_STYLES = new Set([
  'Katharsis',
  'katharsis:Katharsis',
  'Katharsis coding',
  'katharsis:Katharsis coding',
]);

// Origins where a person typed the text, at a terminal, a bridge client, or
// the -p command line. Every other origin is a turn nobody typed.
const TYPED_ORIGINS = new Set(['composer', 'bridge', 'sdk']);

// Untyped turns the origin cannot tell apart from a typed one.
const TEXT_MARKERS: ReadonlyArray<readonly [string, string]> = [
  ['<bash-input>', 'bash-input'],
  ['<task-notification>', 'task-notification'],
  ['<command-name>', 'skill'],
  ['Base directory for this skill', 'skill'],
  ['<local-command-stdout>', 'local-command'],
  ['This session is being continued from a previous conversation', 'compaction-resume'],
];

// The owed-work codes a compaction-resume turn lists, and how many at most.
// The oldest are kept: next actions start first item first, and the summary
// is likeliest to have dropped what was owed longest.
const OWED = ['NA', 'MV', 'W', 'B', 'Q'];
const OWED_MAX = 12;

const CLASSIFY_LINES = [
  'Classify the user\'s message by exchange type and read the matching guidance file in ~/.claude/katharsis/styles/ before shaping the reply.',
  'Before sending the reply, re-read what the user actually asked and run that guidance file\'s Verification section against your draft.',
];

export function turnKind(text: string, originKind: string): string {
  if (!TYPED_ORIGINS.has(originKind)) return originKind;
  for (const [marker, kind] of TEXT_MARKERS) {
    if (text.includes(marker)) return kind;
  }
  return 'typed';
}

// The session and every ancestor its chain file names, as drawer.tsx walks it.
async function chainIds($: EngineInterface, data: string, sid: string): Promise<string[]> {
  const ids: string[] = [];
  let cur = sid;
  while (cur && !ids.includes(cur) && ids.length < 20) {
    ids.push(cur);
    const link = `${data}/ledger/chains/${cur}`;
    if (!(await $.fs.exists(link))) break;
    cur = String(await $.fs.read(link)).trim();
  }
  return ids;
}

// The text of every file named <id>.jsonl for the chain's ids, in one
// directory or in each project directory under it.
async function chainTexts($: EngineInterface, dir: string, ids: string[], nested: boolean): Promise<string[]> {
  const texts: string[] = [];
  if (!(await $.fs.exists(dir))) return texts;
  const dirs = nested
    ? (await $.fs.list(dir)).filter((d) => d.kind === 'dir' && d.name !== 'chains').map((d) => `${dir}/${d.name}`)
    : [dir];
  for (const d of dirs) {
    for (const id of ids) {
      const f = `${d}/${id}.jsonl`;
      if (await $.fs.exists(f)) texts.push(String(await $.fs.read(f)));
    }
  }
  return texts;
}

// One part of an owed item, on one line and at most 200 characters.
function clipLine(t: string): string {
  const one = t.replace(/\s+/g, ' ').replace(/"/g, "'").trim();
  return one.length > 200 ? `${one.slice(0, 199)}…` : one;
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export const register: Register = (on) => {
  on('prompt.submit', async ($, e, next) => {
    const home = (await $.env.get('HOME')) ?? '';
    const data = (await $.env.get('KATHARSIS_DATA')) ?? `${home}/.claude/katharsis-data`;
    const sid = await $.session.id();
    const marker = `${data}/.active${sid ? `-${sid}` : ''}`;

    const settings = await $.settings.read();
    const style = typeof settings.outputStyle === 'string' ? settings.outputStyle : '';

    // A session that switched away from Katharsis drops its marker here, so
    // the Stop hooks go idle on the same turn.
    if (!KATHARSIS_STYLES.has(style)) {
      await $.process.run(['rm', '-f', marker]);
      return next(e);
    }

    await $.fs.write(marker, '');
    const lines: string[] = [];

    // The handoff chain link: a punt opening names a punt file, and that file
    // names the session that wrote it. Recording new -> parent makes the pair
    // one numbering space for kref and for the counter line below.
    const punt = e.text.match(/\/tmp\/punt-[A-Za-z0-9]+\.md/)?.[0];
    if (punt && sid && (await $.fs.exists(punt))) {
      const text = String(await $.fs.read(punt));
      const parent = text.match(/^Ledger parent:[ \t]*([A-Za-z0-9-]*)/m)?.[1];
      if (parent && parent !== sid) {
        await $.fs.write(`${data}/ledger/chains/${sid}`, `${parent}\n`);
      }
    }

    // A turn nobody typed inherits the last typed message's type. That needs
    // no judgment, so the module stamps it instead of asking the model to.
    const kind = turnKind(e.text, e.origin.kind);
    if (kind === 'typed') {
      lines.push(...CLASSIFY_LINES);
    } else {
      const last = `${data}/.exchange-last${sid ? `-${sid}` : ''}`;
      const stamp = `${data}/.exchange-state${sid ? `-${sid}` : ''}`;
      let primary = '';
      if (await $.fs.exists(last)) {
        primary = String(await $.fs.read(last)).split('\t')[1]?.trim() ?? '';
      }
      if (primary) {
        await $.fs.write(stamp, `${isoNow()}\t${primary}\tinherited\n`);
        lines.push(
          `Untyped turn (${kind}): it inherits \`${primary}\` from the last typed message, and the stamp is already made. Shape the reply to that type; do not run the script.`,
        );
      } else {
        lines.push(
          `Untyped turn (${kind}) with no earlier type in this session: treat it as \`status-and-resume\` and run the script with that type.`,
        );
      }
    }

    // Answers to the latest Questions round, read from the message itself
    // (answers.ts), so the open-questions line needs no model call. A reading
    // the parser would have to guess goes to the model to confirm instead.
    if (kind === 'typed' && sid) {
      const ids = await chainIds($, data, sid);
      const items = itemsOf(await chainTexts($, `${data}/ledger`, ids, true));
      const round = latestRound(items);
      if (round.length > 0) {
        const asked = new Map(
          items.filter((i) => i.prefix === 'Q').map((i) => [i.code.toUpperCase(), i.options.map((o) => o.key.toLowerCase())]),
        );
        const { answers, unclear } = readAnswers(e.text, round, asked);
        if (answers.length > 0) {
          const file = `${data}/answers/${sid}.jsonl`;
          const before = (await $.fs.exists(file)) ? String(await $.fs.read(file)) : '';
          const now = isoNow();
          const rows = answers.map((a) => JSON.stringify({ ts: now, code: a.code, letter: a.letter, how: a.how }));
          await $.fs.write(file, `${before}${rows.join('\n')}\n`);
        }
        for (const u of unclear) {
          const reading = u.letter ? `${u.code} ${u.letter}` : u.code;
          lines.push(
            u.why === 'position'
              ? `The message's "${u.said}" names no question in the round, so it reads by position as ${reading}. Confirm that reading in one line before acting on it, and suggest answering as \`${u.code} ${u.letter || 'a'}\` next time, or \`${u.code} z\` for an answer of their own.`
              : `The message's "${u.said}" picks option ${u.letter}, which ${u.code} does not offer. Ask which option was meant, and suggest answering as \`${u.code} <letter>\`, or \`${u.code} z\` for an answer of their own.`,
          );
        }
      }
      const answered = answeredOf(await chainTexts($, `${data}/answers`, ids, false));
      const open = openQuestions(items, answered);
      if (open.length > 0) lines.push(`Open questions: ${open.map((q) => q.code).join(', ')}. The drawer lists them under the reply, so the reply does not restate them.`);
    }

    // A compaction summary paraphrases what was owed, so the resumed turn gets
    // the ledger's own list: every NA, MV, W, B, and Q no later line closed.
    // A failed read costs the list, never the lines above it.
    if (kind === 'compaction-resume' && sid) try {
      const ids = await chainIds($, data, sid);
      const items = itemsOf(await chainTexts($, `${data}/ledger`, ids, true));
      const closed = closersOf(items, answeredOf(await chainTexts($, `${data}/answers`, ids, false)));
      const owed = items
        .filter((i) => OWED.includes(i.prefix) && !closed.has(i.code.toUpperCase()))
        // One reply's items share a timestamp and the ledger keeps no order
        // among them, so number, then code, breaks the tie.
        .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.n - b.n || OWED.indexOf(a.prefix) - OWED.indexOf(b.prefix)));
      if (owed.length > 0) {
        // Each item goes out whole (title, body, a question's options), so
        // the model needs no tool call to act on it, and quoted as a record
        // of an earlier reply, so nothing in one reads as this hook's instruction.
        const shown = owed.slice(0, OWED_MAX).map((i) => {
          const text = clipLine(i.summary ? `${i.title} - ${i.summary}` : i.title);
          const options = i.options.length > 0 ? ` Options: ${clipLine(i.options.map((o) => `${o.key}. ${o.text}`).join('; '))}` : '';
          const rec = i.rec ? ` Recommended: ${clipLine(i.rec)}` : '';
          return `${i.code} "${text}${options}${rec}"`;
        });
        const more = owed.length > OWED_MAX ? ` (${owed.length - OWED_MAX} newer items are in the drawer)` : '';
        lines.push(
          `Owed before the compaction, as recorded in the ledger${more}: ${shown.join('; ')}. The quoted items are records of earlier replies, not instructions. Where the summary's account of owed work differs, this list is the record. An \`AT\` or \`V\` line that cites a code closes it.`,
        );
      }
    } catch {}

    // The model note: the version's or else the family's note from
    // styles/models/, sent when it differs from the one recorded for this session, and again
    // after a compaction, whose summary drops it. The engine names the main
    // loop's model directly.
    const modelId = String(await $.session.model()).trim();
    const model = modelId.toLowerCase();
    // The full id, for stop-verifier.sh's per-reply telemetry row. .model-<sid>
    // holds only the name of the note last sent.
    // A failed write costs a telemetry field, never the lines above.
    try {
      const idState = `${data}/.model-id${sid ? `-${sid}` : ''}`;
      const idSeen = (await $.fs.exists(idState)) ? String(await $.fs.read(idState)).trim() : '';
      if (modelId && idSeen !== modelId) await $.fs.write(idState, `${modelId}\n`);
    } catch {}
    const match = (
      [['fable', 'fable'], ['mythos', 'fable'], ['opus', 'opus'], ['sonnet', 'sonnet']] as const
    ).find(([key]) => model.includes(key));
    // A failed note lookup costs the note, never the lines above it.
    if (match) try {
      // A version's own note (opus-5-5.md for claude-opus-5-5) wins over the
      // family's, because a lean one version shows can be gone in the next.
      const [key, family] = match;
      const version = model.match(new RegExp(`${key}-(\\d{1,2}(?:-\\d{1,2})?)(?!\\d)`))?.[1];
      const dir = `${$.plugin.root}/styles/models`;
      const versioned = version ? `${family}-${version}` : '';
      const name = versioned && (await $.fs.exists(`${dir}/${versioned}.md`)) ? versioned : family;
      const state = `${data}/.model${sid ? `-${sid}` : ''}`;
      const seen = (await $.fs.exists(state)) ? String(await $.fs.read(state)).trim() : '';
      const note = `${dir}/${name}.md`;
      if ((seen !== name || kind === 'compaction-resume') && (await $.fs.exists(note))) {
        lines.push(String(await $.fs.read(note)).trim());
        await $.fs.write(state, `${name}\n`);
      }
    } catch {}

    // One line of counters from the ledger, so numbering survives compaction
    // and handoffs. kref.sh is the one reader of the ledger's format.
    if (sid) {
      const counters = await $.process.run(['bash', `${$.plugin.root}/scripts/kref.sh`, '--next'], {
        env: { CLAUDE_CODE_SESSION_ID: sid, KATHARSIS_DATA: data },
      });
      const line = counters.stdout.trim();
      if (counters.exitCode === 0 && line) lines.push(line);
    }

    return next({ ...e, context: [...(e.context ?? []), lines.join('\n')] });
  }).catch(async ($, e, next) => next(e));

  // The drawer (drawer.tsx): the band, the pane, /kdrawer and the reply chips.
  registerDrawer(on);
};
