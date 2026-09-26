---
title: Where things live
description: The paths Katharsis creates and how long each one lasts.
---

| Path | Contents | Lifetime |
|---|---|---|
| `~/.claude/katharsis` | Symlink to the plugin's install directory, remade at every session start | Follows the plugin |
| `~/.claude/katharsis-data/ledger/` | One JSONL file per session, grouped by project, and `chains/`, which links a session started from a handoff to the session it continues | Outlives the plugin |
| `~/.claude/katharsis-data/telemetry/` | Per-reply counts, the model and exchange type, detector rule names, gate misses, and renumbered codes, with no message text |
| `~/.claude/katharsis-data/sessions/` | One JSON record per session: the folder, branch, Katharsis release, transcript path, and a short title | Outlives the plugin |
| `~/.claude/katharsis-data/answers/` | One JSONL file per session, naming each question answered or dismissed and the option chosen | Outlives the plugin | Outlives the plugin |
| `~/.claude/katharsis-data/kref-out/` | HTML pages from `kref --html` | Outlives the plugin |

The symlink gives the style and scripts a fixed path, because the plugin's install directory changes on every update.
The data directory is separate because updates replace the install directory.
To move the data directory, set `KATHARSIS_DATA`.
The symlink's path is fixed, because the style and the permission entry name it directly.
The data directory also holds small per-session state files whose names start with a dot, and `hint-sessions`, which
lists the first few sessions, which show the answer hint on its row rather than only in a question's hover card.
