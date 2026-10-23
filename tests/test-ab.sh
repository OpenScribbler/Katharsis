#!/usr/bin/env bash
# Tests for ab.py, the A/B harness. Each case builds a run from a planted
# prompt set and two planted plugin roots, plants the replies a generator
# would write, and asserts the exact output and exit code of each step:
# init, status, blind (the shuffle), judge (verdicts), and report (the
# unblinding and the bar arithmetic).

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
AB="$DIR/ab.py"
PASS=0; FAIL=0
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

check() { # <condition> && R=0 || R=1; check <name> <detail>
  if [ "$R" -eq 0 ]; then PASS=$((PASS+1)); else echo "FAIL $1: $2"; FAIL=$((FAIL+1)); fi
}

run() { OUT="$(python3 "$AB" "$@" 2>&1)"; RC=$?; }

# lbl <run> <side>: the label init drew for <side>
lbl() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["labels"][sys.argv[2]])' "$1/run.json" "$2"; }

# plant <run> <prompt>... : every reply written, its text naming its side so placement can be checked
plant() {
  local r="$1" p s; shift
  for p in "$@"; do for s in baseline changed; do
    printf 'Reply %s %s.\n' "$p" "$s" > "$r/replies/$p-$(lbl "$r" "$s").md"
  done; done
}

# side <dir> <marker>: a plugin root whose style and guidance carry <marker>
side() {
  mkdir -p "$1/output-styles" "$1/styles/models"
  printf -- '---\nname: Katharsis\n---\n\nStyle %s. Read `~/.claude/katharsis/styles/default.md`.\n' "$2" > "$1/output-styles/katharsis.md"
  printf 'Guidance %s.\n' "$2" > "$1/styles/default.md"
  printf 'Note %s.\n' "$2" > "$1/styles/models/opus.md"
}
side "$T/base" BASE
side "$T/chg" CHANGED

cat > "$T/prompts.json" <<'EOF'
[
 {"id": "alpha", "message": "How does the stop hook decide to hold?"},
 {"id": "beta", "message": "I didn't read that, walk me through it", "context": "Earlier reply: the hold fires once."},
 {"id": "gamma", "message": "Rename the flag."}
]
EOF

# --- init ---
R_DIR="$T/run1"
run init "$R_DIR" --prompts "$T/prompts.json" --baseline "$T/base" --changed "$T/chg" --bar 2/3
[ "$RC" -eq 0 ] && [ "$OUT" = "run $R_DIR: 3 prompts, 6 briefs, bar 2 of 3" ] && R=0 || R=1
check "init output" "rc=$RC out=$OUT"
LB="$(lbl "$R_DIR" baseline)"; LC="$(lbl "$R_DIR" changed)"

[ "$(printf '%s\n' "$LB" "$LC" | sort | tr -d '\n')" = ab ] && R=0 || R=1
check "init labels the two sides a and b" "baseline=$LB changed=$LC"

! grep -rqE 'baseline|changed' "$R_DIR/briefs" && [ ! -e "$R_DIR/sides/changed" ] && R=0 || R=1
check "no brief or snapshot path names a side" "$(grep -rlE 'baseline|changed' "$R_DIR/briefs")"

[ -f "$R_DIR/briefs/alpha-$LB.md" ] && [ -f "$R_DIR/briefs/gamma-$LC.md" ] && [ "$(ls "$R_DIR/briefs" | wc -l)" -eq 6 ] && R=0 || R=1
check "init writes one brief per prompt per side" "$(ls "$R_DIR/briefs" 2>&1)"

B="$(cat "$R_DIR/briefs/beta-$LC.md" 2>/dev/null)"
# The literal ~/.claude/katharsis/ is the installed-plugin path the brief must not keep.
# shellcheck disable=SC2088
grep -q 'Style CHANGED' <<<"$B" && ! grep -q 'Style BASE' <<<"$B" \
  && grep -qF "$R_DIR/sides/$LC/styles/default.md" <<<"$B" && ! grep -qF '~/.claude/katharsis/' <<<"$B" \
  && grep -qF "$R_DIR/replies/beta-$LC.md" <<<"$B" \
  && grep -qF 'I didn'"'"'t read that, walk me through it' <<<"$B" && grep -qF 'Earlier reply: the hold fires once.' <<<"$B" \
  && ! grep -q 'name: Katharsis' <<<"$B" && R=0 || R=1
check "brief carries its side's style, snapshot paths, reply path, and the prompt" "$B"

! grep -q '<conversation>' "$R_DIR/briefs/alpha-$LB.md" && R=0 || R=1
check "brief without context has no conversation block" "$(cat "$R_DIR/briefs/alpha-$LB.md")"

[ "$(cat "$R_DIR/sides/$LB/styles/models/opus.md" 2>/dev/null)" = "Note BASE." ] \
  && [ "$(cat "$R_DIR/sides/$LC/styles/default.md" 2>/dev/null)" = "Guidance CHANGED." ] && R=0 || R=1
check "init snapshots each side's style and guidance files" "$(ls -R "$R_DIR/sides" 2>&1)"

grep -qF "$R_DIR/briefs" "$R_DIR/generate.md" 2>/dev/null && grep -q 'with model opus,' "$R_DIR/generate.md" && R=0 || R=1
check "init writes the generator prompt with the default model" "$(cat "$R_DIR/generate.md" 2>&1)"

run init "$R_DIR" --prompts "$T/prompts.json" --baseline "$T/base" --changed "$T/chg" --bar 2/3
[ "$RC" -eq 2 ] && [ "$OUT" = "ab.py: $R_DIR already exists" ] && R=0 || R=1
check "init refuses an existing run" "rc=$RC out=$OUT"

run init "$T/run-fullid" --prompts "$T/prompts.json" --baseline "$T/base" --changed "$T/chg" --bar 2/3 --model claude-opus-5-5
[ "$RC" -eq 2 ] && [ ! -e "$T/run-fullid" ] && R=0 || R=1
check "init refuses a model the Agent tool cannot take" "rc=$RC out=$OUT"

run init "$T/run-badbar" --prompts "$T/prompts.json" --baseline "$T/base" --changed "$T/chg" --bar 2/30
[ "$RC" -eq 2 ] && [ "$OUT" = "ab.py: the bar is out of 30 pairs, but the prompt set has 3 prompts" ] && [ ! -e "$T/run-badbar" ] && R=0 || R=1
check "init refuses a bar whose pair count differs from the prompt set" "rc=$RC out=$OUT"

run init "$T/run-badbar2" --prompts "$T/prompts.json" --baseline "$T/base" --changed "$T/chg" --bar 4/3
[ "$RC" -eq 2 ] && [ "$OUT" = "ab.py: --bar takes WINS/PAIRS with 1 <= WINS <= PAIRS, got 4/3" ] && R=0 || R=1
check "init refuses a bar above its pair count" "rc=$RC out=$OUT"

printf '[{"id": "a", "message": "x"}, {"id": "a", "message": "y"}]' > "$T/dup.json"
run init "$T/run-dup" --prompts "$T/dup.json" --baseline "$T/base" --changed "$T/chg" --bar 1/2
[ "$RC" -eq 2 ] && [ "$OUT" = "ab.py: prompt 2: id 'a' is repeated" ] && R=0 || R=1
check "init refuses a repeated prompt id" "rc=$RC out=$OUT"

printf '[{"id": "Bad id", "message": "x"}]' > "$T/badid.json"
run init "$T/run-badid" --prompts "$T/badid.json" --baseline "$T/base" --changed "$T/chg" --bar 1/1
[ "$RC" -eq 2 ] && [ "$OUT" = "ab.py: prompt 1: id must match [a-z0-9-]+, got 'Bad id'" ] && R=0 || R=1
check "init refuses an id that cannot name a file" "rc=$RC out=$OUT"

run init "$T/run-noside" --prompts "$T/prompts.json" --baseline "$T/nope" --changed "$T/chg" --bar 2/3
[ "$RC" -eq 2 ] && [ "$OUT" = "ab.py: $T/nope has no output-styles/katharsis.md" ] && R=0 || R=1
check "init refuses a side that is not a plugin root" "rc=$RC out=$OUT"

mkdir -p "$T/nostyles/output-styles"; cp "$T/base/output-styles/katharsis.md" "$T/nostyles/output-styles/"
run init "$T/run-nostyles" --prompts "$T/prompts.json" --baseline "$T/base" --changed "$T/nostyles" --bar 2/3
[ "$RC" -eq 2 ] && [ "$OUT" = "ab.py: $T/nostyles has no styles/" ] && [ ! -e "$T/run-nostyles" ] && R=0 || R=1
check "init refuses a side with no guidance files, writing nothing" "rc=$RC out=$OUT"

printf '{"id": "a", "message": "x"}' > "$T/obj.json"
run init "$T/run-obj" --prompts "$T/obj.json" --baseline "$T/base" --changed "$T/chg" --bar 1/1
[ "$RC" -eq 2 ] && [ "$OUT" = "ab.py: the prompt set must be a JSON list of prompts" ] && R=0 || R=1
check "init refuses a prompt set that is not a list" "rc=$RC out=$OUT"

printf '[{"id": "a", "message": "x"},' > "$T/broken.json"
run init "$T/run-broken" --prompts "$T/broken.json" --baseline "$T/base" --changed "$T/chg" --bar 1/1
[ "$RC" -eq 2 ] && [[ "$OUT" == "ab.py: cannot read the prompt set: "* ]] && [ ! -e "$T/run-broken" ] && R=0 || R=1
check "init refuses a prompt set that is not JSON" "rc=$RC out=$OUT"

printf '[{"id": "a", "message": "x", "context": ["y"]}]' > "$T/ctx.json"
run init "$T/run-ctx" --prompts "$T/ctx.json" --baseline "$T/base" --changed "$T/chg" --bar 1/1
[ "$RC" -eq 2 ] && [ "$OUT" = "ab.py: prompt 1: context must be a string" ] && R=0 || R=1
check "init refuses a context that is not a string" "rc=$RC out=$OUT"

touch "$T/afile"
run init "$T/afile/run" --prompts "$T/prompts.json" --baseline "$T/base" --changed "$T/chg" --bar 2/3
[ "$RC" -eq 2 ] && [[ "$OUT" == "ab.py: cannot write $T/afile/run: "* ]] && R=0 || R=1
check "init reports a run path it cannot create as a usage error" "rc=$RC out=$OUT"

side "$T/dangle" DANGLE; ln -s "$T/nowhere" "$T/dangle/styles/broken.md"
mkdir -p "$T/initfail"
run init "$T/initfail/run" --prompts "$T/prompts.json" --baseline "$T/base" --changed "$T/dangle" --bar 2/3
[ "$RC" -eq 2 ] && [[ "$OUT" == "ab.py: cannot write $T/initfail/run: "* ]] && [ -z "$(ls -A "$T/initfail")" ] && R=0 || R=1
check "init that fails mid-copy leaves nothing behind" "rc=$RC out=$OUT left=$(ls -A "$T/initfail")"

# --- status ---
run status "$R_DIR"
[ "$RC" -eq 1 ] && [ "$OUT" = "0 of 6 replies written; missing: alpha-a alpha-b beta-a beta-b gamma-a gamma-b" ] && R=0 || R=1
check "status lists every missing reply" "rc=$RC out=$OUT"

plant "$R_DIR" alpha beta gamma
: > "$R_DIR/replies/gamma-$LC.md"
run status "$R_DIR"
[ "$RC" -eq 1 ] && [ "$OUT" = "5 of 6 replies written; missing: gamma-$LC" ] && R=0 || R=1
check "status counts an empty reply as missing" "rc=$RC out=$OUT"

printf 'Reply gamma changed.\n' > "$R_DIR/replies/gamma-$LC.md"
run status "$R_DIR"
[ "$RC" -eq 0 ] && [ "$OUT" = "6 of 6 replies written" ] && R=0 || R=1
check "status passes a complete run" "rc=$RC out=$OUT"

# --- blind ---
# fresh <dir>: a run of the 3 prompts with every reply written
fresh() {
  python3 "$AB" init "$1" --prompts "$T/prompts.json" --baseline "$T/base" --changed "$T/chg" --bar 2/3 >/dev/null 2>&1
  plant "$1" alpha beta gamma
}

R_MISS="$T/run-miss"; fresh "$R_MISS"; M="beta-$(lbl "$R_MISS" baseline)"; rm "$R_MISS/replies/$M.md"
run blind "$R_MISS"
[ "$RC" -eq 1 ] && [ "$OUT" = "2 of 3 pairs complete; write the missing replies first: $M" ] && [ ! -e "$R_MISS/key.json" ] && R=0 || R=1
check "blind refuses a run with a reply missing" "rc=$RC out=$OUT"

run blind "$R_DIR" --seed 7
[ "$RC" -eq 0 ] && [ "$OUT" = "blinded 3 pairs into $R_DIR/judge" ] && R=0 || R=1
check "blind output" "rc=$RC out=$OUT"

# Every judge file holds one prompt's message and that prompt's two replies, in the
# order the key records, and names neither side.
R=0; DETAIL=""
for n in 1 2 3; do
  f="$R_DIR/judge/0$n.md"
  read -r pid first < <(python3 -c 'import json,sys; k=json.load(open(sys.argv[1]))["pairs"][int(sys.argv[2])-1]; print(k["prompt"], k["first"])' "$R_DIR/key.json" "$n")
  second=changed; [ "$first" = changed ] && second=baseline
  msg="$(python3 -c 'import json,sys; print([p for p in json.load(open(sys.argv[1])) if p["id"]==sys.argv[2]][0]["message"])' "$T/prompts.json" "$pid")"
  want="$(printf '# Pair %s of 3\n\n## Message\n\n%s\n\n===== Reply 1 =====\n\nReply %s %s.\n\n===== Reply 2 =====\n\nReply %s %s.' "$n" "$msg" "$pid" "$first" "$pid" "$second")"
  [ "$pid" = beta ] && want="$(printf '# Pair %s of 3\n\n## Conversation so far\n\nEarlier reply: the hold fires once.\n\n## Message\n\n%s\n\n===== Reply 1 =====\n\nReply %s %s.\n\n===== Reply 2 =====\n\nReply %s %s.' "$n" "$msg" "$pid" "$first" "$pid" "$second")"
  # The planted replies name their side so the test can check placement; real ones do not.
  [ "$(cat "$f")" = "$want" ] || { R=1; DETAIL="$DETAIL pair $n: $(cat "$f")"; }
done
[ "$(python3 -c 'import json,sys; print(sorted(p["prompt"] for p in json.load(open(sys.argv[1]))["pairs"]))' "$R_DIR/key.json")" = "['alpha', 'beta', 'gamma']" ] || { R=1; DETAIL="$DETAIL key prompts"; }
check "judge files match the key and cover every prompt once" "$DETAIL"

R_SA="$T/run-seedA"; fresh "$R_SA"
for p in alpha beta gamma; do printf 'Reply text %s.\n' "$p" > "$R_SA/replies/$p-$(lbl "$R_SA" baseline).md"; printf 'Other text %s.\n' "$p" > "$R_SA/replies/$p-$(lbl "$R_SA" changed).md"; done
python3 "$AB" blind "$R_SA" --seed 7 >/dev/null
! grep -rqiE 'baseline|changed' "$R_SA/judge" && [ ! -e "$R_SA/judge/key.json" ] && R=0 || R=1
check "judge files never name a side, and the key sits outside them" "$(grep -rliE 'baseline|changed' "$R_SA/judge")"

[ "$(cat "$R_DIR/key.json")" = "$(cat "$R_SA/key.json")" ] && R=0 || R=1
check "the same seed gives the same order and sides" "$(cat "$R_DIR/key.json") vs $(cat "$R_SA/key.json")"

# Across 40 seeds the shuffle moves both the pair order and the sides.
ORDERS="$(for s in $(seq 1 40); do d="$T/seed-$s"; fresh "$d"; python3 "$AB" blind "$d" --seed "$s" >/dev/null
  python3 -c 'import json,sys; k=json.load(open(sys.argv[1])); print(" ".join(p["prompt"] for p in k["pairs"]), "|", " ".join(p["first"] for p in k["pairs"]))' "$d/key.json"; done)"
[ "$(cut -d'|' -f1 <<<"$ORDERS" | sort -u | wc -l)" -eq 6 ] && [ "$(cut -d'|' -f2 <<<"$ORDERS" | sort -u | wc -l)" -eq 8 ] && R=0 || R=1
check "40 seeds reach all 6 pair orders and all 8 side patterns" "$ORDERS"

run blind "$R_DIR" --seed 8
[ "$RC" -eq 1 ] && [ "$OUT" = "$R_DIR is already blinded; the order stays as first drawn" ] && R=0 || R=1
check "blind refuses a second shuffle" "rc=$RC out=$OUT"

# A blind cut short leaves judge/ without the key: judge refuses it, and blind starts over.
R_CUT="$T/run-cut"; fresh "$R_CUT"; python3 "$AB" blind "$R_CUT" --seed 2 >/dev/null; rm "$R_CUT/key.json" "$R_CUT/judge/02.md"
run judge "$R_CUT"
[ "$RC" -eq 2 ] && [ "$OUT" = "ab.py: $R_CUT is not blinded yet; run ab.py blind first" ] && R=0 || R=1
check "judge refuses a blind cut short" "rc=$RC out=$OUT"
run blind "$R_CUT" --seed 2
[ "$RC" -eq 0 ] && [ -f "$R_CUT/judge/02.md" ] && [ -f "$R_CUT/key.json" ] && R=0 || R=1
check "blind redoes a blind cut short" "rc=$RC out=$OUT"

rm "$R_CUT/judge/03.md"
OUT="$(printf '1\n1\n' | python3 "$AB" judge "$R_CUT" 2>&1)"; RC=$?
[ "$RC" -eq 2 ] && grep -qxF "ab.py: $R_CUT/judge has no 03.md; the blind output is incomplete" <<<"$OUT" && R=0 || R=1
check "judge refuses a pair file gone missing" "rc=$RC out=$OUT"

printf '{"seed": 1, "pa' > "$R_CUT/key.json"
run report "$R_CUT"
[ "$RC" -eq 2 ] && [[ "$OUT" == "ab.py: $R_CUT/key.json is not valid JSON: "* ]] && R=0 || R=1
check "report refuses a key that is not JSON" "rc=$RC out=$OUT"

# --- judge and report ---
# picks <run> <w|l|t>...: the judge's answers that give the changed side a win, a loss, or a tie, pair by pair
picks() {
  local run="$1"; shift; local n=0
  for want in "$@"; do
    n=$((n+1))
    first="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["pairs"][int(sys.argv[2])-1]["first"])' "$run/key.json" "$n")"
    case "$want$first" in
      wchanged|lbaseline) echo 1 ;;
      wbaseline|lchanged) echo 2 ;;
      t*) echo t ;;
    esac
  done
}

R_F="$T/run-fresh"; fresh "$R_F"
run judge "$R_F"
[ "$RC" -eq 2 ] && [ "$OUT" = "ab.py: $R_F is not blinded yet; run ab.py blind first" ] && R=0 || R=1
check "judge refuses an unblinded run" "rc=$RC out=$OUT"

run report "$R_F"
[ "$RC" -eq 2 ] && [ "$OUT" = "ab.py: $R_F is not blinded yet; run ab.py blind first" ] && R=0 || R=1
check "report refuses an unblinded run" "rc=$RC out=$OUT"

R_P="$T/run-pass"; fresh "$R_P"; python3 "$AB" blind "$R_P" --seed 3 >/dev/null
printf 'my notes\n' > "$R_P/judge/notes.md"; printf 'stray\n' > "$R_P/judge/1.md"; printf 'stray\n' > "$R_P/judge/2026.md"
OUT="$( { echo x; picks "$R_P" w l w; } | python3 "$AB" judge "$R_P" 2>&1)"; RC=$?
[ "$RC" -eq 0 ] && [ "$(grep -c '^Answer 1, 2, or t\.$' <<<"$OUT")" -eq 1 ] && [ "$(grep -c '^Pair 1 of 3\. Better reply' <<<"$OUT")" -eq 2 ] \
  && grep -qF '===== Reply 2 =====' <<<"$OUT" && [ "$(tail -1 <<<"$OUT")" = "3 of 3 pairs judged" ] \
  && ! grep -q '^stray$' <<<"$OUT" && R=0 || R=1
check "judge shows each pair, re-asks on a bad answer, counts, and skips stray files" "rc=$RC out=$OUT"

[ "$(cat "$R_P/verdicts.jsonl" | wc -l)" -eq 3 ] && ! grep -qiE 'baseline|changed' "$R_P/verdicts.jsonl" && R=0 || R=1
check "verdicts are one line per pair and record the judge's pick, not the side" "$(cat "$R_P/verdicts.jsonl")"

run report "$R_P"
[ "$RC" -eq 0 ] && [ "$OUT" = "$(printf '3 of 3 pairs judged\nchanged side: wins 2, losses 1, ties 0\nbar: 2 wins of 3\nresult: pass')" ] && R=0 || R=1
check "report unblinds a pass at the bar" "rc=$RC out=$OUT"

R_I="$T/run-incon"; fresh "$R_I"; python3 "$AB" blind "$R_I" --seed 4 >/dev/null
picks "$R_I" w t t | python3 "$AB" judge "$R_I" >/dev/null 2>&1
run report "$R_I"
[ "$RC" -eq 1 ] && [ "$OUT" = "$(printf '3 of 3 pairs judged\nchanged side: wins 1, losses 0, ties 2\nbar: 2 wins of 3\nresult: inconclusive')" ] && R=0 || R=1
check "report calls ties below the bar inconclusive" "rc=$RC out=$OUT"

R_H="$T/run-half"; fresh "$R_H"; python3 "$AB" blind "$R_H" --seed 5 >/dev/null
OUT="$(picks "$R_H" w | python3 "$AB" judge "$R_H" 2>&1)"; RC=$?
[ "$RC" -eq 1 ] && [ "$(tail -1 <<<"$OUT")" = "1 of 3 pairs judged" ] && R=0 || R=1
check "judge stops at end of input and says how far it got" "rc=$RC out=$OUT"

run report "$R_H"
[ "$RC" -eq 1 ] && [ "$OUT" = "$(printf '1 of 3 pairs judged\nresult: inconclusive')" ] && R=0 || R=1
check "report on a partly judged run is inconclusive and shows no counts" "rc=$RC out=$OUT"

R_E="$T/run-early"; fresh "$R_E"; python3 "$AB" blind "$R_E" --seed 6 >/dev/null
picks "$R_E" w w | python3 "$AB" judge "$R_E" >/dev/null 2>&1
run report "$R_E"
[ "$RC" -eq 1 ] && [ "$OUT" = "$(printf '2 of 3 pairs judged\nresult: inconclusive')" ] && R=0 || R=1
check "report holds a pass until every pair is judged" "rc=$RC out=$OUT"

# A second judge on the same run repeats pair 1; it counts once and pair 3 stays owed.
head -1 "$R_E/verdicts.jsonl" >> "$R_E/verdicts.jsonl"
run report "$R_E"
[ "$RC" -eq 1 ] && [ "$OUT" = "$(printf '2 of 3 pairs judged\nresult: inconclusive')" ] && R=0 || R=1
check "a repeated verdict counts once" "rc=$RC out=$OUT"

# A judge killed mid-write leaves a cut line; the next judge records pair 3 on its own line.
printf '{"pair": 3' >> "$R_E/verdicts.jsonl"
OUT="$(picks "$R_E" w w l | tail -1 | python3 "$AB" judge "$R_E" 2>&1)"; RC=$?
[ "$RC" -eq 0 ] && [ "$(tail -1 <<<"$OUT")" = "3 of 3 pairs judged" ] && R=0 || R=1
check "judge resumes past a cut verdict line" "rc=$RC out=$OUT"
run report "$R_E"
[ "$RC" -eq 0 ] && [ "$OUT" = "$(printf '3 of 3 pairs judged\nchanged side: wins 2, losses 1, ties 0\nbar: 2 wins of 3\nresult: pass')" ] && R=0 || R=1
check "report after a cut line counts each pair once" "rc=$RC out=$OUT"

# Verdicts for pairs the run lacks, or with a pick judge never writes, count for nothing.
R_V="$T/run-foreign"; fresh "$R_V"; python3 "$AB" blind "$R_V" --seed 6 >/dev/null
printf '{"pair": 99, "pick": "1"}\n{"pair": 1, "pick": "x"}\n[]\n{"pair": 2, "pick": "1"}\n{"pair": 3, "pick": "2"}\n' > "$R_V/verdicts.jsonl"
OUT="$(python3 "$AB" judge "$R_V" </dev/null 2>&1)"; RC=$?
[ "$RC" -eq 1 ] && [ "$(tail -1 <<<"$OUT")" = "2 of 3 pairs judged" ] && R=0 || R=1
check "judge counts only valid verdicts for the run's own pairs" "rc=$RC out=$OUT"
run report "$R_V"
[ "$RC" -eq 1 ] && [ "$OUT" = "$(printf '2 of 3 pairs judged\nresult: inconclusive')" ] && R=0 || R=1
check "report counts only valid verdicts for the run's own pairs" "rc=$RC out=$OUT"

# Resuming judges only what is left: pair 1 is not asked again.
OUT="$(picks "$R_H" w w w | tail -2 | python3 "$AB" judge "$R_H" 2>&1)"; RC=$?
! grep -qF 'Pair 1 of 3' <<<"$OUT" && [ "$RC" -eq 0 ] && R=0 || R=1
check "judge resumes after the last recorded verdict" "rc=$RC out=$OUT"
run report "$R_H"
[ "$RC" -eq 0 ] && [ "$(sed -n 2p <<<"$OUT")" = "changed side: wins 3, losses 0, ties 0" ] && R=0 || R=1
check "report after a resumed judging counts every pair" "rc=$RC out=$OUT"

# A reply that cites its snapshot reaches the judge with the label replaced.
R_CITE="$T/run-cite"; fresh "$R_CITE"
printf 'See %s/sides/a/styles/default.md and %s/sides/b/styles/x.md.\n' "$R_CITE" "$R_CITE" > "$R_CITE/replies/alpha-a.md"
python3 "$AB" blind "$R_CITE" --seed 1 >/dev/null
grep -rqF 'See <side>/styles/default.md and <side>/styles/x.md.' "$R_CITE/judge" && ! grep -rqE 'sides/[ab]' "$R_CITE/judge" && R=0 || R=1
check "judge files replace a cited snapshot path's label" "$(grep -rh 'See' "$R_CITE/judge")"

run status "$T/afile/run"
[ "$RC" -eq 2 ] && [[ "$OUT" == "ab.py: $T/afile/run: cannot use this run: "* ]] && R=0 || R=1
check "status reports a run path under a file as a usage error" "rc=$RC out=$OUT"

R_U="$T/run-utf"; fresh "$R_U"; printf '\xff\xfe\n' > "$R_U/replies/alpha-a.md"
run status "$R_U"
[ "$RC" -eq 2 ] && [[ "$OUT" == "ab.py: $R_U: cannot use this run: "* ]] && R=0 || R=1
check "status reports a reply that is not UTF-8 as a usage error" "rc=$RC out=$OUT"

# generate.md's status command works from a run path with a space in it.
mkdir -p "$T/with space"; R_SP="$T/with space/run"
python3 "$AB" init "$R_SP" --prompts "$T/prompts.json" --baseline "$T/base" --changed "$T/chg" --bar 2/3 >/dev/null
CMD="$(grep -o 'run `[^`]*`' "$R_SP/generate.md" | sed 's/^run `//; s/`$//')"
OUT="$(bash -c "$CMD" 2>&1)"; RC=$?
[ "$RC" -eq 1 ] && [[ "$OUT" == "0 of 6 replies written; missing: "* ]] && R=0 || R=1
check "generate.md quotes the paths in its status command" "cmd=$CMD rc=$RC out=$OUT"

# At 101 pairs, file names sort 100 before 11; each verdict still lands on its own pair.
python3 -c 'import json; print(json.dumps([{"id": f"p{i}", "message": f"m{i}"} for i in range(101)]))' > "$T/big.json"
R_BIG="$T/run-big"
python3 "$AB" init "$R_BIG" --prompts "$T/big.json" --baseline "$T/base" --changed "$T/chg" --bar 101/101 >/dev/null
for i in $(seq 0 100); do printf 'r\n' > "$R_BIG/replies/p$i-a.md"; printf 'r\n' > "$R_BIG/replies/p$i-b.md"; done
python3 "$AB" blind "$R_BIG" --seed 9 >/dev/null
mapfile -t WINS < <(yes w | head -101)
OUT="$(picks "$R_BIG" "${WINS[@]}" | python3 "$AB" judge "$R_BIG" 2>&1)"
run report "$R_BIG"
[ "$RC" -eq 0 ] && [ "$(sed -n 2p <<<"$OUT")" = "changed side: wins 101, losses 0, ties 0" ] && R=0 || R=1
check "verdicts land on their own pair past 99 pairs" "rc=$RC out=$OUT"

echo "test-ab: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
