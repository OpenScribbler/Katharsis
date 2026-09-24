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
    expect(await ui.find({ type: 'Text', text: '▸ Katharsis' })).toBeDefined();
    expect((await ui.find({ key: 'open' }))?.props.label).toBe('open');
    expect(await ui.find({ type: 'Text', text: '| use /kdrawer ·' })).toBeDefined();
    const labels = (await ui.findAll({ type: 'Button' })).filter((b) => b.key?.startsWith('band-')).map((b) => b.props.label);
    expect(labels).toEqual(['F:2', 'C:1', 'AT:1', 'Q:1', 'D:1']);
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
      await ui.press({ key: 'view' });
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

    test('the filter button opens a list of all plus each type present, and names the choice', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      expect((await ui.find({ key: 'filter' }))?.props.label).toBe('Filter: all types ▾');
      expect(await ui.find({ key: 'filter-list' })).toBeUndefined();
      await ui.press({ key: 'filter' });
      const labels = (await ui.findAll({ type: 'Button' })).filter((b) => b.key?.startsWith('filter-')).map((b) => b.props.label);
      expect(labels.map((l) => l.replace(/ +(\d+)$/, ' | $1'))).toEqual(['● All types | 6', '  Findings (F) | 2', '  Caveats (C) | 1', '  Actions taken (AT) | 1', '  Questions (Q) | 1', '  Decisions (D) | 1']);
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
      expect((await ui.find({ key: 'filter-list' }))?.props.width).toBe(34);
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
      expect((await ui.find({ key: 'pick-Q1' }))?.props.label).toBe('▸ Q1  which fixture ships?');
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
