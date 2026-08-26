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

CASE="apply-missing-dest"
run apply --rules "$FIX/rules" --set READER_NAME=Sam
assert_rc 2
assert_out 'apply requires --dest'

# --- apply: the import line -----------------------------------------------------
# Appended once, never twice, and a dest under HOME is written with a tilde.
CASE="import-append"
MEMFILE="$TMP/fakehome/AGENTS.md"
mkdir -p "$TMP/fakehome"
printf '# My memory file\n' > "$MEMFILE"
DEST="$TMP/fakehome/.claude/katharsis"
RC=0; OUT=$(HOME="$TMP/fakehome" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST" \
  --set READER_NAME=Sam --import-into "$MEMFILE" 2>&1) || RC=$?
assert_rc 0
assert_out 'appended to'
assert_file_has "$MEMFILE" '@~/.claude/katharsis/loader.md'

CASE="import-idempotent"
RC=0; OUT=$(HOME="$TMP/fakehome" "$SETUP" apply --rules "$FIX/rules" --dest "$DEST" \
  --set READER_NAME=Sam --import-into "$MEMFILE" 2>&1) || RC=$?
assert_rc 0
assert_out 'already present'
N=$(grep -c 'loader.md' "$MEMFILE") || true
[ "$N" -eq 1 ] || fail "expected 1 import line, found $N"

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
