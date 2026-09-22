#!/usr/bin/env bash
# Tests for session-link.sh: the link is made and remade, a real directory at
# the link path is reported rather than replaced, the setup line prints until
# .setup-done exists, the plugin root falls back to the script's own parent,
# and every path exits 0 silently otherwise.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
LINKER="$ROOT/scripts/session-link.sh"
PASS=0; FAIL=0
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT

run() { # run <plugin_root or empty> <link> <data>
  if [ -n "$1" ]; then
    OUT="$(printf '%s' '{"hook_event_name":"SessionStart"}' | CLAUDE_PLUGIN_ROOT="$1" KATHARSIS_DIR="$2" KATHARSIS_DATA="$3" "$LINKER" 2>&1)"; RC=$?
  else
    OUT="$(printf '%s' '{"hook_event_name":"SessionStart"}' | env -u CLAUDE_PLUGIN_ROOT KATHARSIS_DIR="$2" KATHARSIS_DATA="$3" "$LINKER" 2>&1)"; RC=$?
  fi
}
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else
    echo "FAIL $1: got [$2] want [$3]"; FAIL=$((FAIL+1)); fi }
contains() { case "$OUT" in *"$2"*) PASS=$((PASS+1));; *)
    echo "FAIL $1: [$OUT] lacks [$2]"; FAIL=$((FAIL+1));; esac }

mkdir -p "$T/cache/v1" "$T/cache/v2"

# 1. first session: link made to the plugin root, data dir created, setup line printed
run "$T/cache/v1" "$T/home/.claude/katharsis" "$T/home/.claude/katharsis-data"
check "first rc" "$RC" "0"
check "link target" "$(readlink "$T/home/.claude/katharsis")" "$T/cache/v1"
if [ -d "$T/home/.claude/katharsis-data" ]; then PASS=$((PASS+1)); else echo "FAIL data dir not created"; FAIL=$((FAIL+1)); fi
contains "setup line" "run /katharsis:setup"

# 2. the plugin moved (an update changed the cache path): the link follows
run "$T/cache/v2" "$T/home/.claude/katharsis" "$T/home/.claude/katharsis-data"
check "moved rc" "$RC" "0"
check "link follows the root" "$(readlink "$T/home/.claude/katharsis")" "$T/cache/v2"

# 2b. a link that already points at the root is left alone, not rewritten
python3 -c 'import os,sys,time; t=time.time()-3600; os.utime(sys.argv[1],(t,t),follow_symlinks=False)' "$T/home/.claude/katharsis"
BEFORE="$(stat -c %Y "$T/home/.claude/katharsis")"
run "$T/cache/v2" "$T/home/.claude/katharsis" "$T/home/.claude/katharsis-data"
check "unchanged rc" "$RC" "0"
check "link not rewritten" "$(stat -c %Y "$T/home/.claude/katharsis")" "$BEFORE"
check "link still right" "$(readlink "$T/home/.claude/katharsis")" "$T/cache/v2"

# 3. once setup has run, the hook is silent
: > "$T/home/.claude/katharsis-data/.setup-done"
run "$T/cache/v2" "$T/home/.claude/katharsis" "$T/home/.claude/katharsis-data"
check "silent rc" "$RC" "0"
check "silent" "$OUT" ""

# 4. a real directory at the link path (left by 0.2.x) is reported and kept
mkdir -p "$T/old/.claude/katharsis/rules"; : > "$T/old/.claude/katharsis/rules/writing.md"
run "$T/cache/v2" "$T/old/.claude/katharsis" "$T/old/.claude/katharsis-data"
check "old dir rc" "$RC" "0"
contains "old dir reported" "left by Katharsis 0.2.x"
if [ -f "$T/old/.claude/katharsis/rules/writing.md" ] && [ ! -L "$T/old/.claude/katharsis" ]; then PASS=$((PASS+1)); else
  echo "FAIL old directory was replaced or emptied"; FAIL=$((FAIL+1)); fi

# 4b. a regular file at the link path is reported and kept, never replaced
mkdir -p "$T/file/.claude"; printf 'mine' > "$T/file/.claude/katharsis"
run "$T/cache/v2" "$T/file/.claude/katharsis" "$T/file/.claude/katharsis-data"
check "file rc" "$RC" "0"
contains "file reported" "a file of your own"
if [ -f "$T/file/.claude/katharsis" ] && [ ! -L "$T/file/.claude/katharsis" ] && [ "$(cat "$T/file/.claude/katharsis")" = "mine" ]; then PASS=$((PASS+1)); else
  echo "FAIL regular file was replaced"; FAIL=$((FAIL+1)); fi

# 5. without CLAUDE_PLUGIN_ROOT the root is the script's own parent, for a checkout
run "" "$T/checkout/.claude/katharsis" "$T/checkout/.claude/katharsis-data"
check "checkout rc" "$RC" "0"
check "checkout link target" "$(readlink "$T/checkout/.claude/katharsis")" "$ROOT"

echo
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
