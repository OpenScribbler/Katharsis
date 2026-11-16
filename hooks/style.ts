// style.ts: whether this session's outputStyle loads Katharsis, shared by the
// prompt hook (register.ts) and the drawer (drawer.tsx).
//
// Claude Code loads the plugin's style only under its exact qualified name,
// katharsis:Katharsis or katharsis:Katharsis coding. Any other value, the
// bare "Katharsis" included, loads a style only from an output style file of
// the user's own whose name is exactly that value (claude -p probes on
// 2.1.309, 2.1.321, and 2.1.323). The engine says which style it loaded only
// to a prompt.compose hook, an event an organization-managed account skips
// for an installed plugin, so the module reads the folders Claude Code's
// loader reads instead. What a probe on 2.1.323 showed the loader does:
// - It reads the user's output-styles folder, each .claude/output-styles
//   from the session's root up to the git root (up to HOME outside a repo),
//   and not above it, subfolders and linked folders included.
// - It reads only files ending in .md, lower case.
// - A file's name is its frontmatter `name`, without quotes or a trailing
//   `# comment`, even when the rest of the frontmatter is not valid YAML; a
//   file with no name goes by its file name.
// - The match is exact: "katharsis" or " Katharsis" loads no style named
//   Katharsis, nor the plugin's.
// A worktree's main repository and the managed folder are read too, as the
// loader's code reads them.

import type { EngineInterface } from 'claude-code';

const KATHARSIS_STYLES = new Set(['katharsis:Katharsis', 'katharsis:Katharsis coding']);

// Each bare name a settings file may hold, with the qualified name to set.
const BARE_STYLES = new Map([
  ['Katharsis', 'katharsis:Katharsis'],
  ['Katharsis coding', 'katharsis:Katharsis coding'],
]);

// The managed folders' output styles, on Linux and on macOS.
const MANAGED = ['/etc/claude-code/.claude/output-styles', '/Library/Application Support/ClaudeCode/.claude/output-styles'];

// The qualified style an outputStyle value means to name, when it spells a
// Katharsis name, bare or qualified, in any case or with spaces around it;
// undefined for every other value.
export function qualifiedFor(style: string): string | undefined {
  const key = style.trim().toLowerCase();
  for (const [bare, qualified] of BARE_STYLES) {
    if (key === bare.toLowerCase() || key === qualified.toLowerCase()) return qualified;
  }
  return undefined;
}

// A style file's name as the loader reads it.
export function styleName(file: string, text: string): string {
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? '';
  const value = front.match(/^name:[ \t]*(.*)$/m)?.[1]?.trim() ?? '';
  const quoted = value.match(/^(["'])(.*?)\1/)?.[2];
  const name = quoted ?? value.replace(/\s+#.*$/, '').trim();
  return name || file.replace(/\.md$/, '');
}

// What the walk reads, through $ in the hooks and a stand-in in tests.
export type StyleFs = {
  list(dir: string): Promise<{ name: string; kind: string; isLink?: boolean }[]>;
  read(path: string): Promise<string | null>;
  stat(path: string): Promise<{ kind: string; realPath?: string } | null>;
};

// The names of every style file under the folders. A linked entry counts as
// what it leads to, a folder reached twice by its real path is walked once,
// which ends a loop of links, and a folder that fails to list or a file that
// fails to read adds nothing. The loader lists a folder with ripgrep's
// --follow and no depth flag, so the walk has no depth limit either.
export async function ownStyleNames(fs: StyleFs, dirs: string[]): Promise<Set<string>> {
  const names = new Set<string>();
  const seen = new Set<string>();
  const walk = async (dir: string): Promise<void> => {
    const at = (await fs.stat(dir).catch(() => null))?.realPath ?? dir;
    if (seen.has(at)) return;
    seen.add(at);
    for (const entry of await fs.list(dir).catch(() => [])) {
      const path = `${dir}/${entry.name}`;
      const kind = entry.isLink ? await linkKind(fs, path) : entry.kind;
      if (kind === 'dir') await walk(path);
      else if (kind === 'file') await addName(fs, names, path, entry.name);
    }
  };
  for (const dir of dirs) await walk(dir);
  return names;
}

// What a link leads to, counted only when the engine says where it lands, so
// the seen set always holds a real path and a loop of links always ends.
async function linkKind(fs: StyleFs, path: string): Promise<string | undefined> {
  const st = await fs.stat(path).catch(() => null);
  return st?.realPath ? st.kind : undefined;
}

// Adds a file's style name when it is a .md file that reads.
async function addName(fs: StyleFs, names: Set<string>, path: string, file: string): Promise<void> {
  if (!file.endsWith('.md')) return;
  const text = await fs.read(path).catch(() => null);
  if (text !== null) names.add(styleName(file, text));
}

function engineFs($: EngineInterface): StyleFs {
  return {
    list: async (dir) => ((await $.fs.exists(dir)) ? $.fs.list(dir) : []),
    read: async (path) => ((await $.fs.exists(path)) ? String(await $.fs.read(path)) : null),
    stat: async (path) => $.fs.stat(path, { resolve: true }),
  };
}

// The folders the loader reads for this session: the user's, each project
// folder from the session's root (which a shell cd does not move) up to the
// git root, or up to HOME outside a repo, a worktree's main repository,
// whose .git file names it, and the managed folders.
async function styleDirs($: EngineInterface): Promise<string[]> {
  const home = (await $.env.get('HOME')) ?? '';
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${home}/.claude`;
  const dirs = [`${config}/output-styles`, ...MANAGED];
  let dir = await $.session.root().catch(() => $.session.cwd());
  for (;;) {
    dirs.push(`${dir}/.claude/output-styles`);
    const git = `${dir}/.git`;
    if (await $.fs.exists(git)) {
      const gitdir = String((await $.fs.read(git).catch(() => '')) ?? '').match(/^gitdir:[ \t]*(.*?)\/\.git\/worktrees\/[^/\n]+\/?[ \t]*$/m)?.[1];
      if (gitdir) dirs.push(`${gitdir}/.claude/output-styles`);
      break;
    }
    const up = dir.replace(/\/[^/]*$/, '');
    if (dir === home || up === dir || up === '') break;
    dir = up;
  }
  return dirs;
}

// Whether a style file of the user's own goes by exactly this name.
export async function hasOwnStyle($: EngineInterface, name: string): Promise<boolean> {
  return (await ownStyleNames(engineFs($), await styleDirs($))).has(name);
}

// How an outputStyle value stands for Katharsis. `on` is a qualified name, or
// any other spelling of a Katharsis name (bare, another case, spaces around
// it) a style file of the user's own goes by exactly. `unloaded` is such a
// spelling no file goes by: the hooks stay idle and the prompt hook tells the
// user. `off` is every other style. hasOwn is asked only for a spelling other
// than a qualified name.
export async function styleState(style: unknown, hasOwn: (name: string) => Promise<boolean>): Promise<'on' | 'off' | 'unloaded'> {
  if (typeof style !== 'string') return 'off';
  if (KATHARSIS_STYLES.has(style)) return 'on';
  if (!qualifiedFor(style)) return 'off';
  return (await hasOwn(style)) ? 'on' : 'unloaded';
}
