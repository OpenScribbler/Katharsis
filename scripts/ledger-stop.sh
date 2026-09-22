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
# block asks for either restates the new line with its erratum marker, "(E4)",
# which then records normally, or reinstates the stored definition and moves
# the new item to a fresh code. A correction keeps its code: the code's record
# carries the corrected line, and the E record carries the earlier wording.
#
# Questions and decisions (D27-D29) capture one record per reply to
# telemetry/decisions.jsonl: questions, gate-shaped questions, re-asked
# questions, D lines, and F and D lines carrying one address or more.
#
# A cross-turn renumber, the same claim under a fresh code, captures to
# telemetry/drift.jsonl without blocking. D22 leaves it capture-only: the
# harmful case is a paraphrase whose detail moved, and it sits at the same
# similarity as two genuinely distinct findings about one file.
#
# Prose headings (D23, D25) capture one record per reply to
# telemetry/headings.jsonl on the same pattern: the count of `##` prose
# headings, the longest paragraph run under one, the paragraphs after the
# answer line that sit under no heading, and the code groups that open with
# a theme line. Counts only, never text (D17), and never a block: a missing
# heading costs scanning rather than meaning (D21).
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
# The code may be bold; the separator after the code may be -, —, –, or a
# colon with any spacing; the title is the first bold span when there is one,
# else the text up to a separator that has a space on both sides (or a colon
# followed by a space). Measured 2026-09-03 over 2580 coded lines in the
# transcript corpus, the strict form matched 53%; the lenient one is what the
# ledger needs so that the reply never has to be rewritten to be recorded.
# Until 2026-09-22 the unbolded title stopped at any hyphen or colon, so
# "Is ATD-1274 done?" was recorded as "Is ATD", and a line opening with a
# ticket key such as "ATD-741:" was recorded under the code "ATD-741".
# Replaying the prior two weeks of replies, the spaced separator lengthened
# 1,741 of 8,763 titles, matched 0 new lines, and dropped 57, every one a
# ticket key.
SEP = r"\s*[-—–:]\s*"                 # after the code
TSEP = r"(?:\s+[-—–]\s+|:\s+)"        # between the title and its body
CODE_RE = re.compile(
    r"^(?:[-*]\s+)?(?:❓\s*)?\**([A-Z]{1,3}(?:-[A-Z]{1,2})?)(\d+)\**" + SEP
    + r"(?:\*\*(.+?)\*\*|((?:(?!" + TSEP + r").)+?))(?:" + TSEP + r"(.*))?\s*$")
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
            "title": title.strip().rstrip(":"),
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

# --- prose headings (D23, D25) ------------------------------------------------
# A `##` line is a code group when its name is a stock group or a coded line
# sits under it, and a prose heading otherwise. A paragraph is a run of
# non-blank lines, or one fenced block; blank lines inside a fence do not split one.
GROUPS = {"Findings", "Decisions", "Assumptions", "Risks", "Caveats", "Actions Taken",
          "Verified", "Next Actions", "Blocked", "Your Move", "Waiting", "Excluded",
          "State", "Trade-offs", "Errata", "Questions"}
H2_RE = re.compile(r"^## +(.*?)\s*#*$")
sections = [{"name": None, "paras": 0, "coded": False, "first": None}]
in_para = fenced = False
for line in reply.splitlines():
    if line.strip().startswith("```"):
        if not fenced and not in_para:
            sections[-1]["paras"] += 1  # a fenced block set off by blank lines is one paragraph
        fenced = not fenced
        in_para = True
        continue
    if fenced:
        continue
    h = H2_RE.match(line)
    if h:
        sections.append({"name": h.group(1).strip(), "paras": 0, "coded": False, "first": None})
        in_para = False
        continue
    if not line.strip():
        in_para = False
        continue
    sec = sections[-1]
    if not in_para:
        sec["paras"] += 1
        in_para = True
    if sec["first"] is None:
        sec["first"] = "code" if CODE_RE.match(line) else ("header" if HEADER_RE.match(line) else "prose")
    if CODE_RE.match(line):
        sec["coded"] = True
groups = [s for s in sections[1:] if s["name"] in GROUPS or s["coded"]]
prose = [s for s in sections[1:] if s not in groups]
try:
    os.makedirs(os.path.join(sys.argv[2], "telemetry"), exist_ok=True)
    with open(os.path.join(sys.argv[2], "telemetry", "headings.jsonl"), "a",
              encoding="utf-8") as f:
        f.write(json.dumps({
            "ts": ts, "session_id": session, "project": project,
            "headings": len(prose),
            "max_run": max([s["paras"] for s in prose], default=0),
            "bare": max(sections[0]["paras"] - 1, 0),
            "themes": sum(1 for s in groups if s["first"] == "prose"),
        }, ensure_ascii=False) + "\n")
except Exception:
    pass

# --- questions and decisions (D27-D29) -----------------------------------------
# One record per reply to telemetry/decisions.jsonl: how many questions the
# round asked, how many were permission gates on work already owed, how many
# re-asked a question already on file, how many D lines went out, and how many
# F and D lines carried an address (a path:line, a hash, a path) in the body,
# and how many carried two or more. Counts only (D17), never a block (D21).
GATE_RE = re.compile(r"^(start|stop here|stop\b|commit|push|keep going|continue|proceed|go ahead|"
                     r"anything else|which next action|shall i|want me to)\b|\bnow\?$", re.I)
ADDR_RE = re.compile(r"[\w./-]+\.\w+:\d+|\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b|"
                     r"[\w.-]+/[\w./-]*\.[A-Za-z]\w*")
# A question restated keeps its code, so a Q code already on file is a re-ask.
asked = set()
try:
    with open(os.path.join(sys.argv[2], "ledger", project, f"{session}.jsonl"),
              encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                r = json.loads(line)
            except Exception:
                continue
            if r.get("prefix") == "Q":
                asked.add(r.get("code"))
except Exception:
    pass
qs = [r for r in records if r["prefix"] == "Q"]
fd = [r for r in records if r["prefix"] in ("F", "D")]
naddr = [len(set(ADDR_RE.findall(r["summary"]))) for r in fd]
try:
    os.makedirs(os.path.join(sys.argv[2], "telemetry"), exist_ok=True)
    with open(os.path.join(sys.argv[2], "telemetry", "decisions.jsonl"), "a",
              encoding="utf-8") as f:
        f.write(json.dumps({
            "ts": ts, "session_id": session, "project": project,
            "questions": len(qs),
            "gates": sum(1 for r in qs if GATE_RE.search(r["title"].strip())),
            "reasked": sum(1 for r in qs if r["code"] in asked),
            "decisions": sum(1 for r in records if r["prefix"] == "D"),
            "addressed": sum(1 for k in naddr if k >= 1),
            "multi": sum(1 for k in naddr if k >= 2),
        }, ensure_ascii=False) + "\n")
except Exception:
    pass

if not records:
    sys.exit(0)

# --- code identity drift (D22) --------------------------------------------------
# A title too short to be a claim is never compared. Before 2026-09-22 the
# lenient CODE_RE's non-bold branch stopped at the first hyphen or colon, so a
# fragment such as "`aembit" or "wrote test" reached the record as a title, and
# every same-reply duplicate in the corpus was one of those rather than a
# repeated claim. The floor stays, because a short title still carries too few
# words for the overlap test to mean anything.
# Measured 2026-09-09 by replaying 2,741 corpus replies through this hook:
# 34 blocked, naming 39 drifted pairs of which 38 are genuine on a full
# read, 2 renumbers captured, and 0 same-reply duplicates in the 361
# replies that carried two or more comparable coded items.
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
# A corrected line keeps its code and ends with the erratum's code, "(E4)",
# while E4 holds the earlier wording, so either half marks the change.
retracted = " ".join(f'{r["code"]} {r["title"]} {r["summary"]}'
                     for r in records if r["prefix"] == "E")
reply_e = {r["code"] for r in records if r["prefix"] == "E"}
MARK_RE = re.compile(r"\((E\d+)\)\s*$")


def corrected(rec):
    m = MARK_RE.search(rec["summary"]) or MARK_RE.search(rec["title"])
    return bool(m and m.group(1) in reply_e)

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
                and not re.search(r"\b" + re.escape(rec["code"]) + r"\b", retracted)
                and not corrected(rec)):
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
                "Do NOT reprint the reply. Send only what is missing, for each code"
                " above. If the new line corrects the one on file, restate the new line"
                " under the same code ending with a fresh erratum code, as in"
                " `F3 - **...** - ... (E4)`, and add an ## Errata section whose E4 line"
                " reads `E4 - **F3 as first written: <the title on file>** - <why it"
                " changed>`. If the new line is a different item that took the code by"
                " mistake, restate the code's on-file line unchanged and give the new"
                " item a fresh code of the same group. Every other line of the reply"
                " stands as written. Do not mention this check or apologize.\n")
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
