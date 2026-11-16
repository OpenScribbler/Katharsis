// Tests for hooks/drawer.tsx's band, its refresh, /kdrawer, the session record's title, and the
// autonomy suggestion, run by `claude plugin test .`.

import { describe, expect, mock, test } from 'claude-code/testing';
import type { Engine } from 'claude-code/testing';
import { BAND, BAND_ON, DATA, jsonl, paneProps, PROJ, type Row, row, rowCodes, RUN, SID, START, view, type World, world } from './drawer-world.ts';

describe('band', () => {
  test('renders the button and one label per type, alphabetical by code', BAND_ON, async ($, on) => {
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

  test('a band too narrow for the hint drops it and keeps every label whole', BAND_ON, async ($, on) => {
    world(on);
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 40 } });
    expect(await ui.find({ type: 'Text', text: '| use /kdrawer ·' })).toBeUndefined();
    expect(await ui.find({ key: 'band-head' })).toBeDefined();
    expect((await ui.findAll({ type: 'Box' })).filter((b) => b.key?.startsWith('label-')).map((b) => b.props.flexShrink)).toEqual([0, 0, 0, 0, 0]);
  });

  test('each label carries a hover list of that type', BAND_ON, async ($, on) => {
    world(on);
    const ui = await $.ui.mount(BAND);
    expect([
      (await ui.find({ key: 'reveal-F' })) !== undefined,
      (await ui.find({ type: 'Text', text: 'Findings (F) · 2' })) !== undefined,
      (await ui.find({ key: 'reveal-F2' }))?.props.label,
      (await ui.find({ key: 'reveal-all-F' }))?.props.label,
    ]).toEqual([
      true,
      true,
      'F2  the cache is stale',
      'list all 2 ▸',
    ]);
  });

  test('a reveal pads every code to the widest shown, so F9 and F10 titles start in one column', BAND_ON, async ($, on) => {
    world(on, { rows: Array.from({ length: 12 }, (_, k) => row(`F${k + 1}`, `finding ${k + 1}`)) });
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 20 } });
    expect((await ui.find({ key: 'reveal-F9' }))?.props.label).toBe('F9   finding 9');
    expect((await ui.find({ key: 'reveal-F10' }))?.props.label).toBe('F10  finding 10');
  });

  test('every reveal has one height, sized to the largest type', BAND_ON, async ($, on) => {
    world(on);
    const ui = await $.ui.mount(BAND);
    const heights = (await ui.findAll({ type: 'Box' })).filter((b) => /^reveal-[A-Z-]+$/.test(b.key ?? '')).map((b) => b.props.height);
    expect(heights).toEqual([5, 5, 5, 5, 5]);
  });

  test('a reveal lists at most 10 titles and never outgrows the band', BAND_ON, async ($, on) => {
    const many = Array.from({ length: 30 }, (_, k) => row(`F${k + 1}`, `finding ${k + 1}`));
    world(on, { rows: many });
    const tall = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 20 } });
    expect((await tall.findAll({ type: 'Button' })).filter((b) => /^reveal-F\d+$/.test(b.key ?? '')).map((b) => b.key)).toHaveLength(10);
    expect(await tall.find({ type: 'Text', text: 'latest 10' })).toBeDefined();
    const short = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 8 } });
    expect((await short.find({ key: 'reveal-F' }))?.props.height).toBe(7);
  });

  test('pressing a title in a reveal opens the pane at that item', BAND_ON, async ($, on) => {
    const w = world(on);
    const ui = await $.ui.mount(BAND);
    await ui.press({ key: 'reveal-F2' });
    expect(w.opened).toEqual(['kdrawer']);
    const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect(await rowCodes(pane)).toEqual(['F2']);
    expect(await pane.find({ key: 'card-F2' })).toBeDefined();
  });

  test('pressing a label opens the pane on that type in short view', BAND_ON, async ($, on) => {
    const w = world(on);
    const ui = await $.ui.mount(BAND);
    await ui.press({ key: 'band-F' });
    expect(w.opened).toEqual(['kdrawer']);
    const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect(await rowCodes(pane)).toEqual(['F1', 'F2']);
    expect((await pane.find({ key: 'view' }))?.props.label).toBe('View: short ▾');
  });

  test('its button opens the pane', BAND_ON, async ($, on) => {
    const w = world(on);
    const ui = await $.ui.mount(BAND);
    await ui.press({ key: 'open' });
    expect(w.opened).toEqual(['kdrawer']);
  });

  test('shows in an active session with no items yet', BAND_ON, async ($, on) => {
    const w = world(on, { rows: [] });
    const ui = await $.ui.mount(BAND);
    expect([
      (await ui.find({ type: 'Text', text: '▸ Katharsis' })) !== undefined,
      (await ui.find({ key: 'open' }))?.props.label,
      (await ui.find({ type: 'Text', text: '| use /kdrawer ·' })) !== undefined,
      (await ui.find({ type: 'Text', text: /no codes yet/ })) !== undefined,
      w.commands,
    ]).toEqual([
      true,
      'open',
      true,
      true,
      ['kdrawer'],
    ]);
  });

  test('yields and registers nothing when Katharsis is not active', BAND_ON, async ($, on) => {
    const w = world(on, { active: false });
    const ui = await $.ui.mount(BAND);
    expect(await ui.find({ key: 'open' })).toBeUndefined();
    expect(w.commands).toEqual([]);
  });

  test('draws nothing of its own with the option off, as it is by default', async ($, on) => {
    world(on);
    const ui = await $.ui.mount(BAND);
    expect(await ui.find({ key: 'open' })).toBeUndefined();
    expect(await ui.find({ type: 'Text', text: '▸ Katharsis' })).toBeUndefined();
    expect(await ui.find({ type: 'Text', text: 'engine drawing' })).toBeDefined();
  });

  test('k is the open button\'s hotkey', BAND_ON, async ($, on) => {
    world(on);
    const ui = await $.ui.mount(BAND);
    expect((await ui.find({ key: 'open' }))?.props.hotkey).toBe('k');
  });

  test('yields to a survey', BAND_ON, async ($, on) => {
    world(on);
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true } });
    expect(await ui.find({ key: 'open' })).toBeUndefined();
  });

  test('draws what the hooks below it drew beneath the band', BAND_ON, async ($, on) => {
    world(on);
    const ui = await $.ui.mount(BAND);
    expect(await ui.find({ key: 'open' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: 'engine drawing' })).toBeDefined();
  });
});

describe('refresh', () => {
  test('the end of a turn loads the ledger', async ($, on) => {
    world(on);
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' });
    const ui = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect(await rowCodes(ui)).toEqual(['AT1', 'C1', 'D1', 'F1', 'F2', 'Q1']);
  });

  // An earlier build could end the turn before ledger-stop.sh wrote, so the
  // drawer reloads 1.5 and 5 seconds after the end of the turn.
  test('rows ledger-stop.sh writes after the end of the turn show at 1.5 and 5 seconds', async ($, on) => {
    const w = world(on);
    const clock = mock.clock(on);
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' });
    const ui = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    const add = (r: Row) => w.files.set(`${PROJ}/${SID}.jsonl`, `${w.files.get(`${PROJ}/${SID}.jsonl`) ?? ''}${JSON.stringify(r)}\n`);
    add(row('F3', 'written late'));
    await clock.advance(1400);
    expect(await rowCodes(ui)).not.toContain('F3');
    await clock.advance(200);
    expect(await rowCodes(ui)).toContain('F3');
    add(row('F4', 'written later'));
    await clock.advance(3300);
    expect(await rowCodes(ui)).not.toContain('F4');
    await clock.advance(200);
    expect(await rowCodes(ui)).toContain('F4');
  });
});

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

  test('the band drops the old session after /clear and draws the new one', BAND_ON, async ($, on) => {
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

  // Under a bare style name the drawer opens only while a style file of the
  // user's own goes by it, found in CLAUDE_CONFIG_DIR's output-styles folder
  // when that variable is set.
  test('/kdrawer under a bare style name follows the user\'s own style file', async ($, on) => {
    const w = world(on, { env: { HOME: '/home/u', KATHARSIS_DATA: DATA, TERM_PROGRAM: 'ghostty', CLAUDE_CONFIG_DIR: '/cfg' } });
    w.style = 'Katharsis';
    w.files.set('/home/u/.claude/output-styles/Katharsis.md', '# not read while CLAUDE_CONFIG_DIR is set\n');
    const off = await $.command.run({ ...RUN, command: 'kdrawer', args: '' });
    const openedOff = [...w.opened];
    w.files.set('/cfg/output-styles/mine.md', '---\nname: Katharsis\n---\n');
    await $.command.run({ ...RUN, command: 'kdrawer', args: '' });
    expect({ inactive: String(off.text).includes('not active'), openedOff, opened: w.opened }).toEqual({ inactive: true, openedOff: [], opened: ['kdrawer'] });
  });

  test('/kdrawer says so when Katharsis is not active', async ($, on) => {
    const w = world(on, { active: false });
    const r = await $.command.run({ ...RUN, command: 'kdrawer', args: '' });
    expect(r.text).toContain('not active');
    expect(w.opened).toEqual([]);
  });
});

describe('session record', () => {
  const REC = `${DATA}/sessions/${SID}.json`;
  const BASE = { id: SID, cwd: '/w', started: 't0', updated: 't0', katharsis: [] };
  const record = (w: World) => JSON.parse(w.files.get(REC) ?? '{}');
  const finish = ($: Engine) => $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' });
  // The title's fork runs after the hook returns, so let it land.
  const settle = () => new Promise((r) => setTimeout(r, 20));

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
