// style.ts: whether this session's outputStyle loads Katharsis, shared by the
// prompt hook (register.ts) and the drawer (drawer.tsx).
//
// Claude Code loads the plugin's style only under its qualified name,
// katharsis:Katharsis or katharsis:Katharsis coding. A settings file holding
// the bare "Katharsis" loads no style body, unless an output style file of
// the user's own goes by that name (claude -p probes on 2.1.309 and 2.1.321).
// Rather than repeat Claude Code's output-style loader, the module asks the
// engine which style it resolved.
//
// What a probe plugin on 2.1.321 (claude -p --plugin-dir) showed:
// - A plugin's own `$.prompt.compose()` runs that plugin's own prompt.compose
//   hook, with the engine's whole input: `outputStyle` is null for a bare
//   "Katharsis" that loaded nothing, and `{ name: "Katharsis" }` when an
//   output style file of the user's own goes by it. (The type file says the
//   call goes through every other plugin's hook; on 2.1.321 it reaches the
//   caller's own as well.)
// - The engine composes before each prompt.submit, but another plugin's
//   compose reaches the hook too, with whatever style it passed, null
//   included.
// - A fact the call passes reaches the hook as passed, and each fact it
//   leaves out is the session's own: `$.prompt.compose({ tools: [PROBE] })`
//   arrives with `tools` as `[PROBE]` and the session's resolved
//   `outputStyle`.
// So the module tags its own call with PROBE, a tool name nothing else sends
// and the engine ignores as unknown, and the hook answers only an input that
// carries it. It keeps nothing between calls, and no other compose, whenever
// it lands, can answer the check.

import type { EngineInterface, PromptComposeInput } from 'claude-code';

const KATHARSIS_STYLES = new Set(['katharsis:Katharsis', 'katharsis:Katharsis coding']);

// Each bare name a settings file may hold, with the qualified name to set.
const BARE_STYLES = new Map([
  ['Katharsis', 'katharsis:Katharsis'],
  ['Katharsis coding', 'katharsis:Katharsis coding'],
]);

// The tool name that tags this module's own compose.
export const PROBE = 'katharsis-style-probe';

// The answers loadedStyle is waiting on, one per call in flight. Every call
// asks the same session the same question, so each tagged answer fills them
// all.
const waiting = new Set<{ name?: string | null }>();

// The prompt.compose hook's part: hand the resolved style of a tagged compose
// to every call in flight. An untagged input answers nothing, and so does a
// tagged one that leaves the style out, as the test kit's input for a
// plugin's own call does.
export function noteComposed(e: Partial<Pick<PromptComposeInput, 'outputStyle' | 'tools'>>): void {
  if (!e.tools?.includes(PROBE) || e.outputStyle === undefined) return;
  for (const w of waiting) if (w.name === undefined) w.name = e.outputStyle?.name ?? null;
}

// The style the engine resolves for this session now, from a compose this
// module asks for, tagged with PROBE: null for no custom style, undefined
// when the call failed or its hook saw no style.
export async function loadedStyle($: EngineInterface): Promise<string | null | undefined> {
  const w: { name?: string | null } = {};
  waiting.add(w);
  try {
    await $.prompt.compose({ tools: [PROBE] });
  } catch {
    // no answer; the caller treats undefined as unknown
  } finally {
    waiting.delete(w);
  }
  return w.name;
}

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

// How an outputStyle value stands for Katharsis. `on` is a qualified name, or
// any other spelling of a Katharsis name (bare, another case, spaces around
// it) the engine resolved to a style of that name, from an output style file
// of the user's own, or to the plugin's own qualified style. `unloaded` is
// such a spelling the engine loaded nothing for: the hooks stay idle and the
// prompt hook tells the user. `off` is every other style. loaded is asked only
// for a spelling other than a qualified name. When the engine gives no
// answer, it stays `on`, as a bare name was before this check existed, rather
// than tell the user a style is missing on no evidence.
export async function styleState(style: unknown, loaded: () => Promise<string | null | undefined>): Promise<'on' | 'off' | 'unloaded'> {
  if (typeof style !== 'string') return 'off';
  if (KATHARSIS_STYLES.has(style)) return 'on';
  if (!qualifiedFor(style)) return 'off';
  const name = await loaded();
  return name === undefined || name === style || KATHARSIS_STYLES.has(name ?? '') ? 'on' : 'unloaded';
}
