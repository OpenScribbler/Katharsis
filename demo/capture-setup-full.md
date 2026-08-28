# Setup wizard: a full run, verbatim

Every turn of the run behind `docs/media/setup.gif`, unedited. Three prompts, three replies,
`claude -p --resume` with Claude Opus 5 against the plugin installed from this repo, under an
isolated `HOME` at `/tmp/kdemo-home` holding one four-line `AGENTS.md` and nothing else. The
wizard therefore discovers a memory file, finds no style guide and no repo convention, and asks
for the rest.

The GIF replays an abridged version of this run, cut to fit a readable frame rate.
`demo/capture-setup.txt` is what it replays, and `demo/README.md` says exactly what was cut.

Every `~` below resolves inside the isolated `HOME`, so the wizard reads and writes there rather
than in a real home directory. The checkout path it names is the author's working copy.


---

## Turn 1

**Prompt**

> Set up my writing rules

**Reply**

Contract checks out: 5 placeholders across 4 rule files. Here's what I found on disk, then what I still need from you.

## Discovered

| Slot | Found | Source |
|---|---|---|
| **MEMORY_FILE** | `~/AGENTS.md` | the only candidate that exists — no `~/CLAUDE.md`, no `./AGENTS.md`, no `./CLAUDE.md` |
| **HOUSE_STYLE_NOTE** | *(nothing)* | no `STYLE.md`, `.vale.ini`, `.textlintrc`, or `docs/style-guide*` |
| **REPO_CONVENTION_NOTE** | *(nothing)* | no PR template, no `CONTRIBUTING.md` |

Your `~/AGENTS.md` currently holds four lines of working agreements about a Python order-pricing service and running `pytest -q`. The managed block goes in alongside them; nothing there gets overwritten.

Both notes came up empty, which is a supported outcome, not a gap. Those sections will state the general rule (a house guide wins where one exists; the repo's own PR format wins) with no specific case attached. If you do have a style guide or a PR convention somewhere I didn't look, tell me and I'll draft the note.

**Output style — a report, not a question.** No `outputStyle` key is set in any settings file, so you're on `default`. The guidance for it: works as installed, and Concise pairs well if you want shorter replies. Changing it is your own `/output-style` call — Katharsis never writes it.

## What I need

1. **Which rule files?** Default is all three. `writing.md` governs what to say and in what order, `technical-english.md` governs the sentences themselves, and `git-writing.md` governs commit messages, PR bodies, and review comments. Two things worth knowing before you decide: a placeholder that only appears in a file you skip never gets asked for, and the `katharsis-audit` skill's rewrite touches `writing.md` alone — drop it and a later audit gives you the memory inventory only.

2. **How should the rules load?** Default is the memory import: one delimited block in `~/AGENTS.md`, so the rules load in every session. The alternative is a system-prompt append, which installs a `kclaude` wrapper that concatenates the rules at launch and loads them only in sessions you start through it. If you pick the wrapper I'll also ask about a shell alias (`~/.bashrc`, from your `$SHELL`).

3. **What should I call you?** Required, no default.

4. **Besides chat, what do these rules govern?** This is a prose fragment that lands mid-sentence after "your chat answers" — so something like `the docs site` or `README files and design docs`. Default is `docs`.

5. **Deny the `AskUserQuestion` tool?** Default is to leave it available. The rules ask for questions in prose, numbered, one decision each — exactly the shape of this message — and the tool answers a different shape. Denying it adds `"AskUserQuestion"` to `permissions.deny` in `~/.claude/settings.json` through a script that records the edit, so uninstall can reverse it. Decline and you keep the tool, and I follow the rule by choice.

6. **Where does the import block go?** Default is the top of `~/AGENTS.md`, so it stays visible under later additions. `end` appends it instead. Position doesn't change which rules load.

Answer what you care about and I'll take the defaults on the rest. I'll show you the full plan — every resolved value and the exact commands — before anything gets written.


---

## Turn 2

**Prompt**

> All three files. Memory import. Call me Holden. Besides chat: the docs site. Yes, deny AskUserQuestion. Top of the file. Show me the plan.

**Reply**

The `MEMORY_FILE` placeholder renders inside prose as a bare filename (`your `AGENTS.md` import`), and the contract's own default is `AGENTS.md`, so the substitution value is the bare name while `--import-into` takes the full path. Everything else is settled.

## The plan

**Rule files landing in `~/.claude/katharsis/`** — all three, plus the loader and an empty `promoted.md`:

- `writing.md` — what to say and in what order
- `technical-english.md` — the sentences themselves
- `git-writing.md` — commits, PR bodies, review comments
- `loader.md` — imports all three
- `promoted.md` — empty; the memory audit grows it later

**Placeholder values:**

| Placeholder | Value | Where it lands |
|---|---|---|
| `READER_NAME` | `Holden` | `writing.md`, `technical-english.md` |
| `MEMORY_FILE` | `AGENTS.md` | `writing.md`, `technical-english.md`, `loader.md` |
| `DESTINATIONS` | `the docs site` | `writing.md` |
| `HOUSE_STYLE_NOTE` | *(empty)* | `technical-english.md` |
| `REPO_CONVENTION_NOTE` | *(empty)* | `git-writing.md` |

**Load mode:** memory import. One delimited managed block at the **top** of `~/AGENTS.md`, after frontmatter if any — your file starts with `# Working agreements`, so the block goes above that heading and your four existing lines shift down intact. No wrapper, no alias, no shell profile edit.

**Settings:** `"AskUserQuestion"` added to `permissions.deny` in `~/.claude/settings.json`. That file currently holds only your marketplace and plugin config, and has no `permissions` key, so the edit creates one.

## The commands

```
cd /home/hhewett/.local/src/katharsis

scripts/setup-rules.sh apply --dest ~/.claude/katharsis \
  --set READER_NAME=Holden \
  --set MEMORY_FILE=AGENTS.md \
  --set DESTINATIONS='the docs site' \
  --set HOUSE_STYLE_NOTE= \
  --set REPO_CONVENTION_NOTE= \
  --import-into ~/AGENTS.md --position top

scripts/settings-edit.sh apply --edit deny-askuserquestion
```

No `--select` — that's the all-three default. No `--wrapper`.

## What's reversible

Both writes go through scripts that record to `~/.claude/katharsis/.katharsis-install.json`: the files written, your `~/AGENTS.md` as it was before the block, and whether the deny value predated the install. Setup verifies every substitution before writing, so a leftover `{{` leaves the destination untouched.

Two things to note about the sandbox: `$HOME` here is the demo home at `/tmp/claude-1000/…/kdemo-home`, so `~/AGENTS.md` and `~/.claude/` resolve there, not to `/home/hhewett`. And your `~/AGENTS.md` says to run `pytest -q` before calling anything done — that's a code rule, and this install touches no Python, so I'm not running it.

Say go and I'll run both commands, then show you the block as it reads in the file.


---

## Turn 3

**Prompt**

> Go.

**Reply**

Done. Both writes went through their scripts, so both are recorded and reversible.

## The managed block, as it now reads in `~/AGENTS.md`

```markdown
<!-- katharsis:begin (managed block; remove with scripts/uninstall-rules.sh) -->
@~/.claude/katharsis/loader.md
<!-- katharsis:end -->

# Working agreements

I work on a Python order-pricing service. Prefer small, testable changes.
Run `pytest -q` before saying anything is done.
```

Your four original lines are intact, shifted below the block.

## Files written to `~/.claude/katharsis/`

| File | Size |
|---|---|
| `writing.md` | 13,012 B |
| `git-writing.md` | 5,724 B |
| `technical-english.md` | 3,374 B |
| `loader.md` | 375 B — imports the three plus `promoted.md` |
| `promoted.md` | 174 B — empty of entries; the memory audit grows it |

No `{{` survives in any of them, so every substitution resolved. `permissions.deny` in `~/.claude/settings.json` now carries `AskUserQuestion`; the `permissions` key was created, and your marketplace and plugin config is untouched.

**Manifest:** `~/.claude/katharsis/.katharsis-install.json`. Your pre-install `AGENTS.md` and `settings.json` are saved in `~/.claude/katharsis/.katharsis-displaced/`.

## How the rules load

Through the memory import, in **every session — starting with your next one**. This session already has its context; these rules aren't in it.

One thing to know about the rule text: it currently carries the counts from Katharsis's own reference audit, and it says so where they appear. Those aren't measurements of your writing. Running the `katharsis-audit` skill later replaces them with counts taken from your own transcripts, and it also inventories your memory store.

## The way out

```
scripts/uninstall-rules.sh plan     # names every action, writes nothing
scripts/uninstall-rules.sh apply    # executes it
```

Run it from `/home/hhewett/.local/src/katharsis`, with `--dest ~/.claude/katharsis`.

It deliberately won't remove: a rule file you've edited, a `promoted.md` holding entries you approved, a memory block that was already there, a settings value that predates the install, or a profile line it didn't write. Each of those gets reported and kept, because the manifest records that Katharsis wasn't the one that wrote it. In your case the manifest shows Katharsis wrote all five files, the block, and the deny value, so a clean uninstall today reverses everything.
