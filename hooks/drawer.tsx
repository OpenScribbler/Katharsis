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
//
// The cache, the drawer's settings, and the item logic the hooks draw from
// live in drawer-model.ts, and the reply's links in links.ts.

import type { ConfigRow, ConfigValue, EngineInterface, On } from 'claude-code';
import { CLOSING } from './answers.ts';
import { BLOCK_CUT, clean, codeOrder, type Item } from './ledger.ts';
import type { Agreement } from './suggest.ts';
import { codeOfHref, forgetLinksShown, linkify, linksShown } from './links.ts';
import { answerText, backlinks, byCode, byName, clip, closing, CODE_RE, copyBlock, current, dataDir, dismissed, fresh, glyph, groupName, hintFor, isClosed, lines, listOptions, load, MARKDOWN_MAX, menuRow, nameOf, ofPrefix, openPane, PANE, prefixes, redrawFresh, refresh, reset, restore, REVEAL_MAX, S, sendAnswers, setOption, setView, type Show, SHOWS, shows, stillOpen, SUGGEST_DISMISSED, TEAL, TITLE, titleSession, type View, VIEWS, visible } from './drawer-model.ts';

// The state this file reads and writes, spelled out here for the engine.
const VIEW = { plugin: 'katharsis', key: 'view' } as const;
const LAST_ANSWER = { plugin: 'katharsis', key: 'lastAnswer' } as const;
const SHOW = { plugin: 'katharsis', key: 'show' } as const;

// A check is green, a cross red, a bang yellow, and a circle grey, in a drawer
// row, a band popup row, a card header, and the key.
function paint(Text: ReturnType<EngineInterface['ui']['resolve']>['Text'], g: string) {
  return g === '✓' ? <Text color="success">{g}</Text> : g === '✗' ? <Text color="error">{g}</Text> : g === '!' ? <Text color="warning">{g}</Text> : <Text dimColor>{g}</Text>;
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

type Ui = ReturnType<EngineInterface['ui']['resolve']>;

// A card's body text, then a user step's command block as the reply fenced it,
// in a frame, with a button that copies it whole, or, for a block the Stop hook
// cut at its cap, a line saying so and no button, since half a command must
// never reach the clipboard as the whole one. A block cut to nothing, when its
// first line alone ran past the cap, still gets that line. The block is shown
// and copied without control characters or bidi overrides, as kref prints it.
function cardBody(T: Ui, $: EngineInterface, i: Item) {
  const { Box, Text, Button } = T;
  const block = clean(i.block);
  return [
    i.summary ? <Text key={`sum-${i.code}`} wrap="wrap" dimColor={i.prefix === 'Q'}>{i.summary}</Text> : null,
    block || i.blockCut ? (
      <Box key={`block-${i.code}`} flexDirection="column" alignItems="flex-start">
        {block ? (
          <Box key={`block-text-${i.code}`} flexDirection="column" borderStyle="single" borderDimColor paddingX={1}>
            {block.split('\n').map((l, k) => (
              <Text key={`block-line-${i.code}-${k}`} wrap="wrap">{l === '' ? ' ' : l}</Text>
            ))}
          </Box>
        ) : null}
        {i.blockCut ? (
          <Text key={`block-cut-${i.code}`} wrap="wrap" color="warning">{BLOCK_CUT}</Text>
        ) : (
          <Button key={`copy-${i.code}`} label="copy command" onPress={(e) => void copyBlock($, i.code, block, e.surface)} />
        )}
      </Box>
    ) : null,
  ];
}

// A hover card's body text and command block; a hover card takes no press.
function hoverBody(Text: Ui['Text'], i: Item) {
  return [
    i.summary ? <Text key="sum" wrap="wrap" dimColor={i.prefix === 'Q'}>{i.summary}</Text> : null,
    i.block ? <Text key="block" wrap="wrap">{clean(i.block)}</Text> : null,
    i.blockCut ? <Text key="block-cut" wrap="wrap" color="warning">{BLOCK_CUT}</Text> : null,
  ];
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

export function registerDrawer(on: On, level = '', band = false): void {
  // A register() call starts clean: a hot reload re-runs it, and so does a
  // change to the autonomy level or the band option in /config.
  Object.assign(S, fresh(), { level, band });
  reset();
  forgetLinksShown();
  onTurnEnd(on);
  onMenuFocus(on);
  onSession(on);
  onCommand(on);
  onBand(on);
  onPane(on);
  onReply(on);
}

function onTurnEnd(on: On): void {
  // The end of the turn, which came after the Stop command hooks
  // (ledger-stop.sh) had written this turn's rows when measured on 2.1.321.
  // An earlier build could end it first, so it reloads now and twice more
  // after. No hook here listens on classic.*: an organization-managed account
  // skips those for a plugin the person installed, and lists the plugin
  // under /plugin Errors.
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
}

function onMenuFocus(on: On): void {
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
}

function onSession(on: On): void {
  on('session.start', async ($, e, next) => {
    await restore($).catch(() => undefined);
    await refresh($);
    // Restore drew before refresh made the drawer active.
    $.ui.invalidate('ui.render');
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
      void $.state.set(SHOW, S.show).catch(() => undefined);
      reset();
      $.ui.invalidate('ui.render');
    }
    return r;
  }).catch(($, e, next) => next(e));
}

function onCommand(on: On): void {
  on('command.run', { command: PANE }, async ($, e) => {
    await refresh($);
    if (!S.active) return { text: 'Katharsis is not active in this session.' };
    const text = await openPane($, e.args.trim());
    return text ? { text } : {};
  }).catch(($, e, next) => next(e));
}

function onBand(on: On): void {
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
    const T = $.ui.resolve(e);
    const { Box } = T;
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
    const fit: RevealFit = { listRows, revealHeight, titleWidth };
    const band = (
      <Box flexDirection="column">
        {(S.paneOpen ? [] : present).map((p) => bandReveal(T, p, fit, openType))}
        {bandRow($, T, present, hint, openType)}
      </Box>
    );
    return below ? <Box flexDirection="column">{band}{below}</Box> : band;
  }).catch(($, e, next) => next(e));
}

type RevealFit = { listRows: number; revealHeight: number; titleWidth: number };
type OpenType = (p: string, code?: string) => void;

// One label's reveal: the type's name and count, then its latest titles.
function bandReveal(T: Ui, p: string, fit: RevealFit, openType: OpenType) {
  const { Box, Text, Button } = T;
  const items = ofPrefix(p);
  const shown = items.slice(-fit.listRows);
  // The code cell fits the widest code shown, so every title starts in one column.
  const codeWidth = Math.max(0, ...shown.map((i) => i.code.length));
  return (
    <Box
      key={`reveal-${p}`}
      display="none"
      hover={{ scope: `kband-${p}`, display: 'flex' }}
      flexDirection="column"
      height={fit.revealHeight}
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
            label={clip(`${i.code.padEnd(codeWidth)}  ${i.title}`, fit.titleWidth - 2)}
            plain
            onPress={() => openType(p, i.code)}
          />
        </Box>
      ))}
    </Box>
  );
}

// The band's own row: the title, the open button, the hint, then one label
// per type present.
function bandRow($: EngineInterface, T: Ui, present: string[], hint: string, openType: OpenType) {
  const { Box, Text, Button } = T;
  return (
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
  );
}

// An open question's card holds an answer until send posts it: an option
// or dismiss picks a letter, pressing it again unpicks it, and the field
// holds a note, or the own answer when nothing is picked. The line by
// send shows the message it will post.
const answerable = (i: Item) => i.prefix === 'Q' && !isClosed(i);

function pickAnswer($: EngineInterface, code: string, letter: string): void {
  if (S.picks.get(code) === letter) S.picks.delete(code);
  else S.picks.set(code, letter);
  $.ui.invalidate('ui.render');
}

function optionLine($: EngineInterface, T: Ui, i: Item, o: Item['options'][number]) {
  const { Box, Text, Button } = T;
  if (!answerable(i)) return <Text key={`opt-${i.code}-${o.key}`} wrap="wrap">{`  ${o.key}. ${o.text}`}</Text>;
  const picked = S.picks.get(i.code) === o.key;
  return (
    <Box key={`opt-${i.code}-${o.key}`} flexDirection="row" alignItems="flex-start">
      <Box key={`opt-pick-box-${i.code}-${o.key}`} flexShrink={0} marginRight={1}>
        <Button
          key={`answer-${i.code}-${o.key}`}
          label={picked ? `✓ ${o.key}` : o.key}
          variant={picked ? 'primary' : undefined}
          onPress={() => pickAnswer($, i.code, o.key)}
        />
      </Box>
      <Text wrap="wrap">{o.text}</Text>
    </Box>
  );
}

function noteField($: EngineInterface, T: Ui, i: Item) {
  if (!answerable(i) || !('Input' in T)) return null;
  const picked = S.picks.has(i.code);
  return (
    <T.Input
      key={`note-${i.code}`}
      label={picked ? 'Note' : 'Own answer'}
      placeholder={picked ? 'optional, sent after the letter' : 'type it, then send'}
      value={S.notes.get(i.code) ?? ''}
      submitLabel="send"
      onInput={(v) => {
        S.notes.set(i.code, v);
        $.ui.invalidate('ui.render');
      }}
      onSubmit={(v) => {
        S.notes.set(i.code, v);
        void sendAnswers($, [i.code]);
      }}
    />
  );
}

function answerRow($: EngineInterface, T: Ui, i: Item) {
  if (!answerable(i)) return null;
  const { Box, Text, Button } = T;
  const text = answerText(i.code, S.picks.get(i.code) ?? '', S.notes.get(i.code) ?? '');
  const dismissing = S.picks.get(i.code) === 'x';
  return (
    <Box key={`answer-row-${i.code}`} flexDirection="row" flexWrap="wrap" columnGap={2}>
      <Button
        key={`answer-${i.code}-x`}
        label={dismissing ? '✓ dismiss' : 'dismiss'}
        variant={dismissing ? 'primary' : undefined}
        onPress={() => pickAnswer($, i.code, 'x')}
      />
      <Button key={`send-${i.code}`} label="send" variant="primary" onPress={() => void sendAnswers($, [i.code])} />
      <Text key={`answer-preview-${i.code}`} dimColor wrap="wrap">{text === '' ? 'nothing picked yet' : `sends: ${text}`}</Text>
    </Box>
  );
}

// Everything a drawer card shows under its title.
function cardLines($: EngineInterface, T: Ui, i: Item) {
  const { Text } = T;
  return [
    closingLine(Text, i, `closed-${i.code}`),
    correctionLine(Text, i, `corrected-${i.code}`),
    backlinks(i) ? <Text key={`cited-${i.code}`} wrap="wrap" dimColor>{backlinks(i)}</Text> : null,
    ...cardBody(T, $, i),
    ...i.options.map((o) => optionLine($, T, i, o)),
    i.rec ? <Text key={`rec-${i.code}`} wrap="wrap"><Text bold>Recommended:</Text>{` ${i.rec}`}</Text> : null,
    noteField($, T, i),
    answerRow($, T, i),
  ];
}

// A heading counts its type under the search and filters but not Status,
// and for a type that closes, how many are open.
function headingOf(every: Item[], p: string): string {
  const of = every.filter((i) => i.prefix === p);
  const open = of.filter((i) => !isClosed(i)).length;
  return CLOSING.has(p) ? `${groupName(p)} · ${open} open of ${of.length}` : `${groupName(p)} · ${of.length}`;
}

type RowFit = { codeWidth: number; full: boolean };

// A row is a table line: the code, the status glyph, and the title, which
// wraps in the cells left. Every row keeps the glyph cell, blank or not, so
// every title starts in one column.
function rowLine($: EngineInterface, T: Ui, i: Item, codeWidth: number) {
  const { Box, Text, Button } = T;
  const open = S.selected === i.code;
  return (
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
            $.ui.invalidate('ui.render');
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
}

// The code is a button: pressing it opens the item as a card, a frame
// around the row and its body, and pressing it again closes the card.
function paneEntry($: EngineInterface, T: Ui, i: Item, fit: RowFit) {
  const { Box } = T;
  const open = S.selected === i.code;
  const line = rowLine($, T, i, fit.codeWidth);
  return (
    <Box key={`row-${i.code}`} flexDirection="column" marginTop={fit.full ? 1 : 0}>
      {open ? (
        <Box
          key={`card-${i.code}`}
          flexDirection="column"
          borderStyle="round"
          backgroundColor="userMessageBackground"
          paddingX={1}
        >
          {line}
          {cardLines($, T, i)}
        </Box>
      ) : (
        line
      )}
      {!open && fit.full ? (
        // The body starts under the title, past the code and glyph cells.
        <Box key={`body-${i.code}`} flexDirection="column" paddingLeft={fit.codeWidth + 2}>
          {cardLines($, T, i)}
        </Box>
      ) : null}
    </Box>
  );
}

// An option's row: its label, a button per value with the current one
// marked, then the description /config shows under it. A locked row, or a
// kind with no fixed values, shows its value and changes only in /config.
const valueName = (v: ConfigValue) => (v === true ? 'on' : v === false ? 'off' : String(v));

function valuesOf(r: ConfigRow): ConfigValue[] {
  if (r.kind === 'boolean') return [true, false];
  return r.kind === 'choice' ? [...(r.options ?? [])] : [];
}

function settingRow($: EngineInterface, T: Ui, r: ConfigRow) {
  const { Box, Text, Button } = T;
  const values = valuesOf(r);
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
}

function searchBox($: EngineInterface, T: Ui) {
  if (!('Input' in T)) return null;
  const { Box } = T;
  const set = (v: string) => {
    S.query = v;
    $.ui.invalidate('ui.render');
  };
  return (
    <Box key="q-box" flexGrow={1} flexShrink={1}>
      <T.Input
        key="q"
        label="Search"
        placeholder="code, title, body, option"
        value={S.query}
        submitLabel=""
        autoFocus
        onInput={set}
        onSubmit={set}
      />
    </Box>
  );
}

type Controls = { settings: boolean; filterLabel: string; showLabel: string; viewLabel: string };

// Filter, Status, and Clear act on the list, so the settings view hides them
// and keeps View as the way back. Status opens a menu of all, open, and
// resolved, with the key to the row glyphs below them. Clear leaves it
// alone: Status is a standing preference that outlives the pane, and Clear
// undoes one visit's search.
function listControls($: EngineInterface, T: Ui, c: Controls) {
  const { Button } = T;
  const redraw = () => $.ui.invalidate('ui.render');
  return [
    <Button
      key="filter"
      label={c.filterLabel}
      hotkey="f"
      onPress={() => {
        S.filterOpen = !S.filterOpen;
        S.statusOpen = S.viewOpen = false;
        redraw();
      }}
    />,
    <Button
      key="show"
      label={c.showLabel}
      hotkey="s"
      onPress={() => {
        S.statusOpen = !S.statusOpen;
        S.filterOpen = S.viewOpen = false;
        redraw();
      }}
    />,
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
    />,
  ];
}

function controlsRow($: EngineInterface, T: Ui, c: Controls) {
  const { Box, Button } = T;
  return (
    <Box key="filters" flexDirection="row" flexWrap="wrap" columnGap={2} paddingRight={2}>
      {c.settings ? null : listControls($, T, c)}
      <Box key="view-box" flexGrow={1} flexDirection="row" justifyContent="flex-end">
        <Button
          key="view"
          label={c.viewLabel}
          hotkey="v"
          onPress={() => {
            S.viewOpen = !S.viewOpen;
            S.filterOpen = S.statusOpen = false;
            $.ui.invalidate('ui.render');
          }}
        />
      </Box>
    </Box>
  );
}

type FilterFit = {
  menuTop: number;
  menuWidth: number;
  columns: number;
  perColumn: number;
  cellWidth: number;
  menu: { value: string; name: string; n: number }[];
};

// The Filter menu: all types, then one row per type present, split into
// columns when it is taller than the room.
function filterList($: EngineInterface, T: Ui, f: FilterFit) {
  const { Box, Button } = T;
  return (
    <Box
      key="filter-list"
      position="absolute"
      top={f.menuTop}
      left={0}
      width={f.menuWidth}
      flexDirection="row"
      columnGap={2}
      borderStyle="round"
      backgroundColor="userMessageBackground"
      paddingX={1}
    >
      {Array.from({ length: f.columns }, (_, c) => (
        <Box key={`filter-column-${c}`} flexDirection="column" width={f.cellWidth}>
          {f.menu.slice(c * f.perColumn, (c + 1) * f.perColumn).map((m) => (
            <Button
              key={`filter-${m.value}`}
              label={menuRow(`${S.prefix === m.value && S.only.length === 0 ? '●' : ' '} ${m.name}`, String(m.n), f.cellWidth)}
              plain
              onPress={() => {
                S.prefix = m.value;
                S.only = [];
                S.filterOpen = S.statusOpen = false;
                $.ui.invalidate('ui.render');
              }}
            />
          ))}
        </Box>
      ))}
    </Box>
  );
}

type StatusFit = {
  menuTop: number;
  statusLeft: number;
  statusWidth: number;
  statusMenu: { value: Show; n: number }[];
  legend: { g: string; text: string }[];
};

// The Status menu: all, open, and resolved with their counts, then the key
// to the row glyphs.
function statusList($: EngineInterface, T: Ui, s: StatusFit) {
  const { Box, Text, Button } = T;
  return (
    <Box
      key="status-list"
      position="absolute"
      top={s.menuTop}
      left={s.statusLeft}
      width={s.statusWidth}
      flexDirection="column"
      borderStyle="round"
      backgroundColor="userMessageBackground"
      paddingX={1}
    >
      {s.statusMenu.map((f) => (
        <Button
          key={`status-${f.value}`}
          label={menuRow(`${S.show === f.value ? '●' : ' '} ${f.value}`, String(f.n), s.statusWidth - 4)}
          plain
          onPress={() => {
            S.show = f.value;
            void $.state.set(SHOW, f.value).catch(() => undefined);
            S.only = [];
            S.statusOpen = false;
            $.ui.invalidate('ui.render');
          }}
        />
      ))}
      <Box key="status-legend" flexDirection="column" marginTop={1}>
        {s.legend.map((l) => (
          <Box key={`legend-${l.g}`} flexDirection="row">
            <Box width={2} flexShrink={0}>{paint(Text, l.g)}</Box>
            <Text dimColor wrap="wrap">{l.text}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function viewLabelOf(v: (typeof VIEWS)[number], viewWidth: number): string {
  const name = `${S.view === v.value ? '●' : ' '} ${v.value}`;
  return menuRow(name, clip(v.text, Math.max(1, viewWidth - 5 - name.length)), viewWidth - 4);
}

// The View menu, hanging from the right edge under the View button.
function viewList($: EngineInterface, T: Ui, menuTop: number, width: number) {
  const { Box, Button } = T;
  const viewWidth = Math.min(width, Math.max(...VIEWS.map((v) => `● ${v.value}  ${v.text}`.length)) + 4);
  return (
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
          label={viewLabelOf(v, viewWidth)}
          plain
          onPress={() => {
            setView($, v.value);
            if (v.value === 'settings') void listOptions($).catch(() => undefined);
            // View current lists its own codes; short and full keep the still open filter.
            if (v.value === 'current') S.only = [];
            S.viewOpen = false;
            $.ui.invalidate('ui.render');
          }}
        />
      ))}
    </Box>
  );
}

type Labels = { filterLabel: string; showLabel: string; viewLabel: string; menuTop: number };

// What the Filter button names: still open, all types, or the type's name.
function filterName(): string {
  if (S.only.length > 0) return 'still open';
  return S.prefix === 'all' ? 'all types' : groupName(S.prefix);
}

// Row 2 names the filter by its code when the full name would push the
// View button onto a line of its own, as in a docked pane. A Button draws
// as `[ label ]`, the controls sit 2 apart, and the row keeps 2 of padding.
// Past that the row wraps, and the menu drops below its last line. The
// settings view has no Filter or Status, so its menu drops from row 1.
function controlLabels(width: number, settings: boolean): Labels {
  const viewLabel = `View: ${S.view} ${S.viewOpen ? '▴' : '▾'}`;
  const showLabel = `Status: ${S.show} ${S.statusOpen ? '▴' : '▾'}`;
  const named = filterName();
  const controls = (filter: string) => [filter.length + 4, showLabel.length + 4, 'Clear'.length + 4, viewLabel.length + 4];
  const fits = lines(controls(`Filter: ${named} ▾`), width - 2, 2) === 1;
  const short = S.only.length > 0 ? 'open' : S.prefix;
  const filterLabel = `Filter: ${fits ? named : short} ${S.filterOpen ? '▴' : '▾'}`;
  const menuTop = settings ? 1 : 1 + lines(controls(filterLabel), width - 2, 2);
  return { filterLabel, showLabel, viewLabel, menuTop };
}

// The Filter menu's size. Columns stop at what the drawer's width holds
// whole, and a menu still taller than the room scrolls with the drawer. An
// inline pane passes its body rows as the room; a placed one passes null.
function filterFit(width: number, c: Labels, bodyRows: number | null): FilterFit {
  const menu = [
    { value: 'all', name: 'All types', n: S.items.length },
    ...byName(prefixes()).map((p) => ({ value: p, name: groupName(p), n: ofPrefix(p).length })),
  ];
  const longest = Math.max(...menu.map((f) => `● ${f.name} ${f.n}`.length));
  const room = bodyRows === null ? menu.length : Math.max(1, bodyRows - c.menuTop - 2);
  const across = Math.min(Math.ceil(menu.length / room), Math.max(1, Math.floor((width - 2) / (longest + 2))));
  const perColumn = Math.ceil(menu.length / across);
  // Recounted, so a split the width capped never leaves its last column empty.
  const columns = Math.ceil(menu.length / perColumn);
  // The menu reaches the Clear button's right edge, wider only for a long name.
  const reach = c.filterLabel.length + 4 + 2 + c.showLabel.length + 4 + 2 + 'Clear'.length + 4;
  const menuWidth = Math.min(width, Math.max(reach, columns * longest + (columns - 1) * 2 + 4));
  const cellWidth = Math.floor((menuWidth - 4 - (columns - 1) * 2) / columns);
  return { menuTop: c.menuTop, menuWidth, columns, perColumn, cellWidth, menu };
}

const LEGEND = [
  { g: '○', text: 'open, or never closes' },
  { g: '✓', text: 'answered, settled, or done' },
  { g: '✗', text: 'dismissed, dropped, or withdrawn' },
  { g: '!', text: 'corrected, title not restated' },
];

// The Status menu drops below the Status button, or from the left edge when
// the button wrapped onto a line of its own. A menu wider than the room
// right of the button shifts left to stay inside the drawer. A legend line
// too long for the menu wraps by word, and each wrap adds a row.
function statusFit(width: number, c: Labels): StatusFit & { legendRows: number } {
  const statusMenu = SHOWS.map((s) => ({
    value: s,
    n: S.items.filter((i) => (S.prefix === 'all' || i.prefix === S.prefix) && shows(i, s)).length,
  }));
  const statusWidth = Math.min(width, Math.max(...LEGEND.map((l) => l.text.length + 2), ...statusMenu.map((f) => `● ${f.value} ${f.n}`.length)) + 4);
  const legendRows = LEGEND.reduce((n, l) => n + lines(l.text.split(' ').map((w) => w.length), statusWidth - 6, 1), 0);
  const oneLine = lines([c.filterLabel.length + 4, c.showLabel.length + 4], width - 2, 2) === 1;
  const statusLeft = Math.max(0, Math.min(width - statusWidth, oneLine ? c.filterLabel.length + 4 + 2 : 0));
  return { menuTop: c.menuTop, statusLeft, statusWidth, statusMenu, legend: LEGEND, legendRows };
}

// Where the open menu ends, which an inline pane's tree grows to reach.
function menuFoot(menuTop: number, f: FilterFit, s: { statusMenu: unknown[]; legendRows: number }): number {
  if (S.filterOpen) return menuTop + f.perColumn + 2;
  if (S.statusOpen) return menuTop + s.statusMenu.length + s.legendRows + 3;
  if (S.viewOpen) return menuTop + VIEWS.length + 2;
  return menuTop;
}

// View current mirrors the latest reply's rows, so its sections are those
// rows rather than types, and a code on both rows is listed under both.
function sectionsOf(rows: Item[]): { key: string; heading: string; rows: Item[] }[] {
  const cur = S.view === 'current' ? current() : null;
  if (cur) {
    return [
      { key: 'turn', heading: 'Codes this turn', rows: cur.turn.filter((i) => rows.includes(i)) },
      { key: 'still-open', heading: 'Still open', rows: cur.open.filter((i) => rows.includes(i)) },
    ]
      .filter((g) => g.rows.length > 0)
      .map((g) => ({ ...g, heading: `${g.heading} · ${g.rows.length}` }));
  }
  // A heading counts its type under the search and filters but not Status,
  // so Status open never reads "1 open of 1".
  const every = visible('all');
  const groups = byName([...new Set(rows.map((i) => i.prefix))]);
  return groups.map((p) => ({ key: p, heading: headingOf(every, p), rows: rows.filter((i) => i.prefix === p) }));
}

// The answering bar sits once, under the heading of the first section that
// lists an open question, rather than in every card. It says how to answer
// while a question's body shows, and once two or more questions hold an
// answer, how many of the open ones do and a send for them all; with one,
// the card's own send does the same.
function answerBar($: EngineInterface, T: Ui, rows: Item[], full: boolean) {
  const { Box, Text, Button } = T;
  const shown = (i: Item) => full || S.selected === i.code;
  const open = S.items.filter(answerable).sort((a, b) => a.n - b.n);
  const queued = open.filter((i) => answerText(i.code, S.picks.get(i.code) ?? '', S.notes.get(i.code) ?? '') !== '');
  return [
    rows.some((i) => answerable(i) && shown(i)) ? (
      <Text key="answer-hint" wrap="wrap" dimColor>Pick an option, add a note or write your own answer, then send. Send posts it as your next message.</Text>
    ) : null,
    queued.length >= 2 ? (
      <Box key="answer-queue" flexDirection="row" flexWrap="wrap" columnGap={2}>
        <Text key="answer-queue-count">{`${queued.length} of ${open.length} answered`}</Text>
        <Button key="answer-queue-send" label={`send ${queued.length}`} variant="primary" onPress={() => void sendAnswers($, queued.map((i) => i.code))} />
        <Text key="answer-queue-codes" dimColor wrap="wrap">{`sends: ${queued.map((i) => i.code).join(' ')}`}</Text>
      </Box>
    ) : null,
  ];
}

function settingsBody($: EngineInterface, T: Ui) {
  const { Text } = T;
  return [
    <Text key="count" dimColor wrap="wrap">Katharsis options, as /config sets them</Text>,
    ...S.options.map((r) => settingRow($, T, r)),
  ];
}

// The list view: the count, then each section's heading, the answering bar
// under the first section with an open question, and the section's rows.
// The code cell fits the widest code shown and its marker.
function listBody($: EngineInterface, T: Ui, rows: Item[]) {
  const { Box, Text } = T;
  const full = S.view !== 'short';
  const fit: RowFit = { codeWidth: Math.max(0, ...rows.map((i) => i.code.length)) + 4, full };
  const sections = sectionsOf(rows);
  const barKey = sections.find((g) => g.rows.some(answerable))?.key;
  const bar = answerBar($, T, rows, full);
  return [
    <Text key="count" dimColor>{`${rows.length} of ${S.items.length} items${full ? '' : ' · titles only, press a code to open it'}`}</Text>,
    rows.length === 0 ? <Text key="none" dimColor>Nothing matches.</Text> : null,
    ...sections.map((g) => (
      <Box key={`group-${g.key}`} flexDirection="column" marginTop={1}>
        <Text bold color="cyan">{g.heading}</Text>
        {g.key === barKey ? bar : null}
        {g.rows.map((i) => paneEntry($, T, i, fit))}
      </Box>
    )),
  ];
}

// Whichever menus are open, each placed over the list.
function openMenus($: EngineInterface, T: Ui, f: FilterFit, s: StatusFit, width: number) {
  return [
    S.filterOpen ? filterList($, T, f) : null,
    S.statusOpen ? statusList($, T, s) : null,
    S.viewOpen ? viewList($, T, f.menuTop, width) : null,
  ];
}

function onPane(on: On): void {
  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e, next) => {
    if (!S.active) return next(e);
    const T = $.ui.resolve(e);
    const { Box } = T;
    const rows = visible();
    const width = Math.max(20, e.props.bodyColumns);
    // The pane losing focus, a click in the transcript or the prompt, closes the menu.
    if (!e.props.isFocused) S.filterOpen = S.statusOpen = S.viewOpen = false;
    const settings = S.view === 'settings';
    const c = controlLabels(width, settings);
    // An inline pane's frame fits the tree, which a placed menu adds nothing
    // to, and stops at the rows the surface gave it. The tree grows to reach
    // an open menu's foot, and a menu taller than the room splits into columns.
    const inline = e.props.placement === 'inline';
    const f = filterFit(width, c, inline ? e.props.scroll.bodyRows : null);
    const s = statusFit(width, c);
    return (
      <Box flexDirection="column" width={width} minHeight={inline ? menuFoot(c.menuTop, f, s) : undefined}>
        <Box key="top" flexDirection="row">
          {settings ? null : searchBox($, T)}
        </Box>
        {controlsRow($, T, { settings, ...c })}
        {settings ? settingsBody($, T) : listBody($, T, rows)}
        {openMenus($, T, f, s, width)}
      </Box>
    );
  }).catch(($, e, next) => next(e));
}

function onReply(on: On): void {
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
    const marks = replyMarks(e.props.text);
    if (!marks) return next(e);
    const { cited, groups, suggestion } = marks;
    const T = $.ui.resolve(e);
    const { Box } = T;
    const cols = e.viewport?.columns ?? 80;
    const linked = linkify(e.props.text, S.items);
    // The pane opens before the refresh: an open that follows an await no
    // longer counts as the person's ask, and waits undrawn below 144 columns.
    const openAt = (code: string, only: string[] = []) => {
      void openPane($, code, only).then(() => refresh($)).then(() => $.ui.invalidate('ui.render'));
    };
    const fit: ChipFit = { cols, cardWidth: Math.max(30, Math.min(72, cols - 6)), openAt };
    const beneath = await next(e);
    // Without links the engine's own drawing stands, and the chips under it
    // still open each code.
    const links = e.surface !== 'terminal' || (await linksShown($));
    const ours = links && beneath.type === 'engine' && linked.text.length <= MARKDOWN_MAX;
    const reply = ours ? replyMarkdown(T, e.props.isFirstOfReply, linked, openAt) : beneath;
    const codes = codeOrder(cited.filter((i) => i.prefix !== 'Q'));
    return (
      <Box flexDirection="column">
        {reply}
        {codes.length > 0 ? codesRow(T, fit, codes) : null}
        {groups.length > 0 ? stillOpenRow(T, fit, groups) : null}
        {suggestion ? suggestionRow($, T, suggestion) : null}
      </Box>
    );
  }).catch(($, e, next) => next(e));
}

// The items on record that a reply's text cites, once each.
function citedIn(text: string): Item[] {
  const byCodeMap = new Map(S.items.map((i) => [i.code.toUpperCase(), i]));
  return [...new Set(text.match(CODE_RE) ?? [])]
    .map((c) => byCodeMap.get(c.toUpperCase()))
    .filter((i): i is Item => i !== undefined);
}

// What a reply block carries under it: the codes it cites and, on the latest
// block, what is still open and the autonomy suggestion. Null when it
// carries nothing, so the engine's drawing stands untouched.
function replyMarks(text: string): { cited: Item[]; groups: OpenGroups; suggestion: Agreement | null } | null {
  const cited = citedIn(text);
  const latest = isLatest(text);
  const groups = latest ? stillOpen() : [];
  const suggestion = latest ? S.suggestion : null;
  if (cited.length === 0 && groups.length === 0 && !suggestion) return null;
  return { cited, groups, suggestion };
}

// The block that ends the last finished reply is the latest one.
function isLatest(text: string): boolean {
  return S.lastAnswer.trim() !== '' && text.trim() !== '' && S.lastAnswer.trimEnd().endsWith(text.trim());
}

// Where each chip starts, from the row's own wrapping, so its card can move
// left of the chip far enough to end inside the screen.
function chipStarts(widths: number[], cols: number): number[] {
  let x = 0;
  return widths.map((w, k) => {
    if (k > 0 && x + 1 + w > cols - 2) x = 0;
    else if (k > 0) x += 1;
    const at = x;
    x += w;
    return 2 + at;
  });
}

type ChipFit = { cols: number; cardWidth: number; openAt: (code: string, only?: string[]) => void };
type Linked = ReturnType<typeof linkify>;
type OpenGroups = ReturnType<typeof stillOpen>;

function replyMarkdown(T: Ui, first: boolean, linked: Linked, openAt: ChipFit['openAt']) {
  const { Box, Text, Markdown } = T;
  return (
    <Box key="reply" flexDirection="row">
      <Box width={2} flexShrink={0}>
        <Text>{first ? '●' : ' '}</Text>
      </Box>
      <Markdown
        key="reply-text"
        text={linked.text}
        pressableLinks={linked.hrefs}
        onLinkPress={(l) => openAt(codeOfHref(l.href))}
      />
    </Box>
  );
}

// A chip's hover card: the item as its drawer card shows it.
function chipCard(T: Ui, i: Item, hint: string) {
  const { Text } = T;
  return [
    <Text key="head">{paint(Text, glyph(i))}<Text color="cyan">{` ${i.code} · ${nameOf(i)}`}</Text></Text>,
    <Text key="title" bold wrap="wrap">{i.title}</Text>,
    closingLine(Text, i, 'closing'),
    correctionLine(Text, i, 'correction'),
    backlinks(i) ? <Text key="backlinks" wrap="wrap" dimColor>{backlinks(i)}</Text> : null,
    hoverBody(Text, i),
    i.options.map((o) => (
      <Text key={`opt-${o.key}`} wrap="wrap">{`  ${o.key}. ${o.text}`}</Text>
    )),
    i.rec ? <Text key="rec" wrap="wrap"><Text bold>Recommended:</Text>{` ${i.rec}`}</Text> : null,
    hint ? <Text key="hint" dimColor>{hint}</Text> : null,
    <Text key="open" dimColor>{`click ${i.code} to open it in /${PANE}`}</Text>,
  ];
}

function chip(T: Ui, fit: ChipFit, i: Item, at: number, hint = '') {
  const { Box, Button } = T;
  return (
    <Box key={`chip-${i.code}`}>
      <Button
        key={`chip-${i.code}`}
        label={i.code}
        plain
        dimColor
        hover={{ scope: `kref-${i.code}`, bold: true }}
        onPress={() => fit.openAt(i.code)}
      />
      <Box
        position="absolute"
        bottom={1}
        left={Math.min(0, fit.cols - fit.cardWidth - at)}
        width={fit.cardWidth}
        display="none"
        hover={{ display: 'flex' }}
        borderStyle="round"
        backgroundColor="userMessageBackground"
        paddingX={1}
        flexDirection="column"
      >
        {chipCard(T, i, hint)}
      </Box>
    </Box>
  );
}

function codesRow(T: Ui, fit: ChipFit, codes: Item[]) {
  const { Box, Text } = T;
  const codeAt = chipStarts(['Codes this turn:'.length, ...codes.map((i) => i.code.length)], fit.cols).slice(1);
  return (
    <Box key="chips" flexDirection="row" gap={1} flexWrap="wrap" marginLeft={2}>
      <Text dimColor>Codes this turn:</Text>
      {codes.map((i, k) => chip(T, fit, i, codeAt[k]!))}
    </Box>
  );
}

// The still-open row's cells: each group's shown codes, a separator between
// groups, and a count of the codes past those shown.
function openCells(groups: OpenGroups): { item?: Item; text: string; key?: string }[] {
  return groups.flatMap((g, k) => [
    ...(k > 0 ? [{ text: '·', key: `sep-${g.prefix}` }] : []),
    ...g.shown.map((i) => ({ item: i, text: i.code })),
    ...(g.all.length > g.shown.length ? [{ text: `+${g.all.length - g.shown.length}`, key: `more-${g.prefix}` }] : []),
  ]);
}

function stillOpenRow(T: Ui, fit: ChipFit, groups: OpenGroups) {
  const { Box, Text, Button } = T;
  const openRow = openCells(groups);
  const openStarts = chipStarts(['Still open:'.length, ...openRow.map((c) => c.text.length)], fit.cols).slice(1);
  return (
    <Box key="still-open" flexDirection="row" gap={1} flexWrap="wrap" marginLeft={2}>
      <Text dimColor>Still open:</Text>
      {openRow.map((c, k) =>
        c.item ? (
          chip(T, fit, c.item, openStarts[k]!, c.item.prefix === 'Q' ? hintFor(c.item.code) : '')
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
        onPress={() => fit.openAt('', groups.flatMap((g) => g.all.map((i) => i.code)))}
      />
    </Box>
  );
}

function suggestionRow($: EngineInterface, T: Ui, suggestion: Agreement) {
  const { Box, Text, Button } = T;
  return (
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
  );
}
