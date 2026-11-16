// links.ts: the codes in a reply as links that open the drawer, and whether
// this terminal shows a link, for drawer.tsx.

import type { EngineInterface } from 'claude-code';
import type { Item } from './ledger.ts';
import { CODE_RE, LINK_BASE, nameOf } from './drawer-model.ts';

// The reply's text with every code on record turned into a link, skipping
// fenced blocks and inline code spans, where a link would draw literally.
export function linkify(text: string, items: Item[]): { text: string; hrefs: string[] } {
  const hrefs = new Set<string>();
  const byCode = new Map(items.map((i) => [i.code.toUpperCase(), i]));
  const link = (seg: string) =>
    seg.replace(CODE_RE, (c) => {
      const item = byCode.get(c.toUpperCase());
      if (!item) return c;
      const href = `${LINK_BASE}${c}/${nameOf(item).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      hrefs.add(href);
      return `[${c}](${href})`;
    });
  // A fence opens on 3 or more backticks or tildes and, as in CommonMark,
  // closes only on a bare run of the same mark at least as long, so a
  // shorter fence quoted inside a longer one stays inside it.
  let fence = '';
  const closes = (run: string, line: string) =>
    run[0] === fence[0] && run.length >= fence.length && line.trim() === run;
  const out = text.split('\n').map((line) => {
    const run = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (run && (!fence || closes(run, line))) {
      fence = fence ? '' : run;
      return line;
    }
    if (fence) return line;
    return line
      .split(/(`[^`]*`)/)
      .map((seg) => (seg.startsWith('`') && seg.endsWith('`') && seg.length > 1 ? seg : link(seg)))
      .join('');
  });
  return { text: out.join('\n'), hrefs: [...hrefs] };
}

export function codeOfHref(href: string): string {
  return href.startsWith(LINK_BASE) ? (href.slice(LINK_BASE.length).split('/')[0] ?? '') : '';
}

// Where Claude Code judges the terminal unable to show a link, it draws the
// link's text and then its URL, so every linked code would read as
// "F3 (https://katharsis.invalid/F3/finding)". This is that judgment from the
// environment, as Claude Code 2.1.301 makes it: the supports-hyperlinks checks,
// then its own list of terminals. The process's TTY and color checks and the
// --no-hyperlink flags are out of reach and pass in an interactive session.
const LINK_TERMINALS = ['ghostty', 'Hyper', 'kitty', 'alacritty', 'iTerm.app', 'iTerm2', 'WarpTerminal'];

function version(v: string): { major: number; minor: number } {
  const old = /^(\d{1,2})(\d{2})$/.exec(v);
  if (/^\d{3,4}$/.test(v) && old) return { major: 0, minor: Number(old[1]) };
  const [major = NaN, minor = NaN] = v.split('.').map((n) => parseInt(n, 10));
  return { major, minor };
}

type Env = Record<string, string | undefined>;

// A terminal program's own answer, by its name and version, or undefined
// when the name settles nothing.
function programShowsLinks(env: Env): boolean | undefined {
  const v = version(env.TERM_PROGRAM_VERSION ?? '');
  switch (env.TERM_PROGRAM) {
    case 'iTerm.app':
      return v.major === 3 ? v.minor >= 1 : v.major > 3;
    case 'WezTerm':
      return v.major >= 20200620;
    case 'vscode':
      return v.major > 1 || (v.major === 1 && v.minor >= 72);
    case 'ghostty':
      return true;
  }
  return undefined;
}

function vteShowsLinks(vteVersion: string): boolean {
  if (vteVersion === '0.50.0') return false;
  const vte = version(vteVersion);
  return vte.major > 0 || vte.minor >= 50;
}

// The supports-hyperlinks test, in its order.
function supportsLinks(env: Env): boolean {
  if (env.NETLIFY) return true;
  if (env.WT_SESSION !== undefined) return true;
  if (env.CI || env.TEAMCITY_VERSION) return false;
  const program = programShowsLinks(env);
  if (program !== undefined) return program;
  if (env.VTE_VERSION) return vteShowsLinks(env.VTE_VERSION);
  return env.TERM === 'alacritty';
}

function tmuxShowsLinks(env: Env): boolean {
  const t = version(env.TERM_PROGRAM_VERSION ?? '');
  return t.major > 3 || (t.major === 3 && t.minor >= 4);
}

export function terminalShowsLinks(env: Env): boolean {
  const force = env.FORCE_HYPERLINK;
  if (force !== undefined) return force !== '' ? parseInt(force, 10) !== 0 : supportsLinks(env);
  if (supportsLinks(env)) return true;
  const program = env.TERM_PROGRAM ?? '';
  if (LINK_TERMINALS.includes(program) || LINK_TERMINALS.includes(env.LC_TERMINAL ?? '')) return true;
  if (env.TERMINAL_EMULATOR === 'JetBrains-JediTerm') return true;
  if (program === 'tmux' && tmuxShowsLinks(env)) return true;
  return env.TERM?.includes('kitty') ?? false;
}

let showsLinks: Promise<boolean> | null = null;

// The environment holds for the process, so it is read once. Each name is
// spelled out, since the engine lists the variables a module reads. A failed
// read keeps the engine's drawing for that reply and is tried again next time,
// since a cached guess of true would bring the URLs back.
export function linksShown($: EngineInterface): Promise<boolean> {
  showsLinks ??= (async () =>
    terminalShowsLinks({
      FORCE_HYPERLINK: await $.env.get('FORCE_HYPERLINK'),
      NETLIFY: await $.env.get('NETLIFY'),
      WT_SESSION: await $.env.get('WT_SESSION'),
      CI: await $.env.get('CI'),
      TEAMCITY_VERSION: await $.env.get('TEAMCITY_VERSION'),
      TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
      TERM_PROGRAM_VERSION: await $.env.get('TERM_PROGRAM_VERSION'),
      VTE_VERSION: await $.env.get('VTE_VERSION'),
      TERM: await $.env.get('TERM'),
      LC_TERMINAL: await $.env.get('LC_TERMINAL'),
      TERMINAL_EMULATOR: await $.env.get('TERMINAL_EMULATOR'),
    }))().catch(() => {
      showsLinks = null;
      return false;
    });
  return showsLinks;
}

// A register() call reads the environment afresh.
export function forgetLinksShown(): void {
  showsLinks = null;
}
