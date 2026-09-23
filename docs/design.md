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

## Guidance rather than fences

Katharsis teaches the model when and how to make a call, rather than fencing it in until it makes
none. A rule that stops a decision from being made costs more than the defect it prevents, because
the reply it leaves behind is either missing the call or shaped by a constraint the author never
intended. Every rule here is therefore a criterion with a stated cost rather than a prohibition,
and a rule reaches for a block only where the reader would otherwise have to reconstruct what the
reply meant. D20 and D21 state that test directly; the rest of the decisions below are written to
it.

## What it ships

| Deliverable | Files | What it does |
|---|---|---|
| The output style | `output-styles/katharsis.md`, `katharsis-coding.md` | The cue table for 11 exchange types, the reference codes, the question form. One body, two frontmatters (D12) |
| The guidance files | `styles/*.md` | One file per type, each following `katharsis-style-template.md`: cues, ceiling, shape, ambiguities, verification, examples. `README.md` holds the rules shared by all of them |
| The model notes | `styles/models/*.md` | One note per model family, attached by the per-turn reminder when the family changes and after a compaction (D31) |
| The routing script | `scripts/katharsis-exchange-style.sh` | Prints the guidance file for the type the model chose and stamps the type for the Stop gate (D2, D3) |
| The hooks | `hooks/hooks.json`, `scripts/session-link.sh`, `turn-reminder.sh`, `stop-classify.sh`, `ledger-stop.sh`, `stop-verifier.sh` | Five commands: the symlink, the per-turn reminder, the classification gate, the ledger, the reply verifier (D5 to D8, D21) |
| The hooks module | `hooks/register.ts`, `tests/register.test.ts` | The per-turn reminder as a function hook, loaded where Claude Code enables function hooks and silent elsewhere; the script hands the turn to it (D26) |
| The detector | `scripts/detect-reply.sh`, `scripts/packs/*.txt` | Runs the writing rules over one reply and prints a fix line per hit. Deterministic, no model in the loop; the verifier is its only caller in the plugin (D21) |
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

D5 - **No hook asks for the reply again, and a hook blocks only where the repair is something
appended** - the cost that ruled out the first verifier was the reprint rather than the block. A
second reply that repeats the first makes the reader work through content they have already read
to reach one changed paragraph, and the measurement that rejected that verifier found 10,679 of
16,984 reply words reprinted across 72 replies. A second reply carrying only an `E` line that
retracts a placement, plus the section that was missing, costs the added lines and nothing else,
so appending is the shape a block asks for and rewriting is out of bounds whatever the rule. A
rule with no appendable repair captures to the corpus without blocking, and every hook still
exits 0 on every path where it cannot help. The guidance shapes the reply before it is written;
the hooks count, record, and ask for the one missing piece afterward.

D6 - **A per-turn reminder line, because Claude Code reinforces built-in styles every turn and
never a custom one** - a custom style loads once into the system prompt and fades over a long
session. `turn-reminder.sh` runs on UserPromptSubmit, reads which output style is active, and
prints the classify-then-read instruction; the "output style is active" line it once printed
went in 0.4.0, because Claude Code now attaches that sentence itself. It also carries the reply's
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
plugin at one path. When the link is missing, the routing script falls back to its own location, since
`scripts/` sits beside `styles/` in the plugin; the setup skill and `kref` need the link. Writes go to `~/.claude/katharsis-data/`, because
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
disk after the hook reads it. `ledger/chains/<session>` makes a child session's numbering
continue a parent's. `turn-reminder.sh` writes it: a prompt naming a `/tmp/punt-*.md` file that
carries a `Ledger parent: <id>` line records that pair, and the link is written only for a
Katharsis session, because nothing else writes a ledger for `kref` to read. Any other handoff tool
that writes the same path gets the same effect.

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
the hooks leave no trace beyond the symlink and an empty data directory. `session-link.sh` prints
one line asking for setup until setup has run, so a fresh install surfaces the steps without a
README read.

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

D20 - **Every type takes the Questions round, and a decision belongs to the user once its effect
outlives the turn** - three guidance files used to list no Questions slot, and a Shape read as the
set of sections a type may carry turned that omission into permission to leave a call unasked. A
Shape says what a type usually needs, so all eleven now carry the slot and the shared rules say
the slot is never the reason a question goes missing. The companion half is which calls have to
reach it. A closed list of protected categories invites the argument that the case at hand is the
next one, so the test is a property instead: a call is the model's when the work stops without it
and a wrong answer stays inside what was just produced, and the user's when the effect keeps
happening after the turn ends, for people who never saw the reasoning. Ambiguity resolves the same
way, toward the reading whose blast radius ends with the turn.

D21 - **A rule blocks when the defect makes the reader reconstruct what the reply meant, and
captures when it only wastes words** - the line is the reading cost rather than the severity. A
decision or a finding the reader has to dig out of another code's line or out of running prose,
and a code carrying content that belongs to a different code, both send the reader back through
the reply to work out what it actually said, so they block. An opener announcing comprehension
costs the words it occupies and leaves every other line meaning exactly what it says, so it
captures to the corpus and the reply goes through. Two rules block today, both with appended
repairs: a decision asked from outside the Questions round, which fires on 48 of 2,470 captured
replies, 1.94%, with one of those firing on a question mark rather than an asking phrase; and an
opening that narrates the intended action and buries the finding under it. A conflated code was
measured for a lexical detector and did not support one, which the rejected alternatives record,
and D22 takes that slot. `detect-reply.sh` is a script rather than a hook so a saved reply can go
through it by hand, and `ledger-stop.sh` already resolves the duplicate codes a second reply
produces by letting the newest definition win.

D22 - **A code redefined mid-session blocks, and a code renumbered across turns captures** - a
code is an address, so "do NA1" is worth something only while the code names one thing. A code
carrying a different claim than the definition already on file for the session, with no `E` line
naming it, leaves every back-reference ambiguous, so it blocks. The repair is appended under D5:
an `E` line restating the code under its original definition, plus the new claim in full under a
fresh code. D30 replaced that form: the new claim now goes out under the same code, ending with
the erratum's code. The check runs inside `ledger-stop.sh` at write time, which is the one path where a
ledger hook blocks, because that hook's dedup drops the stored record whose code the new reply
reuses and the earlier definition is gone by the time anything downstream could compare the two.
The drifted record is dropped rather than written, since the repair reinstates the stored
definition and recording the retracted claim would leave `/kref` answering with the line the reply
itself withdrew. Two titles count as one claim when either contains the other or they share half
their words, where the corpus count is flat from 0.4 to 0.7 and the hits given up are a decision
restated in different words; a title under four words is never compared, because the lenient
coded-line pattern stops at the first colon or backtick and hands a fragment up as a title. A
cross-turn renumber captures to `telemetry/drift.jsonl` and never blocks. The harmful case there
is a paraphrase whose detail has moved, and it sits at the same title similarity as two genuinely
distinct findings about one file, so a matcher tuned to catch it fires on legitimate work.
Measured 2026-09-09 by replaying the 2,741-reply corpus through the hook: 34 replies blocked,
naming 39 drifted pairs of which 38 are genuine on a full read, and 2 renumbers captured.

D23 - **Every idea in uncoded prose sits under a `##` heading, with the answer line bare, no
size floor, and at most two paragraphs per heading** - coded content is scannable by header
and uncoded prose was scannable only by reading, so a reply with no codes had no structure.
The floor was rejected because a paragraph count is a loophole for a few large paragraphs;
the cap exists because "one idea" is the loophole that remains. A sentence that fits a code
is a coded line first, which keeps the headed prose from restating the groups. Guidance only:
the verifier checks nothing here, and `ledger-stop.sh` captures heading counts to
`telemetry/headings.jsonl` on the D22 pattern so the cap can be quoted after a week. Landed
2026-09-21 after the paired eval in `docs/evals/prose-headings.md` read headed on 12 of 12
pairs with the item order right on all 3 pairs that carried a group of three or more, and with
the alternatives rejected on the way recorded in `docs/proposals/0002-prose-headings.md`.

D24 - **Items inside a coded group run most important first, never in work order or discovery
order** - the item that mattered most sat below first position in 117 of 524 groups read on
2026-09-11, and in Next Actions in 13 of 29, because lists ran in the order the work happened.
Guidance only, on the same grounds as D23.

D25 - **A group of three or more items sharing one cause the answer line does not state opens
with one bare sentence naming the relation** - 138 of 524 groups left a shared cause for the
reader to infer, and the condition held in every group type, so the rule names the condition
rather than a list of groups. The answer line states the cause first when the reply has one,
because the 49 groups whose answer line did so read best; the group line is for a theme the
answer line does not carry. Item order was rejected as the sole fix because the two defects were
independent in every reader's judgment. Guidance only, with a per-reply count in
`telemetry/headings.jsonl`.

D26 - **The per-turn reminder moves to a function hook where the build loads one, and the
script stays for every other build** - Claude Code 2.1.278 loads a plugin's `hooks/hooks.json`
`modules` entry behind `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`, an undocumented, default-off,
early-access surface (`docs/research/function-hooks.md`). The reminder is the first mechanism to
move because two of its inputs are guesses in the script and facts in the module: the active style
comes from `$.settings.read()`, the merge the engine itself runs under, where the script parses
three files by regex and cannot see a `--settings` file or a policy (D7); and the untyped-turn kind
comes from `e.origin.kind`, the engine's own stamp for a task notification, a scheduled trigger, a
peer delivery or a plugin's prompt, where the script sniffs marker strings (D11). The text markers
stay for a skill load and a compaction resume, which arrive from the composer. The module writes
the same files in the same formats, so the Stop hooks and `kref` need no change. Dedupe is one
environment variable: the module's `session.start` hook sets `KATHARSIS_HOOKS_MODULE`, every
command hook inherits it, and `turn-reminder.sh` exits at once when it is set; a module that fails
to load never sets it, and a module whose prompt hook throws clears it in its `.catch` handler, so
the script is back on the next turn. The module omits the script's first line, "<style> output
style is active", because the engine attaches that sentence itself on every turn of a custom style
on 2.1.278, flag on or off (51 `output_style` attachments in one classic-hooks session, measured
2026-09-21), so the script's premise that only built-in styles are reinforced no longer holds
there. The script dropped the same line on 2026-09-22, so a user on a build older than the
attachment goes without it; that cost was taken over probing for the build that added it.
Rejected: replacing the script outright, because the flag is off by default and the API
header says the surface may change; and a Stop-side move, because `turn.complete` can show text
under a reply but cannot send anything back to the model, which the appended-repair block (D5,
D21) requires. Verified live 2026-09-22 in a headless session: one engine attachment, one module
block, zero script blocks, marker written.

D27 - **Work I can start this turn, I do this turn, and a question is asked once** - the
Questions round (D20) had grown a gate: every reply with a next action asked which one to take
or whether to start it, so a reply routinely handed over questions none of which blocked the
work, and the same question came back reply after reply. Anthropic's Opus 5.5 guide names both
as early stops. A next action now starts on the user's next message unless that message names
another, so whether to start it is never a question. A question goes out after the work that does
not depend on its answer is done, and later replies carry its code on an `Open:` line rather than
asking it again. `ledger-stop.sh` counts gate-shaped questions and re-asks per reply in
`telemetry/decisions.jsonl`, counts only, so the change is measurable. Rejected: blocking a gate
question at Stop, because the pattern is a heuristic and D21 reserves blocks for defects that make
the reader reconstruct meaning.

D28 - **A craft call is made silently, and a D line holds only a call the reader would see** -
D lines were filling with branch names, commit shapes, and staging choices that followed
convention and changed nothing the user or a colleague would notice. A D line now holds a call that
changes what the user or a colleague will see, or that departs from a stated convention, with the
reason in terms of what it changes for them. The mine-or-the-user's test (D20) is unchanged; this
decides which of my calls get reported. `decisions.jsonl` counts D lines per reply. Rejected: a
fixed list of reportable calls, because the property is visibility and no list covers it.

D29 - **A line states what is now true for the reader, and addresses come last** - findings led
with paths, hashes, and output fragments, which a reader switching between sessions has to decode
before learning what changed. The form is now `F1 - **what is now true, for the reader** - why,
in one sentence; where to look, last`, with at most one address per line in a code span and extra
addresses in a fenced block below the group. `decisions.jsonl` counts F and D lines carrying an
address and lines carrying two or more. Rejected: banning addresses, because the one the reader
would open is the point of some findings.

D30 - **A correction keeps the code, and the erratum holds the old wording** - a corrected item
used to take a fresh code while the old one stood, so two codes described one item and a reader
could not tell which to trust. The corrected line is now restated under its original code, ending
with the erratum's code, `F3 - **...** - ... (E4)`, and `E4 - **F3 as first written: ...** - ...`
holds what it said before. A voided claim becomes `F3 - **Withdrawn: <why>** - (E4)`. One item
keeps one code for the session, the ledger records the restated line as the code's definition,
and the D22 drift check passes a restatement whose marker names an E line in the same reply.
Rejected: keeping both codes live with a cross-reference, because it doubles the codes a reader
must reconcile, which is the defect this fixes.

D31 - **A per-family model note rides the prompt hook** - an output style is one text for every
model, and Anthropic's prompting guides for Fable 5.1, Opus 5.5, and Sonnet 5 name different leans
that each break a different Katharsis rule: Fable describes the next step instead of taking it and
under-formats, Opus ends turns early, and Sonnet reads example lists as the whole set. The prompt
hook reads the active model, maps it to a family by substring (fable or mythos, opus, sonnet), and
attaches `styles/models/<family>.md` when the family differs from the one recorded in
`.model-<sid>`, and again after a compaction, whose summary drops it. The script reads the last
model attachment in the transcript, which the harness writes at session start, on compaction, and
on every `/model` switch ahead of the hook, and falls back to the last assistant message's model;
the module asks `$.session.model()`. An unknown model gets no note. Rejected: one style file per
model, because output styles are session-wide and a `/model` switch cannot change them; and
restating the note every turn, because the note stays in context once sent. Verified live
2026-09-22: the note attached on this session's first turn after the hook landed.

## Rejected alternatives

- **A Stop hook that blocks and demands the reply be written again.** Measured and rejected
  under D5. The verifier that ships blocks for an appended repair only.
- **A rule set loaded from the memory file.** 0.2.x. The 60-day audit found the lever weak and the
  routing missing.
- **`force-for-plugin: true`.** See D13.
- **A frequency threshold or an allowlist for codes.** Detection by shape (D9) captures a code the
  model defines on the spot, which the style permits.
- **Serving the secondary type's file.** Measured under D4 and found to add nothing separable.
- **A block for a duplicate pair inside one reply.** Specified in D22 and measured out on
  2026-09-09. Over 2,741 replies, 361 of which carried two or more comparable coded items, an
  exact title match found 0 duplicates, and the six closest pairs are all distinct work: "Write
  `plan.md`" beside "Write `write.md`", "Fixed finding 2 in templates.md" beside "Fixed finding
  3". Loosening the match lands on those, which is the failure that already keeps the cross-turn
  renumber capture-only.
- **A lexical detector for a conflated code.** Measured over 2,403 coded items in 2,690 replies.
  One phrase cleared 0.7 sampled precision, and `r15` already fires on 5 of its 6 genuine hits with
  the same repair text, leaving 1 new item in 2,403. Decision-shaped and next-action-shaped content
  does not announce itself lexically: the seeds that read like decisions in the abstract returned
  zero or one hit each.

## Open items

- The re-measurement that gates 1.0.0 (D19).
- The prompt-free routing design in D14, which removes the permission entry setup exists to add.
- The rest of the function-hooks mapping in `docs/research/function-hooks.md`: the registered
  classify tool with its own `tool.check` answer (D14), and the status line under the prompt.
- Whether a cross-turn renumber can be detected without firing on distinct findings, which D22
  leaves as capture-only.
- Whether the plugin's `bin/` reaches bash mode's PATH, which `kref` in bash mode assumes.
  `docs/evals/style-path.md` checks it.
