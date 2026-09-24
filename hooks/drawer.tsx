// drawer.tsx: the Katharsis drawer. A one-row band above the prompt names
// the code types this session has, each with a hover list of its titles; its
// button, or /kdrawer [query], opens a pane that lists every item grouped by
// type, searchable by text and filterable by type. In a reply, each code on
// record becomes a link that opens the pane at that code, and a row of chips
// under the reply carries a hover card per code.
//
// It reads the ledger the way scripts/kref.sh does (one handoff chain is one
// numbering space, a later record for a code supersedes an earlier one), and
// only for a session that carries the .active-<sid> marker register.ts
// writes. The render hooks draw from a cache that the band's first drawing,
// the end of each turn, and every pane open refresh, so no reply block waits
// on the filesystem. There is no session.start hook here: register.ts holds
// that event, and the engine refuses a second unmatched hook on one event
// from the same plugin.
//
// Every hook falls through to next(e) when it throws: the drawer may vanish,
// but it never stands between the person and the session.

import type { EngineInterface, On } from 'claude-code';

type Option = { key: string; text: string };
type Item = {
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

// Each code's name, singular then plural, in the order the output style's
// table lists them. D is retired but still appears in older ledgers.
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
const ORDER = new Map(TYPES.map(([p], i) => [p, i]));
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

// The session's scope: itself and every ancestor its chain file names.
async function chain($: EngineInterface, root: string, sid: string): Promise<string[]> {
  const ids: string[] = [];
  let cur = sid;
  while (cur && !ids.includes(cur) && ids.length < 20) {
    ids.push(cur);
    const link = `${root}/chains/${cur}`;
    if (!(await $.fs.exists(link))) break;
    cur = String(await $.fs.read(link)).trim();
  }
  return ids;
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
};

export async function loadLedger($: EngineInterface): Promise<{ active: boolean; items: Item[] }> {
  const home = (await $.env.get('HOME')) ?? '';
  const data = (await $.env.get('KATHARSIS_DATA')) ?? `${home}/.claude/katharsis-data`;
  const sid = await $.session.id();
  if (!sid || !(await $.fs.exists(`${data}/.active-${sid}`))) return { active: false, items: [] };
  const root = `${data}/ledger`;
  if (!(await $.fs.exists(root))) return { active: true, items: [] };
  const ids = await chain($, root, sid);
  const latest = new Map<string, Item>();
  for (const d of await $.fs.list(root)) {
    if (d.kind !== 'dir' || d.name === 'chains') continue;
    for (const id of ids) {
      const f = `${root}/${d.name}/${id}.jsonl`;
      if (!(await $.fs.exists(f))) continue;
      for (const line of String(await $.fs.read(f)).split('\n')) {
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
  }
  // Grouped by type in the style's order, invented codes after, then number.
  const rank = (p: string) => ORDER.get(p) ?? TYPES.length;
  const items = [...latest.values()].sort(
    (a, b) =>
      rank(a.prefix) - rank(b.prefix) ||
      (a.prefix < b.prefix ? -1 : a.prefix > b.prefix ? 1 : 0) ||
      a.n - b.n ||
      (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0),
  );
  return { active: true, items };
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
      (q === '' || (exact ? i.code.toLowerCase() === q : haystack(i).includes(q))),
  );
}

async function openPane($: EngineInterface, query?: string): Promise<string> {
  if (query !== undefined) {
    S.query = query;
    S.prefix = 'all';
    S.selected = CODE_ONLY.test(query.trim()) ? query.trim().toUpperCase() : '';
  }
  // Every open starts in the short view with the filter list closed.
  S.full = false;
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

export function registerDrawer(on: On): void {
  // A register() call starts clean: a hot reload re-runs it.
  Object.assign(S, fresh());

  // After the Stop command hooks (ledger-stop.sh) have written this turn's rows.
  on('classic.Stop', async ($, e, next) => {
    const r = await next(e);
    await redrawFresh($);
    return r;
  }).catch(($, e, next) => next(e));

  // A managed plugin can route classic.* past the user tier (sec-default
  // does), so the Stop hook above may never run. turn.complete can fire
  // before ledger-stop.sh writes, so it reloads now and twice more after.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e);
    if (e.agentId) return r;
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
    const present = prefixes();
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
                  label={clip(`${i.code}  ${i.title}`, titleWidth)}
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
    const present = prefixes();
    const groups = [...new Set(rows.map((i) => i.prefix))];
    // The pane losing focus, a click in the transcript or the prompt, closes the menu.
    if (!e.props.isFocused) S.filterOpen = false;
    // Row 2 names the filter by its code when the full name would push Clear
    // into the view toggle, as in a docked pane: `[ label ]` Buttons, gaps, padding.
    const viewLabel = S.full ? 'Show short view' : 'Show full view';
    const named = S.prefix === 'all' ? 'all types' : groupName(S.prefix);
    const fits = `Filter: ${named} ▾`.length + 4 + 2 + 'Clear'.length + 4 + 1 + viewLabel.length + 4 + 2 <= width;
    const filterLabel = `Filter: ${fits ? named : S.prefix} ${S.filterOpen ? '▴' : '▾'}`;
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
            label={`${open ? '▾' : '▸'} ${i.code}  ${i.title}`}
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
              <Text color="cyan">{`${i.code} · ${nameOf(i)}`}</Text>
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
                label={menuRow(`${S.prefix === f.value ? '●' : ' '} ${f.name}`, String(f.n), menuWidth - 4)}
                plain
                onPress={() => {
                  S.prefix = f.value;
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
  // the pane at it, and a row of chips under the reply carries a hover card
  // per code. A reply too long for a Markdown element keeps the engine's
  // drawing and gets the chips alone.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!S.active || S.items.length === 0) return next(e);
    const byCode = new Map(S.items.map((i) => [i.code.toUpperCase(), i]));
    const cited = [...new Set(e.props.text.match(CODE_RE) ?? [])]
      .map((c) => byCode.get(c.toUpperCase()))
      .filter((i): i is Item => i !== undefined);
    if (cited.length === 0) return next(e);
    const { Box, Text, Button, Markdown } = $.ui.resolve(e);
    const cardWidth = Math.max(30, Math.min(72, (e.viewport?.columns ?? 80) - 6));
    const linked = linkify(e.props.text, S.items);
    const openAt = (code: string) => {
      void refresh($).then(() => openPane($, code)).then(() => $.ui.invalidate('ui.render'));
    };
    const reply =
      linked.text.length <= MARKDOWN_MAX ? (
        <Box key="reply" flexDirection="row">
          <Box width={2} flexShrink={0}>
            <Text>{e.props.isFirstOfReply ? '⏺' : ' '}</Text>
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
    return (
      <Box flexDirection="column">
        {reply}
        <Box key="chips" flexDirection="row" gap={1} flexWrap="wrap" marginLeft={2}>
          <Text dimColor>codes:</Text>
          {cited.map((i) => (
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
                <Text color="cyan">{`${i.code} · ${nameOf(i)}`}</Text>
                <Text bold wrap="wrap">{i.title}</Text>
                {i.summary ? <Text wrap="wrap">{i.summary}</Text> : null}
                {i.options.map((o) => (
                  <Text wrap="wrap">{`  ${o.key}. ${o.text}`}</Text>
                ))}
                {i.rec ? <Text wrap="wrap" color="green">{`→ ${i.rec}`}</Text> : null}
                <Text dimColor>{`click ${i.code} to open it in /${PANE}`}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    );
  }).catch(($, e, next) => next(e));
}
