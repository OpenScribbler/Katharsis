// style.ts: whether this session's outputStyle loads Katharsis, shared by the
// prompt hook (register.ts) and the drawer (drawer.tsx).
//
// Claude Code loads the plugin's style only under its qualified name,
// katharsis:Katharsis or katharsis:Katharsis coding. A settings file holding
// the bare "Katharsis" loads no style body, unless an output style file of
// the user's own goes by that name (claude -p probes on 2.1.309 and 2.1.321).
// Rather than repeat Claude Code's output-style loader, the module asks the
// engine: every prompt.compose carries the style the engine resolved in
// `e.outputStyle`, null when the setting named none it could load (a probe
// plugin on 2.1.321 saw null for a bare "Katharsis", and the name
// "Katharsis" when a project style file went by it).

import type { EngineInterface, PromptComposeInput } from 'claude-code';

const KATHARSIS_STYLES = new Set(['katharsis:Katharsis', 'katharsis:Katharsis coding']);

// Each bare name a settings file may hold, with the qualified name to set.
export const BARE_STYLES = new Map([
  ['Katharsis', 'katharsis:Katharsis'],
  ['Katharsis coding', 'katharsis:Katharsis coding'],
]);

// The style name the engine last composed a system prompt for: null for no
// custom style, undefined until a compose has been seen.
const composed: { name?: string | null } = {};

// The prompt.compose hook's record of the style the engine resolved. A
// compose whose input leaves the style out, as the test kit's does for a
// plugin's own call, says nothing and changes no record.
export function noteComposed(e: Partial<Pick<PromptComposeInput, 'outputStyle'>>): void {
  if (e.outputStyle === undefined) return;
  composed.name = e.outputStyle?.name ?? null;
}

// The style the engine resolves now. A compose this module asks for runs the
// module's own prompt.compose hook, which records the name; when the call
// fails, the last compose the engine made answers instead.
export async function loadedStyle($: EngineInterface): Promise<string | null | undefined> {
  await $.prompt.compose().catch(() => undefined);
  return composed.name;
}

// How an outputStyle value stands for Katharsis. `on` is a qualified name, or
// a bare one the engine loaded a style by, from an output style file of the
// user's own. `unloaded` is a bare name the engine loaded nothing for: the
// hooks stay idle and the prompt hook tells the user. `off` is every other
// style. loaded is asked only for a bare name, and a bare name stays `on`
// while the engine's answer is unknown, as it was before this check existed.
export async function styleState(style: unknown, loaded: () => Promise<string | null | undefined>): Promise<'on' | 'off' | 'unloaded'> {
  if (typeof style !== 'string') return 'off';
  if (KATHARSIS_STYLES.has(style)) return 'on';
  if (!BARE_STYLES.has(style)) return 'off';
  const name = await loaded();
  return name === undefined || name === style ? 'on' : 'unloaded';
}
