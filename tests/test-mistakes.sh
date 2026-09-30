#!/usr/bin/env bash
# Tests for mistakes.sh. Each Stop case writes a transcript of one turn (the
# typed message, tool calls and their results), runs the Stop hook with that
# transcript and a final reply, and asserts the exit code, the stdout JSON
# (systemMessage, decision), and the records in detections/<sid>.jsonl.
# The clobber cases run the PreToolUse and PostToolUse hooks around a real
# file change, and the last cases run --replay over a two-turn transcript.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$DIR/../scripts/mistakes.sh"
PASS=0; FAIL=0
KATHARSIS_DATA="$(mktemp -d)"; export KATHARSIS_DATA
trap 'rm -rf "$KATHARSIS_DATA"' EXIT
T="$KATHARSIS_DATA/t"; mkdir -p "$T"
TMPDIR="$KATHARSIS_DATA/tmp"; export TMPDIR; mkdir -p "$TMPDIR"

# transcript <file> <spec-json>: spec is a list of [role, ...] steps:
#   ["user", text]  ["text", text]  ["call", id, tool, input, result, is_error]
transcript() {
  python3 - "$1" "$2" <<'PY'
import json, os, sys
out = open(sys.argv[1], 'w')
CWD = os.environ.get('TCWD', '/work')
TS = {'timestamp': '2026-09-30T12:00:00.123Z'}
for s in json.loads(sys.argv[2]):
    if s[0] == 'user':
        out.write(json.dumps({'type': 'user', 'cwd': CWD, **TS, 'message': {'role': 'user', 'content': s[1]}}) + '\n')
    elif s[0] == 'text':
        out.write(json.dumps({'type': 'assistant', 'cwd': CWD, **TS, 'message': {'content': [{'type': 'text', 'text': s[1]}]}}) + '\n')
    else:
        _, i, tool, inp, res, err = s
        out.write(json.dumps({'type': 'assistant', 'cwd': CWD, 'message': {'content': [{'type': 'tool_use', 'id': i, 'name': tool, 'input': inp}]}}) + '\n')
        out.write(json.dumps({'type': 'user', 'cwd': CWD, **TS, 'message': {'content': [{'type': 'tool_result', 'tool_use_id': i, 'content': res, 'is_error': err}]}}) + '\n')
PY
}

# run <sid> <transcript> <reply> [stop_hook_active]: sets OUT (stdout) and RC
run() {
  : > "$KATHARSIS_DATA/.active-$1"
  OUT="$(python3 -c 'import json,sys; print(json.dumps({"session_id": sys.argv[1], "transcript_path": sys.argv[2],
    "last_assistant_message": sys.argv[3], "stop_hook_active": sys.argv[4] == "true", "cwd": "/work"}))' \
    "$1" "$2" "$3" "${4:-false}" | "$HOOK" 2>/dev/null)"
  RC=$?
}

check() { # <condition> && R=0 || R=1; check <name> <detail>
  if [ "$R" -eq 0 ]; then PASS=$((PASS+1)); else echo "FAIL $1: $2"; FAIL=$((FAIL+1)); fi
}

field() { # field <json> <python expression over d>; the expressions are this file's own, never input
  python3 -c 'import json,sys; d=json.loads(sys.argv[1]) if sys.argv[1] else {}; print(eval(sys.argv[2]))' "$1" "$2"
}

records() { # records <sid>: the kind:certainty of every record, one per line
  local f="$KATHARSIS_DATA/detections/$1.jsonl"
  [ -f "$f" ] || return 0
  python3 -c 'import json,sys; [print(json.loads(l)["kind"]+":"+json.loads(l)["certainty"]) for l in open(sys.argv[1])]' "$f"
}

expect_notice() { # expect_notice <name> <sid> <records> <message substring>
  local got; got="$(records "$2" | tr '\n' ' ')"
  [ "$RC" -eq 0 ] && R=0 || R=1; check "$1 rc" "rc=$RC"
  [ "$got" = "$3" ] && R=0 || R=1; check "$1 records" "records '$got', want '$3'"
  grep -qF -- "$4" <<<"$(field "$OUT" 'd.get("systemMessage","")')" && R=0 || R=1; check "$1 notice" "out: $OUT"
}

expect_silent() { # expect_silent <name> <sid>
  [ "$RC" -eq 0 ] && R=0 || R=1; check "$1 rc" "rc=$RC"
  [ -z "$OUT" ] && R=0 || R=1; check "$1 stdout" "out: $OUT"
  [ -z "$(records "$2")" ] && R=0 || R=1; check "$1 records" "records: $(records "$2")"
}

FAILRUN='["call","t1","Bash",{"command":"python -m unittest 2>&1 | tail -3"},"Ran 4 tests in 0.01s\n\nFAILED (failures=1)",false]'
PASSRUN='["call","t2","Bash",{"command":"python -m unittest 2>&1 | tail -3"},"Ran 4 tests in 0.01s\n\nOK",false]'

# 1. Tests claimed after the last run failed: a high notice, no hold.
transcript "$T/a.jsonl" "[[\"user\",\"fix the parser\"],$FAILRUN]"
run a "$T/a.jsonl" "The parser is fixed and all tests pass."
expect_notice "failed run" a "tests-claim:high " "Katharsis check: the reply says the tests pass, but the last run"
[ "$(field "$OUT" 'd.get("decision")')" = None ] && R=0 || R=1; check "failed run no hold" "out: $OUT"
[ "$(python3 -c 'import json,sys; d=json.loads(open(sys.argv[1]).readline()); print(d["severity"], d["detector"], d["turn"], d["tool_use_id"], d["surfaced"])' "$KATHARSIS_DATA/detections/a.jsonl")" = "wrong-claim claim-diff@0.1 1 t1 ['system_notice']" ] && R=0 || R=1; check "failed run fields" "record: $(cat "$KATHARSIS_DATA/detections/a.jsonl")"

# 2. The same run, but the reply reports the failure: silent.
run b "$T/a.jsonl" "One test still fails; the other three pass."
expect_silent "failure disclosed" b

# 3. A pass claim with no test command in the session: medium.
transcript "$T/c.jsonl" '[["user","fix the parser"],["call","e1","Edit",{"file_path":"/work/parser.py"},"ok",false]]'
run c "$T/c.jsonl" "Fixed. The tests pass."
expect_notice "no run" c "tests-claim:medium " "no test command ran"

# 4. A passing run, then a code edit, then the claim: stale, medium.
transcript "$T/d.jsonl" "[[\"user\",\"fix the parser\"],$PASSRUN,[\"call\",\"e2\",\"Edit\",{\"file_path\":\"/work/parser.py\"},\"ok\",false]]"
run d "$T/d.jsonl" "Done, and the tests pass."
expect_notice "stale run" d "tests-claim:medium " "parser.py changed after the last run"

# 5. A passing run as the last word: silent. A doc edit after it does not count.
transcript "$T/e.jsonl" "[[\"user\",\"fix the parser\"],$PASSRUN,[\"call\",\"e3\",\"Edit\",{\"file_path\":\"/work/README.md\"},\"ok\",false]]"
run e "$T/e.jsonl" "Done, and the tests pass."
expect_silent "passing run" e

# 6. CI claimed green while gh pr checks shows a failure: high.
transcript "$T/f.jsonl" '[["user","is CI green?"],["call","g1","Bash",{"command":"gh pr checks 7"},"lint\tpass\ntest\tfail\nSome checks were not successful",false]]'
run f "$T/f.jsonl" "CI is green on PR 7."
expect_notice "ci red" f "ci-claim:high " "CI is green, but the last run"

# 7. A count taken with grep -I (skips binary files): medium.
transcript "$T/g.jsonl" '[["user","How many TODO markers are in src?"],["call","c1","Bash",{"command":"grep -rIoiw todo src | wc -l"},"22",false]]'
run g "$T/g.jsonl" "There are 22 TODO markers in src."
expect_notice "lossy count" g "count:medium " "grep -I skips binary files"

# 8. The same count from grep -rao: silent.
transcript "$T/h.jsonl" '[["user","How many TODO markers are in src?"],["call","c2","Bash",{"command":"grep -raoiw todo src | wc -l"},"24",false]]'
run h "$T/h.jsonl" "There are 24 TODO markers in src."
expect_silent "exact count" h

# 9. An exact count beside lossy ones in the same command, matching the reply: silent.
MIXED='["call","c3","Bash",{"command":"echo \"text: $(grep -rIoiw todo src | wc -l)\"; echo \"all: $(grep -raoiw todo src | wc -l)\""},"text: 22\nall: 24",false]'
transcript "$T/i.jsonl" "[[\"user\",\"How many TODO markers are in src?\"],$MIXED]"
run i "$T/i.jsonl" "There are 24 TODO markers in src."
expect_silent "exact count beside lossy" i

# 10. A lossy count, then an exact one with a different number, and the reply keeps the lossy one: medium.
transcript "$T/j.jsonl" '[["user","How many TODO markers are in src?"],["call","c4","Bash",{"command":"grep -rIoiw todo src | wc -l"},"22",false],["call","c5","Bash",{"command":"grep -raoiw todo src | wc -l"},"24",false]]'
run j "$T/j.jsonl" "There are 22 TODO markers in src."
expect_notice "lossy count beside exact" j "count:medium " "grep -I skips binary files"

# 11. A live clobber record from PostToolUse, reply silent about it: one hold.
transcript "$T/k.jsonl" '[["user","set the port"],["call","w1","Bash",{"command":"printf \"port=9\\n\" > config.ini"},"",false]]'
mkdir -p "$KATHARSIS_DATA/detections"
printf '%s\n' '{"kind":"clobber","severity":"data-loss","evidence":"config.ini existed and this session never read it; 12 lines are gone","detector":"clobber@0.1","certainty":"high","turn":1,"tool_use_id":"w1","surfaced":["system_notice"],"ts":"2026-09-30T00:00:00Z","target":"/work/config.ini","saved":"/d/clobbered/k/config.ini"}' > "$KATHARSIS_DATA/detections/k.jsonl"
run k "$T/k.jsonl" "The port is set to 9."
[ "$(field "$OUT" 'd.get("decision")')" = block ] && grep -qF '/d/clobbered/k/config.ini' <<<"$OUT" && R=0 || R=1; check "clobber hold" "out: $OUT"
[ "$RC" -eq 0 ] && R=0 || R=1; check "clobber hold rc" "rc=$RC"

# 12. The repair pass (stop_hook_active) never holds again.
run k "$T/k.jsonl" "The port is set to 9." true
[ -z "$OUT" ] && R=0 || R=1; check "clobber no second hold" "out: $OUT"

# 13. A reply that names the loss: no hold.
run k "$T/k.jsonl" "The port is set to 9. This replaced the existing config.ini; the earlier copy is saved." false
[ -z "$OUT" ] && R=0 || R=1; check "clobber disclosed" "out: $OUT"

# 14. Verified with nothing run after the last code edit: medium.
transcript "$T/l.jsonl" '[["user","fix the parser"],["call","v1","Edit",{"file_path":"/work/parser.py"},"ok",false]]'
run l "$T/l.jsonl" "I fixed the parser and verified the fix."
expect_notice "verify" l "verify-claim:medium " "nothing ran after it"

# 15. A second Stop over the same turn adds no duplicate record.
run a "$T/a.jsonl" "The parser is fixed and all tests pass."
[ "$(records a | wc -l)" -eq 1 ] && [ -z "$OUT" ] && R=0 || R=1; check "dedupe" "records: $(records a | tr '\n' ' ') out: $OUT"

# 16. Failsafes: no gate, malformed payload, missing transcript. All exit 0, silent.
OUT="$(printf '{"session_id":"nogate","transcript_path":"%s","last_assistant_message":"All tests pass."}' "$T/a.jsonl" | "$HOOK")"; RC=$?
expect_silent "no gate" nogate
OUT="$(printf 'not json' | "$HOOK")"; RC=$?
[ "$RC" -eq 0 ] && [ -z "$OUT" ] && R=0 || R=1; check "malformed" "rc=$RC out: $OUT"
run m "$T/missing.jsonl" "All tests pass."
expect_silent "missing transcript" m

# 18. A ticked shellcheck line in a PR body with no shellcheck run: medium.
PR='["call","p1","Bash",{"command":"gh pr create --title x --body \"## Checklist\n\n- [x] `shellcheck -S warning scripts/*.sh` is clean\n- [x] Docs updated\""},"https://github.com/o/r/pull/9",false]'
transcript "$T/n.jsonl" "[[\"user\",\"open the PR\"],$PR]"
run n "$T/n.jsonl" "PR #9 is open."
expect_notice "pr checklist" n "tests-claim:medium " "a ticked PR checklist line says the linter is clean, but no lint command ran"

# 19. Validation passed, then a Python heredoc rewrote an output style: stale.
VAL='["call","q1","Bash",{"command":"claude plugin validate --strict ."},"✔ Validation passed",false]'
PYED='["call","q2","Bash",{"command":"python3 - <<'"'"'EOF'"'"'\np='"'"'output-styles/katharsis.md'"'"'; s=open(p).read()\nopen(p, '"'"'w'"'"').write(s.replace('"'"'a'"'"', '"'"'b'"'"'))\nEOF"},"",false]'
transcript "$T/o.jsonl" "[[\"user\",\"tighten the style\"],$VAL,$PYED]"
run o "$T/o.jsonl" "Done. Strict validation passes."
expect_notice "validate stale" o "tests-claim:medium " "katharsis.md changed after the last run"

# 20. A docs site built, then a page under it edited: stale for the build, not the tests.
WEB='["call","s1","Bash",{"command":"cd website && bun run build"},"Build complete",false]'
PAGE='["call","s2","Edit",{"file_path":"/work/website/src/content/docs/how.md"},"ok",false]'
transcript "$T/s.jsonl" "[[\"user\",\"update the docs\"],$PASSRUN,$WEB,$PAGE]"
run s "$T/s.jsonl" "The tests pass and the website build passes."
expect_notice "site build stale" s "tests-claim:medium " "the build passes, but how.md changed"

# 21. A regression test shown failing without the fix does not count as disclosing a failed run.
run u "$T/a.jsonl" "I added a regression test and confirmed it fails without the fix. All tests pass."
expect_notice "proof is not disclosure" u "tests-claim:high " "the last run"

# 22. A claim about a PR's checks is a CI claim, not a local one.
transcript "$T/v.jsonl" '[["user","status?"],["call","g2","Bash",{"command":"gh pr checks 9"},"test\tpass\nlint\tpass\nAll checks were successful",false]]'
run v "$T/v.jsonl" "PR #9 is green: Test and ShellCheck both pass."
expect_silent "pr checks sentence" v

# --- The clobber check: PreToolUse copies, PostToolUse compares.

# tool <event> <sid> <id> <command> <cwd> <transcript> [extra-json]: sets OUT and RC
tool() {
  OUT="$(python3 -c 'import json,sys; d={"hook_event_name": sys.argv[1], "session_id": sys.argv[2], "tool_use_id": sys.argv[3],
    "tool_name": "Bash", "tool_input": {"command": sys.argv[4]}, "cwd": sys.argv[5], "transcript_path": sys.argv[6]}
d.update(json.loads(sys.argv[7])); print(json.dumps(d))' "$1" "$2" "$3" "$4" "$5" "$6" "${7:-{\}}" | timeout 10 "$HOOK" 2>/dev/null)"
  RC=$?
}

W="$KATHARSIS_DATA/w"; mkdir -p "$W/deploy"
ORIG=$'[cache]\nbackend = memcached\nhost = cache-a.internal\nmax_memory = 2gb\n\n[eviction]\npolicy = lru'
NEW=$'[cache]\nbackend = redis\nhost = cache.internal\nport = 6379\nttl = 300'
HDOC=$'mkdir -p deploy && cat > deploy/cache.ini <<\'EOF\'\n'"$NEW"$'\nEOF'

# 23. A heredoc replaces a file no call named: the old copy is saved, the user and the model are told.
printf '%s\n' "$ORIG" > "$W/deploy/cache.ini"
transcript "$T/w.jsonl" "[[\"user\",\"Create deploy/cache.ini\"],[\"call\",\"x1\",\"Bash\",$(python3 -c 'import json,sys; print(json.dumps({"command": sys.argv[1]}))' "$HDOC"),\"\",false]]"
tool PreToolUse w x1 "$HDOC" "$W" "$T/w.jsonl"
[ "$RC" -eq 0 ] && [ -z "$OUT" ] && R=0 || R=1; check "clobber pre silent" "rc=$RC out: $OUT"
[ -f "$TMPDIR/katharsis-$(id -u)/w/x1.0" ] && R=0 || R=1; check "clobber pre copy" "no pending copy"
printf '%s\n' "$NEW" > "$W/deploy/cache.ini"
tool PostToolUse w x1 "$HDOC" "$W" "$T/w.jsonl"
[ "$RC" -eq 0 ] && R=0 || R=1; check "clobber post rc" "rc=$RC"
SAVED="$(python3 -c 'import json,sys; print(json.loads(open(sys.argv[1]).readline())["saved"])' "$KATHARSIS_DATA/detections/w.jsonl" 2>/dev/null)"
[ "$(field "$OUT" 'd["systemMessage"]')" = "Katharsis: $W/deploy/cache.ini was replaced unread; 5 lines lost. Restore: cp $SAVED $W/deploy/cache.ini" ] && R=0 || R=1; check "clobber user line" "out: $OUT"
[ "$(field "$OUT" 'd["hookSpecificOutput"]["hookEventName"]')" = PostToolUse ] && R=0 || R=1; check "clobber event name" "out: $OUT"
[ "$(field "$OUT" 'd["hookSpecificOutput"]["additionalContext"]')" = "$W/deploy/cache.ini existed, this session never read it, and this command replaced it: 5 lines lost (backend = memcached | host = cache-a.internal | max_memory = 2gb | [eviction] | policy = lru). Say so in one sentence at the end of your reply, with the restore command: cp $SAVED $W/deploy/cache.ini" ] && R=0 || R=1; check "clobber model note" "out: $OUT"
[ "$(python3 -c 'import json,sys; d=json.loads(open(sys.argv[1]).readline()); print(d["kind"], d["severity"], d["certainty"], d["detector"], d["turn"], d["tool_use_id"], d["surfaced"])' "$KATHARSIS_DATA/detections/w.jsonl")" = "clobber data-loss high clobber@0.1 1 x1 ['system_notice']" ] && R=0 || R=1; check "clobber record" "record: $(cat "$KATHARSIS_DATA/detections/w.jsonl")"
[ "$(cat "$SAVED")" = "$ORIG" ] && [ "${SAVED#"$KATHARSIS_DATA/clobbered/w/"}" != "$SAVED" ] && R=0 || R=1; check "clobber saved copy" "saved: $SAVED"
[ -z "$(ls -A "$TMPDIR/katharsis-$(id -u)/w")" ] && R=0 || R=1; check "clobber pending cleared" "left: $(ls "$TMPDIR/katharsis-$(id -u)/w")"

# 24. The reply says nothing about it: one hold with the restore command; a reply that names it: none.
run w "$T/w.jsonl" "Created deploy/cache.ini with the heredoc above."
[ "$(field "$OUT" 'd.get("decision")')" = block ] && grep -qF "cp $SAVED" <<<"$OUT" && R=0 || R=1; check "clobber live hold" "out: $OUT"
run w "$T/w.jsonl" "Created it. This overwrote the existing cache.ini; restore it with the cp command above."
[ -z "$OUT" ] && R=0 || R=1; check "clobber live disclosed" "out: $OUT"

# 25. A file an earlier call read: no copy, no record.
printf '%s\n' "$ORIG" > "$W/deploy/cache.ini"
transcript "$T/y.jsonl" "[[\"user\",\"Create deploy/cache.ini\"],[\"call\",\"r1\",\"Read\",{\"file_path\":\"$W/deploy/cache.ini\"},\"...\",false]]"
tool PreToolUse y x2 "$HDOC" "$W" "$T/y.jsonl"
printf '%s\n' "$NEW" > "$W/deploy/cache.ini"
tool PostToolUse y x2 "$HDOC" "$W" "$T/y.jsonl"
[ "$RC" -eq 0 ] && [ -z "$OUT" ] && [ -z "$(records y)" ] && R=0 || R=1; check "clobber read first" "out: $OUT records: $(records y)"

# 26. A replacement that keeps every old line: no record, no saved copy.
printf '%s\n' "$ORIG" > "$W/deploy/cache.ini"
tool PreToolUse z x3 "$HDOC" "$W" "$T/missing.jsonl"
printf '%s\nport = 6379\n' "$ORIG" > "$W/deploy/cache.ini"
tool PostToolUse z x3 "$HDOC" "$W" "$T/missing.jsonl"
[ "$RC" -eq 0 ] && [ -z "$OUT" ] && [ -z "$(records z)" ] && [ ! -e "$KATHARSIS_DATA/clobbered/z" ] && R=0 || R=1; check "clobber nothing lost" "out: $OUT"

# 27. A literal cd moves the target; a failed call reports under its own event name.
printf '%s\n' "$ORIG" > "$W/deploy/cache.ini"
CDDOC=$'cd deploy && cat > cache.ini <<EOF\nport = 1\nEOF'
tool PreToolUse c2 x4 "$CDDOC" "$W" "$T/missing.jsonl"
printf 'port = 1\n' > "$W/deploy/cache.ini"
tool PostToolUseFailure c2 x4 "$CDDOC" "$W" "$T/missing.jsonl"
[ "$(field "$OUT" 'd["hookSpecificOutput"]["hookEventName"]')" = PostToolUseFailure ] && [ "$(records c2)" = "clobber:high" ] && R=0 || R=1; check "clobber cd and failure" "out: $OUT"

# 28. A subagent's call, a malformed payload, and an unknown tool_use_id: silent, exit 0.
printf '%s\n' "$ORIG" > "$W/deploy/cache.ini"
tool PreToolUse sa x5 "$HDOC" "$W" "$T/missing.jsonl" '{"agent_id": "a1"}'
printf 'x\n' > "$W/deploy/cache.ini"
tool PostToolUse sa x5 "$HDOC" "$W" "$T/missing.jsonl"
[ "$RC" -eq 0 ] && [ -z "$OUT" ] && [ -z "$(records sa)" ] && R=0 || R=1; check "clobber subagent" "out: $OUT"
OUT="$(printf '{"hook_event_name":"PreToolUse","session_id":"../x","tool_use_id":"x6","tool_name":"Bash","tool_input":"cat > f"}' | "$HOOK")"; RC=$?
[ "$RC" -eq 0 ] && [ -z "$OUT" ] && R=0 || R=1; check "clobber malformed" "rc=$RC out: $OUT"

# 29. Past the size limit of clobbered/, nothing is saved or deleted, and the lines say so.
KD="$KATHARSIS_DATA"; KATHARSIS_DATA="$KD/full"; mkdir -p "$KATHARSIS_DATA/clobbered/old"
truncate -s 64M "$KATHARSIS_DATA/clobbered/old/big"
printf '%s\n' "$ORIG" > "$W/deploy/cache.ini"
tool PreToolUse cap x7 "$HDOC" "$W" "$T/missing.jsonl"
printf '%s\n' "$NEW" > "$W/deploy/cache.ini"
tool PostToolUse cap x7 "$HDOC" "$W" "$T/missing.jsonl"
[ "$(field "$OUT" 'd["systemMessage"]')" = "Katharsis: $W/deploy/cache.ini was replaced unread; 5 lines lost. No copy was saved: clobbered/ is past its 64 MiB limit." ] && [ ! -e "$KATHARSIS_DATA/clobbered/cap" ] && [ -e "$KATHARSIS_DATA/clobbered/old/big" ] && R=0 || R=1; check "clobber cap" "out: $OUT"
KATHARSIS_DATA="$KD"

# 30. The target parser: compound headers, quoted separators, cd, and what it leaves out.
targets() { python3 -c 'import sys; sys.path.insert(0, sys.argv[1]); import mistakes; print(" ".join(mistakes.write_targets(sys.argv[2], "/w", "/h")))' "$DIR/../scripts" "$1"; }
while IFS= read -r line; do
  cmd="${line% =>*}"; want="${line#*=> }"; [ "$want" = "$line" ] && want=''
  got="$(targets "$(printf '%b' "$cmd")")"
  [ "$got" = "$want" ] && R=0 || R=1; check "targets $cmd" "got '$got', want '$want'"
done <<'CASES'
mkdir -p deploy && cat > deploy/cache.ini <<'END'\na > b\nEND => /w/deploy/cache.ini
mkdir -p deploy; cat <<'END' > deploy/cache.ini; echo done => /w/deploy/cache.ini
mkdir -p deploy && tee deploy/cache.ini <<'END' > /dev/null => /w/deploy/cache.ini
cat > 'cache;name.ini' <<'END' => /w/cache;name.ini
cp new.ini deploy/app.ini && mv a b => /w/deploy/app.ini /w/b
dd if=/dev/zero of=disk.img bs=1 => /w/disk.img
cd deploy && cat > cache.ini => /w/deploy/cache.ini
cat > ~/x.ini => /h/x.ini
ssh host; cat > c.ini => /w/c.ini
echo a >> log.txt; echo b | tee -a log2.txt =>
make 2> err.log > /dev/null =>
echo x > "$OUT"; cat > $(pwd)/f =>
cd $D && cat > cache.ini =>
ssh host 'cat > cache.ini' =>
tmux capture-pane -p | grep -q -E "a|>|b" =>
CASES

# --- Regressions from the first live runs and review.

# 31. A contraction negates: "CI isn't green" with a failed check is a report, not a claim.
transcript "$T/l1.jsonl" '[["user","is CI green?"],["call","c1","Bash",{"command":"gh pr checks 9"},"test (windows-latest)\tfail\nlint\tpass\nSome checks were not successful",false]]'
run l1 "$T/l1.jsonl" "No, CI isn't green. \`test (windows-latest)\` fails on the path test. The other 5 checks pass."
expect_silent "ci isn't green" l1

# 32. "I haven't verified the fix" is not a verified claim.
transcript "$T/hv.jsonl" '[["user","fix it"],["call","e1","Edit",{"file_path":"/work/a.py"},"ok",false]]'
run hv "$T/hv.jsonl" "I haven't verified the fix."
expect_silent "haven't verified" hv

# 33. A suite run as tests/*.sh or test-*.sh counts as a test run, passing or failing.
transcript "$T/ts.jsonl" '[["user","run them"],["call","s1","Bash",{"command":"bash tests/test-mistakes.sh"},"mistakes: 98 passed, 0 failed",false]]'
run ts "$T/ts.jsonl" "The tests pass."
expect_silent "tests/*.sh passing" ts
transcript "$T/tf.jsonl" '[["user","run them"],["call","s2","Bash",{"command":"./test-parser.sh"},"parser: 3 passed, 1 failed",false]]'
run tf "$T/tf.jsonl" "The tests pass."
expect_notice "test-*.sh failing" tf "tests-claim:high " "but the last run (\`./test-parser.sh\`) failed"
transcript "$T/tg.jsonl" '[["user","check them"],["call","s3","Bash",{"command":"grep -n PASS tests/test-a.sh tests/test-mistakes.sh"},"12:PASS=0",false]]'
run tg "$T/tg.jsonl" "The tests pass."
expect_notice "grep of a test script is not a run" tg "tests-claim:medium " "no test command ran"
# A runner behind a wrapper or name the script does not know still printed a result, so the claim is not judged.
transcript "$T/tw.jsonl" '[["user","run them"],["call","s4","Bash",{"command":"docker compose run app pytest"},"4 passed",false]]'
run tw "$T/tw.jsonl" "The tests pass."
expect_silent "unknown wrapper with a pass summary" tw
transcript "$T/tj.jsonl" '[["user","run them"],["call","s5","Bash",{"command":"just test"},"4 passed",false]]'
run tj "$T/tj.jsonl" "The tests pass."
expect_silent "unknown runner with a pass summary" tj

# 34. A shell write to a source file after the run makes the claim stale; a log it writes does not.
transcript "$T/bw.jsonl" "[[\"user\",\"fix it\"],$PASSRUN,[\"call\",\"b1\",\"Bash\",{\"command\":\"cat > src/parse.py <<'EOF'\\nx = 1\\nEOF\"},\"\",false]]"
run bw "$T/bw.jsonl" "The tests pass."
expect_notice "bash write stale" bw "tests-claim:medium " "parse.py changed after the last run"
transcript "$T/bl.jsonl" "[[\"user\",\"fix it\"],$PASSRUN,[\"call\",\"b2\",\"Bash\",{\"command\":\"make lint > lint.log 2>&1\"},\"\",false]]"
run bl "$T/bl.jsonl" "The tests pass."
expect_silent "bash log write" bl

# 35. A ticked line in a --body-file counts like one in --body.
printf '## Test plan\n\n- [x] shellcheck is clean\n' > "$T/body.md"; touch -d '2026-09-30T11:59:00Z' "$T/body.md"
TCWD="$T" transcript "$T/bf.jsonl" '[["user","open the PR"],["call","p1","Bash",{"command":"gh pr create --title x --body-file body.md"},"https://github.com/o/r/pull/9",false]]'
run bf "$T/bf.jsonl" "Opened the PR."
expect_notice "body-file checklist" bf "tests-claim:medium " "a ticked PR checklist line says the linter is clean, but no lint command ran"

# 36. rg is exact only with -uu, or --no-ignore with --hidden.
lossy() { python3 -c 'import sys; sys.path.insert(0, sys.argv[1]); import mistakes; print(mistakes.lossy(sys.argv[2], "Bash", {}))' "$DIR/../scripts" "$1"; }
while IFS= read -r line; do
  cmd="${line% =>*}"; want="${line#*=> }"; [ "$want" = "$line" ] && want=''
  got="$(lossy "$cmd")"
  [ "$got" = "$want" ] && R=0 || R=1; check "lossy $cmd" "got '$got', want '$want'"
done <<'CASES'
rg --hidden -o todo src | wc -l => rg skips gitignored files
rg -u -o todo src | wc -l => rg skips hidden files
rg --no-ignore -o todo src | wc -l => rg skips hidden files
rg -uu -o todo src | wc -l =>
rg -u -u -o todo src | wc -l =>
rg --no-ignore --hidden -o todo src | wc -l =>
rg -c --hidden -uu todo src => it counts matching lines, not matches
CASES

# 37. A large replaced file is compared in linear time.
python3 -c 'print("\n".join(f"n{i}" for i in range(35000)))' > "$W/big.txt"
tool PreToolUse lg x8 'cat > big.txt' "$W" "$T/missing.jsonl"
: > "$W/big.txt"
OUT="$(python3 -c 'import json,sys; print(json.dumps({"hook_event_name":"PostToolUse","session_id":"lg","tool_use_id":"x8","tool_name":"Bash","tool_input":{"command":"cat > big.txt"},"cwd":sys.argv[1],"transcript_path":"/nope"}))' "$W" | timeout 3 "$HOOK")"; RC=$?
[ "$RC" -eq 0 ] && grep -qF '35000 lines lost' <<<"$OUT" && R=0 || R=1; check "clobber large file" "rc=$RC"

# 38. Same-name files replaced in one call each get their own copy; 39. copies are 0600 in 0700 folders.
mkdir -p "$W/a" "$W/b" "$W/c"
for d in a b c; do printf 'old %s\nkeep\n' "$d" > "$W/$d/config.ini"; done
SAME='cp n a/config.ini && cp n b/config.ini && cp n c/config.ini'
tool PreToolUse same x9 "$SAME" "$W" "$T/missing.jsonl"
for d in a b c; do echo new > "$W/$d/config.ini"; done
tool PostToolUse same x9 "$SAME" "$W" "$T/missing.jsonl"
[ "$(cat "$KATHARSIS_DATA"/clobbered/same/* | grep -c '^old ')" = 3 ] && [ "$(cat "$KATHARSIS_DATA"/clobbered/same/* | sort | tr '\n' ' ')" = "keep keep keep old a old b old c " ] && R=0 || R=1; check "clobber same names" "saved: $(ls "$KATHARSIS_DATA/clobbered/same")"
[ "$(stat -c '%a' "$KATHARSIS_DATA/clobbered" "$KATHARSIS_DATA/clobbered/same" "$KATHARSIS_DATA"/clobbered/same/* | sort -u | tr '\n' ' ')" = "600 700 " ] && R=0 || R=1; check "clobber permissions" "modes: $(stat -c '%a %n' "$KATHARSIS_DATA"/clobbered/same/*)"

# 40. The hold takes the target from its own field, so a path with " existed" in it survives.
mkdir -p "$W/x existed"; printf 'a\nb\n' > "$W/x existed/f.ini"
XE='cat > "x existed/f.ini"'
transcript "$T/xe.jsonl" "[[\"user\",\"write f.ini\"],[\"call\",\"x10\",\"Bash\",{\"command\":\"cat > \\\"x existed/f.ini\\\"\"},\"\",false]]"
tool PreToolUse xe x10 "$XE" "$W" "$T/xe.jsonl"; echo z > "$W/x existed/f.ini"; tool PostToolUse xe x10 "$XE" "$W" "$T/xe.jsonl"
run xe "$T/xe.jsonl" "Wrote the file."
[ "$(field "$OUT" 'd.get("decision")')" = block ] && grep -qF "Katharsis: $W/x existed/f.ini was replaced unread." <<<"$(field "$OUT" 'd["reason"]')" && R=0 || R=1; check "clobber hold target field" "out: $OUT"

# 41. A FIFO left in the file's place is never opened for reading.
printf 'a\nb\n' > "$W/p.ini"
tool PreToolUse ff x11 'cat > p.ini' "$W" "$T/missing.jsonl"; rm "$W/p.ini"; mkfifo "$W/p.ini"
OUT="$(python3 -c 'import json,sys; print(json.dumps({"hook_event_name":"PostToolUse","session_id":"ff","tool_use_id":"x11","tool_name":"Bash","tool_input":{"command":"cat > p.ini"},"cwd":sys.argv[1],"transcript_path":"/nope"}))' "$W" | timeout 3 "$HOOK")"; RC=$?
[ "$RC" -eq 0 ] && [ -z "$OUT" ] && R=0 || R=1; check "clobber fifo" "rc=$RC out: $OUT"
rm -f "$W/p.ini"

# 42. link/../config.ini names the file beside the link's target, as the kernel resolves it.
mkdir -p "$W/real/sub"; ln -sfn "$W/real/sub" "$W/link"
[ "$(python3 -c 'import sys; sys.path.insert(0, sys.argv[1]); import mistakes; print(mistakes.write_targets("cat > link/../config.ini", sys.argv[2]))' "$DIR/../scripts" "$W")" = "['$W/real/config.ini']" ] && R=0 || R=1; check "targets through a symlink" "wrong target"

# 43. A reply that says the file was not there gets one notice, not a hold.
run w "$T/w.jsonl" "cache.ini did not exist beforehand. I created it."
[ "$(field "$OUT" 'd.get("decision")')" = None ] && grep -qF "Katharsis check: the reply says cache.ini was not there before, but this session replaced an existing $W/deploy/cache.ini without reading it. Restore: cp $SAVED" <<<"$OUT" && R=0 || R=1; check "clobber contrary claim" "out: $OUT"
run w "$T/w.jsonl" "cache.ini did not exist beforehand. I created it."
[ -z "$OUT" ] && R=0 || R=1; check "clobber contrary claim once" "out: $OUT"

# 44. The live recount: a word count that skipped a binary file, once, with where the difference is.
RC_DIR="$KATHARSIS_DATA/rc"; mkdir -p "$RC_DIR/src/db"
printf '# TODO: one\nx = 1  # todo: two; TODO three\nmastodon\n' > "$RC_DIR/src/main.py"
printf 'SEED\0\001v2\n# TODO: regenerate\n\0todo: trim\n' > "$RC_DIR/src/db/seed.dat"
ASK='How many TODO markers are there under src/? Count every occurrence in any case.'
TCWD="$RC_DIR" transcript "$T/rc.jsonl" "[[\"user\",\"$ASK\"],[\"call\",\"g1\",\"Bash\",{\"command\":\"echo \\\"whole-word: \$(grep -rowi 'todo' src | wc -l)\\\"\"},\"whole-word: 3\",false]]"
run rc "$T/rc.jsonl" "There are 3 TODO markers under src/."
expect_notice "recount binary" rc "count:high " "Katharsis check: the reply's count is 3, but a recount of every file finds 5. grep skipped 2 in src/db/seed.dat (binary)."
run rc2 "$T/rc.jsonl" "There are 5 TODO markers under src/."
expect_silent "recount agrees" rc2
OUT="$("$HOOK" --replay "$T/rc.jsonl")"
[ -z "$OUT" ] && R=0 || R=1; check "recount not in replay" "out: $OUT"
ln -s main.py "$RC_DIR/src/link.py"
run rc3 "$T/rc.jsonl" "There are 3 TODO markers under src/."
expect_silent "recount symlink" rc3
rm "$RC_DIR/src/link.py"; truncate -s 33M "$RC_DIR/src/huge.bin"
run rc4 "$T/rc.jsonl" "There are 3 TODO markers under src/."
expect_silent "recount byte bound" rc4

# --- Regressions from the second review.

UID_DIR="katharsis-$(id -u)"
evidence() { python3 -c 'import json,sys; print(json.loads(open(sys.argv[1]).readline())["evidence"])' "$KATHARSIS_DATA/detections/$1.jsonl" 2>/dev/null; }
modes() { stat -c '%a' "$@" | tr '\n' ' '; }
OLD_UMASK="$(umask)"

# 45. The detections folder and file are 0700 and 0600 under any umask, new or already there and looser, and
#     the record counts the lost lines and names the saved copy without quoting them.
KD="$KATHARSIS_DATA"; KATHARSIS_DATA="$KD/fresh"; mkdir -p "$KATHARSIS_DATA"
printf 'password=SENTINEL\n' > "$W/secret.ini"
umask 000
tool PreToolUse pm x12 'cat > secret.ini' "$W" "$T/missing.jsonl"; echo new > "$W/secret.ini"
tool PostToolUse pm x12 'cat > secret.ini' "$W" "$T/missing.jsonl"
umask "$OLD_UMASK"
[ "$(modes "$KATHARSIS_DATA/detections" "$KATHARSIS_DATA/detections/pm.jsonl")" = "700 600 " ] && R=0 || R=1; check "detections modes, umask 000" "modes: $(modes "$KATHARSIS_DATA/detections" "$KATHARSIS_DATA/detections/pm.jsonl")"
SAVED2="$(python3 -c 'import json,sys; print(json.loads(open(sys.argv[1]).readline())["saved"])' "$KATHARSIS_DATA/detections/pm.jsonl" 2>/dev/null)"
[ "$(evidence pm)" = "$W/secret.ini existed and this session never read it; the command replaced it and 1 line is gone. Earlier copy: $SAVED2" ] && R=0 || R=1; check "clobber evidence" "evidence: $(evidence pm)"
grep -q SENTINEL "$KATHARSIS_DATA/detections/pm.jsonl" && R=1 || R=0; check "clobber evidence quotes nothing" "record: $(cat "$KATHARSIS_DATA/detections/pm.jsonl")"
[ "$(cat "$SAVED2")" = "password=SENTINEL" ] && R=0 || R=1; check "clobber evidence saved copy" "saved: $SAVED2"
KATHARSIS_DATA="$KD"
chmod 755 "$KATHARSIS_DATA/detections"; : > "$KATHARSIS_DATA/detections/pm2.jsonl"; chmod 644 "$KATHARSIS_DATA/detections/pm2.jsonl"
run pm2 "$T/a.jsonl" "The parser is fixed and all tests pass."
[ "$(records pm2)" = "tests-claim:high" ] && [ "$(modes "$KATHARSIS_DATA/detections" "$KATHARSIS_DATA/detections/pm2.jsonl")" = "700 600 " ] && R=0 || R=1; check "detections modes tightened by Stop" "modes: $(modes "$KATHARSIS_DATA/detections" "$KATHARSIS_DATA/detections/pm2.jsonl")"

# 46. The temp parent and the session folder are 0700 under umask 000. A session folder anyone else can open,
#     a parent that is a symlink, and a parent with group access all stop the hook cold.
TMP1="$TMPDIR"; TMPDIR="$KATHARSIS_DATA/tmp2"; mkdir -p "$TMPDIR"
printf 'a\nb\n' > "$W/sw.ini"
umask 000
tool PreToolUse sw x13 'cat > sw.ini' "$W" "$T/missing.jsonl"
umask "$OLD_UMASK"
[ "$(modes "$TMPDIR/$UID_DIR" "$TMPDIR/$UID_DIR/sw")" = "700 700 " ] && [ -f "$TMPDIR/$UID_DIR/sw/x13.0" ] && R=0 || R=1; check "temp folders 0700, umask 000" "modes: $(modes "$TMPDIR/$UID_DIR" "$TMPDIR/$UID_DIR/sw")"
chmod 755 "$TMPDIR/$UID_DIR/sw"; echo z > "$W/sw.ini"
tool PostToolUse sw x13 'cat > sw.ini' "$W" "$T/missing.jsonl"
[ "$RC" -eq 0 ] && [ -z "$OUT" ] && [ -z "$(records sw)" ] && R=0 || R=1; check "open session folder ignored" "rc=$RC out: $OUT"
chmod 700 "$TMPDIR/$UID_DIR/sw"; chmod 750 "$TMPDIR/$UID_DIR"
tool PostToolUse sw x13 'cat > sw.ini' "$W" "$T/missing.jsonl"
[ "$RC" -eq 0 ] && [ -z "$OUT" ] && [ -z "$(records sw)" ] && R=0 || R=1; check "open temp parent ignored" "rc=$RC out: $OUT"
TMPDIR="$KATHARSIS_DATA/tmp3"; mkdir -p "$TMPDIR" "$KATHARSIS_DATA/elsewhere"; ln -s "$KATHARSIS_DATA/elsewhere" "$TMPDIR/$UID_DIR"
printf 'a\nb\n' > "$W/sw.ini"
tool PreToolUse sw2 x14 'cat > sw.ini' "$W" "$T/missing.jsonl"
[ "$RC" -eq 0 ] && [ -z "$OUT" ] && [ -z "$(ls -A "$KATHARSIS_DATA/elsewhere")" ] && R=0 || R=1; check "symlinked temp parent ignored" "rc=$RC left: $(ls -A "$KATHARSIS_DATA/elsewhere")"
TMPDIR="$TMP1"

# 47. A FIFO or a symlink in place of the saved copy, and a FIFO in place of the index, are never opened.
SECRET="$KATHARSIS_DATA/unrelated"; printf 'private=UNRELATED\n' > "$SECRET"
for kind in fifo link index; do
  printf 'a\nb\n' > "$W/sn.ini"
  tool PreToolUse "sn-$kind" x15 'cat > sn.ini' "$W" "$T/missing.jsonl"
  P="$TMPDIR/$UID_DIR/sn-$kind"
  case "$kind" in
    fifo) rm "$P/x15.0"; mkfifo "$P/x15.0" ;;
    link) rm "$P/x15.0"; ln -s "$SECRET" "$P/x15.0" ;;
    index) rm "$P/x15.json"; mkfifo "$P/x15.json" ;;
  esac
  echo z > "$W/sn.ini"
  tool PostToolUse "sn-$kind" x15 'cat > sn.ini' "$W" "$T/missing.jsonl"
  [ "$RC" -eq 0 ] && [ -z "$OUT" ] && [ -z "$(records "sn-$kind")" ] && R=0 || R=1; check "snapshot $kind" "rc=$RC out: $OUT"
done

# 48. A detections file that is a symlink is never written through, by PostToolUse or by Stop.
VICTIM="$KATHARSIS_DATA/victim"; echo 'keep this file' > "$VICTIM"
ln -s "$VICTIM" "$KATHARSIS_DATA/detections/ll.jsonl"; ln -s "$VICTIM" "$KATHARSIS_DATA/detections/ll2.jsonl"
printf 'a\nb\n' > "$W/ll.ini"
tool PreToolUse ll x16 'cat > ll.ini' "$W" "$T/missing.jsonl"; echo z > "$W/ll.ini"
tool PostToolUse ll x16 'cat > ll.ini' "$W" "$T/missing.jsonl"
[ "$RC" -eq 0 ] && [ "$(cat "$VICTIM")" = 'keep this file' ] && grep -qF "Katharsis: $W/ll.ini was replaced unread; 2 lines lost. Restore: cp " <<<"$(field "$OUT" 'd["systemMessage"]')" && R=0 || R=1; check "log symlink, PostToolUse" "rc=$RC victim: $(cat "$VICTIM") out: $OUT"
run ll2 "$T/a.jsonl" "The parser is fixed and all tests pass."
[ "$RC" -eq 0 ] && [ -z "$OUT" ] && [ "$(cat "$VICTIM")" = 'keep this file' ] && R=0 || R=1; check "log symlink, Stop" "rc=$RC victim: $(cat "$VICTIM") out: $OUT"
rm "$KATHARSIS_DATA/detections/ll.jsonl" "$KATHARSIS_DATA/detections/ll2.jsonl"

# 49. A replacement too large to read whole is not compared: the old line may be past the part read.
printf 'original line\n' > "$W/tr.ini"
tool PreToolUse tr x17 'cat > tr.ini' "$W" "$T/missing.jsonl"
python3 -c 'import sys; open(sys.argv[1], "wb").write(b"x\n" * (1024 * 1024 // 2) + b"original line\n")' "$W/tr.ini"
tool PostToolUse tr x17 'cat > tr.ini' "$W" "$T/missing.jsonl"
[ "$RC" -eq 0 ] && [ -z "$OUT" ] && [ -z "$(records tr)" ] && R=0 || R=1; check "clobber large replacement" "rc=$RC out: $OUT"

# 50. A runner named as an argument is not a run, for any runner.
transcript "$T/cp.jsonl" '[["user","fix it"],["call","t1","Bash",{"command":"pytest"},"4 passed",false],["call","g1","Bash",{"command":"rg -n pytest missing.txt"},"missing.txt: No such file or directory",true]]'
run cp "$T/cp.jsonl" "The tests pass."
expect_silent "runner as an argument" cp
transcript "$T/cp2.jsonl" '[["user","fix it"],["call","g1","Bash",{"command":"grep -rn shellcheck .github | head; cat package.json | grep -n \"npm run build\""},"ci.yml:9: run: shellcheck",false]]'
run cp2 "$T/cp2.jsonl" "Shellcheck is clean and the build passes."
expect_notice "runner as an argument, no run" cp2 "tests-claim:medium tests-claim:medium " "no lint command ran"
transcript "$T/cp3.jsonl" '[["user","fix it"],["call","t1","Bash",{"command":"cd api && FORCE_COLOR=0 timeout 60 npx jest 2>&1 | tail -5; git ls-files \"*.sh\" | xargs shellcheck -S warning"},"Tests: 1 failed, 3 passed",false]]'
run cp3 "$T/cp3.jsonl" "The tests pass and shellcheck is clean."
expect_notice "runner behind wrappers" cp3 "tests-claim:high tests-claim:high " "the reply says the tests pass, but the last run"

# 51. A failed compound command counts against the tests only when they are its last step or show a failure.
transcript "$T/cr.jsonl" '[["user","fix it"],["call","t1","Bash",{"command":"pytest && shellcheck scripts/a.sh"},"Exit code 1\n4 passed\nSC2086: Double quote to prevent globbing.",true]]'
run cr "$T/cr.jsonl" "The tests pass; the linter needs a fix."
expect_silent "later step failed" cr
transcript "$T/cr2.jsonl" '[["user","fix it"],["call","t1","Bash",{"command":"shellcheck scripts/a.sh && pytest"},"Exit code 1\ncollected 4 items",true]]'
run cr2 "$T/cr2.jsonl" "The tests pass."
expect_notice "last step failed" cr2 "tests-claim:high " "but the last run (\`shellcheck scripts/a.sh && pytest\`) failed"

# 52. Two test commands with different results: a claim about one of them says nothing, a claim about all speaks.
transcript "$T/sc.jsonl" '[["user","fix it"],["call","w","Bash",{"command":"npm test --workspace web"},"4 passed",false],["call","a","Bash",{"command":"npm test --workspace api"},"1 failed",true]]'
run sc "$T/sc.jsonl" "The web tests pass."
expect_silent "qualified claim" sc
run sc2 "$T/sc.jsonl" "All tests pass."
expect_notice "unqualified claim" sc2 "tests-claim:high " "but the last run (\`npm test --workspace api\`) failed"
run sc3 "$T/sc.jsonl" "Done; the tests pass."
expect_notice "unqualified claim, the tests" sc3 "tests-claim:high " "but the last run (\`npm test --workspace api\`) failed"

# 53. Only a first-person or agentless past "verified" is a claim.
transcript "$T/nv.jsonl" '[["user","fix it"],["call","e1","Edit",{"file_path":"/work/a.py"},"ok",false]]'
N=0
while IFS= read -r reply; do
  N=$((N+1)); run "nv$N" "$T/nv.jsonl" "$reply"
  expect_silent "not a verify claim: $reply" "nv$N"
done <<'CASES'
I never verified the fix.
I have not yet verified the fix.
Merge once you have verified the fix.
The change should be verified before release.
The fix is still to be verified.
It needs verifying.
Please confirm you tested the fix.
If you verified the fix, merge it.
The reviewer verified the fix last week.
CASES
for reply in "Verified the fix." "I've also verified the fix." "We fixed it, then tested the fix."; do
  N=$((N+1)); run "nv$N" "$T/nv.jsonl" "$reply"
  expect_notice "verify claim: $reply" "nv$N" "verify-claim:medium " "nothing ran after it"
done

# 54. A ticked line that shows a check failing is not a pass claim.
transcript "$T/cf.jsonl" '[["user","open the PR"],["call","t","Bash",{"command":"pytest"},"1 failed",true],["call","p","Bash",{"command":"gh pr create --title x --body \"## Test plan\n\n- [x] Confirm pytest fails without the fix\n- [x] Reproduce the red pytest run\n\""},"https://github.com/o/r/pull/1",false]]'
run cf "$T/cf.jsonl" "Opened the PR."
expect_silent "ticked failure line" cf
transcript "$T/cf2.jsonl" '[["user","open the PR"],["call","t","Bash",{"command":"pytest"},"1 failed",true],["call","p","Bash",{"command":"gh pr create --title x --body \"## Test plan\n\n- [x] pytest passes\n\""},"https://github.com/o/r/pull/1",false]]'
run cf2 "$T/cf2.jsonl" "Opened the PR."
expect_notice "ticked pass line" cf2 "tests-claim:high " "a ticked PR checklist line says the tests pass, but the last run (\`pytest\`) failed"

# 55. A body file changed after the call published it is not read, and the replay reads no body file.
cp -p "$T/body.md" "$T/body2.md"; touch -d '2026-09-30T12:00:01Z' "$T/body2.md"
TCWD="$T" transcript "$T/bf2.jsonl" '[["user","open the PR"],["call","p1","Bash",{"command":"gh pr create --title x --body-file body2.md"},"https://github.com/o/r/pull/9",false]]'
run bf2 "$T/bf2.jsonl" "Opened the PR."
expect_silent "body file changed later" bf2
printf '%s\n' '{"type":"assistant","cwd":"'"$T"'","timestamp":"2026-09-30T12:00:02.000Z","message":{"content":[{"type":"text","text":"Opened the PR."}]}}' >> "$T/bf.jsonl"
OUT="$("$HOOK" --replay "$T/bf.jsonl")"; RC=$?
[ "$RC" -eq 0 ] && [ -z "$OUT" ] && R=0 || R=1; check "replay reads no body file" "rc=$RC out: $OUT"

# 56. A file read through a symlink counts as read, whichever name the write uses.
printf 'original\n' > "$W/real.ini"; ln -s real.ini "$W/alias.ini"
transcript "$T/sl.jsonl" "[[\"user\",\"set it\"],[\"call\",\"r1\",\"Read\",{\"file_path\":\"$W/alias.ini\"},\"...\",false]]"
for cmd in 'cat > alias.ini' 'cat > real.ini'; do
  tool PreToolUse sl x18 "$cmd" "$W" "$T/sl.jsonl"
  [ "$RC" -eq 0 ] && [ ! -e "$TMPDIR/$UID_DIR/sl/x18.0" ] && R=0 || R=1; check "read through a symlink: $cmd" "rc=$RC a copy was taken"
done
TCWD="$W" transcript "$T/sl2.jsonl" '[["user","set it"],["call","r1","Bash",{"command":"cat alias.ini"},"original",false]]'
tool PreToolUse sl2 x19 'cat > real.ini' "$W" "$T/sl2.jsonl"
[ "$RC" -eq 0 ] && [ ! -e "$TMPDIR/$UID_DIR/sl2/x19.0" ] && R=0 || R=1; check "cat through a symlink" "rc=$RC a copy was taken"

# 57. The file named in one sentence and its earlier existence denied in another: a notice, not a hold.
for reply in "Created cache.ini. It didn't exist beforehand." "I created the config from scratch. It lives at deploy/cache.ini."; do
  N=$((N+1)); printf 'old\n' > "$W/cache.ini"
  transcript "$T/pn$N.jsonl" '[["user","write cache.ini"],["call","x20","Bash",{"command":"cat > cache.ini"},"",false]]'
  tool PreToolUse "pn$N" x20 'cat > cache.ini' "$W" "$T/pn$N.jsonl"; echo new > "$W/cache.ini"; tool PostToolUse "pn$N" x20 'cat > cache.ini' "$W" "$T/pn$N.jsonl"
  run "pn$N" "$T/pn$N.jsonl" "$reply"
  [ "$RC" -eq 0 ] && [ "$(field "$OUT" 'd.get("decision")')" = None ] && grep -qF "Katharsis check: the reply says cache.ini was not there before, but this session replaced an existing $W/cache.ini without reading it. Restore: cp " <<<"$(field "$OUT" 'd.get("systemMessage","")')" && R=0 || R=1; check "denial in another sentence: $reply" "rc=$RC out: $OUT"
done

# 58. The user asked for lines, so a line count is the right unit.
transcript "$T/lc.jsonl" '[["user","How many lines contain TODO?"],["call","c","Bash",{"command":"grep -c TODO src/a.py"},"2",false]]'
run lc "$T/lc.jsonl" "There are 2 lines containing TODO."
expect_silent "lines asked for" lc
transcript "$T/lc2.jsonl" '[["user","How many TODO markers are in src/a.py?"],["call","c","Bash",{"command":"grep -c TODO src/a.py"},"2",false]]'
run lc2 "$T/lc2.jsonl" "There are 2 TODO markers."
expect_notice "matches asked for" lc2 "count:medium " "it counts matching lines, not matches"

# 58b. An ask for matches that mentions "one line" still wants matches, so a lone `grep -l | wc -l` beside the
#      counting pipelines cannot clear the command as an exact line count.
transcript "$T/lc3.jsonl" '[["user","How many TODO markers are there under src/? Count every occurrence of the word TODO in any case, including when there are several on one line."],["call","c","Bash",{"command":"echo \"whole word: $(grep -rIoiw todo src | wc -l)\"; grep -rli todo src | wc -l"},"whole word: 22\n8",false]]'
run lc3 "$T/lc3.jsonl" "There are 22 occurrences of the word TODO under src/."
expect_notice "one line in a matches ask" lc3 "count:medium " "grep -I skips binary files"

# 59. An rg word count is recounted like grep's: the hidden file named, an agreeing recount silent, and a
#     recount that cannot run left to the line about what rg skips.
RG_DIR="$KATHARSIS_DATA/rg"; mkdir -p "$RG_DIR/src" "$RG_DIR/one"
printf 'TODO a\n' > "$RG_DIR/src/a"; printf 'TODO b\n' > "$RG_DIR/src/.hidden"; printf 'TODO a\n' > "$RG_DIR/one/a"
TCWD="$RG_DIR" transcript "$T/rg.jsonl" '[["user","How many TODO markers are under src?"],["call","g1","Bash",{"command":"rg -o TODO src | wc -l"},"1",false]]'
run rg1 "$T/rg.jsonl" "There is 1 TODO marker under src."
expect_notice "rg recount hidden" rg1 "count:high " "Katharsis check: the reply's count is 1, but a recount of every file finds 2. rg skipped 1 in src/.hidden (hidden)."
TCWD="$RG_DIR" transcript "$T/rg2.jsonl" '[["user","How many TODO markers are under one?"],["call","g1","Bash",{"command":"rg -o TODO one | wc -l"},"1",false]]'
run rg2 "$T/rg2.jsonl" "There is 1 TODO marker under one."
expect_silent "rg recount agrees" rg2
ln -s a "$RG_DIR/one/link"
run rg3 "$T/rg2.jsonl" "There is 1 TODO marker under one."
expect_notice "rg recount cannot run" rg3 "count:medium " "Katharsis check: the reply's count 1 came from a command where rg skips hidden and gitignored files."

# 60. A file the same command first moves or copies elsewhere keeps its content there: no copy, no record.
for cmd in 'mv old.ini archive.ini && printf new > old.ini' 'cp old.ini /tmp/old.bak; printf new > old.ini'; do
  printf 'preserved line\n' > "$W/old.ini"; rm -f "$W/archive.ini"
  tool PreToolUse mv x21 "$cmd" "$W" "$T/missing.jsonl"; printf new > "$W/old.ini"; tool PostToolUse mv x21 "$cmd" "$W" "$T/missing.jsonl"
  [ "$RC" -eq 0 ] && [ -z "$OUT" ] && [ -z "$(records mv)" ] && R=0 || R=1; check "carried elsewhere first: $cmd" "rc=$RC out: $OUT"
done
printf 'preserved line\n' > "$W/old.ini"
tool PreToolUse mv2 x22 'printf new > old.ini && cp old.ini copy.ini' "$W" "$T/missing.jsonl"; printf new > "$W/old.ini"; tool PostToolUse mv2 x22 'printf new > old.ini && cp old.ini copy.ini' "$W" "$T/missing.jsonl"
[ "$(records mv2)" = "clobber:high" ] && R=0 || R=1; check "copied only after the write" "records: $(records mv2)"

# 17. Replay: a two-turn transcript, a wrong claim in turn 2 only.
transcript "$T/r.jsonl" "[[\"user\",\"run the tests\"],$PASSRUN,[\"text\",\"All 4 tests pass.\"],[\"user\",\"now fix the parser\"],$FAILRUN,[\"text\",\"Fixed; the tests pass.\"]]"
OUT="$("$HOOK" --replay "$T/r.jsonl")"; RC=$?
[ "$RC" -eq 0 ] && R=0 || R=1; check "replay rc" "rc=$RC"
[ "$(python3 -c 'import json,sys; [print(d["kind"], d["certainty"], d["turn"], d["tool_use_id"], d["session"]) for d in map(json.loads, sys.stdin)]' <<<"$OUT")" = "tests-claim high 2 t1 r" ] && R=0 || R=1; check "replay records" "out: $OUT"
[ "$(python3 -c 'import json,sys; print(json.loads(sys.stdin.readline())["ts"])' <<<"$OUT")" = "2026-09-30T12:00:00Z" ] && R=0 || R=1; check "replay ts from transcript" "out: $OUT"
[ ! -e "$KATHARSIS_DATA/detections/r.jsonl" ] && R=0 || R=1; check "replay writes nothing" "replay wrote a detections file"

echo "mistakes: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
