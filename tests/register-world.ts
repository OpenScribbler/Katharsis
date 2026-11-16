// register-world.ts: the in-memory world the register suites submit prompts
// in. It stands beneath the plugin and answers the nouns register.ts reaches
// (settings, session id, env, fs, process) from memory. It holds no tests, so
// `claude plugin test .`, which runs tests/*.test.ts, imports it only through them.

import { mock } from 'claude-code/testing';
import type { Engine } from 'claude-code/testing';
import type { On, PromptOrigin } from 'claude-code';

export type World = {
  sid?: string;
  settings: Record<string, unknown>;
  // What the managed settings hold, as a read of the policy source answers.
  policy?: Record<string, unknown>;
  files: Map<string, string>;
  // Each link's path and the path it leads to.
  links?: Record<string, string>;
  runs: string[][];
  model: string;
  // The session's directory and project root, /work/app unless a test moves them.
  cwd?: string;
  root?: string;
  noteBody: string;
  failWrite?: string;
  failRead?: string;
  // fs.exists throws for a path holding this.
  failExists?: string;
  // A policy read throws.
  failPolicy?: boolean;
  // Counts fs.list calls when set; past 50 every list comes back empty, so a
  // walk that loops ends and fails its count instead of hanging.
  lists?: number;
  failGit?: boolean;
  gitInit?: unknown;
  onGit?: () => void;
  notes?: Record<string, string>;
  sketches?: string;
};

export const SID = 's9';
export const DATA = '/data';

export function world(on: On, settings: Record<string, unknown>, files: Record<string, string> = {}, env: Record<string, string> = {}): World {
  const w: World = { settings, files: new Map(Object.entries(files)), runs: [], model: '', noteBody: '' };
  mock.env(on, { HOME: '/home/u', KATHARSIS_DATA: DATA, ...env });
  on('settings.read', (_$, e) => {
    if (e.source === 'policy' && w.failPolicy) throw new Error('policy unreadable');
    return { value: e.source === 'policy' ? (w.policy ?? {}) : w.settings };
  });
  on('session.id', () => ({ value: w.sid ?? SID }));
  on('session.model', () => ({ value: w.model }));
  on('session.cwd', () => ({ value: w.cwd ?? '/work/app' }));
  on('session.root', () => ({ value: w.root ?? '/work/app' }));
  mockFs(on, w);
  on('process.run', (_$, e) => ({ value: runProcess(w, [...e.argv], e.init) }));
  on('env.set', () => ({ value: undefined }));
  // The bottom of the chain: echo what the plugin passed down, so the test
  // reads the context it attached.
  on('prompt.submit', (_$, e) => ({ text: e.text, context: e.context, origin: e.origin }));
  return w;
}

// A model note answers at any plugin root, since the engine picks the root.
function noteOf(w: World, p: string): string | undefined {
  const name = p.match(/\/styles\/models\/([^/]+)\.md$/)?.[1];
  if (!name) return undefined;
  if (w.notes && name in w.notes) return w.notes[name];
  return name === 'opus' && w.noteBody !== '' ? w.noteBody : undefined;
}

// The sketch rules answer at any plugin root too, when the world has them,
// and so does the plugin's manifest.
const isSketches = (w: World, p: string) => w.sketches !== undefined && p.endsWith('/styles/richness/sketches.md');
const isManifest = (p: string) => p.endsWith('/.claude-plugin/plugin.json');

// The path a link prefix leads to, link after link.
function real(w: World, p: string): string {
  for (const [link, to] of Object.entries(w.links ?? {})) {
    if (p === link || p.startsWith(`${link}/`)) return real(w, to + p.slice(link.length));
  }
  return p;
}

function isDir(w: World, p: string): boolean {
  return [...w.files.keys(), ...Object.keys(w.links ?? {})].some((k) => k.startsWith(`${p}/`));
}

function exists(w: World, path: string): boolean {
  const p = real(w, path);
  if (w.files.has(p) || noteOf(w, p) !== undefined) return true;
  if (isSketches(w, p) || isManifest(p)) return true;
  return isDir(w, p);
}

function readFile(w: World, path: string): string | undefined {
  const p = real(w, path);
  const note = noteOf(w, p);
  if (note !== undefined) return note;
  if (w.failRead && p.includes(w.failRead)) throw new Error(`EIO ${p}`);
  if (isSketches(w, p)) return w.sketches;
  if (isManifest(p)) return '{"version":"9.9.9"}';
  const text = w.files.get(p);
  if (text === undefined) throw new Error(`ENOENT ${p}`);
  return text;
}

// A link lists as Claude Code lists one: kind other, isLink set.
function childrenOf(w: World, path: string) {
  if (w.lists !== undefined && ++w.lists > 50) return [];
  const at = real(w, path);
  const links = Object.keys(w.links ?? {}).filter((l) => l.slice(0, l.lastIndexOf('/')) === at);
  const dir = `${at}/`;
  const names = new Map<string, 'file' | 'dir'>();
  for (const k of w.files.keys()) {
    if (!k.startsWith(dir)) continue;
    const rest = k.slice(dir.length);
    names.set(rest.split('/')[0] ?? '', rest.includes('/') ? 'dir' : 'file');
  }
  const own = [...names].map(([name, kind]) => ({ name, kind, size: w.files.get(dir + name)?.length ?? 0, isLink: false }));
  return [...own, ...links.map((l) => ({ name: l.slice(l.lastIndexOf('/') + 1), kind: 'other', size: 0, isLink: true }))];
}

// stat with resolve: what the path leads to, and its real path.
function statOf(w: World, path: string) {
  const p = real(w, path);
  const at = { size: w.files.get(p)?.length ?? 0, mtimeMs: 0, isLink: p !== path, realPath: p };
  if (w.files.has(p)) return { kind: 'file' as const, ...at };
  return isDir(w, p) ? { kind: 'dir' as const, ...at } : null;
}

function mockFs(on: On, w: World): void {
  on('fs.exists', (_$, e) => {
    if (w.failExists && e.path.includes(w.failExists)) throw new Error(`EIO ${e.path}`);
    return { value: exists(w, e.path) };
  });
  on('fs.list', (_$, e) => ({ value: childrenOf(w, e.path) }));
  on('fs.stat', (_$, e) => ({ value: statOf(w, e.path) }));
  on('fs.read', (_$, e) => ({ value: readFile(w, e.path) }));
  on('fs.write', (_$, e) => {
    if (w.failWrite && e.path.includes(w.failWrite)) throw new Error(`EACCES ${e.path}`);
    w.files.set(e.path, e.text);
    return { value: undefined };
  });
}

// git records the init it ran with and can be made to fail; rm deletes.
function runProcess(w: World, argv: string[], init: World['gitInit']) {
  w.runs.push(argv);
  if (argv[0] === 'git') {
    w.gitInit = init;
    w.onGit?.();
    if (w.failGit) throw new Error('git timed out');
  }
  if (argv[0] === 'rm') argv.slice(2).forEach((p) => w.files.delete(p));
  return { exitCode: 0, stdout: argv[0] === 'git' ? 'main\n' : '', stderr: '' };
}

export async function submit($: Engine, text: string, origin: PromptOrigin = { kind: 'composer' }): Promise<string[]> {
  const r = await $.prompt.submit({ text, wait: false, origin });
  if ('drop' in r) throw new Error(`dropped: ${r.drop}`);
  return [...(r.context ?? [])];
}

export function lines(context: string[]): string[] {
  return context.flatMap((c) => c.split('\n')).filter((l) => l.trim());
}
