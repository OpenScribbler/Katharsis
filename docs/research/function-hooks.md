# Function hooks: what the build offers Katharsis

Research notes, read against Claude Code 2.1.278 on 2026-09-21. Nothing here is a decision;
`docs/design.md` holds those. The API is marked early access in its own header and may change
between releases, so every claim below names the build it was checked on.

## What function hooks are

A plugin's `hooks/hooks.json` may name a hooks module under `modules`, one path relative to the
file, beside the classic `hooks` map. The module is a TypeScript or JavaScript ES module exporting
`register(on, options)`. Each `on(event, matcher?, hook)` adds a hook of the shape `($, e, next)`:
`$` is the engine interface, `e` the event's input as plain data, and `next(e)` continues the
chain to the other plugins and then the engine. A hook that returns without `next` answers for
itself; one that calls `next({ ...e, field })` rewrites what the chain beneath sees. The module
runs in the engine's own sandbox with no Node and no DOM, so the user needs no runtime beyond
Claude Code itself.

The events on this build: `tool.call`, `tool.check`, `tool.describe`, `ui.render`, `ui.resolve`,
`ui.press`, `ui.input`, `ui.select`, `ui.message`, `ui.scroll`, `ui.focus`, `agent.offer`,
`agent.spawn`, `prompt.submit`, `prompt.fill`, `prompt.suggest`, `prompt.edit`, `prompt.section`,
`prompt.context`, `prompt.attachment`, `command.run`, `command.describe`, `config.set`,
`config.describe`, `skill.prompt`, `attribution.text`, `session.start`, `session.receive`,
`session.compact`, `session.attach`, `session.detach`, `session.measure`, `session.end`,
`plugin.register`, `turn.start`, `turn.step` (streaming), `turn.complete`, `engine.create`.

The nouns on `$`: `plugin`, `ui`, `model`, `audio`, `mcp`, `session`, `turn`, `prompt`, `tool`,
`command`, `config`, `agent`, `fs`, `store`, `clock`, `http`, `process`, `settings`, `env`.

## Availability

- The feature sits behind the GrowthBook flag `tengu_plugin_hooks_modules`, whose default in
  the binary is false. `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` overrides it.
- Neither `code.claude.com/docs/en/hooks` nor the changelog through 2.1.278 mentions it.
- With the flag on, a built-in skill `plugin-authoring` appears, and `/plugin-types [dir]`
  writes `claude-code.d.ts` (502 KB on this build, 12,586 lines) from the running build.
  That file is the reference; the skill text says not to guess at an event's input or a
  method on `$`.
- `claude plugin validate <dir>` reads the manifest and module source and reports what the
  engine would refuse. `claude plugin test <dir>` runs `*.test.ts` files against the engine.
  `claude --plugin-dir <dir>` loads from disk and hot-reloads the module on save.
- Classic command hooks and a hooks module coexist in one `hooks.json`, so a plugin can move
  one mechanism at a time.

## Mapping to what Katharsis does today

Each row names the current mechanism, the design decision behind it, and the primitive that
could replace or extend it. Verified means the type file states it; test means it needs a
live check.

| Today | Decision | Primitive | Status |
|---|---|---|---|
| `turn-reminder.sh` prints the reminder to stdout at UserPromptSubmit | D6 | `prompt.submit` hook returns `next({ ...e, context: [...] })`; each entry is one hidden block the model reads after the prompt | Verified |
| `turn-reminder.sh` sniffs marker strings (`<task-notification>`, `<command-name>`, ...) to detect an untyped turn | D11 | `e.origin.kind` on `prompt.submit`: `composer`, `task-notification`, `scheduled-trigger`, `peer`, `plugin`, `sdk`, `auto-continuation`, `unclassified`, and others | Verified; skill loads and compaction resumes still need a text check |
| `turn-reminder.sh` parses three settings files by regex to learn the active output style | D7 | `$.settings.read()` returns the merged settings the engine runs under, `outputStyle` included; `{ source }` reads one file | Verified |
| The model runs a Bash script to fetch the guidance, and setup adds one `permissions.allow` entry for it | D2, D3, D14 | `$.tool.register({ name: 'classify', inputSchema })` at `session.start`; a `tool.call` hook on `mcp__katharsis__classify` returns the guidance file as the result and records the stamp; a `tool.check` hook on the same tool answers `allow` | Verified for register and call; the permission path needs a test |
| Stamp files `.exchange-state-<sid>` in the data directory | D10 | In-module state keyed by `$.session.id()`, or `$.store` | Verified |
| `stop-classify.sh`, `ledger-stop.sh`, and `stop-verifier.sh` read `last_assistant_message` at Stop | D5, D9, D21 | `turn.complete` carries `answer`, `durationMs`, `reason`, `turnId`, `usage` | Verified |
| `stop-verifier.sh` blocks with exit 2 so the model appends an errata section | D5 | No equivalent: `turn.complete` returns `{ text }`, and a text other than the answer is shown beneath it, never sent to the model. `$.prompt.submit` starts a new turn with plugin origin instead. Keeping the classic Stop hook for the block is the low-risk path | Verified absence |
| The ledger as JSONL under `~/.claude/katharsis-data` read by `kref` from a shell | D8, D9 | `$.fs.write` keeps the files where `kref` finds them; `$.store` is a single JSON file capped at 4 MiB, so it fits counters and the last type but not the ledger | Verified |
| The reminder line carries the next free code numbers | D18 | `$.ui.status(text)` pins one line per plugin under the prompt until replaced; `undefined` clears it | Verified |
| Gate-miss telemetry, counts only | D17 | `$.ui.log(text, { to: 'debug' })` writes the debug log; the JSONL stays as the shareable record | Verified |
| `kref-h` renders HTML to a file | D9 | `command.run` hook on a plugin command answers `{ text, context? }`; a `ui.render` hook on `CommandOutput` draws it as a tree; `$.ui.open` opens a `Pane` | Verified |
| Codes survive compaction through the ledger and the reminder line | D18 | `session.compact` exposes `instructions` and `messages` for rewrite before the summary runs | Verified |
| No display shaping of the reply | D23 | `ui.render` on `AssistantMessage` receives `text` and returns a tree; the drawing changes and the transcript does not | Verified |

## Primitives that touch a decision rather than a mechanism

- `$.model.classify(text, labels)` returns one label. D2 says the model classifies, and a
  second classifier would not change that, but the divergence between the model's stamp and
  the label could be recorded as telemetry to measure how often the cue table is misread.
- `prompt.section` and `prompt.attachment` rewrite system prompt sections and the engine's own
  `<system-reminder>` attachments. Katharsis could carry its rules there, which is a different
  product from an output style. Noted, not proposed.
- `skill.prompt` sees every skill's text as expanded, `punt` included, which is where the
  handoff-chain link in `turn-reminder.sh` could move.

## What the first slice verified (2026-09-22)

`hooks/register.ts` ships the reminder row of the table above. Checked live on 2.1.278 in a
headless session with `--plugin-dir .`:

- The engine loads a `.ts` module named in `hooks.json` `modules` beside the classic `hooks`
  map, and the classic hooks keep running.
- `$.env.set` in `session.start` reaches every command hook started afterwards, so one
  variable is enough for the script to step aside: one module block, zero script blocks.
- `$.settings.read()` returns `outputStyle` as the engine resolves it.
- `$.process.run` with `env` runs `kref.sh --next` from the plugin root, and `$.fs.write`
  creates the data directory's parents.
- `claude plugin test` answers every noun beneath the plugin from `on('settings.read')`,
  `on('fs.write')`, `on('process.run')` and the like, so the tests need no disk.
- The engine attaches "<style> output style is active" itself on every turn of a custom style,
  with the flag off as well as on. The script's first line has been a duplicate on this build.

## Open checks before any of this ships

1. Does a `!` bash-mode turn raise `prompt.submit`, `command.run`, or nothing? D11 records
   that no classic hook event fires before the model replies.
2. Does a plugin-registered tool prompt for permission in default mode without a `tool.check`
   hook, and does a `tool.check` answer of `allow` from the same plugin remove the prompt?
3. What does an older build do with a `hooks.json` that names `modules`? On 2.1.278 with the
   flag off the classic hooks run and the module is ignored; older builds are unchecked.
4. Under `claude -p`, `session.start` reports `surface: null`. Every UI call must be a no-op
   there rather than an error.
5. Whether a hooks module can read the reply text of a turn a classic Stop hook blocked, so
   the two mechanisms do not double-record the ledger.

## Reproducing this read

```
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude -p "/plugin-types /tmp/fh-types"
```

writes the type file for the installed build. The skill text is what `/plugin-authoring`
loads; the headless run that captured it is in the session log for 2026-09-21.
