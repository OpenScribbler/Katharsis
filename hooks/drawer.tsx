// drawer.tsx: the Katharsis drawer. A one-row band above the prompt counts
// this session's coded items; its button, or /kdrawer [query], opens a pane
// that lists them in full, searchable by text and filterable by code prefix.
// Under a reply that cites codes on record, a row of chips carries hover
// cards, and pressing a chip opens the pane at that code.
//
// It reads the ledger the way scripts/kref.sh does (one handoff chain is one
// numbering space, a later record for a code supersedes an earlier one, rows
// sorted known first, then prefix, then number), and only for a session that
// carries the .active-<sid> marker register.ts writes. The render hooks draw
// from a cache that the band's first drawing, the end of each turn, and every
// pane open refresh, so no reply block waits on the filesystem. There is no
// session.start hook here: register.ts holds that event, and the engine
// refuses a second unmatched hook on one event from the same plugin.
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
const CODE_RE = /(?<![A-Za-z0-9-])[A-Z][A-Z-]{0,3}\d+(?![A-Za-z0-9])/g;

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
  const items = [...latest.values()].sort(
    (a, b) =>
      Number(!a.known) - Number(!b.known) ||
      (a.prefix < b.prefix ? -1 : a.prefix > b.prefix ? 1 : 0) ||
      a.n - b.n ||
      (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0),
  );
  return { active: true, items };
}

function fresh(): State {
  return { active: false, loaded: false, commandRegistered: false, items: [], query: '', prefix: 'all', full: true };
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

function haystack(i: Item): string {
  return [i.code, i.title, i.summary, ...i.options.map((o) => `${o.key}. ${o.text}`), i.rec].join('\n').toLowerCase();
}

function visible(): Item[] {
  const q = S.query.trim().toLowerCase();
  return S.items.filter((i) => (S.prefix === 'all' || i.prefix === S.prefix) && (q === '' || haystack(i).includes(q)));
}

async function openPane($: EngineInterface, query?: string): Promise<string> {
  if (query !== undefined) {
    S.query = query;
    S.prefix = 'all';
  }
  const opened = await $.ui.open({ id: PANE, title: TITLE, focus: true, closeOnEscape: true });
  return opened.isPlaced ? '' : `Katharsis drawer is waiting: ${opened.reason}`;
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

  on('command.run', { command: PANE }, async ($, e) => {
    await refresh($);
    if (!S.active) return { text: 'Katharsis is not active in this session.' };
    const text = await openPane($, e.args.trim());
    return text ? { text } : {};
  }).catch(($, e, next) => next(e));

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);
    if (!S.loaded) await refresh($);
    if (!S.active || S.items.length === 0) return next(e);
    const { Box, Text, Button } = $.ui.resolve(e);
    const counts = prefixes()
      .map((p) => `${p} ${S.items.filter((i) => i.prefix === p).length}`)
      .join('  ');
    const n = S.items.length;
    return (
      <Box flexDirection="row" gap={1} height={1} overflow="hidden">
        <Button
          key="open"
          label={`▸ ${TITLE}`}
          hotkey="k"
          plain
          onPress={() => {
            void openPane($).then(() => refresh($)).then(() => $.ui.invalidate('ui.render'));
          }}
        />
        <Text dimColor wrap="truncate-end">{`· ${n} code${n === 1 ? '' : 's'} · ${counts} · /${PANE}`}</Text>
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
    return (
      <Box flexDirection="column" width={width}>
        <Box flexDirection="row" gap={2} flexWrap="wrap">
          {'Input' in T ? (
            <T.Input
              key="q"
              label="Search"
              placeholder="code, title, body, option"
              value={S.query}
              submitLabel="filter"
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
          ) : null}
          {'Select' in T ? (
            <T.Select
              key="prefix"
              label="Code"
              value={S.prefix}
              options={[
                { value: 'all', label: 'all' },
                ...present.map((p) => ({ value: p, label: `${p} (${S.items.filter((i) => i.prefix === p).length})` })),
              ]}
              onSelect={(v) => {
                S.prefix = v;
                redraw();
              }}
            />
          ) : null}
          <Button
            key="view"
            label={S.full ? 'Short view' : 'Full view'}
            hotkey="v"
            onPress={() => {
              S.full = !S.full;
              redraw();
            }}
          />
        </Box>
        <Text key="count" dimColor>{`${rows.length} of ${S.items.length} items${S.full ? '' : ' · titles only'}`}</Text>
        {rows.length === 0 ? <Text dimColor>Nothing matches.</Text> : null}
        {rows.map((i) => (
          <Box key={`row-${i.code}`} flexDirection="column" marginTop={S.full ? 1 : 0}>
            <Text bold wrap="wrap" hover={{ scope: `kref-${i.code}`, inverse: true }}>{`${i.code}  ${i.title}`}</Text>
            {S.full && i.summary ? <Text wrap="wrap">{i.summary}</Text> : null}
            {S.full ? i.options.map((o) => <Text wrap="wrap">{`  ${o.key}. ${o.text}`}</Text>) : null}
            {S.full && i.rec ? <Text wrap="wrap" color="green">{`→ ${i.rec}`}</Text> : null}
          </Box>
        ))}
      </Box>
    );
  }).catch(($, e, next) => next(e));

  // Chips under a reply that cites codes on record: a hover card per code,
  // and a press opens the pane at that code.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!S.active || S.items.length === 0) return next(e);
    const byCode = new Map(S.items.map((i) => [i.code.toUpperCase(), i]));
    const cited = [...new Set(e.props.text.match(CODE_RE) ?? [])]
      .map((c) => byCode.get(c.toUpperCase()))
      .filter((i): i is Item => i !== undefined);
    if (cited.length === 0) return next(e);
    const { Box, Text, Button } = $.ui.resolve(e);
    const cardWidth = Math.max(30, Math.min(72, (e.viewport?.columns ?? 80) - 6));
    const engine = await next(e);
    return (
      <Box flexDirection="column">
        {engine}
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
                onPress={() => {
                  void refresh($).then(() => openPane($, i.code));
                }}
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
                <Text bold wrap="wrap">{`${i.code}  ${i.title}`}</Text>
                {i.summary ? <Text wrap="wrap">{i.summary}</Text> : null}
                {i.options.map((o) => (
                  <Text wrap="wrap">{`  ${o.key}. ${o.text}`}</Text>
                ))}
                {i.rec ? <Text wrap="wrap" color="green">{`→ ${i.rec}`}</Text> : null}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    );
  }).catch(($, e, next) => next(e));
}
