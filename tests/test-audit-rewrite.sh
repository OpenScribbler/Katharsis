#!/usr/bin/env bash
# Black-box suite for scripts/audit-rewrite.sh. The fixture plants one anchor of
# every shape the live contract uses (a corpus swap carrying {corpus}, a one-number
# rule, a two-number rule, an append_after rule, and an append_after anchor inside
# a list), and every anchor is deliberately hard-wrapped across a line break,
# because surviving the wrap is the property the script exists to have.
#
# The live repo contract runs here too, so a rule file edited out from under
# rules/audit-numbers.yaml fails this suite rather than the installer's install.

set -eu
REPO="$(cd "$(dirname "$0")/.." && pwd)"
REWRITE="$REPO/scripts/audit-rewrite.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

FAILS=0
CASE=""

fail() { echo "  FAIL [$CASE] $*"; FAILS=$((FAILS + 1)); }

run() { RC=0; OUT=$("$REWRITE" "$@" 2>&1) || RC=$?; }

assert_rc() { [ "$RC" -eq "$1" ] || fail "expected exit $1, got $RC; output: $OUT"; }
assert_out() { echo "$OUT" | grep -Eq "$1" || fail "expected /$1/ in output; got: $OUT"; }
assert_out_lacks() { ! echo "$OUT" | grep -Eq "$1" || fail "expected no /$1/; got: $OUT"; }

# The rule files hard-wrap, so every content assertion runs against the file
# flattened to one line. A grep that fails at a line break would pass or fail for
# reasons having nothing to do with the rewrite.
flat() { tr '\n' ' ' < "$1" | tr -s ' '; }
assert_has() { flat "$1" | grep -Fq -e "$2" || fail "expected $1 to contain '$2'"; }
assert_lacks() { ! flat "$1" | grep -Fq -e "$2" || fail "expected $1 to not contain '$2'"; }
assert_count() {
  got=$(flat "$1" | grep -Fo -e "$2" | wc -l)
  [ "$got" -eq "$3" ] || fail "expected '$2' $3 times in $1, found $got"
}

# --- the fixture ----------------------------------------------------------------
FIX="$TMP/fix"
mkdir -p "$FIX/dir"

cat > "$FIX/contract.yaml" <<'EOF'
corpus:
  file: alpha.md
  unit: assistant messages
  reference: 6841
  swaps:
    - sentence: "These rules come from a reference audit of 6,841 messages written to one reader."
      measured: "These rules were measured against {corpus} messages written to you."
rules:
  - id: a1
    name: One number
    detector: a1-one
    method: one number in the sentence
    file: alpha.md
    sentence: "the reference audit found 8,862 of them"
    measured: "your own corpus shows {hits} of them"
    append_after: null
    reference: 8862
  - id: a2
    name: Two numbers
    detector: a2-two
    method: hits and forms in one sentence
    file: alpha.md
    sentence: "In the reference audit, 73 messages announced comprehension in 67 different phrasings"
    measured: "In your own corpus, {hits} messages announced comprehension in {forms} different phrasings"
    append_after: null
    reference: [73, 67]
  - id: a3
    name: Append to prose
    detector: a3-append
    method: no number in the rule today
    file: alpha.md
    sentence: null
    measured: null
    append_after: "A stack of hedges says less than a single hedge does."
    reference: null
  - id: a4
    name: Append inside a list
    detector: a4-list
    method: no number, and the anchor sits in a list
    file: alpha.md
    sentence: null
    measured: null
    append_after: "The list item anchor sits here."
    reference: null

  - id: a5
    name: Append below a hard break
    detector: a5-break
    method: no number, and the anchor sits under a Markdown hard break
    file: alpha.md
    sentence: null
    measured: null
    append_after: "The a5 anchor sits here."
    reference: null
EOF

cat > "$FIX/dir/alpha.md" <<'EOF'
# Alpha

These rules come from a reference audit of 6,841 messages written to one
reader. Filler that follows the corpus sentence.

A dash sets two facts side by side, and the reference audit found 8,862 of
them. A colon fails the same way.

Give me the content you just grasped. In the reference audit, 73 messages
announced comprehension in 67 different phrasings, which is why a wordlist
cannot catch this.

One qualifier carries the doubt, so cut the rest. A stack of hedges says less
than a single hedge does.

- The list item anchor sits here.
- A second item that must stay on its own line.

Evidence sits next to the claim.  
The a5 anchor sits here.
EOF

cat > "$FIX/counts.txt" <<'EOF'
katharsis detect-prose
root: /nowhere/.claude   window: all transcripts
corpus: files=2 jsonl_lines=40 assistant_messages=1234 text_blocks=60

a1-one    hits=602
a2-two    hits=12 forms=9
a3-append hits=7
a4-list   hits=5
a5-break  hits=3
EOF

clone() { rm -rf "${TMP:?}/${1:?}"; mkdir -p "$TMP/$1"; cp "$FIX/dir"/*.md "$TMP/$1/"; }
sum_of() { md5sum "$1" | cut -d' ' -f1; }

# --- check resolves every anchor without writing --------------------------------
CASE="check-fixture"
clone w1
BEFORE=$(sum_of "$TMP/w1/alpha.md")
run check --counts "$FIX/counts.txt" --dir "$TMP/w1" --contract "$FIX/contract.yaml"
assert_rc 0
assert_out '^check passed: 5 rules and 1 corpus swaps'
assert_out '^corpus: 1,234 assistant messages$'
[ "$(sum_of "$TMP/w1/alpha.md")" = "$BEFORE" ] || fail "check wrote to the rule file"

CASE="check-live-contract"
clone live
cp "$REPO/rules"/*.md "$TMP/live/"
cat > "$TMP/livecounts.txt" <<'EOF'
corpus: files=9 jsonl_lines=800 assistant_messages=2048 text_blocks=900

r1-unasked-status    hits=41
r2-comprehension     hits=12 forms=9
r3-hedge-stack       hits=7
r4-opening-narration hits=88
r5-uncoded-list      hits=53
r6-buried-question   hits=19
r7-dash              hits=602 emdash=580 colon=22
r8-evidence-section  hits=3
r9-vague-quantifier  hits=31
r10-negation-first   hits=5
r11-synonym-drift    hits=64 forms=17
EOF
run check --counts "$TMP/livecounts.txt" --dir "$TMP/live"
assert_rc 0
assert_out '^check passed: 11 rules and 2 corpus swaps'

# --- apply lands every anchor shape ---------------------------------------------
CASE="apply-fixture"
clone w2
run apply --counts "$FIX/counts.txt" --dir "$TMP/w2" --contract "$FIX/contract.yaml"
assert_rc 0
assert_out '^rewrote 1 file\(s\)'
A="$TMP/w2/alpha.md"
assert_has "$A" "These rules were measured against 1,234 messages written to you."
assert_lacks "$A" "a reference audit of 6,841 messages"
assert_has "$A" "and your own corpus shows 602 of them."
assert_lacks "$A" "the reference audit found 8,862"
assert_has "$A" "In your own corpus, 12 messages announced comprehension in 9 different phrasings,"
assert_lacks "$A" "In the reference audit,"
assert_has "$A" "A stack of hedges says less than a single hedge does. Your own corpus shows 7 hits across 1,234 assistant messages."
assert_count "$A" "Your own corpus shows" 3

CASE="apply-leaves-lists-alone"
[ "$(grep -c '^- ' "$A")" -eq 2 ] || fail "list lines were rewrapped: $(grep -c '^- ' "$A") remain"
assert_has "$A" "The list item anchor sits here. Your own corpus shows 5 hits across 1,234 assistant messages."
assert_has "$A" "- A second item that must stay on its own line."

CASE="apply-keeps-a-markdown-hard-break"
assert_has "$A" "The a5 anchor sits here. Your own corpus shows 3 hits across 1,234 assistant messages."
grep -q 'Evidence sits next to the claim\.  $' "$A" || fail "the rewrite deleted a Markdown hard break"

CASE="apply-rewraps-prose-to-100"
LONGEST=$(awk '{ if (length > m) m = length } END { print m }' "$A")
[ "$LONGEST" -le 100 ] || fail "rewrapped prose reached $LONGEST columns"

# --- idempotency and re-audit ---------------------------------------------------
# --- the rewrite is reversible ---------------------------------------------------
# A tier-1 audit rewrites installed rule files. Without a saved copy the
# reference counts are unrecoverable, and without a manifest update an
# uninstall reads Katharsis's own rewrite as the installer's edit and keeps
# the file forever.
CASE="apply-warns-when-no-manifest-records-it"
assert_out 'WARNING: no install manifest'

CASE="apply-saves-the-pre-audit-copy-and-updates-the-manifest"
clone w3
python3 - "$TMP/w3" <<'PY2'
import hashlib, json, os, sys
dest = sys.argv[1]
files = []
for name in sorted(os.listdir(dest)):
    if not name.endswith(".md"):
        continue
    with open(os.path.join(dest, name), "rb") as fh:
        files.append({"name": name, "sha256": hashlib.sha256(fh.read()).hexdigest(),
                      "state": "created"})
json.dump({"version": 1, "tool": "katharsis", "backend": "native",
           "installed_at": "2026-01-01T00:00:00Z", "dest": dest,
           "dest_display": dest, "files": files, "memory_file": None,
           "settings": [], "audit": []},
          open(os.path.join(dest, ".katharsis-install.json"), "w"), indent=2)
PY2
BEFORE=$(cat "$TMP/w3/alpha.md")
run apply --counts "$FIX/counts.txt" --dir "$TMP/w3" --contract "$FIX/contract.yaml"
assert_rc 0
assert_out 'saved alpha\.md as it read before this audit'
assert_out 'recorded the rewrite in'
assert_out_lacks 'WARNING: no install manifest'
SAVED="$TMP/w3/.katharsis-displaced/alpha.md.pre-audit"
[ -f "$SAVED" ] || fail "no pre-audit copy was saved"
[ "$BEFORE" = "$(cat "$SAVED")" ] || fail "the saved copy is not the file as it read before"
grep -Fq 'a reference audit of 6,841 messages' "$SAVED" \
  || fail "the saved copy lost the reference counts"

CASE="apply-keeps-the-manifest-hash-in-step-with-the-rewrite"
python3 - "$TMP/w3" <<'PY2'
import hashlib, json, os, sys
dest = sys.argv[1]
data = json.load(open(os.path.join(dest, ".katharsis-install.json")))
entry = next(f for f in data["files"] if f["name"] == "alpha.md")
with open(os.path.join(dest, "alpha.md"), "rb") as fh:
    actual = hashlib.sha256(fh.read()).hexdigest()
if entry["sha256"] != actual:
    print("MANIFEST HASH IS STALE", file=sys.stderr)
    raise SystemExit(1)
audit = data["audit"]
if len(audit) != 1 or audit[0]["name"] != "alpha.md":
    print("AUDIT ENTRY MISSING", file=sys.stderr)
    raise SystemExit(1)
if audit[0]["sha256_before"] == audit[0]["sha256_after"]:
    print("AUDIT ENTRY RECORDS NO CHANGE", file=sys.stderr)
    raise SystemExit(1)
PY2
[ $? -eq 0 ] || fail "the manifest did not follow the rewrite"

CASE="apply-refuses-a-file-edited-since-the-install"
# A rewrite of an installer-edited file would reseal their edit under a hash
# the manifest claims as Katharsis's, so a later uninstall would delete it.
clone w3b
python3 - "$TMP/w3b" <<'PY2'
import hashlib, json, os, sys
dest = sys.argv[1]
files = []
for name in sorted(os.listdir(dest)):
    if not name.endswith(".md"):
        continue
    with open(os.path.join(dest, name), "rb") as fh:
        files.append({"name": name, "sha256": hashlib.sha256(fh.read()).hexdigest(),
                      "state": "created"})
json.dump({"version": 1, "tool": "katharsis", "backend": "native",
           "installed_at": "2026-01-01T00:00:00Z", "dest": dest,
           "dest_display": dest, "files": files, "memory_file": None,
           "settings": [], "audit": []},
          open(os.path.join(dest, ".katharsis-install.json"), "w"), indent=2)
PY2
printf '\nMy own closing rule.\n' >> "$TMP/w3b/alpha.md"
BEFORE3B=$(sum_of "$TMP/w3b/alpha.md")
run apply --counts "$FIX/counts.txt" --dir "$TMP/w3b" --contract "$FIX/contract.yaml"
assert_rc 1
assert_out 'REWRITE REFUSED: alpha\.md was edited since the install'
assert_out 'reseal'
[ "$(sum_of "$TMP/w3b/alpha.md")" = "$BEFORE3B" ] || fail "a refused rewrite still wrote the file"

CASE="apply-after-a-crash-mid-rewrite-is-not-refused"
# The manifest is saved before the files are written, so a crash between the
# two leaves the file at the audit record's sha256_before while the entry
# claims sha256_after. Putting the pre-audit copy back reproduces that state,
# and the next apply has to read it as Katharsis's rather than refuse it.
clone w3c
python3 - "$TMP/w3c" <<'PY2'
import hashlib, json, os, sys
dest = sys.argv[1]
files = []
for name in sorted(os.listdir(dest)):
    if not name.endswith(".md"):
        continue
    with open(os.path.join(dest, name), "rb") as fh:
        files.append({"name": name, "sha256": hashlib.sha256(fh.read()).hexdigest(),
                      "state": "created"})
json.dump({"version": 1, "tool": "katharsis", "backend": "native",
           "installed_at": "2026-01-01T00:00:00Z", "dest": dest,
           "dest_display": dest, "files": files, "memory_file": None,
           "settings": [], "audit": []},
          open(os.path.join(dest, ".katharsis-install.json"), "w"), indent=2)
PY2
run apply --counts "$FIX/counts.txt" --dir "$TMP/w3c" --contract "$FIX/contract.yaml"
assert_rc 0
cp "$TMP/w3c/.katharsis-displaced/alpha.md.pre-audit" "$TMP/w3c/alpha.md"
run apply --counts "$FIX/counts.txt" --dir "$TMP/w3c" --contract "$FIX/contract.yaml"
assert_rc 0
assert_out_lacks 'REWRITE REFUSED'
assert_has "$TMP/w3c/alpha.md" "These rules were measured against 1,234 messages written to you."

CASE="apply-twice-is-a-no-op"
FIRST=$(sum_of "$A")
run apply --counts "$FIX/counts.txt" --dir "$TMP/w2" --contract "$FIX/contract.yaml"
assert_rc 0
assert_out 'already reads'
assert_out_lacks '\-> '
assert_out 'already measured'
[ "$(sum_of "$A")" = "$FIRST" ] || fail "a second apply changed the file"

CASE="apply-twice-opens-nothing-for-writing"
chmod 444 "$A"
run apply --counts "$FIX/counts.txt" --dir "$TMP/w2" --contract "$FIX/contract.yaml"
chmod 644 "$A"
assert_rc 0
assert_out 'already measured'

CASE="re-audit-refreshes-numbers"
sed -e 's/assistant_messages=1234/assistant_messages=2000/' -e 's/hits=7$/hits=99/' \
  "$FIX/counts.txt" > "$TMP/counts2.txt"
run apply --counts "$TMP/counts2.txt" --dir "$TMP/w2" --contract "$FIX/contract.yaml"
assert_rc 0
assert_has "$A" "These rules were measured against 2,000 messages written to you."
assert_has "$A" "A stack of hedges says less than a single hedge does. Your own corpus shows 99 hits across 2,000 assistant messages."
assert_count "$A" "Your own corpus shows" 3
assert_has "$A" "In your own corpus, 12 messages announced comprehension in 9 different phrasings,"
assert_has "$A" "- The list item anchor sits here. Your own corpus shows 5 hits across 2,000 assistant messages."

# --- failure paths: the counts file ---------------------------------------------
CASE="counts-with-two-corpus-lines"
clone wdup
BEFORE=$(sum_of "$TMP/wdup/alpha.md")
cat "$FIX/counts.txt" "$FIX/counts.txt" > "$TMP/twice.txt"
run apply --counts "$TMP/twice.txt" --dir "$TMP/wdup" --contract "$FIX/contract.yaml"
assert_rc 2
assert_out 'DUPLICATE CORPUS LINE'
[ "$(sum_of "$TMP/wdup/alpha.md")" = "$BEFORE" ] || fail "a refused counts file still wrote"

CASE="counts-with-a-detector-line-twice"
clone wdup2
BEFORE=$(sum_of "$TMP/wdup2/alpha.md")
sed 's/^a3-append hits=7$/a3-append hits=7\na3-append hits=8/' "$FIX/counts.txt" > "$TMP/dupdet.txt"
run apply --counts "$TMP/dupdet.txt" --dir "$TMP/wdup2" --contract "$FIX/contract.yaml"
assert_rc 2
assert_out 'DUPLICATE DETECTOR LINE'
[ "$(sum_of "$TMP/wdup2/alpha.md")" = "$BEFORE" ] || fail "a refused counts file still wrote"

CASE="counts-without-a-corpus-line"
clone w3
BEFORE=$(sum_of "$TMP/w3/alpha.md")
grep -v '^corpus:' "$FIX/counts.txt" > "$TMP/nocorpus.txt"
run apply --counts "$TMP/nocorpus.txt" --dir "$TMP/w3" --contract "$FIX/contract.yaml"
assert_rc 2
assert_out 'NO CORPUS LINE'
[ "$(sum_of "$TMP/w3/alpha.md")" = "$BEFORE" ] || fail "wrote despite a missing corpus line"

CASE="corpus-of-zero-is-unmeasured"
sed 's/assistant_messages=1234/assistant_messages=0/' "$FIX/counts.txt" > "$TMP/zero.txt"
run apply --counts "$TMP/zero.txt" --dir "$TMP/w3" --contract "$FIX/contract.yaml"
assert_rc 2
assert_out 'UNMEASURED, not clean'

CASE="counts-missing-a-detector"
grep -v '^a3-append' "$FIX/counts.txt" > "$TMP/nodet.txt"
run apply --counts "$TMP/nodet.txt" --dir "$TMP/w3" --contract "$FIX/contract.yaml"
assert_rc 1
assert_out 'no line for detector a3-append'
assert_out 'nothing was written'
[ "$(sum_of "$TMP/w3/alpha.md")" = "$BEFORE" ] || fail "wrote despite a missing detector line"

CASE="two-number-rule-without-forms"
sed 's/^a2-two    hits=12 forms=9/a2-two    hits=12/' "$FIX/counts.txt" > "$TMP/noforms.txt"
run apply --counts "$TMP/noforms.txt" --dir "$TMP/w3" --contract "$FIX/contract.yaml"
assert_rc 1
assert_out 'template needs forms'
[ "$(sum_of "$TMP/w3/alpha.md")" = "$BEFORE" ] || fail "wrote despite a missing forms value"

# --- failure paths: the anchors -------------------------------------------------
CASE="anchor-absent"
clone w4
sed -i 's/A stack of hedges says less/A pile of hedges says less/' "$TMP/w4/alpha.md"
BEFORE4=$(sum_of "$TMP/w4/alpha.md")
run apply --counts "$FIX/counts.txt" --dir "$TMP/w4" --contract "$FIX/contract.yaml"
assert_rc 1
assert_out 'a3: anchor matches 0 times'
[ "$(sum_of "$TMP/w4/alpha.md")" = "$BEFORE4" ] || fail "a failed anchor still wrote the file"

CASE="swap-anchor-absent"
clone w4b
sed -i 's/the reference audit found 8,862 of/the reference review found 8,862 of/' "$TMP/w4b/alpha.md"
BEFORE4B=$(sum_of "$TMP/w4b/alpha.md")
run apply --counts "$FIX/counts.txt" --dir "$TMP/w4b" --contract "$FIX/contract.yaml"
assert_rc 1
assert_out 'a1: anchor matches 0 times'
[ "$(sum_of "$TMP/w4b/alpha.md")" = "$BEFORE4B" ] || fail "a failed swap anchor still wrote the file"

CASE="swap-anchor-twice"
clone w4c
printf '\nA dash sets two facts side by side, and the reference audit found 8,862 of them.\n' \
  >> "$TMP/w4c/alpha.md"
BEFORE4C=$(sum_of "$TMP/w4c/alpha.md")
run apply --counts "$FIX/counts.txt" --dir "$TMP/w4c" --contract "$FIX/contract.yaml"
assert_rc 1
assert_out 'a1: anchor matches 2 times'
[ "$(sum_of "$TMP/w4c/alpha.md")" = "$BEFORE4C" ] || fail "an ambiguous swap anchor still wrote the file"

CASE="anchor-twice"
clone w5
printf '\nA stack of hedges says less than a single hedge does.\n' >> "$TMP/w5/alpha.md"
BEFORE5=$(sum_of "$TMP/w5/alpha.md")
run apply --counts "$FIX/counts.txt" --dir "$TMP/w5" --contract "$FIX/contract.yaml"
assert_rc 1
assert_out 'a3: anchor matches 2 times'
[ "$(sum_of "$TMP/w5/alpha.md")" = "$BEFORE5" ] || fail "an ambiguous anchor still wrote the file"

CASE="one-bad-anchor-blocks-every-good-one"
run apply --counts "$FIX/counts.txt" --dir "$TMP/w5" --contract "$FIX/contract.yaml"
assert_out 'nothing was written'
assert_lacks "$TMP/w5/alpha.md" "your own corpus shows 602 of them"
assert_lacks "$TMP/w5/alpha.md" "measured against 1,234"

CASE="missing-rule-file"
clone w6
rm "$TMP/w6/alpha.md"
run apply --counts "$FIX/counts.txt" --dir "$TMP/w6" --contract "$FIX/contract.yaml"
assert_rc 1
assert_out 'NOT FOUND: rule file'

# --- failure paths: the contract ------------------------------------------------
CASE="contract-slot-mismatch"
clone w7
sed 's/measured: "your own corpus shows {hits} of them"/measured: "your own corpus shows {hits} of {forms} them"/' \
  "$FIX/contract.yaml" > "$TMP/mismatch.yaml"
run apply --counts "$FIX/counts.txt" --dir "$TMP/w7" --contract "$TMP/mismatch.yaml"
assert_rc 1
assert_out 'sentence holds 1 numbers and the template holds 2'

CASE="contract-sentence-without-measured"
sed 's/    measured: "your own corpus shows {hits} of them"/    measured: null/' \
  "$FIX/contract.yaml" > "$TMP/nomeasured.yaml"
run apply --counts "$FIX/counts.txt" --dir "$TMP/w7" --contract "$TMP/nomeasured.yaml"
assert_rc 2
assert_out 'a1 has a sentence anchor and no measured template'

CASE="contract-two-anchor-kinds"
sed 's/    append_after: "The list item anchor sits here."/    append_after: "x"\n    sentence: "y"/' \
  "$FIX/contract.yaml" > "$TMP/both.yaml"
run apply --counts "$FIX/counts.txt" --dir "$TMP/w7" --contract "$TMP/both.yaml"
assert_rc 2
assert_out 'needs exactly one of sentence and append_after'

CASE="contract-duplicate-id"
sed 's/^  - id: a4$/  - id: a1/' "$FIX/contract.yaml" > "$TMP/dup.yaml"
run apply --counts "$FIX/counts.txt" --dir "$TMP/w7" --contract "$TMP/dup.yaml"
assert_rc 2
assert_out 'duplicate id or detector'

CASE="contract-empty"
printf 'corpus: {}\nrules: []\n' > "$TMP/empty.yaml"
run apply --counts "$FIX/counts.txt" --dir "$TMP/w7" --contract "$TMP/empty.yaml"
assert_rc 2
assert_out 'declares no corpus swaps or no rules'

# --- failure paths: the command line --------------------------------------------
CASE="cli-no-mode"
run
assert_rc 2
assert_out 'usage: audit-rewrite.sh check\|apply'

CASE="cli-bad-mode"
run rewrite --counts "$FIX/counts.txt"
assert_rc 2
assert_out 'usage: audit-rewrite.sh'

CASE="cli-unknown-argument"
run check --counts "$FIX/counts.txt" --verbose
assert_rc 2
assert_out 'unknown argument: --verbose'

CASE="cli-flag-without-a-value"
run check --counts
assert_rc 2
assert_out '\-\-counts requires a value'

CASE="cli-no-counts"
run check --dir "$TMP/w1"
assert_rc 2
assert_out 'check requires --counts'

CASE="cli-counts-file-missing"
run check --counts "$TMP/nope.txt" --dir "$TMP/w1"
assert_rc 2
assert_out 'NOT FOUND: counts file'

CASE="cli-dir-missing"
run check --counts "$FIX/counts.txt" --dir "$TMP/nodir" --contract "$FIX/contract.yaml"
assert_rc 2
assert_out 'NOT FOUND: rule directory'

CASE="cli-contract-missing"
run check --counts "$FIX/counts.txt" --dir "$TMP/w1" --contract "$TMP/nope.yaml"
assert_rc 2
assert_out 'NOT FOUND: contract'

[ "$FAILS" -eq 0 ] || { echo "  $FAILS assertion(s) failed"; exit 1; }
echo "test-audit-rewrite: all assertions passed"
exit 0
