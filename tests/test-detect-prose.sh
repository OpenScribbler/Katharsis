#!/usr/bin/env bash
# Black-box suite for scripts/detect-prose.sh. Every case builds a synthetic
# corpus where each expected hit was planted deliberately, runs the detector
# against it, and asserts the full eleven-line detector block, so an unexpected
# hit in any other detector fails the case too. Positive and negative plants run
# in separate corpora, because an aggregate count can hide an inverted
# condition. Failure paths are cases too, because the fail-loudly requirement
# is behavior a refactor can drop.

set -eu
DETECT="$(cd "$(dirname "$0")/.." && pwd)/scripts/detect-prose.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

FAILS=0
CASE=""

fail() { echo "  FAIL [$CASE] $*"; FAILS=$((FAILS + 1)); }

# new_corpus NAME: fresh corpus root; SESSION points at its first transcript.
new_corpus() {
  CORPUS="$TMP/$1"
  mkdir -p "$CORPUS/projects/p"
  SESSION="$CORPUS/projects/p/s1.jsonl"
  : > "$SESSION"
}

# plant TYPE: append one JSONL message of TYPE with stdin as its text block.
plant() {
  python3 -c 'import json,sys; print(json.dumps({"type": sys.argv[1], "message": {"content": [{"type": "text", "text": sys.stdin.read()}]}}))' "$1" >> "$SESSION"
}

run() { RC=0; OUT=$("$DETECT" --root "$CORPUS" 2>&1) || RC=$?; }

assert_out() { echo "$OUT" | grep -Eq "$1" || fail "expected /$1/ in output; got: $OUT"; }
assert_rc() { [ "$RC" -eq "$1" ] || fail "expected exit $1, got $RC; output: $OUT"; }

# expected [key=N ...]: the full detector block with zeros everywhere except the
# named keys. Keys: r1 r2 r2f r3 r4 r5 r6 r7e r7c r8 r9 r10 r11 r11f.
expected() {
  local r1=0 r2=0 r2f=0 r3=0 r4=0 r5=0 r6=0 r7e=0 r7c=0 r8=0 r9=0 r10=0 r11=0 r11f=0 kv
  for kv in "$@"; do eval "${kv%%=*}=${kv#*=}"; done
  printf 'r1-unasked-status    hits=%s\n' "$r1"
  printf 'r2-comprehension     hits=%s forms=%s\n' "$r2" "$r2f"
  printf 'r3-hedge-stack       hits=%s\n' "$r3"
  printf 'r4-opening-narration hits=%s\n' "$r4"
  printf 'r5-uncoded-list      hits=%s\n' "$r5"
  printf 'r6-buried-question   hits=%s\n' "$r6"
  printf 'r7-dash              hits=%s emdash=%s colon=%s\n' "$((r7e + r7c))" "$r7e" "$r7c"
  printf 'r8-evidence-section  hits=%s\n' "$r8"
  printf 'r9-vague-quantifier  hits=%s\n' "$r9"
  printf 'r10-negation-first   hits=%s\n' "$r10"
  printf 'r11-synonym-drift    hits=%s forms=%s\n' "$r11" "$r11f"
}

# assert_block [key=N ...]: the detector block in OUT equals expected exactly.
assert_block() {
  local got want
  got=$(printf '%s\n' "$OUT" | grep -E '^r[0-9]+-' || true)
  want=$(expected "$@")
  [ "$got" = "$want" ] || fail "$(printf 'block mismatch\nwant:\n%s\ngot:\n%s' "$want" "$got")"
}

# --- corpus accounting --------------------------------------------------------
# A garbage line is tolerated but still counted as a jsonl line, and an
# assistant message whose content is a plain string is one text block.
CASE="corpus-accounting"
new_corpus "$CASE"
plant user <<'EOF'
Please look at the parser.
EOF
echo 'this line is not json' >> "$SESSION"
python3 -c 'import json; print(json.dumps({"type": "assistant", "message": {"content": "Done."}}))' >> "$SESSION"
run
assert_rc 0
assert_out '^corpus: files=1 jsonl_lines=3 assistant_messages=1 text_blocks=1$'
assert_block

# --- r1: unasked status -------------------------------------------------------
# The user never mentioned tests, so the gate report is a hit. The report also
# legitimately counts once under r11.
CASE="r1-unasked-status"
new_corpus "$CASE"
plant user <<'EOF'
Please refactor the parser.
EOF
plant assistant <<'EOF'
All tests pass.
EOF
run
assert_rc 0
assert_block r1=1 r11=1 r11f=1

# The user asked for the tests, so the same report is suppressed.
CASE="r1-suppressed"
new_corpus "$CASE"
plant user <<'EOF'
Run the tests.
EOF
plant assistant <<'EOF'
All tests pass.
EOF
run
assert_rc 0
assert_block r11=1 r11f=1

# --- r2: comprehension, hits and distinct forms -------------------------------
# Four phrase families: 5 hits, 4 forms, because one phrase repeats.
CASE="r2-comprehension"
new_corpus "$CASE"
plant assistant <<'EOF'
Good catch. Good catch. You're absolutely right.
EOF
plant assistant <<'EOF'
That clarifies the failure. Now I can see the whole path.
EOF
run
assert_rc 0
assert_block r2=5 r2f=4

# --- r3: hedge stack ----------------------------------------------------------
# Three stack shapes: verb+adverb, seems-like, and might+adverb.
CASE="r3-hedge-stack"
new_corpus "$CASE"
plant assistant <<'EOF'
This could potentially fail. It seems like it could break. This might conceivably regress.
EOF
run
assert_rc 0
assert_block r3=3

# --- r4: opening narration ----------------------------------------------------
# Two opener families, one message each.
CASE="r4-opening-narration"
new_corpus "$CASE"
plant assistant <<'EOF'
Let me check the config file for that setting.
EOF
plant assistant <<'EOF'
I'll start by reading the loader.
EOF
run
assert_rc 0
assert_block r4=2

# Opens with a result and mentions an action later: no hit.
CASE="r4-negative"
new_corpus "$CASE"
plant assistant <<'EOF'
The config sets it to false.
Let me know if you want it changed.
EOF
run
assert_rc 0
assert_block

# --- r5: uncoded list ---------------------------------------------------------
CASE="r5-uncoded-list"
new_corpus "$CASE"
plant assistant <<'EOF'
The problems are
- the loader skips imports
- the cache never expires
- the flag is ignored
EOF
run
assert_rc 0
assert_block r5=1

# The same bullets beside a reference-coded line: no hit.
CASE="r5-coded"
new_corpus "$CASE"
plant assistant <<'EOF'
F1 - the loader skips imports
- one
- two
- three
EOF
run
assert_rc 0
assert_block

# Bullets inside a code fence are code, not a list.
CASE="r5-fenced"
new_corpus "$CASE"
plant assistant <<'EOF'
Run this
```
- one
- two
- three
```
EOF
run
assert_rc 0
assert_block

# --- r6: buried question ------------------------------------------------------
CASE="r6-buried-question"
new_corpus "$CASE"
plant assistant <<'EOF'
Does this run in prod?
It should, based on the config.
EOF
run
assert_rc 0
assert_block r6=1

# The question is the last line: no hit. An inverted condition fails here.
CASE="r6-last-line"
new_corpus "$CASE"
plant assistant <<'EOF'
The config looks right.
Does this run in prod?
EOF
run
assert_rc 0
assert_block

# --- r7: em dashes and connector colons ---------------------------------------
# Two prose em dashes and one connector colon count. Colons on a heading, a
# URL line, and a bullet are skipped, and everything in the fence never counts
# anywhere, including its question mark.
CASE="r7-dash"
new_corpus "$CASE"
plant assistant <<'EOF'
The fix works: the cache clears — twice — per run.
## Deploy notes: read this
See https://example.com: the docs
- item one: with colon
```
x — y: z?
```
EOF
run
assert_rc 0
assert_block r7e=2 r7c=1

# --- r8: evidence section -----------------------------------------------------
# Both heading words, at different heading depths.
CASE="r8-evidence-section"
new_corpus "$CASE"
plant assistant <<'EOF'
The claim holds.

## Evidence
The log shows the import survives.
EOF
plant assistant <<'EOF'
### Verification
All good.
EOF
run
assert_rc 0
assert_block r8=2

# --- r9: vague quantifiers and propped-up verbs -------------------------------
# Three quantifier shapes and two adverb+verb shapes: 5 hits.
CASE="r9-vague-quantifier"
new_corpus "$CASE"
plant assistant <<'EOF'
I changed several files and this significantly improves startup.
EOF
plant assistant <<'EOF'
Numerous changes and a few tweaks remain. This dramatically reduces load.
EOF
run
assert_rc 0
assert_block r9=5

# --- r10: negation first ------------------------------------------------------
# Three construction shapes: isn't/it's, aren't/they're, doesn't/it.
CASE="r10-negation-first"
new_corpus "$CASE"
plant assistant <<'EOF'
That isn't a bug, it's a feature of the loader. The tests aren't slow, they're skipped. It doesn't retry, it fails.
EOF
run
assert_rc 0
assert_block r10=3

# --- r11: synonym drift, hits and distinct forms ------------------------------
# One pass statement repeated plus three synonyms for it: 5 hits, 4 forms. The
# user turn names the tests, so none of this counts under r1.
CASE="r11-synonym-drift"
new_corpus "$CASE"
plant user <<'EOF'
Run the tests and the build.
EOF
plant assistant <<'EOF'
The tests pass. The tests pass. The build succeeded. Everything passes. Lint passed.
EOF
run
assert_rc 0
assert_block r11=5 r11f=4

# --- failure paths ------------------------------------------------------------
CASE="fail-missing-root"
CORPUS="$TMP/does-not-exist"
run
assert_rc 2
assert_out 'NOT FOUND'

CASE="fail-empty-projects"
new_corpus "$CASE"
rm "$SESSION"
run
assert_rc 2
assert_out 'NOT FOUND'

CASE="fail-no-assistant-text"
new_corpus "$CASE"
plant user <<'EOF'
Anyone home?
EOF
run
assert_rc 2
assert_out 'NOT FOUND'
assert_out 'zero assistant text blocks'

CASE="fail-unknown-arg"
RC=0; OUT=$("$DETECT" --bogus 2>&1) || RC=$?
assert_rc 2
assert_out 'unknown argument'

CASE="fail-days-not-a-number"
RC=0; OUT=$("$DETECT" --days abc 2>&1) || RC=$?
assert_rc 2
assert_out 'nonnegative integer'

CASE="fail-days-missing-value"
RC=0; OUT=$("$DETECT" --days 2>&1) || RC=$?
assert_rc 2
assert_out 'requires a value'

CASE="fail-root-missing-value"
RC=0; OUT=$("$DETECT" --root 2>&1) || RC=$?
assert_rc 2
assert_out 'requires a value'

# --- the --days window --------------------------------------------------------
# An old transcript falls outside a 7-day window and back inside a 90-day one.
CASE="days-window"
new_corpus "$CASE"
plant assistant <<'EOF'
Good catch.
EOF
touch -d '30 days ago' "$SESSION"
SESSION="$CORPUS/projects/p/s2.jsonl"
plant assistant <<'EOF'
Good catch. Good catch.
EOF
RC=0; OUT=$("$DETECT" --root "$CORPUS" --days 7 2>&1) || RC=$?
assert_rc 0
assert_out '^corpus: files=1 '
assert_block r2=2 r2f=1
RC=0; OUT=$("$DETECT" --root "$CORPUS" --days 90 2>&1) || RC=$?
assert_rc 0
assert_out '^corpus: files=2 '
assert_block r2=3 r2f=1

# A window that excludes every transcript is a loud failure, not a clean corpus.
CASE="days-empty-window"
new_corpus "$CASE"
plant assistant <<'EOF'
Good catch.
EOF
touch -d '30 days ago' "$SESSION"
RC=0; OUT=$("$DETECT" --root "$CORPUS" --days 7 2>&1) || RC=$?
assert_rc 2
assert_out 'NOT FOUND'

# --- summary ------------------------------------------------------------------
if [ "$FAILS" -gt 0 ]; then
  echo "test-detect-prose: $FAILS assertion(s) failed"
  exit 1
fi
echo "test-detect-prose: all assertions passed"
exit 0
