#!/usr/bin/env bash
# session-link.sh: SessionStart hook. Points ~/.claude/katharsis at the plugin
# root so the output style, the model's Bash calls, and the user's shell all
# reach the plugin's files at one fixed path.
#
# Why a symlink: the style markdown and the model's own Bash calls cannot
# expand ${CLAUDE_PLUGIN_ROOT}; only hook commands can. A marketplace install
# copies the plugin into a versioned cache path that changes on every update,
# so nothing outside a hook can be given that path once. The link is remade at
# every SessionStart (startup, resume, clear, compact, fork), so an update
# that moves the cache is followed on the next session.
#
# Two lines it can print, both into the model's context, since SessionStart
# stdout lands there:
#   - the path is a real directory rather than a link. Katharsis 0.2.x copied
#     rules into ~/.claude/katharsis, and a link cannot replace a directory.
#   - setup has not run (no .setup-done in the data directory), so the user
#     still has to run /katharsis:setup. The line stops once the marker exists.
# On the ordinary path it prints nothing.
#
# Pure bash, no python3, so the style keeps working even when the hooks that
# need python3 cannot run. KATHARSIS_DIR overrides the link path and
# KATHARSIS_DATA the data directory for tests. Failsafe: every path exits 0.

set -u
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
LINK="${KATHARSIS_DIR:-$HOME/.claude/katharsis}"
DATA="${KATHARSIS_DATA:-$HOME/.claude/katharsis-data}"

mkdir -p "$DATA" 2>/dev/null || true

if [ -e "$LINK" ] && [ ! -L "$LINK" ]; then
  echo "Katharsis 0.3: $LINK is a directory left by Katharsis 0.2.x, or a file of your own, so the plugin's files cannot be linked there. Remove it and restart Claude Code (see the CHANGELOG)."
  exit 0
fi

mkdir -p "$(dirname "$LINK")" 2>/dev/null || true
ln -sfn "$ROOT" "$LINK" 2>/dev/null || true

[ -e "$DATA/.setup-done" ] || echo "Katharsis is installed but not set up; run /katharsis:setup."
exit 0
