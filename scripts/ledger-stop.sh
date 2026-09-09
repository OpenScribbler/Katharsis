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
# Code identity drift (D22) is checked here rather than in detect-reply.sh,
# because the dedup above drops the stored record whose code the new reply
# reuses, so the earlier definition is gone by the time anything downstream
# could compare the two. This is the one path where the hook blocks: a code
# carrying a different claim than the record already on file, with no E line
# naming that code, leaves every "do NA1" in the session pointing at two
# things. The repair is appended under D5, so the reply on screen stands.
# A stop already blocked this turn (stop_hook_active) passes, so a false
# positive costs one appended paragraph and never a deadlock.
#
# The drifted record is dropped rather than written, because the repair the
# block asks for reinstates the stored definition; recording the retracted
# claim would leave /kref answering with the line the reply itself withdrew.
#
# A cross-turn renumber, the same claim under a fresh code, captures to
# telemetry/drift.jsonl without blocking. D22 leaves it capture-only: the
# harmful case is a paraphrase whose detail moved, and it sits at the same
# similarity as two genuinely distinct findings about one file.
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
REASON="$(mktemp)" || exit 0
trap 'rm -f "$HOOKJSON" "$REASON"' EXIT
cat > "$HOOKJSON"

# stderr stays suppressed so a traceback can never steer the model. The one
# message this hook is allowed to send travels through $REASON instead, and
# the shell decides whether it becomes a block.
python3 - "$HOOKJSON" "$DATA" "$REASON" <<'PYEOF' 2>/dev/null
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

# --- code identity drift (D22) --------------------------------------------------
# A title too short to be a claim is never compared. The lenient CODE_RE's
# non-bold branch stops at the first colon or backtick, so a fragment such as
# "`aembit" or "wrote test" reaches the record as a title, and every same-reply
# duplicate in the corpus was one of those rather than a repeated claim.
# Measured 2026-09-09 over 2,741 replies, 591 of them coded: 0 same-reply
# duplicates, 59 redefinitions, 2 renumbers.
NORM_STRIP = re.compile(r"[`*_]")
NORM_PUNCT = re.compile(r"[^a-z0-9 ]+")
PLACEHOLDER = re.compile(r"<[^>]+>")


def comparable(title):
    # The style's own question template quoted back into a reply reads as a
    # definition of Q1, so a placeholder disqualifies the title outright.
    if PLACEHOLDER.search(title):
        return ""
    n = " ".join(NORM_PUNCT.sub(" ", NORM_STRIP.sub("", title.lower())).split())
    return n if len(n.split()) >= 4 and len(n) >= 20 else ""


def same_claim(was, now):
    # Containment catches a claim narrowed or widened rather than replaced, and
    # the token overlap catches one reworded. The threshold is 0.5, where the
    # corpus count is flat from 0.4 to 0.7, and the two hits it gives up are
    # both a decision restated in different words.
    if was in now or now in was:
        return True
    a, b = set(was.split()), set(now.split())
    return len(a & b) / len(a | b) >= 0.5 if a | b else True


# An E line is how the style retracts a definition, so a reply naming the code
# in one has already told the reader which definition is current.
retracted = " ".join(f'{r["code"]} {r["title"]} {r["summary"]}'
                     for r in records if r["prefix"] == "E")

# A code numbers continuously within a session and never renumbers, so the
# newest definition of a code supersedes the older one. That matters because
# stop-verifier.sh and stop-classify.sh can block a stop after this hook has
# already recorded the discarded reply, and the rewrite then carries the same
# codes. The file has one writer, since it is keyed by session, so a rewrite
# is safe where an append-only log would keep both.
path = os.path.join(sys.argv[2], "ledger", project, f"{session}.jsonl")
previous = []
try:
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                previous.append(json.loads(line))
            except Exception:
                continue
except FileNotFoundError:
    pass
except Exception:
    sys.exit(0)

on_file = {old.get("code"): old for old in previous}
drift = []
renumber = []
for rec in records:
    now = comparable(rec["title"])
    if not now:
        continue
    old = on_file.get(rec["code"])
    if old:
        was = comparable(old.get("title") or "")
        if (was and was != now and not same_claim(was, now)
                and not re.search(r"\b" + re.escape(rec["code"]) + r"\b", retracted)):
            drift.append({"code": rec["code"], "was": old.get("title"),
                          "now": rec["title"]})
    for old in previous:
        if old.get("code") != rec["code"] and comparable(old.get("title") or "") == now:
            renumber.append({"code": rec["code"], "was_code": old.get("code"),
                             "title": rec["title"]})
            break

drifted = {d["code"] for d in drift}
fresh = {r["code"] for r in records if r["code"] not in drifted}
kept = [old for old in previous if old.get("code") not in fresh]

try:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for rec in kept + [r for r in records if r["code"] not in drifted]:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    os.replace(tmp, path)
except Exception:
    pass

if renumber:
    try:
        os.makedirs(os.path.join(sys.argv[2], "telemetry"), exist_ok=True)
        with open(os.path.join(sys.argv[2], "telemetry", "drift.jsonl"), "a",
                  encoding="utf-8") as f:
            for r in renumber:
                f.write(json.dumps({"ts": ts, "session_id": session,
                                    "project": project, "shape": "renumber",
                                    **r}, ensure_ascii=False) + "\n")
    except Exception:
        pass

if drift and not hook.get("stop_hook_active"):
    codes = ", ".join(d["code"] for d in drift)
    lines = "\n".join(
        f'{d["code"]} is on file as "{d["was"]}" and this reply gives it "{d["now"]}"'
        for d in drift)
    try:
        with open(sys.argv[3], "w", encoding="utf-8") as f:
            f.write(
                f"Katharsis code identity check: {len(drift)} code(s) in the reply you"
                f" just finished carry a different claim than the definition already on"
                f" file this session, with no E line naming them, so every back-reference"
                f" to {codes} now points at two things.\n\n" + lines + "\n\n"
                "Do NOT reprint the reply. Send only what is missing: an ## Errata"
                " section whose E line restates each code above under its original"
                " definition, then the new claim in full under a fresh code of the same"
                " group. Every other line of the reply stands as written. Do not mention"
                " this check or apologize.\n")
    except Exception:
        sys.exit(0)  # no reason written, so the shell must not block
    sys.exit(2)
PYEOF
rc=$?
if [ "$rc" -eq 2 ] && [ -s "$REASON" ]; then
  cat "$REASON" >&2
  exit 2
fi
exit 0
