#!/usr/bin/env bash
# Black-box suite for scripts/settings-edit.sh. The reversal cases carry the
# weight: an edit that cannot prove Katharsis made it must never be undone, and
# a key that held another value must come back holding it.

set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETUP="$ROOT/scripts/setup-rules.sh"
EDIT="$ROOT/scripts/settings-edit.sh"
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
printf 'Replies to {{READER_NAME}}.\n' > "$FIX/rules/alpha.md"

# workspace NAME '<settings json>' -> sets DEST and SETTINGS with a real manifest
workspace() {
  HOME_DIR="$TMP/$1"
  DEST="$HOME_DIR/.claude/katharsis"
  SETTINGS="$HOME_DIR/.claude/settings.json"
  mkdir -p "$HOME_DIR/.claude"
  printf '%s' "$2" > "$SETTINGS"
  HOME="$HOME_DIR" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST" \
    --set READER_NAME=Sam >/dev/null
}

edit() { RC=0; OUT=$(HOME="$HOME_DIR" "$EDIT" "$@" --dest "$DEST" --settings "$SETTINGS" 2>&1) || RC=$?; }

# key VALUE-EXPR reads one value out of the settings file
jq_get() { python3 -c "
import json,sys
d=json.load(open('$SETTINGS'))
print(json.dumps(eval(sys.argv[1], {'d': d})))
" "$1"; }

# --- status ---------------------------------------------------------------------
CASE="status-reports-both-edits-as-not-applied"
workspace status '{"theme": "dark"}'
edit status
assert_rc 0
assert_out 'deny-askuserquestion: not applied'
assert_out 'disable-auto-memory: not applied'

CASE="status-writes-nothing"
BEFORE=$(cat "$SETTINGS")
edit status
[ "$BEFORE" = "$(cat "$SETTINGS")" ] || fail "status changed the settings file"

# --- apply ----------------------------------------------------------------------
CASE="apply-adds-both-edits-and-keeps-the-rest"
edit apply --edit all
assert_rc 0
assert_out 'deny-askuserquestion: applied'
assert_out 'disable-auto-memory: applied'
[ "$(jq_get 'd["permissions"]["deny"]')" = '["AskUserQuestion"]' ] \
  || fail "deny array wrong: $(jq_get 'd["permissions"]["deny"]')"
[ "$(jq_get 'd["autoMemoryEnabled"]')" = 'false' ] || fail "autoMemoryEnabled not set"
[ "$(jq_get 'd["theme"]')" = '"dark"' ] || fail "an unrelated key was lost"

CASE="apply-is-idempotent"
edit apply --edit all
assert_rc 0
assert_out 'already applied by Katharsis'
[ "$(jq_get 'len(d["permissions"]["deny"])' 2>/dev/null || echo 1)" = "1" ] \
  || [ "$(jq_get 'd["permissions"]["deny"]')" = '["AskUserQuestion"]' ] \
  || fail "a second apply duplicated the entry"

CASE="apply-status-now-reports-applied"
edit status
assert_out 'deny-askuserquestion: applied'

CASE="apply-saves-the-file-as-it-was"
[ -f "$DEST/.katharsis-displaced/settings.json.bak" ] || fail "no pre-edit backup was saved"
grep -Fq '"theme": "dark"' "$DEST/.katharsis-displaced/settings.json.bak" \
  || fail "the backup does not hold the original bytes"

# --- reverse --------------------------------------------------------------------
CASE="reverse-removes-only-what-the-install-added"
edit reverse --edit all
assert_rc 0
assert_out 'removed the entry the install added'
[ "$(jq_get 'd.get("autoMemoryEnabled", "absent")')" = '"absent"' ] \
  || fail "autoMemoryEnabled survived the reversal"
[ "$(jq_get 'd.get("permissions", "absent")')" = '"absent"' ] \
  || fail "the permissions container this edit created survived"
[ "$(jq_get 'd["theme"]')" = '"dark"' ] || fail "an unrelated key was lost in the reversal"

CASE="reverse-keeps-an-entry-the-installer-had-already-set"
workspace preset '{"permissions": {"deny": ["AskUserQuestion", "Bash"]}, "autoMemoryEnabled": false}'
BEFORE=$(cat "$SETTINGS")
edit apply --edit all
assert_out 'deny-askuserquestion: already set before this install'
assert_out 'disable-auto-memory: already set before this install'
edit reverse --edit all
assert_rc 0
assert_out 'was already set before the install; left as it is'
[ "$BEFORE" = "$(cat "$SETTINGS")" ] || fail "a pre-existing value was modified"

CASE="reverse-restores-a-value-the-installer-had-set-differently"
workspace flipped '{"autoMemoryEnabled": true}'
edit apply --edit disable-auto-memory
[ "$(jq_get 'd["autoMemoryEnabled"]')" = 'false' ] || fail "the edit did not apply"
edit reverse --edit disable-auto-memory
assert_rc 0
assert_out 'restored the value it had before'
[ "$(jq_get 'd["autoMemoryEnabled"]')" = 'true' ] \
  || fail "the prior value was deleted instead of restored"

CASE="reverse-keeps-other-entries-in-the-deny-array"
workspace others '{"permissions": {"deny": ["Bash(rm:*)"]}}'
edit apply --edit deny-askuserquestion
edit reverse --edit deny-askuserquestion
assert_rc 0
[ "$(jq_get 'd["permissions"]["deny"]')" = '["Bash(rm:*)"]' ] \
  || fail "reversal did not leave the other deny entries alone"

CASE="reverse-without-a-record-leaves-the-file-alone"
workspace norecord '{"autoMemoryEnabled": false}'
BEFORE=$(cat "$SETTINGS")
edit reverse --edit disable-auto-memory
assert_rc 0
assert_out 'not recorded for .*; left alone'
[ "$BEFORE" = "$(cat "$SETTINGS")" ] || fail "an unrecorded value was removed"

# --- refusals -------------------------------------------------------------------
CASE="refuses-invalid-json"
workspace badjson '{"theme": "dark"'
edit apply --edit all
assert_rc 2
assert_out 'REFUSING: .* is not valid JSON'
assert_out 'editing it here would discard content'

CASE="refuses-a-deny-key-that-is-not-an-array"
workspace notarray '{"permissions": {"deny": "AskUserQuestion"}}'
edit apply --edit deny-askuserquestion
[ "$RC" -ne 0 ] || fail "expected a nonzero exit for a non-array deny key"
assert_out 'not an array'

CASE="refuses-apply-without-a-manifest"
HOME_DIR="$TMP/nomanifest"; DEST="$HOME_DIR/.claude/katharsis"; SETTINGS="$HOME_DIR/.claude/settings.json"
mkdir -p "$DEST"
printf '{}\n' > "$SETTINGS"
edit apply --edit all
assert_rc 2
assert_out 'NOT FOUND: no manifest'
assert_out 'Run setup-rules.sh apply first'

CASE="refuses-reverse-without-a-manifest"
edit reverse --edit all
assert_rc 2
assert_out 'Reverse them by hand'

CASE="usage-unknown-edit"
workspace unknownedit '{}'
edit apply --edit frobnicate
assert_rc 2
assert_out 'unknown edit frobnicate'

CASE="usage-apply-needs-an-edit"
RC=0; OUT=$("$EDIT" apply --dest "$DEST" 2>&1) || RC=$?
assert_rc 2
assert_out 'requires --edit'

CASE="usage-no-mode"
RC=0; OUT=$("$EDIT" 2>&1) || RC=$?
assert_rc 2
assert_out 'usage:'

# --- summary --------------------------------------------------------------------
if [ "$FAILS" -gt 0 ]; then
  echo "test-settings-edit: $FAILS assertion(s) failed"
  exit 1
fi
echo "test-settings-edit: all assertions passed"
exit 0
