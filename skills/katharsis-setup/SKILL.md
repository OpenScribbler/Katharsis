---
name: katharsis-setup
description: Finish setting up the Katharsis output style after the plugin is installed. Runs the setup script, which grants the one permission the style's routing step needs and names the two output styles, then hands the user the /config step. Use when the user asks to set up, configure, or finish installing Katharsis, or when a session starts with the line "Katharsis is installed but not set up".
---

# katharsis-setup

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

The script adds one entry to `permissions.allow` in `~/.claude/settings.json`:

```
Bash(~/.claude/katharsis/scripts/katharsis-exchange-style.sh:*)
```

The style has you run that script once per turn, and without the entry every session prompts
for it on first use. The script is idempotent and says when the entry is already there.

## 2. Relay the output

Show the script's output as it printed. When it reports that the settings file is not valid
JSON, stop and give the user the entry to add by hand, quoted from the output. When it fails
on a missing `python3`, say so and stop; the Stop hooks and `kref` need it.

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
takes effect on the next turn, and the per-turn reminder line confirms it is active.
