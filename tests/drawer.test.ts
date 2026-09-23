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
  test('renders the button and one label per type, in the style order', async ($, on) => {
    const w = world(on);
    const ui = await $.ui.mount(BAND);
    expect((await ui.find({ key: 'open' }))?.props.label).toBe('▸ Katharsis');
    const labels = (await ui.findAll({ type: 'Button' })).filter((b) => b.key?.startsWith('band-')).map((b) => b.props.label);
    expect(labels).toEqual(['F 2', 'C 1', 'AT 1', 'Q 1', 'D 1']);
    expect(await ui.find({ type: 'Text', text: /codes/ })).toBeUndefined();
    expect(w.commands).toEqual(['kdrawer']);
  });

  test('each label carries a hover list of that type', async ($, on) => {
    world(on);
    const ui = await $.ui.mount(BAND);
    expect(await ui.find({ key: 'reveal-F' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: 'Findings (F) · 2' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: 'F2  the cache is stale' })).toBeDefined();
  });

  test('pressing a label opens the pane on that type in short view', async ($, on) => {
    const w = world(on);
    const ui = await $.ui.mount(BAND);
    await ui.press({ key: 'band-F' });
    expect(w.opened).toEqual(['kdrawer']);
    const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect(await rowCodes(pane)).toEqual(['F1', 'F2']);
    expect((await pane.find({ key: 'view' }))?.props.label).toBe('Full view');
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
    expect((await ui.find({ key: 'open' }))?.props.label).toBe('▸ Katharsis');
    expect(await ui.find({ type: 'Text', text: /no codes yet/ })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: /\/kdrawer/ })).toBeDefined();
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
    expect(await rowCodes(ui)).toEqual(['F1', 'F2', 'C1', 'AT1', 'Q1', 'D1']);
  });
});

for (const surface of ['terminal', 'desktop'] as const) {
  describe(`pane (${surface})`, () => {
    test('lists every item grouped by type, superseded records collapsed', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      expect(await rowCodes(ui)).toEqual(['F1', 'F2', 'C1', 'AT1', 'Q1', 'D1']);
      const groups = (await ui.findAll({ type: 'Box' })).map((b) => b.key ?? '').filter((k) => k.startsWith('group-'));
      expect(groups).toEqual(['group-F', 'group-C', 'group-AT', 'group-Q', 'group-D']);
      expect(await ui.find({ type: 'Text', text: 'Findings (F)' })).toBeDefined();
      expect(await ui.find({ type: 'Text', text: 'Actions taken (AT)' })).toBeDefined();
      expect((await ui.find({ key: 'pick-F1' }))?.props.label).toBe('▸ F1  line endings differ');
      expect(await ui.find({ text: /old title superseded/ })).toBeUndefined();
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
      await ui.input({ key: 'q', text: 'caveat' });
      expect(await rowCodes(ui)).toEqual(['C1']);
      await ui.input({ key: 'q', text: 'nothing like this' });
      expect(await rowCodes(ui)).toEqual([]);
      expect(await ui.find({ type: 'Text', text: 'Nothing matches.' })).toBeDefined();
    });

    test('the filter row names all plus each type present, and marks the choice', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      const labels = (await ui.findAll({ type: 'Button' })).filter((b) => b.key?.startsWith('filter-')).map((b) => b.props.label);
      expect(labels).toEqual(['[All 6]', 'Findings (F) 2', 'Caveats (C) 1', 'Actions taken (AT) 1', 'Questions (Q) 1', 'Decisions (D) 1']);
      await ui.press({ key: 'filter-F' });
      expect(await rowCodes(ui)).toEqual(['F1', 'F2']);
      expect((await ui.find({ key: 'filter-F' }))?.props.label).toBe('[Findings (F) 2]');
      await ui.press({ key: 'filter-all' });
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
      expect((await ui.find({ key: 'pick-Q1' }))?.props.label).toBe('▸ Q1  which fixture ships?');
      await ui.press({ key: 'view' });
      expect(await ui.find({ type: 'Text', text: 'full body text' })).toBeDefined();
    });

    test('pressing a row in short view opens its card, and again closes it', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      await ui.press({ key: 'view' });
      await ui.press({ key: 'pick-Q1' });
      expect(await ui.find({ key: 'card-Q1' })).toBeDefined();
      expect(await ui.find({ type: 'Text', text: 'Q1 · Question 1' })).toBeDefined();
      expect(await ui.find({ type: 'Text', text: 'a. keep LF' })).toBeDefined();
      expect(await ui.find({ type: 'Text', text: '→ a - cheaper' })).toBeDefined();
      expect((await ui.find({ key: 'pick-Q1' }))?.props.label).toBe('▾ Q1  which fixture ships?');
      await ui.press({ key: 'pick-Q1' });
      expect(await ui.find({ key: 'card-Q1' })).toBeUndefined();
      expect(await ui.find({ type: 'Text', text: 'a. keep LF' })).toBeUndefined();
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
    const chips = (await ui.findAll({ type: 'Button' })).map((b) => b.key);
    expect(chips).toEqual(['chip-F1', 'chip-Q1']);
    // The hover card names the type, then the title, body and options.
    expect(await ui.find({ type: 'Text', text: 'Q1 · Question 1' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: 'F1 · Finding 1' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: 'which fixture ships?' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: 'a. keep LF' })).toBeDefined();
  });

  test('codes on record become links, outside code spans and fences', async ($, on) => {
    world(on);
    await stop($);
    const ui = await $.ui.mount(reply('Per F1, not Z9 or `F1`.\n```\nF1\n```\nQ1 stays open.'));
    const md = await ui.find({ key: 'reply-text' });
    expect(md?.props.text).toBe(
      'Per [F1](https://katharsis.invalid/F1/finding-1), not Z9 or `F1`.\n```\nF1\n```\n[Q1](https://katharsis.invalid/Q1/question-1) stays open.',
    );
    expect(await ui.find({ type: 'Text', text: 'engine drawing' })).toBeUndefined();
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
    expect(await ui.find({ type: 'Text', text: 'engine drawing' })).toBeDefined();
    expect(await ui.find({ key: 'chip-F1' })).toBeDefined();
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
