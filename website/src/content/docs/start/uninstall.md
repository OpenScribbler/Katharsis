---
title: Uninstall
description: Remove the Katharsis plugin and the permission entry setup added.
---

1. In Claude Code, run:

   ```
   /plugin uninstall katharsis@openscribbler
   ```

1. Open `/config` and choose another output style.
1. Remove the `katharsis-exchange-style.sh` entry from `permissions.allow` in `~/.claude/settings.json`.

Uninstalling leaves the `~/.claude/katharsis` symlink and the `~/.claude/katharsis-data/` directory, which holds your
ledger.
Delete them if you don't want to keep them.
