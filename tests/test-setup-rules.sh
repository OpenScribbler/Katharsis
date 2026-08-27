#!/usr/bin/env bash
# Black-box suite for scripts/setup-rules.sh. The check cases run against both
# the live repo contract and doctored copies with one planted violation each.
# The apply cases build a miniature contract with every placeholder shape the
# live one uses (required with no default, required with a default, optional
# defaulting to empty) and assert the written files, the loud failures, and the
# idempotent import-line append.

set -eu
SETUP="$(cd "$(dirname "$0")/.." && pwd)/scripts/setup-rules.sh"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

FAILS=0
CASE=""

fail() { echo "  FAIL [$CASE] $*"; FAILS=$((FAILS + 1)); }

run() { RC=0; OUT=$("$SETUP" "$@" 2>&1) || RC=$?; }

assert_out() { echo "$OUT" | grep -Eq "$1" || fail "expected /$1/ in output; got: $OUT"; }
assert_rc() { [ "$RC" -eq "$1" ] || fail "expected exit $1, got $RC; output: $OUT"; }
assert_file_has() { grep -Fq "$2" "$1" || fail "expected $1 to contain '$2'"; }
assert_file_lacks() {
  if [ ! -f "$1" ]; then fail "expected file $1 to exist"; return 0; fi
  ! grep -Fq "$2" "$1" || fail "expected $1 to not contain '$2'"
}

# The miniature contract: one placeholder per shape the live contract uses.
FIX="$TMP/fix"
mkdir -p "$FIX/rules"
cat > "$FIX/rules/placeholders.yaml" <<'EOF'
placeholders:
  - name: READER_NAME
    asks: What should the assistant call you?
    default: null
    required: true
    discoverable: null
    appears_in: [alpha.md]

  - name: MEMORY_FILE
    asks: Which memory file imports these rules?
    default: AGENTS.md
    required: true
    discoverable: null
    appears_in: [alpha.md, beta.md]

  - name: STYLE_NOTE
    asks: Is there a house style guide?
    default: ""
    required: false
    discoverable: null
    appears_in: [beta.md]
EOF
cat > "$FIX/rules/alpha.md" <<'EOF'
# Alpha

Chat replies to {{READER_NAME}} inherit this file through {{MEMORY_FILE}}.
EOF
cat > "$FIX/rules/beta.md" <<'EOF'
# Beta

Import from {{MEMORY_FILE}}.
{{STYLE_NOTE}}
EOF

clone_fix() { rm -rf "$TMP/$1"; cp -r "$FIX" "$TMP/$1"; }

# --- check: the live repo contract must hold ------------------------------------
CASE="check-live-repo"
run check --rules "$REPO/rules"
assert_rc 0
assert_out '^contract consistent: 5 placeholders across 4 rule files$'

CASE="check-fixture-clean"
run check --rules "$FIX/rules"
assert_rc 0
assert_out '^contract consistent: 3 placeholders across 2 rule files$'

# --- check: one planted violation per failure class ----------------------------
CASE="check-undeclared"
clone_fix undeclared
echo 'A stray {{BOGUS}} placeholder.' >> "$TMP/undeclared/rules/alpha.md"
run check --rules "$TMP/undeclared/rules"
assert_rc 1
assert_out 'undeclared placeholder \{\{BOGUS\}\} in alpha.md'

CASE="check-unused"
clone_fix unused
cat >> "$TMP/unused/rules/placeholders.yaml" <<'EOF'
  - name: GHOST
    asks: Never appears anywhere?
    default: null
    required: false
    discoverable: null
    appears_in: [alpha.md]
EOF
run check --rules "$TMP/unused/rules"
assert_rc 1
assert_out 'unused declaration GHOST'

CASE="check-malformed-braces"
clone_fix malformed
printf 'A spaced {{ NAME }} and a stray {{ opener.\n' >> "$TMP/malformed/rules/beta.md"
run check --rules "$TMP/malformed/rules"
assert_rc 1
assert_out 'malformed placeholder in beta.md:[0-9]+'

CASE="check-duplicate-declaration"
clone_fix dup
cat >> "$TMP/dup/rules/placeholders.yaml" <<'EOF'
  - name: READER_NAME
    asks: Declared twice?
    default: null
    required: true
    discoverable: null
    appears_in: [alpha.md]
EOF
run check --rules "$TMP/dup/rules"
assert_rc 2
assert_out 'invalid contract: duplicate placeholder READER_NAME'

CASE="check-location-mismatch"
clone_fix mismatch
echo 'Also {{STYLE_NOTE}} here.' >> "$TMP/mismatch/rules/alpha.md"
run check --rules "$TMP/mismatch/rules"
assert_rc 1
assert_out 'location mismatch for STYLE_NOTE'

# --- apply: happy path ----------------------------------------------------------
# Every value given: substituted files land in dest, the contract yaml does not,
# and nothing double-braced survives.
CASE="apply-happy"
DEST="$TMP/dest-happy"
run apply --rules "$FIX/rules" --dest "$DEST" \
  --set READER_NAME=Sam --set MEMORY_FILE=CLAUDE.md --set "STYLE_NOTE=Vale wins conflicts."
assert_rc 0
assert_out 'wrote 2 files'
assert_file_has "$DEST/alpha.md" 'Chat replies to Sam inherit this file through CLAUDE.md.'
assert_file_has "$DEST/beta.md" 'Import from CLAUDE.md.'
assert_file_has "$DEST/beta.md" 'Vale wins conflicts.'
assert_file_lacks "$DEST/alpha.md" '{{'
assert_file_lacks "$DEST/beta.md" '{{'
[ ! -e "$DEST/placeholders.yaml" ] || fail "contract yaml was copied into dest"

# --- apply: defaults fill what --set omits --------------------------------------
CASE="apply-defaults"
DEST="$TMP/dest-defaults"
run apply --rules "$FIX/rules" --dest "$DEST" --set READER_NAME=Sam
assert_rc 0
assert_file_has "$DEST/alpha.md" 'through AGENTS.md.'
assert_file_lacks "$DEST/beta.md" '{{'
grep -Eq '^\{\{STYLE_NOTE\}\}$' "$DEST/beta.md" && fail "optional default did not substitute" || true

# --- apply: loud failures -------------------------------------------------------
CASE="apply-missing-required"
run apply --rules "$FIX/rules" --dest "$TMP/dest-missing"
assert_rc 2
assert_out 'missing required placeholder: READER_NAME'

CASE="apply-empty-required"
run apply --rules "$FIX/rules" --dest "$TMP/dest-empty" --set READER_NAME=
assert_rc 2
assert_out 'missing required placeholder: READER_NAME'

CASE="apply-newline-value"
run apply --rules "$FIX/rules" --dest "$TMP/dest-nlval" --set "READER_NAME=$(printf 'a\nb')"
assert_rc 2
assert_out 'contains a newline'

CASE="apply-unknown-set"
run apply --rules "$FIX/rules" --dest "$TMP/dest-unknown" --set READER_NAME=Sam --set TYPO=oops
assert_rc 2
assert_out 'TYPO, which the contract does not declare'

CASE="apply-set-without-equals"
run apply --rules "$FIX/rules" --dest "$TMP/dest-noeq" --set READER_NAME
assert_rc 2
assert_out 'NAME=VALUE'

CASE="apply-leftover-braces"
clone_fix leftover
echo 'A stray {{BOGUS}} placeholder.' >> "$TMP/leftover/rules/alpha.md"
run apply --rules "$TMP/leftover/rules" --dest "$TMP/dest-leftover" --set READER_NAME=Sam
assert_rc 2
assert_out 'UNSUBSTITUTED: .*alpha.md:[0-9]+'
assert_out 'install is incomplete'
assert_out 'nothing was written'

# The failure must leave the destination exactly as it was. Asserting the
# message alone passed while apply wrote every file and reported the leftover
# afterwards, which left a broken install on disk behind a nonzero exit.
CASE="apply-leftover-writes-nothing"
mkdir -p "$TMP/dest-untouched"
printf 'a file the installer wrote\n' > "$TMP/dest-untouched/alpha.md"
BEFORE=$(cd "$TMP/dest-untouched" && find . | sort && cat alpha.md)
run apply --rules "$TMP/leftover/rules" --dest "$TMP/dest-untouched" --set READER_NAME=Sam
assert_rc 2
AFTER=$(cd "$TMP/dest-untouched" && find . | sort && cat alpha.md)
[ "$BEFORE" = "$AFTER" ] || fail "the failed apply changed the destination"
[ ! -e "$TMP/dest-untouched/.katharsis-install.json" ] || fail "a failed apply wrote a manifest"

CASE="apply-missing-dest"
run apply --rules "$FIX/rules" --set READER_NAME=Sam
assert_rc 2
assert_out 'apply requires --dest'

# --- apply: the managed block ---------------------------------------------------
# One delimited block, inserted once, at the top by default, and never a loose
# line: the markers are what makes removal an exact match rather than a guess.
BEGIN='<!-- katharsis:begin'
END='<!-- katharsis:end -->'

CASE="block-prepended-by-default"
MEMFILE="$TMP/fakehome/AGENTS.md"
mkdir -p "$TMP/fakehome"
printf '# My memory file\n\nMy own standing rule.\n' > "$MEMFILE"
DEST="$TMP/fakehome/.claude/katharsis"
RC=0; OUT=$(HOME="$TMP/fakehome" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST" \
  --set READER_NAME=Sam --import-into "$MEMFILE" 2>&1) || RC=$?
assert_rc 0
assert_out 'inserted the managed block at the top of'
assert_file_has "$MEMFILE" "$BEGIN"
assert_file_has "$MEMFILE" "$END"
assert_file_has "$MEMFILE" '@~/.claude/katharsis/loader.md'
head -1 "$MEMFILE" | grep -Fq "$BEGIN" || fail "the block did not land on the first line"
assert_file_has "$MEMFILE" 'My own standing rule.'

CASE="block-idempotent"
RC=0; OUT=$(HOME="$TMP/fakehome" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST" \
  --set READER_NAME=Sam --import-into "$MEMFILE" 2>&1) || RC=$?
assert_rc 0
assert_out 'already present'
assert_out 'recorded as ours'
N=$(grep -c 'katharsis:begin' "$MEMFILE") || true
[ "$N" -eq 1 ] || fail "expected 1 managed block, found $N"

CASE="block-appended-with-position-end"
MEMEND="$TMP/fakehome/END.md"
printf '# Ends here\n' > "$MEMEND"
RC=0; OUT=$(HOME="$TMP/fakehome" "$SETUP" apply --rules "$FIX/rules" \
  --dest "$TMP/fakehome/.claude/kat-end" --set READER_NAME=Sam \
  --import-into "$MEMEND" --position end 2>&1) || RC=$?
assert_rc 0
assert_out 'inserted the managed block at the end of'
head -1 "$MEMEND" | grep -Fq '# Ends here' || fail "an end insert moved the first line"
tail -2 "$MEMEND" | grep -Fq "$END" || fail "the block did not land at the end"

CASE="block-lands-after-frontmatter"
MEMFM="$TMP/fakehome/FM.md"
printf -- '---\ntitle: mine\n---\n# Heading\n' > "$MEMFM"
RC=0; OUT=$(HOME="$TMP/fakehome" "$SETUP" apply --rules "$FIX/rules" \
  --dest "$TMP/fakehome/.claude/kat-fm" --set READER_NAME=Sam --import-into "$MEMFM" 2>&1) || RC=$?
assert_rc 0
head -1 "$MEMFM" | grep -Fq -- '---' || fail "the block split the frontmatter"
sed -n '3p' "$MEMFM" | grep -Fq -- '---' || fail "the frontmatter no longer closes on line 3"
assert_file_has "$MEMFM" "$BEGIN"

CASE="block-position-must-be-top-or-end"
run apply --rules "$FIX/rules" --dest "$TMP/dest-pos" --set READER_NAME=Sam --position middle
assert_rc 2
assert_out 'must be top or end'

# A bad memory-file path fails before anything is written, so no partial
# install is left behind.
CASE="import-missing-memfile"
run apply --rules "$FIX/rules" --dest "$TMP/dest-nomem" --set READER_NAME=Sam \
  --import-into "$TMP/absent/AGENTS.md"
assert_rc 2
assert_out 'NOT FOUND: memory file'
[ ! -e "$TMP/dest-nomem/alpha.md" ] || fail "dest files were written despite the bad import target"

CASE="import-no-trailing-newline"
MEMFILE2="$TMP/mem2.md"
printf 'last line without newline' > "$MEMFILE2"
run apply --rules "$FIX/rules" --dest "$TMP/dest-nl" --set READER_NAME=Sam --import-into "$MEMFILE2"
assert_rc 0
assert_file_has "$MEMFILE2" 'last line without newline'
grep -Eq '^@.*loader\.md$' "$MEMFILE2" || fail "import line did not land on its own line"

# A pre-block install left a bare import line. Katharsis cannot prove it wrote
# that line, so it reports it and leaves it rather than adopting it.
CASE="legacy-bare-import-line-is-left-alone"
MEMLEGACY="$TMP/fakehome/LEGACY.md"
printf '# Mine\n\n@~/.claude/katharsis/loader.md\n' > "$MEMLEGACY"
RC=0; OUT=$(HOME="$TMP/fakehome" "$SETUP" apply --rules "$FIX/rules" \
  --dest "$TMP/fakehome/.claude/kat-legacy" --set READER_NAME=Sam \
  --import-into "$MEMLEGACY" 2>&1) || RC=$?
assert_rc 0
assert_out 'without the managed block'
assert_file_lacks "$MEMLEGACY" "$BEGIN"

# An unreadable memory file fails before anything is written, like a missing
# one, because the read happens ahead of the first rule-file write.
CASE="import-unreadable-memfile-writes-nothing"
MEMBAD="$TMP/fakehome/BAD.md"
printf '# Mine\n\xff\xfe not utf-8\n' > "$MEMBAD"
RC=0; OUT=$(HOME="$TMP/fakehome" "$SETUP" apply --rules "$FIX/rules" \
  --dest "$TMP/fakehome/.claude/kat-bad" --set READER_NAME=Sam \
  --import-into "$MEMBAD" 2>&1) || RC=$?
assert_rc 2
assert_out 'UNREADABLE: memory file'
assert_out 'nothing was written'
[ ! -e "$TMP/fakehome/.claude/kat-bad/alpha.md" ] \
  || fail "dest files were written despite the unreadable import target"
[ ! -e "$TMP/fakehome/.claude/kat-bad/.katharsis-install.json" ] \
  || fail "a manifest was written despite the unreadable import target"

# A re-apply pointed at a different memory file removes the block the previous
# apply wrote, because the manifest holds one memory_file record and replacing
# it would orphan the old block where no uninstall can find it.
CASE="reapply-into-a-second-memory-file-cleans-the-first"
MEMA="$TMP/fakehome/FIRST.md"
MEMB="$TMP/fakehome/SECOND.md"
printf '# First memory file\n' > "$MEMA"
printf '# Second memory file\n' > "$MEMB"
cp "$MEMA" "$TMP/fakehome/FIRST-copy.md"
DESTMOVE="$TMP/fakehome/.claude/kat-move"
RC=0; OUT=$(HOME="$TMP/fakehome" "$SETUP" apply --rules "$FIX/rules" --dest "$DESTMOVE" \
  --set READER_NAME=Sam --import-into "$MEMA" 2>&1) || RC=$?
assert_rc 0
RC=0; OUT=$(HOME="$TMP/fakehome" "$SETUP" apply --rules "$FIX/rules" --dest "$DESTMOVE" \
  --set READER_NAME=Sam --import-into "$MEMB" 2>&1) || RC=$?
assert_rc 0
assert_out 'removed the managed block from .*FIRST\.md'
assert_file_lacks "$MEMA" "$BEGIN"
assert_file_has "$MEMB" "$BEGIN"
diff -q "$TMP/fakehome/FIRST-copy.md" "$MEMA" >/dev/null \
  || fail "the first memory file did not come back byte for byte"

# --- apply: the manifest --------------------------------------------------------
# Three fields carry the reversibility, so each one is asserted by value.
CASE="manifest-records-the-install"
MANIFEST="$DEST/.katharsis-install.json"
[ -f "$MANIFEST" ] || fail "no manifest at $MANIFEST"
mstate() { python3 -c "
import json,sys
d=json.load(open('$MANIFEST'))
if sys.argv[1]=='file':
    print(next(f['state'] for f in d['files'] if f['name']==sys.argv[2]))
elif sys.argv[1]=='block':
    print(d['memory_file']['block'])
elif sys.argv[1]=='position':
    print(d['memory_file']['position'])
" "$@"; }
[ "$(mstate block)" = "prepended" ] || fail "expected block=prepended, got $(mstate block)"
[ "$(mstate position)" = "top" ] || fail "expected position=top, got $(mstate position)"
[ "$(mstate file promoted.md)" = "preserved" ] || fail "promoted.md should be preserved on a re-install"

CASE="manifest-marks-a-created-file"
DEST2="$TMP/fakehome/.claude/kat-fresh"
RC=0; OUT=$(HOME="$TMP/fakehome" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST2" \
  --set READER_NAME=Sam 2>&1) || RC=$?
assert_rc 0
MANIFEST="$DEST2/.katharsis-install.json"
[ "$(mstate file alpha.md)" = "created" ] || fail "expected created, got $(mstate file alpha.md)"
[ "$(mstate file promoted.md)" = "created" ] || fail "promoted.md should be created on a fresh install"
assert_out 'created promoted.md'

CASE="manifest-marks-and-archives-a-displaced-file"
DEST3="$TMP/fakehome/.claude/kat-displace"
mkdir -p "$DEST3"
printf 'the installer wrote this\n' > "$DEST3/alpha.md"
RC=0; OUT=$(HOME="$TMP/fakehome" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST3" \
  --set READER_NAME=Sam 2>&1) || RC=$?
assert_rc 0
assert_out 'archived the existing alpha.md'
MANIFEST="$DEST3/.katharsis-install.json"
[ "$(mstate file alpha.md)" = "displaced" ] || fail "expected displaced, got $(mstate file alpha.md)"
grep -Fq 'the installer wrote this' "$DEST3/.katharsis-displaced/alpha.md" \
  || fail "the displaced file was not archived verbatim"

CASE="reinstall-preserves-promoted-content"
printf '\n## Rule 12\n\nPromoted by the installer.\n' >> "$DEST2/promoted.md"
RC=0; OUT=$(HOME="$TMP/fakehome" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST2" \
  --set READER_NAME=Sam 2>&1) || RC=$?
assert_rc 0
assert_out 'kept the existing promoted.md'
assert_file_has "$DEST2/promoted.md" 'Rule 12'

# --- apply: crash windows -------------------------------------------------------
# The manifest is saved before the writes it records, so a crash mid-apply
# leaves a manifest that over-claims. A file size limit and a read-only
# directory stand in for the crash, because each makes one write raise after
# the save has landed.
CASE="a-crash-mid-write-leaves-files-the-manifest-already-names"
clone_fix bigfix
yes 'A long line of rule text with no placeholder in it.' | head -c 20000 > "$TMP/bigfix/rules/gamma.md"
DEST5="$TMP/fakehome/.claude/kat-crash"
RC=0; OUT=$( (ulimit -f 8; HOME="$TMP/fakehome" "$SETUP" apply --rules "$TMP/bigfix/rules" \
  --dest "$DEST5" --set READER_NAME=Sam) 2>&1) || RC=$?
[ "$RC" -ne 0 ] || fail "the oversized write did not fail under the size limit"
[ -f "$DEST5/alpha.md" ] || fail "the small file before the crash was not written"
[ ! -f "$DEST5/gamma.md" ] || fail "the oversized file was written despite the limit"
MANIFEST="$DEST5/.katharsis-install.json"
[ -f "$MANIFEST" ] || fail "the crash left written files with no manifest"
[ "$(mstate file gamma.md)" = "created" ] || fail "the manifest does not name the file the crash lost"
RC=0; OUT=$(HOME="$TMP/fakehome" "$SETUP" apply --rules "$TMP/bigfix/rules" --dest "$DEST5" \
  --set READER_NAME=Sam 2>&1) || RC=$?
assert_rc 0
! grep -Fq '"displaced"' "$MANIFEST" || fail "the re-apply archived Katharsis's own files as the installer's"
[ ! -d "$DEST5/.katharsis-displaced" ] || fail "the re-apply archived something"

CASE="a-crash-after-the-save-with-changed-output-leaves-a-file-that-is-still-katharsiss"
UNINSTALL="$REPO/scripts/uninstall-rules.sh"
clone_fix bigfix2
sed -i 's/appears_in: \[alpha.md\]/appears_in: [alpha.md, gamma.md]/' "$TMP/bigfix2/rules/placeholders.yaml"
{ printf 'Reader: {{READER_NAME}}\n'; yes 'A long line of rule text with no placeholder in it.' | head -c 20000; } \
  > "$TMP/bigfix2/rules/gamma.md"
DEST7="$TMP/fakehome/.claude/kat-crash2"
run apply --rules "$TMP/bigfix2/rules" --dest "$DEST7" --set READER_NAME=Sam
assert_rc 0
RC=0; OUT=$( (ulimit -f 8; HOME="$TMP/fakehome" "$SETUP" apply --rules "$TMP/bigfix2/rules" \
  --dest "$DEST7" --set READER_NAME=Pat) 2>&1) || RC=$?
[ "$RC" -ne 0 ] || fail "the oversized write did not fail under the size limit"
assert_file_has "$DEST7/gamma.md" 'Reader: Sam'
MANIFEST="$DEST7/.katharsis-install.json"
RC=0; OUT=$("$UNINSTALL" plan --dest "$DEST7" 2>&1) || RC=$?
assert_rc 0
assert_out '^remove gamma.md$'
! echo "$OUT" | grep -q '^keep gamma.md' || fail "the uninstall reads Katharsis's previous output as the installer's edit"
run apply --rules "$TMP/bigfix2/rules" --dest "$DEST7" --set READER_NAME=Pat
assert_rc 0
! echo "$OUT" | grep -q 'archived' || fail "the re-apply archived Katharsis's previous output as the installer's"
[ ! -d "$DEST7/.katharsis-displaced" ] || fail "the re-apply archived something"
assert_file_has "$DEST7/gamma.md" 'Reader: Pat'
[ "$(mstate file gamma.md)" = "reinstalled" ] || fail "the re-apply did not record the file as its own"

CASE="a-crash-after-the-save-on-a-displaced-file-keeps-the-original-archive"
DEST8="$TMP/fakehome/.claude/kat-crash3"
mkdir -p "$DEST8"
printf '# Mine\n' > "$DEST8/gamma.md"
run apply --rules "$TMP/bigfix2/rules" --dest "$DEST8" --set READER_NAME=Sam
assert_rc 0
[ -f "$DEST8/.katharsis-displaced/gamma.md" ] || fail "the planted file was not archived"
RC=0; OUT=$( (ulimit -f 8; HOME="$TMP/fakehome" "$SETUP" apply --rules "$TMP/bigfix2/rules" \
  --dest "$DEST8" --set READER_NAME=Pat) 2>&1) || RC=$?
[ "$RC" -ne 0 ] || fail "the oversized write did not fail under the size limit"
run apply --rules "$TMP/bigfix2/rules" --dest "$DEST8" --set READER_NAME=Pat
assert_rc 0
[ "$(ls "$DEST8/.katharsis-displaced" | wc -l)" -eq 1 ] || fail "the re-apply archived a second file: $(ls "$DEST8/.katharsis-displaced")"
RC=0; OUT=$("$UNINSTALL" apply --dest "$DEST8" 2>&1) || RC=$?
assert_rc 0
[ "$(cat "$DEST8/gamma.md")" = "# Mine" ] || fail "the uninstall restored the wrong bytes: $(head -c 40 "$DEST8/gamma.md")"

CASE="a-crash-before-the-block-write-leaves-a-record-that-over-claims"
RODIR="$TMP/fakehome/ro"
mkdir -p "$RODIR"
printf '# Mine\n' > "$RODIR/AGENTS.md"
cp "$RODIR/AGENTS.md" "$TMP/fakehome/ro-copy.md"
DEST6="$TMP/fakehome/.claude/kat-roblock"
chmod 555 "$RODIR"
RC=0; OUT=$(HOME="$TMP/fakehome" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST6" \
  --set READER_NAME=Sam --import-into "$RODIR/AGENTS.md" 2>&1) || RC=$?
chmod 755 "$RODIR"
[ "$RC" -ne 0 ] || fail "the write into a read-only directory did not fail"
diff -q "$TMP/fakehome/ro-copy.md" "$RODIR/AGENTS.md" >/dev/null || fail "the memory file changed"
MANIFEST="$DEST6/.katharsis-install.json"
[ "$(mstate block)" = "prepended" ] || fail "the manifest does not claim the block the crash lost"
[ -f "$DEST6/.katharsis-displaced/AGENTS.md.bak" ] || fail "the backup was not saved before the crash"
RC=0; OUT=$(HOME="$TMP/fakehome" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST6" \
  --set READER_NAME=Sam --import-into "$RODIR/AGENTS.md" 2>&1) || RC=$?
assert_rc 0
assert_out 'inserted the managed block'
[ "$(mstate block)" = "prepended" ] || fail "the re-apply did not record the block as its own"

# --- reseal ---------------------------------------------------------------------
# A deliberate edit through the audit must keep the file Katharsis's, or an
# uninstall reads the edit as the installer's and keeps the file for ever.
CASE="reseal-follows-a-deliberate-edit"
DEST4="$TMP/fakehome/.claude/kat-reseal"
RC=0; OUT=$(HOME="$TMP/fakehome" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST4" \
  --set READER_NAME=Sam 2>&1) || RC=$?
assert_rc 0
BEFORE_HASH=$(python3 -c "
import hashlib,sys
print(hashlib.sha256(open('$DEST4/alpha.md','rb').read()).hexdigest())")
printf '\n## Rule 12 (unconfirmed)\n\nA derived rule.\n' >> "$DEST4/alpha.md"
run reseal --dest "$DEST4" --note "derivation approved"
assert_rc 0
assert_out 'resealed alpha\.md: saved the previous copy'
[ -f "$DEST4/.katharsis-displaced/alpha.md.pre-reseal" ] || fail "no pre-reseal copy was saved"
python3 - "$DEST4" "$BEFORE_HASH" <<'PY2'
import hashlib, json, os, sys
dest, before = sys.argv[1], sys.argv[2]
d = json.load(open(os.path.join(dest, ".katharsis-install.json")))
entry = next(f for f in d["files"] if f["name"] == "alpha.md")
actual = hashlib.sha256(open(os.path.join(dest, "alpha.md"), "rb").read()).hexdigest()
assert entry["sha256"] == actual, "the manifest hash did not follow the edit"
audit = [a for a in d["audit"] if a["name"] == "alpha.md"]
assert len(audit) == 1, f"expected 1 audit entry, got {len(audit)}"
assert audit[0]["sha256_before"] == before, "the audit entry lost the previous hash"
assert audit[0]["note"] == "derivation approved", "the note was not recorded"
PY2
[ $? -eq 0 ] || fail "the manifest did not follow the reseal"

CASE="reseal-adopts-a-file-the-audit-created"
printf '# My pairs\n\nFrom my own prose.\n' > "$DEST4/examples.md"
run reseal --dest "$DEST4" --note "accepted pairs"
assert_rc 0
assert_out 'adopted examples\.md as content you own'
python3 - "$DEST4" <<'PY2'
import json, os, sys
d = json.load(open(os.path.join(sys.argv[1], ".katharsis-install.json")))
entry = next(f for f in d["files"] if f["name"] == "examples.md")
assert entry["state"] == "user_content", f"expected user_content, got {entry['state']}"
PY2
[ $? -eq 0 ] || fail "examples.md was not adopted as user content"

# A re-apply rebuilds files[] from the rule sources, which do not include the
# adopted file, so its record has to be carried forward or the uninstall
# forgets it is the installer's.
CASE="reapply-keeps-an-adopted-files-record"
RC=0; OUT=$(HOME="$TMP/fakehome" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST4" \
  --set READER_NAME=Sam 2>&1) || RC=$?
assert_rc 0
python3 - "$DEST4" <<'PY2'
import json, os, sys
d = json.load(open(os.path.join(sys.argv[1], ".katharsis-install.json")))
entry = next((f for f in d["files"] if f["name"] == "examples.md"), None)
assert entry is not None, "the re-apply dropped the adopted file's record"
assert entry["state"] == "user_content", f"expected user_content, got {entry['state']}"
PY2
[ $? -eq 0 ] || fail "the re-apply lost the user_content record for examples.md"

CASE="reseal-is-a-no-op-when-nothing-changed"
run reseal --dest "$DEST4"
assert_rc 0
assert_out 'nothing to reseal'

CASE="reseal-refuses-without-a-manifest"
mkdir -p "$TMP/no-manifest-dir"
run reseal --dest "$TMP/no-manifest-dir"
assert_rc 2
assert_out 'NOT FOUND: no install manifest'
assert_out 'Nothing was written'

CASE="reseal-requires-a-dest"
run reseal
assert_rc 2
assert_out 'reseal requires --dest'

# --- usage errors ---------------------------------------------------------------
CASE="usage-no-mode"
run
assert_rc 2
assert_out 'usage:'

CASE="usage-unknown-mode"
run frobnicate
assert_rc 2
assert_out 'usage:'

CASE="usage-unknown-flag"
run check --bogus
assert_rc 2
assert_out 'unknown argument'

CASE="usage-missing-rules-dir"
run check --rules "$TMP/no-such-dir"
assert_rc 2
assert_out 'NOT FOUND: rules directory'

# --- summary --------------------------------------------------------------------
if [ "$FAILS" -gt 0 ]; then
  echo "test-setup-rules: $FAILS assertion(s) failed"
  exit 1
fi
echo "test-setup-rules: all assertions passed"
exit 0
