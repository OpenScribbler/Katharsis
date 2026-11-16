// Tests for the drawer's pane: its list on each surface, answering a question from
// it, the Status menu and glyphs, and the settings view, run by `claude plugin test .`.

import { describe, expect, test } from 'claude-code/testing';
import type { Engine } from 'claude-code/testing';
import type { On } from 'claude-code';
import { BAND, BAND_ON, DATA, endTurn, mountPane, paneProps, PROJ, type Row, row, rowCodes, RUN, SID, START, view, type World, world } from './drawer-world.ts';

for (const surface of ['terminal', 'desktop'] as const) {
  describe(`pane (${surface})`, () => {
    test('lists every item grouped by type name, superseded records collapsed', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      expect(await rowCodes(ui)).toEqual(['AT1', 'C1', 'D1', 'F1', 'F2', 'Q1']);
      const groups = (await ui.findAll({ type: 'Box' })).map((b) => b.key ?? '').filter((k) => k.startsWith('group-'));
      expect([
        groups,
        (await ui.find({ type: 'Text', text: 'Findings (F) · 2' })) !== undefined,
        (await ui.find({ type: 'Text', text: 'Actions taken (AT) · 1' })) !== undefined,
        (await ui.find({ type: 'Text', text: 'Questions (Q) · 1 open of 1' })) !== undefined,
        (await ui.find({ key: 'pick-F1' }))?.props.label,
        (await ui.find({ key: 'cell-title-F1' }))?.text,
        await ui.find({ text: /old title superseded/ }),
      ]).toEqual([
        ['group-AT', 'group-C', 'group-D', 'group-F', 'group-Q'],
        true,
        true,
        true,
        '▸ F1',
        'line endings differ',
        undefined,
      ]);
    });

    test('full view shows the body, each option and the recommendation', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      await view(ui, 'full');
      expect([
        (await ui.find({ type: 'Text', text: 'full body text' })) !== undefined,
        (await ui.find({ type: 'Text', text: 'keep LF' })) !== undefined,
        (await ui.find({ type: 'Text', text: 'regenerate' })) !== undefined,
        (await ui.find({ key: 'answer-Q1-a' }))?.props.label,
        (await ui.find({ type: 'Text', text: 'Recommended: a - cheaper' })) !== undefined,
      ]).toEqual([
        true,
        true,
        true,
        'a',
        true,
      ]);
    });

    test('full view starts the body under the title, not at the first column', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      await view(ui, 'full');
      const titleColumn = (await ui.find({ key: 'cell-code-Q1' }))?.props.width + (await ui.find({ key: 'cell-status-Q1' }))?.props.width;
      expect((await ui.find({ key: 'body-Q1' }))?.props.paddingLeft).toBe(titleColumn);
      expect((await ui.find({ key: 'body-Q1' }))?.text).toContain('keep LF');
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
      await endTurn($);
      const ui = await $.ui.mount({ plugin: 'katharsis', surface, component: 'Pane', requestId: 'kdrawer', props: { ...paneProps, bodyColumns: 52 } });
      await ui.press({ key: 'filter' });
      await ui.press({ key: 'filter-AT' });
      expect((await ui.find({ key: 'filter' }))?.props.label).toBe('Filter: AT ▾');
    });

    test('pressing a row or the View button closes the filter menu', async ($, on) => {
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

    test('the View menu switches between short and full views', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      expect([
        (await ui.find({ key: 'view' }))?.props.label,
        await ui.find({ type: 'Text', text: 'full body text' }),
        await ui.find({ type: 'Text', text: 'keep LF' }),
        (await ui.find({ key: 'pick-Q1' }))?.props.label,
      ]).toEqual([
        'View: short ▾',
        undefined,
        undefined,
        '▸ Q1',
      ]);
      await ui.press({ key: 'view' });
      expect((await ui.find({ key: 'view' }))?.props.label).toBe('View: short ▴');
      expect((await ui.findAll({ type: 'Button' })).filter((b) => b.key?.startsWith('view-')).map((b) => b.key)).toEqual(['view-short', 'view-full', 'view-current', 'view-settings']);
      await ui.press({ key: 'view-full' });
      expect(await ui.find({ key: 'view-list' })).toBeUndefined();
      expect((await ui.find({ key: 'view' }))?.props.label).toBe('View: full ▾');
      expect(await ui.find({ type: 'Text', text: 'full body text' })).toBeDefined();
      await view(ui, 'short');
      expect(await ui.find({ type: 'Text', text: 'full body text' })).toBeUndefined();
    });

    test('the View menu closes when the filter opens or a row is pressed', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      await ui.press({ key: 'view' });
      await ui.press({ key: 'filter' });
      expect(await ui.find({ key: 'view-list' })).toBeUndefined();
      await ui.press({ key: 'view' });
      expect(await ui.find({ key: 'filter-list' })).toBeUndefined();
      await ui.press({ key: 'pick-F1' });
      expect(await ui.find({ key: 'view-list' })).toBeUndefined();
    });

    test('pressing a row in short view opens its card, and again closes it', async ($, on) => {
      world(on);
      const ui = await mountPane($, surface);
      await ui.press({ key: 'pick-Q1' });
      // The frame holds the row itself, so the card adds no header of its own.
      expect([
        (await ui.find({ key: 'card-Q1' }))?.text,
        await ui.find({ type: 'Text', text: '○ Q1 · Question 1' }),
        (await ui.find({ type: 'Text', text: 'keep LF' })) !== undefined,
        (await ui.find({ type: 'Text', text: 'Recommended: a - cheaper' })) !== undefined,
        (await ui.find({ key: 'pick-Q1' }))?.props.label,
      ]).toEqual([
        expect.stringMatching(/^▾ Q1 ?○ ?which fixture ships\?/),
        undefined,
        true,
        true,
        '▾ Q1',
      ]);
      // The row already shows the title, so the card does not repeat it.
      expect(await ui.findAll({ type: 'Text', text: 'which fixture ships?' })).toHaveLength(1);
      await ui.press({ key: 'pick-Q1' });
      expect(await ui.find({ key: 'card-Q1' })).toBeUndefined();
      expect(await ui.find({ type: 'Text', text: 'keep LF' })).toBeUndefined();
    });
  });
}

describe('answering from the drawer', () => {
  const card = async ($: Engine) => {
    const ui = await mountPane($, 'terminal');
    await ui.press({ key: 'pick-Q1' });
    return ui;
  };
  const AS_USER = { kind: 'plugin', name: 'katharsis', asUser: true };
  const sent = (w: World) => w.submitted.map((s) => s.text);
  // Claude Code runs none of Katharsis's prompt.submit hooks on a prompt it
  // submits, so the drawer records the answer row itself.
  const recorded = (w: World) =>
    (w.files.get(`${DATA}/answers/${SID}.jsonl`) ?? '')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const r = JSON.parse(l);
        return `${r.code} ${r.letter} ${r.how}`;
      });

  describe('picking and sending one answer', () => {
    test('an option picks its letter, and send posts it as the person\'s message', async ($, on) => {
      const w = world(on);
      const ui = await card($);
      await ui.press({ key: 'answer-Q1-b' });
      expect([
        w.submitted,
        (await ui.find({ key: 'answer-Q1-b' }))?.props.label,
        (await ui.find({ key: 'answer-Q1-b' }))?.props.variant,
        (await ui.find({ type: 'Text', text: 'sends: Q1 b' })) !== undefined,
      ]).toEqual([
        [],
        '✓ b',
        'primary',
        true,
      ]);
      await ui.press({ key: 'send-Q1' });
      expect(w.submitted).toEqual([{ text: 'Q1 b', origin: AS_USER }]);
      expect(recorded(w)).toEqual(['Q1 b code']);
      expect(await ui.find({ key: 'send-Q1' })).toBeUndefined();
    });

    test('a note goes after the letter, and a note alone is an own answer', async ($, on) => {
      const w = world(on);
      const ui = await card($);
      expect((await ui.find({ key: 'note-Q1' }))?.props.label).toBe('Own answer');
      await ui.input({ key: 'note-Q1', text: '  keep both fixtures ', kind: 'change' });
      expect(await ui.find({ type: 'Text', text: 'sends: Q1 z keep both fixtures' })).toBeDefined();
      await ui.press({ key: 'answer-Q1-b' });
      expect((await ui.find({ key: 'note-Q1' }))?.props.label).toBe('Note');
      await ui.press({ key: 'send-Q1' });
      expect(sent(w)).toEqual(['Q1 b keep both fixtures']);
      expect(recorded(w)).toEqual(['Q1 b code']);
    });

    test('a note with no letter picked is sent as an own answer by Enter in the field', async ($, on) => {
      const w = world(on);
      const ui = await card($);
      await ui.input({ key: 'note-Q1', text: 'neither' });
      expect(sent(w)).toEqual(['Q1 z neither']);
      expect(recorded(w)).toEqual(['Q1 z own']);
    });

    test('pressing the picked option again unpicks it, and another option swaps it', async ($, on) => {
      const w = world(on);
      const ui = await card($);
      await ui.press({ key: 'answer-Q1-a' });
      await ui.press({ key: 'answer-Q1-b' });
      expect((await ui.find({ key: 'answer-Q1-a' }))?.props.label).toBe('a');
      await ui.press({ key: 'answer-Q1-b' });
      expect(await ui.find({ type: 'Text', text: 'nothing picked yet' })).toBeDefined();
      await ui.press({ key: 'send-Q1' });
      expect(w.submitted).toEqual([]);
      expect(w.toasts).toEqual(['Pick an option or write your own answer to Q1 first']);
    });

    test('dismiss puts a dash before the note, since a word after x reads as prose', async ($, on) => {
      const w = world(on);
      const ui = await card($);
      await ui.press({ key: 'answer-Q1-x' });
      expect((await ui.find({ key: 'answer-Q1-x' }))?.props.label).toBe('✓ dismiss');
      await ui.input({ key: 'note-Q1', text: 'Cancel the nightly build' });
      expect(sent(w)).toEqual(['Q1 x - Cancel the nightly build']);
      expect(recorded(w)).toEqual(['Q1 x dismissed']);
    });

    test('send leaves the prompt box alone and shows the question answered', async ($, on) => {
      const w = world(on);
      w.box = 'half a thought';
      const ui = await card($);
      await ui.press({ key: 'answer-Q1-a' });
      await ui.input({ key: 'note-Q1', text: 'ship it', kind: 'change' });
      await ui.press({ key: 'send-Q1' });
      expect([
        sent(w),
        w.box,
        await ui.find({ key: 'note-Q1' }),
        (await ui.find({ type: 'Text', text: 'a. keep LF' })) !== undefined,
      ]).toEqual([
        ['Q1 a ship it'],
        'half a thought',
        undefined,
        true,
      ]);
    });

    test('a second send while the first enters posts nothing more', async ($, on) => {
      const w = world(on);
      const ui = await card($);
      await ui.press({ key: 'answer-Q1-a' });
      await Promise.all([ui.press({ key: 'send-Q1' }), ui.press({ key: 'send-Q1' })]);
      expect(sent(w)).toEqual(['Q1 a']);
      expect(recorded(w)).toEqual(['Q1 a code']);
      expect(w.toasts).toEqual([]);
    });

    test('two questions sent at once both get their answer row', async ($, on) => {
      const opts = [{ key: 'a', text: 'yes' }, { key: 'b', text: 'no' }];
      const w = world(on, { rows: [row('Q1', 'which fixture ships?', { options: opts }), row('Q2', 'rename the flag?', { options: opts })] });
      const ui = await mountPane($, 'terminal');
      let release = () => {};
      w.submitHold = new Promise((r) => (release = r));
      await ui.press({ key: 'pick-Q1' });
      await ui.press({ key: 'answer-Q1-a' });
      const first = ui.press({ key: 'send-Q1' });
      await ui.press({ key: 'pick-Q2' });
      await ui.press({ key: 'answer-Q2-b' });
      const second = ui.press({ key: 'send-Q2' });
      release();
      await Promise.all([first, second]);
      expect(recorded(w).sort()).toEqual(['Q1 a code', 'Q2 b code']);
    });

    test('a send that fails keeps a pick made while it was out', async ($, on) => {
      const w = world(on);
      const ui = await card($);
      await ui.press({ key: 'answer-Q1-a' });
      let release = () => {};
      w.submitHold = new Promise((r) => (release = r));
      w.dropSubmit = true;
      const out = ui.press({ key: 'send-Q1' });
      await ui.press({ key: 'answer-Q1-b' });
      release();
      await out;
      expect((await ui.find({ key: 'answer-Q1-b' }))?.props.label).toBe('✓ b');
      expect((await ui.find({ key: 'answer-Q1-a' }))?.props.label).toBe('a');
    });

    test('a send that fails keeps the pick when only the note changed while it was out', async ($, on) => {
      const w = world(on);
      const ui = await card($);
      await ui.press({ key: 'answer-Q1-a' });
      await ui.input({ key: 'note-Q1', text: 'foo', kind: 'change' });
      let release = () => {};
      w.submitHold = new Promise((r) => (release = r));
      w.dropSubmit = true;
      const out = ui.press({ key: 'send-Q1' });
      await ui.input({ key: 'note-Q1', text: 'bar', kind: 'change' });
      release();
      await out;
      expect(await ui.find({ type: 'Text', text: 'sends: Q1 a bar' })).toBeDefined();
    });

    test('the row records the text that entered, under the session the send started in', async ($, on) => {
      const w = world(on);
      const ui = await card($);
      await ui.press({ key: 'answer-Q1-a' });
      // A /clear lands once the send has reached the session.
      w.submitHold = { then: (go: () => void) => ((w.sid = 'after-clear'), go()) } as unknown as Promise<void>;
      w.rewrite = 'Q1 b';
      await ui.press({ key: 'send-Q1' });
      expect(recorded(w)).toEqual(['Q1 b code']);
      expect(w.files.has(`${DATA}/answers/after-clear.jsonl`)).toBe(false);
    });

    test('a send pressed after /clear goes out while the old session\'s send is still out', async ($, on) => {
      const w = world(on);
      const ui = await card($);
      await ui.press({ key: 'answer-Q1-a' });
      let release = () => {};
      w.submitHold = new Promise((r) => (release = r));
      const out = ui.press({ key: 'send-Q1' });
      await $.session.end({ reason: 'clear', sessionId: SID, resume: { id: SID } } as never);
      w.sid = 's2';
      w.files.set(`${PROJ}/s2.jsonl`, w.files.get(`${PROJ}/${SID}.jsonl`)!.replaceAll(SID, 's2'));
      await ui.unmount();
      const next = await card($);
      await next.press({ key: 'answer-Q1-b' });
      const second = next.press({ key: 'send-Q1' });
      release();
      await Promise.all([out, second]);
      expect(sent(w).sort()).toEqual(['Q1 a', 'Q1 b']);
    });

    test('a note the parser would read as another answer is not sent', async ($, on) => {
      const opts = [{ key: 'a', text: 'yes' }, { key: 'b', text: 'no' }];
      const w = world(on, { rows: [row('Q1', 'which fixture ships?', { options: opts }), row('Q2', 'rename the flag?', { options: opts })] });
      const ui = await card($);
      await ui.input({ key: 'note-Q1', text: 'see, Q2 b' });
      expect(w.submitted).toEqual([]);
      expect(w.toasts).toEqual(['Katharsis would not read "Q1 z see, Q2 b" as one answer to Q1: reword the note']);
    });
  });

  describe('the answering bar and the queue', () => {
    const HINT = 'Pick an option, add a note or write your own answer, then send. Send posts it as your next message.';
    const three = (on: On) => {
      const opts = [{ key: 'a', text: 'yes' }, { key: 'b', text: 'no' }];
      return world(on, { rows: ['Q1', 'Q2', 'Q3'].map((c) => row(c, `question ${c}?`, { options: opts })) });
    };

    test('the answering hint shows once, under the heading, while a question\'s body shows', async ($, on) => {
      three(on);
      const ui = await mountPane($, 'terminal');
      expect(await ui.find({ key: 'answer-hint' })).toBeUndefined();
      await ui.press({ key: 'pick-Q1' });
      expect(await ui.findAll({ type: 'Text', text: HINT })).toHaveLength(1);
      expect((await ui.find({ key: 'card-Q1' }))?.text).not.toContain('Pick an option');
      await view(ui, 'full');
      expect(await ui.findAll({ type: 'Text', text: HINT })).toHaveLength(1);
    });

    test('the queue counts answered questions and sends them all as one message', async ($, on) => {
      const w = three(on);
      const ui = await mountPane($, 'terminal');
      await ui.press({ key: 'pick-Q1' });
      expect(await ui.find({ key: 'answer-queue' })).toBeUndefined();
      await ui.press({ key: 'answer-Q1-a' });
      expect(await ui.find({ key: 'answer-queue' })).toBeUndefined();
      await ui.press({ key: 'pick-Q3' });
      await ui.input({ key: 'note-Q3', text: 'keep it', kind: 'change' });
      expect(await ui.find({ type: 'Text', text: '2 of 3 answered' })).toBeDefined();
      expect((await ui.find({ key: 'answer-queue-send' }))?.props.label).toBe('send 2');
      expect(await ui.find({ type: 'Text', text: 'sends: Q1 Q3' })).toBeDefined();
      await ui.press({ key: 'answer-queue-send' });
      expect(sent(w)).toEqual(['Q1 a\nQ3 z keep it']);
      expect(recorded(w)).toEqual(['Q1 a code', 'Q3 z own']);
      expect(await ui.find({ key: 'answer-queue' })).toBeUndefined();
    });

    test('a card\'s send posts only its own question and leaves the others picked', async ($, on) => {
      const w = three(on);
      const ui = await mountPane($, 'terminal');
      await ui.press({ key: 'pick-Q1' });
      await ui.press({ key: 'answer-Q1-a' });
      await ui.press({ key: 'pick-Q2' });
      await ui.press({ key: 'answer-Q2-b' });
      await ui.press({ key: 'pick-Q3' });
      await ui.press({ key: 'answer-Q3-a' });
      await ui.press({ key: 'pick-Q2' });
      await ui.press({ key: 'send-Q2' });
      expect(sent(w)).toEqual(['Q2 b']);
      expect(await ui.find({ type: 'Text', text: '2 of 2 answered' })).toBeDefined();
      await ui.press({ key: 'pick-Q3' });
      await ui.press({ key: 'send-Q3' });
      expect(await ui.find({ key: 'answer-queue' })).toBeUndefined();
      await ui.press({ key: 'pick-Q1' });
      expect((await ui.find({ key: 'answer-Q1-a' }))?.props.label).toBe('✓ a');
    });

    test('the queue sends nothing when one note would read as another answer', async ($, on) => {
      const w = three(on);
      const ui = await mountPane($, 'terminal');
      await ui.press({ key: 'pick-Q2' });
      await ui.press({ key: 'answer-Q2-b' });
      await ui.press({ key: 'pick-Q1' });
      await ui.input({ key: 'note-Q1', text: 'see, Q3 a', kind: 'change' });
      await ui.press({ key: 'answer-queue-send' });
      expect(w.submitted).toEqual([]);
      expect(w.toasts).toEqual(['Katharsis would not read "Q1 z see, Q3 a" as one answer to Q1: reword the note']);
    });

    test('a send the session refuses or loses keeps the pick and note and says what to type', async ($, on) => {
      const w = world(on);
      const ui = await card($);
      await ui.press({ key: 'answer-Q1-b' });
      await ui.input({ key: 'note-Q1', text: 'later', kind: 'change' });
      w.dropSubmit = true;
      await ui.press({ key: 'send-Q1' });
      w.dropSubmit = false;
      w.submitThrows = true;
      await ui.press({ key: 'send-Q1' });
      expect([
        w.submitted,
        recorded(w),
        w.toasts,
        (await ui.find({ key: 'answer-Q1-b' }))?.props.label,
        (await ui.find({ key: 'note-Q1' }))?.props.value,
      ]).toEqual([
        [],
        [],
        ['Katharsis could not send Q1: type Q1 b later and press Enter instead', 'Katharsis could not send Q1: type Q1 b later and press Enter instead'],
        '✓ b',
        'later',
      ]);
    });

    test('an answered question shows its options as text with no buttons', async ($, on) => {
      const w = world(on);
      w.files.set(`${DATA}/answers/${SID}.jsonl`, '{"ts":"t","code":"Q1","letter":"a","how":"code"}\n');
      const ui = await card($);
      expect([
        (await ui.find({ type: 'Text', text: 'a. keep LF' })) !== undefined,
        await ui.find({ key: 'answer-Q1-a' }),
        await ui.find({ key: 'note-Q1' }),
        await ui.find({ key: 'send-Q1' }),
      ]).toEqual([
        true,
        undefined,
        undefined,
        undefined,
      ]);
    });
  });
});

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
    await endTurn($);
    return w;
  };
  const texts = async (ui: Awaited<ReturnType<typeof pane>>, keys: string[]) =>
    Promise.all(keys.map(async (k) => (await ui.find({ key: k }))?.text));
  const status = async (ui: Awaited<ReturnType<typeof pane>>, show: string) => {
    await ui.press({ key: 'show' });
    await ui.press({ key: `status-${show}` });
  };

  describe('glyphs and the Status menu', () => {
    test('every row carries a glyph: a circle while open, a check or a cross once resolved', async ($, on) => {
      await setup($, on);
      const ui = await pane($);
      expect([
        await texts(ui, ['cell-status-Q1', 'cell-status-Q3', 'cell-status-Q4', 'cell-status-NA1', 'cell-status-NA2', 'cell-status-R1']),
        (await ui.find({ key: 'cell-status-Q1' }))?.children[0]?.props.color,
        (await ui.find({ key: 'cell-status-Q3' }))?.children[0]?.props.color,
      ]).toEqual([['✓', '✗', '✓', '✓', '✗', '✗'], 'success', 'error']);
      // An open row, and a type that never closes, carry a grey circle.
      for (const c of ['Q2', 'NA3', 'R2', 'F1', 'AT1']) {
        const cell = await ui.find({ key: `cell-status-${c}` });
        expect([cell?.text, cell?.props.width, cell?.children[0]?.props.dimColor]).toEqual(['○', 2, true]);
      }
      expect((await ui.find({ key: 'cell-code-NA1' }))?.props.width).toBe(7);
      expect((await ui.find({ key: 'cell-title-NA1' }))?.props).toMatchObject({ flexGrow: 1, flexShrink: 1, minWidth: 0 });
      expect((await ui.find({ type: 'Text', text: 'backfill the test' }))?.props.wrap).toBe('wrap');
    });

    test('a band popup row carries the drawer row\'s glyph, in its color, ahead of the code', BAND_ON, async ($, on) => {
      await setup($, on);
      const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 20 } });
      const cell = async (c: string) => (await ui.find({ key: `reveal-glyph-${c}` }))?.children[0]?.props;
      expect([
        await texts(ui as never, ['reveal-glyph-Q1', 'reveal-glyph-Q2', 'reveal-glyph-Q3']),
        (await cell('Q1'))?.color,
        (await cell('Q2'))?.dimColor,
        (await cell('Q3'))?.color,
      ]).toEqual([
        ['✓', '○', '✗'],
        'success',
        true,
        'error',
      ]);
      expect((await ui.find({ key: 'reveal-Q1' }))?.props.label).not.toContain('✓');
    });

    test('a long title in a band popup is cut to fit beside the glyph', BAND_ON, async ($, on) => {
      world(on, { rows: [row('F1', 'a title far too long to fit in a popup forty columns wide')] });
      const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 40 } });
      const label: string = (await ui.find({ key: 'reveal-F1' }))?.props.label;
      // Border, padding, and the glyph cell take 6 of the 40 columns.
      expect([label.length, label.endsWith('…')]).toEqual([34, true]);
    });

    test('the Status menu counts each setting and carries the key to the glyphs', async ($, on) => {
      await setup($, on);
      const ui = await pane($);
      expect(await ui.find({ key: 'status-list' })).toBeUndefined();
      await ui.press({ key: 'show' });
      expect([
        (await ui.find({ key: 'show' }))?.props.label,
        (await ui.find({ key: 'status-all' }))?.props.label,
        (await ui.find({ key: 'status-open' }))?.props.label,
        (await ui.find({ key: 'status-resolved' }))?.props.label,
      ]).toEqual([
        'Status: all ▴',
        expect.stringMatching(/^● all +12$/),
        expect.stringMatching(/^ {2}open +3$/),
        expect.stringMatching(/^ {2}resolved +6$/),
      ]);
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

    test('a band title opens its item under Status resolved', BAND_ON, async ($, on) => {
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
      await view(ui, 'full');
      await ui.press({ key: 'clear' });
      expect((await ui.find({ key: 'show' }))?.props.label).toBe('Status: open ▾');
      await ui.unmount();
      await $.command.run({ ...RUN, command: 'kdrawer', args: '' });
      const again = await pane($);
      expect((await again.find({ key: 'show' }))?.props.label).toBe('Status: open ▾');
      expect((await again.find({ key: 'view' }))?.props.label).toBe('View: short ▾');
      expect(await rowCodes(again)).toEqual(['NA3', 'Q2', 'R2']);
    });
  });

  describe('menus in a narrow or inline drawer', () => {
    test('a header too narrow for one line wraps, and the filter menu drops below it', async ($, on) => {
      await setup($, on);
      const ui = await pane($, 48);
      await ui.press({ key: 'filter' });
      expect((await ui.find({ key: 'filter' }))?.props.label).toBe('Filter: all ▴');
      expect((await ui.find({ key: 'filter-list' }))?.props.top).toBe(3);
    });

    const root = async (ui: Awaited<ReturnType<typeof pane>>) =>
      (await ui.findAll({ type: 'Box' })).find((b) => b.props.minHeight !== undefined)?.props.minHeight;

    test('a Filter menu taller than the room of an inline drawer splits into columns, none empty, and the drawer grows to its foot', async ($, on) => {
      await setup($, on);
      const ui = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: { ...paneProps, scroll: { offset: 0, bodyRows: 6 } } });
      await ui.press({ key: 'filter' });
      const columns = (await ui.findAll({ type: 'Box' })).filter((b) => b.key?.startsWith('filter-column-'));
      expect(columns.length).toBeGreaterThan(1);
      const counts = (await ui.findAll({ type: 'Button' })).filter((b) => b.key?.startsWith('filter-') && b.key !== 'filter').length;
      for (const c of columns) expect(c.children.length).toBeGreaterThan(0);
      const perColumn = Math.ceil(counts / columns.length);
      expect(await root(ui)).toBe((await ui.find({ key: 'filter-list' }))?.props.top + perColumn + 2);
    });

    test('a Filter choice wider than a narrow drawer is cut to one row, so the drawer grows to the menu foot', async ($, on) => {
      await setup($, on);
      const ui = await pane($, 24);
      await ui.press({ key: 'filter' });
      const columns = (await ui.findAll({ type: 'Box' })).filter((b) => b.key?.startsWith('filter-column-'));
      const choices = (await ui.findAll({ type: 'Button' })).filter((b) => b.key?.startsWith('filter-') && b.key !== 'filter');
      for (const b of choices) expect(b.props.label.length).toBeLessThanOrEqual(columns[0]?.props.width);
      expect(await root(ui)).toBe((await ui.find({ key: 'filter-list' }))?.props.top + Math.ceil(choices.length / columns.length) + 2);
    });

    test('the drawer grows to the foot of the Status menu when a legend line wraps', async ($, on) => {
      await setup($, on);
      const ui = await pane($, 36);
      await ui.press({ key: 'show' });
      const shows = (await ui.findAll({ type: 'Button' })).filter((b) => b.key?.startsWith('status-')).length;
      // At 36 columns the legend has 30 for text, so "dismissed, dropped, or withdrawn" takes two rows.
      expect(await root(ui)).toBe((await ui.find({ key: 'status-list' }))?.props.top + shows + 5 + 3);
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

    test('a narrow View menu cuts the description and keeps each view name whole', async ($, on) => {
      await setup($, on);
      const ui = await pane($, 30);
      await ui.press({ key: 'view' });
      const menu = await ui.find({ key: 'view-list' });
      expect(menu?.props.left + menu?.props.width).toBeLessThanOrEqual(30);
      const labels = (await ui.findAll({ type: 'Button' })).filter((b) => b.key?.startsWith('view-')).map((b) => b.props.label as string);
      expect(labels.map((l) => l.replace('●', ' ').trim().split(/\s+/)[0])).toEqual(['short', 'full', 'current', 'settings']);
      for (const l of labels) expect(l.length).toBeLessThanOrEqual(menu?.props.width - 4);
      expect(labels[2]).toContain('…');
    });
  });
});

describe('settings view', () => {
  const engine = { plugin: 'engine', tier: 'core' } as const;
  const own = { plugin: 'katharsis@inline', tier: 'user' } as const;
  // /config's rows as config.list answers them: the engine's, Katharsis's
  // own, and another plugin's.
  const OPTIONS = [
    { key: 'outputStyle', label: 'Output style', kind: 'choice', value: 'katharsis', options: ['default', 'katharsis'], provider: engine, isLocked: false },
    { key: 'katharsis.autonomy', label: 'Autonomy level', description: 'How much the model may do unasked', kind: 'choice', value: 'guided', options: ['guided', 'standard', 'autonomous'], provider: own, isLocked: false },
    { key: 'katharsis.band', label: 'Band', kind: 'boolean', value: false, provider: own, isLocked: false },
    { key: 'katharsis.pinned', label: 'Pinned', kind: 'boolean', value: true, provider: own, isLocked: true },
    { key: 'katharsis.note', label: 'Note', kind: 'text', value: 'hi', provider: own, isLocked: false },
    { key: 'other.thing', label: 'Other plugin', kind: 'boolean', value: true, provider: { plugin: 'other', tier: 'user' }, isLocked: false },
  ];

  type Config = { rows: typeof OPTIONS; sets: { key: string; value: unknown }[]; lists: number; deny?: string };

  function config(on: On, deny?: string): Config {
    const c: Config = { rows: OPTIONS.map((r) => ({ ...r })), sets: [], lists: 0, deny };
    on('config.list', () => {
      c.lists += 1;
      return { value: c.rows } as never;
    });
    on('config.set', (_$, e) => {
      c.sets.push({ key: e.key, value: e.value });
      if (c.deny) return { deny: c.deny };
      const r = c.rows.find((o) => o.key === e.key);
      if (r) r.value = e.value as never;
      return { value: e.value };
    });
    return c;
  }

  // The rows load after the press that picks the view.
  const settle = () => new Promise((r) => setTimeout(r, 10));

  async function settingsPane($: Engine) {
    const ui = await mountPane($, 'terminal');
    await view(ui, 'settings');
    await settle();
    return ui;
  }

  const optionKeys = async (ui: { findAll: (q: { type?: string }) => Promise<{ key: string | undefined }[]> }) =>
    (await ui.findAll({ type: 'Box' })).map((b) => b.key ?? '').filter((k) => /^option-[^-]+$/.test(k)).map((k) => k.slice(7));

  test('lists only Katharsis\'s own options, and hides the controls that act on the list', async ($, on) => {
    world(on);
    config(on);
    const ui = await settingsPane($);
    const hidden = await Promise.all(['q', 'filter', 'show', 'clear'].map(async (key) => (await ui.find({ key })) === undefined));
    expect([
      await optionKeys(ui),
      (await ui.find({ key: 'view' }))?.props.label,
      hidden,
      await rowCodes(ui),
      (await ui.find({ type: 'Text', text: 'How much the model may do unasked' })) !== undefined,
    ]).toEqual([['katharsis.autonomy', 'katharsis.band', 'katharsis.pinned', 'katharsis.note'], 'View: settings ▾', [true, true, true, true], [], true]);
  });

  test('marks the current value, and pressing it again sets nothing', async ($, on) => {
    world(on);
    const c = config(on);
    const ui = await settingsPane($);
    const guided = await ui.find({ key: 'option-katharsis.autonomy-guided' });
    expect([
      guided?.props.label,
      guided?.props.variant,
      (await ui.find({ key: 'option-katharsis.autonomy-standard' }))?.props.variant,
      (await ui.find({ key: 'option-katharsis.band-off' }))?.props.label,
    ]).toEqual([
      '✓ guided',
      'primary',
      undefined,
      '✓ off',
    ]);
    await ui.press({ key: 'option-katharsis.autonomy-guided' });
    await settle();
    expect(c.sets).toEqual([]);
  });

  test('pressing a value sets the option as /config would and lists the rows again', async ($, on) => {
    world(on);
    const c = config(on);
    const ui = await settingsPane($);
    const lists = c.lists;
    await ui.press({ key: 'option-katharsis.autonomy-standard' });
    await settle();
    await ui.press({ key: 'option-katharsis.band-on' });
    await settle();
    expect([
      c.sets,
      c.lists,
      (await ui.find({ key: 'option-katharsis.autonomy-standard' }))?.props.label,
      (await ui.find({ key: 'option-katharsis.band-on' }))?.props.label,
    ]).toEqual([
      [{ key: 'katharsis.autonomy', value: 'standard' }, { key: 'katharsis.band', value: true }],
      lists + 2,
      '✓ standard',
      '✓ on',
    ]);
  });

  test('a refused change says why in a toast and lists the rows as they stand', async ($, on) => {
    const w = world(on);
    const c = config(on, 'held by policy');
    const ui = await settingsPane($);
    const lists = c.lists;
    await ui.press({ key: 'option-katharsis.autonomy-standard' });
    await settle();
    expect(w.toasts).toEqual(['Katharsis could not change Autonomy level: held by policy']);
    expect(c.lists).toBe(lists + 1);
    expect((await ui.find({ key: 'option-katharsis.autonomy-guided' }))?.props.label).toBe('✓ guided');
  });

  test('a locked option, or one with no fixed values, shows its value and no buttons', async ($, on) => {
    world(on);
    config(on);
    const ui = await settingsPane($);
    expect(await ui.find({ type: 'Text', text: 'on · locked by a managed setting' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: 'hi · change it in /config' })).toBeDefined();
    const buttons = (await ui.findAll({ type: 'Button' })).map((b) => b.key ?? '');
    expect(buttons.filter((k) => k.startsWith('option-katharsis.pinned-') || k.startsWith('option-katharsis.note-'))).toEqual([]);
  });

  test('picking a view and finishing a turn write both to the session state', async ($, on) => {
    world(on);
    config(on);
    const sets: { key: string; value: unknown }[] = [];
    on('state.set', (_$, e, next) => {
      sets.push({ key: e.key, value: e.value });
      return next(e);
    });
    const ui = await settingsPane($);
    expect(sets).toContainEqual({ key: 'view', value: 'settings' });
    await $.turn.complete({ answer: 'Per F2.', isAborted: false } as never);
    expect(sets).toContainEqual({ key: 'lastAnswer', value: 'Per F2.' });
    await view(ui, 'short');
    expect(sets.at(-1)).toEqual({ key: 'view', value: 'short' });
  });

  test('session start, which a reload raises again, puts the settings view back', async ($, on) => {
    world(on);
    config(on);
    // A hook on state.get takes the kit's place, so it answers every key.
    on('state.get', (_$, e) => ({ value: e.key === 'view' ? { value: 'settings', version: 1 } : { value: undefined, version: 0 } }));
    await $.session.start(START);
    const ui = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect((await ui.find({ key: 'view' }))?.props.label).toBe('View: settings ▾');
    expect(await optionKeys(ui)).toContain('katharsis.autonomy');
  });

  test('session start puts the last reply back, so view current still lists its codes', async ($, on) => {
    world(on);
    const state: Record<string, unknown> = { view: 'current', lastAnswer: 'Per F2.' };
    on('state.get', (_$, e) => ({ value: { value: state[e.key], version: 1 } }));
    // Session start loads the ledger, and a finished turn would replace the
    // restored reply, so the pane mounts with no turn after the start.
    await $.session.start(START);
    const ui = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
    expect((await ui.find({ key: 'view' }))?.props.label).toBe('View: current ▾');
    expect(await ui.find({ type: 'Text', text: /Codes this turn · 1/ })).toBeDefined();
  });

  test('session start puts Status back', async ($, on) => {
    world(on);
    on('state.get', (_$, e) => ({ value: { value: e.key === 'show' ? 'open' : undefined, version: 1 } }));
    await $.session.start(START);
    const ui = await mountPane($, 'terminal');
    expect((await ui.find({ key: 'show' }))?.props.label).toBe('Status: open ▾');
  });

  test('session start finds the drawer still up, so the band leaves out its hover lists', BAND_ON, async ($, on) => {
    world(on);
    on('state.get', () => ({ value: { value: undefined, version: 0 } }));
    on('ui.panes', () => ({ value: [{ id: 'kdrawer', title: 'Katharsis', isShown: true, isFocused: false, isPlaced: true }] }) as never);
    await $.session.start(START);
    const ui = await $.ui.mount(BAND);
    expect(await ui.find({ key: 'band-head' })).toBeDefined();
    expect(await ui.find({ key: 'reveal-F' })).toBeUndefined();
  });

  test('a /clear during the restore keeps the new session on the short view', async ($, on) => {
    world(on);
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    on('state.get', async (_$, e) => {
      await held;
      return { value: { value: e.key === 'view' ? 'settings' : undefined, version: 1 } };
    });
    const start = $.session.start(START);
    await settle();
    await $.session.end({ reason: 'clear', sessionId: SID, resume: { id: SID } } as never);
    release();
    await start;
    const ui = await mountPane($, 'terminal');
    expect((await ui.find({ key: 'view' }))?.props.label).toBe('View: short ▾');
  });

  test('a press writes the view, the last reply, and Status before it sets the option', async ($, on) => {
    world(on);
    const order: string[] = [];
    on('state.set', async (_$, e, next) => {
      await settle();
      const r = await next(e);
      order.push(e.key);
      return r;
    });
    on('config.set', (_$, e) => {
      order.push('config');
      return { value: e.value };
    });
    on('config.list', () => ({ value: OPTIONS }) as never);
    const ui = await settingsPane($);
    order.length = 0;
    await ui.press({ key: 'option-katharsis.autonomy-standard' });
    await settle();
    await settle();
    expect(order.slice(0, 3).sort()).toEqual(['lastAnswer', 'show', 'view']);
    expect(order[3]).toBe('config');
  });

  test('a /clear writes Status to the new session, so a later reload keeps it', async ($, on) => {
    world(on);
    const written: Record<string, unknown> = {};
    on('state.set', (_$, e, next) => {
      written[e.key] = e.value;
      return next(e);
    });
    on('state.get', (_$, e) => ({ value: { value: e.key === 'show' ? 'open' : undefined, version: 1 } }));
    await $.session.start(START);
    await $.session.end({ reason: 'clear', sessionId: SID, resume: { id: SID } } as never);
    await settle();
    expect(written.show).toBe('open');
  });
});
