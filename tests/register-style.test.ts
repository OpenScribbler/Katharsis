// Tests for how hooks/register.ts treats a bare Katharsis style name, run by
// `claude plugin test .`: the not-loaded line once per session when no output
// style file of the user's own goes by it, and every folder, link, worktree,
// size, and managed setting that decides whether one does.

import { describe, expect, test } from 'claude-code/testing';
import { DATA, lines, SID, submit, world } from './register-world.ts';

describe('bare style names', () => {
  for (const [bare, qualified] of [['Katharsis', 'katharsis:Katharsis'], ['Katharsis coding', 'katharsis:Katharsis coding']]) {
    test(`a bare ${bare} with no style file of the user's own gets the not-loaded line once, naming ${qualified}, and no marker`, async ($, on) => {
      const w = world(on, { outputStyle: bare }, { [`${DATA}/.active-${SID}`]: '' });
      const first = lines(await submit($, 'x'));
      const second = lines(await submit($, 'y'));
      const kept = [...w.files.keys()].filter((p) => p.startsWith(`${DATA}/`));
      expect({ first, second, kept }).toEqual({
        first: [
          `Katharsis is not loaded: outputStyle is "${bare}", a name Claude Code does not load for a plugin's style, and no output style file of the user's own goes by it, so no Katharsis style is in this session. Tell the user so in one line, and that choosing ${qualified} under Output style in /config loads it.`,
        ],
        second: [],
        kept: [],
      });
    });
  }

  // Where Claude Code 2.1.323's loader finds a style file of the user's own:
  // the user's output-styles folder, subfolders included; each
  // .claude/output-styles from the session root up to the git root; a
  // worktree's main repository; and the managed folder.
  const OWN: [string, Record<string, string>][] = [
    ['the user folder', { '/home/u/.claude/output-styles/Katharsis.md': '# My copy\n' }],
    ['a subfolder of the user folder', { '/home/u/.claude/output-styles/a/b/mine.md': '---\nname: Katharsis # my copy\n---\n' }],
    ['the project folder', { '/work/app/.claude/output-styles/x.md': "---\nname: 'Katharsis'\n---\n" }],
    ['a folder above the root, inside the repo', { '/work/.claude/output-styles/x.md': '---\nname: Katharsis\n---\n', '/work/.git/HEAD': 'ref\n' }],
    ['the main repository of a worktree', { '/work/app/.git': 'gitdir: /main/.git/worktrees/app\n', '/main/.claude/output-styles/x.md': '---\nname: Katharsis\n---\n' }],
    ['the managed folder', { '/etc/claude-code/.claude/output-styles/x.md': '---\nname: Katharsis\n---\n' }],
  ];
  for (const [where, files] of OWN) {
    test(`a bare name a style file of the user's own in ${where} goes by is Katharsis on`, async ($, on) => {
      const w = world(on, { outputStyle: 'Katharsis' }, files);
      const out = lines(await submit($, 'x'));
      expect({ count: out.length, active: w.files.has(`${DATA}/.active-${SID}`) }).toEqual({ count: 2, active: true });
    });
  }

  // Where it does not: above the git root, another name, another extension.
  const NOT_OWN: [string, Record<string, string>][] = [
    ['above the git root', { '/work/app/.git/HEAD': 'ref\n', '/work/.claude/output-styles/x.md': '---\nname: Katharsis\n---\n' }],
    ['under another name', { '/home/u/.claude/output-styles/Katharsis.md': '---\nname: Other\n---\n' }],
    ['with an upper-case extension', { '/home/u/.claude/output-styles/Katharsis.MD': '---\nname: Katharsis\n---\n' }],
  ];
  for (const [where, files] of NOT_OWN) {
    test(`a style file ${where} leaves a bare name unloaded`, async ($, on) => {
      world(on, { outputStyle: 'Katharsis' }, files);
      expect(lines(await submit($, 'x'))[0]).toContain('Katharsis is not loaded');
    });
  }

});

describe('own style files behind links, worktrees, and managed settings', () => {
  // Claude Code's loader follows links (claude -p on 2.1.323); the walk counts
  // a linked entry only by the real path the engine's stat gives it.
  test('a style file behind a linked folder and a link inside it is Katharsis on', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' }, { '/real/b/k.md': '---\nname: Katharsis\n---\n', '/real/a/note.txt': 'x' });
    w.links = { '/home/u/.claude/output-styles/linked': '/real/a', '/real/a/inner': '/real/b' };
    const out = lines(await submit($, 'x'));
    expect({ count: out.length, active: w.files.has(`${DATA}/.active-${SID}`) }).toEqual({ count: 2, active: true });
  });

  test('a loop of links ends, and leaves a bare name unloaded', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' }, { '/real/a/note.txt': 'x' });
    w.links = { '/home/u/.claude/output-styles/linked': '/real/a', '/real/a/back': '/real/a' };
    w.lists = 0;
    const unloaded = lines(await submit($, 'x'))[0]?.startsWith('Katharsis is not loaded');
    expect({ unloaded, lists: w.lists }).toEqual({ unloaded: true, lists: 2 });
  });

  // The loader counts hidden files and folders (ripgrep --hidden in 2.1.325)
  // and skips a file over 1 MiB (its 1048576-byte read limit).
  const NAMED = '---\nname: Katharsis\n---\n';
  const SIZED: [string, Record<string, string>, boolean][] = [
    ['in a hidden folder, under a hidden name', { '/home/u/.claude/output-styles/.mine/.k.md': NAMED }, true],
    ['of exactly 1 MiB', { '/home/u/.claude/output-styles/k.md': NAMED.padEnd(1048576, 'x') }, true],
    ['over 1 MiB', { '/home/u/.claude/output-styles/k.md': NAMED.padEnd(1048577, 'x') }, false],
  ];
  for (const [what, files, on_] of SIZED) {
    test(`a style file ${what} ${on_ ? 'counts' : 'does not count'}`, async ($, on) => {
      const w = world(on, { outputStyle: 'Katharsis' }, files);
      await submit($, 'x');
      expect(w.files.has(`${DATA}/.active-${SID}`)).toBe(on_);
    });
  }

  test('a .git that cannot be checked still drops the marker and sends the line', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' }, { [`${DATA}/.active-${SID}`]: '' });
    w.failExists = '/work/app/.git';
    const out = lines(await submit($, 'x'));
    expect({ unloaded: out[0]?.startsWith('Katharsis is not loaded'), marker: w.files.has(`${DATA}/.active-${SID}`) }).toEqual({ unloaded: true, marker: false });
  });

  test('a failed policy read sends the line that names /config', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' });
    w.failPolicy = true;
    expect(lines(await submit($, 'x'))[0]).toContain('choosing katharsis:Katharsis under Output style in /config loads it.');
  });

  test('a trailing slash on HOME still stops the walk there', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' }, { '/home/.claude/output-styles/x.md': NAMED }, { HOME: '/home/u/' });
    w.root = '/home/u/proj';
    expect(lines(await submit($, 'x'))[0]).toContain('Katharsis is not loaded');
  });

  // The match is exact (claude -p on 2.1.323): a file named Katharsis loads no
  // style for another spelling of it.
  for (const spelling of ['katharsis', ' Katharsis']) {
    test(`"${spelling}" with only a style file named Katharsis is unloaded`, async ($, on) => {
      const w = world(on, { outputStyle: spelling }, { '/home/u/.claude/output-styles/k.md': '---\nname: Katharsis\n---\n' });
      const out = lines(await submit($, 'x'));
      expect({ unloaded: out[0]?.startsWith('Katharsis is not loaded'), active: w.files.has(`${DATA}/.active-${SID}`) }).toEqual({ unloaded: true, active: false });
    });
  }

  // HOME's .claude is the user folder, never a project folder: the loader's
  // project walk stops at HOME before adding it (2.1.325), so with
  // CLAUDE_CONFIG_DIR elsewhere a style file there loads nothing.
  test('a style file in HOME/.claude answers nothing when CLAUDE_CONFIG_DIR points elsewhere', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' }, { '/home/u/.claude/output-styles/k.md': '---\nname: Katharsis\n---\n' }, { CLAUDE_CONFIG_DIR: '/cfg' });
    w.root = '/home/u/proj';
    expect(lines(await submit($, 'x'))[0]).toContain('Katharsis is not loaded');
  });

  // git writes a worktree's gitdir relative to the worktree's root under
  // --relative-paths, so it resolves there, not at the session root below it.
  test('a relative gitdir resolves against the worktree root', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' }, { '/work/app/.git': 'gitdir: ../main/.git/worktrees/app\n', '/work/main/.claude/output-styles/x.md': '---\nname: Katharsis\n---\n' });
    w.root = '/work/app/sub';
    expect(lines(await submit($, 'x')).length).toBe(2);
  });

  test('a bare name the managed settings set gets a not-loaded line that sends the user to whoever manages them, not /config', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' });
    w.policy = { outputStyle: 'Katharsis' };
    expect(lines(await submit($, 'x'))).toEqual([
      'Katharsis is not loaded: outputStyle is "Katharsis", a name Claude Code does not load for a plugin\'s style, and no output style file of the user\'s own goes by it, so no Katharsis style is in this session. Tell the user so in one line, and that the value comes from the organization\'s managed settings, which /config cannot override, so whoever manages those settings can set it to katharsis:Katharsis.',
    ]);
  });
});

describe('bare style names across sessions', () => {

  test('a session with no id gets the not-loaded line each turn, and records none for others', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' });
    w.sid = '';
    const first = lines(await submit($, 'x')).length;
    const second = lines(await submit($, 'y')).length;
    w.sid = SID;
    const named = lines(await submit($, 'z')).length;
    expect({ first, second, named }).toEqual({ first: 1, second: 1, named: 1 });
  });

  test('another spelling of a Katharsis name with no style file by it gets the line naming the qualified style', async ($, on) => {
    world(on, { outputStyle: ' katharsis coding' });
    expect(lines(await submit($, 'x'))[0]).toContain('choosing katharsis:Katharsis coding under Output style');
  });

  test('another spelling a style file of the user\'s own goes by exactly is Katharsis on', async ($, on) => {
    world(on, { outputStyle: 'katharsis' }, { '/home/u/.claude/output-styles/k.md': '---\nname: katharsis\n---\n' });
    expect(lines(await submit($, 'x')).length).toBe(2);
  });

  test('a new session gets its own not-loaded line', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' });
    const first = lines(await submit($, 'x'));
    w.sid = 's10';
    const next = lines(await submit($, 'y'));
    expect({ first: first.length, next: next.length, again: next[0] === first[0] }).toEqual({ first: 1, next: 1, again: true });
  });

  // The walk starts at the project root, which a shell cd does not move, and
  // outside a repo it stops at HOME.
  test('the project folders come from the session root, not its directory, and stop at HOME', async ($, on) => {
    const style = { '/work/app/.claude/output-styles/x.md': '---\nname: Katharsis\n---\n' };
    const moved = world(on, { outputStyle: 'Katharsis' }, style);
    moved.cwd = '/elsewhere';
    const fromRoot = lines(await submit($, 'x')).length;
    moved.files = new Map(Object.entries({ '/home/.claude/output-styles/x.md': '---\nname: Katharsis\n---\n' }));
    moved.root = '/home/u/proj';
    moved.cwd = '/home/u/proj';
    const aboveHome = lines(await submit($, 'y'));
    expect({ fromRoot, aboveHome: aboveHome[0]?.startsWith('Katharsis is not loaded') }).toEqual({ fromRoot: 2, aboveHome: true });
  });

  test('the not-loaded line goes out once even when no file can be written', async ($, on) => {
    const w = world(on, { outputStyle: 'Katharsis' });
    w.failWrite = '/';
    const first = lines(await submit($, 'x'));
    const second = lines(await submit($, 'y'));
    expect({ first: first.length, second }).toEqual({ first: 1, second: [] });
  });
});
