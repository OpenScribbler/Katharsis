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

check "r7 dash in a tilde fence is clean" 0 "hits=0" "r7" <<'EOF'
The build passes.

~~~
x — y
~~~
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

check "r15 question mark on an AT line" 1 "r15-question-outside-round" "-" <<'EOF'
Done.

AT1 - **Opened the PR against main** - should I have used the release branch instead
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

# Quoting one of the user's own questions back to them inside a finding is reporting,
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

# --- r15: the same ask buried in an uncoded prose sentence ------------------------
check "r15 prose whenever-you-want ask" 1 "r15-question-in-prose" "-" <<'EOF'
The script change is still only in your local commit. Opening the PR is next whenever you want it.
EOF

check "r15 prose question mark" 1 "r15-question-in-prose" "-" <<'EOF'
Both reviews are in. Should the second pass run before the merge?
EOF

check "r15 prose spares the Questions round" 0 "hits=0" "r15" <<'EOF'
The hook now blocks once.

## Questions

❓ **Q1** - **Do you want the second pass?** - the review reads its output.

   a. run it now

➡️ a, because the review reads the second pass output.
EOF

# A bold lead-in ending in "?" is a label the rest of the line answers, and "I'll say
# so" is the agent's own commitment; neither hands the user a decision.
check "r15 prose spares an answered label" 0 "hits=0" "r15" <<'EOF'
- **Is passive voice the hardest case?** It sits near the top for rules that parse sentences.
EOF

check "r15 prose spares first-person say so" 0 "hits=0" "r15" <<'EOF'
If no gate reaches the target under the stricter label, I'll say so rather than loosen the rule.
EOF

check "r15 prose spares a URL query" 0 "hits=0" "r15" <<'EOF'
The search page loads from https://example.com/search?q=hooks and returns 12 results.
EOF

# Questions a reply carries as content hand the user nothing: each shape below was a
# false positive in the 2026-10-06 labeling.
check "r15 prose spares a table row" 0 "hits=0" "r15" <<'EOF'
| headings | Is "{heading}" a specific, accurate title for this text? | 0.15 |
EOF

check "r15 prose spares list-item criteria" 1 "r5-uncoded-list" "r15" <<'EOF'
- Does the rewrite say the same thing as the original?
- For headings, is the word the fix lowercased the name of a product?
1. Which Workload Events does Agent Proxy record for MCP traffic? The answer may change the table.
EOF

check "r15 prose spares a question after a colon" 1 "r7-colon" "r15" <<'EOF'
The test runs on the 187 labeled sentences: does the top-ranked rewrite name the labeled actor? It needs no training.
EOF

check "r15 prose spares now say so" 0 "hits=0" "r15" <<'EOF'
Qwen3 stays the local reviewer, and the docs now say so.
EOF

check "r15 prose spares an answered label outside a list" 0 "hits=0" "r15" <<'EOF'
**Is passive voice the hardest case?** It sits near the top for rules that parse sentences.
EOF

# A real ask in the same places still counts.
check "r15 prose reads a later ask after a content question" 1 "r15-question-in-prose" "-" <<'EOF'
The test is one question: does it parse? Merge it now?
EOF

check "r15 prose reads a list item that asks the reader" 1 "r15-question-in-prose" "-" <<'EOF'
1. Can we cut it today?
EOF

check "r15 prose reads a list item with no question word" 1 "r15-question-in-prose" "-" <<'EOF'
- Merge now or wait for CI?
EOF

check "r15 prose reads an ask phrase in a list item" 1 "r15-question-in-prose" "-" <<'EOF'
3. Merge #82, #83 and the Dependabot PRs whenever you like.
EOF

check "r15 prose reads an ask phrase in a table row" 1 "r15-question-in-prose" "-" <<'EOF'
| Next step | Let me know when to merge. |
EOF

check "r15 prose reads a decision after a colon" 1 "r15-question-in-prose" "-" <<'EOF'
One decision remains: merge tonight or wait?
EOF

check "r15 prose reads an ask that names a Q code" 1 "r15-question-in-prose" "-" <<'EOF'
Q8 was resolved yesterday. Should the release go out tonight?
EOF

check "r15 prose reads past a quoted colon" 1 "r15-question-in-prose" "-" <<'EOF'
- Merge with the check "stage: is it ready" now?
EOF

check "r15 prose reads a table-cell ask after a statement" 1 "r15-question-in-prose" "-" <<'EOF'
| Next step | The tests passed. Can it go out today? |
EOF

check "r15 prose reads an ask after a bold label" 1 "r15-question-in-prose" "-" <<'EOF'
**Is passive voice the hardest case?** It is. Merge now?
EOF

check "r15 prose reads an ask phrase after a quoted one" 1 "r15-question-in-prose" "-" <<'EOF'
The example is "let me know". Say the word and the release ships.
EOF

check "r15 prose reads know say so" 1 "r15-question-in-prose" "-" <<'EOF'
Let those who know say so.
EOF

check "r15 prose reads a conditional ask in a list item" 1 "r15-question-in-prose" "-" <<'EOF'
- If CI passes, merge tonight?
EOF

check "r15 prose spares a criterion naming a region" 0 "hits=0" "r15" <<'EOF'
| region | Is the bucket in us-east-1? |
EOF

check "r15 prose spares a criterion quoting a period" 0 "hits=0" "r15" <<'EOF'
- Does the message "Ready. Set" match the expected output?
EOF

check "r15 prose ends a sentence at a quoted period before a capital" 0 "hits=0" "r15" <<'EOF'
- You wrote "Ready." The test is one question: does the output match?
EOF

check "r15 reads a coded ask after a quoted ask phrase" 1 "r15-question-outside-round" "-" <<'EOF'
NA1 - The docs now say so; the example reads "let me know". Should we merge tonight?
EOF

check "r15 prose spares a criterion with a parenthetical" 0 "hits=0" "r15" <<'EOF'
- Does it build (on CI)?
EOF

check "r15 prose spares a "?" inside code written as prose" 0 "hits=0" "r15" <<'EOF'
Call obj?.prop, then pass ?-flags.
EOF

check "r15 prose keeps the say-so exclusions under underscore emphasis" 0 "hits=0" "r15" <<'EOF'
The docs now _say so_.
Nobody needed to _say so_.
EOF

check "r15 prose spares a tag word that does not end the clause" 0 "hits=0" "r15" <<'EOF'
- Is the [right] fix in place?
- Does it record notes, thoughts, and tasks?
EOF

check "r15 prose ends a sentence at an ellipsis" 0 "hits=0" "r15" <<'EOF'
- You saw it… The test is one question: does the output match?
EOF

check "r15 prose spares a criterion naming a snake_case identifier" 0 "hits=0" "r15" <<'EOF'
- Does should_merge return false for a draft?
- Does should__merge return false for a draft?
EOF

check "r15 prose spares a criterion after a bold colon label" 0 "hits=0" "r15" <<'EOF'
- **Coverage:** does the test hit every branch?
EOF

check "r15 prose reads an uppercase pronoun" 1 "r15-question-in-prose" "-" <<'EOF'
- Can YOU check the patch?
EOF

check "r15 prose reads a pronoun before the colon" 1 "r15-question-in-prose" "-" <<'EOF'
Can you confirm: is the fix right?
EOF

check "r15 prose reads a tag question after an imperative" 1 "r15-question-in-prose" "-" <<'EOF'
- Cut it tonight, does that work?
EOF

check "r15 prose reads a possessive pronoun" 1 "r15-question-in-prose" "-" <<'EOF'
- Is the call yours?
EOF

check "r15 prose spares a criterion after a prepositional lead-in" 0 "hits=0" "r15" <<'EOF'
- For headings, is the word a product name?
EOF

check "r15 prose spares two criteria in one table cell" 0 "hits=0" "r15" <<'EOF'
| check | Does the build pass? Does the linter pass? |
EOF

check "r15 prose reads an impersonal go-ahead in a list" 1 "r15-question-in-prose" "-" <<'EOF'
- Is it OK to cut it tonight?
EOF

check "r15 prose reads an inflected go-ahead word" 1 "r15-question-in-prose" "-" <<'EOF'
- Is merging tonight sensible?
EOF

check "r15 prose reads an irregular go-ahead form" 1 "r15-question-in-prose" "-" <<'EOF'
- Can option B be chosen instead?
EOF

for q in "- Which branch should land first?" "- Is the fix decided yet?" "- Is the decision final?" \
         "- Is it safe to cut today?" "- Is the branch good to go?" "- Is there a go-ahead for tonight?" \
         "- If CI passes, is it ready?" "- For now use B, is that fine?" "- Is that fine?" \
         "- Is the migration safe?" "- Which is the better choice?" "- Is there anything that shouldn’t land?" \
         "- Is the doc \"final.\" Can it go out today?" "- Is the build **green.** Can it go out today?" \
         "- Is This Enough for Us?" "- Can y'all take it from here?" "| Next step | Can we merge?|" \
         "- Is it safer to cut today?" "- Is the PR good-to-go?" "- For now—use B, is that acceptable?" "- For now--use B, is that acceptable?" \
         "- Are Monday and Tuesday good times to cut the branch?" "- Is the rollout going ahead tonight?" \
         "- Has the rollout gone ahead?" "- Can I/the team take it from here?" "- Is this enough for us--or is more needed?" \
         "- What changed, **can** it land tonight?" "- Is this enough for us-_or_ is more needed?" \
         "- What's left is the docs, won't they land tonight?" "- What remains is the docs, aren't they ready?" \
         "- What's left is the docs, shall they land tonight?" "- What's left is the docs -- can they land tonight?" \
         "- What's left is the docs (can they land tonight?)" "- What's left is the docs, how about tonight?" \
         "- What's left is the docs,can they land tonight?" \
         "- What changed is small, **so** can it land tonight?" "- What remains is scheduling, whose calendar wins?" \
         "- What's left is the docs… can they land tonight?" "- What's left is the docs…can they land tonight?" \
         "- Is tonight a good  time to cut the branch?" "- Is the branch good to  go?" "- Did the rollout go  ahead?" \
         "- What remains is the docs; shan’t they land tonight?" \
         "- Can _you_ check the patch?" "- Is it _ok_ to cut tonight?" "- Is it ready, _can_ it land?" \
         "- Is it ready, __can__ it land?" "- What's left is the docs...can they land tonight?" \
         "- Can I...take it from here?" "- What's left is the docs--can they land tonight?" \
         "- What's left is the docs, any objections?" "- What changed is small, **right**?" \
         "- What remains is the docs, sound good?" "- What's left is the docs; yes or no?" \
         "- What's left is the docs, thoughts?" "- What's left is the docs, agreed?" \
         "- Does it print \"Done.\" **Can** it land tonight?" "- Does it build–can it land tonight?" \
         "- Does it build / can it land tonight?" "- What breaks here, any thought?" \
         "- Is it ready (yes or no)?" "- Does it pass [right]?" "- What's left is the docs, agree?" \
         "- Who owns it — any thoughts?" "- What remains is the docs, any **objections**?" \
         "- What remains is the docs, sound **good**?" "- What remains is the docs, yes **or** no?" \
         "- Does CI pass, _say the word_?" "- What changed is small, so **_can_** it land tonight?" \
         "- What remains is the docs, any **_objections_**?" "- What remains is the docs, sound **_good_**?" \
         "- What remains is the docs, yes **_or_** no?" "- Is it ready, **_can_** it land?" \
         "- Is the branch good **to go**?" "- Is the branch **good to** go?" "- Has the rollout gone **ahead**?" \
         "- Is tonight a good **time** to cut?" \
         "- Does it build? Can we merge?!" "| Does it build? | Can we merge?! |" \
         "- Does it build? Should we merge?—I would wait." "- Does it build? Should we merge?.." \
         '- Does it build? Should we “merge?”' \
         "- Is the branch good-to-**go**?" "- Is the branch good-to-__go__?" "- Is the **go**-ahead given?" \
         "- Is there a _go_-ahead?" "- Is the branch **good**-to-go?" "- Is the branch _good_-to-go?" "- What remains is the docs, sounding good?" \
         "Before you pick… one question: which branch lands first?" "Before you pick... one question: which branch lands first?" \
         "- Does it build? Should we merge?… CI is still running." "Ready to go. _Say so_." \
         "- What remains is scheduling, had Friday been ruled out?" "- What remains is scheduling, hadn’t Friday been ruled out?" \
         "Plan: what changed is small; can it land tonight?" "- What's left is the docs, can they land tonight?" \
         "- How it works is unchanged, so can it go out today?" "| Next step | What remains is the docs; can they wait? |" \
         "- Are there better times to cut the branch?" "- Is a finer split acceptable?" \
         "- Can you check the message \"Ready.\" and confirm: is the result correct?"; do
  check "r15 prose reads: $q" 1 "r15-question-in-prose" "-" <<<"$q"
done

check "r15 prose spares a criterion holding i.e." 0 "hits=0" "r15" <<'EOF'
- Is the path covered, i.e., by the suite?
EOF

check "r15 prose reads an imperative before a tag question" 1 "r15-question-in-prose" "-" <<'EOF'
- For now use the fallback, is that acceptable?
EOF

check "r15 prose reads let's" 1 "r15-question-in-prose" "-" <<'EOF'
- Is this good, or let's revisit?
EOF

check "r15 prose reads a question after a pipe outside a table" 1 "r15-question-in-prose" "-" <<'EOF'
The flag reads a | does it pass?
EOF

check "r15 prose spares a criterion naming I/O" 0 "hits=0" "r15" <<'EOF'
- Is the I/O path covered?
EOF

check "r15 prose spares a quoted question" 0 "hits=0" "r15" <<'EOF'
The prompt asked "is it ready?" and the answer was yes.
EOF

check "r15 prose reads a go-ahead alone in a table cell" 1 "r15-question-in-prose" "-" <<'EOF'
| Next step | Can the rollout proceed? |
EOF

check "r15 prose reads a second question in a list item" 1 "r15-question-in-prose" "-" <<'EOF'
- Does CI pass? Is the changelog current?
EOF

check "r15 prose reads a lowercase i" 1 "r15-question-in-prose" "-" <<'EOF'
Status: is the fix right if i rebase first?
EOF

check "r15 prose reads now say so after a comma" 1 "r15-question-in-prose" "-" <<'EOF'
If the release needs to wait, now say so and the deployment will pause.
EOF

check "r15 prose reads now say so opening a sentence" 1 "r15-question-in-prose" "-" <<'EOF'
The plan holds. Now say so in the PR if it reads right.
EOF

# --- r16: an erratum that never restates the line it corrects --------------------
check "r16 erratum with no restatement" 1 "r16-erratum-unrestated" "-" <<'EOF'
The cache is fresh after all.

## Errata

E1 - **F3 as first written: The cache is stale** - The build reads it on every run; the timestamp was from a copy.
EOF

check "r16 spares a restated line" 0 "hits=0" "r16" <<'EOF'
The cache is fresh after all.

F3 - **The cache is fresh, and the timestamp was from a copy** - The build reads it on every run. (E1)

## Errata

E1 - **F3 as first written: The cache is stale** - The build reads it on every run; the timestamp was from a copy.
EOF

check "r16 spares a withdrawal" 0 "hits=0" "r16" <<'EOF'
The cache claim no longer holds.

F3 - **Withdrawn: the timestamp was from a copy** - (E1)

## Errata

E1 - **F3 as first written: The cache is stale** - The build reads it on every run.
EOF

check "r16 needs the matching erratum code" 1 "r16-erratum-unrestated" "-" <<'EOF'
The cache is fresh after all.

F3 - **The cache is fresh** - The build reads it on every run. (E2)

## Errata

E1 - **F3 as first written: The cache is stale** - The timestamp was from a copy.
EOF

check "r16 spares an uncoded erratum" 0 "hits=0" "r16" <<'EOF'
The deploy finished at 14:02.

## Errata

E1 - **I said the deploy failed** - It finished; the red status was the lint job.
EOF

check "r16 catches a numbered erratum" 1 "r16-erratum-unrestated" "-" <<'EOF'
The cache is fresh after all.

1. E1 - **F3 as first written: The cache is stale** - The timestamp was from a copy.
EOF

check "r16 spares a restatement that wraps" 0 "hits=0" "r16" <<'EOF'
The cache is fresh after all.

F3 - **The cache is fresh** - The build reads it on every run, and the
timestamp came from a copy. (E1)

## Errata

E1 - **F3 as first written: The cache is stale** - The timestamp was from a copy.
EOF

check "r7 still flags a Withdrawn colon in prose" 1 "r7-colon" "-" <<'EOF'
The status is Withdrawn: please remove it.
EOF

check "r7 spares the style's erratum forms" 0 "hits=0" "r7" <<'EOF'
The claim no longer holds.

F3 - **Withdrawn: the timestamp was from a copy** - (E1)

## Errata

E1 - **F3 as first written: the cache is stale** - The build reads it on every run.
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
