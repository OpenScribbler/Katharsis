---
title: Uninstall
description: Remove the Katharsis plugin and the permission entry setup added.
---

1. In Claude Code, run:

   ```
   /plugin uninstall katharsis@openscribbler
   ```

1. In each project where you chose a Katharsis style, open `/config` and choose another output style.
1. Remove the `katharsis-exchange-style.sh` entry from `permissions.allow` in `~/.claude/settings.json`.

Uninstalling leaves the `~/.claude/katharsis` symlink, which then points at nothing, and the `~/.claude/katharsis-data/`
directory, which holds your ledger, session records, answers, and telemetry.
Delete them if you don't want to keep them.
