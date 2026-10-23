---
title: Install
description: Install the Katharsis plugin, run setup, and choose an output style.
---

## Requirements

- Claude Code 2.1.287 or later
- bash and python3
- Node.js 22.18 or later, for `kref` only

Setup, the Stop hooks, and the Bash hooks need python3.

## Install Katharsis

1. In Claude Code, add the marketplace and install the plugin:

   ```
   /plugin marketplace add OpenScribbler/Katharsis
   /plugin install katharsis@openscribbler
   ```

1. Run setup:

   ```
   /katharsis:setup
   ```

1. Open `/config`, select **Output style**, and choose a Katharsis style.

## What setup changes

Setup adds two entries to `permissions.allow` in `~/.claude/settings.json`:

```
Bash(~/.claude/katharsis/scripts/katharsis-exchange-style.sh:*)
Bash(~/.claude/katharsis/scripts/katharsis-artifact.sh:*)
```

The entries let the model run the per-turn script, and the diagram, question page, and video script at the `rich` richness level or for a question page you ask for, without a permission prompt.
A video tool the model runs is not covered: it runs as its own Bash call, under your permission prompt.
The setup script writes nothing else outside `~/.claude/katharsis-data/`.
It also checks your Claude Code version, and prints the fix when it is older than 2.1.287.
When the version check fails, setup still adds the permission but doesn't finish, and each new session asks you to
run setup again until it passes.
To preview the change, run `~/.claude/katharsis/scripts/setup.sh --dry-run`.

Setup's output ends with the diagram renderers (`d2`, `mmdc`) and video tools (`vhs`, `ffmpeg`, `remotion`) it finds, unless setup stops early on a settings file it cannot edit or a Claude Code too old.
For each one missing, it prints an install command when the installer that command needs, such as `brew`, `curl`, `go`, or `npm`, is on your PATH, and names the missing installer otherwise.
Remotion counts only as the Katharsis Remotion project in `~/.claude/katharsis-data/remotion/`, which its install command creates with Remotion's packages and the browser it renders with, marking it ready only once the browser is in place; a global `remotion` command does not count.
When `vhs` or `ffmpeg` is found, setup marks Remotion not needed and offers no command, because `rich` uses those first.
Remotion needs a paid company license for an organization above its small-team threshold; see [remotion.dev/license](https://www.remotion.dev/license).
The script installs nothing.
`/katharsis:setup` runs an install command only after you say yes to that command, and hands a command that contains `sudo`, or one that fails for lack of permission, to you to run in a terminal outside Claude Code.
Without a video tool, `rich` uses Claude Motion when the session offers it and the option is on, otherwise a rendered diagram, otherwise an inline sketch.

## Check your instruction files

Setup ends by offering `/katharsis:rules-check`, which you can also run at any time.
It reads every instruction file Claude Code loads for the current project: `CLAUDE.md` files from the root down,
`CLAUDE.local.md`, `.claude/rules/`, `AGENTS.md` where Claude Code loads it, and every file those import with `@`.
It reports the rules that repeat the style, the rules that contradict it, and a count of the rest.
Each duplicate and conflict comes with a suggested edit.
The skill changes a file only after you approve that edit, and a file that reaches every project, such as
`~/.claude/CLAUDE.md`, needs its own yes.

## Output styles

| Style | Description |
|---|---|
| `katharsis:Katharsis` | The style alone. Claude Code drops its built-in software engineering instructions. |
| `katharsis:Katharsis coding` | The style plus Claude Code's built-in software engineering instructions. |

`/config` saves your choice to `.claude/settings.local.json` in the current project.
Until you choose a Katharsis style, the per-turn and Stop hooks stay idle.
The session-start hook still creates the symlink and the data directory, and asks you to run setup until you do.
The Bash hooks that save a file a call replaced unread run either way.

## Mods

Katharsis is a mod, a plugin with a hooks module that Claude Code loads with no flag from 2.1.287 on.
On a Claude Code that doesn't load mods, the per-turn reminder doesn't reach the model, the Stop hooks stay idle, and
[the drawer](../../how/drawer/) doesn't appear.
The Bash hooks that save a file a call replaced unread still run.
