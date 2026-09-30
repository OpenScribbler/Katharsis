#!/usr/bin/env bash
# mistakes.sh: Claude Code hook and replay entry point for mistakes.py, which
# checks the reply's claims against the session's tool results and watches
# Bash calls that replace a file the session never read.
#
#   mistakes.sh                        PreToolUse, PostToolUse, PostToolUseFailure
#                                      or Stop hook (payload on stdin)
#   mistakes.sh --replay <transcript>  prints contract records on stdout
#
# Without python3 the hook does nothing and exits 0.
command -v python3 >/dev/null 2>&1 || exit 0
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$DIR/mistakes.py" "$@"
