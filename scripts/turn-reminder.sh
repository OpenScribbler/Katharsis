#!/usr/bin/env bash
# turn-reminder.sh: UserPromptSubmit hook implementing the --enforce pattern
# from smixs/awesome-claude-output-styles (hooks/style-reminder.sh). Claude
# Code reinforces built-in output styles every turn but never custom ones, so
# a custom style fades over a long session. This emits the per-turn reminder
# for whatever custom style is active, and for Katharsis adds the
# classify-then-read instruction the style depends on. Silent for built-ins
# and default, which the harness already reinforces.
#
# Which style is active comes from the settings files Claude Code reads for
# `outputStyle`, in the order /config writes them: the project's
# .claude/settings.local.json, then the project's .claude/settings.json, then
# ~/.claude/settings.json. The project is the hook payload's cwd. The harness
# does not read ~/.claude/settings.local.json at all: with outputStyle set only
# there, a probe session reported no style in its system prompt, and the same
# key in settings.json loaded it (measured 2026-09-02), so that file is never
# consulted here.
#
# This hook is also the one place "Katharsis is active" is decided for the
# Stop hooks: when it is, the hook writes .active-<sessionId> into the data
# directory, and stop-classify.sh and ledger-stop.sh do nothing without that
# marker. Plugin hooks fire in every session, so without the marker a user who
# installed the plugin and picked another style would still get telemetry and
# ledger rows written.
#
# The third Katharsis line carries the reply's verification checklist.
# Verification cannot live at Stop: a Stop hook has no advisory path, so
# injecting there means exit 2 or {"decision":"block"}, both of which force a
# full reply reprint. Here it costs nothing and it arrives before the reply is
# written rather than after.
#
# CLAUDE_DIR overrides ~/.claude and KATHARSIS_DATA overrides
# ~/.claude/katharsis-data for tests.
# Failsafe: every path exits 0. A hook error must never block a prompt.

set -u
SELF="$(cd "$(dirname "$0")" && pwd)"
PAYLOAD="$(mktemp)" || exit 0
trap 'rm -f "$PAYLOAD"' EXIT
cat > "$PAYLOAD" 2>/dev/null || true
field() { sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$2" 2>/dev/null | head -1; }

# The payload is parsed as JSON rather than pattern-matched: its prompt field
# carries whatever the user typed, a pasted hook payload included, and a
# pattern would take the last "session_id" it saw, wherever that sat.
sid=""; cwd=""
{ IFS= read -r sid; IFS= read -r cwd; } < <(python3 -c '
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    d = {}
for k in ("session_id", "cwd"):
    print(str(d.get(k) or "").replace("\n", " "))
' "$PAYLOAD" 2>/dev/null)

dir="${CLAUDE_DIR:-$HOME/.claude}"
data="${KATHARSIS_DATA:-$HOME/.claude/katharsis-data}"
style=""
for f in ${cwd:+"$cwd/.claude/settings.local.json" "$cwd/.claude/settings.json"} "$dir/settings.json"; do
  [ -f "$f" ] || continue
  style="$(field outputStyle "$f")"
  [ -n "$style" ] && break
done

# A session that switched away from Katharsis drops its marker here, so the
# Stop hooks go idle on the same turn rather than at the six-hour reap.
marker="$data/.active${sid:+-$sid}"
case "$style" in
  ""|default|Default|Concise|Proactive|Explanatory|Learning) rm -f "$marker" 2>/dev/null; exit 0 ;;
esac

echo "$style output style is active. Remember to follow the specific guidelines for this style."
case "$style" in
  Katharsis|katharsis:Katharsis|"Katharsis coding"|"katharsis:Katharsis coding") ;;
  *) rm -f "$marker" 2>/dev/null; exit 0 ;;
esac

mkdir -p "$data" 2>/dev/null || true
: > "$marker" 2>/dev/null || true

# A turn nobody typed (bash output, a task notification, a skill load, a
# compaction resume) inherits the last typed message's type. That needs no
# judgment, so the hook stamps it itself instead of asking the model to.
python3 - "$PAYLOAD" "$data" "$sid" <<'PYEOF' 2>/dev/null
import json, os, sys, time
try:
    hook = json.load(open(sys.argv[1], encoding="utf-8", errors="replace"))
    prompt = str(hook.get("prompt") or "")
except Exception:
    prompt = ""
data, sid = sys.argv[2], sys.argv[3]
kind = "typed"
for marker, k in (("<bash-input>", "bash-input"), ("<task-notification>", "task-notification"),
                  ("<command-name>", "skill"), ("Base directory for this skill", "skill"),
                  ("<local-command-stdout>", "local-command"),
                  ("This session is being continued from a previous conversation", "compaction-resume")):
    if marker in prompt:
        kind = k
        break
if kind == "typed":
    print("Classify the user's message by exchange type and read the matching guidance file in ~/.claude/katharsis/styles/ before shaping the reply.")
    print("Before sending the reply, re-read what the user actually asked and run that guidance file's Verification section against your draft.")
    sys.exit(0)
last = os.path.join(data, f".exchange-last-{sid}" if sid else ".exchange-last")
try:
    parts = open(last, encoding="utf-8").read().split("\t")
    primary = parts[1].strip()
    stamp = os.path.join(data, f".exchange-state-{sid}" if sid else ".exchange-state")
    with open(stamp, "w", encoding="utf-8") as f:
        f.write(f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}\t{primary}\tinherited\n")
    print(f"Untyped turn ({kind}): it inherits `{primary}` from the last typed message, and the stamp is already made. Shape the reply to that type; do not run the script.")
except Exception:
    print(f"Untyped turn ({kind}) with no earlier type in this session: treat it as `status-and-resume` and run the script with that type.")
PYEOF
# One line of counters from the ledger, so numbering survives compaction and handoffs.
[ -n "$sid" ] && CLAUDE_CODE_SESSION_ID="$sid" KATHARSIS_DATA="$data" "$SELF/kref.sh" --next 2>/dev/null
exit 0
