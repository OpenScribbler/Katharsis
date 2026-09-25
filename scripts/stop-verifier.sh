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
# Gate: plugin hooks fire in every session whatever output style is active, so
# the verifier runs only where the prompt hook (hooks/register.ts) marked
# Katharsis active (.active-<sessionId> in the data directory), as
# stop-classify.sh and ledger-stop.sh do. KATHARSIS_DATA overrides the data
# directory for tests.
#
# Failsafe: every error path exits 0. A broken verifier must never block work.
#
# Blocking set: a hook may block only where the repair is
# something appended, so a rule blocks here when a few added lines fix it and
# every line already on screen stays correct. Demanding the reply again is out
# of bounds whatever the rule. The defects that earn a block are the ones
# that send the user back through the reply to reconstruct what it meant, such
# as a decision or a finding buried under another code or in prose, or a code
# carrying content that belongs to a different one. A defect that only wastes
# the words it occupies captures instead. Measured 2026-08-30 over the 72 captured
# replies: 21 blocked and 10,679 of 16,984 reply words reprinted, and every
# one of those blocks was a preference (punctuation, term choice, list coding)
# that left the reply's content intact. Preference rules now capture to
# telemetry/replies.jsonl without blocking, so drift stays measurable and costs
# nothing.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
DATA="${KATHARSIS_DATA:-$HOME/.claude/katharsis-data}"
command -v python3 >/dev/null 2>&1 || exit 0

HOOKJSON="$(mktemp)"
trap 'rm -f "$HOOKJSON"' EXIT
cat > "$HOOKJSON"

python3 - "$HOOKJSON" "$DIR/detect-reply.sh" "$DATA" <<'PYEOF'
import json, os, subprocess, sys

def ok():
    sys.exit(0)

try:
    hook = json.load(open(sys.argv[1], encoding="utf-8", errors="replace"))
except Exception:
    ok()
after_hold = bool(hook.get("stop_hook_active"))
session = str(hook.get("session_id") or "")
if not os.path.exists(os.path.join(sys.argv[3], f".active-{session}" if session else ".active")):
    ok()  # Katharsis is not the active style in this session
reply = hook.get("last_assistant_message") or ""
if not isinstance(reply, str) or not reply.strip():
    ok()

try:
    r = subprocess.run([sys.argv[2]], input=reply, capture_output=True,
                       text=True, timeout=30)
except Exception:
    ok()

# One row per finished message to telemetry/replies.jsonl, written before the block
# decision so capture-only rules reach it too. Counts and rule names only, never
# reply text. A hold's repair arrives as its own message with stop_hook_active set,
# so it gets its own row marked after_hold, and a reader sums the two for the reply.
# model is the full id register.ts wrote to .model-id-<sid>, so Opus 5 and 5.5 stay
# apart where .model-<sid> keeps only the note's key. type comes from
# .exchange-last-<sid>, which stop-classify.sh never consumes, so hook order cannot
# empty it. It is the last type stamped in the session: after a gate miss it still
# holds the previous turn's type, and gate-misses.jsonl names those turns.
# ends_on_ask flags a final prose line, outside the Questions round, that asks
# ("?" or an ask-phrases.txt phrase): the offer-at-the-end lean the model notes target.
def record():
    import re, time
    d = sys.argv[3]
    def first_line(name):
        for n in ([f"{name}-{session}"] if session else []) + [name]:
            try:
                with open(os.path.join(d, n), encoding="utf-8") as f:
                    return f.readline().rstrip("\n")
            except OSError:
                pass
        return ""
    fields = first_line(".exchange-last").split("\t")
    rules = {}
    if r.returncode == 1:
        for l in r.stdout.splitlines():
            rule = l.split(" | ", 1)[0].strip()
            if l.strip() and not l.startswith("hits=") and rule:
                rules[rule] = rules.get(rule, 0) + 1
    last, in_round, fenced = "", False, False
    for l in reply.split("\n"):
        if l.lstrip().startswith("```"):
            fenced = not fenced
            continue
        h = re.match(r"^\s*##\s+(.*)", l)
        if h:
            in_round = h.group(1).strip().lower() == "questions"
            continue
        if l.strip() and not fenced:
            last = "" if in_round else l
    try:
        pack = os.path.join(os.path.dirname(sys.argv[2]), "packs", "ask-phrases.txt")
        phrases = [x.strip() for x in open(pack, encoding="utf-8")
                   if x.strip() and not x.lstrip().startswith("#")]
    except OSError:
        phrases = []
    ask = re.search(r"\?(?=\s|$|[*_)\"'])", last) or (
        phrases and re.search(r"\b(?:" + "|".join(phrases) + r")\b", last, re.I))
    parent = os.path.basename(os.path.dirname(str(hook.get("transcript_path") or "")))
    rec = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "session_id": session,
        "project": re.sub(r"[^A-Za-z0-9]+", "-", parent or str(hook.get("cwd") or "")).strip("-").lower() or "unknown",
        "model": first_line(".model-id"),
        "type": fields[1] if len(fields) > 1 else "",
        "reply_words": len(reply.split()),
        "ends_on_ask": bool(ask),
        "after_hold": after_hold,
        "rules": rules,
    }
    os.makedirs(os.path.join(d, "telemetry"), exist_ok=True)
    with open(os.path.join(d, "telemetry", "replies.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps(rec) + "\n")

try:
    record()
except Exception:
    pass  # a lost row never costs the reply its check

if after_hold:  # loop guard: a stop already held this turn always passes
    ok()
if r.returncode != 1:  # 0 = clean, 2 = detector error; block only on hits
    ok()

# One blocking class. BURIED rules leave the content right and the placement wrong,
# and the repair states the buried claim on its own line, reprinting nothing (Q41,
# 2026-09-08). r15, an ask filed on a settled code's line, blocked until 2026-09-23
# with a repair that demanded an erratum plus a question. That repair taught the
# model to ask more and to file errata for its own filing slips, the two costs the
# 2026-09-23 reviews measured, so r15 now captures to replies.jsonl like
# the preference rules. r2-comprehension captures too, because an announced-
# comprehension opener has already been read and nothing appended un-reads it.
BURIED = {"r4-opening-narration"}

lines = [l for l in r.stdout.splitlines() if l.strip()]
hits = [l for l in lines if not l.startswith("hits=")]
buried = [l for l in hits if l.split(" | ", 1)[0].strip() in BURIED]
if not buried:
    ok()
MAX = 25

def block(items, head):
    shown = items[:MAX]
    extra = len(items) - len(shown)
    return (head + "\nEach line is: rule | the offending text | the fix.\n\n"
            + "\n".join(shown)
            + (f"\n(+{extra} more hits of the same kinds; fix every instance, not only"
               " those listed)" if extra > 0 else ""))

parts = [block(buried,
    f"Katharsis reply verifier: the reply you just finished opens by narrating what you "
    f"were about to do, {len(buried)} time(s), which buries the finding under it. Do NOT "
    "reprint the reply. Send only the finding, stated on its own line.  Every other line of the reply stands as "
    "written. Do not mention this check or apologize.")]
print("\n\n".join(parts), file=sys.stderr)
sys.exit(2)
PYEOF
rc=$?
[ "$rc" -eq 2 ] && exit 2
exit 0
