#!/usr/bin/env bash
# Black-box suite for scripts/memory-inventory.sh. The fixture plants a store
# carrying every case the live store carries: a link that resolves exactly, one
# that resolves only after folding separators, one that resolves to nothing, an
# entry stem that two projects share, an index line naming a file that is gone,
# an entry whose frontmatter does not parse, and a project directory with no
# memory/ subdirectory at all.
#
# The archive cases assert what the script moved and what it left, because a
# purge that half-runs is worse than one that refuses.

set -eu
REPO="$(cd "$(dirname "$0")/.." && pwd)"
INV="$REPO/scripts/memory-inventory.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

FAILS=0
CASE=""

fail() { echo "  FAIL [$CASE] $*"; FAILS=$((FAILS + 1)); }

run() { RC=0; OUT=$("$INV" "$@" 2>&1) || RC=$?; }

assert_rc() { [ "$RC" -eq "$1" ] || fail "expected exit $1, got $RC; output: $OUT"; }
assert_out() { echo "$OUT" | grep -Eq "$1" || fail "expected /$1/ in output; got: $OUT"; }
assert_out_lacks() { ! echo "$OUT" | grep -Eq "$1" || fail "expected no /$1/; got: $OUT"; }
assert_line() { echo "$OUT" | grep -Fq -e "$1" || fail "expected line '$1'; got: $OUT"; }
assert_file() { [ -f "$1" ] || fail "expected $1 to exist"; }
assert_gone() { [ ! -e "$1" ] || fail "expected $1 to be gone"; }

# A store checksum, so a mode that must write nothing can be proven to write
# nothing rather than merely to exit zero.
store_sum() { find "$1" -type f | sort | xargs md5sum 2>/dev/null | md5sum | cut -d' ' -f1; }

# --- the fixture ----------------------------------------------------------------
SRC="$TMP/src/projects"
entry() {  # entry <path> <name> <description> [body]
  mkdir -p "$(dirname "$1")"
  { echo "---"
    echo "name: $2"
    echo "description: $3"
    echo "---"
    echo
    echo "${4:-Body.}"
  } > "$1"
}

mkdir -p "$SRC/proj-a/memory" "$SRC/proj-b/memory" "$SRC/proj-c/memory" "$SRC/proj-d"

entry "$SRC/proj-a/memory/alpha.md" alpha "The alpha entry" "Points at [[beta]]."
entry "$SRC/proj-a/memory/beta.md" beta "The beta entry" \
  "Points at [[alpha]], at [[gamma_notes]], and at [[missing-thing]]."
entry "$SRC/proj-a/memory/gamma-notes.md" gamma "The gamma entry, which nothing else names"
cat > "$SRC/proj-a/memory/MEMORY.md" <<'EOF'
# Memory

- [alpha](alpha.md) - the alpha entry
- [beta](beta.md) - the beta entry
- [gamma](gamma-notes.md) - the gamma entry
- [gone](gone.md) - an entry that no longer exists
EOF

entry "$SRC/proj-b/memory/alpha.md" alpha "A second entry sharing the alpha stem"
entry "$SRC/proj-b/memory/delta.md" delta "The delta entry" "Points at [[alpha]]."
cat > "$SRC/proj-b/memory/MEMORY.md" <<'EOF'
# Memory

- [alpha](alpha.md) - the other alpha
- [delta](delta.md) - the delta entry
EOF

# An entry whose frontmatter carries a bare colon, which YAML refuses to parse.
cat > "$SRC/proj-c/memory/broken.md" <<'EOF'
---
name: broken
description: sidebar: slug vs link
---

Body.
EOF

# proj-d has no memory/ directory, so the script skips it rather than failing.
echo "not a memory store" > "$SRC/proj-d/notes.txt"

clone() { rm -rf "${TMP:?}/${1:?}"; mkdir -p "$TMP/$1"; cp -a "$TMP/src/." "$TMP/$1/"; }

# --- list -----------------------------------------------------------------------
CASE="list-reports-every-entry"
clone w1
BEFORE=$(store_sum "$TMP/w1")
run list --root "$TMP/w1"
assert_rc 0
assert_out '^entry proj-a/alpha .* out=1 in=1 desc=The alpha entry$'
assert_out '^entry proj-a/beta .* out=3 in=1 desc=The beta entry$'
assert_out '^entry proj-a/gamma-notes .* out=0 in=1 desc=The gamma entry, which nothing else names$'
assert_out '^entry proj-b/delta .* out=1 in=0 desc=The delta entry$'

CASE="list-reports-the-unparseable-entry-without-ending-the-run"
assert_out '^malformed proj-c/broken '
assert_out '^entry proj-c/broken '

CASE="list-counts-the-store"
assert_out 'totals projects=3 entries=6 malformed=1 links=5 exact=3 normalized=1 dangling=1 index=6 index_dangling=1'

CASE="list-skips-a-project-with-no-memory-directory"
assert_out_lacks 'proj-d'

CASE="list-writes-nothing"
[ "$(store_sum "$TMP/w1")" = "$BEFORE" ] || fail "list changed the store"

CASE="list-scopes-to-one-project"
run list --root "$TMP/w1" --project proj-b
assert_rc 0
assert_out 'scope: proj-b'
assert_out_lacks 'proj-a/'
assert_out 'totals projects=1 entries=2 '

# --- links ----------------------------------------------------------------------
CASE="links-names-how-each-link-resolved"
run links --root "$TMP/w1"
assert_rc 0
assert_line "link proj-a/alpha -> beta status=exact resolved=beta"
assert_line "link proj-a/beta -> gamma_notes status=normalized resolved=gamma-notes"
assert_line "link proj-a/beta -> missing-thing status=dangling"

CASE="links-reports-a-dead-index-line"
assert_line "index proj-a/MEMORY.md:6 -> gone.md status=dangling"

CASE="links-keeps-a-link-inside-its-own-project"
assert_line "link proj-b/delta -> alpha status=exact resolved=alpha"

# --- impact ---------------------------------------------------------------------
CASE="impact-names-the-links-a-delete-would-break"
clone w2
BEFORE=$(store_sum "$TMP/w2")
run impact --root "$TMP/w2" --delete proj-a/gamma-notes
assert_rc 0
assert_line "delete proj-a/gamma-notes in=1"
assert_line "break proj-a/beta -> gamma_notes names gamma-notes, which this delete removes"
assert_line "index proj-a/MEMORY.md:5 names gamma-notes.md"
assert_out 'totals deleting=1 breaks=1 index_lines=1'

CASE="impact-writes-nothing"
[ "$(store_sum "$TMP/w2")" = "$BEFORE" ] || fail "impact changed the store"

CASE="impact-of-a-delete-that-breaks-nothing"
run impact --root "$TMP/w2" --delete proj-b/delta
assert_rc 0
assert_out 'totals deleting=1 breaks=0 index_lines=1'

CASE="impact-counts-a-link-between-two-doomed-entries-as-no-break"
run impact --root "$TMP/w2" --delete proj-a/alpha --delete proj-a/beta
assert_rc 0
assert_out 'totals deleting=2 breaks=0 index_lines=2'

CASE="impact-refuses-an-ambiguous-stem"
run impact --root "$TMP/w2" --delete alpha
assert_rc 2
assert_out 'NOT RESOLVED: --delete alpha names 2 entries \(proj-a/alpha, proj-b/alpha\)'

CASE="impact-refuses-a-stem-that-names-nothing"
run impact --root "$TMP/w2" --delete nosuchentry
assert_rc 2
assert_out 'NOT RESOLVED: --delete nosuchentry names 0 entries \(nothing\)'

CASE="impact-takes-a-project-qualified-stem"
run impact --root "$TMP/w2" --delete proj-b/alpha
assert_rc 0
assert_line "delete proj-b/alpha in=1"

# --- archive --------------------------------------------------------------------
CASE="archive-refuses-a-delete-that-would-dangle-a-surviving-link"
clone w3
BEFORE=$(store_sum "$TMP/w3")
run archive --root "$TMP/w3" --delete proj-a/gamma-notes --to "$TMP/arc-refused"
assert_rc 1
assert_out 'REFUSING: 1 link\(s\) in surviving entries would dangle'
[ "$(store_sum "$TMP/w3")" = "$BEFORE" ] || fail "a refused archive changed the store"
assert_gone "$TMP/arc-refused/proj-a/gamma-notes.md"

CASE="archive-moves-the-entries-and-prunes-the-index"
ARC="$TMP/arc"
run archive --root "$TMP/w3" --delete proj-a/alpha --delete proj-a/beta --to "$ARC"
assert_rc 0
assert_line "archived proj-a/beta -> $ARC/proj-a/beta.md"
assert_line "archived proj-a/alpha -> $ARC/proj-a/alpha.md"
assert_line "index proj-a/MEMORY.md: removed 2 line(s)"
assert_file "$ARC/proj-a/beta.md"
assert_gone "$TMP/w3/projects/proj-a/memory/beta.md"
assert_file "$TMP/w3/projects/proj-a/memory/gamma-notes.md"
! grep -q 'beta.md' "$TMP/w3/projects/proj-a/memory/MEMORY.md" || fail "the index still names beta.md"
grep -q 'gamma-notes.md' "$TMP/w3/projects/proj-a/memory/MEMORY.md" || fail "the index lost a surviving entry"

CASE="archive-saves-the-index-as-it-was"
assert_line "saved $ARC/proj-a/MEMORY.md (the index as it was)"
grep -q 'beta.md' "$ARC/proj-a/MEMORY.md" || fail "the saved index lost the archived entry"

CASE="archive-leaves-the-other-projects-alone"
assert_gone "$ARC/proj-b"
assert_file "$TMP/w3/projects/proj-b/memory/delta.md"

CASE="archive-prints-a-rollback-that-restores-the-store"
ROLLBACK=$(echo "$OUT" | grep '^rollback: ' | sed 's/^rollback: //')
[ -n "$ROLLBACK" ] || fail "no rollback command printed"
sh -c "$ROLLBACK"
assert_file "$TMP/w3/projects/proj-a/memory/beta.md"
grep -q 'beta.md' "$TMP/w3/projects/proj-a/memory/MEMORY.md" || fail "the rollback did not restore the index"

CASE="archive-refuses-a-destination-that-already-holds-the-entry"
clone w4
run archive --root "$TMP/w4" --delete proj-b/delta --to "$TMP/arc2"
assert_rc 0
clone w4
BEFORE=$(store_sum "$TMP/w4")
run archive --root "$TMP/w4" --delete proj-b/delta --to "$TMP/arc2"
assert_rc 1
assert_out "REFUSING: $TMP/arc2/proj-b/delta.md already exists"
[ "$(store_sum "$TMP/w4")" = "$BEFORE" ] || fail "a refused archive changed the store"

CASE="archive-moves-nothing-when-one-destination-collides"
clone w5
BEFORE=$(store_sum "$TMP/w5")
run archive --root "$TMP/w5" --delete proj-c/broken --delete proj-b/delta --to "$TMP/arc2"
assert_rc 1
[ "$(store_sum "$TMP/w5")" = "$BEFORE" ] || fail "a collision left the store half-archived"
assert_gone "$TMP/arc2/proj-c/broken.md"

# --- failure paths: the command line --------------------------------------------
CASE="no-mode"
run
assert_rc 2
assert_out 'usage: memory-inventory.sh'

CASE="unknown-mode"
run inventory --root "$TMP/w1"
assert_rc 2
assert_out 'usage: memory-inventory.sh'

CASE="unknown-argument"
run list --root "$TMP/w1" --verbose
assert_rc 2
assert_out 'unknown argument: --verbose'

CASE="root-without-a-value"
run list --root
assert_rc 2
assert_out 'root requires a value'

CASE="delete-without-a-value"
run impact --root "$TMP/w1" --delete
assert_rc 2
assert_out 'delete requires a value'

CASE="impact-without-a-delete"
run impact --root "$TMP/w1"
assert_rc 2
assert_out 'impact requires at least one --delete NAME'

CASE="archive-without-a-destination"
run archive --root "$TMP/w1" --delete proj-b/delta
assert_rc 2
assert_out 'archive requires --to DIR'

CASE="root-with-no-projects-directory"
run list --root "$TMP/nowhere"
assert_rc 2
assert_out 'NOT FOUND: .*/projects'
assert_out 'UNREAD, not empty'

CASE="project-that-does-not-exist"
run list --root "$TMP/w1" --project proj-z
assert_rc 2
assert_out 'NOT FOUND: project proj-z'

CASE="a-projects-directory-holding-no-memory-directories"
mkdir -p "$TMP/bare/projects/lonely"
run list --root "$TMP/bare"
assert_rc 2
assert_out 'NOT FOUND: no memory directories'

if [ "$FAILS" -ne 0 ]; then
  echo "  $FAILS assertion(s) failed"
  exit 1
fi
echo "test-memory-inventory: all assertions passed"
