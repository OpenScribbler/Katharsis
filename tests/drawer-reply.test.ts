// Tests for what the drawer draws in and under a reply: the links, the chip rows, the
// Still open row, and a user step's command block, run by `claude plugin test .`.

import { describe, expect, test } from 'claude-code/testing';
import type { Engine } from 'claude-code/testing';
import { BAND, BAND_ON, DATA, endTurn, jsonl, mountPane, paneProps, PARENT, PROJ, type Row, row, rowCodes, RUN, SID, view, world } from './drawer-world.ts';

describe('reply chips', () => {
  const reply = (text: string) =>
    ({ plugin: 'katharsis', surface: 'terminal', component: 'AssistantMessage', props: { text, isFirstOfReply: true } }) as const;

  describe('codes this turn and their links', () => {
    test('a reply citing codes on record gets a chip per cited code other than questions, alphabetical', async ($, on) => {
      world(on);
      await endTurn($);
      const ui = await $.ui.mount(reply('Per F1 and Q1 (and F1 again), after C1 and AT1, not Z9 or F7.'));
      const chips = (await ui.findAll({ type: 'Button' })).map((b) => b.key);
      expect(chips).toEqual(['chip-AT1', 'chip-C1', 'chip-F1']);
      expect(await ui.find({ type: 'Text', text: 'Codes this turn:' })).toBeDefined();
      // The hover card names the type, then the title and body.
      expect(await ui.find({ type: 'Text', text: '○ F1 · Finding 1' })).toBeDefined();
      expect(await ui.find({ type: 'Text', text: 'line endings differ' })).toBeDefined();
    });

    test('a reply loads the ledger itself, so chips draw after a reload with the band off', async ($, on) => {
      world(on);
      const ui = await $.ui.mount(reply('Per F1, after C1 and AT1.'));
      expect((await ui.findAll({ type: 'Button' })).map((b) => b.key)).toEqual(['chip-AT1', 'chip-C1', 'chip-F1']);
    });

    test('replies drawn together share one load and register /kdrawer once', async ($, on) => {
      const w = world(on);
      const uis = await Promise.all(['Per F1.', 'Per C1.', 'Per AT1.'].map((t) => $.ui.mount(reply(t))));
      expect(w.commands).toEqual(['kdrawer']);
      expect((await uis[2].findAll({ type: 'Button' })).map((b) => b.key)).toEqual(['chip-AT1']);
    });

    test('a session start and replies drawn beside it register /kdrawer once', async ($, on) => {
      const w = world(on);
      await Promise.all([$.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true } as never), $.ui.mount(reply('Per F1.')), $.ui.mount(reply('Per C1.'))]);
      expect(w.commands).toEqual(['kdrawer']);
    });

    test('a load still reading when /clear lands writes nothing, and the next drawing loads the new session', async ($, on) => {
      const w = world(on);
      let release = () => {};
      w.readHold = new Promise((r) => (release = r));
      const reading = new Promise<void>((r) => (w.onRead = r));
      const old = $.ui.mount(reply('Per F1.'));
      await reading;
      await $.session.end({ reason: 'clear', sessionId: SID, resume: { id: SID } } as never);
      w.sid = 's2';
      w.files.set(`${PROJ}/s2.jsonl`, jsonl([row('C7', 'the new session', { session_id: 's2' })]));
      const held = w.readHold;
      w.readHold = undefined;
      const first = await $.ui.mount(reply('Per F1 and C7.'));
      expect((await first.findAll({ type: 'Button' })).map((b) => b.key)).toEqual(['chip-C7']);
      release();
      await held;
      await old;
      const after = await $.ui.mount(reply('Per F1 and C7.'));
      expect((await after.findAll({ type: 'Button' })).map((b) => b.key)).toEqual(['chip-C7']);
    });

    test('a load that /clear overtook, finishing late, leaves the newer load shared', async ($, on) => {
      const w = world(on);
      const s2 = `${PROJ}/s2.jsonl`;
      let release = () => {};
      w.readHold = new Promise((r) => (release = r));
      const reading = new Promise<void>((r) => (w.onRead = r));
      const old = $.ui.mount(reply('Per F1.'));
      await reading;
      await $.session.end({ reason: 'clear', sessionId: SID, resume: { id: SID } } as never);
      w.sid = 's2';
      w.files.set(s2, jsonl([row('C7', 'the new session', { session_id: 's2' })]));
      w.readHold = undefined;
      let releaseNew = () => {};
      const until = new Promise<void>((r) => (releaseNew = r));
      const reached = new Promise<void>((r) => (w.pathHold = { path: s2, until, reached: r }));
      w.reads = [];
      const second = $.ui.mount(reply('Per C7.'));
      await reached;
      // A mount settles only once every load is done, so these wait on time.
      const settle = () => new Promise((r) => setTimeout(r, 20));
      release();
      await settle();
      const third = $.ui.mount(reply('Per C7.'));
      await settle();
      releaseNew();
      await Promise.all([old, second, third]);
      expect(w.reads.filter((path) => path === s2)).toHaveLength(1);
    });

    test('a chip card at 80 columns moves left far enough to end at the screen edge', async ($, on) => {
      world(on);
      await endTurn($);
      const ui = await $.ui.mount(reply('Per F1, after C1 and AT1.'));
      // "Codes this turn:" starts at column 2, so AT1, C1 and F1 start at 19, 23 and 26.
      const cards = (await ui.findAll({ type: 'Box' })).filter((b) => b.props.position === 'absolute');
      expect(cards.map((b) => b.props.left + b.props.width)).toEqual([80 - 19, 80 - 23, 80 - 26]);
    });

    test('codes sort by number within a type, so F2 comes before F10', async ($, on) => {
      world(on, { rows: [row('F10', 'tenth'), row('F2', 'second'), row('D1', 'a decision')] });
      await endTurn($);
      const ui = await $.ui.mount(reply('F10, F2 and D1.'));
      expect((await ui.findAll({ type: 'Button' })).map((b) => b.key)).toEqual(['chip-D1', 'chip-F2', 'chip-F10']);
    });

    test('codes on record become links, outside code spans and fences', async ($, on) => {
      world(on);
      await endTurn($);
      const ui = await $.ui.mount(reply('Per F1, not Z9 or `F1`.\n```\nF1\n```\nQ1 stays open.'));
      const md = await ui.find({ key: 'reply-text' });
      expect(md?.props.text).toBe(
        'Per [F1](https://katharsis.invalid/F1/finding-1), not Z9 or `F1`.\n```\nF1\n```\n[Q1](https://katharsis.invalid/Q1/question-1) stays open.',
      );
      expect(await ui.find({ type: 'engine' })).toBeUndefined();
    });

    test('pressing an inline code opens the pane with that code open', async ($, on) => {
      const w = world(on);
      await endTurn($);
      const ui = await $.ui.mount(reply('See Q1.'));
      await ui.press({ key: 'reply-text', link: { href: 'https://katharsis.invalid/Q1/question-1' } });
      expect(w.opened).toEqual(['kdrawer']);
      const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
      expect(await rowCodes(pane)).toEqual(['Q1']);
      expect(await pane.find({ key: 'card-Q1' })).toBeDefined();
    });

    test('a reply too long for a Markdown element keeps the engine drawing', async ($, on) => {
      world(on);
      await endTurn($);
      const ui = await $.ui.mount(reply(`F1 ${'x'.repeat(10001)}`));
      expect(await ui.find({ type: 'engine' })).toBeDefined();
      expect(await ui.find({ key: 'chip-F1' })).toBeDefined();
    });

    test('a terminal Claude Code draws no links in keeps the engine drawing and the chips, so no URL shows', async ($, on) => {
      world(on, { env: { HOME: '/home/u', KATHARSIS_DATA: DATA, TERM_PROGRAM: 'herdr' } });
      await endTurn($);
      const ui = await $.ui.mount(reply('Per F1.'));
      expect(await ui.find({ type: 'engine' })).toBeDefined();
      expect(await ui.find({ key: 'reply-text' })).toBeUndefined();
      expect(await ui.find({ key: 'chip-F1' })).toBeDefined();
    });

    test('a failed environment read keeps the engine drawing for that reply and reads again for the next', async ($, on) => {
      let fail = true;
      const env: Record<string, string> = { HOME: '/home/u', KATHARSIS_DATA: DATA, TERM_PROGRAM: 'ghostty' };
      world(on, {
        env: (name) => {
          if (fail && name === 'TERM_PROGRAM') throw new Error('aborted');
          return env[name];
        },
      });
      await endTurn($);
      const first = await $.ui.mount(reply('Per F1.'));
      expect(await first.find({ type: 'engine' })).toBeDefined();
      expect(await first.find({ key: 'chip-F1' })).toBeDefined();
      fail = false;
      const second = await $.ui.mount(reply('Per F1.'));
      expect((await second.find({ key: 'reply-text' }))?.props.text).toBe('Per [F1](https://katharsis.invalid/F1/finding-1).');
    });

    test('FORCE_HYPERLINK=1 brings the links back in that terminal', async ($, on) => {
      world(on, { env: { HOME: '/home/u', KATHARSIS_DATA: DATA, TERM_PROGRAM: 'herdr', FORCE_HYPERLINK: '1' } });
      await endTurn($);
      const ui = await $.ui.mount(reply('Per F1.'));
      expect((await ui.find({ key: 'reply-text' }))?.props.text).toBe('Per [F1](https://katharsis.invalid/F1/finding-1).');
    });

    test('a reply another plugin beneath draws keeps its drawing, with the chips under it', async ($, on) => {
      world(on, { theirReply: true });
      await endTurn($);
      const ui = await $.ui.mount(reply('Per F1.'));
      expect(await ui.find({ type: 'Text', text: 'engine drawing' })).toBeDefined();
      expect(await ui.find({ key: 'reply-text' })).toBeUndefined();
      expect(await ui.find({ key: 'chip-F1' })).toBeDefined();
    });

    test('pressing a chip opens the pane at that code', async ($, on) => {
      const w = world(on);
      await endTurn($);
      const ui = await $.ui.mount(reply('See C1.'));
      await ui.press({ key: 'chip-C1' });
      expect(w.opened).toEqual(['kdrawer']);
      const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
      expect(await rowCodes(pane)).toEqual(['C1']);
    });

    test('a reply citing no code on record gets no chip row', async ($, on) => {
      world(on);
      await endTurn($);
      const ui = await $.ui.mount(reply('Nothing here but Z9 and F7.'));
      expect(await ui.find({ key: 'chips' })).toBeUndefined();
    });
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

  describe('what is still open and how each item closed', () => {
    test('a load still reading when /clear lands spends no hint on the new session', async ($, on) => {
      const w = world(on, { rows: QROWS });
      let release = () => {};
      w.readHold = new Promise((r) => (release = r));
      const reading = new Promise<void>((r) => (w.onRead = r));
      const old = $.ui.mount(reply('Per F1.'));
      await reading;
      await $.session.end({ reason: 'clear', sessionId: SID, resume: { id: SID } } as never);
      w.sid = 's2';
      w.readHold = undefined;
      release();
      await old;
      expect(w.files.get(hintFile) ?? '').not.toContain('s2');
    });

    test('the latest reply names what is still open, each with a hover card', async ($, on) => {
      world(on, { rows: QROWS });
      await finish($, 'Earlier text.\n\nPer F1, done.');
      const ui = await $.ui.mount(reply('Per F1, done.'));
      expect(await ui.find({ type: 'Text', text: 'Still open:' })).toBeDefined();
      expect(await ui.find({ type: 'Text', text: '· Ex: Q1 a or Q1 z <custom>' })).toBeDefined();
      const buttons = (await ui.findAll({ type: 'Button' })).map((b) => b.key);
      expect([
        buttons,
        (await ui.find({ type: 'Text', text: 'rename the flag?' })) !== undefined,
        (await ui.find({ type: 'Text', text: '  b. no' })) !== undefined,
        (await ui.find({ type: 'Text', text: 'Ex: Q2 a or Q2 z <custom>' })) !== undefined,
      ]).toEqual([
        ['chip-F1', 'chip-Q1', 'chip-Q2', 'still-open-all'],
        true,
        true,
        true,
      ]);
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
      expect(await ui.find({ type: 'Text', text: '○ F1 · Finding 1' })).toBeDefined();
      expect(await ui.find({ type: 'Text', text: 'Cited by V1' })).toBeDefined();
      const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
      expect((await pane.find({ key: 'pick-Q2' }))?.props.label).toBe('▸ Q2');
      expect((await pane.find({ key: 'cell-status-Q2' }))?.text).toBe('✓');
      expect((await pane.find({ key: 'cell-status-Q1' }))?.text).toBe('○');
      await pane.press({ key: 'pick-Q2' });
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

    test('a line an erratum corrected without restating it carries a bang and leads its card with the erratum', BAND_ON, async ($, on) => {
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
      const band = await $.ui.mount(BAND);
      const popup = await band.find({ key: 'reveal-glyph-F2' });
      expect([popup?.text, popup?.children[0]?.props.color]).toEqual(['!', 'warning']);
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
  });

  describe('show all, the row hint, and View current', () => {
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
      expect([
        await rowCodes(pane),
        (await pane.find({ key: 'filter' }))?.props.label,
        (await pane.find({ key: 'view' }))?.props.label,
        (await pane.find({ type: 'Text', text: 'the second question' })) !== undefined,
      ]).toEqual([
        ['Q1', 'Q2'],
        'Filter: still open ▾',
        'View: full ▾',
        true,
      ]);
      await pane.press({ key: 'clear' });
      expect(await rowCodes(pane)).toEqual(['F1', 'Q1', 'Q2']);
      expect((await pane.find({ key: 'filter' }))?.props.label).toBe('Filter: all types ▾');
    });

    test('after show all, short and full keep the still open filter and current lifts it', async ($, on) => {
      world(on, { rows: QROWS });
      await finish($, 'Done.');
      const ui = await $.ui.mount(reply('Done.'));
      await ui.press({ key: 'still-open-all' });
      const pane = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
      await view(pane, 'short');
      expect(await rowCodes(pane)).toEqual(['Q1', 'Q2']);
      expect((await pane.find({ key: 'filter' }))?.props.label).toBe('Filter: still open ▾');
      await view(pane, 'full');
      expect(await rowCodes(pane)).toEqual(['Q1', 'Q2']);
      await view(pane, 'current');
      expect((await pane.find({ key: 'filter' }))?.props.label).toBe('Filter: all types ▾');
    });

    describe('View current', () => {
      const CROWS: Row[] = [
        row('F1', 'line endings differ'),
        row('F2', 'the cache is stale'),
        row('AT1', 'regenerated the fixture'),
        row('C1', 'only checked on Linux'),
        row('Q1', 'which fixture ships?', { options: [{ key: 'a', text: 'keep LF' }] }),
        row('R1', 'the fixture may drift'),
      ];
      const current = async ($: Engine) => {
        await $.command.run({ ...RUN, command: 'kdrawer', args: '' });
        const ui = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'Pane', requestId: 'kdrawer', props: paneProps });
        await view(ui, 'current');
        return ui;
      };

      test('lists the latest reply\'s codes other than questions, then what is still open, in full', async ($, on) => {
        world(on, { rows: CROWS });
        await finish($, 'Per F2 and AT1, Q1 stays open.');
        const ui = await current($);
        expect([
          (await ui.find({ key: 'view' }))?.props.label,
          (await ui.find({ type: 'Text', text: 'Codes this turn · 2' })) !== undefined,
          (await ui.find({ type: 'Text', text: 'Still open · 2' })) !== undefined,
          await rowCodes(ui),
          (await ui.find({ key: 'answer-Q1-a' }))?.props.label,
        ]).toEqual([
          'View: current ▾',
          true,
          true,
          ['AT1', 'F2', 'Q1', 'R1'],
          'a',
        ]);
      });

      test('a code on both rows is listed under both, and Status leaves the list alone', async ($, on) => {
        world(on, { rows: CROWS });
        await finish($, 'R1 is new.');
        const ui = await current($);
        await ui.press({ key: 'show' });
        await ui.press({ key: 'status-resolved' });
        expect(await rowCodes(ui)).toEqual(['R1', 'Q1', 'R1']);
      });

      test('follows the latest reply, and the search and filter narrow it', async ($, on) => {
        world(on, { rows: CROWS });
        await finish($, 'Per F2.');
        const ui = await current($);
        await finish($, 'Per C1 and F1.');
        expect(await rowCodes(ui)).toEqual(['C1', 'F1', 'Q1', 'R1']);
        await ui.press({ key: 'filter' });
        await ui.press({ key: 'filter-F' });
        expect(await rowCodes(ui)).toEqual(['F1']);
        expect(await ui.find({ type: 'Text', text: /^Still open/ })).toBeUndefined();
      });

      test('a reply with no codes and nothing open lists nothing', async ($, on) => {
        world(on, { rows: [row('F1', 'line endings differ')] });
        await finish($, 'Done.');
        const ui = await current($);
        expect(await rowCodes(ui)).toEqual([]);
        expect(await ui.find({ type: 'Text', text: 'Nothing matches.' })).toBeDefined();
      });
    });

    test('no chips when Katharsis is not active', async ($, on) => {
      world(on, { active: false });
      await endTurn($);
      const ui = await $.ui.mount(reply('Per F1.'));
      expect(await ui.find({ key: 'chips' })).toBeUndefined();
    });
  });
});

describe('a user step with a command block', () => {
  const STEP = [row('MV1', 'merge both PRs', { summary: 'each then shows as merged', block: 'gh pr merge 146 --admin\n\ngh pr merge 147 --admin' }), row('MV2', 'sign in', { summary: '1) open the window; 2) sign in' })];

  test('its card shows the block line for line, and copy puts the whole block on the clipboard of the surface pressed, terminal or desktop', async ($, on) => {
    const w = world(on, { rows: STEP });
    const copies: { text: string; surface: unknown }[] = [];
    on('ui.copy', (_$, e) => {
      copies.push({ text: e.text, surface: e.surface });
      return { value: { isCopied: true } };
    });
    const ui = await mountPane($, 'terminal');
    expect(await ui.find({ key: 'copy-MV1' })).toBeUndefined();
    await ui.press({ key: 'pick-MV1' });
    // One Text per line, a blank line kept as a space, so a line never wraps into the next.
    const texts = (await ui.findAll({ type: 'Text' })).map((x) => x.text);
    const at = texts.indexOf('gh pr merge 146 --admin');
    expect(texts.slice(at, at + 3)).toEqual(['gh pr merge 146 --admin', ' ', 'gh pr merge 147 --admin']);
    expect(texts).not.toContain('gh pr merge 146 --admin\n\ngh pr merge 147 --admin');
    await ui.press({ key: 'copy-MV1' });
    // The picked card stays open across surfaces, so the desktop pane shows it already.
    const desktop = await mountPane($, 'desktop');
    await desktop.press({ key: 'copy-MV1' });
    expect(copies).toEqual([
      { text: 'gh pr merge 146 --admin\n\ngh pr merge 147 --admin', surface: 'terminal' },
      { text: 'gh pr merge 146 --admin\n\ngh pr merge 147 --admin', surface: 'desktop' },
    ]);
    expect(w.toasts).toEqual(["Copied MV1's command", "Copied MV1's command"]);
  });

  test('its card, hover card and copy drop control characters and bidi overrides, as kref does', async ($, on) => {
    world(on, { rows: [row('MV1', 'run it', { summary: '', block: 'echo \u001b[31mred\u0007\n\techo \u202Eok' })] });
    const copies: string[] = [];
    on('ui.copy', (_$, e) => {
      copies.push(e.text);
      return { value: { isCopied: true } };
    });
    const ui = await mountPane($, 'terminal');
    await ui.press({ key: 'pick-MV1' });
    const texts = (await ui.findAll({ type: 'Text' })).map((x) => x.text);
    expect(texts).toEqual(expect.arrayContaining(['echo [31mred', '\techo ok']));
    await ui.press({ key: 'copy-MV1' });
    expect(copies).toEqual(['echo [31mred\n\techo ok']);
    const hover = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'AssistantMessage', props: { text: 'Per MV1.', isFirstOfReply: true } });
    expect((await hover.findAll({ type: 'Text' })).map((x) => x.text)).toContain('echo [31mred\n\techo ok');
  });

  test('a block on a row that is not a user step is never shown or copied', async ($, on) => {
    world(on, { rows: [row('F1', 'a finding', { summary: 'it holds a fence', block: 'echo 1' })] });
    const ui = await mountPane($, 'terminal');
    await ui.press({ key: 'pick-F1' });
    expect((await ui.findAll({ type: 'Text' })).map((x) => x.text)).not.toContain('echo 1');
    expect(await ui.find({ key: 'copy-F1' })).toBeUndefined();
  });

  test('a cut flag that is not a boolean still offers no copy', async ($, on) => {
    world(on, { rows: [row('MV1', 'run it', { summary: '', block: 'echo 1', block_cut: 'true' })] });
    const ui = await mountPane($, 'terminal');
    await ui.press({ key: 'pick-MV1' });
    expect(await ui.find({ key: 'copy-MV1' })).toBeUndefined();
  });

  test('a block cut at capture says so in its card and offers no copy', async ($, on) => {
    world(on, { rows: [row('MV1', 'run the setup', { summary: 'it prints 25 lines', block: 'echo 1\necho 2', block_cut: true })] });
    const ui = await mountPane($, 'terminal');
    await ui.press({ key: 'pick-MV1' });
    const texts = (await ui.findAll({ type: 'Text' })).map((x) => x.text);
    expect(texts).toEqual(expect.arrayContaining(['echo 1', 'echo 2', 'Cut at 20,000 characters: copy the whole command from the reply.']));
    expect(await ui.find({ key: 'copy-MV1' })).toBeUndefined();
  });

  test('a block cut to nothing still says so in its card, with no frame and no copy', async ($, on) => {
    world(on, { rows: [row('MV1', 'load it', { summary: 'one huge line', block: '', block_cut: true })] });
    const ui = await mountPane($, 'terminal');
    await ui.press({ key: 'pick-MV1' });
    expect((await ui.findAll({ type: 'Text' })).map((x) => x.text)).toContain('Cut at 20,000 characters: copy the whole command from the reply.');
    expect(await ui.find({ key: 'block-text-MV1' })).toBeUndefined();
    expect(await ui.find({ key: 'copy-MV1' })).toBeUndefined();
  });

  test('its hover card shows the block, and says when it was cut', async ($, on) => {
    world(on, { rows: [...STEP, row('MV3', 'run the setup', { summary: '', block: 'echo 1', block_cut: true })] });
    await endTurn($);
    const ui = await $.ui.mount({ plugin: 'katharsis', surface: 'terminal', component: 'AssistantMessage', props: { text: 'Per MV1 and MV3.', isFirstOfReply: true } });
    expect((await ui.findAll({ type: 'Text' })).map((x) => x.text)).toEqual(
      expect.arrayContaining(['gh pr merge 146 --admin\n\ngh pr merge 147 --admin', 'Cut at 20,000 characters: copy the whole command from the reply.']),
    );
  });

  test('the search finds a step by its command block', async ($, on) => {
    world(on, { rows: STEP });
    const ui = await mountPane($, 'terminal');
    await ui.input({ key: 'q', text: '147 --admin', kind: 'change' });
    expect(await rowCodes(ui)).toEqual(['MV1']);
  });

  test('a step with no block has no copy button, and a refused copy says so', async ($, on) => {
    const w = world(on, { rows: STEP });
    on('ui.copy', () => ({ value: { isCopied: false, reason: 'no-clipboard' } }));
    const ui = await mountPane($, 'terminal');
    await ui.press({ key: 'pick-MV2' });
    expect(await ui.find({ key: 'copy-MV2' })).toBeUndefined();
    await ui.press({ key: 'pick-MV1' });
    await ui.press({ key: 'copy-MV1' });
    expect(w.toasts).toEqual(["Katharsis could not copy MV1's command: select it in the card instead"]);
  });
});
