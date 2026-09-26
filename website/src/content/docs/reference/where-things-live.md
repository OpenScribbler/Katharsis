---
title: Where things live
description: The paths Katharsis creates and how long each one lasts.
---

| Path | Contents | Lifetime |
|---|---|---|
| `~/.claude/katharsis` | Symlink to the plugin's install directory, remade at every session start | Follows the plugin |
| `~/.claude/katharsis-data/ledger/` | One JSONL file per session, grouped by project | Outlives the plugin |
| `~/.claude/katharsis-data/telemetry/` | Counts per reply and per skipped classification, with no message text | Outlives the plugin |
| `~/.claude/katharsis-data/kref-out/` | HTML pages from `kref --html` | Outlives the plugin |

The symlink gives the style and scripts a fixed path, because the plugin's install directory changes on every update.
The data directory is separate because updates replace the install directory.
To change either path, set `KATHARSIS_DIR` or `KATHARSIS_DATA`.
