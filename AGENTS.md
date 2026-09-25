# AGENTS.md

Instructions for AI agents working in `OpenScribbler/Katharsis`. This file is the source of truth; `CLAUDE.md` points
here. Everything below is a default, and the person prompting you overrides it. `README.md` is for people deciding
whether to install Katharsis; this file is about how to change it and how to talk to the person who owns it.

## What this repo is

Katharsis is a Claude Code plugin. It makes the model classify each message the user sends into one of 11 exchange
types, read the guidance file for that type, and shape the reply to fit: what opens it, what stays out, and how long
it may run. Around that sits a set of hooks that stamp the classification, record every reference code a reply
defines into a ledger, and hold a reply once when a few appended lines would repair it. A function-hooks module draws
the drawer inside Claude Code.

You are almost certainly running under Katharsis while you change it. When the plugin is installed from this clone,
`~/.claude/katharsis` points at the working tree, so an edit to `styles/` or `output-styles/` shapes your own next
reply, and a branch switch changes the live hooks in every session on the machine.

## What we never compromise on

A change that hurts any of these does not ship, however small.

1. **Evidence decides the style.** Every ceiling, cue, and shape in a guidance file came out of an A/B run or the
   ledger. A change to one states in the PR body what was measured, over how many replies, and what moved. Intuition
   about what reads better is a hypothesis to test, never a reason to merge.
2. **Guidance over fences.** A behavior we want from the model is written as guidance in a style file. A hook holds a
   reply only when the repair is a few appended lines that leave every line already on screen correct, and no hook
   ever asks for the reply to be written again. Every hook exits 0 on every path it cannot help on: a malformed
   payload, a missing reply, an unwritable data directory. A failed hook costs the user a ledger row, never a turn.
3. **The docs describe what the code does.** Every claim in `README.md` and `website/` about hook behavior points to
   something in `scripts/` or `hooks/` that does it. No hard-coded counts that go stale, and Claude Code's own names
   for its UI.
4. **The user's data stays theirs.** Telemetry records counts and never message text. The ledger and everything
   under `~/.claude/katharsis-data/` outlive the plugin, and nothing we ship deletes them.

## Glossary

Use these words when you describe things back to me.

- **You** are the agent reading this file and changing Katharsis.
- **I**, **me**, and **we** mean Holden Hewett (`holdenhewett`), who maintains Katharsis.
- **User** means a person who installed Katharsis and reads its replies. Your own session has a user too, and it is
  usually me.
- **Reply** is a finished assistant message the user reads. Katharsis shapes replies, not tool calls or files.
- **Exchange type** is one of the 11 classes in the style's cue table, such as `work-request` or `approval`. Never
  "category", "mode", or "intent".
- **Guidance file** is the `styles/<type>.md` file for one exchange type. **The style** is the shared body of the two
  files in `output-styles/`. `styles/README.md` holds the rules every guidance file shares.
- **Cue** is a row entry in the classification table that points a message at a type. A **split** (S1, S2, …)
  settles a message two types both claim.
- **Ceiling** is a type's word limit for a reply, counting everything the reader reads.
- **Reference code** is a coded line such as `F3` or `AT2`. Codes number continuously within a session and stay in
  the chat; they never appear in a commit, PR, changelog, issue, or file.
- **Typed turn** is a message the user typed. An **untyped turn** (a task notification, a skill invocation, Stop-hook
  feedback) inherits the type of the last typed turn.
- **Stamp** is the record the routing script writes when the model classifies a turn. A **gate miss** is a typed
  turn that ended with no stamp.
- **Hold** is a Stop hook stopping a reply once and asking for the missing lines. Never "block" or "reject" in docs.
- **Ledger** is `~/.claude/katharsis-data/ledger/`: every coded line every reply defined, per project and session.
- **Drawer** is the in-app view of the ledger: the **band** above the prompt, the **pane** `/kdrawer` opens, and the
  **chips** under a reply.
- **Model note** is a `styles/models/<family>.md` file the prompt hook attaches when the model family changes.
- **kref** is the terminal and HTML reader for the ledger (`bin/kref`, `kref-m`, `kref-h`). Using it means a code
  left the user's context; it is not a log of bad replies.

## Who does what

- **You draft; I publish.** You write commit messages, PR bodies, and issue text from the work you did. Show anything
  that leaves the session before posting it.
- **I merge, tag, and release.** Prepare the changelog section and stop.
- **Follow-up work becomes a GitHub issue** in `OpenScribbler/Katharsis`, naming the improvement and where you saw it.
- **Deletions from a steering file are approved before the edit.** Before removing or rewording a rule in
  `AGENTS.md`, `CLAUDE.md`, the style, a guidance file, or a model note, list each cut with the text it removes and
  get a yes. Additions need no preview, but a new rule still needs its evidence.
- **Questions from me are read-only.** When I ask how something works or whether an approach is sound, answer; do not
  start editing. A research or planning brief means no file edits.
- **Destructive git needs the command named.** `reset --hard`, force pushes, and `branch -D` run only when the prompt
  names that command, and that holds for every subagent you brief.

## Ways this goes wrong

Each of these has happened on this repo more than once, and each is still possible.

- **Docs that sound right and describe nothing.** Name a UI element only after you have seen it or found it in
  `hooks/`; a pane or setting you infer from context is an invention. Cut any sentence that would fit any plugin.
- **Answering from memory.** A claim about Claude Code, a model's behavior, or why a rule exists comes from the code,
  the ledger, or a run on this machine. Say which one.
- **Building before measuring.** Try the deterministic check first, and add a hook, a pack, or a module only after
  it falls short. Say what you tried.
- **A merged fix is not a live fix.** The output styles follow the checked-out branch, but the hooks, the drawer, and
  `styles/README.md` come from the installed plugin, which changes only on a version bump and reinstall. Before
  crediting a fix or blaming a regression, check which code ran: the cache's version in
  `~/.claude/plugins/installed_plugins.json`, the `~/.claude/katharsis` symlink target, and the checked-out branch.
- **A branch switch changes every session's style.** Switching to an older branch rolls back the style in every open
  session. Do parallel work in a worktree.

### What a guidance change must not bring back

These came from rules we have since removed. Check a change to the style or a hook against them before proposing it.

- **A mandatory section manufactures its contents.** Requiring `## Questions` in every type doubled the questions
  per reply, and reserved group headings appeared in half of all replies once the style named them. The trigger for
  any structure is the content, never the reply type.
- **A hold teaches what its repair asks for.** Holding on an ask outside the Questions round taught the model to ask
  more, so that check now captures and never holds. Hold only on a mechanical defect whose repair adds nothing you
  would not want repeated.
- **Forbidding a behavior in the style does not stop a hook from producing it.** Restated open questions rose after
  the style banned them, because the hook-side repair never shipped. A fix that lives in both places ships in both.

## Hit every surface

The most common defect here is a change made in the file you were looking at and missed everywhere else the same
behavior lives. Before calling work done, walk this list:

- **Both output styles.** `output-styles/katharsis.md` and `katharsis-coding.md` share one body, and
  `tests/test-exchange-style.sh` fails when they differ.
- **The shared rules.** A change to the reference-code table or a rule every type shares lands in both the style and
  `styles/README.md`.
- **Every guidance file the rule touches**, and the type's row in the style's cue table when a cue, ceiling, or split
  moves. A new exchange type also touches the routing script's valid set; find every place with
  `grep -rn 'factual-question' scripts/ hooks/ tests/`.
- **The model notes** in `styles/models/`, when a change targets one model family's lean.
- **The docs.** `README.md` and the matching page under `website/src/content/docs/` describe the same behavior and
  change together.
- **The demo.** `demo/captures/` and `demo/media/` go stale when the reply shape changes. Say so in the PR rather
  than leaving stale GIFs unmentioned.
- **The changelog.** Anything an installer sees adds a line under `[Unreleased]` in `CHANGELOG.md`: a guidance file,
  the style, a hook, a script, a manifest, a documented behavior. Tests, CI, and housekeeping add nothing.
- **Tests.** A new script arrives with its suite under `tests/`, executable, asserting exact outputs and exit codes.

## Building and testing

CI runs these on every PR, and the ruleset on `main` requires them:

```bash
bash tests/run-tests.sh                        # every tests/test-*.sh suite
shellcheck -S warning scripts/*.sh tests/*.sh
claude plugin validate --strict .
claude plugin tag --dry-run --force .          # plugin.json and marketplace.json agree
```

Run `claude plugin test .` too whenever you touch `hooks/`; CI does not run the hooks module's tests yet, so nothing
else catches a break there. The website builds with `cd website && bun install && bun run build`.

A few ways to hurt yourself:

- **Claude Code's function-hooks surface is undocumented.** Read `.claude/types/claude-code*.d.ts` (regenerate with
  `/plugin-types` after a Claude Code update) or run it on this machine's build; never answer from memory.
- **The drawer is not done until you see it.** It needs Claude Code 2.1.278 or later,
  `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`, and a restarted session. Check it in a live session before saying it works.
- **Kill processes by PID.** `pkill codex`, `pkill tmux`, or `pkill vhs` hits other sessions on the machine.
- **Codex's read-only sandbox cannot run the suites**, because `mktemp` fails there. A delegated review says the tests
  went unrun or runs with workspace-write.
- **Two sessions, one working tree, is a collision.** Use a worktree for parallel work. A conflict in the
  changelog's `[Unreleased]` section resolves by keeping both lines.

## Git and prose

Commit messages and PR bodies follow `.github/PULL_REQUEST_TEMPLATE.md`: Situation, Target, Proposal. A commit body
says only what the diff cannot show. The prose in this repo follows the style it ships: the answer first, one term
per concept, complete sentences.

## Questions

Always put every question, decision, and request for my input on its own line, so it stands out from the prose
around it; never bury one in a paragraph. Ask in prose, one decision per question, with the options and a
recommendation inside the question. Ask only for a call that is
mine: expensive to undo or reaching past this machine, and not inferable from what I said, the repo, or this file.
Everything else, decide and say so in a clause.

## How we work

- Try the smallest change that could work, and a deterministic script before an LLM step. Justify a new file or
  section in one line.
- Disagree plainly, with evidence, and correct me when I am wrong.
- Say "I think" when unsure, and never state a guess in the register of a fact.
- Implement what was asked. No extra configurability, abstractions, or fallbacks.
