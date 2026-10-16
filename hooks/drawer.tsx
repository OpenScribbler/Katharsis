// drawer.tsx: the Katharsis drawer. An optional one-row band above the prompt
// names the code types this session has, each with a hover list of its titles;
// its button, or /kdrawer [query], opens a pane that lists every item grouped by
// type, searchable by text and filterable by type and by status. In a reply,
// each code on record becomes a link that opens the pane at that code, and a
// row of chips under the reply carries a hover card per code.
//
// It reads the ledger through ledger.ts (one handoff chain is one numbering
// space, a later record for a code supersedes an earlier one), and only while
// the output style is Katharsis. It reads the style from settings rather than
// the .active-<sid> marker register.ts writes at each prompt, because the
// marker is missing until the first prompt of a new, forked, or cleared
// session. The render hooks draw from a cache that session start, the end of
// each turn, and every pane open refresh. A reply or the band drawn while the
// cache is empty, as after a reload or /clear, loads it first. The refresh at
// session start registers /kdrawer before the first prompt.
//
// Every hook falls through to next(e) when it throws: the drawer may vanish,
// but it never stands between the person and the session.

import type { ConfigRow, ConfigValue, EngineInterface, On } from 'claude-code';
import { answeredOf, citersOf, CLOSING, closersOf, correctionsOf, latestRound, openQuestions, readAnswers, recordAnswers, type Closer } from './answers.ts';
import { codeOrder, readRecord, recordPath, thread, threadItems, threadTexts, type Io, type Item } from './ledger.ts';
import { cleanTitle, KATHARSIS_STYLES, TITLE_PROMPT, wantsTitle, withTranscript } from './session.ts';
import { agreement, suggestsStandard, type Agreement } from './suggest.ts';
import type { KatharsisShow, KatharsisView } from '../types';

const PANE = 'kdrawer';
const TITLE = 'Katharsis';
const TEAL = '#14B8A6';
const CODE_RE = /(?<![A-Za-z0-9-])[A-Z][A-Z-]{0,3}\d+(?![A-Za-z0-9])/g;
const CODE_ONLY = /^[A-Za-z][A-Za-z-]{0,3}\d+$/;
// Inline links point here. The host is reserved and never resolves, and the
// path spells the code out for a terminal that shows a link's target on hover.
const LINK_BASE = 'https://katharsis.invalid/';
const MARKDOWN_MAX = 10000;
// Titles a band reveal lists at most, so it never outgrows a short band.
const REVEAL_MAX = 10;
// The Still open row: the types someone has to act on, the person's first,
// and the newest codes it shows of each. Next actions and waits are the
// model's to finish, so the pane's filter holds them instead.
const STILL_OPEN = ['Q', 'MV', 'B', 'R'];
const STILL_OPEN_SHOWN = 3;
// Sessions that show the answer hint on the row itself; later ones show it
// only in a question's hover card.
const HINT_SESSIONS = 3;
const SUGGEST_DISMISSED = 'autonomy-suggestion-dismissed';

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
function clip(s: string, width: number): string {
  return s.length <= width ? s : `${s.slice(0, width - 1)}…`;
}

// A menu row: the name on the left and the count flush right in `width` cells.
// A name too long for the row is cut, so the row never wraps onto a second line.
function menuRow(name: string, count: string, width: number): string {
  const cut = clip(name, Math.max(2, width - count.length - 1));
  return `${cut}${' '.repeat(Math.max(1, width - cut.length - count.length))}${count}`;
}

function groupName(p: string): string {
  const pl = PLURAL.get(p);
  return pl ? `${pl} (${p})` : p;
}

// Types sorted by the label the reader scans: the band shows codes, so it
// sorts by code; the filter menu and the pane's groups show names, so they
// sort by name.
const alpha = (a: string, b: string) => a.localeCompare(b, 'en');
function byCode(ps: string[]): string[] {
  return [...ps].sort(alpha);
}
function byName(ps: string[]): string[] {
  return [...ps].sort((a, b) => alpha(groupName(a), groupName(b)));
}
// The ledger's files through the engine's filesystem. register.ts has its own
// copy, since the engine never lets $ cross an import.
function engineIo($: EngineInterface): Io {
  return {
    read: async (path) => ((await $.fs.exists(path)) ? String(await $.fs.read(path)) : null),
    list: async (dir) => ((await $.fs.exists(dir)) ? $.fs.list(dir) : []),
  };
}

type Show = KatharsisShow;
const SHOWS: Show[] = ['all', 'open', 'resolved'];

// View short lists titles, full adds every body, current lists the latest
// reply's two rows, Codes this turn and Still open, in full, and settings
// swaps the list for Katharsis's own rows from /config.
type View = KatharsisView;
const VIEWS: { value: View; text: string }[] = [
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
  const style = (await $.settings.read()).outputStyle;
  if (!sid || typeof style !== 'string' || !KATHARSIS_STYLES.has(style)) return { active: false, items: [] };
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
async function listOptions($: EngineInterface): Promise<void> {
  // A plugin's keys are `katharsis.<field>` however it was installed, while
  // its owner reads katharsis@inline when it loads from a folder.
  S.options = (await $.config.list()).filter((r) => r.key.startsWith('katharsis.'));
  $.ui.invalidate('ui.render');
}

async function setOption($: EngineInterface, row: ConfigRow, value: ConfigValue): Promise<void> {
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

function setView($: EngineInterface, v: View): void {
  S.view = v;
  void $.state.set(VIEW, v).catch(() => undefined);
}

async function restore($: EngineInterface): Promise<void> {
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

function fresh(): State {
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
const S: State = fresh();

// A register() call or /clear empties the cache and moves the generation on,
// so a refresh that began before it writes nothing, and a drawing after it
// starts its own load rather than joining one that read the old session.
let generation = 0;
let loading: Promise<void> | null = null;
function reset(): void {
  generation += 1;
  loading = null;
}

async function refresh($: EngineInterface): Promise<void> {
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
  if (r.active && !S.scan) {
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
  S.loaded = true;
  // Marked before the await, so refreshes that overlap register it once.
  if (S.active && !S.commandRegistered) {
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
}

// One load shared by every drawing that finds the cache empty, so the replies
// on screen after a reload read the ledger and register /kdrawer once.
function load($: EngineInterface): Promise<void> {
  if (!loading) {
    const p: Promise<void> = refresh($).finally(() => {
      // A reset may have started a newer load meanwhile; that one stays shared.
      if (loading === p) loading = null;
    });
    loading = p;
  }
  return loading;
}

async function redrawFresh($: EngineInterface): Promise<void> {
  await refresh($);
  $.ui.invalidate('ui.render');
}

function prefixes(): string[] {
  return [...new Set(S.items.map((i) => i.prefix))];
}

// The Still open row's groups, in STILL_OPEN order, each type's unclosed
// codes with the newest few shown and the rest counted, so nothing open
// drops out of sight.
function stillOpen(): { prefix: string; all: Item[]; shown: Item[] }[] {
  return STILL_OPEN.map((p) => {
    const all =
      p === 'Q' ? openQuestions(S.items, S.answered) : ofPrefix(p).filter((i) => !S.closed.has(i.code.toUpperCase()));
    return { prefix: p, all, shown: all.slice(-STILL_OPEN_SHOWN) };
  }).filter((g) => g.all.length > 0);
}

// What View current lists: the codes the latest reply cites other than
// questions, as its Codes this turn row names them, and every still open code.
function current(): { turn: Item[]; open: Item[] } {
  const byCodeMap = new Map(S.items.map((i) => [i.code.toUpperCase(), i]));
  const turn = [...new Set((S.lastAnswer.match(CODE_RE) ?? []).map((c) => c.toUpperCase()))]
    .map((c) => byCodeMap.get(c))
    .filter((i): i is Item => i !== undefined && i.prefix !== 'Q');
  return { turn: codeOrder(turn), open: stillOpen().flatMap((g) => g.all) };
}

// A dismissed code is a question answered `x`, an item an `X` line dropped,
// or a finding an erratum withdrew.
function dismissed(i: Item): boolean {
  const c = S.closed.get(i.code.toUpperCase());
  return c !== undefined && (c.letter === 'x' || c.prefix === 'X' || i.prefix === 'F');
}

function isClosed(i: Item): boolean {
  return S.closed.has(i.code.toUpperCase());
}

// A row's status glyph: a circle for an item still open or of a type that
// never closes, a check for one answered or closed, a cross for one dismissed
// or dropped, and a bang for an open line an erratum corrected without
// restating it, since its title is the wrong version. Every row has one, and
// the Status menu carries the key.
function glyph(i: Item): string {
  if (!isClosed(i)) return S.corrected.has(i.code.toUpperCase()) ? '!' : '○';
  return dismissed(i) ? '✗' : '✓';
}

// A check is green, a cross red, a bang yellow, and a circle grey, in a drawer
// row, a band popup row, a card header, and the key.
function paint(Text: ReturnType<EngineInterface['ui']['resolve']>['Text'], g: string) {
  return g === '✓' ? <Text color="success">{g}</Text> : g === '✗' ? <Text color="error">{g}</Text> : g === '!' ? <Text color="warning">{g}</Text> : <Text dimColor>{g}</Text>;
}


// A card's closing line names how the item ended, with a verb for each way
// and the line that did it: a question Answered, Settled, or Dismissed, owed
// work Done, a block Cleared, a risk Retired, a caveat Lifted, anything an
// exclusion Dropped, and a finding Withdrawn. The mark and verb are the head,
// which alone takes the colour; the tail is information.
const VERB: Record<string, string> = { Q: 'Settled by', NA: 'Done in', MV: 'Done in', W: 'Done in', B: 'Cleared by', R: 'Retired by', C: 'Lifted by' };

function closing(i: Item): { head: string; tail: string } | null {
  const c = S.closed.get(i.code.toUpperCase());
  if (!c) return null;
  const by = c.by ? `${c.by}${c.title ? `: ${c.title}` : ''}` : '';
  if (i.prefix === 'F') return { head: '✗ Withdrawn', tail: c.by ? ` by ${c.by}` : '' };
  if (c.letter === 'x') return { head: '✗ Dismissed', tail: '' };
  if (S.answered.has(i.code.toUpperCase())) return { head: '✓ Answered', tail: `${c.letter ? ` ${c.letter}` : ''}${by ? ` · in ${by}` : ''}` };
  if (c.prefix === 'X') return { head: '✗ Dropped by', tail: ` ${by}` };
  return { head: `✓ ${VERB[i.prefix] ?? 'Resolved by'}`, tail: ` ${by}` };
}

// The closing line as one Text: the head in green or red, the tail plain.
function closingLine(Text: ReturnType<EngineInterface['ui']['resolve']>['Text'], i: Item, key?: string) {
  const c = closing(i);
  if (!c) return null;
  return (
    <Text key={key} wrap="wrap">
      <Text color={dismissed(i) ? 'error' : 'success'}>{c.head}</Text>
      {c.tail}
    </Text>
  );
}

// The card of a line an erratum corrected without restating it leads with the
// erratum, because the title above it is the version the erratum replaced.
function correctionLine(Text: ReturnType<EngineInterface['ui']['resolve']>['Text'], i: Item, key?: string) {
  const e = S.corrected.get(i.code.toUpperCase());
  if (!e) return null;
  return (
    <Text key={key} wrap="wrap">
      <Text color="warning">! Corrected by</Text>
      {` ${e.code}${e.summary ? `: ${e.summary}` : ''}`}
    </Text>
  );
}

// A finding closes only when withdrawn, so its card lists the codes that cite it.
function backlinks(i: Item): string {
  const by = i.prefix === 'F' ? (S.citedBy.get(i.code.toUpperCase()) ?? []) : [];
  return by.length > 0 ? `Cited by ${by.map((j) => j.code).join(' ')}` : '';
}

// What send posts for a question: the picked letter and the note after it,
// or the note alone as an own answer (z). A dismissal puts a dash before its
// note, because a word after x reads as prose.
export function answerText(code: string, letter: string, note: string): string {
  const n = note.trim();
  if (letter === '') return n === '' ? '' : `${code} z ${n}`;
  return n === '' ? `${code} ${letter}` : letter === 'x' ? `${code} x - ${n}` : `${code} ${letter} ${n}`;
}

// Send posts the card's answer as the person's next message and leaves the
// prompt box alone. Claude Code runs none of this plugin's prompt.submit
// hooks on a prompt the plugin submits, so send records the answer row the
// prompt hook would have. The turn gets none of that hook's other lines (the
// classify reminder, Dismissed, Open questions), and the style alone carries
// them. A note the parser would read as other than this one answer is not sent.
async function sendAnswer($: EngineInterface, code: string): Promise<void> {
  if (S.sending.has(code)) return;
  const letter = S.picks.get(code) ?? '';
  const note = S.notes.get(code) ?? '';
  const text = answerText(code, letter, note);
  if (text === '') {
    $.ui.toast(`Pick an option or write your own answer to ${code} first`);
    return;
  }
  const asked = new Map(S.items.filter((i) => i.prefix === 'Q').map((i) => [i.code.toUpperCase(), i.options.map((o) => o.key.toLowerCase())]));
  const round = latestRound(S.items);
  const read = readAnswers(text, round, asked);
  const one = read.unclear.length === 0 && read.answers.length === 1 && read.answers[0]!.code === code && read.answers[0]!.letter === (letter || 'z');
  if (!one) {
    $.ui.toast(`Katharsis would not read "${text}" as one answer to ${code}: reword the note`);
    return;
  }
  // The pick and note stay on the card while the send is out, so a failed
  // send leaves the card as the person last left it, edits included. The row
  // goes under the session the send started in, in case a /clear lands while
  // it is out.
  const { picks, notes, sending } = S;
  sending.add(code);
  let sid: string | undefined;
  let entered: string | undefined;
  try {
    sid = (await $.session.id()) ?? undefined;
    const r = await $.prompt.submit({ text, asUser: true });
    if (r.drop === undefined) entered = r.text;
  } catch {}
  sending.delete(code);
  if (entered === undefined) {
    $.ui.toast(`Katharsis could not send ${code}: type ${text} and press Enter instead`);
    return;
  }
  // A hook beneath may rewrite the prompt, so the row records what entered.
  // A failed write or redraw costs the row, never the send. A pick or note
  // changed while the send was out stays, in case the question stays open.
  if ((picks.get(code) ?? '') === letter) picks.delete(code);
  if ((notes.get(code) ?? '') === note) notes.delete(code);
  try {
    if (sid) await recordAnswers({ read: engineIo($).read, write: (p, s) => $.fs.write(p, s) }, await dataDir($), sid, readAnswers(entered, round, asked).answers);
    await refresh($);
  } catch {}
  $.ui.invalidate('ui.render');
}

function hintFor(code: string): string {
  return `Ex: ${code} a or ${code} z <custom>`;
}

function ofPrefix(p: string): Item[] {
  return S.items.filter((i) => i.prefix === p);
}

function haystack(i: Item): string {
  return [i.code, nameOf(i), i.title, i.summary, ...i.options.map((o) => `${o.key}. ${o.text}`), i.rec]
    .join('\n')
    .toLowerCase();
}

// Status open keeps the types that can close and are not yet closed, and Status
// resolved the closed ones, done and dropped alike.
function shows(i: Item, show: Show = S.show): boolean {
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
function visible(show: Show = S.show): Item[] {
  const q = S.query.trim().toLowerCase();
  const exact = CODE_ONLY.test(q);
  const cur = S.view === 'current' ? current() : null;
  const listed = cur ? new Set([...cur.turn, ...cur.open].map((i) => i.code)) : null;
  return S.items
    .filter(
      (i) =>
        (S.prefix === 'all' || i.prefix === S.prefix) &&
        (S.only.length === 0 || S.only.includes(i.code)) &&
        (!listed || listed.has(i.code)) &&
        (q === '' || (exact ? i.code.toLowerCase() === q : haystack(i).includes(q))) &&
        (exact || S.only.length > 0 || listed !== null || i.code === S.selected || shows(i, show)),
    )
    .sort((a, b) => Number(isClosed(a)) - Number(isClosed(b)));
}

// How many lines a wrapping row takes: `widths` laid left to right, `gap`
// apart, in `room` cells.
function lines(widths: number[], room: number, gap: number): number {
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

async function openPane($: EngineInterface, query?: string, only: string[] = []): Promise<string> {
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

// The reply's text with every code on record turned into a link, skipping
// fenced blocks and inline code spans, where a link would draw literally.
export function linkify(text: string, items: Item[]): { text: string; hrefs: string[] } {
  const hrefs = new Set<string>();
  const byCode = new Map(items.map((i) => [i.code.toUpperCase(), i]));
  const link = (seg: string) =>
    seg.replace(CODE_RE, (c) => {
      const item = byCode.get(c.toUpperCase());
      if (!item) return c;
      const href = `${LINK_BASE}${c}/${nameOf(item).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      hrefs.add(href);
      return `[${c}](${href})`;
    });
  let inFence = false;
  const out = text.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    return line
      .split(/(`[^`]*`)/)
      .map((seg) => (seg.startsWith('`') && seg.endsWith('`') && seg.length > 1 ? seg : link(seg)))
      .join('');
  });
  return { text: out.join('\n'), hrefs: [...hrefs] };
}

function codeOfHref(href: string): string {
  return href.startsWith(LINK_BASE) ? (href.slice(LINK_BASE.length).split('/')[0] ?? '') : '';
}

// The session record's two late fields (session.ts). They live here because
// the engine takes one hook per event from the plugin, and the drawer's
// hooks below already hold classic.Stop and turn.complete.
async function dataDir($: EngineInterface): Promise<string> {
  const home = (await $.env.get('HOME')) ?? '';
  return (await $.env.get('KATHARSIS_DATA')) ?? `${home}/.claude/katharsis-data`;
}

// The transcript's path arrives only with a classic hook's input.
async function noteTranscript($: EngineInterface, sid: string, path: string): Promise<void> {
  if (!sid || !path) return;
  const data = await dataDir($);
  const rec = await readRecord(engineIo($), data, sid);
  const next = rec && withTranscript(rec, path, await $.fs.exists(path));
  if (next) await $.fs.write(recordPath(data, sid), `${JSON.stringify(next, null, 2)}\n`);
}

async function titleSession($: EngineInterface): Promise<void> {
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

export function registerDrawer(on: On, level = '', band = false): void {
  // A register() call starts clean: a hot reload re-runs it, and so does a
  // change to the autonomy level or the band option in /config.
  Object.assign(S, fresh(), { level, band });
  reset();

  // After the Stop command hooks (ledger-stop.sh) have written this turn's rows.
  on('classic.Stop', async ($, e, next) => {
    const r = await next(e);
    await noteTranscript($, e.session_id, e.transcript_path).catch(() => undefined);
    await redrawFresh($);
    return r;
  }).catch(($, e, next) => next(e));

  // A managed plugin can route classic.* past the user tier (sec-default
  // does), so the Stop hook above may never run. turn.complete can fire
  // before ledger-stop.sh writes, so it reloads now and twice more after.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e);
    if (e.agentId) return r;
    // After the reply is out, so the title's fork never delays it.
    if (!e.isAborted) void titleSession($).catch(() => undefined);
    S.lastAnswer = typeof e.answer === 'string' ? e.answer : '';
    void $.state.set(LAST_ANSWER, S.lastAnswer).catch(() => undefined);
    await redrawFresh($);
    $.clock.after(1500, () => void redrawFresh($));
    $.clock.after(5000, () => void redrawFresh($));
    return r;
  }).catch(($, e, next) => next(e));

  // Focus moving to anything but the menu or its button closes the menu: a
  // click on a row, the search field, or another button.
  on('ui.focus', { requestId: PANE }, ($, e, next) => {
    if (S.filterOpen && e.element !== 'filter' && !e.element?.startsWith('filter-')) {
      S.filterOpen = false;
      $.ui.invalidate('ui.render');
    }
    if (S.statusOpen && e.element !== 'show' && !e.element?.startsWith('status-')) {
      S.statusOpen = false;
      $.ui.invalidate('ui.render');
    }
    if (S.viewOpen && e.element !== 'view' && !e.element?.startsWith('view-')) {
      S.viewOpen = false;
      $.ui.invalidate('ui.render');
    }
    return next(e);
  }).catch(($, e, next) => next(e));

  on('ui.close', async ($, e, next) => {
    const r = await next(e);
    if (e.id === PANE) {
      S.paneOpen = false;
      $.ui.invalidate('ui.render');
    }
    return r;
  }).catch(($, e, next) => next(e));

  on('session.start', async ($, e, next) => {
    await restore($).catch(() => undefined);
    await refresh($);
    return next(e);
  }).catch(($, e, next) => next(e));

  // /clear goes on under a new session id with no session.start, so the
  // cache still holds the old session's items. Emptying it makes the next
  // turn's refresh, or the next reply's or band's drawing, load the new one.
  // The command stays registered.
  on('session.end', async ($, e, next) => {
    const r = await next(e);
    if (e.reason === 'clear') {
      Object.assign(S, fresh(), { commandRegistered: S.commandRegistered, show: S.show, level: S.level, band: S.band });
      void $.state.set(VIEW, S.view).catch(() => undefined);
      void $.state.set(LAST_ANSWER, '').catch(() => undefined);
      reset();
      $.ui.invalidate('ui.render');
    }
    return r;
  }).catch(($, e, next) => next(e));

  on('command.run', { command: PANE }, async ($, e) => {
    await refresh($);
    if (!S.active) return { text: 'Katharsis is not active in this session.' };
    const text = await openPane($, e.args.trim());
    return text ? { text } : {};
  }).catch(($, e, next) => next(e));

  // The band, drawn only when the band option is on, since a row above the
  // prompt competes with other plugins' rows there: the title in teal, an
  // open button that k presses while the band holds the focus, the command's
  // name, then one label per type present. A Button's label takes no color, so the
  // title is text and the open button sits beside it. Hovering a label
  // reveals that type's latest titles above the row. The reveal sits above
  // the row so the row stays under the pointer while the band grows, and it
  // joins the label's hover group, so the pointer can move up into it and
  // press a title or the list-all button.
  //
  // Every reveal is one fixed height, so moving between labels never resizes
  // the band, and the band never grows past maxRows, where the engine would
  // make it scroll. Each label's box holds the pipe after it, so crossing a
  // pipe keeps the pointer inside a group and the reveal never blinks.
  // While the pane is open the reveals are left out: the pointer's last hover
  // stays lit under the docked pane, and the surface left it half drawn.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!S.band || e.props.hasSurvey) return next(e);
    if (!S.loaded) await load($);
    if (!S.active) return next(e);
    // Another plugin's band draws beneath this one rather than being replaced.
    const below = await next(e);
    const { Box, Text, Button } = $.ui.resolve(e);
    const present = byCode(prefixes());
    const most = Math.max(0, ...present.map((p) => ofPrefix(p).length));
    // Border 2, header 1, band row 1; what is left holds titles, at most 10.
    const listRows = Math.max(1, Math.min(REVEAL_MAX, most, e.props.maxRows - 4));
    const revealHeight = listRows + 3;
    const titleWidth = Math.max(10, e.props.bodyColumns - 4);
    // The hint goes when the row would not fit, as beside a docked pane: a row
    // too wide shrinks its Texts to nothing rather than cutting the tail.
    const labels = present.map((p) => `${p}:${ofPrefix(p).length}`).join('|');
    const hint = `▸ ${TITLE} · k: open | use /${PANE} · ${labels}`.length <= e.props.bodyColumns ? `| use /${PANE} ·` : '·';
    const openType = (p: string, code = '') => {
      S.query = code;
      S.selected = code;
      S.prefix = p;
      void openPane($).then(() => $.ui.invalidate('ui.render'));
    };
    const band = (
      <Box flexDirection="column">
        {(S.paneOpen ? [] : present).map((p) => {
          const items = ofPrefix(p);
          const shown = items.slice(-listRows);
          // The code cell fits the widest code shown, so every title starts in one column.
          const codeWidth = Math.max(0, ...shown.map((i) => i.code.length));
          return (
            <Box
              key={`reveal-${p}`}
              display="none"
              hover={{ scope: `kband-${p}`, display: 'flex' }}
              flexDirection="column"
              height={revealHeight}
              overflow="hidden"
              borderStyle="round"
              paddingX={1}
            >
              <Box key={`reveal-head-${p}`} flexDirection="row" gap={2}>
                <Text bold>{`${groupName(p)} · ${items.length}`}</Text>
                {items.length > shown.length ? <Text dimColor>{`latest ${shown.length}`}</Text> : null}
                <Button key={`reveal-all-${p}`} label={`list all ${items.length} ▸`} plain onPress={() => openType(p)} />
              </Box>
              {shown.map((i) => (
                // The row leads with the glyph its drawer row carries.
                <Box key={`reveal-row-${i.code}`} flexDirection="row">
                  <Box key={`reveal-glyph-${i.code}`} width={2} flexShrink={0}>{paint(Text, glyph(i))}</Box>
                  <Button
                    key={`reveal-${i.code}`}
                    label={clip(`${i.code.padEnd(codeWidth)}  ${i.title}`, titleWidth - 2)}
                    plain
                    onPress={() => openType(p, i.code)}
                  />
                </Box>
              ))}
            </Box>
          );
        })}
        <Box key="band-row" flexDirection="row" gap={1} height={1} overflow="hidden">
          <Box key="band-head" flexDirection="row" gap={1} flexShrink={0}>
            <Text color={TEAL}>{`▸ ${TITLE}`}</Text>
            <Text dimColor>·</Text>
            <Button
              key="open"
              label="open"
              hotkey="k"
              plain
              hover={{ scope: 'kband-open', underline: true }}
              // An empty query, as /kdrawer with no argument sends, so a code
              // the band opened last time does not stay listed past Status.
              onPress={() => {
                void openPane($, '').then(() => refresh($)).then(() => $.ui.invalidate('ui.render'));
              }}
            />
            <Text dimColor>{hint}</Text>
          </Box>
          {present.length === 0 ? <Text dimColor>no codes yet</Text> : null}
          <Box key="band-labels" flexDirection="row">
            {present.map((p, k) => (
              <Box key={`label-${p}`} flexDirection="row" flexShrink={0} hover={{ scope: `kband-${p}` }}>
                <Button
                  key={`band-${p}`}
                  label={`${p}:${ofPrefix(p).length}`}
                  plain
                  dimColor
                  hover={{ scope: `kband-${p}`, bold: true }}
                  onPress={() => openType(p)}
                />
                {k < present.length - 1 ? <Text dimColor>|</Text> : null}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    );
    return below ? <Box flexDirection="column">{band}{below}</Box> : band;
  }).catch(($, e, next) => next(e));

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e, next) => {
    if (!S.active) return next(e);
    const T = $.ui.resolve(e);
    const { Box, Text, Button } = T;
    const redraw = () => $.ui.invalidate('ui.render');
    const rows = visible();
    const width = Math.max(20, e.props.bodyColumns);
    const present = byName(prefixes());
    const groups = byName([...new Set(rows.map((i) => i.prefix))]);
    // The pane losing focus, a click in the transcript or the prompt, closes the menu.
    if (!e.props.isFocused) S.filterOpen = S.statusOpen = S.viewOpen = false;
    // Row 2 names the filter by its code when the full name would push the
    // View button onto a line of its own, as in a docked pane. A Button draws
    // as `[ label ]`, the controls sit 2 apart, and the row keeps 2 of padding.
    // Past that the row wraps, and the menu drops below its last line.
    const viewLabel = `View: ${S.view} ${S.viewOpen ? '▴' : '▾'}`;
    const full = S.view !== 'short';
    // The settings view hides search, Filter, Status, and Clear, which act on
    // the list it replaces, and leaves View as the way back.
    const settings = S.view === 'settings';
    // Status opens a menu of all, open, and resolved, with the key to the row
    // glyphs below them. Clear leaves it alone: Status is a standing
    // preference that outlives the pane, and Clear undoes one visit's search.
    const showLabel = `Status: ${S.show} ${S.statusOpen ? '▴' : '▾'}`;
    const named = S.only.length > 0 ? 'still open' : S.prefix === 'all' ? 'all types' : groupName(S.prefix);
    const controls = (filter: string) => [filter.length + 4, showLabel.length + 4, 'Clear'.length + 4, viewLabel.length + 4];
    const fits = lines(controls(`Filter: ${named} ▾`), width - 2, 2) === 1;
    const filterLabel = `Filter: ${fits ? named : S.only.length > 0 ? 'open' : S.prefix} ${S.filterOpen ? '▴' : '▾'}`;
    const menuTop = settings ? 1 : 1 + lines(controls(filterLabel), width - 2, 2);
    const menu = [
      { value: 'all', name: 'All types', n: S.items.length },
      ...present.map((p) => ({ value: p, name: groupName(p), n: ofPrefix(p).length })),
    ];
    // An inline pane's frame fits the tree, which a placed menu adds nothing
    // to, and stops at the rows the surface gave it. The tree grows to reach
    // an open menu's foot, and a menu taller than the room splits into columns.
    const inline = e.props.placement === 'inline';
    // Columns stop at what the drawer's width holds whole, and a menu still
    // taller than the room scrolls with the drawer.
    const longest = Math.max(...menu.map((f) => `● ${f.name} ${f.n}`.length));
    const room = inline ? Math.max(1, e.props.scroll.bodyRows - menuTop - 2) : menu.length;
    const across = Math.min(Math.ceil(menu.length / room), Math.max(1, Math.floor((width - 2) / (longest + 2))));
    const perColumn = Math.ceil(menu.length / across);
    // Recounted, so a split the width capped never leaves its last column empty.
    const columns = Math.ceil(menu.length / perColumn);
    // The menu reaches the Clear button's right edge, wider only for a long name.
    const reach = filterLabel.length + 4 + 2 + showLabel.length + 4 + 2 + 'Clear'.length + 4;
    const menuWidth = Math.min(width, Math.max(reach, columns * longest + (columns - 1) * 2 + 4));
    const cellWidth = Math.floor((menuWidth - 4 - (columns - 1) * 2) / columns);
    // The Status menu drops below the Status button, or from the left edge
    // when the button wrapped onto a line of its own.
    const statusMenu = SHOWS.map((s) => ({
      value: s,
      n: S.items.filter((i) => (S.prefix === 'all' || i.prefix === S.prefix) && shows(i, s)).length,
    }));
    const legend = [
      { g: '○', text: 'open, or never closes' },
      { g: '✓', text: 'answered, settled, or done' },
      { g: '✗', text: 'dismissed, dropped, or withdrawn' },
      { g: '!', text: 'corrected, title not restated' },
    ];
    const statusWidth = Math.min(width, Math.max(...legend.map((l) => l.text.length + 2), ...statusMenu.map((f) => `● ${f.value} ${f.n}`.length)) + 4);
    // A menu wider than the room right of the button shifts left to stay inside the drawer.
    // A legend line too long for the menu wraps by word, and each wrap adds a row.
    const legendRows = legend.reduce((n, l) => n + lines(l.text.split(' ').map((w) => w.length), statusWidth - 6, 1), 0);
    // The View menu hangs from the right edge, under the View button.
    const viewWidth = Math.min(width, Math.max(...VIEWS.map((v) => `● ${v.value}  ${v.text}`.length)) + 4);
    const menuFoot = menuTop + (S.filterOpen ? perColumn + 2 : S.statusOpen ? statusMenu.length + legendRows + 3 : S.viewOpen ? VIEWS.length + 2 : 0);
    const statusLeft = Math.max(0, Math.min(width - statusWidth, lines([filterLabel.length + 4, showLabel.length + 4], width - 2, 2) === 1 ? filterLabel.length + 4 + 2 : 0));

    // An open question's card holds an answer until send posts it: an option
    // or dismiss picks a letter, pressing it again unpicks it, and the field
    // holds a note, or the own answer when nothing is picked. The line by
    // send shows the message it will post.
    const answerable = (i: Item) => i.prefix === 'Q' && !isClosed(i);
    const pick = (code: string, letter: string) => {
      if (S.picks.get(code) === letter) S.picks.delete(code);
      else S.picks.set(code, letter);
      redraw();
    };
    const answerHint = (i: Item) =>
      answerable(i) ? (
        <Text key={`answer-hint-${i.code}`} wrap="wrap">Pick an option, add a note or write your own answer, then send. Send posts it as your next message.</Text>
      ) : null;
    const option = (i: Item, o: Item['options'][number]) =>
      answerable(i) ? (
        <Box key={`opt-${i.code}-${o.key}`} flexDirection="row" alignItems="flex-start">
          <Box key={`opt-pick-box-${i.code}-${o.key}`} flexShrink={0} marginRight={1}>
            <Button
              key={`answer-${i.code}-${o.key}`}
              label={S.picks.get(i.code) === o.key ? `✓ ${o.key}` : o.key}
              variant={S.picks.get(i.code) === o.key ? 'primary' : undefined}
              onPress={() => pick(i.code, o.key)}
            />
          </Box>
          <Text wrap="wrap">{o.text}</Text>
        </Box>
      ) : (
        <Text key={`opt-${i.code}-${o.key}`} wrap="wrap">{`  ${o.key}. ${o.text}`}</Text>
      );
    const noteField = (i: Item) =>
      answerable(i) && 'Input' in T ? (
        <T.Input
          key={`note-${i.code}`}
          label={S.picks.has(i.code) ? 'Note' : 'Own answer'}
          placeholder={S.picks.has(i.code) ? 'optional, sent after the letter' : 'type it, then send'}
          value={S.notes.get(i.code) ?? ''}
          submitLabel="send"
          onInput={(v) => {
            S.notes.set(i.code, v);
            redraw();
          }}
          onSubmit={(v) => {
            S.notes.set(i.code, v);
            void sendAnswer($, i.code);
          }}
        />
      ) : null;
    const answerRow = (i: Item) => {
      if (!answerable(i)) return null;
      const text = answerText(i.code, S.picks.get(i.code) ?? '', S.notes.get(i.code) ?? '');
      return (
        <Box key={`answer-row-${i.code}`} flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Button
            key={`answer-${i.code}-x`}
            label={S.picks.get(i.code) === 'x' ? '✓ dismiss' : 'dismiss'}
            variant={S.picks.get(i.code) === 'x' ? 'primary' : undefined}
            onPress={() => pick(i.code, 'x')}
          />
          <Button key={`send-${i.code}`} label="send" variant="primary" onPress={() => void sendAnswer($, i.code)} />
          <Text key={`answer-preview-${i.code}`} dimColor wrap="wrap">{text === '' ? 'nothing picked yet' : `sends: ${text}`}</Text>
        </Box>
      );
    };

    const body = (i: Item) => [
      closingLine(Text, i, `closed-${i.code}`),
      correctionLine(Text, i, `corrected-${i.code}`),
      backlinks(i) ? <Text key={`cited-${i.code}`} wrap="wrap" dimColor>{backlinks(i)}</Text> : null,
      i.summary ? <Text key={`sum-${i.code}`} wrap="wrap" dimColor={i.prefix === 'Q'}>{i.summary}</Text> : null,
      answerHint(i),
      ...i.options.map((o) => option(i, o)),
      i.rec ? <Text key={`rec-${i.code}`} wrap="wrap"><Text bold>Recommended:</Text>{` ${i.rec}`}</Text> : null,
      noteField(i),
      answerRow(i),
    ];

    // A row is a table line: the code, the status glyph, and the title, which
    // wraps in the cells left. Every row keeps the glyph cell, blank or not, so
    // every title starts in one column. The code cell fits the widest code
    // shown and its marker.
    const codeWidth = Math.max(0, ...rows.map((i) => i.code.length)) + 4;
    // A heading counts its type under the search and filters but not Status,
    // and for a type that closes, how many are open, so Status open never
    // reads "1 open of 1".
    const every = visible('all');
    const heading = (p: string) => {
      const of = every.filter((i) => i.prefix === p);
      const open = of.filter((i) => !isClosed(i)).length;
      return CLOSING.has(p) ? `${groupName(p)} · ${open} open of ${of.length}` : `${groupName(p)} · ${of.length}`;
    };
    // The code is a button: pressing it opens the item as a card, a frame
    // around the row and its body, and pressing it again closes the card.
    const entry = (i: Item) => {
      const open = S.selected === i.code;
      const line = (
        <Box key={`line-${i.code}`} flexDirection="row" alignItems="flex-start">
          <Box key={`cell-code-${i.code}`} width={codeWidth} flexShrink={0}>
            <Button
              key={`pick-${i.code}`}
              label={`${open ? '▾' : '▸'} ${i.code}`}
              plain
              hover={{ scope: `kref-${i.code}`, inverse: true }}
              onPress={() => {
                S.selected = open ? '' : i.code;
                S.filterOpen = S.statusOpen = S.viewOpen = false;
                redraw();
              }}
            />
          </Box>
          <Box key={`cell-status-${i.code}`} width={2} flexShrink={0}>
            {paint(Text, glyph(i))}
          </Box>
          <Box key={`cell-title-${i.code}`} flexGrow={1} flexShrink={1} minWidth={0}>
            <Text wrap="wrap">{i.title}</Text>
          </Box>
        </Box>
      );
      return (
        <Box key={`row-${i.code}`} flexDirection="column" marginTop={full ? 1 : 0}>
          {open ? (
            <Box
              key={`card-${i.code}`}
              flexDirection="column"
              borderStyle="round"
              backgroundColor="userMessageBackground"
              paddingX={1}
            >
              {line}
              {body(i)}
            </Box>
          ) : (
            line
          )}
          {!open && full ? (
            // The body starts under the title, past the code and glyph cells.
            <Box key={`body-${i.code}`} flexDirection="column" paddingLeft={codeWidth + 2}>
              {body(i)}
            </Box>
          ) : null}
        </Box>
      );
    };

    // An option's row: its label, a button per value with the current one
    // marked, then the description /config shows under it. A locked row, or a
    // kind with no fixed values, shows its value and changes only in /config.
    const valueName = (v: ConfigValue) => (v === true ? 'on' : v === false ? 'off' : String(v));
    const optionRow = (r: ConfigRow) => {
      const values: ConfigValue[] = r.kind === 'boolean' ? [true, false] : r.kind === 'choice' ? [...(r.options ?? [])] : [];
      return (
        <Box key={`option-${r.key}`} flexDirection="column" marginTop={1}>
          <Text bold>{r.label}</Text>
          {r.isLocked || values.length === 0 ? (
            <Text dimColor wrap="wrap">{`${valueName(r.value)} · ${r.isLocked ? 'locked by a managed setting' : 'change it in /config'}`}</Text>
          ) : (
            <Box key={`option-values-${r.key}`} flexDirection="row" flexWrap="wrap" columnGap={2}>
              {values.map((v) => (
                <Button
                  key={`option-${r.key}-${valueName(v)}`}
                  label={r.value === v ? `✓ ${valueName(v)}` : valueName(v)}
                  variant={r.value === v ? 'primary' : undefined}
                  onPress={() => {
                    if (r.value !== v) void setOption($, r, v).catch(() => undefined);
                  }}
                />
              ))}
            </Box>
          )}
          {r.description ? <Text dimColor wrap="wrap">{r.description}</Text> : null}
        </Box>
      );
    };

    // View current mirrors the latest reply's rows, so its sections are those
    // rows rather than types, and a code on both rows is listed under both.
    const cur = S.view === 'current' ? current() : null;
    const sections = cur
      ? [
          { key: 'turn', heading: 'Codes this turn', rows: cur.turn.filter((i) => rows.includes(i)) },
          { key: 'still-open', heading: 'Still open', rows: cur.open.filter((i) => rows.includes(i)) },
        ]
          .filter((g) => g.rows.length > 0)
          .map((g) => ({ ...g, heading: `${g.heading} · ${g.rows.length}` }))
      : groups.map((p) => ({ key: p, heading: heading(p), rows: rows.filter((i) => i.prefix === p) }));

    return (
      <Box flexDirection="column" width={width} minHeight={inline ? menuFoot : undefined}>
        <Box key="top" flexDirection="row">
          {!settings && 'Input' in T ? (
            <Box key="q-box" flexGrow={1} flexShrink={1}>
              <T.Input
                key="q"
                label="Search"
                placeholder="code, title, body, option"
                value={S.query}
                submitLabel=""
                autoFocus
                onInput={(v) => {
                  S.query = v;
                  redraw();
                }}
                onSubmit={(v) => {
                  S.query = v;
                  redraw();
                }}
              />
            </Box>
          ) : null}
        </Box>
        <Box key="filters" flexDirection="row" flexWrap="wrap" columnGap={2} paddingRight={2}>
          {settings ? null : (
            <Button
              key="filter"
              label={filterLabel}
              hotkey="f"
              onPress={() => {
                S.filterOpen = !S.filterOpen;
                S.statusOpen = S.viewOpen = false;
                redraw();
              }}
            />
          )}
          {settings ? null : (
            <Button
              key="show"
              label={showLabel}
              hotkey="s"
              onPress={() => {
                S.statusOpen = !S.statusOpen;
                S.filterOpen = S.viewOpen = false;
                redraw();
              }}
            />
          )}
          {settings ? null : (
            <Button
              key="clear"
              label="Clear"
              onPress={() => {
                S.query = '';
                S.prefix = 'all';
                S.only = [];
                S.selected = '';
                S.filterOpen = S.statusOpen = S.viewOpen = false;
                redraw();
              }}
            />
          )}
          <Box key="view-box" flexGrow={1} flexDirection="row" justifyContent="flex-end">
            <Button
              key="view"
              label={viewLabel}
              hotkey="v"
              onPress={() => {
                S.viewOpen = !S.viewOpen;
                S.filterOpen = S.statusOpen = false;
                redraw();
              }}
            />
          </Box>
        </Box>
        {settings ? <Text key="count" dimColor wrap="wrap">Katharsis options, as /config sets them</Text> : null}
        {settings ? S.options.map(optionRow) : null}
        {settings ? null : <Text key="count" dimColor>{`${rows.length} of ${S.items.length} items${full ? '' : ' · titles only, press a code to open it'}`}</Text>}
        {!settings && rows.length === 0 ? <Text dimColor>Nothing matches.</Text> : null}
        {(settings ? [] : sections).map((g) => (
          <Box key={`group-${g.key}`} flexDirection="column" marginTop={1}>
            <Text bold color="cyan">{g.heading}</Text>
            {g.rows.map(entry)}
          </Box>
        ))}
        {S.filterOpen ? (
          <Box
            key="filter-list"
            position="absolute"
            top={menuTop}
            left={0}
            width={menuWidth}
            flexDirection="row"
            columnGap={2}
            borderStyle="round"
            backgroundColor="userMessageBackground"
            paddingX={1}
          >
            {Array.from({ length: columns }, (_, c) => (
              <Box key={`filter-column-${c}`} flexDirection="column" width={cellWidth}>
                {menu.slice(c * perColumn, (c + 1) * perColumn).map((f) => (
                  <Button
                    key={`filter-${f.value}`}
                    label={menuRow(`${S.prefix === f.value && S.only.length === 0 ? '●' : ' '} ${f.name}`, String(f.n), cellWidth)}
                    plain
                    onPress={() => {
                      S.prefix = f.value;
                      S.only = [];
                      S.filterOpen = S.statusOpen = false;
                      redraw();
                    }}
                  />
                ))}
              </Box>
            ))}
          </Box>
        ) : null}
        {S.statusOpen ? (
          <Box
            key="status-list"
            position="absolute"
            top={menuTop}
            left={statusLeft}
            width={statusWidth}
            flexDirection="column"
            borderStyle="round"
            backgroundColor="userMessageBackground"
            paddingX={1}
          >
            {statusMenu.map((f) => (
              <Button
                key={`status-${f.value}`}
                label={menuRow(`${S.show === f.value ? '●' : ' '} ${f.value}`, String(f.n), statusWidth - 4)}
                plain
                onPress={() => {
                  S.show = f.value;
                  void $.state.set(SHOW, f.value).catch(() => undefined);
                  S.only = [];
                  S.statusOpen = false;
                  redraw();
                }}
              />
            ))}
            <Box key="status-legend" flexDirection="column" marginTop={1}>
              {legend.map((l) => (
                <Box key={`legend-${l.g}`} flexDirection="row">
                  <Box width={2} flexShrink={0}>{paint(Text, l.g)}</Box>
                  <Text dimColor wrap="wrap">{l.text}</Text>
                </Box>
              ))}
            </Box>
          </Box>
        ) : null}
        {S.viewOpen ? (
          <Box
            key="view-list"
            position="absolute"
            top={menuTop}
            left={Math.max(0, width - viewWidth - 2)}
            width={viewWidth}
            flexDirection="column"
            borderStyle="round"
            backgroundColor="userMessageBackground"
            paddingX={1}
          >
            {VIEWS.map((v) => (
              <Button
                key={`view-${v.value}`}
                label={((name) => menuRow(name, clip(v.text, Math.max(1, viewWidth - 5 - name.length)), viewWidth - 4))(
                  `${S.view === v.value ? '●' : ' '} ${v.value}`,
                )}
                plain
                onPress={() => {
                  setView($, v.value);
                  if (v.value === 'settings') void listOptions($).catch(() => undefined);
                  // View current lists its own codes; short and full keep the still open filter.
                  if (v.value === 'current') S.only = [];
                  S.viewOpen = false;
                  redraw();
                }}
              />
            ))}
          </Box>
        ) : null}
      </Box>
    );
  }).catch(($, e, next) => next(e));

  // A reply that cites codes on record: each code becomes a link that opens
  // the pane at it. Under the reply, a row of chips names the codes it cites
  // other than questions, and under the latest reply a second row names what
  // is still open, with a button that opens it all in the pane in full. Each
  // chip carries a hover card. Only Claude Code's own drawing is replaced: a
  // drawing another plugin beneath made stands, as does the engine's for a
  // reply too long for a Markdown element, and either gets the rows alone.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    // A register() call or /clear empties the cache, and with the band off no
    // other drawing reloads it before the next turn ends.
    if (!S.loaded) await load($);
    if (!S.active) return next(e);
    const byCodeMap = new Map(S.items.map((i) => [i.code.toUpperCase(), i]));
    const cited = [...new Set(e.props.text.match(CODE_RE) ?? [])]
      .map((c) => byCodeMap.get(c.toUpperCase()))
      .filter((i): i is Item => i !== undefined);
    // The block that ends the last finished reply is the latest one.
    const latest = S.lastAnswer.trim() !== '' && e.props.text.trim() !== '' && S.lastAnswer.trimEnd().endsWith(e.props.text.trim());
    const groups = latest ? stillOpen() : [];
    const suggestion = latest ? S.suggestion : null;
    if (cited.length === 0 && groups.length === 0 && !suggestion) return next(e);
    const { Box, Text, Button, Markdown } = $.ui.resolve(e);
    const cols = e.viewport?.columns ?? 80;
    const cardWidth = Math.max(30, Math.min(72, cols - 6));
    // Where each chip starts, from the row's own wrapping, so its card can
    // move left of the chip far enough to end inside the screen.
    const starts = (widths: number[]) => {
      let x = 0;
      return widths.map((w, k) => {
        if (k > 0 && x + 1 + w > cols - 2) x = 0;
        else if (k > 0) x += 1;
        const at = x;
        x += w;
        return 2 + at;
      });
    };
    const linked = linkify(e.props.text, S.items);
    // The pane opens before the refresh: an open that follows an await no
    // longer counts as the person's ask, and waits undrawn below 144 columns.
    const openAt = (code: string, only: string[] = []) => {
      void openPane($, code, only).then(() => refresh($)).then(() => $.ui.invalidate('ui.render'));
    };
    const beneath = await next(e);
    const reply =
      beneath.type === 'engine' && linked.text.length <= MARKDOWN_MAX ? (
        <Box key="reply" flexDirection="row">
          <Box width={2} flexShrink={0}>
            <Text>{e.props.isFirstOfReply ? '●' : ' '}</Text>
          </Box>
          <Markdown
            key="reply-text"
            text={linked.text}
            pressableLinks={linked.hrefs}
            onLinkPress={(l) => openAt(codeOfHref(l.href))}
          />
        </Box>
      ) : (
        beneath
      );
    const chip = (i: Item, at: number, hint = '') => (
      <Box key={`chip-${i.code}`}>
        <Button
          key={`chip-${i.code}`}
          label={i.code}
          plain
          dimColor
          hover={{ scope: `kref-${i.code}`, bold: true }}
          onPress={() => openAt(i.code)}
        />
        <Box
          position="absolute"
          bottom={1}
          left={Math.min(0, cols - cardWidth - at)}
          width={cardWidth}
          display="none"
          hover={{ display: 'flex' }}
          borderStyle="round"
          backgroundColor="userMessageBackground"
          paddingX={1}
          flexDirection="column"
        >
          <Text>{paint(Text, glyph(i))}<Text color="cyan">{` ${i.code} · ${nameOf(i)}`}</Text></Text>
          <Text bold wrap="wrap">{i.title}</Text>
          {closingLine(Text, i)}
          {correctionLine(Text, i)}
          {backlinks(i) ? <Text wrap="wrap" dimColor>{backlinks(i)}</Text> : null}
          {i.summary ? <Text wrap="wrap" dimColor={i.prefix === 'Q'}>{i.summary}</Text> : null}
          {i.options.map((o) => (
            <Text wrap="wrap">{`  ${o.key}. ${o.text}`}</Text>
          ))}
          {i.rec ? <Text wrap="wrap"><Text bold>Recommended:</Text>{` ${i.rec}`}</Text> : null}
          {hint ? <Text dimColor>{hint}</Text> : null}
          <Text dimColor>{`click ${i.code} to open it in /${PANE}`}</Text>
        </Box>
      </Box>
    );
    const codes = codeOrder(cited.filter((i) => i.prefix !== 'Q'));
    const codeAt = starts(['Codes this turn:'.length, ...codes.map((i) => i.code.length)]).slice(1);
    const openRow: { item?: Item; text: string; key?: string }[] = groups.flatMap((g, k) => [
      ...(k > 0 ? [{ text: '·', key: `sep-${g.prefix}` }] : []),
      ...g.shown.map((i) => ({ item: i, text: i.code })),
      ...(g.all.length > g.shown.length ? [{ text: `+${g.all.length - g.shown.length}`, key: `more-${g.prefix}` }] : []),
    ]);
    const openStarts = starts(['Still open:'.length, ...openRow.map((c) => c.text.length)]).slice(1);
    return (
      <Box flexDirection="column">
        {reply}
        {codes.length > 0 ? (
          <Box key="chips" flexDirection="row" gap={1} flexWrap="wrap" marginLeft={2}>
            <Text dimColor>Codes this turn:</Text>
            {codes.map((i, k) => chip(i, codeAt[k]!))}
          </Box>
        ) : null}
        {groups.length > 0 ? (
          <Box key="still-open" flexDirection="row" gap={1} flexWrap="wrap" marginLeft={2}>
            <Text dimColor>Still open:</Text>
            {openRow.map((c, k) =>
              c.item ? (
                chip(c.item, openStarts[k]!, c.item.prefix === 'Q' ? hintFor(c.item.code) : '')
              ) : (
                <Text key={`still-open-${c.key}`} dimColor>{c.text}</Text>
              ),
            )}
            {S.hint && groups[0]!.prefix === 'Q' ? (
              <Text key="still-open-hint" dimColor>{`· ${hintFor(groups[0]!.shown[0]!.code)}`}</Text>
            ) : null}
            <Button
              key="still-open-all"
              label="show all ▸"
              plain
              hover={{ scope: 'kopen-all', underline: true }}
              onPress={() => openAt('', groups.flatMap((g) => g.all.map((i) => i.code)))}
            />
          </Box>
        ) : null}
        {suggestion ? (
          <Box key="suggest" flexDirection="column" alignItems="flex-start" marginLeft={2}>
            <Text dimColor wrap="wrap">{`You took the recommendation on ${suggestion.took} of the ${suggestion.answered} questions you answered that carried one (${Math.round((100 * suggestion.took) / suggestion.answered)}%). The standard autonomy level may suit you: search /config for autonomy.`}</Text>
            <Button
              key="suggest-dismiss"
              label="dismiss"
              plain
              hover={{ scope: 'ksuggest-dismiss', underline: true }}
              onPress={() => {
                S.suggestion = null;
                $.ui.invalidate('ui.render');
                void dataDir($)
                  .then((d) => $.fs.write(`${d}/${SUGGEST_DISMISSED}`, `${new Date().toISOString()}\n`))
                  .catch(() => undefined);
              }}
            />
          </Box>
        ) : null}
      </Box>
    );
  }).catch(($, e, next) => next(e));
}
