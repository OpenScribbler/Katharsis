#!/usr/bin/env bash
# Tests for kref.sh. The data path hangs off $HOME and the project comes from
# $PWD, so every case runs with both pointed at a sandbox and the real ledger
# stays untouched.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
KREF="$DIR/../scripts/kref.sh"
PASS=0; FAIL=0
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT
PROJ="$SANDBOX/work/repo"
mkdir -p "$PROJ"
SLUG="$(python3 -c 'import re,sys; print(re.sub(r"[^A-Za-z0-9]+","-",sys.argv[1]).strip("-").lower())' "$PROJ")"
LED="$SANDBOX/.claude/katharsis-data/ledger/$SLUG"
mkdir -p "$LED"

rec() { # $1 file, $2 session, $3 prefix, $4 n, $5 known, $6 title
  python3 -c 'import json,sys; print(json.dumps({"ts":"t","session_id":sys.argv[1],"project":sys.argv[6],"code":sys.argv[2]+sys.argv[3],"prefix":sys.argv[2],"n":int(sys.argv[3]),"known":sys.argv[4]=="1","title":sys.argv[5],"summary":"s","section":"S","section_note":""}))' "$2" "$3" "$4" "$5" "$6" "$(basename "$LED")" >> "$LED/$1"
}

# The scope is the session, so the tests set CLAUDE_CODE_SESSION_ID rather than
# relying on $PWD. SESSION names the session the call runs as.
SESSION="sess-new"
run() { OUT="$(cd "$PROJ" && HOME="$SANDBOX" CLAUDE_CODE_SESSION_ID="$SESSION" KREF_NO_OPEN=1 "$KREF" "$@" 2>&1)"; RC=$?; }
rows() { printf '%s\n' "$OUT" | grep -v '^## ' | grep -v '^$'; }

check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else
    echo "FAIL $1: got [$2] want [$3]"; FAIL=$((FAIL+1)); fi }

contains() { case "$OUT" in *"$2"*) PASS=$((PASS+1));; *)
    echo "FAIL $1: [$OUT] lacks [$2]"; FAIL=$((FAIL+1));; esac }

lacks() { case "$OUT" in *"$2"*) echo "FAIL $1: [$OUT] holds [$2]"; FAIL=$((FAIL+1));;
    *) PASS=$((PASS+1));; esac }

# 1. an empty ledger: a message, exit 0, never an error
run ""
check "empty ledger rc" "$RC" "0"
contains "empty ledger message" "ledger is empty"

rec sess-old.jsonl sess-old F 2 1 "an older finding"
rec sess-old.jsonl sess-old Z 1 0 "a bespoke code"
sleep 1
rec sess-new.jsonl sess-new F 1 1 "the current finding"
rec sess-new.jsonl sess-new AT 1 1 "the current action"

# 2. bare kref shows this session's items, wherever the hook filed them
run ""
contains "bare shows this session" "the current finding"
lacks    "bare excludes another session" "an older finding"

# 3. this session's records are found from any directory, since the hook files
# them under the cwd at Stop time and a session's cwd moves
OUT="$(cd "$SANDBOX" && HOME="$SANDBOX" CLAUDE_CODE_SESSION_ID=sess-new "$KREF" 2>&1)"
contains "found from another directory" "the current finding"

# 4. a query this session cannot answer widens to the whole ledger, and a
# widened result names the session and project each row came from
OTHER="$SANDBOX/.claude/katharsis-data/ledger/other-project"
mkdir -p "$OTHER"
LED_SAVE="$LED"; LED="$OTHER"
rec sess-far.jsonl sess-far Z 4 0 "a bespoke code elsewhere"
LED="$LED_SAVE"
run "Z"
contains "widened finds other session" "a bespoke code"
contains "widened finds other project" "a bespoke code elsewhere"
contains "widened prints session ID"   "  sess-old"
contains "widened prints project"      "other-project"
contains "widened prints a legend"     "Sessions, oldest first"
contains "widened sections nest"       "### S"
run --html "Z"
OUT="$(cat "$(printf '%s\n' "$OUT" | tail -1)")"
contains "widened html uses details"   "<details><summary>1 · sess-"
contains "widened html has tabs"       "<label for=\"t-chrono\">Chronological</label><label for=\"t-session\">"
contains "widened html chrono default" 'id="t-chrono" checked'
contains "widened html has filters"    '<select id="f-sess">'
contains "widened html sorts"          '<th data-k="code">'
contains "widened marks outsiders"     "(outside this chain)"
lacks    "widened html keeps others closed" "<details open>"

# 5. a result inside one session prints neither session nor project
run "AT"
lacks "single session hides ID"      "sess-new"
lacks "single session hides project" "$SLUG"

# 6. an exact code returns exactly one row under its section header
run "F1"
check "exact code row count" "$(rows | wc -l)" "1"
contains "exact code section" "## Findings"
contains "exact code content" "the current finding"
lacks    "titles only by default" "the current finding - s"

# 7. stock codes sort ahead of bespoke ones, each under its section
rec sess-new.jsonl sess-new Z 9 0 "bespoke, current"
run
check "stock sorts first" "$(rows | head -1 | cut -d' ' -f1)" "AT1"
check "bespoke sorts last" "$(rows | tail -1 | cut -d' ' -f1)" "Z9"
check "bespoke section is the record's" "$(printf '%s\n' "$OUT" | tail -2 | head -1)" "## S"

# 7b. --full appends the summary
run --full F1
contains "full shows summary" "the current finding - s"

# 7c. a code redefined in a second file of the same session prints once, latest wins
LED2="$SANDBOX/.claude/katharsis-data/ledger/moved-here"; mkdir -p "$LED2"
LED_SAVE="$LED"; LED="$LED2"
rec sess-new.jsonl sess-new D 1 1 "the later decision"
LED="$LED_SAVE"
python3 - "$LED/sess-new.jsonl" <<'PY'
import json,sys
r={"ts":"a","session_id":"sess-new","project":"x","code":"D1","prefix":"D","n":1,"known":True,"title":"the earlier decision","summary":"s","section":"Decisions","section_note":""}
open(sys.argv[1],"a").write(json.dumps(r)+"\n")
PY
run D1
check "dedupe across files" "$(rows | wc -l)" "1"
contains "latest definition wins" "the later decision"

# 7d. --html writes a page and prints its path, without opening a browser
run --html
check "html rc" "$RC" "0"
HTML="$(printf '%s\n' "$OUT" | tail -1)"
[ -f "$HTML" ] && PASS=$((PASS+1)) || { echo "FAIL html file missing: $HTML"; FAIL=$((FAIL+1)); }
OUT="$(cat "$HTML" 2>/dev/null)"
contains "html has section" "<h2>Findings</h2>"
contains "html has title" "the current finding"
contains "html has summary" "summary"

# 8. a query that matches nothing anywhere: a message, exit 0
run "R"
check "no match rc" "$RC" "0"
contains "no match message" "nothing matches"

# 9. a malformed query is rejected rather than globbed
run "zz!"
check "bad query rc" "$RC" "1"
contains "bad query message" "not a code"

# 10. a torn line is skipped rather than crashing the read
echo 'not json' >> "$LED/sess-new.jsonl"
run "AT"
check "torn line rc" "$RC" "0"
contains "torn line skipped" "the current action"

# 11. a handoff chain is one numbering space: the child session sees the parent's
# items grouped by session oldest first, the child marked current, and --next
# counts across both; --chrono flattens the same rows in time order
mkdir -p "$SANDBOX/.claude/katharsis-data/ledger/chains"
echo "sess-new" > "$SANDBOX/.claude/katharsis-data/ledger/chains/sess-child"
SESSION="sess-child"
rec sess-child.jsonl sess-child F 7 1 "a child finding"
run F
contains "chain sees parent items" "the current finding"
contains "chain sees own items" "a child finding"
contains "chain groups by session" "## 1  sess-new  "
contains "chain marks the current" "## 2  sess-chi (current)  "
lacks    "chain never says outside" "outside this chain"
run --chrono F
contains "chrono tags the session" "F7  [2]  a child finding"
check "chrono is flat" "$(printf '%s\n' "$OUT" | grep -c '^##')" "0"
run --html F
OUT="$(cat "$(printf '%s\n' "$OUT" | tail -1)")"
lacks    "chain html closes parent"  "<details open><summary>1 · sess-new"
contains "chain html opens current"  "<details open><summary>2 · sess-chi (current)"
contains "chain html chrono row"     '<td class="sess">2 · sess-chi</td>'
run --next
contains "next counts across chain" "F8"
contains "next counts parent-only prefix" "AT2"
SESSION="sess-new"

# 12. KATHARSIS_DATA wins over $HOME, and the bin/ wrappers reach the script
ALT="$(mktemp -d)"
mkdir -p "$ALT/ledger/p"
rec_alt() { python3 -c 'import json; print(json.dumps({"ts":"t","session_id":"sess-alt","project":"p","code":"F1","prefix":"F","n":1,"known":True,"title":"from the data dir","summary":"s","section":"S","section_note":""}))' >> "$ALT/ledger/p/sess-alt.jsonl"; }
rec_alt
OUT="$(HOME="$SANDBOX" KATHARSIS_DATA="$ALT" CLAUDE_CODE_SESSION_ID=sess-alt "$KREF" 2>&1)"
contains "KATHARSIS_DATA redirects the read" "from the data dir"
OUT="$(HOME="$SANDBOX" KATHARSIS_DATA="$ALT" CLAUDE_CODE_SESSION_ID=sess-alt "$DIR/../bin/kref" F1 2>&1)"
contains "bin/kref wraps the script" "from the data dir"
OUT="$(HOME="$SANDBOX" KATHARSIS_DATA="$ALT" CLAUDE_CODE_SESSION_ID=sess-alt KREF_NO_OPEN=1 "$DIR/../bin/kref-h" F1 2>&1)"
case "$OUT" in "$ALT/kref-out/"*.html) PASS=$((PASS+1));; *) echo "FAIL bin/kref-h: [$OUT]"; FAIL=$((FAIL+1));; esac
rm -rf "$ALT"

echo
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
