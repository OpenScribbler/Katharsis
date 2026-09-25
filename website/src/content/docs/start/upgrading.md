---
title: Upgrading from 0.2.x
description: Remove the 0.2.x memory-file rules before installing 0.3.0 or later.
---

0.2.x installed writing rules into your memory file through a managed block, and 0.3.0 removes
the rules and their uninstaller. Run 0.2.1's `scripts/uninstall-rules.sh apply` before
upgrading, which removes the block, the rule files under `~/.claude/katharsis/`, and any
settings edits it recorded. It refuses to delete a rule file you edited, a `promoted.md` with
content, or anything the audit wrote, and names each one it leaves.

Read what remains under `~/.claude/katharsis/` and remove the directory yourself, because it has
to be gone before the 0.3.0 symlink can take its place, and the session-start hook says so when it
is not. [CHANGELOG.md](https://github.com/OpenScribbler/Katharsis/blob/main/CHANGELOG.md) has the full list of what 0.3.0 removed.
