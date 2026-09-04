# Katharsis design

The durable record of what Katharsis is, what was decided, and why. Read it before changing the
output style, a guidance file, or a hook. The decisions for the 0.2.x rules product, which 0.3.0
removed, are in this file at the `katharsis--v0.2.1` tag, and `docs/proposals/0001-reversible-install.md`
refers to that numbering.

## The problem

A reply from a coding agent has one shape whatever the message was. A four-word status check, a
one-letter approval, a bug report, and a request for a diagnosis all come back as a paragraph of
narration with the answer somewhere in the middle and an offer at the end. Writing rules attack
the sentences and the structure, and 0.2.x shipped a measured set of them. A 60-day audit of the
author's own sessions found the rules were the weaker lever. The replies that landed were the ones
that opened with the answer and stayed under the length the question warranted, and both
properties depend on knowing what kind of exchange the message is. A rule about sentences cannot
supply that.

Katharsis makes the classification an explicit step. The model names the exchange type before it
writes, reads a guidance file for that type, and shapes the reply to that file's ceiling, opening
line, and exclusion list. A pass over 13 comparable projects found rule sets and output styles
and none that classified the ask first, so routing is the product and everything else supports it.

## What it ships

| Deliverable | Files | What it does |
|---|---|---|
| The output style | `output-styles/katharsis.md`, `katharsis-coding.md` | The cue table for 11 exchange types, the reference codes, the question form. One body, two frontmatters (D12) |
| The guidance files | `styles/*.md` | One file per type, each following `katharsis-style-template.md`: cues, ceiling, shape, ambiguities, verification, examples. `README.md` holds the rules shared by all of them |
| The routing script | `scripts/katharsis-exchange-style.sh` | Prints the guidance file for the type the model chose and stamps the type for the Stop gate (D2, D3) |
| The hooks | `hooks/hooks.json`, `scripts/session-link.sh`, `turn-reminder.sh`, `stop-classify.sh`, `ledger-stop.sh` | Four commands: the symlink, the per-turn reminder, the classification gate, the ledger (D5 to D8) |
| kref | `scripts/kref.sh`, `bin/kref*` | Reads the ledger back, in the terminal or as HTML (D9) |
| Setup | `scripts/setup.sh`, `skills/setup/` | Adds the one permission entry the routing script needs and names the two styles (D14) |

## Decisions

D1 - **The reply is shaped before it is written, by a file the model reads for this message's
type** - a rule set is loaded once and fades; a guidance file read at the moment of writing is
in context when the writing happens. Each file's Shape and Ceiling name what opens the reply and
where it stops for that type alone, which is how a status check comes back in a sentence and a
diagnosis gets room to argue.

D2 - **The model classifies; the script only delivers** - `katharsis-exchange-style.sh` takes the
type as an argument and never inspects the message. Classification is judgment, and the cue table
and the 11 split rules in the style carry it. The script validates the type against the files in
`styles/`, so a typo exits non-zero with the valid set, and a misclassification stays the model's
error rather than a parser's.

D3 - **Running the script is the read** - printing the file to stdout puts it in the model's
context as a tool result, so there is no path where the script ran and the guidance is absent. An
environment variable cannot carry this: a Bash call runs in its own shell and hooks are separate
subprocesses, so nothing exported reaches a later hook or a later turn.

D4 - **Two types at most, and only the primary's file is served** - a message can carry two
exchange types, and the primary is the one whose part carries the user's next action. It governs
the opening line, the exclusion list, and the ceiling, which is the tighter of the two. A live A/B
run served the secondary's Shape, Ambiguities, and Verification sections beside the primary's file
and found they added nothing separable in 6 of 8 cases, and only a one-sentence position on an
idea in the other 2, so that sentence now lives as a clause in every primary's Shape and the
secondary is validated and stamped but not printed. Three or more types go to `default.md`.

D5 - **Hooks reinforce and never block** - every hook exits 0 on every path, and no hook asks for
a rewrite. A Stop hook that blocks can only produce a second reply after the first is on screen,
which doubles the output and clutters the transcript. The guidance shapes the reply before it is
written; the hooks count and record afterward. An earlier verifier that blocked and demanded
rewrites was measured and rejected on those grounds.

D6 - **A per-turn reminder line, because Claude Code reinforces built-in styles every turn and
never a custom one** - a custom style loads once into the system prompt and fades over a long
session. `turn-reminder.sh` runs on UserPromptSubmit, reads which output style is active, and
prints one reminder line plus the classify-then-read instruction. It also carries the reply's
verification checklist, because verification cannot live at Stop: a Stop hook has no advisory
path, so injecting there means a block, and here it costs nothing and arrives before the reply is
written. On a turn nobody typed, the hook stamps the inherited type itself (D11).

D7 - **One marker decides whether Katharsis is active, and the Stop hooks do nothing without
it** - plugin hooks fire in every session whatever output style is active, so without a gate a user
who installed the plugin and picked another style would get telemetry and ledger rows written.
`turn-reminder.sh` is the single place that reads settings, and when Katharsis is active it writes
`.active-<session>` into the data directory. `stop-classify.sh` and `ledger-stop.sh` exit at once
when that marker is absent, so they need no settings parsing of their own. Which style is active
comes from the settings files in the order `/config` writes them: the project's
`.claude/settings.local.json`, then the project's `.claude/settings.json`, then
`~/.claude/settings.json`. The harness does not read `~/.claude/settings.local.json` at all
(measured 2026-09-02), so that file is never consulted. The plugin-qualified name
`katharsis:Katharsis` is what `/config` saves, so the match accepts it and the bare name.

D8 - **Code at a fixed symlink, data in a separate directory** - the style markdown and the
model's own Bash calls cannot expand `${CLAUDE_PLUGIN_ROOT}`; only hook commands can. A marketplace
install lands in a versioned cache path that changes on every update, so nothing outside a hook
can be given that path once. `session-link.sh` runs at every SessionStart and points
`~/.claude/katharsis` at the plugin root, so the style, the model, and the user's shell reach the
plugin at one path. When the link is missing, every script falls back to its own location, since
`scripts/` sits beside `styles/` in the plugin. Writes go to `~/.claude/katharsis-data/`, because
the cache is read-only and replaced on update, and because `kref` runs from the user's shell with
no hook variables. Rejected: `${CLAUDE_PLUGIN_DATA}`, persistent across updates but available
only inside hook commands, with an undocumented path segment `kref` could not find. Rejected:
exporting the path through `CLAUDE_ENV_FILE`, which reaches the model's Bash calls but not the
style's paths or the user's shell. `KATHARSIS_DIR` and `KATHARSIS_DATA` override both for tests.

D9 - **The ledger is one file per session, keyed by the launch project, and the newest definition
of a code wins** - two sessions in the same repo never share a file, which removes interleaved
appends and torn lines outright with no lock. The project key is the transcript's parent
directory rather than `cwd`, because `cwd` moves with every `cd` the model runs and keying on it
split one session across two directories. Detection is by shape rather than an allowlist, so a
code the model defines next week is captured with no edit, and the stock set becomes a
`known` field `kref` sorts on. A code redefined later in the same session supersedes the earlier
record. The reply is read from the hook payload's `last_assistant_message`, never the transcript
file, because the harness flushes the transcript asynchronously and a fast text-only turn lands on
disk after the hook reads it. `ledger/chains/<session>` is the hook point for a handoff tool:
whatever writes a parent session's ID there makes the child's numbering continue the parent's,
and nothing in the plugin writes it.

D10 - **The stamp is written before the guidance prints** - writing it last made it hostage to
anything that closes stdout early. A `| head -20` sends SIGPIPE mid-print, the script dies before
the write, and the gate reports a skip for a turn that classified fine. The cost is that a
truncated read now satisfies the gate. The stamp is keyed by session ID so two concurrent sessions
neither satisfy nor consume each other's, and the gate deletes the stamp it reads, which is what
makes a stamp belong to one turn. The gate also reaps stamps and markers older than six hours,
because a session that ends without a Stop hook firing leaves one behind forever.

D11 - **A turn nobody typed inherits the last typed message's type** - a task notification, a
skill invocation, or a compaction summary starts a turn with no message to classify, and the reply
still serves the last message the user typed. Over 14 days of the author's sessions, 75 of 211
turns with a visible reply were of this kind and went unshaped, and the uncoded caveat paragraphs
concentrated in them. The prompt hook recognizes those turns from the payload, stamps the
inherited type itself, and tells the model not to run the script. A bash-mode turn is the one
untyped turn the prompt hook never sees, because no hook event fires for `!` input before the
model replies (probed 2026-09-04: only MessageDisplay and Stop fired, both after the reply). The
gate records its inheritance from the last stamp as `inherited` rather than counting a miss the
model could not avoid. When the command was `kref`, the reply is the single word "Logged.": the
output answers the user's own question, and an empty reply costs more than the word because the
harness answers it by re-invoking the model.

D12 - **Two styles, one body** - `keep-coding-instructions` is frontmatter a user cannot set on a
plugin's file, and its default drops Claude Code's built-in software-engineering instructions. So
`katharsis:Katharsis` carries no key and `katharsis:Katharsis coding` carries `true`, and a test
holds the two files identical below the frontmatter so the body is edited once.

D13 - **The user picks the style; nothing forces it** - `force-for-plugin: true` would override
the user's own `outputStyle` setting the moment the plugin was enabled, which contradicts D5's
posture. The cost is that a user who installs and never opens `/config` gets nothing, and with D7
the hooks leave no trace beyond the symlink either. `session-link.sh` prints one line asking for
setup until setup has run, so a fresh install surfaces the steps without a README read.

D14 - **Setup is one script with two entry points, and it adds the one thing a plugin cannot** -
the style has the model run the routing script every turn, and in default permission mode that
Bash call prompts on first use each session. A plugin cannot pre-grant permissions, so `setup.sh`
adds the one `permissions.allow` entry to `~/.claude/settings.json`, idempotently, and the
`/katharsis:setup` skill runs the same script rather than editing settings itself, so the two
paths cannot diverge. A prompt-free design exists, where the model reads `styles/<type>.md`
directly and a PostToolUse hook on Read stamps the type from the path, and it waits for a later
release because it is not the path the audit measured.

D15 - **Every script ships with a suite that asserts planted outcomes** - each script under
`scripts/` has a `tests/test-*.sh` that runs it as a black box against a temporary directory,
asserting exact output lines, file contents, and exit codes. Failure paths are tests too, because
the exit-0 guarantee in D5 is a behavior a refactor can silently drop. The style and the guidance
files are exempt as prose, except for the two-body check in D12 and the check that every type in
the style's table has a file in `styles/`. `tests/run-tests.sh` runs every suite and must pass
before a commit.

D16 - **The rules product is removed outright rather than kept as a legacy path** - 0.2.x had at
most a handful of installs, and a legacy path would carry two installers, two uninstallers, and
two documents describing what the plugin does. The CHANGELOG tells a 0.2.x user to run 0.2.1's
uninstaller before upgrading, and `session-link.sh` names the one 0.2.x leftover that breaks
0.3.0, the `~/.claude/katharsis` directory the symlink cannot replace.

D17 - **Telemetry carries counts and never message text** - a gate miss records when, which
session and project, what kind of turn started it, how many tool calls it made, and how long the
reply was. The file can be shared in a bug report without a read of the reply.

D18 - **Codes number continuously through a session and across a handoff chain, and the prompt
hook carries the counters** - "more on F3" only works if F3 is never reused. `kref --next` reads
the ledger for the next free number per prefix, and `turn-reminder.sh` prints that line every
turn, so the numbering survives a context compaction that dropped the earlier replies.

D19 - **0.3.0, not 1.0.0** - the style is measured against the author's own sessions and not yet
against the post-release ones. 1.0.0 waits for a re-measurement against the pre-style baseline.

## Rejected alternatives

- **A Stop hook that verifies the reply and blocks a bad one.** Measured and rejected under D5.
- **A rule set loaded from the memory file.** 0.2.x. The 60-day audit found the lever weak and the
  routing missing.
- **`force-for-plugin: true`.** See D13.
- **A frequency threshold or an allowlist for codes.** Detection by shape (D9) captures a code the
  model defines on the spot, which the style permits.
- **Serving the secondary type's file.** Measured under D4 and found to add nothing separable.

## Open items

- The re-measurement that gates 1.0.0 (D19).
- The prompt-free routing design in D14, which removes the permission entry setup exists to add.
- Whether the plugin's `bin/` reaches bash mode's PATH, which `kref` in bash mode assumes.
  `docs/evals/style-path.md` checks it.
