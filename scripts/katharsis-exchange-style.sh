#!/usr/bin/env bash
# katharsis-exchange-style.sh: delivers the exchange-type guidance the Katharsis
# output style routes to, and records that the routing happened.
#
# The model classifies the exchange and runs this with the type it chose. The
# script never classifies; that judgment stays with the model.
#
# Delivery, not enforcement: an env var cannot carry this. A Bash call runs in
# its own shell and hooks are separate subprocesses, so nothing exported here
# reaches a later hook or a later turn. Printing the file to stdout puts it in
# the model's context as a tool result instead, which means running the script
# *is* the read, with no path where it runs and the guidance is absent.
#
# Two types are allowed, for a message carrying two exchange types. The primary
# prints whole and governs the opening line, the exclusion list, and the
# ceiling. The secondary is validated and stamped but not printed: a live A/B
# run found its served sections added nothing separable, and the one thing
# they did add now lives as a clause in every primary's Shape.
# KATHARSIS_SECONDARY_MODE=full or =shape restores the old slices for
# experiments.
# Three or more types go to default.md, so a third argument is an error.
#
# The state line exists for the Stop gate in stop-classify.sh: it reads the
# file, and a turn with nothing stamped means the classification step was
# skipped. Written before the guidance prints, so a closed stdout cannot cost
# the stamp. Overwritten rather than appended, since only the current turn
# matters, and keyed by CLAUDE_CODE_SESSION_ID so two concurrent sessions
# neither satisfy nor consume each other's stamp. The gate deletes the file it
# reads, which is what makes a stamp belong to one turn.
#
# Exits non-zero on a bad or missing type and prints the valid set, so a typo
# cannot pass silently as a successful read.
#
# Code lives at ~/.claude/katharsis, the symlink session-link.sh points at the
# plugin root; when the link is missing the script's own location serves,
# since scripts/ sits beside styles/ in the plugin. Stamps go to the data
# directory, ~/.claude/katharsis-data, because the plugin directory is a
# read-only cache under a marketplace install. KATHARSIS_DIR and
# KATHARSIS_DATA override the two for tests.

set -u

SELF="$(cd "$(dirname "$0")" && pwd)"
DIR="${KATHARSIS_DIR:-$HOME/.claude/katharsis}"
[ -n "${KATHARSIS_DIR-}" ] || [ -d "$DIR/styles" ] || DIR="$(dirname "$SELF")"
STYLES="$DIR/styles"
DATA="${KATHARSIS_DATA:-$HOME/.claude/katharsis-data}"
STATE="$DATA/.exchange-state${CLAUDE_CODE_SESSION_ID:+-$CLAUDE_CODE_SESSION_ID}"

# Every .md in styles/ is a type except the shared contract and the skeleton.
types() {
  find "$STYLES" -maxdepth 1 -name '*.md' 2>/dev/null |
    sed 's#.*/##; s#\.md$##' |
    grep -vx -e README -e katharsis-style-template |
    sort
}

die() {
  printf '%s\n\n' "$1" >&2
  printf 'Usage: %s <type> [secondary-type]\n\nValid types:\n' "${0##*/}" >&2
  types | sed 's/^/  /' >&2
  exit 2
}

[ -d "$STYLES" ] || { printf 'No styles directory at %s\n' "$STYLES" >&2; exit 2; }
[ "$#" -ge 1 ] || die "No exchange type given."
[ "$#" -le 2 ] || die "Three or more types go to default.md. Pass at most two."

valid() { types | grep -qx "$1"; }

PRIMARY="$1"
valid "$PRIMARY" || die "Unknown exchange type: $PRIMARY"

SECONDARY=""
if [ "$#" -eq 2 ]; then
  SECONDARY="$2"
  valid "$SECONDARY" || die "Unknown exchange type: $SECONDARY"
  [ "$SECONDARY" != "$PRIMARY" ] || die "Primary and secondary are the same type: $PRIMARY"
fi

# Stamped before the guidance prints, not after. The stamp records that routing
# happened, which is already true here: the types are validated and the file is
# about to be read. Writing it last made it hostage to anything that closes
# stdout early -- `| head -20` sends SIGPIPE mid-`cat`, the script dies before
# the write, and the Stop gate reports a skip for a turn that classified fine.
# The cost is that a truncated read now satisfies the gate, so redirect long
# output to a file rather than piping it into `head`.
mkdir -p "$DATA" 2>/dev/null || true
printf '%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PRIMARY" "$SECONDARY" > "$STATE" 2>/dev/null || true
# A second copy the Stop gate never consumes, so the prompt hook can carry the
# type forward onto a turn nobody typed (bash output, a task notification).
cp -f "$STATE" "${STATE/.exchange-state/.exchange-last}" 2>/dev/null || true

# One `## Section` block, from its header to the next `## ` at line start.
section() { # section <file> <name>
  awk -v want="## $2" '
    $0 == want { inside = 1; print; next }
    inside && /^## / { exit }
    inside { print }
  ' "$1"
}

printf '=== PRIMARY: %s — governs the opening line, the exclusion list, and the ceiling ===\n\n' "$PRIMARY"
cat "$STYLES/$PRIMARY.md"

# KATHARSIS_SECONDARY_MODE overrides how much of the secondary prints, for the
# live A/B runs: solo (default, nothing), shape (Shape only), full (Shape,
# Ambiguities, Verification).
MODE="${KATHARSIS_SECONDARY_MODE:-solo}"
case "$MODE" in
  full) SECTIONS="Shape Ambiguities Verification"; LABEL="Shape, Ambiguities, and Verification only" ;;
  shape) SECTIONS="Shape"; LABEL="Shape only" ;;
  solo) SECONDARY="" ;;
  *) die "Unknown KATHARSIS_SECONDARY_MODE: $MODE (full, shape, solo)" ;;
esac

if [ -n "$SECONDARY" ]; then
  printf '\n\n=== SECONDARY: %s — %s ===\n' "$SECONDARY" "$LABEL"
  for s in $SECTIONS; do
    body="$(section "$STYLES/$SECONDARY.md" "$s")"
    if [ -n "$body" ]; then
      printf '\n%s\n' "$body"
    else
      printf '\n## %s\n\n(no %s section in %s.md)\n' "$s" "$s" "$SECONDARY"
    fi
  done
  printf '\nBody order follows the order the parts appear in the message. The ceiling is the tighter of the two.\n'
fi
