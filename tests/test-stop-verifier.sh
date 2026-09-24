#!/usr/bin/env bash
# Tests for stop-verifier.sh. Builds hook payloads carrying
# last_assistant_message, then asserts when the hook blocks (exit 2 + reason
# on stderr), what the reason carries, and every failsafe (exit 0, silent).

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$DIR/../scripts/stop-verifier.sh"
PASS=0; FAIL=0
KATHARSIS_DATA="$(mktemp -d)"; export KATHARSIS_DATA
trap 'rm -rf "$KATHARSIS_DATA"' EXIT
: > "$KATHARSIS_DATA/.active"  # Katharsis active for every case but the gate test

# run <reply_text> <stop_hook_active>: sets OUT (stderr) and RC
run() {
  OUT="$(python3 -c 'import json,sys; print(json.dumps({
    "hook_event_name": "Stop",
    "stop_hook_active": sys.argv[2] == "true",
    "last_assistant_message": sys.argv[1]}))' "$1" "$2" \
    | "$HOOK" 2>&1 >/dev/null)"
  RC=$?
}

# raw <payload>: same, for hand-built payloads
raw() {
  OUT="$(printf '%s' "$1" | "$HOOK" 2>&1 >/dev/null)"
  RC=$?
}

assert_block() { # assert_block <name> <must_contain>  (checks OUT/RC)
  local name="$1" want="$2"
  if [ "$RC" -eq 2 ] && grep -qF "$want" <<<"$OUT"; then
    PASS=$((PASS+1))
  else
    echo "FAIL $name: expected exit 2 + stderr containing '$want', got rc=$RC out: $OUT"
    FAIL=$((FAIL+1))
  fi
}

assert_pass() { # assert_pass <name>  (checks OUT/RC)
  local name="$1"
  if [ "$RC" -eq 0 ] && [ -z "$OUT" ]; then PASS=$((PASS+1)); else
    echo "FAIL $name: expected exit 0 and no stderr, got rc=$RC out: $OUT"
    FAIL=$((FAIL+1)); fi
}

DIRTY='The test fails — the fixture is stale.'
CLEAN='The fixture predates the schema, so the test fails.'
# Trips r4-opening-narration, whose repair is the finding appended on its own line.
BLOCKING="Let me check the fixture. The fixture predates the schema, so the test fails."
# Trips r2-comprehension, which left the blocking set once a block was confined to
# repairs that append: an opener already read cannot be un-read by adding lines.
SYCOPHANT="You're absolutely right. The fixture predates the schema, so the test fails."

# 1. a blocking-set hit exits 2, and stderr carries the rule and fix
run "$BLOCKING" false
assert_block "blocking rule blocks" "r4-opening-narration"
assert_block "reason asks for the finding appended alone" "the finding, stated on its own line"
assert_block "reason forbids a reprint" "Do NOT reprint the reply"

# 1a. the reply is never demanded again, whichever class fired
if ! grep -qiE 'rewrite that reply|write (the|that) reply again' <<<"$OUT"; then
  PASS=$((PASS+1)); else
  echo "FAIL reason demands no rewrite: got: $OUT"; FAIL=$((FAIL+1)); fi

# 1b. r2 captures without blocking, because nothing appended repairs it
run "$SYCOPHANT" false
assert_pass "announced comprehension does not block"

# 1c. a preference hit captures without blocking, so a colon or dash never
# costs a reply reprint
run "$DIRTY" false
assert_pass "preference rule does not block"

# 2. block path writes nothing to stdout (the reason travels on stderr only)
out_stdout="$(python3 -c 'import json,sys; print(json.dumps({
  "hook_event_name": "Stop", "stop_hook_active": False,
  "last_assistant_message": sys.argv[1]}))' "$BLOCKING" | "$HOOK" 2>/dev/null)"
if [ -z "$out_stdout" ]; then PASS=$((PASS+1)); else
  echo "FAIL block stdout empty: got: $out_stdout"; FAIL=$((FAIL+1)); fi

# 3. loop guard: same reply, stop_hook_active=true passes
run "$BLOCKING" true
assert_pass "stop_hook_active guard"

# 4. clean final reply passes
run "$CLEAN" false
assert_pass "clean reply passes"

# 5. dirty text inside a code fence is out of scope
run "$(printf 'The build passes.\n\n```\nrobust — paradigm\n```')" false
assert_pass "fenced code out of scope"

# 6. missing last_assistant_message passes
raw '{"hook_event_name": "Stop", "stop_hook_active": false}'
assert_pass "missing reply field passes"

# 7. whitespace-only reply passes
run "   " false
assert_pass "blank reply passes"

# 8. malformed hook payload passes
raw 'not json'
assert_pass "malformed payload passes"

# 9. non-string last_assistant_message passes
raw '{"stop_hook_active": false, "last_assistant_message": ["x"]}'
assert_pass "non-string reply passes"

# --- r15 captures without blocking ------------------------------------------------
# r15's old repair demanded an erratum plus a question, which taught asking and
# errata for filing slips (2026-09-23 reviews), so an ask on a settled code's line
# now passes and only reaches the corpus.
ASK_IN_NA='Done.

## Next Actions

NA1 - **Commit the change** - three files, on main. Say the word and I will branch and commit.'
run "$ASK_IN_NA" false
assert_pass "r15 captures without blocking"

# A preference-only reply still passes.
run 'The fixture is stale, so the test fails: the schema moved.' false
assert_pass "connector colon alone still passes"

# 10. gate: with no active marker the same blocking reply passes, because the
# session is not running Katharsis; a session's own marker re-enables it.
rm -f "$KATHARSIS_DATA/.active"
run "$BLOCKING" false
assert_pass "no active marker passes"
OUT="$(python3 -c 'import json,sys; print(json.dumps({"hook_event_name": "Stop",
  "stop_hook_active": False, "session_id": "s1", "last_assistant_message": sys.argv[1]}))' "$BLOCKING" \
  | "$HOOK" 2>&1 >/dev/null)"; RC=$?
assert_pass "another session's marker does not count"
: > "$KATHARSIS_DATA/.active-s1"
OUT="$(python3 -c 'import json,sys; print(json.dumps({"hook_event_name": "Stop",
  "stop_hook_active": False, "session_id": "s1", "last_assistant_message": sys.argv[1]}))' "$BLOCKING" \
  | "$HOOK" 2>&1 >/dev/null)"; RC=$?
assert_block "the session's own marker enables it" "r4-opening-narration"

echo
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
