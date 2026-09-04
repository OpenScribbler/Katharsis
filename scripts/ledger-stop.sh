#!/usr/bin/env bash
# ledger-stop.sh: Claude Code Stop hook. Parses the coded items out of the
# reply that just finished (F1, D2, AT3, T-O1, and the question round's
# Q lines) and appends one JSONL record per item to a per-session ledger, so
# /kref can answer "what was F3?" a week later without a transcript search.
#
# The reply comes from the hook payload's last_assistant_message field, never
# from the transcript file: the harness flushes the transcript asynchronously,
# and on a fast text-only turn the final assistant entry lands on disk after
# the hook reads it (see stop-verifier.sh's header for the observed cases).
#
# One file per session at ledger/<project-slug>/<sessionId>.jsonl. Two sessions
# in the same repo never share a file, which removes the concurrency class
# outright: no interleaved appends, no torn lines, no flock. The session ID is
# on every record anyway, so a line stays self-describing once files are
# concatenated.
#
# Detection is by shape rather than by an allowlist, so a code invented next
# week is captured with no edit here. The stock set becomes a known:true|false
# field rather than a filter, which lets /kref sort stock codes first while
# bespoke ones stay findable.
#
# A code redefined in a later reply of the same session supersedes the earlier
# record, so a blocked-and-rewritten reply lands once rather than twice.
#
# Definitions only, never references. Anchoring at line start with the " - **"
# delimiter skips "do NA1" and "more on F3", so /kref F3 returns exactly one
# line.
#
# Gate: plugin hooks fire in every session whatever output style is active,
# so this hook writes nothing unless turn-reminder.sh has marked the session
# active (.active-<sessionId> in the data directory).
#
# The ledger lives in the data directory, ~/.claude/katharsis-data, because
# the plugin directory is a read-only cache under a marketplace install.
# KATHARSIS_DATA overrides it for tests.
#
# Failsafe: every path exits 0 and prints nothing. A ledger hook must never
# block work or steer the model.

set -u
DATA="${KATHARSIS_DATA:-$HOME/.claude/katharsis-data}"
command -v python3 >/dev/null 2>&1 || exit 0

HOOKJSON="$(mktemp)" || exit 0
trap 'rm -f "$HOOKJSON"' EXIT
cat > "$HOOKJSON"

python3 - "$HOOKJSON" "$DATA" <<'PYEOF' 2>/dev/null
import datetime, json, os, re, sys

KNOWN = {"F", "D", "A", "R", "C", "AT", "V", "NA", "B", "MV", "W", "X", "S", "T-O", "E", "Q"}
SUMMARY_MAX = 500
NOTE_MAX = 300

# One lenient pattern for every way a coded line has actually been written:
#   F1 - **the claim** - the evidence      **AT2 — Fixed x** — because
#   ❓ **Q28** - **question?** body         F1: bare claim, no bold
#   F8 — **claim** trailing prose          - NA2 - claim (bulleted)
# The code may be bold; the separator may be -, —, –, or a colon; the title
# is the first bold span when there is one, else the text to the next
# separator. Measured 2026-09-03 over 2580 coded lines in the transcript
# corpus, the strict form matched 53%; the lenient one is what the ledger
# needs so that the reply never has to be rewritten to be recorded.
SEP = r"\s*[-—–:]\s*"
CODE_RE = re.compile(
    r"^(?:[-*]\s+)?(?:❓\s*)?\**([A-Z][A-Z-]{0,3})(\d+)\**" + SEP
    + r"(?:\*\*(.+?)\*\*|([^-—–:]+?))(?:" + SEP + r"(.*))?\s*$")
Q_RE = CODE_RE  # the question round's form is one of the shapes above
HEADER_RE = re.compile(r"^#{2,6} +(.*?)\s*#*$")


def slug(path):
    s = re.sub(r"[^A-Za-z0-9]+", "-", path or "").strip("-")
    return s.lower() or "unknown"


def project_of(hook):
    # The transcript lives under ~/.claude/projects/<launch-dir slug>/ for the whole
    # session, while cwd moves with every cd the model runs. Keying on cwd split one
    # session across ledger directories (F4, F25).
    parent = os.path.basename(os.path.dirname(hook.get("transcript_path") or ""))
    return slug(parent or hook.get("cwd") or "")


try:
    hook = json.load(open(sys.argv[1], encoding="utf-8", errors="replace"))
except Exception:
    sys.exit(0)
reply = hook.get("last_assistant_message") or ""
if not isinstance(reply, str) or not reply.strip():
    sys.exit(0)

session = str(hook.get("session_id") or "")
if not os.path.exists(os.path.join(sys.argv[2], f".active-{session}" if session else ".active")):
    sys.exit(0)  # Katharsis is not the active style in this session
session = session or "unknown"
project = project_of(hook)
ts = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")

section = ""
note = ""       # the sentence under the header, so a definition block's
note_open = False  # meaning rides along with the code rather than the label
body_pending = None  # a coded line with no body on its line takes the next line
records = []
for line in reply.splitlines():
    h = HEADER_RE.match(line)
    if h:
        section, note, note_open = h.group(1), "", True
        continue
    m = CODE_RE.match(line) or Q_RE.match(line)
    if m:
        note_open = False
        prefix, n, bold, plain, summary = m.groups()
        title = bold if bold is not None else plain
        if bold is None:
            # `**AT2 — Fixed x** — because` closes the bold after the title, and
            # `F8 — **claim** trailing prose` runs on without a separator.
            inner = re.match(r"\*\*(.+?)\*\*\s*(.*)$", plain.strip())
            if inner:
                title, summary = inner.group(1), summary or inner.group(2)
            title = title.strip("*")
        summary = summary or ""
        body_pending = None if summary else len(records)
        records.append({
            "ts": ts,
            "session_id": session,
            "project": project,
            "code": f"{prefix}{n}",
            "prefix": prefix,
            "n": int(n),
            "known": prefix in KNOWN,
            "title": title.strip(),
            "summary": summary.strip()[:SUMMARY_MAX],
            "section": section,
            "section_note": note,
        })
        continue
    if body_pending is not None and line.strip():
        records[body_pending]["summary"] = line.strip()[:SUMMARY_MAX]
        body_pending = None
        continue
    if note_open and line.strip():
        note = line.strip()[:NOTE_MAX]
        note_open = False

if not records:
    sys.exit(0)

# A code numbers continuously within a session and never renumbers, so the
# newest definition of a code supersedes the older one. That matters because
# stop-verifier.sh and stop-classify.sh can block a stop after this hook has
# already recorded the discarded reply, and the rewrite then carries the same
# codes. The file has one writer, since it is keyed by session, so a rewrite
# is safe where an append-only log would keep both.
path = os.path.join(sys.argv[2], "ledger", project, f"{session}.jsonl")
fresh = {r["code"] for r in records}
kept = []
try:
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                old = json.loads(line)
            except Exception:
                continue
            if old.get("code") not in fresh:
                kept.append(old)
except FileNotFoundError:
    pass
except Exception:
    sys.exit(0)

try:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for rec in kept + records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    os.replace(tmp, path)
except Exception:
    pass
PYEOF
exit 0
