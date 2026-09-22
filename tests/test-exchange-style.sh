#!/usr/bin/env bash
# Tests for katharsis-exchange-style.sh: a valid type prints its whole file and
# stamps the state, a second type appends only the three sliced sections, and
# every bad-input path exits 2 with the valid set on stderr.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
SCRIPT="$ROOT/scripts/katharsis-exchange-style.sh"
PASS=0; FAIL=0

ok()   { PASS=$((PASS+1)); }
bad()  { echo "FAIL $1"; FAIL=$((FAIL+1)); }

T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/styles"

cat > "$T/styles/work-request.md" <<'EOF'
# Work request
Intro line.
## Cues
cue text
## Ceiling
400 words
## Shape
shape text
## Ambiguities
ambiguity text
## Verification
verification text
## Examples
example text
EOF
cat > "$T/styles/diagnosis.md" <<'EOF'
# Diagnosis
## Cues
diag cues
## Shape
diag shape
## Verification
diag verification
EOF
cp "$T/styles/work-request.md" "$T/styles/default.md"
: > "$T/styles/README.md"
: > "$T/styles/katharsis-style-template.md"

run() { KATHARSIS_DIR="$T" KATHARSIS_DATA="$T" "$SCRIPT" "$@" 2>"$T/err"; }

# Primary alone prints the whole file.
out="$(run work-request)"; rc=$?
[ "$rc" -eq 0 ] || bad "primary rc=$rc"
case "$out" in *"cue text"*) ok;; *) bad "primary missing Cues";; esac
case "$out" in *"example text"*) ok;; *) bad "primary missing Examples";; esac
case "$out" in *"PRIMARY: work-request"*) ok;; *) bad "primary missing banner";; esac

# The state line records the type.
if grep -qs "work-request" "$T"/.exchange-state*; then ok; else bad "state not stamped"; fi

# Default: the secondary is stamped but not printed.
out="$(run work-request diagnosis)"; rc=$?
[ "$rc" -eq 0 ] || bad "two-type rc=$rc"
case "$out" in *"=== SECONDARY"*) bad "secondary printed by default";; *) ok;; esac
case "$out" in *"diag shape"*) bad "secondary Shape leaked by default";; *) ok;; esac
if grep -qs "work-request	diagnosis" "$T"/.exchange-state*; then ok; else bad "secondary not stamped"; fi

# KATHARSIS_SECONDARY_MODE=full restores Shape, Ambiguities, Verification.
out="$(KATHARSIS_SECONDARY_MODE=full run work-request diagnosis)"; rc=$?
[ "$rc" -eq 0 ] || bad "full rc=$rc"
case "$out" in *"diag shape"*) ok;; *) bad "full missing Shape";; esac
case "$out" in *"diag verification"*) ok;; *) bad "full missing Verification";; esac
case "$out" in *"diag cues"*) bad "full leaked Cues";; *) ok;; esac
case "$out" in *"no Ambiguities section in diagnosis"*) ok;; *) bad "absent section unreported";; esac

# Slicing stops at the next header: Shape must not carry Ambiguities text.
shape_only="$(KATHARSIS_SECONDARY_MODE=full run diagnosis work-request | sed -n '/^=== SECONDARY/,$p')"
case "$shape_only" in *"shape text"*"ambiguity text"*) ok;; *) bad "secondary slices missing";; esac
case "$shape_only" in *"400 words"*) bad "secondary leaked Ceiling";; *) ok;; esac

# =shape prints Shape alone.
shape_mode="$(KATHARSIS_SECONDARY_MODE=shape run work-request diagnosis | sed -n '/^=== SECONDARY/,$p')"
case "$shape_mode" in *"diag shape"*) ok;; *) bad "shape mode missing Shape";; esac
case "$shape_mode" in *"diag verification"*) bad "shape mode leaked Verification";; *) ok;; esac

# Bad input exits 2 and lists the valid types.
for args in "" "nonsense" "work-request nonsense" "work-request work-request" "a b c"; do
  # shellcheck disable=SC2086
  run $args >/dev/null; rc=$?
  if [ "$rc" -eq 2 ]; then ok; else bad "bad input '$args' rc=$rc want=2"; fi
  if grep -q "Valid types" "$T/err"; then ok; else bad "bad input '$args' no type list"; fi
done

# The type list excludes the contract and the skeleton.
run nonsense >/dev/null
if grep -qx "  README" "$T/err" || grep -qx "  katharsis-style-template" "$T/err"; then
  bad "type list includes a non-type"
else ok; fi
if grep -qx "  default" "$T/err"; then ok; else bad "type list missing default"; fi

# A missing styles directory fails rather than printing nothing.
KATHARSIS_DIR="$T/absent" KATHARSIS_DATA="$T" "$SCRIPT" work-request >/dev/null 2>&1
[ $? -eq 2 ] && ok || bad "absent styles dir did not exit 2"

# Stamps land in the data directory, and the script creates it.
rm -rf "$T/data"
KATHARSIS_DIR="$T" KATHARSIS_DATA="$T/data" CLAUDE_CODE_SESSION_ID=s1 "$SCRIPT" work-request >/dev/null 2>&1
if grep -qs "work-request" "$T/data/.exchange-state-s1"; then ok; else bad "stamp not in KATHARSIS_DATA"; fi
if grep -qs "work-request" "$T/data/.exchange-last-s1"; then ok; else bad "last-type copy not in KATHARSIS_DATA"; fi

# With no KATHARSIS_DIR and no ~/.claude/katharsis link, the script finds the
# styles beside its own directory, so a missing link degrades to a working install.
mkdir -p "$T/home"
out="$(HOME="$T/home" KATHARSIS_DATA="$T/data" "$SCRIPT" default 2>&1)"; rc=$?
[ "$rc" -eq 0 ] && ok || bad "fallback to the script's own root rc=$rc: $out"
case "$out" in *"PRIMARY: default"*) ok;; *) bad "fallback did not print the repo's default.md";; esac

# The two shipped styles are one body under different frontmatter, so the body
# is edited once and the keep-coding-instructions variant cannot drift.
body() { awk 'f>=2{print} /^---$/{f++}' "$1"; }
if diff -q <(body "$ROOT/output-styles/katharsis.md") <(body "$ROOT/output-styles/katharsis-coding.md") >/dev/null; then
  ok; else bad "output-styles/katharsis.md and katharsis-coding.md differ below the frontmatter"; fi
if grep -q '^keep-coding-instructions: true$' "$ROOT/output-styles/katharsis-coding.md"; then ok; else bad "coding variant lacks keep-coding-instructions: true"; fi
if grep -q '^keep-coding-instructions' "$ROOT/output-styles/katharsis.md"; then bad "plain style sets keep-coding-instructions"; else ok; fi
if grep -q '^name: Katharsis$' "$ROOT/output-styles/katharsis.md" && grep -q '^name: Katharsis coding$' "$ROOT/output-styles/katharsis-coding.md"; then
  ok; else bad "style names are not Katharsis and Katharsis coding"; fi

# Drift between the shipped routing table and the shipped styles directory. The
# table's Type column is the script's argument, so a row without a file routes
# nowhere and a file without a row is unreachable from classification.
OS="$ROOT/output-styles/katharsis.md"
LIVE="$ROOT/styles"
if [ -r "$OS" ] && [ -d "$LIVE" ]; then
  rows="$(sed -n 's/^| `\([a-z-]*\)` |.*/\1/p' "$OS" | sort -u)"
  files="$(find "$LIVE" -maxdepth 1 -name '*.md' | sed 's#.*/##; s#\.md$##' |
           grep -vx -e README -e katharsis-style-template | sort -u)"
  if [ -n "$rows" ]; then ok; else bad "no Type values parsed from the routing table"; fi
  missing_file="$(comm -23 <(printf '%s\n' "$rows") <(printf '%s\n' "$files"))"
  if [ -z "$missing_file" ]; then ok; else bad "table rows with no style file: $missing_file"; fi
  missing_row="$(comm -13 <(printf '%s\n' "$rows") <(printf '%s\n' "$files"))"
  if [ -z "$missing_row" ]; then ok; else bad "style files with no table row: $missing_row"; fi
  # Every shipped type resolves through the real script against the shipped
  # files, with stamps sent to the sandbox so the run cannot touch a live one.
  drift=""
  for t in $files; do
    KATHARSIS_DIR="$ROOT" KATHARSIS_DATA="$T" "$SCRIPT" "$t" >/dev/null 2>&1 ||
      drift="$drift $t"
  done
  if [ -z "$drift" ]; then ok; else bad "types that failed to resolve:$drift"; fi
else
  bad "routing table or styles directory not readable"
fi

echo
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
