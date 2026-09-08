#!/usr/bin/env bash
# Tests for detect-reply.sh. Each case feeds one fixture reply and asserts the
# rule that must fire, the rules that must not, and the exit code.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
DET="$DIR/../scripts/detect-reply.sh"
PASS=0; FAIL=0

check() { # check <name> <expected_exit> <must_contain|-> <must_not_contain|-> <<< fixture
  local name="$1" want_exit="$2" want="$3" not_want="$4"
  local out rc
  out="$(cat | "$DET")"; rc=$?
  local ok=1
  [ "$rc" -eq "$want_exit" ] || { echo "FAIL $name: exit=$rc want=$want_exit"; ok=0; }
  if [ "$want" != "-" ] && ! grep -qF "$want" <<<"$out"; then
    echo "FAIL $name: output lacks '$want'"; echo "$out" | sed 's/^/    /'; ok=0
  fi
  if [ "$not_want" != "-" ] && grep -qF "$not_want" <<<"$out"; then
    echo "FAIL $name: output unexpectedly contains '$not_want'"; echo "$out" | sed 's/^/    /'; ok=0
  fi
  if [ "$ok" -eq 1 ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi
}

# --- clean, rule-compliant reply: codes, evidence beside claims, question last ---
check "clean reply" 0 "hits=0" "r" <<'EOF'
The build strips the import because tsup treats it as a side effect.

## Findings

F1 - the bundle drops side-effect imports, measured by the 3 missing modules in dist/index.js.

## Questions

❓ **Q1** - **Keep the import?**
   a. mark the file sideEffects: false
   b. move the import into main()

➡️ a, because the flag change is one line and reversible.
EOF

# --- r2 -------------------------------------------------------------------------
check "r2 comprehension" 1 "r2-comprehension" - <<'EOF'
You're absolutely right, the cache key was stale.
EOF

check "r2 good catch" 1 "r2-comprehension" - <<'EOF'
Good catch. The loop starts at 1.
EOF

check "r2 allow: restated request escapes" 0 "hits=0" "r2" <<'EOF'
You asked me to say when you are right, and you're right about the cache key.
EOF

check "r2 allow: escape only covers its own sentence" 1 "r2-comprehension" - <<'EOF'
You asked me to review the parser. You're absolutely right about the cache key.
EOF

# --- r3 -------------------------------------------------------------------------
check "r3 hedge stack" 1 "r3-hedge-stack" - <<'EOF'
The retry could potentially mask the timeout.
EOF

# --- r4 -------------------------------------------------------------------------
check "r4 opening narration" 1 "r4-opening-narration" - <<'EOF'
Let me check the config file first.

The port is 8080.
EOF

check "r4 only first line counts" 0 "hits=0" "r4" <<'EOF'
The port is 8080.

Next I'll wire the handler.
EOF

# --- r5 -------------------------------------------------------------------------
check "r5 uncoded list" 1 "r5-uncoded-list" - <<'EOF'
Three problems came up.

- the cache key is stale
- the lock file drifted
- the retry masks a timeout
EOF

check "r5 coded list is clean" 0 "hits=0" "r5" <<'EOF'
## Findings

F1 - the cache key is stale, shown by the 404 on the second request.
F2 - the lock file drifted, 12 packages differ.
F3 - the retry masks a timeout, so the p99 reads as 30s.
EOF

# --- r6 -------------------------------------------------------------------------
check "r6 buried question" 1 "r6-buried-question" - <<'EOF'
Should the hook block or log?

Blocking forces a rewrite in the same turn.
EOF

check "r6 arrow last line is clean" 0 "hits=0" "r6" <<'EOF'
❓ **Q1** - **Block or log?**

➡️ block, because logging duplicates the audit.
EOF

# --- r7 -------------------------------------------------------------------------
check "r7 em dash" 1 "r7-dash" - <<'EOF'
The test fails — the fixture is stale.
EOF

check "r7 connector colon" 1 "r7-colon" - <<'EOF'
The reason is simple: the fixture predates the schema.
EOF

check "r7 colon in list is clean" 0 "hits=0" "r7" <<'EOF'
- reason: the fixture predates the schema
EOF

check "r7 colon in lettered option is clean" 0 "hits=0" "r7" <<'EOF'
   a. mark the file sideEffects: false
EOF

check "r7 dash in code is clean" 0 "hits=0" "r7" <<'EOF'
Run `foo — bar` to reproduce.

```
x — y
```
EOF

check "r7 allow: dash inside double quotes" 0 "hits=0" "r7" <<'EOF'
The original line reads "the test fails — badly", so the fixture keeps it.
EOF

check "r7 allow: quotes elsewhere do not rescue a bare dash" 1 "r7-dash" - <<'EOF'
The "fixture" is stale — rerun it.
EOF

check "r7 allow: colon inside double quotes" 0 "hits=0" "r7" <<'EOF'
The error says "invalid key: expected string", so the schema wins.
EOF

# r7-colon false-positive edges: legitimate colon uses that must stay clean
check "r7 colon in URL is clean" 0 "hits=0" "r7-colon" <<'EOF'
The docs live at https://example.com/guide and load fine.
EOF

check "r7 timestamp is clean" 0 "hits=0" "r7-colon" <<'EOF'
The build finished at 10:30 and took 4 minutes.
EOF

check "r7 ratio is clean" 0 "hits=0" "r7-colon" <<'EOF'
Cache hits outnumber misses 3:1 in the trace.
EOF

check "r7 heading colon is clean" 0 "hits=0" "r7-colon" <<'EOF'
## Findings: summary
EOF

check "r7 connector colon beside a URL is caught" 1 "r7-colon" - <<'EOF'
The fix is simple: see https://example.com/guide for the steps.
EOF

# --- r8 -------------------------------------------------------------------------
check "r8 evidence heading" 1 "r8-evidence-section" - <<'EOF'
The cache key is stale.

## Evidence

The second request returned 404.
EOF

# --- r9 -------------------------------------------------------------------------
check "r9 vague quantifier" 1 "r9-vague-quantifier" - <<'EOF'
Several worktrees hold stale branches.
EOF

check "r9 propped verb" 1 "r9-vague-quantifier" - <<'EOF'
The change significantly improves cold-start time.
EOF

# --- r10 ------------------------------------------------------------------------
check "r10 negation first" 1 "r10-negation-first" - <<'EOF'
The bug isn't in the parser, it's in the tokenizer.
EOF

check "r10 allow: quoted mention of the banned form" 0 "hits=0" "r10" <<'EOF'
Rule 10 bans the frame "X isn't Y, it's Z" in every sentence.
EOF

# --- r12 ------------------------------------------------------------------------
check "r12 slop term" 1 "r12-slop-term" - <<'EOF'
The hook serves as the bedrock of the pipeline.
EOF

check "r12 clean tech terms stay clean" 0 "hits=0" "r12" <<'EOF'
The attack vector uses the test harness primitive.
EOF

# --- r13 ------------------------------------------------------------------------
check "r13 fancy word" 1 'Write "use" instead' - <<'EOF'
The script utilizes the cache in order to skip the fetch.
EOF

check "r13 inflection caught" 1 "r13-plain-word" - <<'EOF'
Leveraging the existing index avoids the scan.
EOF

# --- r14 ------------------------------------------------------------------------
check "r14 two variants co-occur" 1 "r14-consistency" - <<'EOF'
The repo builds clean. Clone the repository before the repo check runs.
EOF

check "r14 one variant is clean" 0 "hits=0" "r14" <<'EOF'
The repository builds clean, and the repository check passes.
EOF

check "r14 substring does not count" 0 "hits=0" "r14" <<'EOF'
The configuration file sets the port, and the configuration check passes.
EOF

# --- r15: a decision handed over from inside a non-Questions coded line -----------
check "r15 ask phrase on an NA line" 1 "r15-question-outside-round" "-" <<'EOF'
Done.

## Next Actions

NA1 - **Commit the change** - three tracked files, on main. Say the word and I will branch and commit.
EOF

check "r15 question mark on a D line" 1 "r15-question-outside-round" "-" <<'EOF'
Done.

## Decisions

D1 - **Left the base branch on main** - should I have used the release branch instead
EOF

# The Q line is the compliant placement, so the rule that catches a misplaced ask
# must never fire on the round it is steering the ask into.
check "r15 spares the Questions round" 0 "hits=0" "r15" <<'EOF'
The hook now blocks once.

## Questions

❓ **Q1** - **Do you want the second pass?**
   a. run it now
   b. wait for the review

➡️ a, because the review reads the second pass output.
EOF

# Quoting one of Holden's own questions back to him inside a finding is reporting,
# not asking, and every such line would fire if the quote guard regressed.
check "r15 spares a quoted question" 0 "hits=0" "r15" <<'EOF'
The pair is recorded.

## Findings

F1 - **The worst pair in the corpus** - "How is the background job going?" drew 900 words.
EOF

# The mined phrases: a held action under a settled code, and the report-back that
# must not fire because a result coming home is not a decision going over.
check "r15 held action on your word" 1 "r15-question-outside-round" "-" <<'EOF'
Done.

## Next Actions

NA1 - **Push and PR, on your word** - the branch is 7 commits ahead and has no PR yet.
EOF

check "r15 spares a report-back" 0 "hits=0" "r15" <<'EOF'
Done.

## Your Move

MV1 - **Run the two rows** - type the command in a fresh session, then tell me the result.
EOF

check "r15 spares a third-party decider" 0 "hits=0" "r15" <<'EOF'
Done.

## Trade-offs

T-O1 - **The exception costs the rule its mechanical quality** - a classifier must decide whether a part carries content.
EOF

# --- pack plumbing ----------------------------------------------------------------
# A missing packs dir disables the pack-fed rules and nothing crashes.
sandbox="$(mktemp -d)"
cp "$DET" "$sandbox/"
out="$(printf "You're absolutely right, it utilizes the repo and repository.\n" | "$sandbox/detect-reply.sh")"; rc=$?
if [ "$rc" -eq 0 ] && grep -qF "hits=0" <<<"$out"; then PASS=$((PASS+1)); else
  echo "FAIL missing packs disable rules: exit=$rc out=$out"; FAIL=$((FAIL+1)); fi
rm -rf "$sandbox"

# --- input plumbing ---------------------------------------------------------------
tmp="$(mktemp)"; printf 'The test fails — badly.\n' > "$tmp"
out="$("$DET" "$tmp")"; rc=$?
if [ "$rc" -eq 1 ] && grep -qF "r7-dash" <<<"$out"; then PASS=$((PASS+1)); else
  echo "FAIL file argument: exit=$rc out=$out"; FAIL=$((FAIL+1)); fi
rm -f "$tmp"

if "$DET" a b >/dev/null 2>&1; then echo "FAIL usage: two args accepted"; FAIL=$((FAIL+1)); else PASS=$((PASS+1)); fi

echo
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
