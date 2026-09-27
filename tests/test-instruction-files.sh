#!/usr/bin/env bash
# Tests for instruction-files.sh against a sandbox tree: load order, the
# AGENTS.md rule, subfolder files, @imports resolved from the importing file
# and capped at four hops, imports inside code ignored, each file listed once,
# and a missing folder refused.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$DIR/../scripts/instruction-files.sh"
PASS=0; FAIL=0
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
T="$(cd "$T" && pwd -P)"
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else
    printf 'FAIL %s:\n got  [%s]\n want [%s]\n' "$1" "$2" "$3"; FAIL=$((FAIL+1)); fi }
run() { OUT="$(CLAUDE_DIR="$T/home/.claude" KATHARSIS_MANAGED="$T/managed.md" "$SCRIPT" "$@" 2>&1)"; RC=$?; }

mkdir -p "$T/home/.claude/rules/sub" "$T/ws/repo/.claude/rules" "$T/ws/repo/pkg/deep" "$T/ws/repo/node_modules/x" "$T/shared"
echo "managed" > "$T/managed.md"
echo "user @../../shared/a.md" > "$T/home/.claude/CLAUDE.md"
echo "rule" > "$T/home/.claude/rules/sub/z.md"
echo "ws" > "$T/ws/CLAUDE.md"
printf 'repo @AGENTS.md and @./notes.md, not `see @code.md`, not me@example.com\n```\n@fenced.md\n```\n' > "$T/ws/repo/CLAUDE.md"
echo "agents" > "$T/ws/repo/AGENTS.md"
echo "notes @notes.md" > "$T/ws/repo/notes.md"
for f in code.md fenced.md; do echo x > "$T/ws/repo/$f"; done
echo "local" > "$T/ws/repo/CLAUDE.local.md"
echo "prule" > "$T/ws/repo/.claude/rules/style.md"
echo "pkg" > "$T/ws/repo/pkg/deep/CLAUDE.md"
echo "dep" > "$T/ws/repo/node_modules/x/CLAUDE.md"
# a.md imports b through f, one hop each; e and f are past the four-hop cap from CLAUDE.md
for x in a:b b:c c:d d:e e:f; do echo "@${x#*:}.md" > "$T/shared/${x%:*}.md"; done
echo end > "$T/shared/f.md"

# 1. the full set, in load order, each once
run "$T/ws/repo"
check "full rc" "$RC" "0"
check "full list" "$OUT" "managed	$T/managed.md
user	$T/home/.claude/CLAUDE.md
user	$T/home/.claude/rules/sub/z.md
project	$T/ws/CLAUDE.md
project	$T/ws/repo/CLAUDE.md
project	$T/ws/repo/CLAUDE.local.md
project	$T/ws/repo/.claude/rules/style.md
subdir	$T/ws/repo/pkg/deep/CLAUDE.md
import	$T/shared/a.md
import	$T/ws/repo/AGENTS.md
import	$T/ws/repo/notes.md
import	$T/shared/b.md
import	$T/shared/c.md
import	$T/shared/d.md"

# 2. with no CLAUDE.md in the chain, AGENTS.md loads on its own
mkdir -p "$T/solo"; echo "solo" > "$T/solo/AGENTS.md"
run "$T/solo"
check "agents-only" "$(printf '%s\n' "$OUT" | grep -v '^user\|^managed\|shared/')" "agents	$T/solo/AGENTS.md"

# 3. with a CLAUDE.md, an unimported AGENTS.md stays out unless the setting asks for both
mkdir -p "$T/both/.claude"; echo "c" > "$T/both/CLAUDE.md"; echo "a" > "$T/both/AGENTS.md"
run "$T/both"
check "agents skipped" "$(printf '%s\n' "$OUT" | grep -c AGENTS.md)" "0"
echo '{"instructionFiles": "claude-md-and-agents-md"}' > "$T/both/.claude/settings.local.json"
run "$T/both"
check "agents by setting" "$(printf '%s\n' "$OUT" | grep AGENTS.md)" "agents	$T/both/AGENTS.md"

# 4. a folder with nothing lists nothing and exits 0
mkdir -p "$T/empty"
OUT="$(CLAUDE_DIR="$T/none" KATHARSIS_MANAGED="$T/none.md" "$SCRIPT" "$T/empty" 2>&1)"; RC=$?
check "empty rc" "$RC" "0"
check "empty out" "$OUT" ""

# 5. a missing folder exits 2
run "$T/missing"
check "missing rc" "$RC" "2"
check "missing says so" "$OUT" "instruction-files: no folder $T/missing"

echo "instruction-files: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
