// drawer-model.ts: what the drawer (drawer.tsx) draws from, beneath its
// hooks: the cache of ledger items and answers with its refresh, the drawer's
// settings and remembered view, which items close and how, which items a
// query and the filters show, and the send that posts a question's answer.
// It reads the ledger only while the output style is Katharsis (style.ts).

import type { ConfigRow, ConfigValue, EngineInterface } from 'claude-code';
import { answeredOf, citersOf, CLOSING, closersOf, correctionsOf, latestRound, openQuestions, readAnswers, recordAnswers, type Closer, type Round } from './answers.ts';
import { codeOrder, readRecord, recordPath, thread, threadItems, threadTexts, type Io, type Item } from './ledger.ts';
import { cleanTitle, TITLE_PROMPT, wantsTitle } from './session.ts';
import { hasOwnStyle, styleState } from './style.ts';
import { agreement, suggestsStandard, type Agreement } from './suggest.ts';
import type { KatharsisShow, KatharsisView } from '../types';

export const PANE = 'kdrawer';
export const TITLE = 'Katharsis';
export const TEAL = '#14B8A6';
export const CODE_RE = /(?<![A-Za-z0-9-])[A-Z][A-Z-]{0,3}\d+(?![A-Za-z0-9])/g;
const CODE_ONLY = /^[A-Za-z][A-Za-z-]{0,3}\d+$/;
// Inline links point here. The host is reserved and never resolves, and the
// path spells the code out for a terminal that shows a link's target on hover.
export const LINK_BASE = 'https://katharsis.invalid/';
export const MARKDOWN_MAX = 10000;
// Titles a band reveal lists at most, so it never outgrows a short band.
export const REVEAL_MAX = 10;
// The Still open row: the types someone has to act on, the person's first,
// and the newest codes it shows of each. Next actions and waits are the
// model's to finish, so the pane's filter holds them instead.
const STILL_OPEN = ['Q', 'MV', 'B', 'R'];
const STILL_OPEN_SHOWN = 3;
// Sessions that show the answer hint on the row itself; later ones show it
// only in a question's hover card.
const HINT_SESSIONS = 3;
export const SUGGEST_DISMISSED = 'autonomy-suggestion-dismissed';

// Each code's name, singular then plural. D is retired but still appears in
// older ledgers.
const TYPES: [string, string, string][] = [
  ['F', 'Finding', 'Findings'],
  ['A', 'Assumption', 'Assumptions'],
  ['R', 'Risk', 'Risks'],
  ['C', 'Caveat', 'Caveats'],
  ['AT', 'Action taken', 'Actions taken'],
  ['V', 'Verification', 'Verified'],
  ['NA', 'Next action', 'Next actions'],
  ['B', 'Blocked', 'Blocked'],
  ['MV', 'Your move', 'Your moves'],
  ['W', 'Waiting', 'Waiting'],
  ['X', 'Excluded', 'Excluded'],
  ['S', 'State', 'State'],
  ['T-O', 'Trade-off', 'Trade-offs'],
  ['E', 'Erratum', 'Errata'],
  ['Q', 'Question', 'Questions'],
  ['D', 'Decision', 'Decisions'],
];
const SINGULAR = new Map(TYPES.map(([p, s]) => [p, s]));
const PLURAL = new Map(TYPES.map(([p, , pl]) => [p, pl]));

// "Finding 9" for F9; an invented code keeps its own spelling.
export function nameOf(i: Item): string {
  const s = SINGULAR.get(i.prefix);
  return s ? `${s} ${i.n}` : i.code;
}

// A Button label is one line, so a long title is cut to fit.
export function clip(s: string, width: number): string {
  return s.length <= width ? s : `${s.slice(0, width - 1)}…`;
}

// A menu row: the name on the left and the count flush right in `width` cells.
// A name too long for the row is cut, so the row never wraps onto a second line.
export function menuRow(name: string, count: string, width: number): string {
  const cut = clip(name, Math.max(2, width - count.length - 1));
  return `${cut}${' '.repeat(Math.max(1, width - cut.length - count.length))}${count}`;
}

export function groupName(p: string): string {
  const pl = PLURAL.get(p);
  return pl ? `${pl} (${p})` : p;
}

// Types sorted by the label the reader scans: the band shows codes, so it
// sorts by code; the filter menu and the pane's groups show names, so they
// sort by name.
const alpha = (a: string, b: string) => a.localeCompare(b, 'en');
export function byCode(ps: string[]): string[] {
  return [...ps].sort(alpha);
}
export function byName(ps: string[]): string[] {
  return [...ps].sort((a, b) => alpha(groupName(a), groupName(b)));
}

// The ledger's files through the engine's filesystem. register.ts has its own
// copy.
function engineIo($: EngineInterface): Io {
  return {
    read: async (path) => ((await $.fs.exists(path)) ? String(await $.fs.read(path)) : null),
    list: async (dir) => ((await $.fs.exists(dir)) ? $.fs.list(dir) : []),
  };
}

export type Show = KatharsisShow;
export const SHOWS: Show[] = ['all', 'open', 'resolved'];

// View short lists titles, full adds every body, current lists the latest
// reply's two rows, Codes this turn and Still open, in full, and settings
// swaps the list for Katharsis's own rows from /config.
export type View = KatharsisView;
export const VIEWS: { value: View; text: string }[] = [
  { value: 'short', text: 'titles only' },
  { value: 'full', text: 'every body' },
  { value: 'current', text: 'this turn and still open' },
  { value: 'settings', text: 'Katharsis options' },
];

type State = {
  active: boolean;
  loaded: boolean;
  commandRegistered: boolean;
  items: Item[];
  query: string;
  prefix: string;
  // Which items the pane shows by status. It outlives a pane close, unlike
  // the rest of the pane's state.
  show: Show;
  view: View;
  selected: string;
  // Each open question's picked letter and note in its card, until send,
  // and the codes whose send is still out.
  picks: Map<string, string>;
  notes: Map<string, string>;
  sending: Set<string>;
  filterOpen: boolean;
  statusOpen: boolean;
  viewOpen: boolean;
  paneOpen: boolean;
  answered: Map<string, string>;
  closed: Map<string, Closer>;
  citedBy: Map<string, Item[]>;
  // Codes an erratum corrected without restating them, with that erratum.
  corrected: Map<string, Item>;
  // Whether this session shows the answer hint on the Still open row.
  hint: boolean;
  // The last finished reply's text, which tells the latest reply block apart.
  lastAnswer: string;
  // A code list the pane shows alone: the still open codes.
  only: string[];
  // The autonomy level register() got, '' for guided.
  level: string;
  // Whether the band option is on, which register() got too.
  band: boolean;
  // Katharsis's /config rows, listed when the settings view opens.
  options: ConfigRow[];
  // The answers behind a suggestion to move to standard, checked once a
  // session, and null when there is none to make. scan marks this session's
  // check, so one still running when a reset starts another is ignored.
  suggestion: Agreement | null;
  scan: symbol | null;
};

export async function loadLedger($: EngineInterface): Promise<{ active: boolean; items: Item[] }> {
  const home = (await $.env.get('HOME')) ?? '';
  const data = (await $.env.get('KATHARSIS_DATA')) ?? `${home}/.claude/katharsis-data`;
  const sid = await $.session.id();
  if (!sid) return { active: false, items: [] };
  const state = await styleState((await $.settings.read()).outputStyle, (name) => hasOwnStyle($, name));
  if (state !== 'on') return { active: false, items: [] };
  return { active: true, items: await threadItems(engineIo($), data, sid) };
}

// Every question code an answer row names, with its letter, across the handoff chain.
export async function loadAnswered($: EngineInterface): Promise<Map<string, string>> {
  const home = (await $.env.get('HOME')) ?? '';
  const data = (await $.env.get('KATHARSIS_DATA')) ?? `${home}/.claude/katharsis-data`;
  const sid = await $.session.id();
  if (!sid) return new Map();
  const io = engineIo($);
  return answeredOf(await threadTexts(io, `${data}/answers`, await thread(io, data, sid), false));
}

// The answer hint shows on the row in the first 3 sessions that drew it. The
// file holds their ids, one per line, and deleting it starts the count over.
async function hintHere($: EngineInterface, drawn: boolean, g: number): Promise<boolean> {
  const home = (await $.env.get('HOME')) ?? '';
  const data = (await $.env.get('KATHARSIS_DATA')) ?? `${home}/.claude/katharsis-data`;
  const sid = await $.session.id();
  if (!sid) return false;
  const f = `${data}/hint-sessions`;
  const ids = (await $.fs.exists(f)) ? String(await $.fs.read(f)).split('\n').filter(Boolean) : [];
  if (ids.includes(sid)) return true;
  if (!drawn || ids.length >= HINT_SESSIONS) return false;
  // After a /clear, sid is the new session's and drawn was judged on the old
  // one's questions, so an overtaken refresh spends no hint.
  if (g !== generation) return false;
  await $.fs.write(f, `${[...ids, sid].join('\n')}\n`);
  return true;
}

// The suggestion to move from guided to standard, made only at guided and
// only until the person dismisses it. The dismissal is a file in the data
// directory, and deleting it brings the suggestion back. Another open session
// can write it at any time, so it is checked again once the scan is done.
async function suggestionHere($: EngineInterface): Promise<Agreement | null> {
  if (S.level || (await suggestDismissed($))) return null;
  const a = await agreement(engineIo($), await dataDir($));
  return suggestsStandard(a) && !(await suggestDismissed($)) ? a : null;
}

// The settings view lists the rows /config draws for this plugin's options
// and sets them as the person would there, so an option added to the manifest
// shows up with no change here. A deny, from another plugin's hook or a lock,
// is a toast, and the rows are listed again either way.
export async function listOptions($: EngineInterface): Promise<void> {
  // A plugin's keys are `katharsis.<field>` however it was installed, while
  // its owner reads katharsis@inline when it loads from a folder.
  S.options = (await $.config.list()).filter((r) => r.key.startsWith('katharsis.'));
  $.ui.invalidate('ui.render');
}

export async function setOption($: EngineInterface, row: ConfigRow, value: ConfigValue): Promise<void> {
  // The set reloads the module, so what restore reads is written first.
  await Promise.all([
    $.state.set(VIEW, S.view),
    $.state.set(LAST_ANSWER, S.lastAnswer),
    $.state.set(SHOW, S.show),
  ]).catch(() => undefined);
  const r = await $.config.set({ key: row.key, value }).catch((err: unknown) => ({ deny: err instanceof Error ? err.message : String(err) }));
  if (r.deny !== undefined) $.ui.toast(`Katharsis could not change ${row.label}: ${r.deny}`);
  await listOptions($);
}

// A change in the settings view reloads this module, which starts S over, so
// the view, the last reply, and Status also go to the session's state, and
// session start, which a reload raises again, puts them back. The drawer
// itself stays up through a reload, so restore asks whether it is.
const VIEW = { plugin: 'katharsis', key: 'view' } as const;
const LAST_ANSWER = { plugin: 'katharsis', key: 'lastAnswer' } as const;
const SHOW = { plugin: 'katharsis', key: 'show' } as const;

export function setView($: EngineInterface, v: View): void {
  S.view = v;
  void $.state.set(VIEW, v).catch(() => undefined);
}

export async function restore($: EngineInterface): Promise<void> {
  const g = generation;
  const view = (await $.state.get(VIEW)).value;
  const last = (await $.state.get(LAST_ANSWER)).value;
  const show = (await $.state.get(SHOW)).value;
  // A failed lookup leaves the drawer counted closed rather than losing the rest.
  const open = (await $.ui.panes().catch(() => [])).some((p) => p.id === PANE && p.isPlaced);
  // A /clear that overtook the reads already set the new session's values.
  if (g !== generation) return;
  if (view) S.view = view;
  if (last !== undefined) S.lastAnswer = last;
  if (show) S.show = show;
  S.paneOpen = open;
  if (S.view === 'settings') await listOptions($);
  $.ui.invalidate('ui.render');
}

async function suggestDismissed($: EngineInterface): Promise<boolean> {
  return $.fs.exists(`${await dataDir($)}/${SUGGEST_DISMISSED}`);
}

export function fresh(): State {
  return {
    active: false,
    loaded: false,
    commandRegistered: false,
    items: [],
    query: '',
    prefix: 'all',
    show: 'all',
    view: 'short',
    selected: '',
    picks: new Map(),
    notes: new Map(),
    sending: new Set(),
    filterOpen: false,
    statusOpen: false,
    viewOpen: false,
    paneOpen: false,
    answered: new Map(),
    closed: new Map(),
    citedBy: new Map(),
    corrected: new Map(),
    hint: false,
    lastAnswer: '',
    only: [],
    level: '',
    band: false,
    options: [],
    suggestion: null,
    scan: null,
  };
}

// Module state: the render hooks read it, the press and input closures
// mutate it and invalidate. A function that takes $ must be declared at the
// top of the file (the engine checks where $ goes), hence module scope.
export const S: State = fresh();

// A register() call or /clear empties the cache and moves the generation on,
// so a refresh that began before it writes nothing, and a drawing after it
// starts its own load rather than joining one that read the old session.
let generation = 0;
let loading: Promise<void> | null = null;
export function reset(): void {
  generation += 1;
  loading = null;
}

export async function refresh($: EngineInterface): Promise<void> {
  const g = generation;
  const r = await loadLedger($);
  const answered = r.active ? await loadAnswered($) : new Map();
  const hint = r.active ? await hintHere($, openQuestions(r.items, answered).length > 0, g) : false;
  // A suggestion another session dismissed goes at this session's next
  // refresh. The scan reads every answers file, so it runs beside the
  // refresh rather than inside it, and a failed scan just makes none.
  const dropSuggestion = S.suggestion !== null && (await suggestDismissed($));
  if (g !== generation) return;
  S.active = r.active;
  S.items = r.items;
  S.answered = answered;
  S.closed = closersOf(S.items, S.answered);
  S.citedBy = citersOf(S.items);
  S.corrected = correctionsOf(S.items);
  S.hint = hint;
  if (dropSuggestion) S.suggestion = null;
  if (r.active && !S.scan) startScan($);
  S.loaded = true;
  if (S.active && !S.commandRegistered) await registerCommand($);
}

// The suggestion scan, once per cache: a scan a register() call or /clear
// superseded draws nothing.
function startScan($: EngineInterface): void {
  const scan = Symbol('scan');
  S.scan = scan;
  void suggestionHere($)
    .then((a) => {
      if (!a || S.scan !== scan || S.level) return;
      S.suggestion = a;
      $.ui.invalidate('ui.render');
    })
    .catch(() => undefined);
}

// Marked before the await, so refreshes that overlap register it once.
async function registerCommand($: EngineInterface): Promise<void> {
  S.commandRegistered = true;
  try {
    await $.command.register({
      name: PANE,
      description: 'Open the Katharsis drawer: every coded item this session, searchable',
      argumentHint: '[query]',
      immediate: true,
    });
  } catch (err) {
    S.commandRegistered = false;
    throw err;
  }
}

// One load shared by every drawing that finds the cache empty, so the replies
// on screen after a reload read the ledger and register /kdrawer once.
export function load($: EngineInterface): Promise<void> {
  if (!loading) {
    const p: Promise<void> = refresh($).finally(() => {
      // A reset may have started a newer load meanwhile; that one stays shared.
      if (loading === p) loading = null;
    });
    loading = p;
  }
  return loading;
}

export async function redrawFresh($: EngineInterface): Promise<void> {
  await refresh($);
  $.ui.invalidate('ui.render');
}

export function prefixes(): string[] {
  return [...new Set(S.items.map((i) => i.prefix))];
}

// The Still open row's groups, in STILL_OPEN order, each type's unclosed
// codes with the newest few shown and the rest counted, so nothing open
// drops out of sight.
export function stillOpen(): { prefix: string; all: Item[]; shown: Item[] }[] {
  return STILL_OPEN.map((p) => {
    const all =
      p === 'Q' ? openQuestions(S.items, S.answered) : ofPrefix(p).filter((i) => !S.closed.has(i.code.toUpperCase()));
    return { prefix: p, all, shown: all.slice(-STILL_OPEN_SHOWN) };
  }).filter((g) => g.all.length > 0);
}

// What View current lists: the codes the latest reply cites other than
// questions, as its Codes this turn row names them, and every still open code.
export function current(): { turn: Item[]; open: Item[] } {
  const byCodeMap = new Map(S.items.map((i) => [i.code.toUpperCase(), i]));
  const turn = [...new Set((S.lastAnswer.match(CODE_RE) ?? []).map((c) => c.toUpperCase()))]
    .map((c) => byCodeMap.get(c))
    .filter((i): i is Item => i !== undefined && i.prefix !== 'Q');
  return { turn: codeOrder(turn), open: stillOpen().flatMap((g) => g.all) };
}

// A dismissed code is a question answered `x`, an item an `X` line dropped,
// or a finding an erratum withdrew.
export function dismissed(i: Item): boolean {
  const c = S.closed.get(i.code.toUpperCase());
  return c !== undefined && (c.letter === 'x' || c.prefix === 'X' || i.prefix === 'F');
}

export function isClosed(i: Item): boolean {
  return S.closed.has(i.code.toUpperCase());
}

// A row's status glyph: a circle for an item still open or of a type that
// never closes, a check for one answered or closed, a cross for one dismissed
// or dropped, and a bang for an open line an erratum corrected without
// restating it, since its title is the wrong version. Every row has one, and
// the Status menu carries the key.
export function glyph(i: Item): string {
  if (!isClosed(i)) return S.corrected.has(i.code.toUpperCase()) ? '!' : '○';
  return dismissed(i) ? '✗' : '✓';
}

// A card's closing line names how the item ended, with a verb for each way
// and the line that did it: a question Answered, Settled, or Dismissed, owed
// work Done, a block Cleared, a risk Retired, a caveat Lifted, anything an
// exclusion Dropped, and a finding Withdrawn. The mark and verb are the head,
// which alone takes the colour; the tail is information.
const VERB: Record<string, string> = { Q: 'Settled by', NA: 'Done in', MV: 'Done in', W: 'Done in', B: 'Cleared by', R: 'Retired by', C: 'Lifted by' };

export function closing(i: Item): { head: string; tail: string } | null {
  const c = S.closed.get(i.code.toUpperCase());
  if (!c) return null;
  const by = closerName(c);
  if (i.prefix === 'F') return { head: '✗ Withdrawn', tail: c.by ? ` by ${c.by}` : '' };
  if (c.letter === 'x') return { head: '✗ Dismissed', tail: '' };
  if (S.answered.has(i.code.toUpperCase())) return { head: '✓ Answered', tail: answeredTail(c.letter, by) };
  if (c.prefix === 'X') return { head: '✗ Dropped by', tail: ` ${by}` };
  return { head: `✓ ${VERB[i.prefix] ?? 'Resolved by'}`, tail: ` ${by}` };
}

// The line that closed an item, with its title when it has one.
function closerName(c: Closer): string {
  if (!c.by) return '';
  return c.title ? `${c.by}: ${c.title}` : c.by;
}

// An answer's tail: the letter picked, then the line it came in.
function answeredTail(letter: string | undefined, by: string): string {
  const picked = letter ? ` ${letter}` : '';
  return by ? `${picked} · in ${by}` : picked;
}

// A finding closes only when withdrawn, so its card lists the codes that cite it.
export function backlinks(i: Item): string {
  const by = i.prefix === 'F' ? (S.citedBy.get(i.code.toUpperCase()) ?? []) : [];
  return by.length > 0 ? `Cited by ${by.map((j) => j.code).join(' ')}` : '';
}

// What send posts for a question: the picked letter and the note after it,
// or the note alone as an own answer (z). A dismissal puts a dash before its
// note, because a word after x reads as prose.
export function answerText(code: string, letter: string, note: string): string {
  const n = note.trim();
  if (letter === '') return n === '' ? '' : `${code} z ${n}`;
  if (n === '') return `${code} ${letter}`;
  return letter === 'x' ? `${code} x - ${n}` : `${code} ${letter} ${n}`;
}

// One question's pick and note, and the answer line they make.
type Held = { code: string; letter: string; note: string; text: string };

// Whether the parser reads a held answer as exactly that one answer.
function readsAsOne(h: Held, round: Round, asked: Map<string, string[]>): boolean {
  const read = readAnswers(h.text, round, asked);
  const a = read.answers[0];
  return read.unclear.length === 0 && read.answers.length === 1 && a!.code === h.code && a!.letter === (h.letter || 'z');
}

// The held answers, or a toast and null when one is empty or would read as
// something else.
function heldAnswers($: EngineInterface, codes: string[], round: Round, asked: Map<string, string[]>): Held[] | null {
  const held = codes.map((code) => {
    const letter = S.picks.get(code) ?? '';
    const note = S.notes.get(code) ?? '';
    return { code, letter, note, text: answerText(code, letter, note) };
  });
  const empty = held.find((h) => h.text === '');
  if (empty) {
    $.ui.toast(`Pick an option or write your own answer to ${empty.code} first`);
    return null;
  }
  const bad = held.find((h) => !readsAsOne(h, round, asked));
  if (bad) {
    $.ui.toast(`Katharsis would not read "${bad.text}" as one answer to ${bad.code}: reword the note`);
    return null;
  }
  return held;
}

// Each pick and note stays on its card while the send is out, so a failed
// send leaves the cards as the person last left them, edits included. The
// rows go under the session the send started in, in case a /clear lands
// while it is out.
async function submitAnswers($: EngineInterface, codes: string[], text: string): Promise<{ sid?: string; entered?: string }> {
  const { sending } = S;
  for (const c of codes) sending.add(c);
  const out: { sid?: string; entered?: string } = {};
  try {
    out.sid = (await $.session.id()) ?? undefined;
    const r = await $.prompt.submit({ text, asUser: true });
    if (r.drop === undefined) out.entered = r.text;
  } catch {}
  for (const c of codes) sending.delete(c);
  return out;
}

// A pick or note changed while the send was out stays, in case the question
// stays open.
function clearSent(held: Held[], picks: Map<string, string>, notes: Map<string, string>): void {
  for (const h of held) {
    if ((picks.get(h.code) ?? '') === h.letter) picks.delete(h.code);
    if ((notes.get(h.code) ?? '') === h.note) notes.delete(h.code);
  }
}

// Send posts answers as the person's next message, one line per question,
// and leaves the prompt box alone. A card's send posts its own question; the
// queue's send posts every open question that holds a pick or a note. Claude
// Code runs none of this plugin's prompt.submit hooks on a prompt the plugin
// submits, so send records the answer rows the prompt hook would have. The
// turn gets none of that hook's other lines (the classify reminder,
// Dismissed, Open questions), and the style alone carries them. A note the
// parser would read as other than its own answer stops the whole send.
export async function sendAnswers($: EngineInterface, codes: string[]): Promise<void> {
  if (codes.length === 0 || codes.some((c) => S.sending.has(c))) return;
  const asked = new Map(S.items.filter((i) => i.prefix === 'Q').map((i) => [i.code.toUpperCase(), i.options.map((o) => o.key.toLowerCase())]));
  const round = latestRound(S.items);
  const held = heldAnswers($, codes, round, asked);
  if (!held) return;
  const text = held.map((h) => h.text).join('\n');
  const { picks, notes } = S;
  const { sid, entered } = await submitAnswers($, codes, text);
  if (entered === undefined) {
    $.ui.toast(`Katharsis could not send ${codes.join(' ')}: ${held.length === 1 ? `type ${text}` : 'type each answer on its own line'} and press Enter instead`);
    return;
  }
  // A hook beneath may rewrite the prompt, so the rows record what entered.
  // A failed write or redraw costs the rows, never the send.
  clearSent(held, picks, notes);
  try {
    if (sid) await recordAnswers({ read: engineIo($).read, write: (p, s) => $.fs.write(p, s) }, await dataDir($), sid, readAnswers(entered, round, asked).answers);
    await refresh($);
  } catch {}
  $.ui.invalidate('ui.render');
}

// A user step's command block onto the clipboard of the surface the press
// came from. A toast says whether it took, because the copy draws nothing.
export async function copyBlock($: EngineInterface, code: string, text: string, surface: Parameters<EngineInterface['ui']['copy']>[0]['surface']): Promise<void> {
  let copied = false;
  try {
    copied = (await $.ui.copy({ text, surface })).isCopied;
  } catch {}
  $.ui.toast(copied ? `Copied ${code}'s command` : `Katharsis could not copy ${code}'s command: select it in the card instead`);
}

export function hintFor(code: string): string {
  return `Ex: ${code} a or ${code} z <custom>`;
}

export function ofPrefix(p: string): Item[] {
  return S.items.filter((i) => i.prefix === p);
}

function haystack(i: Item): string {
  return [i.code, nameOf(i), i.title, i.summary, i.block, ...i.options.map((o) => `${o.key}. ${o.text}`), i.rec]
    .join('\n')
    .toLowerCase();
}

// Status open keeps the types that can close and are not yet closed, and Status
// resolved the closed ones, done and dropped alike.
export function shows(i: Item, show: Show = S.show): boolean {
  if (show === 'open') return CLOSING.has(i.prefix) && !isClosed(i);
  if (show === 'resolved') return isClosed(i);
  return true;
}

// A query spelled as a code ("F1") finds that code alone, so F10 to F19 stay
// out; anything else searches the text. A code asked for by name, the
// selected one, or the still open list shows whatever Status says, since the
// person went to it directly, and so does View current. Open items come
// first within each type, in ledger order otherwise. A heading asks with
// Status set to all.
export function visible(show: Show = S.show): Item[] {
  const q = S.query.trim().toLowerCase();
  const exact = CODE_ONLY.test(q);
  const cur = S.view === 'current' ? current() : null;
  const listed = cur ? new Set([...cur.turn, ...cur.open].map((i) => i.code)) : null;
  const inScope = (i: Item) => (S.prefix === 'all' || i.prefix === S.prefix) && (S.only.length === 0 || S.only.includes(i.code));
  const matches = (i: Item) => q === '' || (exact ? i.code.toLowerCase() === q : haystack(i).includes(q));
  // Asked for directly, so Status does not hide it.
  const direct = (i: Item) => exact || S.only.length > 0 || listed !== null || i.code === S.selected;
  const inView = (i: Item) => !listed || listed.has(i.code);
  const byStatus = (i: Item) => direct(i) || shows(i, show);
  return S.items
    .filter((i) => inScope(i) && inView(i) && matches(i) && byStatus(i))
    .sort((a, b) => Number(isClosed(a)) - Number(isClosed(b)));
}

// How many lines a wrapping row takes: `widths` laid left to right, `gap`
// apart, in `room` cells.
export function lines(widths: number[], room: number, gap: number): number {
  let n = 1;
  let used = 0;
  for (const w of widths) {
    if (used > 0 && used + gap + w > room) {
      n += 1;
      used = w;
    } else used += (used > 0 ? gap : 0) + w;
  }
  return n;
}

export async function openPane($: EngineInterface, query?: string, only: string[] = []): Promise<string> {
  if (query !== undefined) {
    S.query = query;
    S.prefix = 'all';
    S.selected = CODE_ONLY.test(query.trim()) ? query.trim().toUpperCase() : '';
  }
  // Every open starts in the short view with the menus closed, except the
  // still open codes, which open in full so their options show. Status keeps
  // its last setting.
  S.only = only;
  setView($, only.length > 0 ? 'full' : 'short');
  S.filterOpen = S.statusOpen = S.viewOpen = false;
  const opened = await $.ui.open({ id: PANE, title: TITLE, focus: true, closeOnEscape: true });
  S.paneOpen = opened.isPlaced;
  return opened.isPlaced ? '' : `Katharsis drawer is waiting: ${opened.reason}`;
}

export async function dataDir($: EngineInterface): Promise<string> {
  const home = (await $.env.get('HOME')) ?? '';
  return (await $.env.get('KATHARSIS_DATA')) ?? `${home}/.claude/katharsis-data`;
}

// The session record's title (session.ts). It lives with the drawer because
// the engine takes one hook per event from the plugin, and the drawer's
// hooks already hold turn.complete. ledger-stop.sh writes the transcript path
// beside the record, since the Stop hook's input is the one place it arrives.
export async function titleSession($: EngineInterface): Promise<void> {
  const sid = await $.session.id();
  if (!sid) return;
  const data = await dataDir($);
  const io = engineIo($);
  const rec = await readRecord(io, data, sid);
  if (!rec || !wantsTitle(rec, await $.session.turns())) return;
  const r = await $.model.fork({ prompt: TITLE_PROMPT });
  const title = r.isAnswered ? cleanTitle(r.text) : '';
  // Re-read, since the next prompt may have touched the record meanwhile.
  const fresh = title ? await readRecord(io, data, sid) : null;
  if (fresh) await $.fs.write(recordPath(data, sid), `${JSON.stringify({ ...fresh, title, titleSource: 'katharsis' }, null, 2)}\n`);
}
