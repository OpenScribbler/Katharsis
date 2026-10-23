---
name: setup
description: Finish setting up the Katharsis output style after the plugin is installed. Runs the setup script, which checks the Claude Code version, grants the permissions the style's routing step and diagram rendering need, names the two output styles, and reports the diagram and video tools the rich richness level can use, then hands the user the /config step. Use when the user asks to set up, configure, or finish installing Katharsis, or when a session starts with the line "Katharsis is installed but not set up".
---

# Katharsis setup

Installing the plugin puts the style on disk. Two steps remain, and this skill walks the user
through both. Never edit a settings file by hand: `scripts/setup.sh` is the single writer, so
running the skill and running the script from a terminal cannot leave different results.

## 1. Run the setup script

```
~/.claude/katharsis/scripts/setup.sh
```

If that path does not exist, the SessionStart hook could not make the link, and its
message at session start says why: usually a `~/.claude/katharsis` directory left by
Katharsis 0.2.x. Relay that message, ask the user to remove the directory and restart
Claude Code, and stop here.

The script adds two entries to `permissions.allow` in `~/.claude/settings.json`:

```
Bash(~/.claude/katharsis/scripts/katharsis-exchange-style.sh:*)
Bash(~/.claude/katharsis/scripts/katharsis-artifact.sh:*)
```

The style has you run the first script once per turn, and the second to render a diagram or
reserve and open a video at the `rich` richness level, and to write a question page the user asks
for at any level. Without an entry, every session prompts for that script on first use.
The script is idempotent and says when an entry is already there.

## 2. Relay the output

Show the script's output as it printed. When it exits 4, Claude Code is older than 2.1.287, the
oldest version Katharsis supports.
Relay the fix the script printed and stop, because setup does not finish below that version. The
permission was granted anyway, so the rerun only has to confirm the fix. When it reports that the settings file is not valid
JSON, stop and give the user the entries to add by hand, quoted from the output. When it fails
on a missing `python3`, say so and stop; the Stop hooks need it.

When the script exits 0, its last lines report which diagram renderers (`d2`, `mmdc`) and video
tools (`vhs`, `ffmpeg`, `remotion`) are on PATH, with an install command for each one missing; an
exit 3 or 4 prints no report. The script installs nothing. Relay the report as printed, and when a
tool is missing, offer its install command: the text inside the backticks, never the note after
them. A line that names a missing installer instead of a command has nothing to run, and neither
does Remotion's `not needed` line. Run an install command only after the user says yes to that
command; a yes to one is not a yes to the others. After a yes, run a command that does not contain
`sudo` yourself. Hand a command that contains `sudo` to the user to run in a terminal outside Claude
Code, never as a bash-mode `!` command, because sudo's password prompt needs a terminal. Hand over
the same way a command that fails with a permission error, such as `EACCES`, "a terminal is
required", or "permission denied", as an installer such as `npm install -g` can when its install
location belongs to root, and do not retry it. Remotion counts only as the Katharsis Remotion
project in `~/.claude/katharsis-data/remotion/`, which its install command creates with its packages
and browser and marks ready last; a `remotion` command on PATH does not count. Nothing needs a tool:
without a video tool, `rich` uses Claude Motion when the session offers it and the option is on,
otherwise a rendered diagram, otherwise an inline sketch.

If the Bash call itself is denied, hand the user the command to run in bash mode, where it
runs in their shell with no permission prompt:

```
! ~/.claude/katharsis/scripts/setup.sh
```

## 3. Hand over the /config step

Picking the style is the user's own action; nothing in the plugin writes `outputStyle`. Tell
them to open `/config`, choose Output style, and pick one of the two:

- `katharsis:Katharsis`, the style alone.
- `katharsis:Katharsis coding`, the same style with Claude Code's built-in software-engineering
  instructions kept.

`/config` saves the choice to `.claude/settings.local.json` in the current project. The style
takes effect on the next turn.

In one line, also name the Autonomy level row in `/config`: it starts at `guided`, where pushes,
PRs, and messages to colleagues are the user's call, and the drawer suggests `standard` once their
answers show they usually take the model's recommendation.

## 4. Offer the rules check

Last, offer `/katharsis:rules-check`, which finds rules in the project's `CLAUDE.md`, `AGENTS.md`,
and other instruction files that repeat or contradict the style and suggests an edit for each.
It changes no file without the user's yes. Offer it in one line and run it only if they accept.
