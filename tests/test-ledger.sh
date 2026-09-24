#!/usr/bin/env bash
# Tests for ledger-stop.sh. The data path hangs off $HOME, so every case runs
# with HOME pointed at a sandbox and the real ledger stays untouched. Asserts
# the active-session gate, the record shape, the definitions-only anchoring,
# the per-session file layout, the code identity drift check (D22), the
# prose-headings capture (D23, D25), the full-body and question-option
# capture, position independence, and the failsafes (exit 0, no output on
# every path but the one drift block).

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

payload_active() { # $1 = reply text, $2 = session id, $3 = cwd: a stop already blocked
  python3 -c 'import json,sys; print(json.dumps({"hook_event_name":"Stop","last_assistant_message":sys.argv[1],"session_id":sys.argv[2],"cwd":sys.argv[3],"stop_hook_active":True}))' "$1" "$2" "$3"
}

field_by_code() { # $1 = jsonl file, $2 = code, $3 = field
  python3 -c 'import json,sys
for line in open(sys.argv[1]):
    r = json.loads(line)
    if r["code"] == sys.argv[2]:
        print(r[sys.argv[3]]); break' "$1" "$2" "$3"
}

last_field() { # $1 = jsonl file, $2 = field: from the file's last line
  python3 -c 'import json,sys; print(json.loads(open(sys.argv[1]).readlines()[-1])[sys.argv[2]])' "$1" "$2"
}

json_by_code() { # $1 = jsonl file, $2 = code, $3 = field: printed as JSON
  python3 -c 'import json,sys
for line in open(sys.argv[1]):
    r = json.loads(line)
    if r["code"] == sys.argv[2]:
        print(json.dumps(r.get(sys.argv[3], "<absent>"), ensure_ascii=False)); break' "$1" "$2" "$3"
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
   b. regenerate the fixture

➡️ a - no regeneration this week
'

# 0. no active marker for the session: Katharsis is not the style here, so
# the hook writes nothing
run "$(payload "$REPLY" "sess-a" "/home/x/repo-one")"
assert_silent "inactive session silent"
if [ ! -e "$LEDGER" ]; then PASS=$((PASS+1)); else
  echo "FAIL inactive session wrote a ledger"; FAIL=$((FAIL+1)); fi
for s in a b c d e f m; do : > "$DATA/.active-sess-$s"; done  # hooks/register.ts writes these

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
check "question options" "$(json_by_code "$FILE" Q1 options)" '[{"key": "a", "text": "keep LF"}, {"key": "b", "text": "regenerate the fixture"}]'
check "question rec"     "$(json_by_code "$FILE" Q1 rec)" '"a - no regeneration this week"'
check "a prose paragraph after the body stays out of it" "$(field "$FILE" 0 summary)" "the fixture uses LF, so the bug never fired in tests"
check "non-question record has no options" "$(json_by_code "$FILE" F1 options)" '"<absent>"'
check "non-question record has no rec"     "$(json_by_code "$FILE" F1 rec)" '"<absent>"'

# 3a. position independence and the full body. A coded line under an arbitrary
# topic heading and one in a numbered list item are both recorded; a body that
# wraps joins into one paragraph; a question's options may sit behind blank
# lines, indented or not, and wrap; collection stops at the next coded line
# and at the next heading.
: > "$DATA/.active-sess-n"
run "$(payload $'Answer line.

## Some topic

The topic opens with prose.

1. F5 - **numbered item claim** - the body starts here
   and wraps onto a second line
2. Plain step with no code.

V3 - **checked under a topic** - ran the suite
wrapped once

A later paragraph that is not the body.

❓ **Q4** - **ship it today?** - the tag is ready
but CI is slow

   a. ship now

b. wait for CI, which
   takes an hour

   c. skip

➡️ b - the release has no deadline,
and a red CI costs more

Z7 - **bespoke after the question** - its own body

   d. not an option of Q4

❓ **Q5** - **second question?**

## Another topic

   a. under a new heading, not an option

➡️ nor a recommendation' "sess-n" "/home/x/pos")"
assert_silent "position capture silent"
PFILE="$LEDGER/home-x-pos/sess-n.jsonl"
check "codes captured anywhere" "$(python3 -c 'import json,sys; print(" ".join(json.loads(l)["code"] for l in open(sys.argv[1])))' "$PFILE")" "F5 V3 Q4 Z7 Q5"
check "numbered item title"     "$(field_by_code "$PFILE" F5 title)"   "numbered item claim"
check "numbered item body wraps" "$(field_by_code "$PFILE" F5 summary)" "the body starts here and wraps onto a second line"
check "topic heading is the section" "$(field_by_code "$PFILE" F5 section)" "Some topic"
check "coded line under a topic"   "$(field_by_code "$PFILE" V3 title)"   "checked under a topic"
check "wrapped body joins, later prose does not" "$(field_by_code "$PFILE" V3 summary)" "ran the suite wrapped once"
check "question body wraps"     "$(field_by_code "$PFILE" Q4 summary)" "the tag is ready but CI is slow"
check "options across blank lines, indented or not, wrapped" "$(json_by_code "$PFILE" Q4 options)" '[{"key": "a", "text": "ship now"}, {"key": "b", "text": "wait for CI, which takes an hour"}, {"key": "c", "text": "skip"}]'
check "recommendation wraps"    "$(json_by_code "$PFILE" Q4 rec)" '"b - the release has no deadline, and a red CI costs more"'
check "next coded line ends the options" "$(json_by_code "$PFILE" Z7 options)" '"<absent>"'
check "heading ends the options" "$(json_by_code "$PFILE" Q5 options)" '[]'
check "heading ends the recommendation" "$(json_by_code "$PFILE" Q5 rec)" '""'
check "question with no body"   "$(field_by_code "$PFILE" Q5 summary)" ""

# 3a2. a coded line quoted inside a fence is an example, so it is not recorded
: > "$DATA/.active-sess-fence"
run "$(payload $'Answer.\n\n```\nF90 - **example in a fence** - not an item\n```\n\nF91 - **real item** - recorded' "sess-fence" "/home/x/pos")"
assert_silent "fence capture silent"
check "fenced code skipped" "$(python3 -c 'import json,sys; print(" ".join(json.loads(l)["code"] for l in open(sys.argv[1])))' "$LEDGER/home-x-pos/sess-fence.jsonl")" "F91"

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

# 3c. a hyphen or colon inside the title is part of the title; only a dash with
# a space on both sides, or a colon followed by a space, ends it. A line that
# opens with a ticket key is prose, never a code.
run "$(payload $'## Findings\nF1 - Is ATD-1274 done for this session? - the comment posted\n❓ **Q2** - Ask Jon for a re-review? - his approval stands\nMV3 - Start a fresh session, then say:\nATD-741: Fix Kerberos SPN docs\nF4: bare claim with an in-word hyphen re-checked' "sess-e" "/home/x/repo-one")"
assert_silent "in-title hyphen silent"
check "ticket key kept in title"   "$(field_by_code "$LFILE" F1 title)"   "Is ATD-1274 done for this session?"
check "ticket key title summary"   "$(field_by_code "$LFILE" F1 summary)" "the comment posted"
check "hyphenated word kept"       "$(field_by_code "$LFILE" Q2 title)"   "Ask Jon for a re-review?"
check "trailing colon dropped"     "$(field_by_code "$LFILE" MV3 title)"  "Start a fresh session, then say"
check "colon-space still splits"   "$(field_by_code "$LFILE" F4 title)"   "bare claim with an in-word hyphen re-checked"
check "ticket key line not a code" "$(python3 -c 'import json,sys; print(sum(1 for l in open(sys.argv[1]) if json.loads(l)["prefix"].startswith("ATD")))' "$LFILE")" "0"

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
LONG="$(python3 -c 'print("F1 - **long** - " + "x"*2500)')"
run "$(payload "$LONG" "sess-c" "/home/x/repo-two")"
check "summary truncated" "$(python3 -c 'import json,sys; print(len(json.loads(open(sys.argv[1]).readline())["summary"]))' "$LEDGER/home-x-repo-two/sess-c.jsonl")" "2000"

# 7. code identity drift (D22). A code carrying a different claim than the one
# on file blocks, and the record on file survives, because the repair the block
# asks for reinstates it.
for s in g h h2 h3 i j k l; do : > "$DATA/.active-sess-$s"; done
DFILE="$LEDGER/home-x-drift/sess-g.jsonl"
run "$(payload 'F1 - **the parser drops CRLF on the Windows fixture** - it never fired in tests' "sess-g" "/home/x/drift")"
assert_silent "drift baseline silent"
run "$(payload 'F1 - **the release tag points at the wrong commit entirely** - the tag moved' "sess-g" "/home/x/drift")"
check "redefinition blocks"        "$RC" "2"
check "redefinition keeps one record" "$(wc -l < "$DFILE")" "1"
check "redefinition keeps the original" "$(field "$DFILE" 0 title)" "the parser drops CRLF on the Windows fixture"
case "$OUT" in
  *"Katharsis code identity check"*"F1"*) PASS=$((PASS+1)) ;;
  *) echo "FAIL redefinition reason: $OUT"; FAIL=$((FAIL+1)) ;;
esac
case "$OUT" in
  *"Do NOT reprint the reply"*) PASS=$((PASS+1)) ;;
  *) echo "FAIL redefinition repair is not the appended one: $OUT"; FAIL=$((FAIL+1)) ;;
esac
case "$OUT" in
  *"same item in new words, send only"*"stands as on file"*) PASS=$((PASS+1)) ;;
  *) echo "FAIL redefinition repair offers no rewording case: $OUT"; FAIL=$((FAIL+1)) ;;
esac
# The rewording repair: "F1 stands as on file." defines nothing, so it passes.
run "$(payload 'F1 stands as on file.' "sess-g" "/home/x/drift")"
assert_silent "the stands-as-on-file repair passes"
check "the repair keeps the original" "$(field "$DFILE" 0 title)" "the parser drops CRLF on the Windows fixture"

# 7b. an E line naming the code is the escape: the reply already said which
# definition is current, so the new one is recorded and nothing blocks.
run "$(payload 'F1 - **the parser drops CRLF on the Windows fixture** - it never fired in tests' "sess-h" "/home/x/drift")"
assert_silent "E-escape baseline silent"
run "$(payload $'## Errata\nE2 - **F1 no longer means the CRLF fixture** - the reading below replaces it\n\n## Findings\nF1 - **the release tag points at the wrong commit entirely** - the tag moved' "sess-h" "/home/x/drift")"
assert_silent "E line naming the code escapes the block"
check "E-escape records the newest" "$(field_by_code "$LEDGER/home-x-drift/sess-h.jsonl" F1 title)" "the release tag points at the wrong commit entirely"

# 7b2. a correction keeps its code: the line restated under the same code ends
# with its erratum's code, the E line holds the old wording, nothing blocks, and
# the code's record carries the corrected line.
run "$(payload 'F1 - **the parser drops CRLF on the Windows fixture** - it never fired in tests' "sess-h2" "/home/x/drift")"
assert_silent "correction baseline silent"
run "$(payload $'## Findings\nF1 - **the release tag points at the wrong commit entirely** - the tag moved (E2)\n\n## Errata\nE2 - **as first written: the parser drops CRLF on the Windows fixture** - the fixture was never loaded' "sess-h2" "/home/x/drift")"
assert_silent "a correction marked with its erratum does not block"
check "correction records the corrected line under the old code" "$(field_by_code "$LEDGER/home-x-drift/sess-h2.jsonl" F1 title)" "the release tag points at the wrong commit entirely"
check "the erratum holds the old wording" "$(field_by_code "$LEDGER/home-x-drift/sess-h2.jsonl" E2 title)" "as first written: the parser drops CRLF on the Windows fixture"
run "$(payload 'F1 - **the parser drops CRLF on the Windows fixture** - it never fired in tests' "sess-h3" "/home/x/drift")"
run "$(payload 'F1 - **the release tag points at the wrong commit entirely** - the tag moved (E9)' "sess-h3" "/home/x/drift")"
check "a marker naming no erratum in the reply still blocks" "$RC" "2"
case "$OUT" in
  *"first written"*) PASS=$((PASS+1)) ;;
  *) echo "FAIL drift repair names the keep-the-code form: $OUT"; FAIL=$((FAIL+1)) ;;
esac

# 7c. a stop already blocked this turn always passes, so a false positive costs
# one appended paragraph rather than a deadlock.
run "$(payload 'F1 - **the parser drops CRLF on the Windows fixture** - it never fired in tests' "sess-i" "/home/x/drift")"
assert_silent "loop-guard baseline silent"
run "$(payload_active 'F1 - **the release tag points at the wrong commit entirely** - the tag moved' "sess-i" "/home/x/drift")"
assert_silent "stop_hook_active passes the drift check"

# 7d. the same claim reworded is not drift: the reader can still tell what the
# code means, and a rule that fires here fires on every rewritten reply.
run "$(payload 'D3 - **ten waves, split on subtree boundaries, each under 42 pages** - the tree decides' "sess-j" "/home/x/drift")"
assert_silent "rewording baseline silent"
run "$(payload 'D3 - **ten waves on subtree boundaries, none over 42 pages** - the tree decides' "sess-j" "/home/x/drift")"
assert_silent "reworded claim does not block"

# 7e. a title short enough to be a CODE_RE fragment is never compared.
run "$(payload 'AT9 - **wrote test** - the fixture' "sess-k" "/home/x/drift")"
assert_silent "short-title baseline silent"
run "$(payload 'AT9 - **ran build** - the log' "sess-k" "/home/x/drift")"
assert_silent "short title is not compared"

# 7f. a cross-turn renumber captures to telemetry and never blocks: the harmful
# case sits at the same similarity as two genuinely distinct findings (D22).
run "$(payload 'F4 - **the schema enum calls the type explanation** - doc-templates disagrees' "sess-l" "/home/x/drift")"
assert_silent "renumber baseline silent"
run "$(payload 'F7 - **the schema enum calls the type explanation** - doc-templates disagrees' "sess-l" "/home/x/drift")"
assert_silent "renumber captures without blocking"
check "renumber telemetry line" "$(wc -l < "$DATA/telemetry/drift.jsonl")" "1"
check "renumber names the old code" "$(field_by_code "$DATA/telemetry/drift.jsonl" F7 was_code)" "F4"
check "renumber names the new code" "$(field_by_code "$DATA/telemetry/drift.jsonl" F7 code)" "F7"
check "renumber records no reply text" "$(grep -c '"title"' "$DATA/telemetry/drift.jsonl")" "0"

# 8. prose headings (D23, D25): one telemetry record per reply, counts only.
# A `##` over prose is a heading; a stock group name or a coded line under the
# header makes it a group; a group opening with prose has a theme line.
HFILE="$DATA/telemetry/headings.jsonl"
: > "$DATA/.active-sess-p"
run "$(payload $'The answer line.\n\n## First idea\n\nPara one.\n\nPara two.\n\nPara three.\n\n## Findings\n\nAll three trace to one loader.\n\nF1 - **the loader shadows the config** - repo-local first\nF2 - **the pin never applied** - same loader\n\n## Questions\n\n❓ **Q1** - **which fixture?**\n   a. x\n\n➡️ a - because' "sess-p" "/home/x/prose")"
assert_silent "headings capture silent"
check "headings counts prose sections only" "$(last_field "$HFILE" headings)" "1"
check "max_run is the longest paragraph run"  "$(last_field "$HFILE" max_run)"  "3"
check "bare is 0 when the answer line stands alone" "$(last_field "$HFILE" bare)" "0"
check "themes counts a group opening with prose" "$(last_field "$HFILE" themes)" "1"
check "headings record carries no text" "$(python3 -c 'import json,sys; print(sorted(json.loads(open(sys.argv[1]).readlines()[-1])))' "$HFILE")" "['bare', 'headings', 'max_run', 'project', 'session_id', 'themes', 'ts']"
run "$(payload $'The answer line.\n\nA bare paragraph.\n\nAnother one, with a fence:\n\n```\ncode\n\nmore code\n```\n\n## Bespoke group\n\nZ1 - **a claim** - evidence' "sess-p" "/home/x/prose")"
assert_silent "bare capture silent"
check "bare counts paragraphs after the answer line under no heading" "$(last_field "$HFILE" bare)" "3"
check "a coded line makes a bespoke header a group" "$(last_field "$HFILE" headings)" "0"
check "a group opening with a coded line has no theme" "$(last_field "$HFILE" themes)" "0"
check "one record per reply" "$(wc -l < "$HFILE")" "$(python3 -c 'import sys; print(int(sys.argv[1]))' "$(wc -l < "$HFILE")")"

# 8b. questions (D27-D29, D32): one record per reply, counts only.
QFILE="$DATA/telemetry/decisions.jsonl"
: > "$DATA/.active-sess-q"
run "$(payload $'Done.\n\n## Findings\nF1 - **the loader reads the repo copy first** - so the pin never applied; `src/load.ts:40`\nF2 - **two fixtures disagree** - `a/b.ts:3` and `c/d.ts:9` differ\n\n## Questions\n\n❓ **Q1** - **Start NA1 now?** - x\n\n❓ **Q2** - **Post the reply to Jon?** - y' "sess-q" "/home/x/q")"
assert_silent "decisions capture silent"
check "questions counted" "$(last_field "$QFILE" questions)" "2"
check "gate-shaped question counted" "$(last_field "$QFILE" gates)" "1"
check "addressed counts F lines with an address" "$(last_field "$QFILE" addressed)" "2"
check "multi counts lines with two or more" "$(last_field "$QFILE" multi)" "1"
check "first ask is not a re-ask" "$(last_field "$QFILE" reasked)" "0"
run "$(payload $'Still open.\n\n## Questions\n\n❓ **Q2** - **Post the reply to Jon?** - y' "sess-q" "/home/x/q")"
check "a restated question counts as re-asked" "$(last_field "$QFILE" reasked)" "1"
check "decisions record carries no text" "$(python3 -c 'import json,sys; print(sorted(json.loads(open(sys.argv[1]).readlines()[-1])))' "$QFILE")" "['addressed', 'gates', 'multi', 'project', 'questions', 'reasked', 'session_id', 'ts']"

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
