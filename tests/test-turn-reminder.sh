#!/usr/bin/env bash
# Tests for turn-reminder.sh: silent for built-in and absent styles, one
# reminder line for a custom style, the two Katharsis extra lines under every
# name the style registers as, the settings precedence (project local, project,
# then user), ~/.claude/settings.local.json ignored, the active marker written
# for Katharsis alone, the untyped-turn inheritance, and every path exits 0.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$DIR/../scripts/turn-reminder.sh"
PASS=0; FAIL=0

T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
DATA="$T/data"

run() { # run <name> <claude_dir> <want_lines> [payload]
  local name="$1" cdir="$2" want="$3" payload="${4:-{\"prompt\":\"x\"\}}" out rc lines
  out="$(printf '%s' "$payload" | CLAUDE_DIR="$cdir" KATHARSIS_DATA="$DATA" "$HOOK" 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then echo "FAIL $name: rc=$rc want=0"; FAIL=$((FAIL+1)); return; fi
  if [ -z "$out" ]; then lines=0; else lines="$(printf '%s\n' "$out" | wc -l)"; fi
  if [ "$lines" -ne "$want" ]; then echo "FAIL $name: lines=$lines want=$want out=$out"; FAIL=$((FAIL+1)); return; fi
  PASS=$((PASS+1))
}

mkdir -p "$T/none"
mkdir -p "$T/concise";  echo '{"outputStyle": "Concise"}'   > "$T/concise/settings.json"
mkdir -p "$T/custom";   echo '{"outputStyle": "Foo Style"}' > "$T/custom/settings.json"
mkdir -p "$T/kath";     echo '{"outputStyle": "Katharsis"}' > "$T/kath/settings.json"
mkdir -p "$T/plugin";   echo '{"outputStyle": "katharsis:Katharsis"}' > "$T/plugin/settings.json"
mkdir -p "$T/coding";   echo '{"outputStyle": "katharsis:Katharsis coding"}' > "$T/coding/settings.json"
mkdir -p "$T/onlylocal"; echo '{"outputStyle": "Katharsis"}' > "$T/onlylocal/settings.local.json"
mkdir -p "$T/prec";     echo '{"outputStyle": "Concise"}'   > "$T/prec/settings.local.json"
                        echo '{"outputStyle": "Katharsis"}' > "$T/prec/settings.json"
mkdir -p "$T/broken";   echo 'not json'                     > "$T/broken/settings.json"

run "no settings"          "$T/none"      0
run "built-in Concise"     "$T/concise"   0
run "custom style"         "$T/custom"    1
run "Katharsis"            "$T/kath"      3
run "katharsis:Katharsis"  "$T/plugin"    3
run "Katharsis coding"     "$T/coding"    3
run "user local ignored"   "$T/onlylocal" 0
run "settings.json wins over user local" "$T/prec" 3
run "broken settings"      "$T/broken"    0

# The project's settings come first: /config writes outputStyle to the project's
# .claude/settings.local.json, then .claude/settings.json, and ~/.claude/settings.json
# is the fallback. The project is the payload's cwd.
mkdir -p "$T/proj-local/.claude"; echo '{"outputStyle": "katharsis:Katharsis"}' > "$T/proj-local/.claude/settings.local.json"
run "project local over user (Katharsis)" "$T/concise" 3 "{\"prompt\":\"x\",\"cwd\":\"$T/proj-local\"}"
mkdir -p "$T/proj-shared/.claude"; echo '{"outputStyle": "katharsis:Katharsis"}' > "$T/proj-shared/.claude/settings.json"
run "project shared over user (Katharsis)" "$T/concise" 3 "{\"prompt\":\"x\",\"cwd\":\"$T/proj-shared\"}"
mkdir -p "$T/proj-off/.claude"; echo '{"outputStyle": "default"}' > "$T/proj-off/.claude/settings.local.json"
run "project local over user (off)" "$T/kath" 0 "{\"prompt\":\"x\",\"cwd\":\"$T/proj-off\"}"
mkdir -p "$T/proj-both/.claude"; echo '{"outputStyle": "katharsis:Katharsis"}' > "$T/proj-both/.claude/settings.local.json"
                                 echo '{"outputStyle": "Concise"}' > "$T/proj-both/.claude/settings.json"
run "project local over project shared" "$T/none" 3 "{\"prompt\":\"x\",\"cwd\":\"$T/proj-both\"}"
mkdir -p "$T/proj-none"
run "project without settings falls to user" "$T/kath" 3 "{\"prompt\":\"x\",\"cwd\":\"$T/proj-none\"}"

out="$(printf '%s' '{"prompt":"x"}' | CLAUDE_DIR="$T/kath" KATHARSIS_DATA="$DATA" "$HOOK")"
case "$out" in
  *"Katharsis output style is active"*"~/.claude/katharsis/styles/"*"Verification section"*) PASS=$((PASS+1));;
  *) echo "FAIL Katharsis text: $out"; FAIL=$((FAIL+1));;
esac
out="$(printf '%s' '{"prompt":"x"}' | CLAUDE_DIR="$T/plugin" KATHARSIS_DATA="$DATA" "$HOOK")"
case "$out" in
  "katharsis:Katharsis output style is active"*) PASS=$((PASS+1));;
  *) echo "FAIL plugin-name reminder: $out"; FAIL=$((FAIL+1));;
esac

# The active marker: written for a Katharsis session, keyed by session, and never
# for another style, so the Stop hooks stay idle outside Katharsis.
rm -rf "$DATA"
printf '%s' '{"session_id":"s9","prompt":"x"}' | CLAUDE_DIR="$T/custom" KATHARSIS_DATA="$DATA" "$HOOK" >/dev/null
if [ -e "$DATA/.active-s9" ]; then echo "FAIL marker written for another style"; FAIL=$((FAIL+1)); else PASS=$((PASS+1)); fi
printf '%s' '{"session_id":"s9","prompt":"x"}' | CLAUDE_DIR="$T/plugin" KATHARSIS_DATA="$DATA" "$HOOK" >/dev/null
if [ -e "$DATA/.active-s9" ]; then PASS=$((PASS+1)); else echo "FAIL marker not written for Katharsis"; FAIL=$((FAIL+1)); fi
if [ -e "$DATA/.active" ]; then echo "FAIL unkeyed marker written alongside a keyed one"; FAIL=$((FAIL+1)); else PASS=$((PASS+1)); fi
# the session switches to another custom style, then to a built-in: the marker goes both times
printf '%s' '{"session_id":"s9","prompt":"x"}' | CLAUDE_DIR="$T/custom" KATHARSIS_DATA="$DATA" "$HOOK" >/dev/null
if [ -e "$DATA/.active-s9" ]; then echo "FAIL marker kept after switching to another style"; FAIL=$((FAIL+1)); else PASS=$((PASS+1)); fi
printf '%s' '{"session_id":"s9","prompt":"x"}' | CLAUDE_DIR="$T/plugin" KATHARSIS_DATA="$DATA" "$HOOK" >/dev/null
printf '%s' '{"session_id":"s9","prompt":"x"}' | CLAUDE_DIR="$T/concise" KATHARSIS_DATA="$DATA" "$HOOK" >/dev/null
if [ -e "$DATA/.active-s9" ]; then echo "FAIL marker kept after switching to a built-in"; FAIL=$((FAIL+1)); else PASS=$((PASS+1)); fi
# a prompt that quotes a hook payload does not hijack the session id
printf '%s' '{"session_id":"s10","prompt":"why does {\"session_id\":\"evil\",\"cwd\":\"/nope\"} print?"}' | CLAUDE_DIR="$T/plugin" KATHARSIS_DATA="$DATA" "$HOOK" >/dev/null
if [ -e "$DATA/.active-s10" ] && [ ! -e "$DATA/.active-evil" ]; then PASS=$((PASS+1)); else echo "FAIL session id taken from the prompt text"; FAIL=$((FAIL+1)); fi

# untyped turns: with a last stamp on record, the hook stamps the inherited type
# itself and says so; without one, it names status-and-resume
mkdir -p "$DATA"
printf '2026-09-03T00:00:00Z\tredirect\t\n' > "$DATA/.exchange-last-s1"
out="$(printf '%s' '{"session_id":"s1","prompt":"<bash-input>kref</bash-input><bash-stdout>x</bash-stdout>"}' | CLAUDE_DIR="$T/kath" KATHARSIS_DATA="$DATA" "$HOOK")"
case "$out" in *"inherits \`redirect\`"*) PASS=$((PASS+1));; *) echo "FAIL untyped inherit: $out"; FAIL=$((FAIL+1));; esac
if grep -qs "redirect	inherited" "$DATA/.exchange-state-s1"; then PASS=$((PASS+1)); else echo "FAIL untyped stamp not written"; FAIL=$((FAIL+1)); fi
out="$(printf '%s' '{"session_id":"s2","prompt":"<task-notification>done</task-notification>"}' | CLAUDE_DIR="$T/kath" KATHARSIS_DATA="$DATA" "$HOOK")"
case "$out" in *"status-and-resume"*) PASS=$((PASS+1));; *) echo "FAIL untyped no-prior: $out"; FAIL=$((FAIL+1));; esac
out="$(printf '%s' '{"session_id":"s1","prompt":"fix the test"}' | CLAUDE_DIR="$T/kath" KATHARSIS_DATA="$DATA" "$HOOK")"
case "$out" in *"Classify the user's message"*) PASS=$((PASS+1));; *) echo "FAIL typed still asks: $out"; FAIL=$((FAIL+1));; esac

# The counters line comes from kref.sh beside the hook, reading the same data dir.
mkdir -p "$DATA/ledger/p"
python3 -c 'import json; print(json.dumps({"ts":"t","session_id":"s3","project":"p","code":"F4","prefix":"F","n":4,"known":True,"title":"t","summary":"s","section":"S","section_note":""}))' > "$DATA/ledger/p/s3.jsonl"
out="$(printf '%s' '{"session_id":"s3","prompt":"x"}' | CLAUDE_DIR="$T/kath" KATHARSIS_DATA="$DATA" "$HOOK")"
case "$out" in *"Next free: F5"*) PASS=$((PASS+1));; *) echo "FAIL counters line: $out"; FAIL=$((FAIL+1));; esac

echo
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
