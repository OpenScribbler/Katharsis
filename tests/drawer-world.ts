// drawer-world.ts: the in-memory world the drawer suites mount the drawer in.
// Each test answers the nouns the drawer reaches (env, session id, fs) from an
// in-memory ledger in the format ledger-stop.sh writes. It holds no tests, so
// `claude plugin test .`, which runs tests/*.test.ts, imports it only through them.

import { mock } from 'claude-code/testing';
import type { Engine } from 'claude-code/testing';
import type { On } from 'claude-code';

export const SID = 's1';
export const PARENT = 's0';
export const DATA = '/data';
export const PROJ = `${DATA}/ledger/x-p`;

export type Row = Record<string, unknown>;

export const row = (code: string, title: string, extra: Row = {}): Row => {
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

export const jsonl = (rows: Row[]) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

export type World = { files: Map<string, string>; hold?: Promise<void>; readHold?: Promise<void>; onRead?: () => void; reads?: string[]; pathHold?: { path: string; until: Promise<void>; reached: () => void }; scans: number; opened: string[]; commands: string[]; forks: string[]; turns: number; reply: string; sid: string; style: string; box: string; dropSubmit?: boolean; submitThrows?: boolean; submitHold?: Promise<void>; rewrite?: string; submitted: { text: string; origin: unknown }[]; toasts: string[] };

// Katharsis is active when the settings name its style. The world writes no
// .active marker, because the drawer must not need one.
// The terminal is ghostty unless a test names another, so replies get links.
type WorldOpts = { active?: boolean; rows?: Row[]; theirReply?: boolean; env?: Record<string, string> | ((name: string) => string | undefined) };

// The session's ledger, an ancestor in the chain, and a session outside it.
function seedFiles(rows: Row[] | undefined): Map<string, string> {
  const files = new Map<string, string>();
  files.set(`${PROJ}/${SID}.jsonl`, jsonl(rows ?? ROWS));
  files.set(`${DATA}/ledger/chains/${SID}`, `${PARENT}\n`);
  files.set(`${DATA}/ledger/y-q/${PARENT}.jsonl`, jsonl(rows ? [] : [row('D1', 'from the parent session', { session_id: PARENT })]));
  files.set(`${DATA}/ledger/y-q/other.jsonl`, jsonl([row('D9', 'another session', { session_id: 'other' })]));
  return files;
}

export function world(on: On, opts: WorldOpts = {}): World {
  const w: World = { files: seedFiles(opts.rows), scans: 0, opened: [], commands: [], forks: [], turns: 1, reply: 'Fixing the drawer band', sid: SID, style: opts.active === false ? 'default' : 'katharsis:Katharsis', box: '', submitted: [], toasts: [] };
  const env = opts.env ?? { HOME: '/home/u', KATHARSIS_DATA: DATA, TERM_PROGRAM: 'ghostty' };
  if (typeof env === 'function') on('env.get', (_$, e) => ({ value: env(e.name) }));
  else mock.env(on, env);
  on('session.id', () => ({ value: w.sid }));
  on('session.cwd', () => ({ value: '/work/app' }));
  on('settings.read', () => ({ value: { outputStyle: w.style } }));
  on('session.start', (_$, e) => ({ cwd: e.cwd }));
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }));
  mockFs(on, w);
  mockPrompt(on, w);
  mockEngine(on, w, opts);
  return w;
}

// The filesystem over w.files, with the holds a test can set to stall a read
// or a scan of the answers folder.
function mockFs(on: On, w: World): void {
  on('fs.exists', (_$, e) => ({
    value: w.files.has(e.path) || [...w.files.keys()].some((k) => k.startsWith(`${e.path}/`)),
  }));
  on('fs.read', async (_$, e) => ({ value: await readFile(w, e.path) }));
  on('fs.write', (_$, e) => {
    w.files.set(e.path, e.text);
    return { value: undefined };
  });
  on('fs.list', async (_$, e) => ({ value: await listDir(w, e.path) }));
}

async function readFile(w: World, path: string): Promise<string> {
  w.reads?.push(path);
  if (w.pathHold?.path === path) {
    w.pathHold.reached();
    await w.pathHold.until;
  }
  if (w.readHold) {
    w.onRead?.();
    await w.readHold;
  }
  const text = w.files.get(path);
  if (text === undefined) throw new Error(`ENOENT ${path}`);
  return text;
}

// A list of the answers folder is a scan, which a test can hold.
async function listDir(w: World, path: string) {
  if (path === `${DATA}/answers`) {
    w.scans += 1;
    if (w.hold) await w.hold;
  }
  return childrenOf(w, path);
}

function childrenOf(w: World, path: string) {
  const dir = `${path}/`;
  const names = new Map<string, 'file' | 'dir'>();
  for (const k of w.files.keys()) {
    if (!k.startsWith(dir)) continue;
    const rest = k.slice(dir.length);
    names.set(rest.split('/')[0] ?? '', rest.includes('/') ? 'dir' : 'file');
  }
  return [...names].map(([name, kind]) => ({ name, kind, size: 0, isLink: false }));
}

function mockEngine(on: On, w: World, opts: WorldOpts): void {
  on('command.register', (_$, e) => {
    w.commands.push(e.name);
    return { value: { command: e.name } };
  });
  on('ui.open', (_$, e) => {
    w.opened.push(e.id);
    return { value: { isPlaced: true } };
  });
  on('session.turns', () => ({ value: w.turns }));
  on('ui.toast', (_$, e) => {
    w.toasts.push(e.text);
    return { value: undefined };
  });
  on('model.fork', (_$, e) => {
    w.forks.push(e.prompt);
    return { value: { isAnswered: true, text: w.reply, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } };
  });
  on('turn.complete', (_$, e) => ({ text: e.answer }));
  // What next(e) resolves to beneath the drawer: a reply is the engine's own
  // drawing unless another plugin beneath draws its own (theirReply).
  on('ui.render', ($, e) => {
    if (e.component === 'AssistantMessage' && !opts.theirReply) return { type: 'engine', ref: 1 };
    return $.ui.resolve(e).Text({ children: 'engine drawing' });
  });
}

// The prompt box holds whatever the person typed there, and a submit
// records what entered and from where.
function mockPrompt(on: On, w: World): void {
  on('prompt.read', () => ({ value: { text: w.box, cursor: w.box.length } }));
  on('prompt.fill', (_$, e) => {
    w.box = e.mode === 'append' ? w.box + e.text : e.text;
    return { isFilled: true };
  });
  on('prompt.submit', async (_$, e) => {
    if (w.submitHold) await w.submitHold;
    if (w.submitThrows) throw new Error('session gone');
    if (w.dropSubmit) return { drop: 'refused' };
    w.submitted.push({ text: e.text, origin: e.origin });
    return { text: w.rewrite ?? e.text };
  });
}

export const BAND = {
  plugin: 'katharsis',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const;

// The band draws only when its option is on.
export const BAND_ON = { options: { band: true } } as const;

export const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const;

export const paneProps = { title: 'Katharsis', isFocused: true, bodyColumns: 100, placement: 'inline', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const;

// A finished turn loads the ledger.
export async function endTurn($: Engine): Promise<void> {
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' });
}

export async function mountPane($: Engine, surface: 'terminal' | 'desktop') {
  await endTurn($);
  return $.ui.mount({ plugin: 'katharsis', surface, component: 'Pane', requestId: 'kdrawer', props: paneProps });
}

// Picks a view from the View menu.
export async function view(ui: { press: (q: { key: string }) => Promise<unknown> }, v: 'short' | 'full' | 'current' | 'settings'): Promise<void> {
  await ui.press({ key: 'view' });
  await ui.press({ key: `view-${v}` });
}

export async function rowCodes(ui: { findAll: (q: { type?: string; text?: RegExp }) => Promise<{ key: string | undefined }[]> }): Promise<string[]> {
  const rows = await ui.findAll({ type: 'Box' });
  return rows.map((r) => r.key ?? '').filter((k) => k.startsWith('row-')).map((k) => k.slice(4));
}

export const START = { cwd: '/w', surface: 'terminal', isInteractive: true } as const;
