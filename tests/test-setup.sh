#!/usr/bin/env bash
# Tests for setup.sh against a sandbox settings file: the permission entry is
# added once and preserved on a second run, other settings survive the write,
# --dry-run writes nothing, a settings file that is not JSON is left alone with
# the entry printed for a hand edit, and the .setup-done marker lands only on a
# real run.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
SETUP="$DIR/../scripts/setup.sh"
PASS=0; FAIL=0
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
ENTRY='Bash(~/.claude/katharsis/scripts/katharsis-exchange-style.sh:*)'

run() { OUT="$(CLAUDE_DIR="$1" KATHARSIS_DATA="$T/data" "$SETUP" "${@:2}" 2>&1)"; RC=$?; }
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else
    echo "FAIL $1: got [$2] want [$3]"; FAIL=$((FAIL+1)); fi }
contains() { case "$OUT" in *"$2"*) PASS=$((PASS+1));; *)
    echo "FAIL $1: [$OUT] lacks [$2]"; FAIL=$((FAIL+1));; esac }
allow_count() { python3 -c 'import json,sys; s=json.load(open(sys.argv[1])); print(s.get("permissions",{}).get("allow",[]).count(sys.argv[2]))' "$1" "$ENTRY"; }

# 1. no settings file: one is created holding the entry, and setup completes
mkdir -p "$T/fresh"
run "$T/fresh"
check "fresh rc" "$RC" "0"
check "fresh entry added" "$(allow_count "$T/fresh/settings.json")" "1"
contains "fresh says added" "Permission: added"
contains "fresh names both styles" "katharsis:Katharsis coding"
contains "fresh names /config" "/config"
if [ -e "$T/data/.setup-done" ]; then PASS=$((PASS+1)); else echo "FAIL .setup-done missing"; FAIL=$((FAIL+1)); fi

# 2. a second run adds nothing and says so
run "$T/fresh"
check "rerun rc" "$RC" "0"
check "rerun still one entry" "$(allow_count "$T/fresh/settings.json")" "1"
contains "rerun says already" "already in"

# 3. existing settings survive: other keys, other allow entries, and the deny list
mkdir -p "$T/full"
cat > "$T/full/settings.json" <<'EOF'
{"outputStyle": "Concise", "permissions": {"allow": ["Bash(git status:*)"], "deny": ["WebFetch"]}, "hooks": {"Stop": []}}
EOF
run "$T/full"
check "full rc" "$RC" "0"
check "full entry added" "$(allow_count "$T/full/settings.json")" "1"
python3 - "$T/full/settings.json" <<'PY' && PASS=$((PASS+1)) || { echo "FAIL full: other settings lost"; FAIL=$((FAIL+1)); }
import json, sys
s = json.load(open(sys.argv[1]))
assert s["outputStyle"] == "Concise"
assert s["permissions"]["allow"][0] == "Bash(git status:*)"
assert s["permissions"]["deny"] == ["WebFetch"]
assert s["hooks"] == {"Stop": []}
PY

# 4. --dry-run prints the change and writes nothing, marker included
rm -rf "$T/data"
mkdir -p "$T/dry"; echo '{"permissions": {"allow": []}}' > "$T/dry/settings.json"
run "$T/dry" --dry-run
check "dry rc" "$RC" "0"
contains "dry names the entry" "$ENTRY"
contains "dry says dry run" "dry run"
check "dry wrote nothing" "$(allow_count "$T/dry/settings.json")" "0"
if [ -e "$T/data/.setup-done" ]; then echo "FAIL dry run wrote .setup-done"; FAIL=$((FAIL+1)); else PASS=$((PASS+1)); fi

# 5. a settings file that is not JSON is left alone, with the entry printed
mkdir -p "$T/broken"; printf '{ not json' > "$T/broken/settings.json"
run "$T/broken"
check "broken rc" "$RC" "3"
contains "broken says not valid" "not valid JSON"
contains "broken prints the entry" "$ENTRY"
check "broken untouched" "$(cat "$T/broken/settings.json")" "{ not json"
if [ -e "$T/data/.setup-done" ]; then echo "FAIL broken run wrote .setup-done"; FAIL=$((FAIL+1)); else PASS=$((PASS+1)); fi

# 6. an unknown argument is rejected
run "$T/fresh" --nonsense
check "unknown arg rc" "$RC" "2"

echo
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
