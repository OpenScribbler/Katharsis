// Tests for hooks/drawer.tsx, run by `claude plugin test .` with
// CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1. Each test answers the nouns the drawer
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

type World = { files: Map<string, string>; opened: string[]; commands: string[] };

function world(on: On, opts: { active?: boolean; rows?: Row[] } = {}): World {
  const files = new Map<string, string>();
  if (opts.active !== false) files.set(`${DATA}/.active-${SID}`, '');
  files.set(`${PROJ}/${SID}.jsonl`, jsonl(opts.rows ?? ROWS));
  // An ancestor in the chain, and a session outside it.
  files.set(`${DATA}/ledger/chains/${SID}`, `${PARENT}\n`);
  files.set(`${DATA}/ledger/y-q/${PARENT}.jsonl`, jsonl(opts.rows ? [] : [row('D1', 'from the parent session', { session_id: PARENT })]));
  files.set(`${DATA}/ledger/y-q/other.jsonl`, jsonl([row('D9', 'another session', { session_id: 'other' })]));
  const w: World = { files, opened: [], commands: [] };
  mock.env(on, { HOME: '/home/u', KATHARSIS_DATA: DATA });
  on('session.id', () => ({ value: SID }));
  on('fs.exists', (_$, e) => ({
    value: w.files.has(e.path) || [...w.files.keys()].some((k) => k.startsWith(`${e.path}/`)),
  }));
  on('fs.read', (_$, e) => {
    const text = w.files.get(e.path);
    if (text === undefined) throw new Error(`ENOENT ${e.path}`);
    return { value: text };
  });
  on('fs.list', (_$, e) => {
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
  on('classic.Stop', () => ({}));
  on('turn.complete', (_$, e) => ({ text: e.answer }));
  // The engine's own drawing, beneath the drawer: what next(e) resolves to.
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine drawing' }));
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
  test('renders the button and the counts per prefix', async ($, on) => {
    const w = world(on);
    const ui = await $.ui.mount(BAND);
    expect((await ui.find({ key: 'open' }))?.props.label).toBe('▸ Katharsis');
    const line = (await ui.find({ type: 'Text', text: /codes/ }))?.text ?? '';
    expect(line).toContain('6 codes');
    expect(line).toContain('AT 1  C 1  D 1  F 2  Q 1');
    expect(w.commands).toEqual(['kdrawer']);
  });

  test('its button opens the pane', async ($, on) => {
    const w = world(on);
    const ui = await $.ui.mount(BAND);
    await ui.press({ key: 'open' });
    expect(w.opened).toEqual(['kdrawer']);
  });

  test('yields when the session has no items', async ($, on) => {
    const w = world(on, { rows: [] });
    const ui = await $.ui.mount(BAND);
    expect(await ui.find({ key: 'open' })).toBeUndefined();
    expect(await ui.find({ type: 'Text', text: 'engine drawing' })).toBeDefined();
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
    test('lists every item in kref order, superseded records collapsed', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      expect(await rowCodes(ui)).toEqual(['AT1', 'C1', 'D1', 'F1', 'F2', 'Q1']);
      expect(await ui.find({ type: 'Text', text: 'old title superseded' })).toBeUndefined();
      expect(await ui.find({ type: 'Text', text: 'F1  line endings differ' })).toBeDefined();
    });

    test('full view shows the body, each option and the recommendation', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      expect(await ui.find({ type: 'Text', text: 'full body text' })).toBeDefined();
      expect(await ui.find({ type: 'Text', text: 'a. keep LF' })).toBeDefined();
      expect(await ui.find({ type: 'Text', text: 'b. regenerate' })).toBeDefined();
      expect(await ui.find({ type: 'Text', text: '→ a - cheaper' })).toBeDefined();
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
      await ui.input({ key: 'q', text: 'nothing like this' });
      expect(await rowCodes(ui)).toEqual([]);
      expect(await ui.find({ type: 'Text', text: 'Nothing matches.' })).toBeDefined();
    });

    test('the prefix filter lists all plus the prefixes present', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      const select = await ui.find({ key: 'prefix' });
      expect((select?.props.options as { value: string }[]).map((o) => o.value)).toEqual(['all', 'AT', 'C', 'D', 'F', 'Q']);
      await ui.select({ key: 'prefix', value: 'F' });
      expect(await rowCodes(ui)).toEqual(['F1', 'F2']);
      await ui.select({ key: 'prefix', value: 'all' });
      expect(await rowCodes(ui)).toHaveLength(6);
    });

    test('the toggle switches between full and short views', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      expect((await ui.find({ key: 'view' }))?.props.label).toBe('Short view');
      await ui.press({ key: 'view' });
      expect((await ui.find({ key: 'view' }))?.props.label).toBe('Full view');
      expect(await ui.find({ type: 'Text', text: 'full body text' })).toBeUndefined();
      expect(await ui.find({ type: 'Text', text: 'a. keep LF' })).toBeUndefined();
      expect(await ui.find({ type: 'Text', text: 'Q1  which fixture ships?' })).toBeDefined();
      await ui.press({ key: 'view' });
      expect(await ui.find({ type: 'Text', text: 'full body text' })).toBeDefined();
    });
  });
}

describe('command', () => {
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

  test('a reply citing codes on record gets a chip per cited code', async ($, on) => {
    world(on);
    await stop($);
    const ui = await $.ui.mount(reply('Per F1 and Q1 (and F1 again), not Z9 or F7.'));
    expect(await ui.find({ type: 'Text', text: 'engine drawing' })).toBeDefined();
    const chips = (await ui.findAll({ type: 'Button' })).map((b) => b.key);
    expect(chips).toEqual(['chip-F1', 'chip-Q1']);
    // The hover card carries the title, the body and a question's options.
    expect(await ui.find({ type: 'Text', text: 'Q1  which fixture ships?' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: 'a. keep LF' })).toBeDefined();
  });

  test('pressing a chip opens the pane at that code', async ($, on) => {
    const w = world(on);
    await stop($);
    const ui = await $.ui.mount(reply('See Q1.'));
    await ui.press({ key: 'chip-Q1' });
    expect(w.opened).toEqual(['kdrawer']);
    const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect(await rowCodes(pane)).toEqual(['Q1']);
  });

  test('a reply citing no code on record gets no chip row', async ($, on) => {
    world(on);
    await stop($);
    const ui = await $.ui.mount(reply('Nothing here but Z9 and F7.'));
    expect(await ui.find({ key: 'chips' })).toBeUndefined();
  });

  test('no chips when Katharsis is not active', async ($, on) => {
    world(on, { active: false });
    await stop($);
    const ui = await $.ui.mount(reply('Per F1.'));
    expect(await ui.find({ key: 'chips' })).toBeUndefined();
  });
});
