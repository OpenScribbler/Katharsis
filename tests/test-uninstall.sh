#!/usr/bin/env bash
# Black-box suite for scripts/uninstall-rules.sh. Every case builds a real
# install with scripts/setup-rules.sh, then asserts one property of the
# removal. The refusals get as many cases as the removals, because refusing to
# delete what Katharsis did not write is the behavior this script exists for.

set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETUP="$ROOT/scripts/setup-rules.sh"
UNINSTALL="$ROOT/scripts/uninstall-rules.sh"
SETTINGS_EDIT="$ROOT/scripts/settings-edit.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

FAILS=0
CASE=""
fail() { echo "  FAIL [$CASE] $*"; FAILS=$((FAILS + 1)); }
assert_out() { echo "$OUT" | grep -Eq "$1" || fail "expected /$1/ in output; got: $OUT"; }
assert_rc() { [ "$RC" -eq "$1" ] || fail "expected exit $1, got $RC; output: $OUT"; }

# One miniature rule set, reused by every case.
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
EOF
printf 'Chat replies to {{READER_NAME}} follow this file.\n' > "$FIX/rules/alpha.md"
printf '# Writing rules\n\n@alpha.md\n@promoted.md\n' > "$FIX/rules/loader.md"

# install NAME [extra setup args...] -> sets HOME_DIR, DEST, MEMFILE, SETTINGS
install() {
  local name="$1"; shift
  HOME_DIR="$TMP/$name"
  DEST="$HOME_DIR/.claude/katharsis"
  MEMFILE="$HOME_DIR/AGENTS.md"
  SETTINGS="$HOME_DIR/.claude/settings.json"
  mkdir -p "$HOME_DIR/.claude" "$TMP/$name-snap"
  printf '# My memory file\n\nMy own standing rule.\n' > "$MEMFILE"
  printf '{\n  "permissions": {\n    "deny": ["Bash(rm:*)"]\n  },\n  "theme": "dark"\n}\n' > "$SETTINGS"
  cp "$MEMFILE" "$TMP/$name-snap/AGENTS.md"
  cp "$SETTINGS" "$TMP/$name-snap/settings.json"
  HOME="$HOME_DIR" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST" \
    --set READER_NAME=Sam --import-into "$MEMFILE" "$@" >/dev/null
}

uninstall() { RC=0; OUT=$(HOME="$HOME_DIR" "$UNINSTALL" "$@" 2>&1) || RC=$?; }

# --- the round trip -------------------------------------------------------------
# The property that matters most: an install followed by an uninstall returns
# the installer's own files byte for byte, settings formatting included.
CASE="roundtrip-restores-both-files-byte-for-byte"
install rt
HOME="$HOME_DIR" "$SETTINGS_EDIT" apply --edit all --dest "$DEST" --settings "$SETTINGS" >/dev/null
uninstall apply --dest "$DEST"
assert_rc 0
assert_out 'uninstall complete'
diff -q "$TMP/rt-snap/AGENTS.md" "$MEMFILE" >/dev/null \
  || fail "AGENTS.md did not come back byte for byte"
diff -q "$TMP/rt-snap/settings.json" "$SETTINGS" >/dev/null \
  || fail "settings.json did not come back byte for byte"
[ ! -f "$DEST/alpha.md" ] || fail "alpha.md survived the uninstall"
[ ! -f "$DEST/.katharsis-install.json" ] || fail "the manifest survived a clean uninstall"

# --- plan writes nothing --------------------------------------------------------
CASE="plan-writes-nothing"
install plan
BEFORE=$(cat "$MEMFILE"; find "$DEST" | sort)
uninstall plan --dest "$DEST"
assert_rc 0
assert_out 'This was a plan and wrote nothing'
assert_out '^remove alpha\.md'
AFTER=$(cat "$MEMFILE"; find "$DEST" | sort)
[ "$BEFORE" = "$AFTER" ] || fail "plan changed something on disk"

# --- the refusals ---------------------------------------------------------------
CASE="refuses-a-file-edited-since-the-install"
install edited
echo 'my own addition' >> "$DEST/alpha.md"
uninstall apply --dest "$DEST"
assert_rc 0
assert_out 'keep alpha\.md: edited since the install'
[ -f "$DEST/alpha.md" ] || fail "an edited file was deleted"
grep -Fq 'my own addition' "$DEST/alpha.md" || fail "the installer's edit was lost"
[ -f "$DEST/.katharsis-install.json" ] || fail "the manifest was removed while an item remained"
assert_out 'stays and still names them'

CASE="refuses-promoted-md-once-it-carries-entries"
install promoted
printf '\n## Rule 12\n\nPromoted by the installer.\n' >> "$DEST/promoted.md"
uninstall apply --dest "$DEST"
assert_rc 0
assert_out 'keep promoted\.md: carries promoted entries you approved'
grep -Fq 'Rule 12' "$DEST/promoted.md" || fail "a promoted rule was deleted"

CASE="removes-promoted-md-while-still-pristine"
install pristine
uninstall apply --dest "$DEST"
assert_rc 0
assert_out '^remove promoted\.md'
[ ! -f "$DEST/promoted.md" ] || fail "an untouched promoted.md survived"

CASE="leaves-a-block-it-did-not-write-and-still-completes"
# A block already in the file with no manifest recording it is not Katharsis's
# to remove, even though it matches byte for byte. It was there before the
# install, so leaving it is the reversal and the run still completes.
HOME_DIR="$TMP/foreign"; DEST="$HOME_DIR/.claude/katharsis"; MEMFILE="$HOME_DIR/AGENTS.md"
mkdir -p "$HOME_DIR/.claude"
{ echo '<!-- katharsis:begin (managed block; remove with scripts/uninstall-rules.sh) -->'
  echo '@~/.claude/katharsis/loader.md'
  echo '<!-- katharsis:end -->'
  echo
  echo '# Mine'; } > "$MEMFILE"
cp "$MEMFILE" "$TMP/foreign-copy"
HOME="$HOME_DIR" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST" \
  --set READER_NAME=Sam --import-into "$MEMFILE" >/dev/null
uninstall apply --dest "$DEST"
assert_rc 0
assert_out 'leave the block in .*: it was already there before the install'
assert_out 'uninstall complete'
diff -q "$TMP/foreign-copy" "$MEMFILE" >/dev/null || fail "a foreign block was modified"
[ ! -f "$DEST/.katharsis-install.json" ] || fail "a left block held the manifest hostage"

CASE="leaves-a-settings-value-set-before-the-install-and-still-completes"
HOME_DIR="$TMP/preset"; DEST="$HOME_DIR/.claude/katharsis"
MEMFILE="$HOME_DIR/AGENTS.md"; SETTINGS="$HOME_DIR/.claude/settings.json"
mkdir -p "$HOME_DIR/.claude"
printf '# Mine\n' > "$MEMFILE"
printf '{\n  "permissions": {"deny": ["AskUserQuestion"]},\n  "autoMemoryEnabled": false\n}\n' > "$SETTINGS"
cp "$SETTINGS" "$TMP/preset-copy"
HOME="$HOME_DIR" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST" \
  --set READER_NAME=Sam --import-into "$MEMFILE" >/dev/null
HOME="$HOME_DIR" "$SETTINGS_EDIT" apply --edit all --dest "$DEST" --settings "$SETTINGS" >/dev/null
uninstall apply --dest "$DEST"
assert_rc 0
assert_out 'leave deny-askuserquestion .*: was already set before the install'
assert_out 'leave disable-auto-memory .*: was already set before the install'
assert_out 'uninstall complete'
diff -q "$TMP/preset-copy" "$SETTINGS" >/dev/null || fail "a pre-existing settings value changed"
[ ! -f "$DEST/.katharsis-install.json" ] || fail "a left settings value held the manifest hostage"

CASE="refuses-without-a-manifest"
install nomanifest
rm -f "$DEST/.katharsis-install.json"
BEFORE=$(cat "$MEMFILE"; find "$DEST" | sort)
uninstall apply --dest "$DEST"
assert_rc 2
assert_out 'NOT FOUND: no install manifest'
assert_out 'guessed uninstall is worse than none'
assert_out 'A manual removal would touch'
AFTER=$(cat "$MEMFILE"; find "$DEST" | sort)
[ "$BEFORE" = "$AFTER" ] || fail "the refusal changed something on disk"

CASE="refuses-a-newer-manifest-version"
install newerversion
python3 - "$DEST/.katharsis-install.json" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d["version"] = 99
json.dump(d, open(p, "w"))
PY
uninstall apply --dest "$DEST"
assert_rc 2
assert_out 'REFUSING: manifest version 99 is newer'
[ -f "$DEST/alpha.md" ] || fail "a refused run still deleted a file"

CASE="refuses-a-non-native-backend"
install syllagobackend
python3 - "$DEST/.katharsis-install.json" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d["backend"] = "syllago"
json.dump(d, open(p, "w"))
PY
uninstall apply --dest "$DEST"
assert_rc 2
assert_out 'REFUSING: this install was made with the syllago backend'
[ -f "$DEST/alpha.md" ] || fail "a refused run still deleted a file"

CASE="refuses-a-corrupt-manifest"
install corrupt
printf 'not json at all\n' > "$DEST/.katharsis-install.json"
uninstall apply --dest "$DEST"
assert_rc 2
assert_out 'REFUSING: .* is not valid JSON'
[ -f "$DEST/alpha.md" ] || fail "a refused run still deleted a file"

# --- restoring a displaced file -------------------------------------------------
CASE="restores-a-file-the-install-displaced"
HOME_DIR="$TMP/displaced"; DEST="$HOME_DIR/.claude/katharsis"; MEMFILE="$HOME_DIR/AGENTS.md"
mkdir -p "$DEST" "$HOME_DIR/.claude"
printf '# Mine\n' > "$MEMFILE"
printf 'the installer wrote this first\n' > "$DEST/alpha.md"
HOME="$HOME_DIR" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST" \
  --set READER_NAME=Sam --import-into "$MEMFILE" >/dev/null
uninstall apply --dest "$DEST"
assert_rc 0
assert_out 'restore alpha\.md from'
[ -f "$DEST/alpha.md" ] || fail "the displaced file was not restored"
grep -Fq 'the installer wrote this first' "$DEST/alpha.md" \
  || fail "the restored file does not hold the installer's bytes"

CASE="a-reapply-keeps-the-displaced-record-for-the-uninstall"
# A second apply sees the file it wrote, unchanged. Relabeling it reinstalled
# would drop the archive pointer, so the uninstall would delete the file
# without restoring the installer's original.
HOME_DIR="$TMP/redisplaced"; DEST="$HOME_DIR/.claude/katharsis"; MEMFILE="$HOME_DIR/AGENTS.md"
mkdir -p "$DEST" "$HOME_DIR/.claude"
printf '# Mine\n' > "$MEMFILE"
printf 'the installer wrote this first\n' > "$DEST/alpha.md"
HOME="$HOME_DIR" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST" \
  --set READER_NAME=Sam --import-into "$MEMFILE" >/dev/null
HOME="$HOME_DIR" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST" \
  --set READER_NAME=Sam --import-into "$MEMFILE" >/dev/null
uninstall apply --dest "$DEST"
assert_rc 0
assert_out 'restore alpha\.md from'
grep -Fq 'the installer wrote this first' "$DEST/alpha.md" \
  || fail "the re-apply lost the displaced original"

CASE="keeps-a-displaced-file-whose-archive-is-missing"
# Removing the file first and finding the archive gone would leave the
# installer with nothing, so the archive is checked before anything is deleted.
HOME_DIR="$TMP/lostarchive"; DEST="$HOME_DIR/.claude/katharsis"; MEMFILE="$HOME_DIR/AGENTS.md"
mkdir -p "$DEST" "$HOME_DIR/.claude"
printf '# Mine\n' > "$MEMFILE"
printf 'the installer wrote this first\n' > "$DEST/alpha.md"
HOME="$HOME_DIR" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST" \
  --set READER_NAME=Sam --import-into "$MEMFILE" >/dev/null
rm -f "$DEST/.katharsis-displaced/alpha.md"
cp "$DEST/alpha.md" "$TMP/lostarchive-alpha"
uninstall apply --dest "$DEST"
assert_rc 0
assert_out 'keep alpha\.md: the manifest names .* which is missing'
diff -q "$TMP/lostarchive-alpha" "$DEST/alpha.md" >/dev/null \
  || fail "a file with a missing archive was changed"
[ -f "$DEST/.katharsis-install.json" ] || fail "the manifest was removed while the file remained"

CASE="removes-a-settings-file-the-install-created"
HOME_DIR="$TMP/newsettings"; DEST="$HOME_DIR/.claude/katharsis"
MEMFILE="$HOME_DIR/AGENTS.md"; SETTINGS="$HOME_DIR/.claude/settings.json"
mkdir -p "$HOME_DIR/.claude"
printf '# Mine\n' > "$MEMFILE"
HOME="$HOME_DIR" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST" \
  --set READER_NAME=Sam --import-into "$MEMFILE" >/dev/null
HOME="$HOME_DIR" "$SETTINGS_EDIT" apply --edit all --dest "$DEST" --settings "$SETTINGS" >/dev/null
[ -f "$SETTINGS" ] || fail "the settings edit did not create the file"
uninstall apply --dest "$DEST"
assert_rc 0
assert_out 'removed .*settings\.json, which the install created'
[ ! -f "$SETTINGS" ] || fail "a settings file the install created was left behind"

# --- memory-file byte round trips -------------------------------------------------
CASE="roundtrip-restores-a-memory-file-without-a-trailing-newline"
# An end-position insert adds the trailing newline the file lacked, so the
# plain splice cannot give the original bytes back. The recorded backup can.
HOME_DIR="$TMP/nonewline"; DEST="$HOME_DIR/.claude/katharsis"; MEMFILE="$HOME_DIR/AGENTS.md"
mkdir -p "$HOME_DIR/.claude"
printf '# My memory file\n\nNo newline at the end' > "$MEMFILE"
cp "$MEMFILE" "$TMP/nonewline-copy"
HOME="$HOME_DIR" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST" \
  --set READER_NAME=Sam --import-into "$MEMFILE" --position end >/dev/null
uninstall apply --dest "$DEST"
assert_rc 0
diff -q "$TMP/nonewline-copy" "$MEMFILE" >/dev/null \
  || fail "a memory file without a trailing newline did not come back byte for byte"

CASE="roundtrip-restores-a-memory-file-with-leading-blank-lines"
# A top-position insert drops the file's leading blank lines, which the plain
# splice cannot put back. The recorded backup can.
HOME_DIR="$TMP/leadingblank"; DEST="$HOME_DIR/.claude/katharsis"; MEMFILE="$HOME_DIR/AGENTS.md"
mkdir -p "$HOME_DIR/.claude"
printf '\n\n# My memory file\n' > "$MEMFILE"
cp "$MEMFILE" "$TMP/leadingblank-copy"
HOME="$HOME_DIR" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST" \
  --set READER_NAME=Sam --import-into "$MEMFILE" >/dev/null
uninstall apply --dest "$DEST"
assert_rc 0
diff -q "$TMP/leadingblank-copy" "$MEMFILE" >/dev/null \
  || fail "a memory file with leading blank lines did not come back byte for byte"

# --- files the audit created ----------------------------------------------------
CASE="refuses-a-file-the-audit-created"
install usercontent
printf '# My pairs\n\nFrom my own prose.\n' > "$DEST/examples.md"
HOME="$HOME_DIR" "$SETUP" reseal --dest "$DEST" --note "accepted pairs" >/dev/null
uninstall apply --dest "$DEST"
assert_rc 0
assert_out 'keep examples\.md: holds content you accepted'
grep -Fq 'From my own prose' "$DEST/examples.md" || fail "accepted pairs were deleted"

CASE="still-removes-a-resealed-rule-file"
install resealed
printf '\n## Rule 12\n\nA derived rule.\n' >> "$DEST/alpha.md"
HOME="$HOME_DIR" "$SETUP" reseal --dest "$DEST" --note "derivation approved" >/dev/null
uninstall apply --dest "$DEST"
assert_rc 0
assert_out '^remove alpha\.md'
assert_out 'the audit.s pre-rewrite copy of alpha\.md'
[ ! -f "$DEST/alpha.md" ] || fail "a resealed rule file was kept"

# --- second runs ----------------------------------------------------------------
CASE="a-second-run-after-resolving-finishes-the-job"
install second
echo 'my own addition' >> "$DEST/alpha.md"
uninstall apply --dest "$DEST"
assert_out 'keep alpha\.md'
rm -f "$DEST/alpha.md"
uninstall apply --dest "$DEST"
assert_rc 0
assert_out 'gone alpha\.md: already removed'
assert_out 'uninstall complete'

CASE="a-second-uninstall-refuses-rather-than-guessing"
uninstall apply --dest "$DEST"
assert_rc 2
assert_out 'NOT FOUND: no install manifest'

# --- usage ----------------------------------------------------------------------
CASE="usage-no-mode"
RC=0; OUT=$("$UNINSTALL" 2>&1) || RC=$?
assert_rc 2
assert_out 'usage:'

CASE="usage-unknown-flag"
RC=0; OUT=$("$UNINSTALL" plan --bogus 2>&1) || RC=$?
assert_rc 2
assert_out 'unknown argument'

CASE="usage-missing-dest"
RC=0; OUT=$("$UNINSTALL" plan --dest "$TMP/no-such-dir" 2>&1) || RC=$?
assert_rc 2
assert_out 'NOT FOUND: install directory'

# --- summary --------------------------------------------------------------------
if [ "$FAILS" -gt 0 ]; then
  echo "test-uninstall: $FAILS assertion(s) failed"
  exit 1
fi
echo "test-uninstall: all assertions passed"
exit 0
