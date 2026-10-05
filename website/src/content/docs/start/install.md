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

Setup adds one entry to `permissions.allow` in `~/.claude/settings.json`:

```
Bash(~/.claude/katharsis/scripts/katharsis-exchange-style.sh:*)
```

The entry lets the model run the per-turn script without a permission prompt.
Setup writes nothing else outside `~/.claude/katharsis-data/`.
It also checks your Claude Code version, and prints the fix when it is older than 2.1.287.
When either check fails, setup still adds the permission but doesn't finish, and each new session asks you to run
setup again until both checks pass.
To preview the change, run `~/.claude/katharsis/scripts/setup.sh --dry-run`.

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

Katharsis is a mod, a plugin with a hooks module that Claude Code loads from 2.1.287 on, with no flag to set.
On an older Claude Code, the per-turn reminder doesn't reach the model, the Stop hooks stay idle, and
[the drawer](../../how/drawer/) doesn't appear.
The Bash hooks that save a file a call replaced unread still run.
