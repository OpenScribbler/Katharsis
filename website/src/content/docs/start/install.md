---
title: Install
description: Install the Katharsis plugin, run setup, and choose an output style.
---

## Requirements

- Claude Code 2.1.278 or later
- The `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` environment variable
- bash and python3

Setup, the Stop hooks, and `kref` need python3.

## Install Katharsis

1. Add the variable to your shell profile, then restart your shell:

   ```sh
   export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1
   ```

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
It also checks your Claude Code version and the function hooks variable, and prints the fix for either.
To preview the change, run `~/.claude/katharsis/scripts/setup.sh --dry-run`.

## Output styles

| Style | Description |
|---|---|
| `katharsis:Katharsis` | The style alone. Claude Code drops its built-in software engineering instructions. |
| `katharsis:Katharsis coding` | The style plus Claude Code's built-in software engineering instructions. |

`/config` saves your choice to `.claude/settings.local.json` in the current project.
Until you choose a Katharsis style, the per-turn and Stop hooks stay idle.
The session-start hook still creates the symlink and the data directory, and asks you to run setup until you do.

## Function hooks

Katharsis depends on function hooks, an early-access Claude Code feature that `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`
turns on.
Without the variable, the per-turn reminder doesn't reach the model, the Stop hooks stay idle, and
[the drawer](../../how/drawer/) doesn't appear.
