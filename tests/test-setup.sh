#!/usr/bin/env bash
# Tests for setup.sh against a sandbox settings file: the permission entries,
# one for the routing script and one for the diagram script, are added once
# and preserved on a second run, an install that holds only the first gains the
# second, other settings survive the write,
# --dry-run writes nothing, a settings file that is not JSON is left alone with
# the entry printed for a hand edit, the .setup-done marker lands only on a
# real run, a Claude Code too old to load mods fails setup with the
# permission still granted, and the report of the diagram and video tools,
# with each tool present and absent and the install command each platform
# gets, runs no installer and is skipped on an exit 3 or 4.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
SETUP="$DIR/../scripts/setup.sh"
PASS=0; FAIL=0
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
ENTRY='Bash(~/.claude/katharsis/scripts/katharsis-exchange-style.sh:*)'
ARTIFACT='Bash(~/.claude/katharsis/scripts/katharsis-artifact.sh:*)'

mkdir -p "$T/bin"
printf '#!/bin/sh\necho "2.1.289 (Claude Code)"\n' > "$T/bin/claude-new"
printf '#!/bin/sh\necho "2.1.99 (Claude Code)"\n' > "$T/bin/claude-old"
printf '#!/bin/sh\nexit 127\n' > "$T/bin/claude-broken"
chmod +x "$T/bin/"*
CLAUDE_BIN="$T/bin/claude-new"
run() { OUT="$(CLAUDE_DIR="$1" KATHARSIS_DATA="$T/data" KATHARSIS_CLAUDE="$CLAUDE_BIN" "$SETUP" "${@:2}" 2>&1)"; RC=$?; }
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else
    echo "FAIL $1: got [$2] want [$3]"; FAIL=$((FAIL+1)); fi }
contains() { case "$OUT" in *"$2"*) PASS=$((PASS+1));; *)
    echo "FAIL $1: [$OUT] lacks [$2]"; FAIL=$((FAIL+1));; esac }
# allow_count <settings> [entry]: how many times the entry, by default the
# routing script's, appears in permissions.allow.
allow_count() { python3 -c 'import json,sys; s=json.load(open(sys.argv[1])); print(s.get("permissions",{}).get("allow",[]).count(sys.argv[2]))' "$1" "${2:-$ENTRY}"; }

# 1. no settings file: one is created holding the entry, and setup completes
mkdir -p "$T/fresh"
run "$T/fresh"
check "fresh rc" "$RC" "0"
check "fresh entry added" "$(allow_count "$T/fresh/settings.json")" "1"
check "fresh artifact entry added" "$(allow_count "$T/fresh/settings.json" "$ARTIFACT")" "1"
contains "fresh says added" "Permission: added"
contains "fresh names both styles" "katharsis:Katharsis coding"
contains "fresh names /config" "/config"
contains "fresh reports the version" "Claude Code: 2.1.289, which meets"
if [ -e "$T/data/.setup-done" ]; then PASS=$((PASS+1)); else echo "FAIL .setup-done missing"; FAIL=$((FAIL+1)); fi

# 2. a second run adds nothing and says so
run "$T/fresh"
check "rerun rc" "$RC" "0"
check "rerun still one entry" "$(allow_count "$T/fresh/settings.json")" "1"
check "rerun still one artifact entry" "$(allow_count "$T/fresh/settings.json" "$ARTIFACT")" "1"
contains "rerun says already" "already in"
case "$OUT" in *"Permission: added"*) echo "FAIL rerun added an entry"; FAIL=$((FAIL+1));; *) PASS=$((PASS+1));; esac

# 2b. an install that holds only the routing entry gains the artifact entry
# after it, and says which was already there
mkdir -p "$T/partial"
printf '{"permissions": {"allow": ["%s"]}}' "$ENTRY" > "$T/partial/settings.json"
run "$T/partial"
check "partial rc" "$RC" "0"
contains "partial says the routing entry was there" "Permission: $ENTRY is already in"
contains "partial says the artifact entry was added" "Permission: added $ARTIFACT"
check "partial order" "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["permissions"]["allow"])' "$T/partial/settings.json")" "['$ENTRY', '$ARTIFACT']"

# 3. existing settings survive: other keys, other allow entries, and the deny list
mkdir -p "$T/full"
cat > "$T/full/settings.json" <<'EOF'
{"outputStyle": "Concise", "permissions": {"allow": ["Bash(git status:*)"], "deny": ["WebFetch"]}, "hooks": {"Stop": []}}
EOF
run "$T/full"
check "full rc" "$RC" "0"
check "full entry added" "$(allow_count "$T/full/settings.json")" "1"
check "full artifact entry added" "$(allow_count "$T/full/settings.json" "$ARTIFACT")" "1"
python3 - "$T/full/settings.json" <<'PY' && PASS=$((PASS+1)) || { echo "FAIL full: other settings lost"; FAIL=$((FAIL+1)); }
import json, sys
s = json.load(open(sys.argv[1]))
assert s["outputStyle"] == "Concise"
assert s["permissions"]["allow"][0] == "Bash(git status:*)"
assert s["permissions"]["deny"] == ["WebFetch"]
assert s["hooks"] == {"Stop": []}
PY

# 4. --dry-run prints the change and writes nothing, marker included
rm -rf "$T/data"
mkdir -p "$T/dry"; echo '{"permissions": {"allow": []}}' > "$T/dry/settings.json"
run "$T/dry" --dry-run
check "dry rc" "$RC" "0"
contains "dry names the entry" "$ENTRY"
contains "dry names the artifact entry" "$ARTIFACT"
contains "dry says dry run" "dry run"
check "dry wrote nothing" "$(allow_count "$T/dry/settings.json")" "0"
check "dry wrote no artifact entry" "$(allow_count "$T/dry/settings.json" "$ARTIFACT")" "0"
if [ -e "$T/data/.setup-done" ]; then echo "FAIL dry run wrote .setup-done"; FAIL=$((FAIL+1)); else PASS=$((PASS+1)); fi

# 5. a settings file that is not JSON is left alone, with the entry printed
mkdir -p "$T/broken"; printf '{ not json' > "$T/broken/settings.json"
run "$T/broken"
check "broken rc" "$RC" "3"
contains "broken says not valid" "not valid JSON"
contains "broken prints the entry" "$ENTRY"
contains "broken prints the artifact entry" "$ARTIFACT"
check "broken untouched" "$(cat "$T/broken/settings.json")" "{ not json"
if [ -e "$T/data/.setup-done" ]; then echo "FAIL broken run wrote .setup-done"; FAIL=$((FAIL+1)); else PASS=$((PASS+1)); fi

# 5b. a 0600 settings file keeps its mode across the rewrite
mkdir -p "$T/mode"; printf '{}' > "$T/mode/settings.json"; chmod 600 "$T/mode/settings.json"
run "$T/mode"
check "mode rc" "$RC" "0"
check "mode kept" "$(python3 -c 'import os,sys; print(oct(os.stat(sys.argv[1]).st_mode & 0o777)[2:])' "$T/mode/settings.json")" "600"

# 5c. a data path that cannot be written fails setup instead of reporting it done
mkdir -p "$T/nodata"; : > "$T/nodata/blocker"
OUT="$(CLAUDE_DIR="$T/fresh" KATHARSIS_DATA="$T/nodata/blocker" KATHARSIS_CLAUDE="$CLAUDE_BIN" "$SETUP" 2>&1)"; RC=$?
check "unwritable data rc" "$RC" "1"
contains "unwritable data says not done" "setup is not done"
case "$OUT" in *"Setup done."*) echo "FAIL unwritable data claimed Setup done"; FAIL=$((FAIL+1));; *) PASS=$((PASS+1));; esac

# 5d. a Claude Code older than 2.1.287 grants the permission but leaves setup undone
rm -rf "$T/data"; mkdir -p "$T/old"
CLAUDE_BIN="$T/bin/claude-old" run "$T/old"
check "old rc" "$RC" "4"
contains "old names the version" "2.1.99 is older than 2.1.287"
contains "old says not done" "setup is not done"
check "old entry still added" "$(allow_count "$T/old/settings.json")" "1"
check "old artifact entry still added" "$(allow_count "$T/old/settings.json" "$ARTIFACT")" "1"
if [ -e "$T/data/.setup-done" ]; then echo "FAIL old version wrote .setup-done"; FAIL=$((FAIL+1)); else PASS=$((PASS+1)); fi

# 5d2. versions compare field by field as numbers, not as text
for v in 2.1.287:0 2.1.1000:0 3.0.0:0 10.0.0:0 2.1.286:4 2.1.278:4 2.0.999:4 1.9.300:4; do
  printf '#!/bin/sh\necho "%s (Claude Code)"\n' "${v%:*}" > "$T/bin/claude-v"; chmod +x "$T/bin/claude-v"
  rm -rf "$T/v"; mkdir -p "$T/v"
  CLAUDE_BIN="$T/bin/claude-v" run "$T/v"
  check "version ${v%:*} rc" "$RC" "${v#*:}"
done
rm -rf "$T/data"

# 5e. the early-access variable is no longer checked: unset, setup completes
mkdir -p "$T/nohooks"
OUT="$(env -u CLAUDE_CODE_ENABLE_FUNCTION_HOOKS CLAUDE_DIR="$T/nohooks" KATHARSIS_DATA="$T/data" KATHARSIS_CLAUDE="$CLAUDE_BIN" "$SETUP" 2>&1)"; RC=$?
check "nohooks rc" "$RC" "0"
case "$OUT" in *FUNCTION_HOOKS*) echo "FAIL nohooks names the unchecked variable"; FAIL=$((FAIL+1));; *) PASS=$((PASS+1));; esac
rm -rf "$T/data"

# 5f. a claude that will not run leaves the version unchecked, not failed
mkdir -p "$T/noclaude"
CLAUDE_BIN="$T/bin/claude-broken" run "$T/noclaude"
check "noclaude rc" "$RC" "0"
contains "noclaude says unchecked" "the version is unchecked"
if [ -e "$T/data/.setup-done" ]; then PASS=$((PASS+1)); else echo "FAIL noclaude missing .setup-done"; FAIL=$((FAIL+1)); fi

# 6. an unknown argument is rejected
run "$T/fresh" --nonsense
check "unknown arg rc" "$RC" "2"

# 7. the tools report, on a PATH this suite builds so no tool on this machine
# answers for a fake one: every tool found, every tool missing with each
# installer its commands need present and absent, Remotion counted only as
# the Katharsis Remotion project with its ready marker and reported as not
# needed when vhs or ffmpeg is found, no report on an exit 3 or 4, and no
# tool or installer ever run
mkdir -p "$T/sys" "$T/log"
for tool in bash python3 grep head mkdir cat; do
  p="$(command -v "$tool")" || { echo "NOT FOUND: $tool" >&2; exit 2; }
  ln -s "$p" "$T/sys/$tool"
done
# fake <dir> <name>: an executable stub that logs that it ran.
fake() { mkdir -p "$T/$1"; printf '#!/bin/sh\necho "%s $*" >> "%s/log/ran"\n' "$2" "$T" > "$T/$1/$2"; chmod +x "$T/$1/$2"; }
for tool in d2 mmdc vhs ffmpeg; do fake all "$tool"; done
for tool in brew go npm apt-get curl ffmpeg d2 remotion; do fake "$tool" "$tool"; done
# project [mode]: the Katharsis Remotion project in $T/data, its binary with
# that mode, 755 by default, and the marker setup's command writes last.
project() {
  fake data/remotion/node_modules/.bin remotion; chmod "${1:-755}" "$T/data/remotion/node_modules/.bin/remotion"
  : > "$T/data/remotion/.katharsis-ready"
}
# tools <dirs...>: runs setup with only the sys tools and those fake dirs on
# PATH, and HOME set to $THOME when that is set, and sets REPORT to the lines
# from the tools heading on.
tools() {
  local p="$T/sys" d
  for d in "$@"; do p="$T/$d:$p"; done
  rm -rf "$T/tools"; mkdir -p "$T/tools"
  OUT="$(HOME="${THOME:-$HOME}" PATH="$p" CLAUDE_DIR="$T/tools" KATHARSIS_DATA="$T/data" KATHARSIS_CLAUDE="$CLAUDE_BIN" "$SETUP" 2>&1)"; RC=$?
  REPORT="$(printf '%s\n' "$OUT" | sed -n '/^Tools for the rich/,$p')"
}
SENTENCE='Without a video tool, rich uses Claude Motion when offered and on, else a rendered diagram, else an inline sketch.'
HEAD='Tools for the rich richness level, which looks for them again each time it needs one:'
D2_SH='`curl -fsSL https://d2lang.com/install.sh | sh -s --`'
NO_CURL='its installer needs Homebrew or curl, and neither is on PATH'
NO_NPM='its installer needs npm, which is not on PATH'
NO_FFMPEG='its installer needs Homebrew or apt-get, and neither is on PATH; another package manager or https://ffmpeg.org/download.html has it'
LICENSE='Remotion needs a paid company license for an organization above its small-team threshold, see https://www.remotion.dev/license'
remotion_sh() { printf '`(mkdir -p %s && cd %s && { [ -f package.json ] || echo '"'"'{"private": true}'"'"' > package.json; } && npm install remotion @remotion/cli react react-dom && npx remotion browser ensure && touch .katharsis-ready)`; %s' "$1" "$1" "$LICENSE"; }
REMOTION_SH="$(remotion_sh "$T/data/remotion")"
GO_SH="\`go install github.com/charmbracelet/vhs@latest\`; vhs also needs ttyd, ffmpeg, and Go's bin directory on PATH"

rm -rf "$T/data"; project
tools all
check "all found rc" "$RC" "0"
check "all found" "$REPORT" "$HEAD
  d2        diagram renderer  found
  mmdc      diagram renderer  found
  vhs       video tool        found
  ffmpeg    video tool        found
  remotion  video tool        found
$SENTENCE"
contains "a finished setup says Setup done" "Setup done."
check "report is last" "$(printf '%s\n' "$OUT" | tail -n 1)" "$SENTENCE"

rm -rf "$T/data"
tools
check "none found rc" "$RC" "0"
check "none found, no toolchain" "$REPORT" "$HEAD
  d2        diagram renderer  missing; $NO_CURL
  mmdc      diagram renderer  missing; $NO_NPM
  vhs       video tool        missing; its installer needs Homebrew or Go, and neither is on PATH
  ffmpeg    video tool        missing; $NO_FFMPEG
  remotion  video tool        missing; $NO_NPM
$SENTENCE"
tools brew
check "none found, brew alone" "$REPORT" "$HEAD
  d2        diagram renderer  missing; install with \`brew install d2\`
  mmdc      diagram renderer  missing; $NO_NPM
  vhs       video tool        missing; install with \`brew install vhs\`
  ffmpeg    video tool        missing; install with \`brew install ffmpeg\`
  remotion  video tool        missing; $NO_NPM
$SENTENCE"
tools npm
check "none found, npm alone" "$REPORT" "$HEAD
  d2        diagram renderer  missing; $NO_CURL
  mmdc      diagram renderer  missing; install with \`npm install -g @mermaid-js/mermaid-cli\`
  vhs       video tool        missing; its installer needs Homebrew or Go, and neither is on PATH
  ffmpeg    video tool        missing; $NO_FFMPEG
  remotion  video tool        missing; install with $REMOTION_SH
$SENTENCE"
tools curl
contains "curl gives d2's installer" "  d2        diagram renderer  missing; install with $D2_SH"
tools curl brew
contains "brew wins over curl" "  d2        diagram renderer  missing; install with \`brew install d2\`"
tools go
contains "go gives vhs's go command, its note after it" "  vhs       video tool        missing; install with $GO_SH"
contains "go alone leaves npm missing" "  remotion  video tool        missing; $NO_NPM"
tools go brew
contains "brew wins over go" "  vhs       video tool        missing; install with \`brew install vhs\`"
tools apt-get
contains "apt-get gives ffmpeg's package, updated first and unattended" "  ffmpeg    video tool        missing; install with \`sudo apt-get update && sudo apt-get install -y ffmpeg\`"
contains "apt-get without curl names d2's missing installers" "  d2        diagram renderer  missing; $NO_CURL"
tools apt-get brew
contains "brew wins over apt-get" "  ffmpeg    video tool        missing; install with \`brew install ffmpeg\`"
THOME="$T" tools npm
contains "a project under HOME is shown with ~" "  remotion  video tool        missing; install with $(remotion_sh \~/data/remotion)"

# Remotion: a global remotion command is not the project, nor is a project
# without its binary, with one that cannot run, or without the ready marker
tools remotion npm
contains "global remotion alone is missing" "  remotion  video tool        missing; install with $REMOTION_SH"
mkdir -p "$T/data/remotion/node_modules"
tools npm
contains "project without its binary is missing" "  remotion  video tool        missing; install with $REMOTION_SH"
project 644
tools npm
contains "project binary not executable is missing" "  remotion  video tool        missing; install with $REMOTION_SH"
project
rm "$T/data/remotion/.katharsis-ready"
tools npm
contains "project without its ready marker is missing" "  remotion  video tool        missing; install with $REMOTION_SH"
project
tools d2 ffmpeg
check "one of each found" "$REPORT" "$HEAD
  d2        diagram renderer  found
  mmdc      diagram renderer  missing; $NO_NPM
  vhs       video tool        missing; its installer needs Homebrew or Go, and neither is on PATH
  ffmpeg    video tool        found
  remotion  video tool        found
$SENTENCE"

# Remotion is not needed, and offered no command, when vhs or ffmpeg is found
rm -rf "$T/data"
tools ffmpeg npm
contains "ffmpeg found makes Remotion not needed" "  remotion  video tool        not needed; ffmpeg is found, and rich uses it first
"
tools all npm
contains "vhs found makes Remotion not needed" "  remotion  video tool        not needed; vhs is found, and rich uses it first
"

# no report on an exit 3, a settings file setup cannot edit, or an exit 4, a
# Claude Code too old
rm -rf "$T/broken-tools"; mkdir -p "$T/broken-tools"; printf '{ not json' > "$T/broken-tools/settings.json"
OUT="$(PATH="$T/all:$T/sys" CLAUDE_DIR="$T/broken-tools" KATHARSIS_DATA="$T/data" KATHARSIS_CLAUDE="$CLAUDE_BIN" "$SETUP" 2>&1)"; RC=$?
check "bad settings rc" "$RC" "3"
check "bad settings skips the report" "$(printf '%s\n' "$OUT" | sed -n '/^Tools for the rich/,$p')" ""
CLAUDE_BIN="$T/bin/claude-old" tools all
check "too old a Claude Code skips the report" "$REPORT" ""
check "no tool or installer ran" "$(cat "$T/log/ran" 2>/dev/null)" ""
rm -rf "$T/data"

echo
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
