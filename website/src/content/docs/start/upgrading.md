---
title: Upgrading from 0.2.x
description: Remove the 0.2.x memory-file rules before you install 0.3.0 or later.
---

Version 0.2.x installed writing rules into your memory file.
Version 0.3.0 removed those rules and their uninstaller, so remove them before you upgrade.

1. With 0.2.1 installed, run `scripts/uninstall-rules.sh apply`.
   The script removes the managed block, the rule files, and the settings edits it recorded.
   It keeps rule files you edited, a `promoted.md` with content, and audit output, and lists each file it keeps.
1. Review what remains in `~/.claude/katharsis/`, then delete the directory.
   Version 0.3.0 creates a symlink at that path.
1. Install the new version.

The [changelog](https://github.com/OpenScribbler/Katharsis/blob/main/CHANGELOG.md) lists everything 0.3.0 removed.
