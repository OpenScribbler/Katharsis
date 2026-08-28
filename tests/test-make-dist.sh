#!/usr/bin/env bash
# Black-box suite for scripts/make-dist.sh. The drift cases carry the weight:
# check must fail on a tampered file, a missing file, and a stale extra, and
# the final case checks the repo's own committed dist, so CI fails whenever a
# canonical rule edit lands without its dist rebuild.

set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/scripts/make-dist.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

FAILS=0
CASE=""
fail() { echo "  FAIL [$CASE] $*"; FAILS=$((FAILS + 1)); }
assert_out() { echo "$OUT" | grep -Eq "$1" || fail "expected /$1/ in output; got: $OUT"; }
assert_rc() { [ "$RC" -eq "$1" ] || fail "expected exit $1, got $RC; output: $OUT"; }

run() {
  RC=0
  OUT=$(bash "$DIST" "$@" 2>&1) || RC=$?
}

CASE="usage: unknown mode exits 2"
run frobnicate
assert_rc 2
assert_out "usage:"

CASE="build writes only the rule files, fully substituted"
run build --dest "$TMP/out"
assert_rc 0
for name in writing.md technical-english.md git-writing.md; do
  [ -f "$TMP/out/$name" ] || fail "missing $name"
done
[ -e "$TMP/out/loader.md" ] && fail "loader.md is an install artifact and must not land in dist"
[ -e "$TMP/out/promoted.md" ] && fail "promoted.md is an install artifact and must not land in dist"
[ -e "$TMP/out/.katharsis-install.json" ] && fail "the manifest must not land in dist"
grep -rq '{{' "$TMP/out" && fail "a placeholder marker survived substitution"
grep -q 'the user' "$TMP/out/writing.md" || fail "READER_NAME was not substituted with the generic value"

CASE="check passes against a fresh build"
run check --dest "$TMP/out"
assert_rc 0
assert_out "dist matches"

CASE="build is idempotent"
run build --dest "$TMP/out"
assert_rc 0
run check --dest "$TMP/out"
assert_rc 0

CASE="check fails on a tampered file"
printf 'tampered\n' >> "$TMP/out/writing.md"
run check --dest "$TMP/out"
assert_rc 1
assert_out "DRIFT: .*writing.md differs"
run build --dest "$TMP/out"

CASE="check fails on a missing file"
rm "$TMP/out/git-writing.md"
run check --dest "$TMP/out"
assert_rc 1
assert_out "DRIFT: .*git-writing.md is missing"
run build --dest "$TMP/out"

CASE="check fails on a stale extra file"
printf 'stale\n' > "$TMP/out/leftover.md"
run check --dest "$TMP/out"
assert_rc 1
assert_out "DRIFT: .*leftover.md has no canonical counterpart"
rm "$TMP/out/leftover.md"

CASE="the committed dist matches the canonical rules"
run check
assert_rc 0

if [ "$FAILS" -gt 0 ]; then
  echo "$FAILS failing case(s)"
  exit 1
fi
echo "all cases passed"
