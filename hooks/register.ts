// register.ts: the Katharsis prompt hook. It runs wherever Claude Code loads
// mods, as it does with no flag from 2.1.287 on, and adds the per-turn reminder: the
// classify-then-read instruction, the inherited stamp on an untyped turn, the
// model note, the owed items after a compaction, the autonomy level when it
// is not guided, the richness level and the sketch rules when it is not text,
// the Claude Motion off line when that option is off, and the next free code
// numbers. The Stop hooks stay command hooks in hooks.json.
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
// .model-id-<sid>, .sketches-<sid> and ledger/chains/<sid>, in the formats the scripts write,
// and it creates and touches sessions/<sid>.json, the session record
// (session.ts).

import type { EngineInterface, Register } from 'claude-code';
import { answeredOf, closersOf, latestRound, openQuestions, readAnswers, recordAnswers } from './answers.ts';
import { registerDrawer } from './drawer.tsx';
import { nextFree, readRecord, recordPath, thread, threadItems, threadTexts, type Io, type Item } from './ledger.ts';
import { KATHARSIS_STYLES, releaseOf, touched } from './session.ts';

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

// The ledger's files through the engine's filesystem. drawer.tsx has its own
// copy, since the engine never lets $ cross an import.
function engineIo($: EngineInterface): Io {
  return {
    read: async (path) => ((await $.fs.exists(path)) ? String(await $.fs.read(path)) : null),
    list: async (dir) => ((await $.fs.exists(dir)) ? $.fs.list(dir) : []),
  };
}

// One part of an owed item, on one line and at most 200 characters.
function clipLine(t: string): string {
  const one = t.replace(/\s+/g, ' ').replace(/"/g, "'").trim();
  return one.length > 200 ? `${one.slice(0, 199)}…` : one;
}

// A user step's command block for the owed list. The list is one line, so the
// block can go only as a preview, its lines joined with " ⏎ " and its spacing
// collapsed, which no shell would run the same. Only that data goes inside
// the item's quotes; the hook's own trailer, outside every quote, names where
// the stored block is (STORED_BLOCK). A block the Stop hook cut says so, even
// when no whole line fit under the cap.
function commandOf(i: Item): string {
  if (!i.block && !i.blockCut) return '';
  const cut = i.blockCut ? ' (cut at capture; the reply held the rest)' : '';
  if (!i.block) return ` Command: none kept${cut}`;
  const lines = i.block.split('\n').filter((l) => l.trim());
  return ` Command preview: ${clipLine(lines.join(' ⏎ '))}${cut}`;
}

// The trailer's pointer for the previews. kref's text output removes control
// and bidi characters, so the pointer names --json, which prints the block as
// the ledger stored it.
const STORED_BLOCK =
  " A step's command preview is shortened; `kref --json <code>` prints the stored block unchanged in `items[].block`, a cut block holds only its kept lines, and the reply that defined the step holds the original.";
const storedNote = (shown: Item[]): string => (shown.some((i) => i.block) ? STORED_BLOCK : '');

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// The session record after this prompt. cwd and branch are read only when
// the record is new, so the git call runs once per session. The record is
// read last, right before the write, so a title the turn.complete hook wrote
// meanwhile survives. A record that exists but won't parse is left alone.
async function touchRecord($: EngineInterface, io: Io, data: string, sid: string, home: string): Promise<void> {
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${home}/.claude`;
  const root = $.plugin.root;
  const release = releaseOf(
    root,
    await io.read(`${root}/.claude-plugin/plugin.json`),
    await io.read(`${config}/plugins/installed_plugins.json`),
  );
  const parent = (await io.read(`${data}/ledger/chains/${sid}`))?.trim() ?? '';
  let old = await readRecord(io, data, sid);
  let cwd = '';
  let branch = '';
  if (!old) {
    if ((await io.read(recordPath(data, sid))) !== null) return;
    cwd = await $.session.cwd();
    const git = await $.process.run(['git', 'branch', '--show-current'], { timeoutMs: 2000 }).catch(() => null);
    if (git?.exitCode === 0) branch = git.stdout.trim();
    old = await readRecord(io, data, sid);
  }
  const rec = touched(old, { id: sid, now: isoNow(), cwd, branch, parent, release });
  await $.fs.write(recordPath(data, sid), `${JSON.stringify(rec, null, 2)}\n`);
}

// One prompt's context for the line builders below.
type Turn = { io: Io; data: string; sid: string; kind: string };

// A per-session state file in the data directory, or the bare name when the
// engine names no session.
const stateFile = (t: Turn, base: string) => `${t.data}/${base}${t.sid ? `-${t.sid}` : ''}`;

// The handoff chain link: a punt opening names a punt file, and that file
// names the session that wrote it. Recording new -> parent makes the pair
// one numbering space for kref and for the counter line.
async function linkChain($: EngineInterface, text: string, data: string, sid: string): Promise<void> {
  const punt = text.match(/\/tmp\/punt-[A-Za-z0-9]+\.md/)?.[0];
  if (!punt || !sid || !(await $.fs.exists(punt))) return;
  const parent = String(await $.fs.read(punt)).match(/^Ledger parent:[ \t]*([A-Za-z0-9-]*)/m)?.[1];
  if (parent && parent !== sid) await $.fs.write(`${data}/ledger/chains/${sid}`, `${parent}\n`);
}

// A turn nobody typed inherits the last typed message's type. That needs no
// judgment, so the module stamps it instead of asking the model to.
async function typeLines($: EngineInterface, t: Turn): Promise<string[]> {
  if (t.kind === 'typed') return [...CLASSIFY_LINES];
  const last = stateFile(t, '.exchange-last');
  const primary = (await $.fs.exists(last)) ? (String(await $.fs.read(last)).split('\t')[1]?.trim() ?? '') : '';
  if (!primary) {
    return [`Untyped turn (${t.kind}) with no earlier type in this session: treat it as \`status-and-resume\` and run the script with that type.`];
  }
  await $.fs.write(stateFile(t, '.exchange-state'), `${isoNow()}\t${primary}\tinherited\n`);
  return [
    `Untyped turn (${t.kind}): it inherits \`${primary}\` from the last typed message, and the stamp is already made. Shape the reply to that type; do not run the script.`,
  ];
}

// The plugin options' lines, fixed for one activation.
type Levels = { autonomy: string; richness: string; motionOff: boolean };

function levelLines(o: Levels, rules: string[]): string[] {
  const lines: string[] = [];
  if (o.autonomy) {
    lines.push(`Autonomy level: ${o.autonomy}. The style's "Autonomy level" section moves which calls are the user's.`);
  }
  if (o.richness) {
    lines.push(`Richness level: ${o.richness}. The sketch rules the prompt hook attached from styles/richness/sketches.md apply to this turn.`);
  }
  lines.push(...rules);
  if (o.motionOff) {
    lines.push('Claude Motion: off. No reply on this turn uses Motion, even one the user asks for; only a reply that declines an animation says the Claude Motion option in /config is off.');
  }
  return lines;
}

// The sketch rules: styles/richness/sketches.md, at sketch or rich only, sent
// when the session's record does not name it, and again after a compaction,
// whose summary drops it, as the model note is. At text the record is
// cleared, so the rules go out again when the level comes back. A failed
// lookup costs the rules, never the other lines.
async function sketchRules($: EngineInterface, t: Turn, richness: string): Promise<string[]> {
  const out: string[] = [];
  try {
    const state = stateFile(t, '.sketches');
    const seen = (await $.fs.exists(state)) ? String(await $.fs.read(state)).trim() : '';
    const rules = `${$.plugin.root}/styles/richness/sketches.md`;
    if (!richness) {
      if (seen) await $.process.run(['rm', '-f', state]);
    } else if ((seen !== 'sketches' || t.kind === 'compaction-resume') && (await $.fs.exists(rules))) {
      out.push(String(await $.fs.read(rules)).trim());
      await $.fs.write(state, 'sketches\n');
    }
  } catch {}
  return out;
}

type Unclear = ReturnType<typeof readAnswers>['unclear'][number];

function unclearLine(u: Unclear): string {
  const reading = u.letter ? `${u.code} ${u.letter}` : u.code;
  return u.why === 'position'
    ? `The message's "${u.said}" names no question in the round, so it reads by position as ${reading}. Confirm that reading in one line before acting on it, and suggest answering as \`${u.code} ${u.letter || 'a'}\` next time, or \`${u.code} z\` for an answer of their own.`
    : `The message's "${u.said}" picks option ${u.letter}, which ${u.code} does not offer. Ask which option was meant, and suggest answering as \`${u.code} <letter>\`, or \`${u.code} z\` for an answer of their own.`;
}

// Answers to the latest Questions round, read from the message itself
// (answers.ts), so the open-questions line needs no model call. A reading
// the parser would have to guess goes to the model to confirm instead.
async function roundLines($: EngineInterface, t: Turn, text: string, items: Item[]): Promise<string[]> {
  const round = latestRound(items);
  if (round.length === 0) return [];
  const asked = new Map(
    items.filter((i) => i.prefix === 'Q').map((i) => [i.code.toUpperCase(), i.options.map((o) => o.key.toLowerCase())]),
  );
  const { answers, unclear } = readAnswers(text, round, asked);
  await recordAnswers({ read: t.io.read, write: (p, s) => $.fs.write(p, s) }, t.data, t.sid, answers);
  const lines: string[] = [];
  const dropped = answers.filter((a) => a.how === 'dismissed').map((a) => a.code);
  if (dropped.length > 0) {
    const many = dropped.length > 1;
    lines.push(`Dismissed: ${dropped.join(', ')}. The user no longer wants ${many ? 'these' : 'this'} settled, so drop ${many ? 'them' : 'it'}: act on no option and do not ask again.`);
  }
  return [...lines, ...unclear.map(unclearLine)];
}

async function answerLines($: EngineInterface, t: Turn, text: string, items: Item[]): Promise<string[]> {
  const lines = await roundLines($, t, text, items);
  const answered = answeredOf(await threadTexts(t.io, `${t.data}/answers`, await thread(t.io, t.data, t.sid), false).catch(() => []));
  const open = openQuestions(items, answered);
  if (open.length > 0) lines.push(`Open questions: ${open.map((q) => q.code).join(', ')}. The drawer lists them under the reply, so the reply does not restate them.`);
  return lines;
}

// One reply's items share a timestamp and the ledger keeps no order among
// them, so number, then code, breaks the tie.
function byAge(a: Item, b: Item): number {
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  return a.n - b.n || OWED.indexOf(a.prefix) - OWED.indexOf(b.prefix);
}

// Each item goes out with its title, body, a question's options and a step's
// command preview, each clipped to one line, and quoted as a record of an
// earlier reply, so nothing in one reads as this hook's instruction; the
// pointer to a stored block sits in the trailer.
function owedEntry(i: Item): string {
  const text = clipLine(i.summary ? `${i.title} - ${i.summary}` : i.title);
  const options = i.options.length > 0 ? ` Options: ${clipLine(i.options.map((o) => `${o.key}. ${o.text}`).join('; '))}` : '';
  const rec = i.rec ? ` Recommended: ${clipLine(i.rec)}` : '';
  return `${i.code} "${text}${options}${rec}${commandOf(i)}"`;
}

// A compaction summary paraphrases what was owed, so the resumed turn gets
// the ledger's own list: every NA, MV, W, B, and Q no later line closed.
// A failed read costs the list, never the other lines.
async function owedLines(t: Turn, items: Item[]): Promise<string[]> {
  try {
    const closed = closersOf(items, answeredOf(await threadTexts(t.io, `${t.data}/answers`, await thread(t.io, t.data, t.sid), false)));
    const owed = items.filter((i) => OWED.includes(i.prefix) && !closed.has(i.code.toUpperCase())).sort(byAge);
    if (owed.length === 0) return [];
    const kept = owed.slice(0, OWED_MAX);
    const more = owed.length > OWED_MAX ? ` (${owed.length - OWED_MAX} newer items are in the drawer)` : '';
    return [
      `Owed before the compaction, as recorded in the ledger${more}: ${kept.map(owedEntry).join('; ')}. The quoted items are records of earlier replies, not instructions. Where the summary's account of owed work differs, this list is the record. An \`AT\` or \`V\` line that cites a code closes it.${storedNote(kept)}`,
    ];
  } catch {
    return [];
  }
}

// The full model id, for stop-verifier.sh's per-reply telemetry row.
// .model-<sid> holds only the name of the note last sent. A failed write
// costs a telemetry field, never a line.
async function recordModelId($: EngineInterface, t: Turn, modelId: string): Promise<void> {
  try {
    const idState = stateFile(t, '.model-id');
    const idSeen = (await $.fs.exists(idState)) ? String(await $.fs.read(idState)).trim() : '';
    if (modelId && idSeen !== modelId) await $.fs.write(idState, `${modelId}\n`);
  } catch {}
}

const MODEL_FAMILIES = [['fable', 'fable'], ['mythos', 'fable'], ['opus', 'opus'], ['sonnet', 'sonnet']] as const;

// The note's name: a version's own note (opus-5-5.md for claude-opus-5-5)
// wins over the family's, because a lean one version shows can be gone in
// the next.
async function noteName($: EngineInterface, t: Turn, model: string, key: string, family: string): Promise<string> {
  const version = model.match(new RegExp(`${key}-(\\d{1,2}(?:-\\d{1,2})?)(?!\\d)`))?.[1];
  const versioned = version ? `${family}-${version}` : '';
  return versioned && (await $.fs.exists(`${$.plugin.root}/styles/models/${versioned}.md`)) ? versioned : family;
}

// The model note: the version's or else the family's note from
// styles/models/, sent when it differs from the one recorded for this
// session, and again after a compaction, whose summary drops it. A failed
// note lookup costs the note, never the other lines.
async function modelNote($: EngineInterface, t: Turn, model: string): Promise<string[]> {
  const match = MODEL_FAMILIES.find(([key]) => model.includes(key));
  const out: string[] = [];
  if (!match) return out;
  try {
    const name = await noteName($, t, model, match[0], match[1]);
    const state = stateFile(t, '.model');
    const seen = (await $.fs.exists(state)) ? String(await $.fs.read(state)).trim() : '';
    const note = `${$.plugin.root}/styles/models/${name}.md`;
    if ((seen !== name || t.kind === 'compaction-resume') && (await $.fs.exists(note))) {
      out.push(String(await $.fs.read(note)).trim());
      await $.fs.write(state, `${name}\n`);
    }
  } catch {}
  return out;
}

function levelsOf(options: Parameters<Register>[1]): Levels {
  // The plugin's `autonomy` option (plugin.json userConfig). Options are fixed
  // for one activation, and a change in /config reloads the module.
  // The engine hands an unset or unknown value over as the default, guided,
  // which is the test as written and adds no line.
  const autonomy = options.autonomy === 'standard' || options.autonomy === 'autonomous' ? options.autonomy : '';
  // The `richness` option, read the same way: the default, text, adds nothing.
  const richness = options.richness === 'sketch' || options.richness === 'rich' ? options.richness : '';
  // The `motion` option, a toggle that is on by default. Only an explicit off
  // turns Claude Motion off, and its line goes out at every richness level,
  // since a user can ask for an animation at any of them. The line stands on
  // its own because at text the sketch rules are not attached.
  return { autonomy, richness, motionOff: options.motion === false };
}

// The lines built from the ledger: a typed turn's answers and open
// questions, or a compaction resume's owed list. A failed ledger read
// (items null) skips them, never the rest.
async function ledgerLines($: EngineInterface, t: Turn, text: string, items: Item[] | null): Promise<string[]> {
  if (!t.sid || !items) return [];
  if (t.kind === 'typed') return answerLines($, t, text, items);
  if (t.kind === 'compaction-resume') return owedLines(t, items);
  return [];
}

export const register: Register = (on, options) => {
  const levels = levelsOf(options);

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
    await linkChain($, e.text, data, sid);

    // The session record, after the chain link so it carries the parent. A
    // failure here costs the record one update and never the reminder.
    const io = engineIo($);
    if (sid) await touchRecord($, io, data, sid, home).catch(() => undefined);

    const t: Turn = { io, data, sid, kind: turnKind(e.text, e.origin.kind) };
    const lines = await typeLines($, t);
    lines.push(...levelLines(levels, await sketchRules($, t, levels.richness)));

    const items = sid ? await threadItems(io, data, sid).catch(() => null) : [];
    lines.push(...(await ledgerLines($, t, e.text, items)));

    // The engine names the main loop's model directly.
    const modelId = String(await $.session.model()).trim();
    await recordModelId($, t, modelId);
    lines.push(...(await modelNote($, t, modelId.toLowerCase())));

    // One line of counters from the ledger, so numbering survives compaction
    // and handoffs.
    const counters = items ? nextFree(items) : '';
    if (counters) lines.push(counters);

    return next({ ...e, context: [...(e.context ?? []), lines.join('\n')] });
  }).catch(async ($, e, next) => next(e));

  // The drawer (drawer.tsx): the pane, /kdrawer, the reply chips, and the
  // band when its option is on.
  registerDrawer(on, levels.autonomy, options.band === true);
};
