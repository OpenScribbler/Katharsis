#!/usr/bin/env bash
# make-dist.sh: regenerate dist/rules/, the generic build of the rule files with
# every {{PLACEHOLDER}} already substituted (D24 in docs/design.md). The build
# serves distribution channels that have no setup step, such as a cross-tool
# package manager or registry, where the canonical files would ship literal
# markers. Substitution runs through setup-rules.sh apply, so the one engine
# that verifies no marker survives is the one that produces this build.
#
# The generic values: READER_NAME becomes "the user", and every other
# placeholder takes the default rules/placeholders.yaml declares. Only the rule
# files land in dist; the loader, promoted.md, and the manifest are install
# artifacts, not distribution content.
#
# Modes:
#   build   Regenerate the dist files in place.
#   check   Regenerate into a scratch directory and compare against dist.
#           Exits 1 on drift, so the test suite catches a canonical edit whose
#           dist counterpart was not rebuilt.
#
# --dest DIR overrides the output directory (default: <repo>/dist/rules), so
# the test suite builds into a workspace of its own.
#
# Usage: make-dist.sh build|check [--dest DIR]

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
READER_NAME="the user"

MODE="${1-}"
case "$MODE" in
  build|check) shift ;;
  *) echo "usage: make-dist.sh build|check [--dest DIR]" >&2; exit 2 ;;
esac

DEST="$ROOT/dist/rules"
while [ $# -gt 0 ]; do
  case "$1" in
    --dest) [ $# -ge 2 ] || { echo "--dest requires a value" >&2; exit 2; }; DEST="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if ! OUT=$(bash "$ROOT/scripts/setup-rules.sh" apply --dest "$TMP" \
    --set "READER_NAME=$READER_NAME" 2>&1); then
  echo "setup-rules.sh apply failed; nothing was written:" >&2
  echo "$OUT" >&2
  exit 2
fi

# The rule files are rules/*.md minus the loader, the same set apply installs,
# so a rule file added later joins the build without an edit here.
RULES=()
for f in "$ROOT"/rules/*.md; do
  name="$(basename "$f")"
  [ "$name" = "loader.md" ] && continue
  RULES+=("$name")
done

if [ "$MODE" = "build" ]; then
  mkdir -p "$DEST"
  for name in "${RULES[@]}"; do
    cp "$TMP/$name" "$DEST/$name"
  done
  echo "wrote ${#RULES[@]} files to $DEST: ${RULES[*]}"
  exit 0
fi

# check
RC=0
for name in "${RULES[@]}"; do
  if [ ! -f "$DEST/$name" ]; then
    echo "DRIFT: $DEST/$name is missing; run scripts/make-dist.sh build" >&2
    RC=1
  elif ! cmp -s "$TMP/$name" "$DEST/$name"; then
    echo "DRIFT: $DEST/$name differs from the canonical rules; run scripts/make-dist.sh build" >&2
    RC=1
  fi
done
for f in "$DEST"/*.md; do
  [ -e "$f" ] || continue
  name="$(basename "$f")"
  found=0
  for expected in "${RULES[@]}"; do
    [ "$name" = "$expected" ] && found=1
  done
  if [ "$found" -eq 0 ]; then
    echo "DRIFT: $DEST/$name has no canonical counterpart in rules/; remove it or run scripts/make-dist.sh build" >&2
    RC=1
  fi
done
[ "$RC" -eq 0 ] && echo "dist matches the canonical rules"
exit "$RC"
