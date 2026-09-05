#!/usr/bin/env bash
# Tests for stop-classify.sh. The data path hangs off $HOME, so every case runs
# with HOME pointed at a sandbox and this turn's real stamp stays untouched.
# Asserts the active-session gate, the miss being counted rather than blocked,
# the pass, the stamp being consumed, per-session keying, and the failsafes.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
GATE="$DIR/../scripts/stop-classify.sh"
PASS=0; FAIL=0
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT
LAB="$SANDBOX/.claude/katharsis-data"
mkdir -p "$LAB"

run() { OUT="$(printf '%s' "$1" | HOME="$SANDBOX" "$GATE" 2>&1)"; RC=$?; }

check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else
    echo "FAIL $1: got [$2] want [$3]"; FAIL=$((FAIL+1)); fi }

contains() { case "$OUT" in *"$2"*) PASS=$((PASS+1));; *)
    echo "FAIL $1: [$OUT] lacks [$2]"; FAIL=$((FAIL+1));; esac }

stamp() { printf '2026-09-02T00:00:00Z\tapproval\t\n' > "$LAB/.exchange-state${1:+-$1}"; }

PAY='{"hook_event_name":"Stop","session_id":"sess-a","stop_hook_active":false,"cwd":"/w/repo","last_assistant_message":"one two three"}'
MISSES="$LAB/telemetry/gate-misses.jsonl"
misses() { [ -f "$MISSES" ] && wc -l < "$MISSES" || echo 0; }

# 0. no active marker for the session: Katharsis is not the style here, so the
# gate exits silently, counts nothing, and leaves any stamp alone
stamp sess-a
run "$PAY"
check "inactive rc" "$RC" "0"
check "inactive silent" "$OUT" ""
check "inactive counts nothing" "$(misses)" "0"
if [ -e "$LAB/.exchange-state-sess-a" ]; then PASS=$((PASS+1)); else
  echo "FAIL inactive session consumed the stamp"; FAIL=$((FAIL+1)); fi
rm -f "$LAB/.exchange-state-sess-a"
: > "$LAB/.active-sess-a"   # turn-reminder.sh writes this when Katharsis is active

# 1. no stamp: silent pass, and one telemetry line naming the session
run "$PAY"
check "unclassified rc" "$RC" "0"
check "unclassified silent" "$OUT" ""
check "miss counted" "$(misses)" "1"
OUT="$(cat "$MISSES")"
contains "miss names session" '"session_id": "sess-a"'
contains "miss names project" '"project": "w-repo"'
contains "miss counts reply words" '"reply_words": 3'
contains "miss trigger unknown without transcript" '"trigger": "unknown"'

# 2. a stamp for this session: pass silently, nothing counted, stamp spent
stamp sess-a
run "$PAY"
check "classified rc" "$RC" "0"
check "classified silent" "$OUT" ""
check "classified not counted" "$(misses)" "1"
if [ ! -e "$LAB/.exchange-state-sess-a" ]; then PASS=$((PASS+1)); else
  echo "FAIL stamp not consumed"; FAIL=$((FAIL+1)); fi

# 3. the same stamp does not satisfy the next turn
run "$PAY"
check "stamp is one turn only" "$(misses)" "2"

# 4. another session's stamp neither satisfies nor is consumed
stamp sess-b
run "$PAY"
check "other session does not satisfy" "$(misses)" "3"
if [ -e "$LAB/.exchange-state-sess-b" ]; then PASS=$((PASS+1)); else
  echo "FAIL consumed another session's stamp"; FAIL=$((FAIL+1)); fi

# 5. the unkeyed fallback, for a shell with no CLAUDE_CODE_SESSION_ID
stamp ""
run "$PAY"
check "unkeyed stamp satisfies" "$(misses)" "3"

# 6. the trigger kind comes from the transcript's last typed-or-not user turn
TR="$SANDBOX/transcript.jsonl"
printf '%s\n' '{"type":"user","message":{"content":[{"type":"text","text":"<bash-input>kref</bash-input>"}]}}' \
  '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{}}]}}' \
  '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"x"}]}}' \
  '{"type":"assistant","message":{"content":[{"type":"text","text":"done"}]}}' > "$TR"
run "{\"hook_event_name\":\"Stop\",\"session_id\":\"sess-a\",\"transcript_path\":\"$TR\",\"last_assistant_message\":\"done\"}"
OUT="$(tail -1 "$MISSES")"
contains "trigger from transcript" '"trigger": "bash-input"'
contains "tool calls counted" '"tool_calls": 1'

# 6a. a typed miss carries status missed and no type
OUT="$(head -1 "$MISSES")"
contains "typed miss is missed" '"status": "missed"'
case "$OUT" in *'"type"'*) echo "FAIL typed miss carries a type"; FAIL=$((FAIL+1));; *) PASS=$((PASS+1));; esac

# 6b. a bash-mode turn inherits the last typed type instead of counting a miss;
#     the transcript's last user line is the <bash-stdout>, as the harness writes it
printf '2026-09-02T00:00:00Z\tdiagnosis\t\n' > "$LAB/.exchange-last-sess-a"
printf '%s\n' '{"type":"user","message":{"content":[{"type":"text","text":"<bash-input>kref F</bash-input>"}]}}' \
  '{"type":"user","message":{"content":"<bash-stdout>## Findings</bash-stdout><bash-stderr></bash-stderr>"}}' \
  '{"type":"assistant","message":{"content":[{"type":"text","text":""}]}}' > "$TR"
run "{\"hook_event_name\":\"Stop\",\"session_id\":\"sess-a\",\"transcript_path\":\"$TR\",\"last_assistant_message\":\"\"}"
check "bash turn rc" "$RC" "0"
OUT="$(tail -1 "$MISSES")"
contains "bash-stdout line names the kind" '"trigger": "bash-input"'
contains "bash turn is inherited" '"status": "inherited"'
contains "bash turn inherits the last typed type" '"type": "diagnosis"'
contains "empty reply counted as zero words" '"reply_words": 0'

# 6d. the harness's empty-reply retry line is not the trigger: the walk skips
# it and still finds the bash input behind it
printf '2026-09-02T00:00:00Z\tdiagnosis\t\n' > "$LAB/.exchange-last-sess-a"
printf '%s\n' '{"type":"user","message":{"content":[{"type":"text","text":"<bash-input>kref F</bash-input>"}]}}' \
  '{"type":"user","message":{"content":"<bash-stdout>## Findings</bash-stdout><bash-stderr></bash-stderr>"}}' \
  '{"type":"assistant","message":{"content":[{"type":"text","text":""}]}}' \
  '{"type":"user","message":{"content":[{"type":"text","text":"[Your previous response had no visible output. Please continue and produce a user-visible response.]"}]}}' \
  '{"type":"assistant","message":{"content":[{"type":"text","text":"Logged."}]}}' > "$TR"
run "{\"hook_event_name\":\"Stop\",\"session_id\":\"sess-a\",\"transcript_path\":\"$TR\",\"last_assistant_message\":\"Logged.\"}"
OUT="$(tail -1 "$MISSES")"
contains "retry line skipped, bash trigger found" '"trigger": "bash-input"'
contains "retry turn is inherited" '"status": "inherited"'

# 6c. a bash turn with nothing to inherit falls to the untyped default
rm -f "$LAB/.exchange-last-sess-a"
run "{\"hook_event_name\":\"Stop\",\"session_id\":\"sess-a\",\"transcript_path\":\"$TR\",\"last_assistant_message\":\"\"}"
OUT="$(tail -1 "$MISSES")"
contains "bash turn without a last type" '"type": "status-and-resume"'
contains "bash turn without a last type is still inherited" '"status": "inherited"'

# 6d. another session's .exchange-last is not this session's to inherit
printf '2026-09-02T00:00:00Z\tredirect\t\n' > "$LAB/.exchange-last-sess-b"
run "{\"hook_event_name\":\"Stop\",\"session_id\":\"sess-a\",\"transcript_path\":\"$TR\",\"last_assistant_message\":\"\"}"
OUT="$(tail -1 "$MISSES")"
contains "other session's last type ignored" '"type": "status-and-resume"'
rm -f "$LAB/.exchange-last-sess-b"

# 7. failsafe: a malformed payload is silent and exits 0
run 'not json'
check "malformed rc" "$RC" "0"
check "malformed silent" "$OUT" ""

# 8. a payload with no session id still exits 0
run '{"hook_event_name":"Stop"}'
check "no session id rc" "$RC" "0"

# 9. a stamp older than the reap age goes, whoever it belonged to
stamp sess-c
python3 -c 'import os,sys,time; t=time.time()-7*3600; os.utime(sys.argv[1],(t,t))' "$LAB/.exchange-state-sess-c"
run "$PAY"
if [ ! -e "$LAB/.exchange-state-sess-c" ]; then PASS=$((PASS+1)); else
  echo "FAIL stale stamp survived the reap"; FAIL=$((FAIL+1)); fi

# 9b. a stale .exchange-last copy goes with it
: > "$LAB/.exchange-last-sess-c"
python3 -c 'import os,sys,time; t=time.time()-7*3600; os.utime(sys.argv[1],(t,t))' "$LAB/.exchange-last-sess-c"
run "$PAY"
if [ ! -e "$LAB/.exchange-last-sess-c" ]; then PASS=$((PASS+1)); else
  echo "FAIL stale .exchange-last survived the reap"; FAIL=$((FAIL+1)); fi

# 10. KATHARSIS_DATA wins over $HOME, so a stamp test cannot reach the real stamp
ALT="$(mktemp -d)"
: > "$ALT/.active-sess-a"
stamp sess-a  # under $HOME, where the gate must not look
OUT="$(printf '%s' "$PAY" | HOME="$SANDBOX" KATHARSIS_DATA="$ALT" "$GATE" 2>&1)"; RC=$?
check "KATHARSIS_DATA redirects the lookup" "$(wc -l < "$ALT/telemetry/gate-misses.jsonl")" "1"
if [ -e "$LAB/.exchange-state-sess-a" ]; then PASS=$((PASS+1)); else
  echo "FAIL gate consumed the stamp outside KATHARSIS_DATA"; FAIL=$((FAIL+1)); fi
rm -rf "$ALT"
rm -f "$LAB/.exchange-state-sess-a"

# 11. the project comes from the transcript's parent dir when the payload carries
# one, so a cd inside the session does not relabel the miss (F25). The transcript
# path need not exist: trigger falls back to unknown and the slug still lands.
: > "$LAB/.active-sess-m"
run '{"hook_event_name":"Stop","session_id":"sess-m","stop_hook_active":false,"cwd":"/w/repo/deep/sub","transcript_path":"/w/.claude/projects/-w-repo/sess-m.jsonl","last_assistant_message":"one two three"}'
OUT="$(tail -1 "$MISSES")"
contains "miss project from transcript dir" '"project": "w-repo"'

echo
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
