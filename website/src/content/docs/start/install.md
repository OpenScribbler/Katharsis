---
title: Install
description: Add the marketplace, install the plugin, run setup, and pick the style.
---

## Requirements

Claude Code 2.1.278 or later with `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` set, bash, and python3.
Only the routing script and the session-start hook are plain bash. Setup, all three Stop hooks,
and `kref` need python3, so without it setup fails and the ledger is not written.

## Steps

1. Set the function-hooks variable in the shell that starts Claude Code, and in your shell
   profile so it stays set:

   ```sh
   export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1
   ```

2. Install the plugin from inside Claude Code:

   ```
   /plugin marketplace add OpenScribbler/Katharsis
   /plugin install katharsis@openscribbler
   ```

3. Run setup in a Claude Code session:

   ```
   /katharsis:setup
   ```

4. Open `/config`, choose Output style, and pick one of the two styles below.

## What setup changes

Setup does the one thing a plugin cannot do for itself. The style has the model run one script
per turn, and in default permission mode that Bash call prompts on first use in every session, so
setup adds one entry to `permissions.allow` in `~/.claude/settings.json`:

```
Bash(~/.claude/katharsis/scripts/katharsis-exchange-style.sh:*)
```

It writes nothing else outside `~/.claude/katharsis-data/`. It also checks that Claude Code is
2.1.278 or later and that `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` is set, and prints the fix when
either is missing. The same script runs from a terminal as `~/.claude/katharsis/scripts/setup.sh`,
and `--dry-run` prints the change without writing it.

## The two styles

| Style | What it is |
|---|---|
| `katharsis:Katharsis` | The style alone. Claude Code's built-in software-engineering instructions are dropped, which is the default for any custom output style. |
| `katharsis:Katharsis coding` | The same style with those built-in instructions kept. |

The two share one body, and a test holds them identical below the frontmatter. `/config` saves
the choice to `.claude/settings.local.json` in the current project. Until you pick one, the
per-turn and Stop hooks stay silent and write nothing. The session-start hook runs regardless:
it makes the symlink, creates the data directory, and prints one line asking for setup until
setup has run.

## Function hooks

Claude Code 2.1.278 can load a plugin's hooks module, a TypeScript file that answers events in
the engine, behind `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. The surface is undocumented, off by
default, and marked early access, and Katharsis depends on it: `hooks/register.ts` carries the
per-turn reminder, reading the active style from the settings the engine runs under and telling an
untyped turn from the prompt's origin. Without the variable, no reminder reaches the model and the
Stop hooks stay idle. The module also draws [the drawer](../../how/drawer/). `claude plugin test .`
runs the module's tests.
