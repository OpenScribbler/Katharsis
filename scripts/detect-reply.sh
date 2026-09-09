#!/usr/bin/env bash
# detect-reply.sh: reply-scoped Katharsis detector. Runs the detect-prose.sh
# detectors over ONE reply and prints a steering line per hit, so a model can
# fix the exact offense. Deterministic, no model in the loop.
#
# Lab piece for the E1/E2 experiments (2026-08-28). Source of the regexes:
# katharsis scripts/detect-prose.sh (r2-r10) plus lab-native rules r12-r14.
# Rules r1 (needs the preceding user turn) and r11 (corpus-level drift) are out
# of scope for a single reply. Wordlists live in packs/*.txt beside this
# script; a missing pack disables the rules it feeds.
#
# Usage: detect-reply.sh [FILE]     reads FILE, or stdin when FILE is absent
# Exit:  0 clean, 1 hits found, 2 usage/environment error
# Output: "hits=N" first, then one line per hit:
#   <rule-id> | <matched text> | <fix instruction>

set -u

command -v python3 >/dev/null 2>&1 || { echo "python3 is required and was not found" >&2; exit 2; }

if [ $# -gt 1 ]; then
  echo "usage: detect-reply.sh [FILE]" >&2
  exit 2
fi
# python3 - <<heredoc would hand the heredoc to stdin, hiding the reply, so the
# reply always travels as a file path in argv.
if [ $# -eq 1 ]; then
  [ -r "$1" ] || { echo "cannot read: $1" >&2; exit 2; }
  INPUT="$1"
  CLEANUP=""
else
  INPUT="$(mktemp)"
  CLEANUP="$INPUT"
  cat > "$INPUT"
fi
[ -n "$CLEANUP" ] && trap 'rm -f "$CLEANUP"' EXIT

DIR="$(cd "$(dirname "$0")" && pwd)"
python3 - "$INPUT" "$DIR/packs" <<'PYEOF'
import os, re, sys

text = open(sys.argv[1], encoding="utf-8", errors="replace").read()

# --- pattern packs ----------------------------------------------------------------
# Wordlists live in txt packs beside the script (waitdeadai XDG model, lab
# variant), one entry per line, # comments and blank lines skipped. A missing
# pack silently disables the rules it feeds, and the test suite catches that.
PACKDIR = sys.argv[2]

def load_pack(name):
    try:
        lines = open(os.path.join(PACKDIR, name), encoding="utf-8").read().splitlines()
    except OSError:
        return []
    return [l.strip() for l in lines if l.strip() and not l.lstrip().startswith("#")]

# --- text preparation (same as detect-prose.sh) --------------------------------
FENCE = re.compile(r"```.*?```", re.S)
INLINE = re.compile(r"`[^`\n]*`")
def prose(t):
    return INLINE.sub("", FENCE.sub("", t))

p = prose(text)
plines = [l for l in p.split("\n") if l.strip()]

def clip(s, n=70):
    s = re.sub(r"\s+", " ", s).strip()
    return s if len(s) <= n else s[:n - 1] + "…"

hits = []  # (rule_id, matched_text, instruction)

# --- allow clauses ---------------------------------------------------------------
# An escape regex runs before its ban regex: a match whose context also matches
# the allow pattern is not a hit. Each guarded rule's fix text teaches the escape
# phrasing, so a false positive is recoverable on the next rewrite. Backticks and
# fences already escape everything via prose().
ALLOW_R2 = [re.compile(pat, re.I) for pat in load_pack("allow-r2.txt")]
QUOTED = re.compile(r'"[^"\n]{0,300}"')

def sentence_around(t, start, end):
    a = max(t.rfind(".", 0, start), t.rfind("!", 0, start),
            t.rfind("?", 0, start), t.rfind("\n", 0, start)) + 1
    tail = re.search(r"[.!?\n]", t[end:])
    b = end + (tail.end() if tail else len(t) - end)
    return t[a:b]

def in_quotes(line, m):
    return any(q.start() < m.start() and m.end() < q.end()
               for q in QUOTED.finditer(line))

# --- r2: announced comprehension (patterns: packs/sycophancy.txt) ----------------
R2 = [re.compile(pat, re.I) for pat in load_pack("sycophancy.txt")]
for pat in R2:
    for m in pat.finditer(p):
        s = sentence_around(p, m.start(), m.end())
        if any(a.search(s) for a in ALLOW_R2):
            continue
        hits.append(("r2-comprehension", clip(m.group(0)),
                     "Announced comprehension. Delete this phrase; the sentence after it carries the"
                     " content. If Holden asked for this phrasing, keep it and restate the request in"
                     " the same sentence (\"you asked me to ...\"), which this check allows."))

# --- r3: stacked hedges ---------------------------------------------------------
R3 = [re.compile(pat, re.I) for pat in (
    r"\b(?:could|might|may|can)\s+(?:potentially|possibly|perhaps|conceivably|arguably)\b",
    r"\b(?:potentially|possibly|perhaps)\s+(?:could|might|may)\b",
    r"\bseems?\s+(?:like\s+it\s+)?(?:could|might|may)\b",
    r"\bit\s+(?:could|might|may)\s+be\s+(?:possible|argued)\b",
)]
for pat in R3:
    for m in pat.finditer(p):
        hits.append(("r3-hedge-stack", clip(m.group(0)),
                     "Stacked hedges. Keep exactly one qualifier and delete the rest."))

# --- r4: opening narrates an intended action ------------------------------------
R4 = re.compile(
    r"^(?:let me\b|let'?s (?:start|begin|look|check|see|find)\b|i'?ll\b|i will\b"
    r"|i'?m going to\b|i'?m about to\b|now i'?ll\b|now let me\b"
    r"|first,? i'?ll\b|next,? i'?ll\b|going to\b|time to\b"
    r"|i need to (?:check|look|read|find|see)\b|starting (?:by|with)\b)", re.I)
if plines and R4.search(plines[0]):
    hits.append(("r4-opening-narration", clip(plines[0]),
                 "The first line announces what you are about to do. Open with the finding or result instead."))

# --- r5: three or more list items and no reference code -------------------------
R5_BULLETS = re.compile(r"^\s*[-*]\s+\S|^\s*\d+\.\s+\S", re.M)
R5_CODES = re.compile(r"^\s*(?:>\s*)?(?:\*\*)?[A-Z]{1,3}\d+\s+-\s", re.M)
n_bullets = len(R5_BULLETS.findall(p))
if n_bullets >= 3 and not R5_CODES.search(p):
    hits.append(("r5-uncoded-list", f"{n_bullets} list items, zero reference codes",
                 "If these items are findings, risks, decisions, questions, or actions, give each a code"
                 " (F1, R1, D1, Q1, AT1, NA1) under its category header. A list that is none of those"
                 " (e.g. procedure steps) may stay as it is."))

# --- r6: question asked, last line does not carry it -----------------------------
if ("?" in p and plines and "?" not in plines[-1]
        and not plines[-1].lstrip().startswith("➡")):
    hits.append(("r6-buried-question", clip(plines[-1]),
                 "The reply asks a question but its last line (shown) does not carry it. Move every open"
                 " question into a closing block at the end, one decision per question, each with a"
                 " recommendation line opening with ➡."))

# --- r15: a decision asked from inside a non-Questions coded line -----------------
# NA21 (2026-09-08) read "I can add X if you want it" under Next Actions, and the
# call went unasked because a next action is not a place Holden looks for one. The
# code prefix is the signal: every stock code but Q reports something settled, so
# an ask on one of those lines is a question filed where it cannot be answered.
R15_CODE = re.compile(r"^\s*(?:[-*]\s+)?(?:\*\*)?([A-Z][A-Z-]{0,3})\d+\**\s*[-—–:]")
R15_PHRASES = load_pack("ask-phrases.txt")
R15_ASK = (re.compile(r"\b(?:" + "|".join(R15_PHRASES) + r")\b", re.I)
           if R15_PHRASES else None)
for l in p.split("\n"):
    m = R15_CODE.match(l)
    if not m or m.group(1) == "Q":
        continue
    # The question mark itself is the span tested against in_quotes: a wider span
    # starts left of the opening quote, and every line quoting one of Holden's own
    # questions back to him then reads as an ask.
    ask = (R15_ASK.search(l) if R15_ASK else None) or re.search(r"\?", l)
    if ask is None or in_quotes(l, ask):
        continue
    hits.append(("r15-question-outside-round", clip(l),
                 f"{m.group(1)} is a code for something settled, so this line asks Holden a"
                 " question where he cannot answer it. Do not rewrite the reply. Append an E"
                 " line retracting the placement and a Q line asking the same question under"
                 " ## Questions, and leave every other line as it stands."))

# --- r7: em dashes and connector colons ------------------------------------------
R7_COLON = re.compile(r"[a-z)]: [a-z]")
# Divergence from detect-prose.sh: lettered option lines ("a. ...") are the
# compliant question format, so they are skipped alongside the other list
# markers. No URL skip is needed: a URL colon has no space after it, so it can
# never match R7_COLON, and skipping URL lines would hide real connector colons
# sharing a line with a URL.
R7_SKIP = re.compile(r"^\s*(?:[-*#>]|\d+\.|[a-z]\.\s)")
for l in p.split("\n"):
    if not l.strip():
        continue
    for m in re.finditer(r"—", l):
        if in_quotes(l, m):
            continue
        ctx = l[max(0, m.start() - 30):m.end() + 30]
        hits.append(("r7-dash", clip(ctx),
                     "Em dash. Name the relation between the two facts (because, but, so, which) or"
                     " split into two sentences. Text quoted verbatim is exempt when it sits in"
                     " \"double quotes\", backticks, or a code fence."))
    if not R7_SKIP.search(l):
        for m in R7_COLON.finditer(l):
            if in_quotes(l, m):
                continue
            ctx = l[max(0, m.start() - 30):m.end() + 30]
            hits.append(("r7-colon", clip(ctx),
                         "Colon used as a mid-sentence connector. Name the relation instead"
                         " (because, so, which, using). Text quoted verbatim is exempt when it sits"
                         " in \"double quotes\", backticks, or a code fence."))

# --- r8: Evidence/Verification heading -------------------------------------------
R8 = re.compile(r"^#{1,4}\s*(?:evidence|verification)\b", re.I | re.M)
for m in R8.finditer(p):
    hits.append(("r8-evidence-section", clip(m.group(0)),
                 "An evidence section separates evidence from claims. Put each number or output in the"
                 " same sentence as the claim it settles, and delete this section."))

# --- r9: vague quantifiers and propped verbs -------------------------------------
R9_QUANT = re.compile(
    r"\b(?:several|many|numerous|various|a few|a couple of|a handful of|a number of)"
    r"\s+[a-z]+(?:es|s)\b", re.I)
R9_ADVERB = re.compile(
    r"\b(?:significantly|substantially|dramatically|drastically|considerably|greatly|vastly|noticeably)"
    r"\s+(?:improv|increas|reduc|decreas|speed|slow|boost|enhanc|simplif)\w*\b", re.I)
for m in R9_QUANT.finditer(p):
    hits.append(("r9-vague-quantifier", clip(m.group(0)),
                 "Vague quantifier. The count is in the tool output you already have; put the number"
                 " in the sentence."))
for m in R9_ADVERB.finditer(p):
    hits.append(("r9-vague-quantifier", clip(m.group(0)),
                 "Adverb propping up a weak verb. Replace with the measured delta or timing."))

# --- r10: negation-first correction ----------------------------------------------
R10 = [re.compile(pat, re.I) for pat in (
    r"\bisn'?t\b[^.\n]{0,50},\s*it'?s\b",
    r"\bis not\b[^.\n]{0,50},\s*it is\b",
    r"\baren'?t\b[^.\n]{0,50},\s*they'?re\b",
    r"\bwasn'?t\b[^.\n]{0,50},\s*it was\b",
    r"\bdoesn'?t\b[^.\n]{0,50},\s*it\b",
)]
for pat in R10:
    for m in pat.finditer(p):
        if in_quotes(p, m):  # a verbatim mention of the banned form is not a use of it
            continue
        hits.append(("r10-negation-first", clip(m.group(0)),
                     "Negation-first correction. State the correct fact plainly and delete the"
                     " negation-first frame. Text quoted verbatim is exempt when it sits in"
                     " \"double quotes\", backticks, or a code fence."))

# --- r12: slop terms (patterns: packs/slop-terms.txt) -----------------------------
R12 = [re.compile(r"\b(?:" + pat + r")\b", re.I) for pat in load_pack("slop-terms.txt")]
for pat in R12:
    for m in pat.finditer(p):
        hits.append(("r12-slop-term", clip(m.group(0)),
                     "Banned abstract noun or hollow framing (technical-english.md)."
                     " Write the concrete thing: base, way, method, is, has."))

# --- r13: fancy word with a plain replacement (packs/plain-words.txt) --------------
R13 = []
for line in load_pack("plain-words.txt"):
    ban, _, plain = line.rpartition("|")
    if ban and plain:
        R13.append((re.compile(r"\b(?:" + ban + r")\b", re.I), plain))
for pat, plain in R13:
    for m in pat.finditer(p):
        hits.append(("r13-plain-word", clip(m.group(0)),
                     f'Fancy word. Write "{plain}" instead.'))

# --- r14: two terms for one concept (packs/consistency.txt) ------------------------
for line in load_pack("consistency.txt"):
    variants = [v.strip() for v in line.split("|") if v.strip()]
    present = []
    for v in variants:
        n = len(re.findall(r"\b" + re.escape(v) + r"\b", p, re.I))
        if n:
            present.append((v, n))
    if len(present) >= 2:
        found = ", ".join(f"{v} x{n}" for v, n in present)
        keep = max(present, key=lambda t: t[1])[0]
        hits.append(("r14-consistency", clip(found),
                     f'Two terms for one concept. Pick one ("{keep}" is the majority here)'
                     " and use it everywhere in the reply."))

print(f"hits={len(hits)}")
for rule, match, fix in hits:
    print(f"{rule} | {match} | {fix}")
sys.exit(1 if hits else 0)
PYEOF
exit $?
