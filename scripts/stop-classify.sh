#!/usr/bin/env bash
# stop-classify.sh: Stop hook that checks whether this turn classified the
# exchange type. katharsis-exchange-style.sh stamps .exchange-state-<sessionId>
# every time it runs; this hook consumes the stamp. When none exists, it records
# the miss to telemetry/gate-misses.jsonl and exits 0. It never blocks: a block
# after the reply is on screen can only produce a second reply, and the audit
# (30 misses over 19 sessions, 2026-09-03) showed every miss had a mechanical
# cause the prompt hook now handles, so the gate's job is to count.
#
# A bash-mode turn (`! kref F3`) is the one untyped turn the prompt hook never
# sees: no hook event at all fires for `!` input before the model replies. A
# probe on 2026-09-04 logged every documented event except Setup and the two
# Worktree events across two `!` turns, and only MessageDisplay and Stop fired,
# both after the reply. So nothing can stamp it mid-turn. The reply to such a turn inherits the last
# typed message's type under the style's rule, and this gate records that
# inheritance from .exchange-last-<sessionId> with status "inherited" rather
# than counting a miss the model had no way to avoid. Nothing reads the stamp
# mid-turn, so the gate is the only place the inheritance needs recording.
#
# Keyed by the payload's session_id, so two concurrent sessions neither satisfy
# nor consume each other's stamp. A shell that ran the script without
# CLAUDE_CODE_SESSION_ID falls back to the unkeyed .exchange-state.
#
# Gate: plugin hooks fire in every session whatever output style is active,
# so this hook does nothing unless turn-reminder.sh has marked the session
# active (.active-<sessionId> in the data directory). That marker is the
# single place "Katharsis is active" is decided.
#
# Failsafe: every path exits 0. Stamps and telemetry live in the data
# directory, ~/.claude/katharsis-data; KATHARSIS_DATA overrides it for tests,
# so a stamp test cannot delete the real stamp out from under the live turn
# running it.

set -u
DATA="${KATHARSIS_DATA:-$HOME/.claude/katharsis-data}"
command -v python3 >/dev/null 2>&1 || exit 0

HOOKJSON="$(mktemp)" || exit 0
trap 'rm -f "$HOOKJSON"' EXIT
cat > "$HOOKJSON"

python3 - "$HOOKJSON" "$DATA" <<'PYEOF'
import json, os, sys, time

def ok():
    sys.exit(0)

try:
    hook = json.load(open(sys.argv[1], encoding="utf-8", errors="replace"))
except Exception:
    ok()

d = sys.argv[2]
session = str(hook.get("session_id") or "")
if not os.path.exists(os.path.join(d, f".active-{session}" if session else ".active")):
    ok()  # Katharsis is not the active style in this session
paths = [os.path.join(d, f".exchange-state-{session}")] if session else []
paths.append(os.path.join(d, ".exchange-state"))
stamped = next((p for p in paths if os.path.exists(p)), None)

for p in paths:  # the stamp is spent either way
    try:
        os.remove(p)
    except Exception:
        pass

# Every other session's stamp is invisible to this gate, so a session that ends
# without a Stop hook firing leaves one behind forever. Reap the ones no turn
# can still be running against. Six hours is well past the longest real turn.
REAP_S = 6 * 3600
try:
    cutoff = time.time() - REAP_S
    for name in os.listdir(d):
        if not name.startswith((".exchange-state", ".exchange-last", ".active")):
            continue
        stale = os.path.join(d, name)
        if os.path.getmtime(stale) < cutoff:
            os.remove(stale)
except Exception:
    pass

if stamped:
    ok()

# A miss is recorded, never punished. Blocking here could only add a second
# reply after the first was already read, so the gate counts instead: one JSON
# line per miss under telemetry/, with no message text, so the file can be
# shared. Fields: when, which session and project, what kind of turn started it
# (typed, bash-input, task-notification, skill, compaction), how many tool
# calls the turn made, how long the reply was, and a status: "missed" for a
# turn the model should have classified, "inherited" for a bash-mode turn,
# which also carries the type it inherited.
#
# The transcript records a `!` turn as two user lines, <bash-input> then
# <bash-stdout>/<bash-stderr>, and the walk backwards meets the output line
# first, so all three markers name the same kind.
def trigger_kind(text):
    t = text or ""
    for marker, kind in (("<bash-input>", "bash-input"), ("<bash-stdout>", "bash-input"),
                         ("<bash-stderr>", "bash-input"), ("<task-notification>", "task-notification"),
                         ("<command-name>", "skill"), ("Base directory for this skill", "skill"),
                         ("<local-command-stdout>", "local-command"),
                         ("This session is being continued from a previous conversation", "compaction-resume")):
        if marker in t:
            return kind
    return "typed"

trigger, tool_calls = "unknown", None
try:
    path = hook.get("transcript_path") or ""
    with open(path, "rb") as f:
        f.seek(0, 2); size = f.tell(); start = max(0, size - 400_000); f.seek(start)
        lines = f.read().decode("utf-8", "replace").splitlines()
        if start:
            lines = lines[1:]  # the first line of a mid-file read is a torn one
    turn = []
    for line in reversed(lines):
        try:
            r = json.loads(line)
        except Exception:
            continue
        if r.get("type") not in ("user", "assistant"):
            continue
        c = r.get("message", {}).get("content")
        if r["type"] == "user":
            if isinstance(c, list) and c and all(x.get("type") == "tool_result" for x in c):
                continue
            text = " ".join(x.get("text", "") for x in c if x.get("type") == "text") if isinstance(c, list) else str(c)
            # The harness answers an empty reply by re-invoking the model with
            # this line as a user message. It is not the turn's trigger, so keep
            # walking to the message the user or the harness actually sent.
            if text.strip().startswith("[Your previous response had no visible output"):
                continue
            trigger = trigger_kind(text)
            break
        turn.append(r)
    tool_calls = sum(1 for r in turn for x in (r.get("message", {}).get("content") or [])
                     if isinstance(x, dict) and x.get("type") == "tool_use")
except Exception:
    pass

def slug(path):
    import re
    return re.sub(r"[^A-Za-z0-9]+", "-", path or "").strip("-").lower() or "unknown"

def project_of(hook):
    # Same rule as ledger-stop.sh: the transcript's parent dir is the launch-project
    # slug and holds still when cwd moves (F25).
    parent = os.path.basename(os.path.dirname(hook.get("transcript_path") or ""))
    return slug(parent or hook.get("cwd") or "")

rec = {
    "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "session_id": session,
    "project": project_of(hook),
    "trigger": trigger,
    "tool_calls": tool_calls,
    "reply_words": len((hook.get("last_assistant_message") or "").split()),
    "status": "missed",
}
if trigger == "bash-input":
    # No hook could have stamped this turn, so the type is whatever the last
    # typed message set; a session whose first turn is a `!` has nothing to
    # inherit and falls to the style's default for an untyped turn.
    rec["status"] = "inherited"
    rec["type"] = "status-and-resume"
    for p in ([os.path.join(d, f".exchange-last-{session}")] if session else []) + [os.path.join(d, ".exchange-last")]:
        try:
            parts = open(p, encoding="utf-8").read().split("\t")
            if len(parts) > 1 and parts[1].strip():
                rec["type"] = parts[1].strip()
                break
        except Exception:
            continue
try:
    os.makedirs(os.path.join(d, "telemetry"), exist_ok=True)
    with open(os.path.join(d, "telemetry", "gate-misses.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps(rec) + "\n")
except Exception:
    pass
ok()
PYEOF
exit 0
