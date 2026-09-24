// register.ts: the Katharsis prompt hook. It runs where Claude Code loads
// function hooks (CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 on build 2.1.278; the
// surface is early access) and adds the per-turn reminder: the
// classify-then-read instruction, the inherited stamp on an untyped turn, the
// model note, and the next free code numbers. The Stop hooks stay command
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
// .active-<sid>, .exchange-state-<sid>, .exchange-last-<sid>, .model-<sid> and
// ledger/chains/<sid>, in the formats the scripts write.

import type { EngineInterface, Register } from 'claude-code';
import { answeredOf, latestRound, openQuestions, readAnswers } from './answers';
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

    // The model note: the family's note from styles/models/, sent when
    // the family differs from the one recorded for this session, and again
    // after a compaction, whose summary drops it. The engine names the main
    // loop's model directly.
    const model = (await $.session.model()).toLowerCase();
    const family = (
      [['fable', 'fable'], ['mythos', 'fable'], ['opus', 'opus'], ['sonnet', 'sonnet']] as const
    ).find(([key]) => model.includes(key))?.[1];
    if (family) {
      const state = `${data}/.model${sid ? `-${sid}` : ''}`;
      const seen = (await $.fs.exists(state)) ? String(await $.fs.read(state)).trim() : '';
      const note = `${$.plugin.root}/styles/models/${family}.md`;
      if ((seen !== family || kind === 'compaction-resume') && (await $.fs.exists(note))) {
        lines.push(String(await $.fs.read(note)).trim());
        await $.fs.write(state, `${family}\n`);
      }
    }

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
