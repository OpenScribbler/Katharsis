#!/usr/bin/env bash
# audit-rewrite.sh: the deterministic engine behind tier 1 of the katharsis-audit
# skill. Takes the detector's output and rewrites the counts in the installed
# rule files, so the reference audit's numbers become the installer's own.
#
# Modes:
#   check   Resolve every anchor in rules/audit-numbers.yaml against the installed
#           rule files, verify the counts file covers every detector, and print the
#           planned rewrites. Writes nothing.
#   apply   Run every check first, then rewrite. One failed anchor stops the run
#           before any file is touched, so a broken contract never leaves half the
#           counts rewritten.
#
# Anchors match whitespace-normalized text, because the rule files hard-wrap and
# most anchors cross a line break. An anchor matching zero times or more than once
# is a loud failure. Each anchor also matches its own already-measured form, so a
# second audit rewrites the first audit's numbers rather than failing.
#
# A numbered rule swaps its whole sentence rather than its digits, because the
# sentence names whose audit produced the count. Rewriting 6,841 to 1,204 while
# leaving "In the reference audit" in front of it attributes the installer's own
# number to someone else's corpus.
#
# Usage:
#   audit-rewrite.sh check --counts FILE [--dir DIR] [--contract FILE]
#   audit-rewrite.sh apply --counts FILE [--dir DIR] [--contract FILE]
#     --counts FILE   output of scripts/detect-prose.sh
#     --dir DIR       installed rule files (default: ~/.claude/katharsis)
#     --contract FILE audit contract (default: <repo>/rules/audit-numbers.yaml)

set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
CONTRACT="$HERE/../rules/audit-numbers.yaml"
DIR="$HOME/.claude/katharsis"
COUNTS=""

MODE="${1:-}"
case "$MODE" in
  check|apply) shift ;;
  *) echo "usage: audit-rewrite.sh check|apply --counts FILE [options]" >&2; exit 2 ;;
esac

while [ $# -gt 0 ]; do
  case "$1" in
    --counts)   [ $# -ge 2 ] || { echo "--counts requires a value" >&2; exit 2; }; COUNTS="$2"; shift 2 ;;
    --dir)      [ $# -ge 2 ] || { echo "--dir requires a value" >&2; exit 2; }; DIR="$2"; shift 2 ;;
    --contract) [ $# -ge 2 ] || { echo "--contract requires a value" >&2; exit 2; }; CONTRACT="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -n "$COUNTS" ] || { echo "$MODE requires --counts" >&2; exit 2; }
[ -f "$COUNTS" ] || { echo "NOT FOUND: counts file $COUNTS" >&2; exit 2; }
[ -f "$CONTRACT" ] || { echo "NOT FOUND: contract $CONTRACT" >&2; exit 2; }
[ -d "$DIR" ] || { echo "NOT FOUND: rule directory $DIR (run the setup skill first)" >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo "python3 is required and was not found" >&2; exit 2; }

python3 - "$HERE" "$MODE" "$DIR" "$CONTRACT" "$COUNTS" <<'PYEOF'
import os, re, sys, textwrap

sys.path.insert(0, sys.argv[1])
import katharsis_manifest as km

try:
    import yaml
except ImportError:
    print("PyYAML is required and was not found (pip install pyyaml)", file=sys.stderr)
    sys.exit(2)

mode, rules_dir, contract_path, counts_path = sys.argv[2:6]

WIDTH = 100
NUMBER = re.compile(r"\d+(?:,\d{3})*")
PLACEHOLDER = re.compile(r"\{(hits|forms|corpus)\}")
APPENDED = "Your own corpus shows {hits} hits across {corpus} assistant messages."

problems, plan, texts, originals = [], [], {}, {}


def fail(msg):
    problems.append(msg)


def num(value):
    return f"{value:,}"


def norm(text):
    return " ".join(text.split())


def ws_escape(segment):
    """Escape a literal segment so every whitespace run matches any wrapping."""
    tokens = segment.split()
    if not tokens:
        return r"\s+" if segment else ""
    lead = r"\s+" if segment[0].isspace() else ""
    trail = r"\s+" if segment[-1].isspace() else ""
    return lead + r"\s+".join(re.escape(t) for t in tokens) + trail


def build(text, splitter, named=True):
    """Compile `text` into an anchor pattern, with each split token a number slot.

    `named` off drops every group name, so the result nests inside another
    pattern without colliding with its names."""
    parts, last, i = [], 0, 0
    for m in splitter.finditer(text):
        parts.append(ws_escape(text[last:m.start()]))
        parts.append(rf"(?P<n{i}>\d+(?:,\d{{3}})*)" if named else r"\d+(?:,\d{3})*")
        last, i = m.end(), i + 1
    parts.append(ws_escape(text[last:]))
    body = "".join(parts)
    return re.compile(rf"(?P<anchor>{body})" if named else body), i


def rewrap(text, pos):
    """Re-wrap the plain-prose paragraph holding `pos`, leaving lists and code alone."""
    start = text.rfind("\n\n", 0, pos)
    start = 0 if start == -1 else start + 2
    end = text.find("\n\n", pos)
    end = len(text) if end == -1 else end
    lines = text[start:end].split("\n")
    if any(re.match(r"\s*([-*>|#]|\d+\.|```)", line) for line in lines):
        return text
    if any(line.endswith("  ") or line.endswith("\\") for line in lines[:-1]):
        return text   # a Markdown hard break, which re-wrapping would delete
    filled = textwrap.fill(" ".join(line.strip() for line in lines), width=WIDTH,
                           break_long_words=False, break_on_hyphens=False)
    return text[:start] + filled + text[end:]


def load(fname):
    if fname not in texts:
        path = os.path.join(rules_dir, fname)
        if not os.path.isfile(path):
            fail(f"NOT FOUND: rule file {path}")
            texts[fname] = originals[fname] = None
        else:
            texts[fname] = originals[fname] = open(path, encoding="utf-8").read()
    return texts[fname]


# --- the contract ---------------------------------------------------------------
with open(contract_path, encoding="utf-8") as fh:
    contract = yaml.safe_load(fh)

corpus = (contract or {}).get("corpus") or {}
rules = (contract or {}).get("rules") or []
if not corpus or not rules or not corpus.get("swaps"):
    print(f"invalid contract: {contract_path} declares no corpus swaps or no rules", file=sys.stderr)
    sys.exit(2)

seen = set()
for r in rules:
    rid, det = r.get("id"), r.get("detector")
    if not rid or not det:
        print(f"invalid contract: rule {r!r} is missing id or detector", file=sys.stderr)
        sys.exit(2)
    if rid in seen or det in seen:
        print(f"invalid contract: duplicate id or detector for {rid}", file=sys.stderr)
        sys.exit(2)
    seen.update((rid, det))
    if bool(r.get("sentence")) == bool(r.get("append_after")):
        print(f"invalid contract: {rid} needs exactly one of sentence and append_after",
              file=sys.stderr)
        sys.exit(2)
    if r.get("sentence") and not r.get("measured"):
        print(f"invalid contract: {rid} has a sentence anchor and no measured template",
              file=sys.stderr)
        sys.exit(2)
    if bool(r.get("sentence")) != (r.get("reference") is not None):
        print(f"invalid contract: {rid} pairs a sentence anchor with a null reference",
              file=sys.stderr)
        sys.exit(2)

# --- the detector output --------------------------------------------------------
counts_text = open(counts_path, encoding="utf-8").read()
corpus_lines = re.findall(r"^corpus:.*?assistant_messages=(\d+)", counts_text, re.M)
if len(corpus_lines) > 1:
    print(f"DUPLICATE CORPUS LINE: {counts_path} carries {len(corpus_lines)} corpus lines",
          file=sys.stderr)
    print("Two detector runs concatenated would write one run's hits against the other's "
          "denominator. Exiting nonzero.", file=sys.stderr)
    sys.exit(2)
found = re.search(r"^corpus:.*?assistant_messages=(\d+)", counts_text, re.M)
if not found:
    print(f"NO CORPUS LINE: {counts_path} carries no 'corpus: ... assistant_messages=N' line",
          file=sys.stderr)
    print("A count without its denominator cannot be written into the rules. Exiting nonzero.",
          file=sys.stderr)
    sys.exit(2)
corpus_size = int(found.group(1))
if corpus_size == 0:
    print("corpus is zero assistant messages; the corpus is UNMEASURED, not clean", file=sys.stderr)
    sys.exit(2)

measured = {}
for line in counts_text.splitlines():
    m = re.match(r"^(\S+)\s+hits=(\d+)(?:\s+forms=(\d+))?", line)
    if m:
        if m.group(1) in measured:
            print(f"DUPLICATE DETECTOR LINE: {counts_path} carries {m.group(1)} twice",
                  file=sys.stderr)
            print("The later line would silently win. Exiting nonzero.", file=sys.stderr)
            sys.exit(2)
        measured[m.group(1)] = (int(m.group(2)), int(m.group(3)) if m.group(3) else None)

for r in rules:
    if r["detector"] not in measured:
        fail(f"counts file has no line for detector {r['detector']} ({r['id']})")

# --- swaps and appends ----------------------------------------------------------
def swap(fname, label, sentence, template, values):
    """Replace `sentence` (or its already-measured form) with the filled template."""
    ref_pat, ref_slots = build(sentence, NUMBER)
    tpl_pat, tpl_slots = build(template, PLACEHOLDER)
    if ref_slots != tpl_slots:
        fail(f"{label}: sentence holds {ref_slots} numbers and the template holds {tpl_slots}")
        return
    wanted = set(PLACEHOLDER.findall(template))
    missing = sorted(k for k in wanted if values.get(k) is None)
    if missing:
        fail(f"{label}: template needs {', '.join(missing)} and the counts file reports none")
        return
    text = load(fname)
    if text is None:
        return
    found = list(ref_pat.finditer(text)) + list(tpl_pat.finditer(text))
    if len(found) != 1:
        fail(f"{label}: anchor matches {len(found)} times in {fname}, needs exactly 1: {sentence!r}")
        return
    m = found[0]
    filled = template.format(**{k: num(v) for k, v in values.items() if v is not None})
    if norm(m.group("anchor")) == norm(filled):
        plan.append(f"{label}: {fname} already reads the measured sentence")
        return
    plan.append(f"{label}: {norm(m.group('anchor'))!r} -> {filled!r}")
    if mode != "apply":
        return
    texts[fname] = text[:m.start()] + filled + text[m.end():]
    texts[fname] = rewrap(texts[fname], m.start())


def append(fname, label, sentence, hits):
    """Append a measured sentence after `sentence`, or refresh the one already there."""
    anchor_pat, slots = build(sentence, PLACEHOLDER)
    if slots:
        fail(f"{label}: an append_after anchor must hold no placeholders")
        return
    tail_pat, _ = build(APPENDED, PLACEHOLDER, named=False)
    combined = re.compile(anchor_pat.pattern + r"(?P<measured>\s+" + tail_pat.pattern + r")?")
    text = load(fname)
    if text is None:
        return
    found = list(combined.finditer(text))
    if len(found) != 1:
        fail(f"{label}: anchor matches {len(found)} times in {fname}, needs exactly 1: {sentence!r}")
        return
    m = found[0]
    filled = APPENDED.format(hits=num(hits), corpus=num(corpus_size))
    if m.group("measured") and norm(m.group("measured")) == norm(filled):
        plan.append(f"{label}: {fname} already reads {num(hits)} hits")
        return
    plan.append(f"{label}: {'refresh' if m.group('measured') else 'append'} {filled!r}")
    if mode != "apply":
        return
    texts[fname] = text[:m.start()] + m.group("anchor") + " " + filled + text[m.end():]
    texts[fname] = rewrap(texts[fname], m.start())


corpus_file = corpus.get("file")
for i, entry in enumerate(corpus["swaps"], 1):
    swap(corpus_file, f"corpus swap {i}", entry["sentence"], entry["measured"],
         {"corpus": corpus_size})

for r in rules:
    if r["detector"] not in measured:
        continue
    hits, forms = measured[r["detector"]]
    fname = r.get("file") or corpus_file
    if r.get("sentence"):
        swap(fname, r["id"], r["sentence"], r["measured"],
             {"hits": hits, "forms": forms, "corpus": corpus_size})
    else:
        append(fname, r["id"], r["append_after"], hits)

# --- report or write ------------------------------------------------------------
if problems:
    for p in problems:
        print(f"REWRITE FAILED: {p}", file=sys.stderr)
    print(f"{len(problems)} anchor or count problems; nothing was written", file=sys.stderr)
    sys.exit(1)

for line in plan:
    print(line)
print(f"corpus: {num(corpus_size)} assistant messages")

if mode == "apply":
    changed = [f for f, t in sorted(texts.items()) if t is not None and t != originals[f]]
    manifest = km.load(rules_dir)
    if manifest is None and changed:
        print("WARNING: no install manifest at "
              f"{km.manifest_path(rules_dir)}; this rewrite will not be recorded, "
              "and an uninstall will treat the rewritten files as yours",
              file=sys.stderr)
    # A file edited since the install is the installer's now, and rewriting it
    # would fold their edit into a hash the manifest claims as Katharsis's, so
    # an uninstall would delete their work. Reseal first to adopt the edit.
    if manifest is not None:
        for fname in changed:
            entry = km.find_file(manifest, fname)
            if entry is None:
                continue
            before = km.sha256_bytes(originals[fname].encode("utf-8"))
            if not km.owns_content(manifest, entry, before):
                print(f"REWRITE REFUSED: {fname} was edited since the install, so the "
                      "rewrite would claim your edit as Katharsis's. Run "
                      f"setup-rules.sh reseal --dest {rules_dir} first, then re-run "
                      "this audit. Nothing was written.", file=sys.stderr)
                sys.exit(1)
    saved = {}
    if manifest is not None:
        for fname in changed:
            path = os.path.join(rules_dir, fname)
            # Save the sentences as they read before this audit, so the rewrite
            # has a way back rather than only a way forward.
            saved[fname] = km.archive(rules_dir, path, fname + ".pre-audit")
            # The manifest's hash for this file has to follow the rewrite, or an
            # uninstall reads Katharsis's own edit as the installer's and keeps it.
            entry = km.find_file(manifest, fname)
            digest = km.sha256_bytes(texts[fname].encode("utf-8"))
            if entry is not None:
                entry["sha256"] = digest
                entry.pop("sha256_before", None)
            manifest.setdefault("audit", []).append({
                "name": fname,
                "archived_to": saved[fname],
                "sha256_before": km.sha256_bytes(originals[fname].encode("utf-8")),
                "sha256_after": digest,
                "corpus_size": corpus_size,
                "rewritten_at": km.now(),
            })
        if changed:
            # Saved before any file is written, so a crash mid-rewrite leaves a
            # manifest that over-claims, which km.owns_content reads through,
            # rather than a rewrite the manifest reads as the installer's edit.
            km.save(rules_dir, manifest)
    for fname in changed:
        km.write_atomic(os.path.join(rules_dir, fname), texts[fname])
        if fname in saved:
            print(f"saved {fname} as it read before this audit to {saved[fname]}")
    if changed:
        print(f"rewrote {len(changed)} file(s) in {rules_dir}: {', '.join(changed)}")
        if manifest is not None:
            print(f"recorded the rewrite in {km.manifest_path(rules_dir)}")
    else:
        print(f"already measured: {len(texts)} file(s) in {rules_dir} need no change")
else:
    print(f"check passed: {len(rules)} rules and {len(corpus['swaps'])} corpus swaps "
          f"all resolve in {rules_dir}")
PYEOF
exit $?
