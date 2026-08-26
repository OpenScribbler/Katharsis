#!/usr/bin/env bash
# detect-prose.sh: the Katharsis detector. Counts all eleven failure modes in the
# installer's Claude Code session transcripts. Deterministic, no model in the loop.
#
# Read-only: reads transcripts, prints counts, writes nothing. Targets the Claude
# Code default layout (~/.claude/projects). On another harness, adapt --root.
#
# Every count is reported with the corpus size that produced it, because a count
# without its denominator cannot be compared to the reference audit's. A missing
# corpus is a loud nonzero failure, never a row of zeros that reads as clean prose.
#
# Detector ids match rules/audit-numbers.yaml. r2 and r11 report two numbers,
# hits and distinct surface forms, because the form count gates rule derivation.
#
# Usage: detect-prose.sh [--root DIR] [--days N]
#   --root DIR   config root holding projects/ (default: ~/.claude)
#   --days N     only transcripts modified in the last N days (default: all)

set -u

ROOT="${HOME}/.claude"
DAYS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --root) [ $# -ge 2 ] || { echo "--root requires a value" >&2; exit 2; }; ROOT="$2"; shift 2 ;;
    --days) [ $# -ge 2 ] || { echo "--days requires a value" >&2; exit 2; }; DAYS="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
case "$DAYS" in
  ''|*[!0-9]*) echo "--days must be a nonnegative integer, got: $DAYS" >&2; exit 2 ;;
esac

PROJECTS="$ROOT/projects"

fail() { echo "NOT FOUND: $1" >&2; echo "The corpus is UNMEASURED, not clean. Exiting nonzero." >&2; exit 2; }

command -v python3 >/dev/null 2>&1 || { echo "python3 is required and was not found" >&2; exit 2; }
[ -d "$PROJECTS" ] || fail "$PROJECTS (no session transcripts at this root; pass --root)"

if [ "$DAYS" -gt 0 ]; then
  SINCE="$(date -d "-${DAYS} days" +%F 2>/dev/null || date -v -"${DAYS}"d +%F 2>/dev/null)"
  [ -n "$SINCE" ] || { echo "could not compute date window" >&2; exit 2; }
  FILES=$(find "$PROJECTS" -name '*.jsonl' -type f -newermt "$SINCE" 2>/dev/null)
  WINDOW="last $DAYS days (since $SINCE)"
else
  FILES=$(find "$PROJECTS" -name '*.jsonl' -type f 2>/dev/null)
  WINDOW="all transcripts"
fi

[ -n "$FILES" ] || fail "no .jsonl transcripts under $PROJECTS in window ($WINDOW)"

echo "katharsis detect-prose"
echo "root: $ROOT   window: $WINDOW"

FILELIST=$(mktemp)
trap 'rm -f "$FILELIST"' EXIT
printf '%s\n' "$FILES" > "$FILELIST"

python3 - "$FILELIST" <<'PYEOF'
import json, re, sys, collections

files = [l for l in open(sys.argv[1]).read().splitlines() if l.strip()]

# --- text preparation ---------------------------------------------------------
# Detection runs on prose. Fenced code blocks and inline code spans are stripped
# first, because colons, dashes, and question marks inside code are not writing.
FENCE = re.compile(r"```.*?```", re.S)
INLINE = re.compile(r"`[^`\n]*`")
def prose(t):
    return INLINE.sub("", FENCE.sub("", t))

def norm(s):
    return re.sub(r"\s+", " ", s.lower()).strip(" .,!:;")

# --- detectors ----------------------------------------------------------------
# r1: assistant reports a build/test/lint/gate result the preceding user turn
# never asked about.
R1_GATES = re.compile(
    r"\b(?:all (?:gates|checks|tests) pass(?:ed)?"
    r"|build (?:passed|succeeded)"
    r"|tests? (?:pass|passed|are passing|all pass)"
    r"|lint (?:passes|passed|is clean)"
    r"|typecheck passe[sd])\b", re.I)
R1_USER = re.compile(r"\b(?:build|test|tests|vitest|ci|lint|gate|gates|typecheck|check|checks)\b", re.I)

# r2: announced comprehension. Hits and distinct surface forms.
R2 = [re.compile(p, re.I) for p in (
    r"\bnow i (?:can )?(?:see|understand|know|have)\b[^.!?\n]{0,50}",
    r"\bthat (?:clarifies|explains|makes sense)\b[^.!?\n]{0,30}",
    r"\bgood catch\b",
    r"\bgreat question\b",
    r"\bexcellent (?:question|point|catch)\b",
    r"\byou'?re (?:absolutely |completely |totally )?right\b",
    r"\bthat'?s (?:exactly|precisely) (?:it|right|what)\b",
    r"\bi see (?:what|the|it) \w+\b",
    r"\bmakes sense now\b",
)]

# r3: two or more stacked hedges in one clause.
R3 = [re.compile(p, re.I) for p in (
    r"\b(?:could|might|may|can)\s+(?:potentially|possibly|perhaps|conceivably|arguably)\b",
    r"\b(?:potentially|possibly|perhaps)\s+(?:could|might|may)\b",
    r"\bseems?\s+(?:like\s+it\s+)?(?:could|might|may)\b",
    r"\bit\s+(?:could|might|may)\s+be\s+(?:possible|argued)\b",
)]

# r4: first non-empty line announces an intended action instead of a result.
R4 = re.compile(
    r"^(?:let me\b|let'?s (?:start|begin|look|check|see|find)\b|i'?ll\b|i will\b"
    r"|i'?m going to\b|i'?m about to\b|now i'?ll\b|now let me\b"
    r"|first,? i'?ll\b|next,? i'?ll\b|going to\b|time to\b"
    r"|i need to (?:check|look|read|find|see)\b|starting (?:by|with)\b)", re.I)

# r5: three or more list items and no reference code anywhere in the message.
R5_BULLETS = re.compile(r"^\s*[-*]\s+\S|^\s*\d+\.\s+\S", re.M)
R5_CODES = re.compile(r"^\s*(?:>\s*)?(?:\*\*)?[A-Z]{1,3}\d+\s+-\s", re.M)

# r6: the message asks a question and the last non-empty line does not carry it.
# A last line opening with the recommendation arrow is the compliant question
# format's closing line, so it counts as carrying the ask. (checked inline below)

# r7: em dashes, plus a colon used as a mid-sentence connector. Connector colons
# are counted only on prose lines: not headings, not list items, not lines
# carrying a URL, and only when lowercase prose continues after the colon.
R7_DASH = re.compile(r"—")
R7_COLON = re.compile(r"[a-z)]: [a-z]")
R7_SKIP = re.compile(r"^\s*(?:[-*#>]|\d+\.)|://")

# r8: an Evidence or Verification heading, which separates evidence from claim.
R8 = re.compile(r"^#{1,4}\s*(?:evidence|verification)\b", re.I | re.M)

# r9: vague quantifier before a plural noun, plus adverbs propping up weak verbs.
R9_QUANT = re.compile(
    r"\b(?:several|many|numerous|various|a few|a couple of|a handful of|a number of)"
    r"\s+[a-z]+(?:es|s)\b", re.I)
R9_ADVERB = re.compile(
    r"\b(?:significantly|substantially|dramatically|drastically|considerably|greatly|vastly|noticeably)"
    r"\s+(?:improv|increas|reduc|decreas|speed|slow|boost|enhanc|simplif)\w*\b", re.I)

# r10: the "X isn't Y, it's Z" construction.
R10 = [re.compile(p, re.I) for p in (
    r"\bisn'?t\b[^.\n]{0,50},\s*it'?s\b",
    r"\bis not\b[^.\n]{0,50},\s*it is\b",
    r"\baren'?t\b[^.\n]{0,50},\s*they'?re\b",
    r"\bwasn'?t\b[^.\n]{0,50},\s*it was\b",
    r"\bdoesn'?t\b[^.\n]{0,50},\s*it\b",
)]

# r11: synonym drift, probed on the one concept every corpus states most:
# checks passing. Hits and distinct surface forms.
R11 = re.compile(
    r"\b(?:all |the |both |every )?"
    r"(?:tests?|checks?|builds?|lint|linting|typecheck|gates?|suite|ci|everything)"
    r"\s+(?:now\s+|still\s+|all\s+)?"
    r"(?:pass(?:es|ed)?|passing|succeed(?:s|ed)?|green|clean|compil(?:es|ed)"
    r"|builds? (?:fine|cleanly|successfully)"
    r"|works? (?:fine|now|correctly|as expected)"
    r"|runs? (?:clean|green|fine))\b", re.I)

counts = collections.Counter()
r2_forms, r11_forms = set(), set()
n_files = len(files)
n_lines = n_msgs = n_blocks = 0

for f in files:
    try:
        fh = open(f, encoding="utf-8", errors="replace")
    except OSError:
        continue
    prev_user = ""
    for line in fh:
        n_lines += 1
        try:
            o = json.loads(line)
        except json.JSONDecodeError:
            continue
        t = o.get("type")
        cont = (o.get("message") or {}).get("content")
        if isinstance(cont, list):
            blocks = [b.get("text", "") for b in cont
                      if isinstance(b, dict) and b.get("type") == "text"]
        elif isinstance(cont, str):
            blocks = [cont]
        else:
            blocks = []
        txt = "\n".join(blocks)
        if t == "user":
            prev_user = txt
            continue
        if t != "assistant" or not txt.strip():
            continue
        n_msgs += 1
        n_blocks += sum(1 for b in blocks if b.strip())
        p = prose(txt)
        plines = [l for l in p.split("\n") if l.strip()]

        if R1_GATES.search(p) and not R1_USER.search(prev_user):
            counts["r1"] += 1
        for pat in R2:
            for m in pat.findall(p):
                counts["r2"] += 1
                r2_forms.add(norm(m if isinstance(m, str) else m[0]))
        for pat in R3:
            counts["r3"] += len(pat.findall(p))
        if plines and R4.search(plines[0]):
            counts["r4"] += 1
        if len(R5_BULLETS.findall(p)) >= 3 and not R5_CODES.search(p):
            counts["r5"] += 1
        if ("?" in p and plines and "?" not in plines[-1]
                and not plines[-1].lstrip().startswith("➡")):
            counts["r6"] += 1
        emd = len(R7_DASH.findall(p))
        col = sum(len(R7_COLON.findall(l)) for l in plines if not R7_SKIP.search(l))
        counts["r7_emdash"] += emd
        counts["r7_colon"] += col
        counts["r8"] += len(R8.findall(p))
        counts["r9"] += len(R9_QUANT.findall(p)) + len(R9_ADVERB.findall(p))
        for pat in R10:
            counts["r10"] += len(pat.findall(p))
        for m in R11.findall(p):
            counts["r11"] += 1
            r11_forms.add(norm(m))
    fh.close()

if n_blocks == 0:
    print("NOT FOUND: transcripts were located but contain zero assistant text blocks.",
          file=sys.stderr)
    print("The corpus is UNMEASURED, not clean. Exiting nonzero.", file=sys.stderr)
    sys.exit(2)

print(f"corpus: files={n_files} jsonl_lines={n_lines} "
      f"assistant_messages={n_msgs} text_blocks={n_blocks}")
print()
print(f"r1-unasked-status    hits={counts['r1']}")
print(f"r2-comprehension     hits={counts['r2']} forms={len(r2_forms)}")
print(f"r3-hedge-stack       hits={counts['r3']}")
print(f"r4-opening-narration hits={counts['r4']}")
print(f"r5-uncoded-list      hits={counts['r5']}")
print(f"r6-buried-question   hits={counts['r6']}")
print(f"r7-dash              hits={counts['r7_emdash'] + counts['r7_colon']} "
      f"emdash={counts['r7_emdash']} colon={counts['r7_colon']}")
print(f"r8-evidence-section  hits={counts['r8']}")
print(f"r9-vague-quantifier  hits={counts['r9']}")
print(f"r10-negation-first   hits={counts['r10']}")
print(f"r11-synonym-drift    hits={counts['r11']} forms={len(r11_forms)}")
print()
print("Every hits= value above is comparable only against this corpus line.")
print("Spot-check at least two counts by hand before trusting any of them.")
PYEOF
exit $?
