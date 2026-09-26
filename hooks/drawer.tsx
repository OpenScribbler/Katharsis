// drawer.tsx: the Katharsis drawer. A one-row band above the prompt names
// the code types this session has, each with a hover list of its titles; its
// button, or /kdrawer [query], opens a pane that lists every item grouped by
// type, searchable by text and filterable by type. In a reply, each code on
// record becomes a link that opens the pane at that code, and a row of chips
// under the reply carries a hover card per code.
//
// It reads the ledger through ledger.ts (one handoff chain is one numbering
// space, a later record for a code supersedes an earlier one), and only for a
// session that carries the .active-<sid> marker register.ts
// writes. The render hooks draw from a cache that the band's first drawing,
// the end of each turn, and every pane open refresh, so no reply block waits
// on the filesystem. There is no session.start hook here: register.ts holds
// that event, and the engine refuses a second unmatched hook on one event
// from the same plugin.
//
// Every hook falls through to next(e) when it throws: the drawer may vanish,
// but it never stands between the person and the session.

import type { EngineInterface, On } from 'claude-code';
import { answeredOf, citersOf, closersOf, openQuestions, type Closer } from './answers.ts';
import { codeOrder, readRecord, recordPath, thread, threadItems, threadTexts, type Io, type Item } from './ledger.ts';
import { cleanTitle, TITLE_PROMPT, wantsTitle, withTranscript } from './session.ts';

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
function menuRow(name: string, count: string, width: number): string {
  return `${name}${' '.repeat(Math.max(1, width - name.length - count.length))}${count}`;
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

type State = {
  active: boolean;
  loaded: boolean;
  commandRegistered: boolean;
  items: Item[];
  query: string;
  prefix: string;
  full: boolean;
  selected: string;
  filterOpen: boolean;
  paneOpen: boolean;
  answered: Map<string, string>;
  closed: Map<string, Closer>;
  citedBy: Map<string, Item[]>;
  // Whether this session shows the answer hint on the Still open row.
  hint: boolean;
  // The last finished reply's text, which tells the latest reply block apart.
  lastAnswer: string;
  // A code list the pane shows alone: the still open codes.
  only: string[];
};

export async function loadLedger($: EngineInterface): Promise<{ active: boolean; items: Item[] }> {
  const home = (await $.env.get('HOME')) ?? '';
  const data = (await $.env.get('KATHARSIS_DATA')) ?? `${home}/.claude/katharsis-data`;
  const sid = await $.session.id();
  if (!sid || !(await $.fs.exists(`${data}/.active-${sid}`))) return { active: false, items: [] };
  return { active: true, items: await threadItems(engineIo($), data, sid) };
}

// Every question code an answer row names, across the handoff chain.
export async function loadAnswered($: EngineInterface): Promise<Set<string>> {
  const home = (await $.env.get('HOME')) ?? '';
  const data = (await $.env.get('KATHARSIS_DATA')) ?? `${home}/.claude/katharsis-data`;
  const sid = await $.session.id();
  if (!sid) return new Set();
  const io = engineIo($);
  return answeredOf(await threadTexts(io, `${data}/answers`, await thread(io, data, sid), false));
}

// The answer hint shows on the row in the first 3 sessions that drew it. The
// file holds their ids, one per line, and deleting it starts the count over.
async function hintHere($: EngineInterface, drawn: boolean): Promise<boolean> {
  const home = (await $.env.get('HOME')) ?? '';
  const data = (await $.env.get('KATHARSIS_DATA')) ?? `${home}/.claude/katharsis-data`;
  const sid = await $.session.id();
  if (!sid) return false;
  const f = `${data}/hint-sessions`;
  const ids = (await $.fs.exists(f)) ? String(await $.fs.read(f)).split('\n').filter(Boolean) : [];
  if (ids.includes(sid)) return true;
  if (!drawn || ids.length >= HINT_SESSIONS) return false;
  await $.fs.write(f, `${[...ids, sid].join('\n')}\n`);
  return true;
}

function fresh(): State {
  return {
    active: false,
    loaded: false,
    commandRegistered: false,
    items: [],
    query: '',
    prefix: 'all',
    full: false,
    selected: '',
    filterOpen: false,
    paneOpen: false,
    answered: new Map(),
    closed: new Map(),
    citedBy: new Map(),
    hint: false,
    lastAnswer: '',
    only: [],
  };
}

// Module state: the render hooks read it, the press and input closures
// mutate it and invalidate. A function that takes $ must be declared at the
// top of the file (the engine checks where $ goes), hence module scope.
const S: State = fresh();

async function refresh($: EngineInterface): Promise<void> {
  const r = await loadLedger($);
  S.active = r.active;
  S.items = r.items;
  S.answered = r.active ? await loadAnswered($) : new Map();
  S.closed = closersOf(S.items, S.answered);
  S.citedBy = citersOf(S.items);
  S.hint = r.active ? await hintHere($, openQuestions(S.items, S.answered).length > 0) : false;
  S.loaded = true;
  if (S.active && !S.commandRegistered) {
    await $.command.register({
      name: PANE,
      description: 'Open the Katharsis drawer: every coded item this session, searchable',
      argumentHint: '[query]',
      immediate: true,
    });
    S.commandRegistered = true;
  }
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

// A closed code carries a check between its code and its title, and a
// dismissed one a cross: a question answered `x`, or owed work an `X` line
// dropped.
function dismissed(i: Item): boolean {
  const c = S.closed.get(i.code.toUpperCase());
  return c?.letter === 'x' || (c?.prefix === 'X' && ['NA', 'MV', 'W'].includes(i.prefix));
}

function mark(i: Item): string {
  if (!S.closed.has(i.code.toUpperCase())) return '';
  return dismissed(i) ? ' ✗' : ' ✓';
}

// A card's closing line: the answer given, and the line that closed it with
// that line's title, so the card says what completed or dropped it.
function closing(i: Item): string {
  const c = S.closed.get(i.code.toUpperCase());
  if (!c) return '';
  const parts: string[] = [];
  if (c.letter === 'x') parts.push('Dismissed');
  else if (S.answered.has(i.code.toUpperCase())) parts.push(c.letter ? `Answered: ${c.letter}` : 'Answered');
  if (c.by) parts.push(`${c.letter !== 'x' && dismissed(i) ? 'Dismissed' : 'Closed'} by ${c.by}${c.title ? `: ${c.title}` : ''}`);
  return `${dismissed(i) ? '✗' : '✓'} ${parts.join(' · ')}`;
}

// A finding never closes, so its card lists the codes that cite it instead.
function backlinks(i: Item): string {
  const by = i.prefix === 'F' ? (S.citedBy.get(i.code.toUpperCase()) ?? []) : [];
  return by.length > 0 ? `Cited by ${by.map((j) => j.code).join(' ')}` : '';
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

// A query spelled as a code ("F1") finds that code alone, so F10 to F19 stay
// out; anything else searches the text.
function visible(): Item[] {
  const q = S.query.trim().toLowerCase();
  const exact = CODE_ONLY.test(q);
  return S.items.filter(
    (i) =>
      (S.prefix === 'all' || i.prefix === S.prefix) &&
      (S.only.length === 0 || S.only.includes(i.code)) &&
      (q === '' || (exact ? i.code.toLowerCase() === q : haystack(i).includes(q))),
  );
}

async function openPane($: EngineInterface, query?: string, only: string[] = []): Promise<string> {
  if (query !== undefined) {
    S.query = query;
    S.prefix = 'all';
    S.selected = CODE_ONLY.test(query.trim()) ? query.trim().toUpperCase() : '';
  }
  // Every open starts in the short view with the filter list closed, except
  // the still open codes, which open in full so their options show.
  S.only = only;
  S.full = only.length > 0;
  S.filterOpen = false;
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

export function registerDrawer(on: On): void {
  // A register() call starts clean: a hot reload re-runs it.
  Object.assign(S, fresh());

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

  on('command.run', { command: PANE }, async ($, e) => {
    await refresh($);
    if (!S.active) return { text: 'Katharsis is not active in this session.' };
    const text = await openPane($, e.args.trim());
    return text ? { text } : {};
  }).catch(($, e, next) => next(e));

  // The band: the title in teal, an open button, the command's name, then
  // one label per type present. A Button's label takes no color, so the
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
    if (e.props.hasSurvey) return next(e);
    if (!S.loaded) await refresh($);
    if (!S.active) return next(e);
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
    const hint = `▸ ${TITLE} · open | use /${PANE} · ${labels}`.length <= e.props.bodyColumns ? `| use /${PANE} ·` : '·';
    const openType = (p: string, code = '') => {
      S.query = code;
      S.selected = code;
      S.prefix = p;
      void openPane($).then(() => $.ui.invalidate('ui.render'));
    };
    return (
      <Box flexDirection="column">
        {(S.paneOpen ? [] : present).map((p) => {
          const items = ofPrefix(p);
          const shown = items.slice(-listRows);
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
                <Button
                  key={`reveal-${i.code}`}
                  label={clip(`${i.code}${mark(i)}  ${i.title}`, titleWidth)}
                  plain
                  onPress={() => openType(p, i.code)}
                />
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
              plain
              hover={{ scope: 'kband-open', underline: true }}
              onPress={() => {
                void openPane($).then(() => refresh($)).then(() => $.ui.invalidate('ui.render'));
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
    if (!e.props.isFocused) S.filterOpen = false;
    // Row 2 names the filter by its code when the full name would push Clear
    // into the view toggle, as in a docked pane: `[ label ]` Buttons, gaps, padding.
    const viewLabel = S.full ? 'Show short view' : 'Show full view';
    const named = S.only.length > 0 ? 'still open' : S.prefix === 'all' ? 'all types' : groupName(S.prefix);
    const fits = `Filter: ${named} ▾`.length + 4 + 2 + 'Clear'.length + 4 + 1 + viewLabel.length + 4 + 2 <= width;
    const filterLabel = `Filter: ${fits ? named : S.only.length > 0 ? 'open' : S.prefix} ${S.filterOpen ? '▴' : '▾'}`;
    const menu = [
      { value: 'all', name: 'All types', n: S.items.length },
      ...present.map((p) => ({ value: p, name: groupName(p), n: ofPrefix(p).length })),
    ];
    // The menu reaches the Clear button's right edge (a Button draws as
    // `[ label ]`, and the two sit 2 apart), wider only for a long name.
    const reach = filterLabel.length + 4 + 2 + 'Clear'.length + 4;
    const longest = Math.max(...menu.map((f) => `● ${f.name} ${f.n}`.length)) + 4;
    const menuWidth = Math.min(width, Math.max(reach, longest));

    const body = (i: Item) => [
      closing(i) ? (
        dismissed(i)
          ? <Text key={`closed-${i.code}`} wrap="wrap" dimColor>{closing(i)}</Text>
          : <Text key={`closed-${i.code}`} wrap="wrap" color="success">{closing(i)}</Text>
      ) : null,
      backlinks(i) ? <Text key={`cited-${i.code}`} wrap="wrap" dimColor>{backlinks(i)}</Text> : null,
      i.summary ? <Text key={`sum-${i.code}`} wrap="wrap">{i.summary}</Text> : null,
      ...i.options.map((o) => <Text key={`opt-${i.code}-${o.key}`} wrap="wrap">{`  ${o.key}. ${o.text}`}</Text>),
      i.rec ? <Text key={`rec-${i.code}`} wrap="wrap" color="green">{`→ ${i.rec}`}</Text> : null,
    ];

    // A row's heading is a button: pressing it opens the item as a card, the
    // whole entry in a frame, and pressing it again closes the card.
    const entry = (i: Item) => {
      const open = S.selected === i.code;
      return (
        <Box key={`row-${i.code}`} flexDirection="column" marginTop={S.full ? 1 : 0}>
          <Button
            key={`pick-${i.code}`}
            label={`${open ? '▾' : '▸'} ${i.code}${mark(i)}  ${i.title}`}
            plain
            hover={{ scope: `kref-${i.code}`, inverse: true }}
            onPress={() => {
              S.selected = open ? '' : i.code;
              S.filterOpen = false;
              redraw();
            }}
          />
          {open ? (
            <Box
              key={`card-${i.code}`}
              flexDirection="column"
              borderStyle="round"
              backgroundColor="userMessageBackground"
              paddingX={1}
            >
              <Text color="cyan">{`${i.code}${mark(i)} · ${nameOf(i)}`}</Text>
              <Text bold wrap="wrap">{i.title}</Text>
              {body(i)}
            </Box>
          ) : S.full ? (
            body(i)
          ) : null}
        </Box>
      );
    };

    return (
      <Box flexDirection="column" width={width}>
        <Box key="top" flexDirection="row">
          {'Input' in T ? (
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
        <Box key="filters" flexDirection="row" justifyContent="space-between" paddingRight={2}>
          <Box key="filter-left" flexDirection="row" gap={2} flexShrink={0}>
            <Button
              key="filter"
              label={filterLabel}
              hotkey="f"
              onPress={() => {
                S.filterOpen = !S.filterOpen;
                redraw();
              }}
            />
            <Button
              key="clear"
              label="Clear"
              onPress={() => {
                S.query = '';
                S.prefix = 'all';
                S.only = [];
                S.selected = '';
                S.filterOpen = false;
                redraw();
              }}
            />
          </Box>
          <Box key="view-box" flexShrink={0}>
            <Button
              key="view"
              label={viewLabel}
              hotkey="v"
              onPress={() => {
                S.full = !S.full;
                S.filterOpen = false;
                redraw();
              }}
            />
          </Box>
        </Box>
        <Text key="count" dimColor>{`${rows.length} of ${S.items.length} items${S.full ? '' : ' · titles only, press one to open it'}`}</Text>
        {rows.length === 0 ? <Text dimColor>Nothing matches.</Text> : null}
        {groups.map((p) => (
          <Box key={`group-${p}`} flexDirection="column" marginTop={1}>
            <Text bold color="cyan">{groupName(p)}</Text>
            {rows.filter((i) => i.prefix === p).map(entry)}
          </Box>
        ))}
        {S.filterOpen ? (
          <Box
            key="filter-list"
            position="absolute"
            top={2}
            left={0}
            width={menuWidth}
            flexDirection="column"
            borderStyle="round"
            backgroundColor="userMessageBackground"
            paddingX={1}
          >
            {menu.map((f) => (
              <Button
                key={`filter-${f.value}`}
                label={menuRow(`${S.prefix === f.value && S.only.length === 0 ? '●' : ' '} ${f.name}`, String(f.n), menuWidth - 4)}
                plain
                onPress={() => {
                  S.prefix = f.value;
                  S.only = [];
                  S.filterOpen = false;
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
  // chip carries a hover card. A reply too long for a Markdown element keeps
  // the engine's drawing and gets the rows alone.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!S.active || S.items.length === 0) return next(e);
    const byCodeMap = new Map(S.items.map((i) => [i.code.toUpperCase(), i]));
    const cited = [...new Set(e.props.text.match(CODE_RE) ?? [])]
      .map((c) => byCodeMap.get(c.toUpperCase()))
      .filter((i): i is Item => i !== undefined);
    // The block that ends the last finished reply is the latest one.
    const latest = S.lastAnswer.trim() !== '' && e.props.text.trim() !== '' && S.lastAnswer.trimEnd().endsWith(e.props.text.trim());
    const groups = latest ? stillOpen() : [];
    if (cited.length === 0 && groups.length === 0) return next(e);
    const { Box, Text, Button, Markdown } = $.ui.resolve(e);
    const cardWidth = Math.max(30, Math.min(72, (e.viewport?.columns ?? 80) - 6));
    const linked = linkify(e.props.text, S.items);
    // The pane opens before the refresh: an open that follows an await no
    // longer counts as the person's ask, and waits undrawn below 144 columns.
    const openAt = (code: string, only: string[] = []) => {
      void openPane($, code, only).then(() => refresh($)).then(() => $.ui.invalidate('ui.render'));
    };
    const reply =
      linked.text.length <= MARKDOWN_MAX ? (
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
        await next(e)
      );
    const chip = (i: Item, hint = '') => (
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
          left={0}
          width={cardWidth}
          display="none"
          hover={{ display: 'flex' }}
          borderStyle="round"
          backgroundColor="userMessageBackground"
          paddingX={1}
          flexDirection="column"
        >
          <Text color="cyan">{`${i.code}${mark(i)} · ${nameOf(i)}`}</Text>
          <Text bold wrap="wrap">{i.title}</Text>
          {closing(i) ? (
            dismissed(i) ? <Text wrap="wrap" dimColor>{closing(i)}</Text> : <Text wrap="wrap" color="success">{closing(i)}</Text>
          ) : null}
          {backlinks(i) ? <Text wrap="wrap" dimColor>{backlinks(i)}</Text> : null}
          {i.summary ? <Text wrap="wrap">{i.summary}</Text> : null}
          {i.options.map((o) => (
            <Text wrap="wrap">{`  ${o.key}. ${o.text}`}</Text>
          ))}
          {i.rec ? <Text wrap="wrap" color="green">{`→ ${i.rec}`}</Text> : null}
          {hint ? <Text dimColor>{hint}</Text> : null}
          <Text dimColor>{`click ${i.code} to open it in /${PANE}`}</Text>
        </Box>
      </Box>
    );
    const codes = codeOrder(cited.filter((i) => i.prefix !== 'Q'));
    return (
      <Box flexDirection="column">
        {reply}
        {codes.length > 0 ? (
          <Box key="chips" flexDirection="row" gap={1} flexWrap="wrap" marginLeft={2}>
            <Text dimColor>Codes this turn:</Text>
            {codes.map(chip)}
          </Box>
        ) : null}
        {groups.length > 0 ? (
          <Box key="still-open" flexDirection="row" gap={1} flexWrap="wrap" marginLeft={2}>
            <Text dimColor>Still open:</Text>
            {groups.flatMap((g, k) => [
              k > 0 ? <Text key={`still-open-sep-${g.prefix}`} dimColor>·</Text> : null,
              ...g.shown.map((i) => chip(i, i.prefix === 'Q' ? hintFor(i.code) : '')),
              g.all.length > g.shown.length ? <Text key={`still-open-more-${g.prefix}`} dimColor>{`+${g.all.length - g.shown.length}`}</Text> : null,
            ])}
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
      </Box>
    );
  }).catch(($, e, next) => next(e));
}
