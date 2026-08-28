# Setup skill, rules on: a full run, verbatim

The rules-on side of [the setup skill eval](../setup-skill.md). Three prompts, three replies,
`claude -p --resume` with Claude Opus 5 against the plugin installed from this repo, under an
isolated `HOME` holding one four-line `AGENTS.md` and nothing else. The three files from
`dist/rules/` were concatenated and passed with `--append-system-prompt-file`, so the rules were
already loaded while the skill installed them.

The prompts are word for word the ones the rules-off run answered, which is what makes the pair
comparable. [setup-skill-rules-off.md](setup-skill-rules-off.md) is that run.

Every `~` below resolves inside the isolated `HOME`, so the wizard reads and writes there rather
than in a real home directory. The checkout path it names is the author's working copy.


---

## Turn 1

**Prompt**

> Set up my writing rules

**Reply**

Contract check passed, and discovery is done. No files exist in the working directory itself, so both optional notes have nothing to attach to.

## Findings

F1 - **Memory file** - `~/AGENTS.md` is the only candidate on disk (4 lines, a working-agreements note about a Python order-pricing service); `~/CLAUDE.md`, `./AGENTS.md`, and `./CLAUDE.md` are absent.

F2 - **No house style guide** - `STYLE.md`, `.vale.ini`, `.textlintrc`, and `docs/style-guide*` are all absent, so `HOUSE_STYLE_NOTE` installs empty and `technical-english.md` states only the general rule that a house guide wins where one exists.

F3 - **No PR or commit convention** - `.github/PULL_REQUEST_TEMPLATE.md`, `.github/PULL_REQUEST_TEMPLATE/`, and `CONTRIBUTING.md` are all absent, so `REPO_CONVENTION_NOTE` installs empty and `git-writing.md` keeps its generic worked case.

F4 - **Output style is default** - no settings file sets `outputStyle`. Default works as installed, and Concise pairs well for shorter replies. Changing it is your own `/output-style` call, so Katharsis never writes it.

## Questions

❓ **Q1** - **Which rule files do you want installed?** - `writing.md` governs what to say and in what order, `technical-english.md` governs the sentences, and `git-writing.md` governs commit messages, PR bodies, and review comments.
   a. all three
   b. a named subset

➡️ All three - the `katharsis-audit` rewrite edits `writing.md` alone, so dropping it leaves you with the memory audit only.

❓ **Q2** - **How should the rules load?** - The two modes are alternatives.
   a. Memory import - one delimited block in `~/AGENTS.md`, so the rules load in every session
   b. System-prompt append - a `kclaude` wrapper concatenates the rules at launch, so they load only in sessions started through it

➡️ Memory import - it needs no wrapper, no alias, and no shell profile edit.

❓ **Q3** - **What should I call you?** - This fills `READER_NAME` in `writing.md` and `technical-english.md`.
   a. Hewett (from your email address)
   b. another name you give me

➡️ Tell me the name you want; I will not guess a first name from an email address.

❓ **Q4** - **Besides chat, which destinations do these rules govern?** - A prose fragment landing mid-sentence after "your chat answers", reading as "your chat answers, `<fragment>`, and ticket and wiki bodies".
   a. `docs` (the default)
   b. something specific, such as `README files and design docs`

➡️ `docs` - broad enough to cover the rest, and you can re-apply with a narrower fragment later.

❓ **Q5** - **Should I deny the AskUserQuestion tool?** - The rules ask for questions in prose, numbered, one decision each; that tool answers a different shape. Denying it adds `"AskUserQuestion"` to `permissions.deny` in `~/.claude/settings.json` through `scripts/settings-edit.sh`, so the uninstall can reverse it.
   a. deny it
   b. leave it available and let the rule carry the behavior

➡️ Deny it - it removes the conflicting shape rather than relying on the rule alone.

❓ **Q6** - **Where should the import block go in `~/AGENTS.md`?** - Applies only if you take memory import in Q2.
   a. top (the default), so it stays visible above later additions
   b. end, appended after your existing working agreements

➡️ Top - your existing 4 lines stay intact either way, and the block does not get buried.

## Plan on the default answers

Answer Q3 and I will show you the full plan for an explicit yes before anything is written. On the defaults above it would be:

- Destination: `~/.claude/katharsis` — `writing.md`, `technical-english.md`, `git-writing.md`, `loader.md`, empty `promoted.md`
- Import block: top of `/tmp/claude-1000/.../kdemo-home-on/AGENTS.md`
- Placeholders: `READER_NAME=<your answer>`, `MEMORY_FILE=~/AGENTS.md`, `DESTINATIONS=docs`, `HOUSE_STYLE_NOTE=` empty, `REPO_CONVENTION_NOTE=` empty
- Settings edit: `deny-askuserquestion` in `~/.claude/settings.json`
- Manifest: `~/.claude/katharsis/.katharsis-install.json`, reversible with `scripts/uninstall-rules.sh`


---

## Turn 2

**Prompt**

> All three files. Memory import. Call me Holden. Besides chat: the docs site. Yes, deny AskUserQuestion. Top of the file. Show me the plan.

**Reply**

Here is the full plan. Nothing is written yet.

## Plan

**Rule files landing in `~/.claude/katharsis/`** (`~` is `/tmp/claude-1000/-home-hhewett--local-src-katharsis/dc5f6940-b2c8-4297-97c0-d05ca7e0d203/scratchpad/kdemo-home-on`)

| File | Role |
|---|---|
| `writing.md` | what to say and in what order |
| `technical-english.md` | the sentences themselves |
| `git-writing.md` | commit messages, PR bodies, review comments |
| `loader.md` | generated; imports all three |
| `promoted.md` | written empty, for later audit entries |

**Placeholder values**

| Placeholder | Value | Renders as |
|---|---|---|
| `READER_NAME` | `Holden` | "A direct instruction from me (Holden) overrides anything here" and "## Chat replies to Holden" |
| `MEMORY_FILE` | `AGENTS.md` | "inherit this file through the `AGENTS.md` import" |
| `DESTINATIONS` | `the docs site` | "Applies to your chat answers, the docs site, and ticket and wiki bodies" |
| `HOUSE_STYLE_NOTE` | empty | `technical-english.md` states only the general rule (F2) |
| `REPO_CONVENTION_NOTE` | empty | `git-writing.md` keeps its generic worked case (F3) |

**Load mode:** memory import. One delimited managed block at the **top** of `~/AGENTS.md`, above your existing 4 lines. No wrapper, no alias, no shell profile edit. The rules load in every session.

**Settings edit:** `"AskUserQuestion"` added to `permissions.deny` in `~/.claude/settings.json`, through `scripts/settings-edit.sh` so the manifest records it.

**Commands I will run, in this order, from `/home/hhewett/.local/src/katharsis`**

```
scripts/setup-rules.sh apply --dest ~/.claude/katharsis \
  --set READER_NAME=Holden \
  --set MEMORY_FILE=AGENTS.md \
  --set DESTINATIONS='the docs site' \
  --set HOUSE_STYLE_NOTE= \
  --set REPO_CONVENTION_NOTE= \
  --import-into ~/AGENTS.md \
  --position top

scripts/settings-edit.sh apply --edit deny-askuserquestion
```

No `--select` and no `--wrapper`, because you took all three files and memory import.

**Reversal, recorded in `~/.claude/katharsis/.katharsis-install.json`**

```
scripts/uninstall-rules.sh plan     # names every action, writes nothing
scripts/uninstall-rules.sh apply    # executes it
```

The uninstall keeps and reports anything Katharsis did not write: a rule file you edited, a `promoted.md` with approved entries, a block already in `~/AGENTS.md`, and a settings value that predates the install.

Say yes and I will run both commands.


---

## Turn 3

**Prompt**

> Go.

**Reply**

The install is complete and verified.

## Actions taken

AT1 - **Managed block inserted at the top of `~/AGENTS.md`**, above your existing 4 working-agreement lines, which are intact:

```
<!-- katharsis:begin (managed block; remove with scripts/uninstall-rules.sh) -->
@~/.claude/katharsis/loader.md
<!-- katharsis:end -->
```

AT2 - **Five files written to `~/.claude/katharsis/`**: `writing.md` (13,012 bytes), `git-writing.md` (5,724), `technical-english.md` (3,374), `loader.md` (375), and an empty `promoted.md` (174).

AT3 - **All five placeholders substituted, none left**; `grep "{{"` across the installed files returns nothing. `writing.md:3` reads "your chat answers, the docs site, and ticket and wiki bodies", `writing.md:8` reads "a direct instruction from me (Holden)", and `technical-english.md:43` reads "## Chat replies to Holden".

AT4 - **`"AskUserQuestion"` added to `permissions.deny`** in `~/.claude/settings.json`. The value did not exist before, so the uninstall will reverse it.

AT5 - **Install recorded** in `~/.claude/katharsis/.katharsis-install.json` (2,281 bytes), with the pre-edit `AGENTS.md` and `settings.json` saved under `.katharsis-displaced/`.

## How the rules load

Memory import, so they load in **every session starting with your next one** — not this one, because `~/AGENTS.md` was read at launch. No wrapper and no shell profile edit exist to launch through.

The counts inside the rule text are still the reference audit's 6,841 messages, labelled as such. Run the `katharsis-audit` skill later to replace them with counts measured on your own transcripts.

## The way out

```
scripts/uninstall-rules.sh plan --dest ~/.claude/katharsis    # names every action, writes nothing
scripts/uninstall-rules.sh apply --dest ~/.claude/katharsis   # executes it
```

It reports and keeps anything Katharsis did not write: a rule file you edited, a `promoted.md` holding entries you approved, a block that was already in `~/AGENTS.md`, and a settings value that predates the install.
