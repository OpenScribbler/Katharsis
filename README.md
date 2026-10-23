# Katharsis

**A Claude Code output style that classifies each message you send and shapes the reply to fit it.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/OpenScribbler/Katharsis/badge)](https://scorecard.dev/viewer/?uri=github.com/OpenScribbler/Katharsis)

A status check, an approval, a bug report, and a request for a diagnosis each want a different
reply. Claude Code answers all four with the same shape: a paragraph of narration, the answer
somewhere in the middle, and an offer at the end. Katharsis makes the model classify your message
into one of 11 exchange types before it writes, read a guidance file for that type, and shape the
reply to it: what opens the reply, what stays out, and how long it may run.

![A two-turn exchange about a rounding rule, answered by Claude Opus 5 under Claude Code's default style, left, and under Katharsis, right](demo/media/demo-opus-5.gif)

Same two messages, same model, same sandbox repo, recorded in Claude Code 2.1.283 and sped up. The
pricing tests expect half-up rounding that finance never confirmed, and the user asks: "should we
change the code or the tests?" The default reply runs 423 words, opens with "Neither, yet", and
ends by offering two more tasks. The Katharsis reply runs 438 words and opens with its
recommendation: "Change the code to half-up, and treat it as provisional until finance answers."
The user then says "go with what you recommend". The default spends 449 words on the work and
opens with "Done, but I need to correct something I told you." The Katharsis reply runs 87 words
and opens with "All 10 tests pass."

To see the same exchange on other models: [Claude Opus 5.5](demo/media/demo-opus-5-5.gif) ·
[Claude Sonnet 5](demo/media/demo-sonnet-5.gif) · [Claude Fable 5.1](demo/media/demo-fable-5-1.gif) ·
[Claude Fable 5](demo/media/demo-fable-5.gif). Every default reply ends its first turn with an
offer of more work, and one Katharsis reply does, on Sonnet 5. Across both turns, Katharsis is
shorter on Opus 5.5, Fable 5.1, and Fable 5, where it runs 224 words against 540, and longer on
Sonnet 5, 498 words against 349. Every reply is stored verbatim in
[demo/captures/](demo/captures/), and [demo/](demo/) has the sandbox and the steps to reproduce
them.

## What changes in your replies

- **The answer opens the reply.** Every type's guidance puts the finding, the result, or the state
  on the first line, and the reasoning after it.
- **The reply is sized to the ask.** A four-word status check gets a sentence and the one next
  step. A request for a diagnosis gets room to argue. Each type carries its own ceiling, and a
  reply that runs long because the subject felt rich is the failure the ceilings exist to stop.
- **Every item you might refer back to carries a code.** Findings, risks, actions taken, and next
  actions each get a code such as `F1` or `NA2`, numbered continuously through the session, so
  "do NA2" and "more on F3" are complete instructions. Coded lines sit under the topic they belong
  to, and each fact appears once.
- **The model acts instead of asking.** It makes every call that is cheap to undo and reports the
  result. A reply ends with a question only when a wrong answer would be expensive or reach past
  your machine and the model cannot infer your answer, with the options inside the question and a
  recommendation.
- **At the `sketch` [richness level](#richness-level), a shape gets a sketch only when a list or a
  table cannot show it.** When the point of a reply is nesting, branching logic, or what a change
  moves in an existing structure, the reply can show it as an inline text sketch of at most 12
  lines: a call tree that branches, a directory tree with depth, pseudocode with conditions or
  loops, or a `diff` sketch. A linear sequence of steps is a numbered list, and values compared
  across items, such as what each file does, are a table. A yes, a number, or a go-ahead stays
  prose, and the answer line is always prose. Sketches are opt-in: at the default level, `text`,
  none of this applies.
- **The codes survive the session.** A Stop hook records every coded item to a ledger on disk, and
  `kref` reads them back, so `F3` still resolves after a context compaction or in the next
  session.

## Install

```
/plugin marketplace add OpenScribbler/Katharsis
/plugin install katharsis@openscribbler
```

Then, in a Claude Code session:

```
/katharsis:setup
```

Setup does the one thing a plugin cannot do for itself. The style has the model run one script
per turn, and at the `rich` richness level a second one to render a diagram or reserve and open a
video. In default permission
mode each Bash call prompts on first use in every session, so setup adds one entry per script to
`permissions.allow` in `~/.claude/settings.json`:

```
Bash(~/.claude/katharsis/scripts/katharsis-exchange-style.sh:*)
Bash(~/.claude/katharsis/scripts/katharsis-artifact.sh:*)
```

A video tool the model runs at `rich` is not covered by them: it runs as its own Bash call, under
your permission prompt. The setup script writes nothing else outside `~/.claude/katharsis-data/`. It also checks that Claude Code is
2.1.287 or later, the first version that loads mods without a flag, and prints the fix when it is older. The same script runs from a terminal as `~/.claude/katharsis/scripts/setup.sh`,
and `--dry-run` prints the change without writing it.

Setup's output ends with the diagram renderers (`d2`, `mmdc`) and video tools (`vhs`, `ffmpeg`,
`remotion`) it finds, unless setup stops early on a settings file it cannot edit or a Claude Code
too old. For each one missing, it prints an install command when the installer that command
needs, such as `brew`, `curl`, `go`, or `npm`, is on your PATH, and names the missing installer
otherwise. Remotion counts only as the Katharsis Remotion project in
`~/.claude/katharsis-data/remotion/`, which its install command creates with Remotion's packages
and the browser it renders with, marking it ready only once the browser is in place; a global
`remotion` command does not count. When `vhs` or `ffmpeg` is found, setup marks Remotion not
needed and offers no command, because `rich` uses those first. Remotion needs a paid company
license for an organization above its small-team threshold; see
[remotion.dev/license](https://www.remotion.dev/license). The script installs nothing.
`/katharsis:setup` runs an install command only after you say yes to that command, and hands a
command that contains `sudo`, or one that fails for lack of permission, to you to run in a
terminal outside Claude Code. Without a video tool, `rich` uses Claude Motion when the session
offers it and the option is on, otherwise a rendered diagram, otherwise an inline sketch.

Last, pick the style. Open `/config`, choose Output style, and pick one of the two:

| Style | What it is |
|---|---|
| `katharsis:Katharsis` | The style alone. Claude Code's built-in software-engineering instructions are dropped, which is the default for any custom output style. |
| `katharsis:Katharsis coding` | The same style with those built-in instructions kept. |

The two share one body, and a test holds them identical below the frontmatter. `/config` saves
the choice to `.claude/settings.local.json` in the current project. Until you pick one, the
per-turn and Stop hooks stay silent and write nothing. The session-start hook runs regardless:
it makes the symlink, creates the data directory, and prints one line asking for setup until
setup has run.

Setup ends by offering `/katharsis:rules-check`, which you can also run at any time. It reads
every instruction file Claude Code loads for the current project, listed by
`scripts/instruction-files.sh`, and reports the rules that repeat the style, the rules that
contradict it, and a count of the rest. Each duplicate and conflict comes with a suggested edit,
and the skill changes a file only after you approve that edit. A file that reaches every project,
such as `~/.claude/CLAUDE.md`, needs its own yes.

### Requirements

Claude Code 2.1.287 or later, bash, and python3.
Only the routing script and the session-start hook are plain bash. Setup, the Stop hooks, and the Bash hooks
need python3, so without it setup fails and the ledger is not written. `kref` needs Node.js 22.18
or later.

### Mods

Katharsis is a mod: a plugin whose hooks module, a TypeScript file, Claude Code calls when events
happen. Claude Code loads mods with no flag from 2.1.287 on, and Katharsis depends on it:
`hooks/register.ts` carries the per-turn reminder, reading the active style from the settings the
engine runs under and telling an untyped turn from the prompt's origin. On a Claude Code that doesn't
load mods, no reminder reaches the model and the Stop hooks stay idle; the Bash hooks that save a file a call replaced unread still run. The module also draws [the drawer](#the-drawer). From the third turn, and
every 15 turns after, it asks the model in a forked call to name the session in a few words, and
stores the name in the session record. `claude plugin test .` runs the module's tests.

## How it works

1. **You send a message.** The prompt hook reads which output style is active and, when it
   is Katharsis, prints the classify-then-read instruction into the model's context along with the
   next free code numbers from the ledger. Claude Code names the active style itself on every turn,
   and this instruction is what keeps the classification step from fading over a long session.
   When the model changes to one that takes a different note, and after a compaction, the hook
   also attaches a short note for Fable, Opus, or Sonnet from `styles/models/`, correcting the
   leans Anthropic's prompting guide names for that model. A note named for the version, such as
   `opus-5-5.md`, would win over the family's note; none ships yet. After a compaction, the hook also
   lists each owed item the ledger still has open (next actions, your moves, waits, blocks, and
   questions, the oldest 12), with its body and a question's options and recommendation, each
   shortened to 200 characters, so the resumed turn does not depend on the summary's account of
   what was owed. When your message answers a question, such as `Q3 a` or `Q3 x`, the hook
   records the answer, which closes the question in the drawer. At the `standard` or `autonomous`
   [autonomy level](#autonomy-level), the hook adds one line naming the level. At the `sketch` or
   `rich` [richness level](#richness-level), it adds one line naming that level and attaches the
   sketch rules from `styles/richness/sketches.md` when the session has not had them, after a compaction,
   and when the level returns from `text`. With the [Claude Motion](#claude-motion) option off, it
   adds one line at every richness level saying no reply uses Motion.
2. **The model classifies the message** with the cue table in the style, then runs
   `scripts/katharsis-exchange-style.sh <type>`. The script prints the guidance file for that type,
   so running it is the read, and stamps the type for the Stop hook. It never classifies; that
   judgment stays with the model. An unknown type exits non-zero and prints the valid set.
3. **The model writes the reply** under that file's Shape, Ceiling, and Verification sections.
4. **The Stop hooks run.** One checks the stamp and, when a turn skipped the classification
   step, appends one JSON line to `telemetry/gate-misses.jsonl` with no message text. The script
   prints an `=== END: <type> ===` line after the guidance, and a stamped turn whose output lacks
   it, because a `| head` cut it short, is counted there as truncated. The second
   parses every coded item out of the reply and writes it to `ledger/<project>/<session>.jsonl`,
   and holds the reply once when it gives a code a different claim than the one on file with no
   `E` line naming that code. The third reads the finished reply and holds it once when it opens by
   narrating the intended action and buries the finding. The fourth checks the reply's claims
   against the session's tool results: tests, a build, plugin validation, a linter, or CI said to
   pass when the last run failed, ran before a later code edit, or never ran, in the reply or in a
   ticked checklist line of a PR body or commit, unless that line shows the check failing; a
   change the reply itself says it verified with nothing run after the last edit; and a
   count whose only source is `grep -I`, `grep -c`, or `rg` without `-uu`, which skip files or
   count lines instead of matches. A command counts as a run only where it is the command, so
   `rg pytest` is not a test run. When no command the hook knows ran but some command's
   output reads like a check's result, the hook says nothing. A failed command with several steps counts against a check only
   when the check's output shows a failure or the check is the last step. When two different
   commands for the same check ended differently, only a claim about all of them, such as "the
   tests pass", is judged. A checklist line in the file `--body-file` or `git commit -F` names is
   read only when that file has not changed since the call returned, and `--replay` reads no such
   file. A line count is not flagged when you asked for lines. When the count came from `grep -r`
   or `rg` searching one literal word under a folder and piped to `wc -l`, the hook first recounts
   that word in every file under the folder, binary and hidden ones included. If its number
   differs and the files grep or rg skipped account for the whole difference, the line names
   those files. If its number matches the reply's, skipped files are not reported. Otherwise, and
   at a symlink or special file, or past 5,000 files, 32 MiB, or 3 seconds, you get only the line
   about what the command skips. `--replay` never recounts.
   Each one appends a record to `detections/<session>.jsonl` and shows you one `Katharsis check:`
   line. None of these holds the reply.

A Bash call that replaces a file no earlier call in the session named (`>`, `tee`, `cp`, `mv`,
`dd of=`) is checked around the call by the same script, as a PreToolUse and PostToolUse hook, so
this check runs without the hooks module and in sessions where Katharsis is not
the active style. Before the call it copies the file, a regular file up to 256 KiB found through
any symlinks in its path, to a folder under the system temp directory that only you can open; if
that folder or its parent is a symlink, belongs to someone else, or is open to anyone else, the
hook does nothing. A file the same command first moves or copies elsewhere is not copied. After the
call, when lines of the old content are gone, it saves that copy under `clobbered/<session>/`,
readable only by you, appends a record that counts the lost lines and names the saved copy, shows
you one line with the `cp` command that restores it, and tells the model the same in the call's
result. A file the call left larger than 1 MiB is not compared. Once `clobbered/` holds 64 MiB, it
saves no new copy and says so; it never deletes one. If the first reply after the call says
nothing about the loss and the file does not match its saved copy, the fourth Stop hook holds that
reply once for one appended line per file naming the loss and that command. No later reply is held
for that replacement. A reply written in answer to any Stop hook's hold, this one's included, is
skipped, and the check falls to the next reply of the same turn, if one follows.
When the reply or the two text blocks before it name a file not yet restored and say it was not
there before, the reply is not held, since that line would contradict them; you get one
`Katharsis check:` line with the restore command instead.

No hook ever asks for a reply to be written again. A hold asks only for the lines that were
missing. For a drifted code, that is a line saying the code stands as on file, the corrected
claim with an `E` line, or the new item under a fresh code. For a buried opening, it is the
finding on its own line. For a replaced file, it is one line naming the loss and the saved copy. The reply
you already read stands and only the added lines are new. A rule with no such repair records the
reply and lets it through. Every hook exits 0 on every path where it cannot help, so a hook that
fails costs you a ledger row, never a turn.

### The exchange types

| Type | The message looks like | Ceiling |
|---|---|---|
| `factual-question` | "is X shipped?", "where does Y live?", "do these two rules conflict?" | 150 words |
| `status-and-resume` | "how's it going?", "let's continue", a handoff file, "773 merged" | 250 |
| `approval` | "1. a", "go ahead", "sounds good", "go ahead, but hold off on the second part" | 250 |
| `thinking-out-loud` | "let's discuss", "does that make sense?", "can we do X?" | 350 |
| `diagnosis` | "why does this happen?", "is this bad practice?", "what do you think?" | 500 |
| `redirect` | "do it this way instead", "stop hedging", "I deleted it on purpose", "I didn't read that" | 250 |
| `broken-report` | "this reply is messed up", "the hook didn't fire", "I got 7, not 5" | 250 |
| `work-request` | "update the changelog", "run the tests", "open a PR for both fixes" | 400 |
| `canned-review` | A script-sent review prompt naming a diff and a method | 300 |
| `harness-probe` | "answer in one line", "reply with only the token, or NONE" | the named form |
| `default` | Three or more types, a greeting, a pasted fragment | 250 |

Ceilings count everything you read, coded items included, because a coded line costs the same
reading time as a sentence. The first exemption is an agenda: when your message lists items, every
item on it gets a line. The second, at the `sketch` or `rich` [richness level](#richness-level),
is a reply's sketches, up to 12 lines in all, under the rules in `styles/richness/sketches.md`. The
[styles/README.md](styles/README.md) has the shared rules, and each `styles/<type>.md` has that
type's cues, shape, ambiguities, and worked examples.

### Reference codes

Each code has one form:

```
F1 - **the claim** - the evidence, in the same sentence
```

`F` findings, `A` assumptions, `R` risks, `C` caveats, `AT` actions taken, `V`
verified, `NA` next actions, `B` blocked, `MV` your move, `W` waiting, `X` excluded, `S` state,
`T-O` trade-offs, `E` errata, `Q` questions. Numbers never restart within a session. The model may
define a new code when none fits, and the ledger records it either way, because detection is by
shape rather than by an allowlist.

### kref

`kref` reads the ledger back. Inside Claude Code, bash mode runs it from the plugin's `bin/`,
which Claude Code puts on PATH, and the model's whole reply to that turn is "Logged." Below, the ledger comes
from a four-day session on this repo that reached F145 and Q85 across 225 coded items. The
visible reply is a short demo turn in that session rather than one of its own replies. A chip
recalls caveat C21 from an earlier reply, the band counts every code type, and the drawer searches
and filters the whole ledger. Then `kref F100` fetches a finding from two days earlier, and `kref search
symlink --short` lists every item across the ledger that mentions symlinks.

![A reply late in a long Katharsis session: hovering the C21 chip recalls an old caveat, the band shows 50 questions, the drawer searches and filters the whole ledger, and kref fetches F100 and then searches the ledger for symlink](demo/media/session.gif)


```
! kref                  this session's items under headings such as Findings, each in full
! kref F3               one item
! kref F                every F item
! kref search keytab    every item whose title, body, or options mention "keytab"
! kref sessions         the sessions that ran in this folder or below it, newest first
! kref --short NA       titles only
! kref --chrono         every item in the order it was written, rather than by heading
! kref --html           the same result as an HTML page
! kref --json           the same result as one JSON document, for scripts
```

In full, each item shows its title, its whole body, and for a question every option on its own
line and the recommendation after `->`:

```
Q4  ship it today?
    the tag is ready but CI is slow
    a. ship now
    b. wait for CI
    -> b - the release has no deadline
```

Inside Claude Code, `kref` reads the session you run it from, together with the sessions it
continued from a handoff file. A code that scope lacks comes back from the newest sessions that
define it. In your own terminal it reads the
newest session that ran in the folder you are in, and in a folder where none ran it lists the
sessions below it and asks which to open. `kref search` looks across every session. The
[kref page](https://openscribbler.github.io/Katharsis/how/kref/) documents the rules and the JSON
format. `kref` needs Node.js 22.18 or later.

Your own terminal does not have the plugin's `bin/` on PATH, so link the wrapper once:

```
ln -s ~/.claude/katharsis/bin/kref ~/.local/bin/
```

### The drawer

On Claude Code 2.1.287 or later (see [Mods](#mods)), with a
Katharsis style active, the same items are one click away inside Claude Code: from a code in a reply,
or from `/kdrawer` before the first prompt and after `/clear`. The band, off by default because it shares the row above
the prompt with other plugins, is a row there that names the code types the session has, such as
`▸ Katharsis · k: open | use /kdrawer · F:3|C:1|AT:2|Q:1`. To draw it, open `/config`,
search for `band`, and turn on the Band above the prompt row (`katharsis.band`). While the band holds the focus, after ctrl+x tab or a click, k opens the drawer. Hover a type for its
latest 10 titles, each led by the status mark its drawer row carries, then press a title to open that item in the
drawer, or press the type or its list-all button to list every item of that type.

![The Katharsis band above the prompt: the pointer hovers the NA label, which pops up its 2 titles, then presses it, and the drawer lists every next action](demo/media/drawer-band.gif)

![The pointer hovers the AT label, moves up into its popup, and presses the AT2 title, which opens AT2's card in the drawer](demo/media/drawer-hover.gif)

`/kdrawer [query]`, a code in a reply, or the band's open button opens the drawer,
which groups every item under its type's name (Findings, Caveats, Actions taken), with a search box, a
filter menu, a Status menu, a Clear button that resets the search and the filter, and a View menu. View
short lists titles only, full adds every body, and current lists what the rows under the latest reply
list, in full: the codes it cites under Codes this turn, then every open item under Still open. Current
follows each new reply and ignores Status. Settings swaps the list for Katharsis's own `/config` options,
such as the autonomy level and the band, with a button per value and the current one marked. A press sets
the same option as its `/config` row, saved to your user settings in `~/.claude/settings.json`, and reloads
the plugin; the drawer stays on settings. Each row shows the code, a mark, and the title: a grey `○` for an
item still open or of a type that never closes, a green `✓` for one answered, settled, or done, and a red
`✗` for one dismissed, dropped, or withdrawn. A yellow `!` marks an open line an erratum corrected without
restating it, whose title is the version the erratum replaced; its card, open or closed, carries
`! Corrected by E1` and the erratum's body. The drawer opens on titles only; press a code to open
that item as a card, a frame around its row and body. A resolved item's body opens with how it ended, such as `✓ Done in AT3` or `✗ Dropped by X2`. The Status menu picks all, open, or resolved items and carries the key to the
marks. Open items come first, and the setting stays between opens. Each heading counts its type under the search and filter, whatever Status hides, such as `Questions (Q) · 2 open of 9`.
A query spelled as a code, such as `F3`, finds that code alone, whatever Status says. Esc closes the
drawer.

An open question's card, or its entry in the full view, answers it. Pick an option or **dismiss**, add a note in the field below
them, and press **send** or Enter. The card posts the answer as your next message, such as `Q3 a`,
`Q3 a your note`, or `Q3 x - your note`, and a note with nothing picked is your own answer,
`Q3 z your note`. The card shows what it will send, pressing the picked option again unpicks it,
and the prompt box is left alone. The note is plain text, so put an `@` file mention or a pasted
image in a message of your own. Once two or more open questions hold a pick or a note, a line counts
and names them, such as `2 of 3 answered`, under the heading of the first section that lists an open
question: Questions, or **Still open** in the current view. While no section lists one, the line waits.
Its **send** posts all of them as one message, one answer per line, including any the list does not
show. A card's own **send** posts that question alone.

![The drawer: a search for timeout, Clear, the filter menu with a count per type, the Next actions filter, and the full view](demo/media/drawer-drawer.gif)

In a reply, each code on record is a link that opens the drawer at that item, unless the reply is too long for
Katharsis to redraw, another plugin draws it, or Claude Code judges your terminal unable to show links. In that
terminal Claude Code would print each link's URL after its text, so the codes stay plain and the chips still open
them. herdr is one such terminal. `FORCE_HYPERLINK=1` overrides the judgment for a terminal that shows links Claude
Code does not recognize. A row of chips
under the reply names the cited codes, and hovering a chip shows a card that starts with the item's
status mark and what the code is, such as `○ F3 · Finding 3`, followed by the item in full. The drawer, the chips, and the band draw
nothing in a session where Katharsis is inactive.

![A reply with its codes as links and a row of chips under it: hovering the F1 and AT2 chips shows their cards, and clicking the inline AT2 opens the drawer](demo/media/drawer-chips.gif)

### Autonomy level

The autonomy level sets which actions the model takes without asking you first. Open `/config`,
search for `autonomy`, and pick one of three values on the Autonomy level row; the setting's key
is `katharsis.autonomy`.

| Level | What changes |
|---|---|
| `guided` (default) | Nothing. The style's "When a call is mine" test applies as written, so a push, a PR, or a message to a colleague is your call. |
| `standard` | Further publishing inside a scope you approved this session goes ahead, such as another push to a branch you approved pushing, or an update to a PR you approved opening, by adding commits. Starting something new that publishes, such as opening a new PR, and messaging people, including a comment, a review reply, or a review request on a PR, stay your call. |
| `autonomous` | Everything `standard` allows, and also pushing a branch the work created and opening or updating a PR from it by adding commits go ahead once the work is verified, by the repo's own checks where it has them. A push to the default branch or to someone else's branch, and opening or updating a PR against a repo you can't push to, such as a third-party project reached through a fork, including a push to the branch that PR is from, are not among these additions. Every other action that is your call at `guided` stays your call, such as merging, deleting data the model did not create this session, force-pushing shared history, spending money, and messaging people, including a comment, a review reply, or a review request on a PR. |

"Your call" means the model asks first unless it can infer your answer from what you said, the
repo's conventions, or preferences you stated earlier. Deleting data it did not create this session and
force-pushing shared history wait for your own words at every level, and no level's additions
include a force-push, even to a branch the work created.

At `standard` or `autonomous`, `hooks/register.ts` adds one line to each turn's context naming the
level, and the style's "Autonomy level" section, in both `output-styles/` files, says what the
level moves. At `guided`, the hook adds nothing. At every level, the model checks the repo's
conventions before asking. Beyond what the level itself lets go ahead, neither `standard` nor
`autonomous` widens a permission you gave for a named action past the actions and repos it names.
Your own instruction files and the repo's win where they disagree with what `standard` or
`autonomous` lets go ahead.

At `guided`, the drawer suggests `standard` under the latest reply once you have answered 50
questions that carried a recommendation, across every session, and taken the recommendation on
at least 70% of them. Select **dismiss** to hide the suggestion for good; deleting
`~/.claude/katharsis-data/autonomy-suggestion-dismissed` brings it back.

### Richness level

The richness level caps which sketches a reply may carry when its content has a shape. Open
`/config`, search for `richness`, and pick one of three values on the Richness level row; the
setting's key is `katharsis.richness`.

| Level | What changes |
|---|---|
| `text` (default) | Nothing: the style carries no sketch rules, and the prompt hook adds nothing to the turn's context for this option. |
| `sketch` | A reply whose point is a shape that a numbered list or a table cannot show can carry an inline text sketch of at most 12 lines in all: a call tree that branches, a directory tree with depth, pseudocode with conditions or loops, or a `diff` sketch of an existing structure. A sketch is plain text that reads without a renderer, and its lines sit outside the type's word ceiling. A sketch your message asks for is drawn even when a list or a table could carry the shape. |
| `rich` | Everything `sketch` allows, and a shape too dense for 12 lines is rendered as a diagram instead of cut: `scripts/katharsis-artifact.sh` draws it with D2 (with the TALA layout when D2 lists it) or the Mermaid CLI, writes an HTML page under `~/.claude/katharsis-data/pages/`, and opens it. The reply carries the diagram's takeaway and the page's path. With neither renderer installed, or when a render fails, the reply draws the inline sketch. A change over time that none of those forms can show, such as a TUI flow, or an animation you ask for, becomes a short local video when `vhs` or `ffmpeg` is on your PATH or setup has created the Katharsis Remotion project: `scripts/katharsis-artifact.sh path` reserves an empty file under `~/.claude/katharsis-data/pages/`, the model writes a vhs tape beside it or a Remotion composition inside that project, never in your working directory, and runs the tool with its output at that file as an ordinary Bash command with its own permission prompt, after the file write that shows a tape's commands or a composition's code, and the script's `open` opens the video. With no video tool, or when the tool fails, the reply uses a [Claude Motion](#claude-motion) animation when the session offers Motion and the Claude Motion option is on, and otherwise the diagram or the sketch. Pages that ask a question are not built yet. |

At `sketch` and `rich`, the content decides whether a sketch appears: a reply whose point has no
shape carries none, a shape that a numbered list or a table carries gets that list or table, the
answer line stays prose, and a sketch never repeats a fact the prose states.
At `sketch` or `rich`, `hooks/register.ts` adds one line to each turn's context naming the level.
It also attaches the sketch rules in `styles/richness/sketches.md` on the first turn at either level, again
after a compaction, whose summary drops them, and again when the level returns from `text`; the
file `.sketches-<session>` in `~/.claude/katharsis-data/` records that they went out. At `text`, the
hook adds nothing for this option, and neither output style carries sketch rules at any level.

### Claude Motion

At the `rich` richness level, when the session offers a Motion artifact type, a reply can animate a
change over time with Claude Motion: one that prose, a numbered list, a table, a sketch, or a
rendered diagram cannot show, such as a TUI flow, or an animation you ask for, when no local video
carries it. A local video comes first, because it costs no plan usage and stays on your machine. Each
animation publishes a private artifact and counts against your plan usage. The option is on by default: open `/config`, search for
`motion`, and turn off the Claude Motion row to keep Motion out of Katharsis replies; the setting's key is
`katharsis.motion`. With the option off, `hooks/register.ts` adds one line to each turn's context,
at every richness level, saying no reply uses Motion, even one you ask for, and that a reply
declining an animation says the option is off. With the option on, the hook adds nothing, and with
no Motion type offered, `rich` behaves as it does without the option.

### Git skills

`/katharsis:pr` drafts a title and body for the pull request on the current branch. It reads the
branch's commits and its diff against the base, which is the branch you name after the command or
else the remote's default, and the issue a commit names. Then it looks for the repo's own PR
convention and stops at the first source that covers the body:

1. A PR template: `pull_request_template.md` or `.txt` in `.github/`, the repo root, or `docs/`, in
   any letter case, or a file in a `PULL_REQUEST_TEMPLATE/` folder there.
2. A git or PR skill under the repo's `.claude/skills/`.
3. The repo's `CLAUDE.md`, `.claude/CLAUDE.md`, `AGENTS.md`, or `CONTRIBUTING.md`.
4. The last 10 merged PRs, when they share one shape.

A template's sections are used in its order with its headings word for word; a skill, an
instruction file, or the history gives the body format it prescribes, not its own headings. The
skill tells you which source it used. With no convention, the body has three sections: a Summary
that opens with the smallest sketch of the change, such as a `diff` sketch or a file tree;
Evidence, the checks before and after with their commands and results; and Merge Danger, which
says whether a revert undoes the merge and how far the change reaches. For evidence it uses the
checks that ran in the session after the last change, and when none did, it runs the checks the
repo documents, such as its CI commands or its template's checklist. The skill never checks out,
stashes, resets, or switches branches to get a "before" result. It takes one from earlier checks
in the session, the issue, the commits, or CI on the base, and says when none was measured. When
your tree has uncommitted changes, it says which results tested them.

The skill shows you the draft and stops. It pushes the branch or opens the PR only when you ask in
the same command, such as `/katharsis:pr open the PR`. Asking it to open the PR also lets it push
the current branch: `git push -u` when the branch has no upstream, or `git push` when it has
commits its upstream lacks. It never force-pushes. When the branch already has a PR, it reports the
URL and edits that PR's body only when you ask it to update the PR. The skill is told to leave this
session's reference codes out of what it writes, since a reviewer never saw the session. The lookup
lives in `skills/pr/conventions.md`.

The model can't run the skill on its own; only you can, by typing it. Its frontmatter sets
`disable-model-invocation: true`, and Claude Code has no setting that turns it back on: the
`skillOverrides` setting can hide a skill but can't lift its author's lock. To let the model run it,
copy `skills/pr/` from the plugin into `~/.claude/skills/pr/`, delete the
`disable-model-invocation` line from the copy's `SKILL.md`, and run it as `/pr`. The copy doesn't
change when Katharsis updates.

`/katharsis:commit` writes a commit message for the staged change. The message covers only what is
staged, and when nothing is, it says so and stops, since it never stages files itself. It runs the
same lookup as `/katharsis:pr` for the commit message's subject and body, each on its own, ending
with the last 20 non-merge commits on the default branch, or on the checked-out branch when no
default branch resolves, so a history whose subjects repeat a `fix(scope):` prefix, a ticket key, or
an `[area]` tag gets a subject in that form. A ticket key comes from what you typed, the branch
name, or its issue, and never from another commit. A `(#123)` suffix and `* subject` bullet bodies
that a squash merge adds don't count as the convention. When an instruction file points commits at a
PR template, the template gives only the order of the body's paragraphs, with no headings or
checklist. With no convention, the subject is imperative, under 72 characters, with no trailing
period, and names the effect rather than the edit. The body says only what the diff can't show: what
users hit before the change rather than the old code, why that was wrong, and why this fix over the
obvious alternative. When nothing is left after that, the message is the subject alone. The reason
comes from what you typed, the session, or an issue the branch name or what you typed names, and
with none of those the message gives no reason. The skill is told to leave reference codes and a
`Co-Authored-By` trailer out of the message.

The skill writes the message to a temporary file outside the work tree, shows it, and stops. It
commits only when you ask in the same command, such as `/katharsis:commit and commit it`, and then
runs `git commit -F` with that file and removes it. It never stages, amends, skips hooks, or pushes.
Like `/katharsis:pr`, only you can run it. To let the model run it, copy both `skills/commit/` and
`skills/pr/` into `~/.claude/skills/`, since the commit skill reads `pr/conventions.md`, delete the
`disable-model-invocation` line from the commit copy's `SKILL.md`, and run it as `/commit`.
`/katharsis:review-reply` writes one pull request review comment, or a reply to one, from the point
you make. Type the PR, where the comment goes, and your point, such as
`/katharsis:review-reply 12 src/stats.py:5 return 0.0 for an empty list`. A `path:line` or
`path:start-end` makes an inline comment on that line of the diff, a review comment's URL makes a
reply in its thread, and with no target the comment goes on the PR's conversation. For a reply, it reads what the commented lines
held from the diff hunk GitHub stores with the comment, on the side of the diff the comment is on,
and reads the whole file for a comment on a file. When the thread is outdated, it also reads what
those lines hold now and says the thread is outdated. Without a PR it drafts from the current
branch's diff against the branch you name, else `origin`'s default branch, else `main`, else
`master`. It reads the lines before it writes, and when the code doesn't say what your point says,
it tells you instead of drafting. It runs the same lookup as `/katharsis:pr` for the review comment,
where only a git or review skill under `.claude/skills/` or the rules in `CLAUDE.md`,
`.claude/CLAUDE.md`, `AGENTS.md`, or `CONTRIBUTING.md` can cover it. A rule the repo states replaces
the matching default, and the defaults it says nothing about still hold. A severity tag such as
`[must]` or `[nit]` replaces the non-blocking default: the comment takes the blocking tag unless you
called it non-blocking. With no convention, the comment opens with the change, then the reason;
states the correction as what the code should do; gives the file and line beside each claim about a
line other than its own; cuts praise, how the problem was found, and closing offers; runs one or two
sentences when it asks for one change; and says it is non-blocking, last, only when you called it
that.

The skill shows the comment and stops. It posts only when you ask in the same command, such as
`... and post it`, through `gh` with the comment read from a temporary file outside your work tree:
an inline comment through `POST /repos/{owner}/{repo}/pulls/{number}/comments` on the PR's head
commit, and a reply through `.../pulls/{number}/comments/{id}/replies` to the thread's first
comment. GitHub has no threaded reply to a conversation comment or a review's summary, so an answer
to one posts as a new comment with `gh pr comment`. Like `/katharsis:pr`, it leaves this session's
reference codes out, and only you can run it. To let the model run it, copy both
`skills/review-reply/` and `skills/pr/` into `~/.claude/skills/`, since it reads
`pr/conventions.md`, delete the `disable-model-invocation` line from the review-reply copy's
`SKILL.md`, and run it as `/review-reply`.

## Where things live

| Path | Holds | Lifetime |
|---|---|---|
| `~/.claude/katharsis` | A symlink to the plugin's install directory, remade at every session start | Follows the plugin |
| `~/.claude/katharsis-data/ledger/` | One JSONL file per session, keyed by project | Yours; outlives the plugin |
| `~/.claude/katharsis-data/telemetry/` | `gate-misses.jsonl`, one line per skipped, inherited, or truncated classification; `replies.jsonl`, one line per reply with the full model id, the last exchange type stamped, the word count, whether its last line outside `## Questions` asks, and a count per detector rule, with a hold's repair on its own line; `decisions.jsonl` and `headings.jsonl`, counts per reply; `drift.jsonl`, one line per renumbered code; no message text in any of them | Yours; outlives the plugin |
| `~/.claude/katharsis-data/sessions/` | One JSON record per session: its folder, branch, handoff parent, start and last-prompt times, each Katharsis version that ran it, its transcript path, and a model-written title | Yours; outlives the plugin |
| `~/.claude/katharsis-data/detections/` | One JSONL file per session, readable only by you: each mistake a check found, with its kind, certainty, and up to 300 characters of the command, result, or reply sentence it rests on | Yours; outlives the plugin |
| `~/.claude/katharsis-data/clobbered/` | The earlier copy of each file a Bash call replaced unread, one folder per session, readable only by you; no new copy once it holds 64 MiB | Yours; outlives the plugin |
| `~/.claude/katharsis-data/answers/` | One JSONL file per session: each answer to a question as its code, the letter picked, and how it was read, with no message text | Yours; outlives the plugin |
| `~/.claude/katharsis-data/kref-out/` | The HTML pages `kref --html` writes | Yours; outlives the plugin |
| `~/.claude/katharsis-data/pages/` | The diagram pages `scripts/katharsis-artifact.sh` writes at `rich`: each page's HTML, its SVG, and its D2 or Mermaid source, beside a copy of the stylesheet and theme script that every page write refreshes, `.tmp/`, which the renderer gets as `TMPDIR`, and each video's `.gif`, `.mp4`, or `.webm` file, which the script reserves and the video tool writes, beside the `.tape` of the same name the model writes for vhs. A cache the renderer or the video tool keeps in your home directory is that tool's | Yours; outlives the plugin |
| `~/.claude/katharsis-data/remotion/` | The Katharsis Remotion project, which `/katharsis:setup` creates only when you say yes to its Remotion install command: Remotion's packages, and a folder for each composition the model writes there at `rich`, named after its video. The install command also downloads the browser Remotion renders with, then writes `.katharsis-ready`, without which the project does not count | Yours; outlives the plugin |

The symlink exists because a marketplace install lands in a versioned cache directory that moves
on every update, and neither the style file nor the model's Bash calls can expand the variable
that names it. The data directory is separate because that cache is read-only and replaced on
update. `KATHARSIS_DATA` moves the data directory. The symlink's path is fixed, because the style
and the permission entries name it directly.

## Uninstall

```
/plugin uninstall katharsis@openscribbler
```

Then open `/config` in each project where you chose a Katharsis style and pick another, and remove the two `permissions.allow` entries
setup added to `~/.claude/settings.json`. The symlink at `~/.claude/katharsis` and everything
under `~/.claude/katharsis-data/` stay behind: the ledger, the session records, and the answers
are yours to keep or delete.

## Upgrading from 0.2.x

0.2.x installed writing rules into your memory file through a managed block, and 0.3.0 removes
the rules and their uninstaller. Run 0.2.1's `scripts/uninstall-rules.sh apply` before
upgrading, which removes the block, the rule files under `~/.claude/katharsis/`, and any
settings edits it recorded. It refuses to delete a rule file you edited, a `promoted.md` with
content, or anything the audit wrote, and names each one it leaves. Read what remains under
`~/.claude/katharsis/` and remove the directory yourself, because it has to be gone before the
0.3.0 symlink can take its place, and the session-start hook says so when it is not. [CHANGELOG.md](CHANGELOG.md) has the
full list of what 0.3.0 removed.

## What's included

| Path | Kind | What it does |
|---|---|---|
| `output-styles/katharsis.md`, `katharsis-coding.md` | Output styles | The classification table, the reference codes, the question form. One body, two frontmatters. |
| `styles/*.md` | Guidance files | One per exchange type: cues, ceiling, shape, ambiguities, verification, examples. `README.md` holds the shared rules. |
| `styles/models/*.md` | Model notes | One per model family, or per version where a version needs its own, attached by the prompt hook when the note changes and after a compaction. |
| `styles/richness/sketches.md` | Sketch rules | The rules for an inline text sketch, for a rendered diagram of a shape too dense for one, for a local video, and for Claude Motion animations, attached by the prompt hook at the `sketch` or `rich` richness level. Not an exchange type. |
| `scripts/katharsis-exchange-style.sh` | Script | Prints a type's guidance file and stamps the type. The model runs it once per typed turn. |
| `scripts/katharsis-artifact.sh`, `assets/pages/` | Script | At the `rich` richness level, renders a diagram too dense for an inline sketch with D2 or the Mermaid CLI, writes it as an HTML page under `~/.claude/katharsis-data/pages/` with the Flexoki stylesheet and theme toggle from `assets/pages/`, and opens it. With no renderer, or when a render fails, it says so and the reply draws an inline sketch instead. It also names the installed video tool, reserves a video file there for vhs, ffmpeg, or Remotion to write, and opens the video; it never runs the video tool. |
| `hooks/register.ts` | Hooks module | The prompt hook: the per-turn reminder, the active-session marker, the handoff chain link, the session record, the answers to the latest Questions round, the next free code numbers, the autonomy level when it is not `guided`, the richness level and the sketch rules when it is not `text`, the Claude Motion off line when that option is off. |
| `hooks/ledger.ts`, `session.ts`, `answers.ts`, `suggest.ts` | Hooks module | The ledger reader the prompt hook, the drawer, and `kref` share; the session record; the answer parser; the agreement rate behind the autonomy suggestion. |
| `hooks/drawer.tsx` | Hooks module | [The drawer](#the-drawer): the drawer `/kdrawer` opens, the reply chips, and the optional band. It also adds the transcript path and a model-written title to the session record. |
| `scripts/stop-classify.sh` | Hook | Stop: consumes the stamp, records a gate miss, an inherited `!` turn, or a truncated read of the guidance to telemetry, and never holds the reply. |
| `scripts/ledger-stop.sh` | Hook | Stop: writes every coded item in the reply to the ledger, records per-reply counts, and holds the reply once for a code whose claim changed. |
| `scripts/stop-verifier.sh` | Hook | Stop: holds the reply once for an opening that buries the finding, and asks for the finding on its own line rather than a rewrite. |
| `scripts/mistakes.sh`, `scripts/mistakes.py` | Hook | PreToolUse and PostToolUse on Bash: copies a file a call is about to replace unread, and saves it, records the loss, and tells you and the model when lines of it are gone. Stop: checks the reply's test, build, validation, lint, CI, verified, and count claims, and a PR body's ticked checks, against the session's tool results, records each hit, shows one line for it, and holds the reply once for a replaced file that the first reply after the call does not mention. `--replay <transcript>` runs the Stop checks over a finished session and prints the records. |
| `scripts/detect-reply.sh`, `scripts/packs/*.txt` | Script | Runs the writing rules over one reply and prints a fix line per hit. The verifier calls it, and you can run it over a saved reply. |
| `scripts/session-link.sh` | Hook | SessionStart: remakes the `~/.claude/katharsis` symlink and asks for setup until setup has run. |
| `cli/kref.ts`, `bin/kref` | Script | Reads the ledger back in the terminal, as JSON, or as HTML. |
| `scripts/setup.sh`, `skills/setup/` | Setup | Checks the Claude Code version, adds the two permission entries, names the two styles, and reports the diagram renderers and video tools on PATH, with an install command for each one missing. |
| `scripts/instruction-files.sh`, `skills/rules-check/` | Skill | Lists the instruction files Claude Code loads for a folder, and finds the rules in them that repeat or contradict the style. |
| `skills/pr/` | Skill | [`/katharsis:pr`](#git-skills): drafts a PR title and body that follow the repo's convention, or the visual default. Only you can run it. |
| `skills/commit/` | Skill | [`/katharsis:commit`](#git-skills): writes a commit message for the staged change that follows the repo's subject convention, or the default, and commits only when you ask. Only you can run it. |
| `skills/review-reply/` | Skill | [`/katharsis:review-reply`](#git-skills): writes a PR review comment or a reply to one that follows the repo's review convention, or the default, and posts only when you ask. Only you can run it. |
| `hooks/hooks.json` | Manifest | Wires the session-start hook, the Bash hooks around each call, and the Stop hooks, and names the hooks module that holds the prompt hook and the drawer. |

## Provenance

This repo is a self-publishing [MOAT](https://openscribbler.github.io/moat/) registry, and every
item it ships is `Dual-Attested`, MOAT's highest trust tier. On every push to `main`, one workflow
hashes each skill under `skills/`, the output styles, and every file under `styles/`, signs each
hash with Sigstore, and records it in the Rekor public transparency log; a second workflow verifies
those entries, signs the same hashes under its own identity, and publishes a signed registry
manifest. The repo holds no signing keys. [SECURITY.md](SECURITY.md#moat-attestation) says what the
attestations cover, what they leave out, and how to run the checks yourself.

## Why I created Katharsis

Katharsis started as a set of writing rules loaded from a memory file, with an audit that measured
them against my own transcripts. The rules worked less than the measurement said they should. A
60-day audit of my sessions found that the replies that succeeded were the ones that opened with
the answer and stayed under the length the question warranted, and that neither property comes
from a rule about sentences. It comes from knowing what kind of exchange you are in. A pass over 13
comparable projects found none that classified the ask before shaping the reply, so that became
the product.

## Documentation

- [docs/release-check.md](docs/release-check.md) is the real-path check a release has to pass.
- [demo/](demo/) holds the captures and scripts behind the GIFs and the steps to reproduce them.
- [CHANGELOG.md](CHANGELOG.md) lists what each release changed.
- [CONTRIBUTING.md](CONTRIBUTING.md) says how to file an issue, how to get vouched for pull
  requests, and what a pull request has to pass.
- [SECURITY.md](SECURITY.md) says what the hooks touch on your machine, how the MOAT
  attestation works, and where to report a vulnerability.

## License

[MIT](LICENSE)
