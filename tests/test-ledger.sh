#!/usr/bin/env bash
# Tests for ledger-stop.sh. The data path hangs off $HOME, so every case runs
# with HOME pointed at a sandbox and the real ledger stays untouched. Asserts
# the active-session gate, the record shape, the definitions-only anchoring,
# the per-session file layout, and the failsafes (exit 0, no output).

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
LEDGER_HOOK="$DIR/../scripts/ledger-stop.sh"
PASS=0; FAIL=0
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT
DATA="$SANDBOX/.claude/katharsis-data"
LEDGER="$DATA/ledger"
mkdir -p "$DATA"

run() { OUT="$(printf '%s' "$1" | HOME="$SANDBOX" "$LEDGER_HOOK" 2>&1)"; RC=$?; }

payload() { # $1 = reply text, $2 = session id, $3 = cwd
  python3 -c 'import json,sys; print(json.dumps({"hook_event_name":"Stop","last_assistant_message":sys.argv[1],"session_id":sys.argv[2],"cwd":sys.argv[3]}))' "$1" "$2" "$3"
}

field() { # $1 = jsonl file, $2 = line index, $3 = field
  python3 -c 'import json,sys; print(json.loads(open(sys.argv[1]).readlines()[int(sys.argv[2])])[sys.argv[3]])' "$1" "$2" "$3"
}

check() { # $1 = name, $2 = got, $3 = want
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else
    echo "FAIL $1: got [$2] want [$3]"; FAIL=$((FAIL+1)); fi
}

assert_silent() { # a ledger hook must never block work or steer the model
  local name="$1"
  if [ "$RC" -eq 0 ] && [ -z "$OUT" ]; then PASS=$((PASS+1)); else
    echo "FAIL $name: rc=$RC out=$OUT"; FAIL=$((FAIL+1)); fi
}

REPLY='Some opening prose.

## Findings

A finding names the cause the user cannot act without.

F1 - **the parser drops CRLF** - the fixture uses LF, so the bug never fired in tests
More on F1 below, and do NA1 first.

## Next Actions

NA1 - **rerun the suite on the CRLF fixture** - it is the only unproven path

## Waves

Z2 - **second cut** - the bespoke code still gets captured

## Questions

❓ **Q1** - **which fixture ships?** - the CRLF one costs a regeneration
   a. keep LF
'

# 0. no active marker for the session: Katharsis is not the style here, so
# the hook writes nothing
run "$(payload "$REPLY" "sess-a" "/home/x/repo-one")"
assert_silent "inactive session silent"
if [ ! -e "$LEDGER" ]; then PASS=$((PASS+1)); else
  echo "FAIL inactive session wrote a ledger"; FAIL=$((FAIL+1)); fi
for s in a b c d e f m; do : > "$DATA/.active-sess-$s"; done  # turn-reminder.sh writes these

# 1. a full reply: silent exit 0, one record per definition line
run "$(payload "$REPLY" "sess-a" "/home/x/repo-one")"
assert_silent "full reply silent"
FILE="$LEDGER/home-x-repo-one/sess-a.jsonl"
if [ -f "$FILE" ]; then PASS=$((PASS+1)); else
  echo "FAIL ledger file missing at $FILE"; FAIL=$((FAIL+1)); ls -R "$LEDGER" 2>&1; fi
check "record count (definitions only, references skipped)" "$(wc -l < "$FILE")" "4"

# 2. record shape on the first finding
check "code"         "$(field "$FILE" 0 code)"         "F1"
check "prefix"       "$(field "$FILE" 0 prefix)"       "F"
check "n"            "$(field "$FILE" 0 n)"            "1"
check "known"        "$(field "$FILE" 0 known)"        "True"
check "title"        "$(field "$FILE" 0 title)"        "the parser drops CRLF"
check "summary"      "$(field "$FILE" 0 summary)"      "the fixture uses LF, so the bug never fired in tests"
check "section"      "$(field "$FILE" 0 section)"      "Findings"
check "section_note" "$(field "$FILE" 0 section_note)" "A finding names the cause the user cannot act without."
check "session_id"   "$(field "$FILE" 0 session_id)"   "sess-a"
check "project"      "$(field "$FILE" 0 project)"      "home-x-repo-one"

# 3. a bespoke code is captured with known=false, and the Q line has its own branch
check "bespoke code"    "$(field "$FILE" 2 code)"  "Z2"
check "bespoke known"   "$(field "$FILE" 2 known)" "False"
check "question code"   "$(field "$FILE" 3 code)"  "Q1"
check "question title"  "$(field "$FILE" 3 title)" "which fixture ships?"
check "question known"  "$(field "$FILE" 3 known)" "True"

# 3b. the lenient forms the pattern documents: bold around code and title,
# and a bold title with the summary run on after it
run "$(payload $'## Actions Taken\n**AT2 — Fixed x** — because\nF8 — **claim** trailing prose\nD3 — **choice**' "sess-e" "/home/x/repo-one")"
assert_silent "lenient forms silent"
LFILE="$LEDGER/home-x-repo-one/sess-e.jsonl"
check "bold-code title"     "$(field "$LFILE" 0 title)"   "Fixed x"
check "bold-code summary"   "$(field "$LFILE" 0 summary)" "because"
check "run-on title"        "$(field "$LFILE" 1 title)"   "claim"
check "run-on summary"      "$(field "$LFILE" 1 summary)" "trailing prose"
check "bold title alone"    "$(field "$LFILE" 2 title)"   "choice"
check "bold title alone summary" "$(field "$LFILE" 2 summary)" ""

# 4. a second session in the same project gets its own file
run "$(payload 'F9 - **later** - a second session' "sess-b" "/home/x/repo-one")"
assert_silent "second session silent"
check "sess-a untouched" "$(wc -l < "$FILE")" "4"
check "sess-b own file"  "$(wc -l < "$LEDGER/home-x-repo-one/sess-b.jsonl")" "1"

# 4b. redefining a code in the same session supersedes the earlier record
run "$(payload 'F9 - **later, corrected** - the rewrite of a blocked reply' "sess-b" "/home/x/repo-one")"
assert_silent "redefinition silent"
check "supersede keeps one record" "$(wc -l < "$LEDGER/home-x-repo-one/sess-b.jsonl")" "1"
check "supersede keeps the newest" "$(field "$LEDGER/home-x-repo-one/sess-b.jsonl" 0 title)" "later, corrected"
run "$(payload 'AT4 - **a different code** - appends rather than replaces' "sess-b" "/home/x/repo-one")"
check "different code appends" "$(wc -l < "$LEDGER/home-x-repo-one/sess-b.jsonl")" "2"

# 4b. the project comes from the transcript's parent dir, so a cd inside the
# session does not split it across ledger directories (F25)
run "$(python3 -c 'import json; print(json.dumps({"hook_event_name":"Stop","last_assistant_message":"F1 - **moved** - cwd changed","session_id":"sess-m","cwd":"/home/x/repo-one/sub/dir","transcript_path":"/home/x/.claude/projects/-home-x-repo-one/sess-m.jsonl"}))')"
if [ -e "$LEDGER/home-x-repo-one/sess-m.jsonl" ]; then PASS=$((PASS+1)); else
  echo "FAIL moved cwd: no file under home-x-repo-one"; FAIL=$((FAIL+1)); fi
if [ ! -e "$LEDGER/home-x-repo-one-sub-dir/sess-m.jsonl" ]; then PASS=$((PASS+1)); else
  echo "FAIL moved cwd wrote under the cwd slug"; FAIL=$((FAIL+1)); fi
check "moved cwd project field" "$(field "$LEDGER/home-x-repo-one/sess-m.jsonl" 0 project)" "home-x-repo-one"

# 5. the summary field is truncated on write, since it is free text
LONG="$(python3 -c 'print("F1 - **long** - " + "x"*900)')"
run "$(payload "$LONG" "sess-c" "/home/x/repo-two")"
check "summary truncated" "$(python3 -c 'import json,sys; print(len(json.loads(open(sys.argv[1]).readline())["summary"]))' "$LEDGER/home-x-repo-two/sess-c.jsonl")" "500"

# 6. failsafes: malformed payload, no coded items, no reply, unwritable ledger
run 'not json'
assert_silent "malformed payload silent"
run "$(payload 'Plain prose with no coded items.' "sess-d" "/home/x/repo-two")"
assert_silent "uncoded reply silent"
if [ ! -e "$LEDGER/home-x-repo-two/sess-d.jsonl" ]; then PASS=$((PASS+1)); else
  echo "FAIL uncoded reply wrote a file"; FAIL=$((FAIL+1)); fi
run '{"hook_event_name":"Stop","session_id":"sess-e","cwd":"/home/x/repo-two"}'
assert_silent "missing reply silent"
mkdir -p "$LEDGER/home-x-repo-three/sess-f.jsonl"
run "$(payload 'F1 - **a** - b' "sess-f" "/home/x/repo-three")"
assert_silent "unwritable ledger silent"

echo
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
