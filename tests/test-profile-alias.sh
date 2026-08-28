#!/usr/bin/env bash
# Black-box suite for scripts/profile-alias.sh. The reversal cases carry the
# weight, as in the settings suite: a line the installer wrote must never be
# removed, and a profile must come back byte for byte when nothing else
# changed it, trailing-newline quirks included.

set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETUP="$ROOT/scripts/setup-rules.sh"
ALIAS="$ROOT/scripts/profile-alias.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

FAILS=0
CASE=""
fail() { echo "  FAIL [$CASE] $*"; FAILS=$((FAILS + 1)); }
assert_out() { echo "$OUT" | grep -Eq "$1" || fail "expected /$1/ in output; got: $OUT"; }
assert_rc() { [ "$RC" -eq "$1" ] || fail "expected exit $1, got $RC; output: $OUT"; }

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
printf 'Chat replies to {{READER_NAME}}.\n' > "$FIX/rules/alpha.md"
printf '# Writing rules\n\n@alpha.md\n@promoted.md\n' > "$FIX/rules/loader.md"

# workspace NAME [setup args...] -> sets HOME_DIR, DEST, PROFILE with a real install
workspace() {
  local name="$1"; shift
  HOME_DIR="$TMP/$name"
  DEST="$HOME_DIR/kath"
  PROFILE="$HOME_DIR/profile"
  mkdir -p "$HOME_DIR"
  HOME="$HOME_DIR" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST" \
    --set READER_NAME=Sam --wrapper "$@" >/dev/null
}

palias() { RC=0; OUT=$(HOME="$HOME_DIR" "$ALIAS" "$@" --dest "$DEST" 2>&1) || RC=$?; }

# manifest_get EXPR reads one value out of the manifest, with the manifest as d
# and its aliases list as a. eval runs only this suite's own literal
# expressions, the same pattern test-settings-edit.sh uses.
manifest_get() { python3 -c "
import json, sys
d = json.load(open('$DEST/.katharsis-install.json'))
a = d.get('aliases') or []
print(json.dumps(eval(sys.argv[1], {'d': d, 'a': a})))
" "$1"; }

# --- apply ----------------------------------------------------------------------
CASE="apply-appends-the-line-and-records-it"
workspace basic
printf '# my profile\nexport FOO=1\n' > "$PROFILE"
palias apply --profile "$PROFILE"
assert_rc 0
assert_out 'kclaude: appended to'
assert_out 'the line: alias kclaude='
grep -Fq "alias kclaude=\"\$HOME/kath/kclaude\"" "$PROFILE" \
  || fail "the alias line is not in the profile"
[ "$(manifest_get 'len(a)')" = "1" ] || fail "expected one alias record"
[ "$(manifest_get 'a[0]["was_present"]')" = "false" ] || fail "was_present should be false"
[ "$(manifest_get 'a[0]["name"]')" = '"kclaude"' ] || fail "record name is wrong"
[ "$(manifest_get '"sha256_before" in a[0]')" = "true" ] || fail "no pre-append hash recorded"

CASE="apply-is-idempotent"
palias apply --profile "$PROFILE"
assert_rc 0
assert_out 'already applied by Katharsis; nothing to do'
[ "$(grep -c 'alias kclaude=' "$PROFILE")" = "1" ] || fail "a second apply duplicated the line"
[ "$(manifest_get 'len(a)')" = "1" ] || fail "a second apply duplicated the record"

CASE="apply-refuses-without-the-wrapper"
HOME_DIR="$TMP/nowrap"
DEST="$HOME_DIR/kath"
PROFILE="$HOME_DIR/profile"
mkdir -p "$HOME_DIR"
HOME="$HOME_DIR" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST" --set READER_NAME=Sam >/dev/null
printf '# p\n' > "$PROFILE"
palias apply --profile "$PROFILE"
assert_rc 2
assert_out 'NOT FOUND: no launch wrapper'
grep -q 'alias' "$PROFILE" && fail "the refusal still wrote the line" || true

CASE="apply-refuses-without-a-manifest"
HOME_DIR="$TMP/noman"
DEST="$HOME_DIR/kath"
PROFILE="$HOME_DIR/profile"
mkdir -p "$HOME_DIR"
printf '# p\n' > "$PROFILE"
palias apply --profile "$PROFILE"
assert_rc 2
assert_out 'NOT FOUND: no manifest'

CASE="apply-refuses-a-bad-alias-name"
workspace badname
printf '# p\n' > "$PROFILE"
palias apply --profile "$PROFILE" --alias 'k;rm'
assert_rc 2
assert_out 'invalid alias name'

CASE="apply-refuses-a-name-the-installer-took"
workspace taken
printf 'alias kclaude="my own thing"\n' > "$PROFILE"
SNAP=$(cat "$PROFILE")
palias apply --profile "$PROFILE"
assert_rc 2
assert_out 'REFUSING: .* already defines an alias named kclaude'
[ "$(cat "$PROFILE")" = "$SNAP" ] || fail "the refusal changed the profile"
[ "$(manifest_get 'len(a)')" = "0" ] || fail "the refusal recorded something"

CASE="apply-records-a-preexisting-identical-line-as-was-present"
workspace preexist
printf 'alias kclaude="$HOME/kath/kclaude"\n' > "$PROFILE"
SNAP=$(cat "$PROFILE")
palias apply --profile "$PROFILE"
assert_rc 0
assert_out 'already in .* before this install; recorded, nothing written'
[ "$(cat "$PROFILE")" = "$SNAP" ] || fail "apply changed a profile it found the line in"
[ "$(manifest_get 'a[0]["was_present"]')" = "true" ] || fail "was_present should be true"

CASE="apply-creates-a-missing-profile"
workspace createfile
palias apply --profile "$PROFILE"
assert_rc 0
[ -f "$PROFILE" ] || fail "the profile was not created"
[ "$(manifest_get 'a[0]["created_file"]')" = "true" ] || fail "created_file not recorded"

CASE="apply-re-appends-a-line-the-installer-removed"
workspace reappend
printf '# p\n' > "$PROFILE"
palias apply --profile "$PROFILE"
printf '# p\n' > "$PROFILE"
palias apply --profile "$PROFILE"
assert_rc 0
assert_out 'kclaude: appended to'
[ "$(grep -c 'alias kclaude=' "$PROFILE")" = "1" ] || fail "the line did not come back once"
[ "$(manifest_get 'len(a)')" = "1" ] || fail "the re-append duplicated the record"

# --- reverse --------------------------------------------------------------------
CASE="reverse-restores-a-newline-less-profile-byte-for-byte"
workspace bytes
printf '# my profile\nexport FOO=1' > "$PROFILE"
cp "$PROFILE" "$TMP/bytes-snap"
palias apply --profile "$PROFILE"
palias reverse --profile "$PROFILE"
assert_rc 0
assert_out 'back to its pre-append bytes'
diff -q "$TMP/bytes-snap" "$PROFILE" >/dev/null || fail "the profile did not come back byte for byte"
[ "$(manifest_get 'len(a)')" = "0" ] || fail "the record survived the reversal"

CASE="reverse-splices-only-the-line-when-the-profile-changed-since"
workspace splice
printf '# p\n' > "$PROFILE"
palias apply --profile "$PROFILE"
printf 'export LATER=1\n' >> "$PROFILE"
palias reverse --profile "$PROFILE"
assert_rc 0
assert_out 'other changes since'
grep -q 'alias kclaude=' "$PROFILE" && fail "the alias line survived" || true
grep -q 'LATER=1' "$PROFILE" || fail "the reversal removed the installer's own later line"

CASE="reverse-keeps-a-was-present-line"
workspace keepline
printf 'alias kclaude="$HOME/kath/kclaude"\n' > "$PROFILE"
palias apply --profile "$PROFILE"
palias reverse --profile "$PROFILE"
assert_rc 0
assert_out 'left in .* because it was already there before the install'
grep -q 'alias kclaude=' "$PROFILE" || fail "the reversal removed the installer's own line"

CASE="reverse-removes-a-profile-the-apply-created"
workspace rmfile
palias apply --profile "$PROFILE"
palias reverse --profile "$PROFILE"
assert_rc 0
assert_out 'removed .* which the alias write created'
[ ! -f "$PROFILE" ] || fail "the created profile survived the reversal"

CASE="reverse-reports-an-unrecorded-alias"
workspace norecord
printf '# p\n' > "$PROFILE"
palias reverse --profile "$PROFILE"
assert_rc 0
assert_out 'not recorded for .*; left alone'

CASE="reverse-reports-a-line-already-gone"
workspace linegone
printf '# p\n' > "$PROFILE"
palias apply --profile "$PROFILE"
printf '# p\n' > "$PROFILE"
palias reverse --profile "$PROFILE"
assert_rc 0
assert_out 'gone, already removed'
[ "$(manifest_get 'len(a)')" = "0" ] || fail "the record survived"

# --- status ---------------------------------------------------------------------
CASE="status-reports-the-recorded-alias"
workspace stat
printf '# p\n' > "$PROFILE"
palias apply --profile "$PROFILE"
palias status
assert_rc 0
assert_out 'kclaude in .*: present \(appended by Katharsis\)'

CASE="status-reports-an-empty-record"
workspace statempty
palias status
assert_rc 0
assert_out 'no alias is recorded'

# --- summary --------------------------------------------------------------------
if [ "$FAILS" -gt 0 ]; then
  echo "test-profile-alias: $FAILS failure(s)"
  exit 1
fi
echo "test-profile-alias: all assertions passed"
