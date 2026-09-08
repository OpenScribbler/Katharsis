#!/usr/bin/env bash
# stop-verifier.sh: Claude Code Stop hook. Runs detect-reply.sh over the final
# reply of the turn and, on hits, blocks the stop once with one steering line
# per hit, so the model appends the missing piece in the same turn.
#
# Block signal: exit 2 with the reason on stderr. The docs, hookbench, and the
# shipped hook corpora all read exit 2; stdout JSON {"decision":"block"} is the
# secondary path and risks being treated as optional, so it is not used.
#
# The reply comes from the hook payload's last_assistant_message field, never
# from the transcript file: the harness flushes the transcript asynchronously,
# and on a fast text-only turn the final assistant entry lands on disk after
# the hook reads it, so a transcript parse silently misses the reply
# (observed 2026-08-28, sessions 12aa8a87 and 25ba1c6c).
#
# Loop guard: the harness sets stop_hook_active=true when a stop was already
# blocked this turn, and the hook then always passes, so a false positive costs
# one rewrite, never a deadlock.
#
# Failsafe: every error path exits 0. A broken verifier must never block work.
#
# Blocking set: D5 in docs/design.md allows a block only where the repair is
# something appended, so a rule blocks here when a few added lines fix it and
# every line already on screen stays correct. Demanding the reply again is out
# of bounds whatever the rule. Measured 2026-08-30 over the 72 captured
# replies: 21 blocked and 10,679 of 16,984 reply words reprinted, and every
# one of those blocks was a preference (punctuation, term choice, list coding)
# that left the reply's content intact. Preference rules now capture to the
# corpus without blocking, so drift stays measurable and costs nothing.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
command -v python3 >/dev/null 2>&1 || exit 0

HOOKJSON="$(mktemp)"
trap 'rm -f "$HOOKJSON"' EXIT
cat > "$HOOKJSON"

python3 - "$HOOKJSON" "$DIR/detect-reply.sh" <<'PYEOF'
import json, subprocess, sys

def ok():
    sys.exit(0)

try:
    hook = json.load(open(sys.argv[1], encoding="utf-8", errors="replace"))
except Exception:
    ok()
if hook.get("stop_hook_active"):
    ok()
reply = hook.get("last_assistant_message") or ""
if not isinstance(reply, str) or not reply.strip():
    ok()

try:
    r = subprocess.run([sys.argv[2]], input=reply, capture_output=True,
                       text=True, timeout=30)
except Exception:
    ok()
if r.returncode != 1:  # 0 = clean, 2 = detector error; block only on hits
    ok()

# Two blocking classes, because the appended repair differs. BURIED rules leave the
# content right and the placement wrong, and an E line lifts the buried claim to its
# own line. UNASKED rules leave a decision where Holden cannot answer it, and the
# repair is that E line plus the question restated under ## Questions. Neither class
# reprints anything: Holden reads the reply once and the appended lines once (Q41 and
# Q50, 2026-09-08). r2-comprehension blocks under neither, because an announced-
# comprehension opener has already been read by the time the hook sees it and nothing
# appended un-reads it; it captures to the corpus instead.
BURIED = {"r4-opening-narration"}
UNASKED = {"r15-question-outside-round"}

lines = [l for l in r.stdout.splitlines() if l.strip()]
hits = [l for l in lines if not l.startswith("hits=")]
buried = [l for l in hits if l.split(" | ", 1)[0].strip() in BURIED]
unasked = [l for l in hits if l.split(" | ", 1)[0].strip() in UNASKED]
if not buried and not unasked:
    ok()
MAX = 25

def block(items, head):
    shown = items[:MAX]
    extra = len(items) - len(shown)
    return (head + "\nEach line is: rule | the offending text | the fix.\n\n"
            + "\n".join(shown)
            + (f"\n(+{extra} more hits of the same kinds; fix every instance, not only"
               " those listed)" if extra > 0 else ""))

parts = []
if buried:
    parts.append(block(buried,
        f"Katharsis reply verifier: the reply you just finished opens by narrating what you "
        f"were about to do, {len(buried)} time(s), which buries the finding under it. Do NOT "
        "reprint the reply. Send only an ## Errata section whose E line retracts the opening "
        "and states the finding on its own line. Every other line of the reply stands as "
        "written. Do not mention this check or apologize."))
if unasked:
    parts.append(block(unasked,
        f"Katharsis reply verifier: the reply you just finished asks Holden "
        f"{len(unasked)} decision(s) from outside its Questions round. Do NOT reprint the "
        "reply. Send only what is missing: an ## Errata section with one E line retracting "
        "each misplaced ask, then a ## Questions section carrying the same decisions as "
        "numbered questions with options and a recommendation. Every other line of the "
        "reply stands as written, and repeating it wastes Holden's reading time. Do not "
        "mention this check or apologize."))
print("\n\n".join(parts), file=sys.stderr)
sys.exit(2)
PYEOF
rc=$?
[ "$rc" -eq 2 ] && exit 2
exit 0
