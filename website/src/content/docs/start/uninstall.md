---
title: Uninstall
description: Remove the plugin and the one permission entry setup added.
---

```
/plugin uninstall katharsis@openscribbler
```

Then open `/config` and pick another output style, and remove the `permissions.allow` entry
setup added to `~/.claude/settings.json`. The symlink at `~/.claude/katharsis` and everything
under `~/.claude/katharsis-data/` stay behind: the ledger is yours to keep or delete.
