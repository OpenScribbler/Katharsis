// Tests for hooks/drawer.tsx, run by `claude plugin test .`. Each test answers the nouns the drawer
// reaches (env, session id, fs) from an in-memory ledger in the format
// ledger-stop.sh writes, then mounts the band, the pane or a reply block and
// reads what the drawer drew.

import { describe, expect, mock, test } from 'claude-code/testing';
import type { Engine } from 'claude-code/testing';
import type { On } from 'claude-code';

const SID = 's1';
const PARENT = 's0';
const DATA = '/data';
const PROJ = `${DATA}/ledger/x-p`;

type Row = Record<string, unknown>;

const row = (code: string, title: string, extra: Row = {}): Row => {
  const m = code.match(/^([A-Z-]+)(\d+)$/);
  return {
    ts: '2026-09-23T10:00:00+00:00',
    session_id: SID,
    project: 'x-p',
    code,
    prefix: m?.[1] ?? '',
    n: Number(m?.[2] ?? 0),
    known: true,
    title,
    summary: `${title} body`,
    section: '',
    section_note: '',
    ...extra,
  };
};

const ROWS: Row[] = [
  row('F1', 'old title superseded', { ts: '2026-09-23T09:00:00+00:00' }),
  row('F2', 'the cache is stale'),
  row('AT1', 'regenerated the fixture'),
  row('C1', 'only checked on Linux'),
  row('F1', 'line endings differ'),
  row('Q1', 'which fixture ships?', {
    summary: 'full body text',
    options: [
      { key: 'a', text: 'keep LF' },
      { key: 'b', text: 'regenerate' },
    ],
    rec: 'a - cheaper',
  }),
];

const jsonl = (rows: Row[]) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

type World = { files: Map<string, string>; hold?: Promise<void>; scans: number; opened: string[]; commands: string[]; forks: string[]; turns: number; reply: string; sid: string; style: string };

// Katharsis is active when the settings name its style. The world writes no
// .active marker, because the drawer must not need one.
function world(on: On, opts: { active?: boolean; rows?: Row[]; theirReply?: boolean } = {}): World {
  const files = new Map<string, string>();
  files.set(`${PROJ}/${SID}.jsonl`, jsonl(opts.rows ?? ROWS));
  // An ancestor in the chain, and a session outside it.
  files.set(`${DATA}/ledger/chains/${SID}`, `${PARENT}\n`);
  files.set(`${DATA}/ledger/y-q/${PARENT}.jsonl`, jsonl(opts.rows ? [] : [row('D1', 'from the parent session', { session_id: PARENT })]));
  files.set(`${DATA}/ledger/y-q/other.jsonl`, jsonl([row('D9', 'another session', { session_id: 'other' })]));
  const w: World = { files, scans: 0, opened: [], commands: [], forks: [], turns: 1, reply: 'Fixing the drawer band', sid: SID, style: opts.active === false ? 'default' : 'katharsis:Katharsis' };
  mock.env(on, { HOME: '/home/u', KATHARSIS_DATA: DATA });
  on('session.id', () => ({ value: w.sid }));
  on('settings.read', () => ({ value: { outputStyle: w.style } }));
  on('session.start', (_$, e) => ({ cwd: e.cwd }));
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }));
  on('fs.exists', (_$, e) => ({
    value: w.files.has(e.path) || [...w.files.keys()].some((k) => k.startsWith(`${e.path}/`)),
  }));
  on('fs.read', (_$, e) => {
    const text = w.files.get(e.path);
    if (text === undefined) throw new Error(`ENOENT ${e.path}`);
    return { value: text };
  });
  on('fs.write', (_$, e) => {
    w.files.set(e.path, e.text);
    return { value: undefined };
  });
  on('fs.list', async (_$, e) => {
    if (e.path === `${DATA}/answers`) {
      w.scans += 1;
      if (w.hold) await w.hold;
    }
    const dir = `${e.path}/`;
    const names = new Map<string, 'file' | 'dir'>();
    for (const k of w.files.keys()) {
      if (!k.startsWith(dir)) continue;
      const rest = k.slice(dir.length);
      names.set(rest.split('/')[0] ?? '', rest.includes('/') ? 'dir' : 'file');
    }
    return { value: [...names].map(([name, kind]) => ({ name, kind, size: 0, isLink: false })) };
  });
  on('command.register', (_$, e) => {
    w.commands.push(e.name);
    return { value: { command: e.name } };
  });
  on('ui.open', (_$, e) => {
    w.opened.push(e.id);
    return { value: { isPlaced: true } };
  });
  on('session.turns', () => ({ value: w.turns }));
  on('model.fork', (_$, e) => {
    w.forks.push(e.prompt);
    return { value: { isAnswered: true, text: w.reply, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } };
  });
  on('classic.Stop', () => ({}));
  on('turn.complete', (_$, e) => ({ text: e.answer }));
  // What next(e) resolves to beneath the drawer: a reply is the engine's own
  // drawing unless another plugin beneath draws its own (theirReply).
  on('ui.render', ($, e) => {
    if (e.component === 'AssistantMessage' && !opts.theirReply) return { type: 'engine', ref: 1 };
    return $.ui.resolve(e).Text({ children: 'engine drawing' });
  });
  return w;
}

const BAND = {
  plugin: 'katharsis',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const;

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const;

const paneProps = { title: 'Katharsis', isFocused: true, bodyColumns: 100, placement: 'inline', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const;

// The Stop hook is what loads the ledger on surfaces with no band.
async function stop($: Engine): Promise<void> {
  await $.classic.Stop({ stop_hook_active: false });
}

async function mountPane($: Engine, surface: 'terminal' | 'desktop') {
  await stop($);
  return $.ui.mount({ plugin: 'katharsis', surface, component: 'Pane', requestId: 'kdrawer', props: paneProps });
}

async function rowCodes(ui: { findAll: (q: { type?: string; text?: RegExp }) => Promise<{ key: string | undefined }[]> }): Promise<string[]> {
  const rows = await ui.findAll({ type: 'Box' });
  return rows.map((r) => r.key ?? '').filter((k) => k.startsWith('row-')).map((k) => k.slice(4));
}

describe('band', () => {
  test('renders the button and one label per type, alphabetical by code', async ($, on) => {
    const w = world(on);
    const ui = await $.ui.mount(BAND);
    expect(await ui.find({ type: 'Text', text: '▸ Katharsis' })).toBeDefined();
    expect((await ui.find({ key: 'open' }))?.props.label).toBe('open');
    expect(await ui.find({ type: 'Text', text: '| use /kdrawer ·' })).toBeDefined();
    const labels = (await ui.findAll({ type: 'Button' })).filter((b) => b.key?.startsWith('band-')).map((b) => b.props.label);
    expect(labels).toEqual(['AT:1', 'C:1', 'D:1', 'F:2', 'Q:1']);
    expect(await ui.find({ type: 'Text', text: /codes/ })).toBeUndefined();
    expect(w.commands).toEqual(['kdrawer']);
  });

  test('a band too narrow for the hint drops it and keeps every label whole', async ($, on) => {
    world(on);
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 40 } });
    expect(await ui.find({ type: 'Text', text: '| use /kdrawer ·' })).toBeUndefined();
    expect(await ui.find({ key: 'band-head' })).toBeDefined();
    expect((await ui.findAll({ type: 'Box' })).filter((b) => b.key?.startsWith('label-')).map((b) => b.props.flexShrink)).toEqual([0, 0, 0, 0, 0]);
  });

  test('each label carries a hover list of that type', async ($, on) => {
    world(on);
    const ui = await $.ui.mount(BAND);
    expect(await ui.find({ key: 'reveal-F' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: 'Findings (F) · 2' })).toBeDefined();
    expect((await ui.find({ key: 'reveal-F2' }))?.props.label).toBe('F2  the cache is stale');
    expect((await ui.find({ key: 'reveal-all-F' }))?.props.label).toBe('list all 2 ▸');
  });

  test('every reveal has one height, sized to the largest type', async ($, on) => {
    world(on);
    const ui = await $.ui.mount(BAND);
    const heights = (await ui.findAll({ type: 'Box' })).filter((b) => /^reveal-[A-Z-]+$/.test(b.key ?? '')).map((b) => b.props.height);
    expect(heights).toEqual([5, 5, 5, 5, 5]);
  });

  test('a reveal lists at most 10 titles and never outgrows the band', async ($, on) => {
    const many = Array.from({ length: 30 }, (_, k) => row(`F${k + 1}`, `finding ${k + 1}`));
    world(on, { rows: many });
    const tall = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 20 } });
    expect((await tall.findAll({ type: 'Button' })).filter((b) => /^reveal-F\d+$/.test(b.key ?? '')).map((b) => b.key)).toHaveLength(10);
    expect(await tall.find({ type: 'Text', text: 'latest 10' })).toBeDefined();
    const short = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 8 } });
    expect((await short.find({ key: 'reveal-F' }))?.props.height).toBe(7);
  });

  test('pressing a title in a reveal opens the pane at that item', async ($, on) => {
    const w = world(on);
    const ui = await $.ui.mount(BAND);
    await ui.press({ key: 'reveal-F2' });
    expect(w.opened).toEqual(['kdrawer']);
    const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect(await rowCodes(pane)).toEqual(['F2']);
    expect(await pane.find({ key: 'card-F2' })).toBeDefined();
  });

  test('pressing a label opens the pane on that type in short view', async ($, on) => {
    const w = world(on);
    const ui = await $.ui.mount(BAND);
    await ui.press({ key: 'band-F' });
    expect(w.opened).toEqual(['kdrawer']);
    const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect(await rowCodes(pane)).toEqual(['F1', 'F2']);
    expect((await pane.find({ key: 'view' }))?.props.label).toBe('Show full view');
  });

  test('its button opens the pane', async ($, on) => {
    const w = world(on);
    const ui = await $.ui.mount(BAND);
    await ui.press({ key: 'open' });
    expect(w.opened).toEqual(['kdrawer']);
  });

  test('shows in an active session with no items yet', async ($, on) => {
    const w = world(on, { rows: [] });
    const ui = await $.ui.mount(BAND);
    expect(await ui.find({ type: 'Text', text: '▸ Katharsis' })).toBeDefined();
    expect((await ui.find({ key: 'open' }))?.props.label).toBe('open');
    expect(await ui.find({ type: 'Text', text: '| use /kdrawer ·' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: /no codes yet/ })).toBeDefined();
        expect(w.commands).toEqual(['kdrawer']);
  });

  test('yields and registers nothing when Katharsis is not active', async ($, on) => {
    const w = world(on, { active: false });
    const ui = await $.ui.mount(BAND);
    expect(await ui.find({ key: 'open' })).toBeUndefined();
    expect(w.commands).toEqual([]);
  });

  test('yields to a survey', async ($, on) => {
    world(on);
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true } });
    expect(await ui.find({ key: 'open' })).toBeUndefined();
  });

  test('draws what the hooks below it drew beneath the band', async ($, on) => {
    world(on);
    const ui = await $.ui.mount(BAND);
    expect(await ui.find({ key: 'open' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: 'engine drawing' })).toBeDefined();
  });
});

describe('refresh', () => {
  // A managed plugin can route classic.Stop past the user tier, so the end of
  // the turn loads the ledger too.
  test('the end of a turn loads the ledger without the Stop hook', async ($, on) => {
    world(on);
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' });
    const ui = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect(await rowCodes(ui)).toEqual(['AT1', 'C1', 'D1', 'F1', 'F2', 'Q1']);
  });
});

for (const surface of ['terminal', 'desktop'] as const) {
  describe(`pane (${surface})`, () => {
    test('lists every item grouped by type name, superseded records collapsed', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      expect(await rowCodes(ui)).toEqual(['AT1', 'C1', 'D1', 'F1', 'F2', 'Q1']);
      const groups = (await ui.findAll({ type: 'Box' })).map((b) => b.key ?? '').filter((k) => k.startsWith('group-'));
      expect(groups).toEqual(['group-AT', 'group-C', 'group-D', 'group-F', 'group-Q']);
      expect(await ui.find({ type: 'Text', text: 'Findings (F) · 2' })).toBeDefined();
      expect(await ui.find({ type: 'Text', text: 'Actions taken (AT) · 1' })).toBeDefined();
      expect(await ui.find({ type: 'Text', text: 'Questions (Q) · 1 open of 1' })).toBeDefined();
      expect((await ui.find({ key: 'pick-F1' }))?.props.label).toBe('▸ F1');
      expect((await ui.find({ key: 'cell-title-F1' }))?.text).toBe('line endings differ');
      expect(await ui.find({ text: /old title superseded/ })).toBeUndefined();
    });

    test('full view shows the body, each option and the recommendation', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      await ui.press({ key: 'view' });
      expect(await ui.find({ type: 'Text', text: 'full body text' })).toBeDefined();
      expect(await ui.find({ type: 'Text', text: 'a. keep LF' })).toBeDefined();
      expect(await ui.find({ type: 'Text', text: 'b. regenerate' })).toBeDefined();
      expect(await ui.find({ type: 'Text', text: 'Recommended: a - cheaper' })).toBeDefined();
    });

    test('search matches code, title, body and options', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      await ui.input({ key: 'q', text: 'fixture', kind: 'change' });
      expect(await rowCodes(ui)).toEqual(['AT1', 'Q1']);
      await ui.input({ key: 'q', text: 'regenerate' });
      expect(await rowCodes(ui)).toEqual(['AT1', 'Q1']);
      await ui.input({ key: 'q', text: 'keep lf' });
      expect(await rowCodes(ui)).toEqual(['Q1']);
      await ui.input({ key: 'q', text: 'c1' });
      expect(await rowCodes(ui)).toEqual(['C1']);
      await ui.input({ key: 'q', text: 'caveat' });
      expect(await rowCodes(ui)).toEqual(['C1']);
      await ui.input({ key: 'q', text: 'nothing like this' });
      expect(await rowCodes(ui)).toEqual([]);
      expect(await ui.find({ type: 'Text', text: 'Nothing matches.' })).toBeDefined();
    });

    test('the filter button opens a list of all plus each type present, and names the choice', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      expect((await ui.find({ key: 'filter' }))?.props.label).toBe('Filter: all types ▾');
      expect(await ui.find({ key: 'filter-list' })).toBeUndefined();
      await ui.press({ key: 'filter' });
      const labels = (await ui.findAll({ type: 'Button' })).filter((b) => b.key?.startsWith('filter-')).map((b) => b.props.label);
      expect(labels.map((l) => l.replace(/ +(\d+)$/, ' | $1'))).toEqual(['● All types | 6', '  Actions taken (AT) | 1', '  Caveats (C) | 1', '  Decisions (D) | 1', '  Findings (F) | 2', '  Questions (Q) | 1']);
      expect(new Set(labels.map((l) => l.length)).size).toBe(1);
      await ui.press({ key: 'filter-F' });
      expect(await ui.find({ key: 'filter-list' })).toBeUndefined();
      expect(await rowCodes(ui)).toEqual(['F1', 'F2']);
      expect((await ui.find({ key: 'filter' }))?.props.label).toBe('Filter: Findings (F) ▾');
      await ui.press({ key: 'filter' });
      await ui.press({ key: 'filter-all' });
      expect(await rowCodes(ui)).toHaveLength(6);
    });

    test('the filter menu reaches the Clear button and closes when focus moves off it', async ($, on) => {
      world(on);
      on('ui.focus', () => ({}));
      const ui = await mountPane($, surface);
      await ui.press({ key: 'filter' });
      expect((await ui.find({ key: 'filter-list' }))?.props.width).toBe(53);
      expect((await ui.find({ key: 'filter-list' }))?.props.top).toBe(2);
      await $.ui.focus({ requestId: 'kdrawer', key: 'pick-F1' });
      expect(await ui.find({ key: 'filter-list' })).toBeUndefined();
      await ui.press({ key: 'filter' });
      await ui.unmount();
      const away = await $.ui.mount({ plugin: 'katharsis', surface, component: 'Pane', requestId: 'kdrawer', props: { ...paneProps, isFocused: false } });
      expect(await away.find({ key: 'filter-list' })).toBeUndefined();
    });

    test('a pane too narrow for the type name names the filter by its code', async ($, on) => {
      world(on);
      await stop($);
      const ui = await $.ui.mount({ plugin: 'katharsis', surface, component: 'Pane', requestId: 'kdrawer', props: { ...paneProps, bodyColumns: 52 } });
      await ui.press({ key: 'filter' });
      await ui.press({ key: 'filter-AT' });
      expect((await ui.find({ key: 'filter' }))?.props.label).toBe('Filter: AT ▾');
    });

    test('pressing a row or the view toggle closes the filter menu', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      await ui.press({ key: 'filter' });
      await ui.press({ key: 'pick-F1' });
      expect(await ui.find({ key: 'filter-list' })).toBeUndefined();
      await ui.press({ key: 'filter' });
      await ui.press({ key: 'view' });
      expect(await ui.find({ key: 'filter-list' })).toBeUndefined();
    });

    test('clear empties the search and the filter', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      await ui.input({ key: 'q', text: 'caveat', kind: 'change' });
      await ui.press({ key: 'filter' });
      await ui.press({ key: 'filter-C' });
      expect(await rowCodes(ui)).toEqual(['C1']);
      await ui.press({ key: 'clear' });
      expect(await rowCodes(ui)).toHaveLength(6);
      expect((await ui.find({ key: 'filter' }))?.props.label).toBe('Filter: all types ▾');
    });

    test('the toggle switches between full and short views', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      expect((await ui.find({ key: 'view' }))?.props.label).toBe('Show full view');
      expect(await ui.find({ type: 'Text', text: 'full body text' })).toBeUndefined();
      expect(await ui.find({ type: 'Text', text: 'a. keep LF' })).toBeUndefined();
      expect((await ui.find({ key: 'pick-Q1' }))?.props.label).toBe('▸ Q1');
      await ui.press({ key: 'view' });
      expect((await ui.find({ key: 'view' }))?.props.label).toBe('Show short view');
      expect(await ui.find({ type: 'Text', text: 'full body text' })).toBeDefined();
    });

    test('pressing a row in short view opens its card, and again closes it', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      await ui.press({ key: 'pick-Q1' });
      expect(await ui.find({ key: 'card-Q1' })).toBeDefined();
      expect(await ui.find({ type: 'Text', text: 'Q1 · Question 1' })).toBeDefined();
      expect(await ui.find({ type: 'Text', text: 'a. keep LF' })).toBeDefined();
      expect(await ui.find({ type: 'Text', text: 'Recommended: a - cheaper' })).toBeDefined();
      expect((await ui.find({ key: 'pick-Q1' }))?.props.label).toBe('▾ Q1');
      // The row already shows the title, so the card does not repeat it.
      expect(await ui.findAll({ type: 'Text', text: 'which fixture ships?' })).toHaveLength(1);
      await ui.press({ key: 'pick-Q1' });
      expect(await ui.find({ key: 'card-Q1' })).toBeUndefined();
      expect(await ui.find({ type: 'Text', text: 'a. keep LF' })).toBeUndefined();
    });
  });
}

describe('pane status', () => {
  // Q1 answered, Q2 open, Q3 dismissed, Q4 settled by AT1 with no answer;
  // NA1 done, NA2 dropped, NA3 open; R1 dropped by an exclusion, R2 open.
  const LATE = '2026-09-23T11:00:00+00:00';
  const SROWS: Row[] = [
    row('Q1', 'which fixture ships?', { options: [{ key: 'a', text: 'keep LF' }] }),
    row('Q2', 'rename the flag?'),
    row('Q3', 'split the module?'),
    row('Q4', 'keep the cache?'),
    row('F1', 'line endings differ'),
    row('NA1', 'backfill the test'),
    row('NA2', 'rename the flag'),
    row('NA3', 'update the docs'),
    row('R1', 'the lock may leak'),
    row('R2', 'the cache may go stale'),
    row('AT1', 'settled Q4, did NA1', { ts: LATE }),
    row('X1', 'NA2 not needed, R1 out of scope', { ts: LATE }),
  ];
  const ANSWERS = '{"ts":"t","code":"Q1","letter":"a","how":"code"}\n{"ts":"t","code":"Q3","letter":"x","how":"dismissed"}\n';
  const pane = ($: Engine, bodyColumns = 100) =>
    $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: { ...paneProps, bodyColumns } });
  const setup = async ($: Engine, on: On) => {
    const w = world(on, { rows: SROWS });
    w.files.set(`${DATA}/answers/${SID}.jsonl`, ANSWERS);
    await stop($);
    return w;
  };
  const texts = async (ui: Awaited<ReturnType<typeof pane>>, keys: string[]) =>
    Promise.all(keys.map(async (k) => (await ui.find({ key: k }))?.text));
  const status = async (ui: Awaited<ReturnType<typeof pane>>, show: string) => {
    await ui.press({ key: 'show' });
    await ui.press({ key: `status-${show}` });
  };

  test('every row carries a glyph: a circle while open, a check or a cross once resolved', async ($, on) => {
    await setup($, on);
    const ui = await pane($);
    expect(await texts(ui, ['cell-status-Q1', 'cell-status-Q3', 'cell-status-Q4', 'cell-status-NA1', 'cell-status-NA2', 'cell-status-R1'])).toEqual([
      '✓',
      '✗',
      '✓',
      '✓',
      '✗',
      '✗',
    ]);
    expect((await ui.find({ key: 'cell-status-Q1' }))?.children[0]?.props.color).toBe('success');
    expect((await ui.find({ key: 'cell-status-Q3' }))?.children[0]?.props.color).toBe('error');
    // An open row, and a type that never closes, carry a grey circle.
    for (const c of ['Q2', 'NA3', 'R2', 'F1', 'AT1']) {
      const cell = await ui.find({ key: `cell-status-${c}` });
      expect([cell?.text, cell?.props.width, cell?.children[0]?.props.dimColor]).toEqual(['○', 2, true]);
    }
    expect((await ui.find({ key: 'cell-code-NA1' }))?.props.width).toBe(7);
    expect((await ui.find({ key: 'cell-title-NA1' }))?.props).toMatchObject({ flexGrow: 1, flexShrink: 1, minWidth: 0 });
    expect((await ui.find({ type: 'Text', text: 'backfill the test' }))?.props.wrap).toBe('wrap');
  });

  test('the Status menu counts each setting and carries the key to the glyphs', async ($, on) => {
    await setup($, on);
    const ui = await pane($);
    expect(await ui.find({ key: 'status-list' })).toBeUndefined();
    await ui.press({ key: 'show' });
    expect((await ui.find({ key: 'show' }))?.props.label).toBe('Status: all ▴');
    expect((await ui.find({ key: 'status-all' }))?.props.label).toMatch(/^● all +12$/);
    expect((await ui.find({ key: 'status-open' }))?.props.label).toMatch(/^ {2}open +3$/);
    expect((await ui.find({ key: 'status-resolved' }))?.props.label).toMatch(/^ {2}resolved +6$/);
    expect(await texts(ui, ['legend-○', 'legend-✓', 'legend-✗', 'legend-!'])).toEqual([
      '○open, or never closes',
      '✓answered, settled, or done',
      '✗dismissed, dropped, or withdrawn',
      '!corrected, title not restated',
    ]);
    expect((await ui.find({ key: 'legend-✗' }))?.children[0]?.children[0]?.props.color).toBe('error');
    // Opening the type filter closes the Status menu.
    await ui.press({ key: 'filter' });
    expect(await ui.find({ key: 'status-list' })).toBeUndefined();
  });

  test('Status all lists open items first within each type, and the menu picks open or resolved', async ($, on) => {
    await setup($, on);
    const ui = await pane($);
    expect((await ui.find({ key: 'show' }))?.props.label).toBe('Status: all ▾');
    expect(await rowCodes(ui)).toEqual(['AT1', 'X1', 'F1', 'NA3', 'NA1', 'NA2', 'Q2', 'Q1', 'Q3', 'Q4', 'R2', 'R1']);
    await status(ui, 'open');
    expect((await ui.find({ key: 'show' }))?.props.label).toBe('Status: open ▾');
    expect(await ui.find({ key: 'status-list' })).toBeUndefined();
    expect(await rowCodes(ui)).toEqual(['NA3', 'Q2', 'R2']);
    await status(ui, 'resolved');
    expect((await ui.find({ key: 'show' }))?.props.label).toBe('Status: resolved ▾');
    expect(await rowCodes(ui)).toEqual(['NA1', 'NA2', 'Q1', 'Q3', 'Q4', 'R1']);
    await status(ui, 'all');
    expect((await ui.find({ key: 'show' }))?.props.label).toBe('Status: all ▾');
    expect(await rowCodes(ui)).toHaveLength(12);
  });

  test('headings count the type under the search, whatever Status hides, and how many are open', async ($, on) => {
    await setup($, on);
    const ui = await pane($);
    expect(await ui.find({ type: 'Text', text: 'Questions (Q) · 1 open of 4' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: 'Next actions (NA) · 1 open of 3' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: 'Findings (F) · 1' })).toBeDefined();
    await ui.input({ key: 'q', text: 'flag', kind: 'change' });
    expect(await ui.find({ type: 'Text', text: 'Questions (Q) · 1 open of 1' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: 'Next actions (NA) · 0 open of 1' })).toBeDefined();
    await ui.press({ key: 'clear' });
    await status(ui, 'resolved');
    expect(await ui.find({ type: 'Text', text: 'Risks (R) · 1 open of 2' })).toBeDefined();
    await status(ui, 'open');
    expect(await ui.find({ type: 'Text', text: 'Questions (Q) · 1 open of 4' })).toBeDefined();
  });

  test('a code asked for by name shows under any Status setting', async ($, on) => {
    await setup($, on);
    const ui = await pane($);
    await status(ui, 'open');
    await ui.input({ key: 'q', text: 'q1', kind: 'change' });
    expect(await rowCodes(ui)).toEqual(['Q1']);
    expect((await ui.find({ key: 'cell-status-Q1' }))?.text).toBe('✓');
    await status(ui, 'resolved');
    await ui.input({ key: 'q', text: 'q2' });
    expect(await rowCodes(ui)).toEqual(['Q2']);
    // Text that is not a code still honors Status.
    await ui.input({ key: 'q', text: 'the docs' });
    expect(await rowCodes(ui)).toEqual([]);
  });

  test('a band title opens its item under Status resolved', async ($, on) => {
    await setup($, on);
    const ui = await pane($);
    await status(ui, 'resolved');
    await ui.unmount();
    const band = await $.ui.mount(BAND);
    await band.press({ key: 'reveal-NA3' });
    const again = await pane($);
    expect(await rowCodes(again)).toEqual(['NA3']);
    expect(await again.find({ key: 'card-NA3' })).toBeDefined();
    await again.unmount();
    await band.press({ key: 'open' });
    expect(await rowCodes(await pane($))).not.toContain('NA3');
  });

  test('Still open lists its codes under Status resolved', async ($, on) => {
    await setup($, on);
    const ui = await pane($);
    await status(ui, 'resolved');
    await ui.unmount();
    await $.turn.complete({ answer: 'Done.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' });
    const reply = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'AssistantMessage', props: { text: 'Done.', isFirstOfReply: true } });
    await reply.press({ key: 'still-open-all' });
    expect(await rowCodes(await pane($))).toEqual(['Q2', 'R2']);
  });

  test('a Status picked after show all lists that setting, not the codes show all opened', async ($, on) => {
    await setup($, on);
    await $.turn.complete({ answer: 'Done.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' });
    const reply = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'AssistantMessage', props: { text: 'Done.', isFirstOfReply: true } });
    await reply.press({ key: 'still-open-all' });
    const ui = await pane($);
    expect(await rowCodes(ui)).toEqual(['Q2', 'R2']);
    await status(ui, 'resolved');
    expect(await rowCodes(ui)).toEqual(['NA1', 'NA2', 'Q1', 'Q3', 'Q4', 'R1']);
  });

  test('Status outlives the pane and Clear, and the rest resets on open', async ($, on) => {
    await setup($, on);
    const ui = await pane($);
    await status(ui, 'open');
    await ui.press({ key: 'view' });
    await ui.press({ key: 'clear' });
    expect((await ui.find({ key: 'show' }))?.props.label).toBe('Status: open ▾');
    await ui.unmount();
    await $.command.run({ ...RUN, command: 'kdrawer', args: '' });
    const again = await pane($);
    expect((await again.find({ key: 'show' }))?.props.label).toBe('Status: open ▾');
    expect((await again.find({ key: 'view' }))?.props.label).toBe('Show full view');
    expect(await rowCodes(again)).toEqual(['NA3', 'Q2', 'R2']);
  });

  test('a header too narrow for one line wraps, and the filter menu drops below it', async ($, on) => {
    await setup($, on);
    const ui = await pane($, 48);
    await ui.press({ key: 'filter' });
    expect((await ui.find({ key: 'filter' }))?.props.label).toBe('Filter: all ▴');
    expect((await ui.find({ key: 'filter-list' }))?.props.top).toBe(3);
  });

  test('the Status menu stays inside a narrow pane', async ($, on) => {
    await setup($, on);
    for (const cols of [40, 48, 60]) {
      const ui = await pane($, cols);
      if (!(await ui.find({ key: 'status-list' }))) await ui.press({ key: 'show' });
      const menu = await ui.find({ key: 'status-list' });
      expect(menu?.props.left + menu?.props.width).toBeLessThanOrEqual(cols);
      await ui.unmount();
    }
  });
});

const START = { cwd: '/w', surface: 'terminal', isInteractive: true } as const;

describe('command', () => {
  test('session start registers /kdrawer before the first prompt', async ($, on) => {
    const w = world(on, { rows: [] });
    await $.session.start(START);
    expect(w.commands).toEqual(['kdrawer']);
    await $.command.run({ ...RUN, command: 'kdrawer', args: '' });
    expect(w.opened).toEqual(['kdrawer']);
  });

  test('session start registers nothing when the style is not Katharsis', async ($, on) => {
    const w = world(on, { active: false });
    await $.session.start(START);
    expect(w.commands).toEqual([]);
  });

  test('/kdrawer opens in a cleared session before its first prompt', async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    // /clear starts a new session id and fires no session.start.
    w.sid = 's2';
    w.files.set(`${PROJ}/s2.jsonl`, jsonl([row('F1', 'after the clear', { session_id: 's2' })]));
    await $.command.run({ ...RUN, command: 'kdrawer', args: '' });
    expect(w.opened).toEqual(['kdrawer']);
    const ui = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect(await rowCodes(ui)).toEqual(['F1']);
  });

  test('the band drops the old session after /clear and draws the new one', async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    const before = await $.ui.mount(BAND);
    expect(await before.find({ key: 'band-F' })).toBeDefined();
    await before.unmount();
    await $.session.end({ reason: 'clear', sessionId: SID, resume: { id: SID } } as never);
    w.sid = 's2';
    w.files.set(`${PROJ}/s2.jsonl`, jsonl([row('AT1', 'after the clear', { session_id: 's2' })]));
    const after = await $.ui.mount(BAND);
    const labels = (await after.findAll({ type: 'Button' })).filter((b) => b.key?.startsWith('band-')).map((b) => b.props.label);
    expect(labels).toEqual(['AT:1']);
    expect(w.commands).toEqual(['kdrawer']);
  });

  test('/kdrawer stops opening once the style switches away', async ($, on) => {
    const w = world(on);
    await $.session.start(START);
    w.style = 'default';
    const r = await $.command.run({ ...RUN, command: 'kdrawer', args: '' });
    expect(r.text).toContain('not active');
    expect(w.opened).toEqual([]);
  });

  test('/kdrawer opens the pane with its argument as the query', async ($, on) => {
    const w = world(on);
    await $.command.run({ ...RUN, command: 'kdrawer', args: 'Linux' });
    expect(w.opened).toEqual(['kdrawer']);
    const ui = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect((await ui.find({ key: 'q' }))?.props.value).toBe('Linux');
    expect(await rowCodes(ui)).toEqual(['C1']);
  });

  test('/kdrawer says so when Katharsis is not active', async ($, on) => {
    const w = world(on, { active: false });
    const r = await $.command.run({ ...RUN, command: 'kdrawer', args: '' });
    expect(r.text).toContain('not active');
    expect(w.opened).toEqual([]);
  });
});

describe('reply chips', () => {
  const reply = (text: string) =>
    ({ plugin: 'katharsis', surface: 'terminal', component: 'AssistantMessage', props: { text, isFirstOfReply: true } }) as const;

  test('a reply citing codes on record gets a chip per cited code other than questions, alphabetical', async ($, on) => {
    world(on);
    await stop($);
    const ui = await $.ui.mount(reply('Per F1 and Q1 (and F1 again), after C1 and AT1, not Z9 or F7.'));
    const chips = (await ui.findAll({ type: 'Button' })).map((b) => b.key);
    expect(chips).toEqual(['chip-AT1', 'chip-C1', 'chip-F1']);
    expect(await ui.find({ type: 'Text', text: 'Codes this turn:' })).toBeDefined();
    // The hover card names the type, then the title and body.
    expect(await ui.find({ type: 'Text', text: 'F1 · Finding 1' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: 'line endings differ' })).toBeDefined();
  });

  test('codes sort by number within a type, so F2 comes before F10', async ($, on) => {
    world(on, { rows: [row('F10', 'tenth'), row('F2', 'second'), row('D1', 'a decision')] });
    await stop($);
    const ui = await $.ui.mount(reply('F10, F2 and D1.'));
    expect((await ui.findAll({ type: 'Button' })).map((b) => b.key)).toEqual(['chip-D1', 'chip-F2', 'chip-F10']);
  });

  test('codes on record become links, outside code spans and fences', async ($, on) => {
    world(on);
    await stop($);
    const ui = await $.ui.mount(reply('Per F1, not Z9 or `F1`.\n```\nF1\n```\nQ1 stays open.'));
    const md = await ui.find({ key: 'reply-text' });
    expect(md?.props.text).toBe(
      'Per [F1](https://katharsis.invalid/F1/finding-1), not Z9 or `F1`.\n```\nF1\n```\n[Q1](https://katharsis.invalid/Q1/question-1) stays open.',
    );
    expect(await ui.find({ type: 'engine' })).toBeUndefined();
  });

  test('pressing an inline code opens the pane with that code open', async ($, on) => {
    const w = world(on);
    await stop($);
    const ui = await $.ui.mount(reply('See Q1.'));
    await ui.press({ key: 'reply-text', link: { href: 'https://katharsis.invalid/Q1/question-1' } });
    expect(w.opened).toEqual(['kdrawer']);
    const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect(await rowCodes(pane)).toEqual(['Q1']);
    expect(await pane.find({ key: 'card-Q1' })).toBeDefined();
  });

  test('a reply too long for a Markdown element keeps the engine drawing', async ($, on) => {
    world(on);
    await stop($);
    const ui = await $.ui.mount(reply(`F1 ${'x'.repeat(10001)}`));
    expect(await ui.find({ type: 'engine' })).toBeDefined();
    expect(await ui.find({ key: 'chip-F1' })).toBeDefined();
  });

  test('a reply another plugin beneath draws keeps its drawing, with the chips under it', async ($, on) => {
    world(on, { theirReply: true });
    await stop($);
    const ui = await $.ui.mount(reply('Per F1.'));
    expect(await ui.find({ type: 'Text', text: 'engine drawing' })).toBeDefined();
    expect(await ui.find({ key: 'reply-text' })).toBeUndefined();
    expect(await ui.find({ key: 'chip-F1' })).toBeDefined();
  });

  test('pressing a chip opens the pane at that code', async ($, on) => {
    const w = world(on);
    await stop($);
    const ui = await $.ui.mount(reply('See C1.'));
    await ui.press({ key: 'chip-C1' });
    expect(w.opened).toEqual(['kdrawer']);
    const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect(await rowCodes(pane)).toEqual(['C1']);
  });

  test('a reply citing no code on record gets no chip row', async ($, on) => {
    world(on);
    await stop($);
    const ui = await $.ui.mount(reply('Nothing here but Z9 and F7.'));
    expect(await ui.find({ key: 'chips' })).toBeUndefined();
  });

  // The open questions: Q1 and Q2, unless an answer row or a later AT names one.
  const QROWS: Row[] = [
    row('Q1', 'which fixture ships?', { options: [{ key: 'a', text: 'keep LF' }], rec: 'a - cheaper' }),
    row('Q2', 'rename the flag?', { summary: 'the second question', options: [{ key: 'a', text: 'yes' }, { key: 'b', text: 'no' }] }),
    row('F1', 'line endings differ'),
  ];
  const LATER = '2026-09-23T11:00:00+00:00';
  const finish = ($: Engine, answer: string) => $.turn.complete({ answer, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' });
  const hintFile = `${DATA}/hint-sessions`;

  test('the latest reply names what is still open, each with a hover card', async ($, on) => {
    world(on, { rows: QROWS });
    await finish($, 'Earlier text.\n\nPer F1, done.');
    const ui = await $.ui.mount(reply('Per F1, done.'));
    expect(await ui.find({ type: 'Text', text: 'Still open:' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: '· Ex: Q1 a or Q1 z <custom>' })).toBeDefined();
    const buttons = (await ui.findAll({ type: 'Button' })).map((b) => b.key);
    expect(buttons).toEqual(['chip-F1', 'chip-Q1', 'chip-Q2', 'still-open-all']);
    expect(await ui.find({ type: 'Text', text: 'rename the flag?' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: '  b. no' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: 'Ex: Q2 a or Q2 z <custom>' })).toBeDefined();
  });

  test('groups run Q, MV, B, R, each showing its 3 newest and counting the rest', async ($, on) => {
    const rows = [
      ...QROWS,
      ...['R1', 'R2', 'R3', 'R4', 'R5'].map((c) => row(c, `risk ${c}`)),
      row('B1', 'waits on access'),
      row('MV1', 'run the login'),
      row('NA1', 'next thing'),
      row('W1', 'CI running'),
    ];
    world(on, { rows });
    await finish($, 'Done.');
    const ui = await $.ui.mount(reply('Done.'));
    const buttons = (await ui.findAll({ type: 'Button' })).map((b) => b.key);
    expect(buttons).toEqual(['chip-Q1', 'chip-Q2', 'chip-MV1', 'chip-B1', 'chip-R3', 'chip-R4', 'chip-R5', 'still-open-all']);
    expect(await ui.find({ type: 'Text', text: '+2' })).toBeDefined();
    expect((await ui.findAll({ type: 'Text', text: '·' })).length).toBeGreaterThanOrEqual(3);
  });

  test('no open question is hidden: past 3, the oldest are counted and show all lists them', async ($, on) => {
    const w = world(on, { rows: ['Q1', 'Q2', 'Q3', 'Q4'].map((c) => row(c, `question ${c}`)) });
    await finish($, 'Done.');
    const ui = await $.ui.mount(reply('Done.'));
    expect((await ui.findAll({ type: 'Button' })).map((b) => b.key)).toEqual(['chip-Q2', 'chip-Q3', 'chip-Q4', 'still-open-all']);
    expect(await ui.find({ type: 'Text', text: '+1' })).toBeDefined();
    await ui.press({ key: 'still-open-all' });
    expect(w.opened).toEqual(['kdrawer']);
    const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect(await rowCodes(pane)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
  });

  test('an earlier reply gets no Still open row', async ($, on) => {
    world(on, { rows: QROWS });
    await finish($, 'The last reply.');
    const ui = await $.ui.mount(reply('Per F1, an older block.'));
    expect(await ui.find({ key: 'still-open' })).toBeUndefined();
    expect(await ui.find({ key: 'chips' })).toBeDefined();
  });

  test('a latest reply citing nothing still gets the Still open row', async ($, on) => {
    world(on, { rows: QROWS });
    await finish($, 'Nothing cited.');
    const ui = await $.ui.mount(reply('Nothing cited.'));
    expect(await ui.find({ key: 'chips' })).toBeUndefined();
    expect(await ui.find({ key: 'still-open' })).toBeDefined();
  });

  test('an answered question, or one a later AT cites, leaves the row', async ($, on) => {
    const w = world(on, { rows: [...QROWS, row('AT1', 'renamed it, per Q2', { ts: LATER })] });
    w.files.set(`${DATA}/answers/${PARENT}.jsonl`, '{"ts":"t","code":"Q1","letter":"a","how":"code"}\n');
    await finish($, 'Done.');
    const ui = await $.ui.mount(reply('Done.'));
    expect(await ui.find({ key: 'still-open' })).toBeUndefined();
  });

  test('a closed code carries a check and names what closed it', async ($, on) => {
    const w = world(on, {
      rows: [...QROWS, row('R1', 'the lock may leak'), row('AT1', 'renamed it, per Q2', { ts: LATER }), row('AT2', 'removed the lock, R1 gone', { ts: LATER }), row('V1', 'F1 holds on macOS', { ts: LATER })],
    });
    w.files.set(`${DATA}/answers/${SID}.jsonl`, '{"ts":"t","code":"Q2","letter":"b","how":"code"}\n');
    await finish($, 'Per Q2, R1 and F1.');
    const ui = await $.ui.mount(reply('Per Q2, R1 and F1.'));
    expect(await ui.find({ type: 'Text', text: '✓ Retired by AT2: removed the lock, R1 gone' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: 'F1 · Finding 1' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: 'Cited by V1' })).toBeDefined();
    const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect((await pane.find({ key: 'pick-Q2' }))?.props.label).toBe('▸ Q2');
    expect((await pane.find({ key: 'cell-status-Q2' }))?.text).toBe('✓');
    expect((await pane.find({ key: 'cell-status-Q1' }))?.text).toBe('○');
    await pane.press({ key: 'pick-Q2' });
    expect(await pane.find({ type: 'Text', text: 'Q2 ✓ · Question 2' })).toBeDefined();
    expect(await pane.find({ type: 'Text', text: '✓ Answered b · in AT1: renamed it, per Q2' })).toBeDefined();
  });

  test('owed work names the line that completed it, and an X line dismisses it', async ($, on) => {
    const w = world(on, {
      rows: [...QROWS, row('NA1', 'backfill the test'), row('NA2', 'rename the flag'), row('AT1', 'added the test for NA1', { ts: LATER }), row('X1', 'NA2 no longer needed', { ts: LATER }), row('R1', 'the lock may leak'), row('X2', 'R1 out of scope', { ts: LATER })],
    });
    await finish($, 'Done.');
    await $.ui.mount(reply('Done.'));
    const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect((await pane.find({ key: 'cell-status-NA1' }))?.text).toBe('✓');
    expect((await pane.find({ key: 'cell-status-NA2' }))?.text).toBe('✗');
    expect((await pane.find({ key: 'cell-status-NA2' }))?.children[0]?.props.color).toBe('error');
    await pane.press({ key: 'pick-NA1' });
    expect(await pane.find({ type: 'Text', text: '✓ Done in AT1: added the test for NA1' })).toBeDefined();
    await pane.press({ key: 'pick-NA2' });
    const line = await pane.find({ type: 'Text', text: '✗ Dropped by X1: NA2 no longer needed' });
    // Only the mark and verb take the colour; the line that dropped it is plain.
    expect([line?.props.color, line?.children[0]?.props.color]).toEqual([undefined, 'error']);
    // A risk an exclusion drops is dismissed like owed work.
    expect((await pane.find({ key: 'cell-status-R1' }))?.text).toBe('✗');
    await pane.press({ key: 'pick-R1' });
    expect(await pane.find({ type: 'Text', text: '✗ Dropped by X2: R1 out of scope' })).toBeDefined();
  });

  test('each closing type names its own verb', async ($, on) => {
    world(on, {
      rows: [
        ...QROWS,
        row('B1', 'waiting on the key'),
        row('C1', 'untested on macOS'),
        row('W1', 'CI is running'),
        row('AT1', 'settled Q2, key arrived for B1', { ts: LATER }),
        row('V1', 'C1 checked on macOS, W1 green', { ts: LATER }),
      ],
    });
    await finish($, 'Done.');
    await $.ui.mount(reply('Done.'));
    const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    for (const [code, line] of [
      ['Q2', '✓ Settled by AT1: settled Q2, key arrived for B1'],
      ['B1', '✓ Cleared by AT1: settled Q2, key arrived for B1'],
      ['C1', '✓ Lifted by V1: C1 checked on macOS, W1 green'],
      ['W1', '✓ Done in V1: C1 checked on macOS, W1 green'],
    ]) {
      await pane.press({ key: `pick-${code}` });
      const found = await pane.find({ type: 'Text', text: line! });
      expect([code, found?.children[0]?.props.color]).toEqual([code, 'success']);
    }
  });

  test('a withdrawn finding carries a cross and names the erratum', async ($, on) => {
    const w = world(on, {
      rows: [...QROWS, row('F1', 'Withdrawn: the cache was never stale', { summary: '(E1)' }), row('F2', 'the cache is warm')],
    });
    await finish($, 'Done.');
    await $.ui.mount(reply('Done.'));
    const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect((await pane.find({ key: 'cell-status-F1' }))?.text).toBe('✗');
    expect((await pane.find({ key: 'cell-status-F2' }))?.text).toBe('○');
    await pane.press({ key: 'pick-F1' });
    const line = await pane.find({ type: 'Text', text: '✗ Withdrawn by E1' });
    expect(line?.children[0]?.props.color).toBe('error');
  });

  test('a line an erratum corrected without restating it carries a bang and leads its card with the erratum', async ($, on) => {
    world(on, {
      rows: [
        ...QROWS,
        row('F2', 'the cache is stale'),
        row('F3', 'the build is slow'),
        row('E1', 'F2 as first written: the cache is stale', { ts: LATER, summary: 'the timestamp was from a copy' }),
        row('E2', 'F3 as first written: the build is slow', { ts: LATER }),
        row('F3', 'the build is fast', { ts: LATER, summary: '(E2)' }),
      ],
    });
    await finish($, 'Done.');
    await $.ui.mount(reply('Done.'));
    const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    const bang = await pane.find({ key: 'cell-status-F2' });
    expect(bang?.text).toBe('!');
    expect(bang?.children[0]?.props.color).toBe('warning');
    expect((await pane.find({ key: 'cell-status-F3' }))?.text).toBe('○');
    await pane.press({ key: 'pick-F2' });
    const line = await pane.find({ type: 'Text', text: '! Corrected by E1: the timestamp was from a copy' });
    expect(line?.children[0]?.props.color).toBe('warning');
    await pane.press({ key: 'pick-F3' });
    expect(await pane.find({ type: 'Text', text: /^! Corrected by/ })).toBeUndefined();
  });

  test('an erratum stamped in the same second as the line it corrects still marks it', async ($, on) => {
    world(on, {
      rows: [...QROWS, row('F2', 'the cache is stale'), row('E1', 'F2 as first written: the cache is stale', { summary: 'the timestamp was from a copy' })],
    });
    await finish($, 'Done.');
    await $.ui.mount(reply('Done.'));
    const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect((await pane.find({ key: 'cell-status-F2' }))?.text).toBe('!');
  });

  test('a dismissed question carries a cross and says it was dismissed', async ($, on) => {
    const w = world(on, { rows: QROWS });
    w.files.set(`${DATA}/answers/${SID}.jsonl`, '{"ts":"t","code":"Q2","letter":"x","how":"dismissed"}\n');
    await finish($, 'Done.');
    await $.ui.mount(reply('Done.'));
    const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect((await pane.find({ key: 'cell-status-Q2' }))?.text).toBe('✗');
    await pane.press({ key: 'pick-Q2' });
    expect(await pane.find({ type: 'Text', text: 'Q2 ✗ · Question 2' })).toBeDefined();
    const line = await pane.find({ type: 'Text', text: '✗ Dismissed' });
    expect(line?.children[0]?.props.color).toBe('error');
  });

  test('a child session answer overrides the parent answer on the card', async ($, on) => {
    const w = world(on, { rows: QROWS });
    w.files.set(`${DATA}/answers/${PARENT}.jsonl`, '{"ts":"t","code":"Q2","letter":"a","how":"code"}\n');
    w.files.set(`${DATA}/answers/${SID}.jsonl`, '{"ts":"t","code":"Q2","letter":"b","how":"code"}\n');
    await finish($, 'Done.');
    await $.ui.mount(reply('Done.'));
    const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    await pane.press({ key: 'pick-Q2' });
    expect(await pane.find({ type: 'Text', text: '✓ Answered b' })).toBeDefined();
  });

  test('the row hint shows in the first 3 sessions that drew it, then only on hover', async ($, on) => {
    const w = world(on, { rows: QROWS });
    w.files.set(hintFile, 'a\nb\n');
    await finish($, 'Done.');
    expect(w.files.get(hintFile)).toBe(`a\nb\n${SID}\n`);
    expect(await (await $.ui.mount(reply('Done.'))).find({ type: 'Text', text: '· Ex: Q1 a or Q1 z <custom>' })).toBeDefined();
  });

  test('a fourth session gets no row hint, but the question card keeps it', async ($, on) => {
    const w = world(on, { rows: QROWS });
    w.files.set(hintFile, 'a\nb\nc\n');
    await finish($, 'Done.');
    const ui = await $.ui.mount(reply('Done.'));
    expect(w.files.get(hintFile)).toBe('a\nb\nc\n');
    expect(await ui.find({ type: 'Text', text: '· Ex: Q1 a or Q1 z <custom>' })).toBeUndefined();
    expect(await ui.find({ type: 'Text', text: 'Ex: Q1 a or Q1 z <custom>' })).toBeDefined();
  });

  test('a session with no open question does not use up a hint session', async ($, on) => {
    const w = world(on, { rows: [row('F1', 'line endings differ')] });
    await finish($, 'Done.');
    expect(w.files.has(hintFile)).toBe(false);
  });

  test('show all opens the pane in full view on the still open codes, and Clear lifts the filter', async ($, on) => {
    const w = world(on, { rows: QROWS });
    await finish($, 'Done.');
    const ui = await $.ui.mount(reply('Done.'));
    await ui.press({ key: 'still-open-all' });
    expect(w.opened).toEqual(['kdrawer']);
    const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect(await rowCodes(pane)).toEqual(['Q1', 'Q2']);
    expect((await pane.find({ key: 'filter' }))?.props.label).toBe('Filter: still open ▾');
    expect((await pane.find({ key: 'view' }))?.props.label).toBe('Show short view');
    expect(await pane.find({ type: 'Text', text: 'the second question' })).toBeDefined();
    await pane.press({ key: 'clear' });
    expect(await rowCodes(pane)).toEqual(['F1', 'Q1', 'Q2']);
    expect((await pane.find({ key: 'filter' }))?.props.label).toBe('Filter: all types ▾');
  });

  test('no chips when Katharsis is not active', async ($, on) => {
    world(on, { active: false });
    await stop($);
    const ui = await $.ui.mount(reply('Per F1.'));
    expect(await ui.find({ key: 'chips' })).toBeUndefined();
  });
});

describe('session record', () => {
  const REC = `${DATA}/sessions/${SID}.json`;
  const BASE = { id: SID, cwd: '/w', started: 't0', updated: 't0', katharsis: [] };
  const record = (w: World) => JSON.parse(w.files.get(REC) ?? '{}');
  const finish = ($: Engine) => $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' });
  // The title's fork runs after the hook returns, so let it land.
  const settle = () => new Promise((r) => setTimeout(r, 20));

  test('Stop records the transcript path, and marks it seen once it exists', async ($, on) => {
    const w = world(on);
    w.files.set(REC, JSON.stringify(BASE));
    await $.classic.Stop({ stop_hook_active: false, session_id: SID, transcript_path: '/p/s1.jsonl' });
    expect(record(w).transcript).toBe('/p/s1.jsonl');
    expect(record(w).transcriptSeen).toBe(undefined);
    w.files.set('/p/s1.jsonl', '{}\n');
    await $.classic.Stop({ stop_hook_active: false, session_id: SID, transcript_path: '/p/s1.jsonl' });
    expect(record(w).transcriptSeen).toBe(true);
  });

  test('Stop writes no record for a session that has none', async ($, on) => {
    const w = world(on);
    await $.classic.Stop({ stop_hook_active: false, session_id: SID, transcript_path: '/p/s1.jsonl' });
    expect(w.files.has(REC)).toBe(false);
  });

  test('turn 3 titles the session, and turn 2 does not', async ($, on) => {
    const w = world(on);
    w.files.set(REC, JSON.stringify(BASE));
    w.turns = 2;
    await finish($);
    await settle();
    expect(w.forks.length).toBe(0);
    w.turns = 3;
    await finish($);
    await settle();
    expect(w.forks.length).toBe(1);
    expect(record(w)).toMatchObject({ title: 'Fixing the drawer band', titleSource: 'katharsis' });
  });

  test('a reply that is not a title leaves the record untitled', async ($, on) => {
    const w = world(on);
    w.files.set(REC, JSON.stringify(BASE));
    w.turns = 3;
    w.reply = 'one two three four five six seven eight nine ten';
    await finish($);
    await settle();
    expect(w.forks.length).toBe(1);
    expect(record(w).title).toBe(undefined);
  });
});

describe('autonomy suggestion', () => {
  const reply = (text: string) =>
    ({ plugin: 'katharsis', surface: 'terminal', component: 'AssistantMessage', props: { text, isFirstOfReply: true } }) as const;
  const finish = ($: Engine, answer: string) => $.turn.complete({ answer, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' });
  const TEXT = 'You took the recommendation on 35 of the 50 questions you answered that carried one (70%). The standard autonomy level may suit you: search /config for autonomy.';
  const DISMISSED = `${DATA}/autonomy-suggestion-dismissed`;
  // The scan runs beside the refresh, so a check waits for it to land.
  const settle = () => new Promise((r) => setTimeout(r, 20));

  // An earlier session's questions, each recommending a, and its answers:
  // the first `took` answer a and the rest answer b.
  function history(w: World, n: number, took: number): void {
    const codes = Array.from({ length: n }, (_, k) => `Q${k + 1}`);
    w.files.set(`${DATA}/ledger/x-p/h1.jsonl`, jsonl(codes.map((c) => row(c, c, { session_id: 'h1', options: [], rec: 'a - why' }))));
    w.files.set(`${DATA}/answers/h1.jsonl`, codes.map((c, k) => JSON.stringify({ ts: 't', code: c, letter: k < took ? 'a' : 'b', how: 'code' })).join('\n') + '\n');
  }

  test('at guided, 35 of 50 taken puts the suggestion under the latest reply only', async ($, on) => {
    const w = world(on, { rows: [] });
    history(w, 50, 35);
    await finish($, 'Done.');
    await settle();
    expect(await (await $.ui.mount(reply('Done.'))).find({ type: 'Text', text: TEXT })).toBeDefined();
    expect(await (await $.ui.mount(reply('An earlier reply.'))).find({ key: 'suggest' })).toBeUndefined();
  });

  for (const [n, took] of [[49, 49], [50, 34]] as const) {
    test(`${took} of ${n} taken makes no suggestion`, async ($, on) => {
      const w = world(on, { rows: [] });
      history(w, n, took);
      await finish($, 'Done.');
      await settle();
      expect(await (await $.ui.mount(reply('Done.'))).find({ key: 'suggest' })).toBeUndefined();
    });
  }

  for (const level of ['standard', 'autonomous']) {
    test(`at ${level} there is no suggestion, before or after /clear`, { options: { autonomy: level } }, async ($, on) => {
      const w = world(on, { rows: [] });
      history(w, 50, 50);
      await finish($, 'Done.');
      await settle();
      expect(await (await $.ui.mount(reply('Done.'))).find({ key: 'suggest' })).toBeUndefined();
      await $.session.end({ reason: 'clear', sessionId: SID, resume: { id: SID } } as never);
      w.sid = 's2';
      await finish($, 'After.');
      await settle();
      expect(await (await $.ui.mount(reply('After.'))).find({ key: 'suggest' })).toBeUndefined();
    });
  }

  test('dismiss hides it and records the dismissal, and a dismissal on file keeps it hidden', async ($, on) => {
    const w = world(on, { rows: [] });
    history(w, 50, 35);
    await finish($, 'Done.');
    await settle();
    const ui = await $.ui.mount(reply('Done.'));
    await ui.press({ key: 'suggest-dismiss' });
    await settle();
    expect(w.files.has(DISMISSED)).toBe(true);
    expect(await (await $.ui.mount(reply('Done.'))).find({ key: 'suggest' })).toBeUndefined();
  });

  test('a dismissal from another session hides the row at the next refresh', async ($, on) => {
    const w = world(on, { rows: [] });
    history(w, 50, 35);
    await finish($, 'Done.');
    await settle();
    expect(await (await $.ui.mount(reply('Done.'))).find({ key: 'suggest' })).toBeDefined();
    w.files.set(DISMISSED, 't\n');
    await finish($, 'After.');
    await settle();
    expect(await (await $.ui.mount(reply('After.'))).find({ key: 'suggest' })).toBeUndefined();
  });

  test('one scan a session, however many turns end', async ($, on) => {
    const w = world(on, { rows: [] });
    history(w, 50, 35);
    await finish($, 'Done.');
    await finish($, 'Again.');
    await settle();
    expect(w.scans).toBe(1);
  });

  test('a dismissal written while the scan runs keeps the row hidden', async ($, on) => {
    const w = world(on, { rows: [] });
    history(w, 50, 35);
    let release = () => {};
    w.hold = new Promise((r) => (release = r));
    await finish($, 'Done.');
    await settle();
    expect(w.scans).toBe(1);
    w.files.set(DISMISSED, 't\n');
    release();
    await settle();
    expect(await (await $.ui.mount(reply('Done.'))).find({ key: 'suggest' })).toBeUndefined();
  });

  // A scan still running when /clear starts the next session lands after
  // that session's own scan found nothing to suggest, and is ignored.
  test("a scan from before /clear can't put a suggestion in the next session", async ($, on) => {
    const w = world(on, { rows: [] });
    history(w, 50, 35);
    const answers = w.files.get(`${DATA}/answers/h1.jsonl`)!;
    let release = () => {};
    w.hold = new Promise((r) => (release = r));
    await finish($, 'Done.');
    await settle();
    expect(w.scans).toBe(1);
    await $.session.end({ reason: 'clear', sessionId: SID, resume: { id: SID } } as never);
    w.sid = 's2';
    w.files.set(`${PROJ}/s2.jsonl`, '');
    w.hold = undefined;
    w.files.delete(`${DATA}/answers/h1.jsonl`);
    await finish($, 'After.');
    await settle();
    w.files.set(`${DATA}/answers/h1.jsonl`, answers);
    release();
    await settle();
    expect(await (await $.ui.mount(reply('After.'))).find({ key: 'suggest' })).toBeUndefined();
  });

  test('a dismissal already on file makes no suggestion', async ($, on) => {
    const w = world(on, { rows: [] });
    history(w, 50, 50);
    w.files.set(DISMISSED, 't\n');
    await finish($, 'Done.');
    await settle();
    expect(await (await $.ui.mount(reply('Done.'))).find({ key: 'suggest' })).toBeUndefined();
  });
});
