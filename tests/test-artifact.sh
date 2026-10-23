#!/usr/bin/env bash
# Tests for katharsis-artifact.sh against fake renderers and openers on a
# PATH this suite builds, so no real d2, mmdc, or browser runs: detection with
# and without each renderer and D2's TALA layout, rendering with each, the
# page, source, drawing, and stylesheet locations under a temp HOME's data
# directory, the stylesheet refresh on every page, the fallback lines when no
# renderer exists or a render fails, the name reserved against a concurrent
# render, the opener chosen per platform and run detached, the usage exit,
# the renderer's TMPDIR under the data directory, owner-only modes under a
# umask that would leave them readable, the figure's width for a wide drawing,
# names held by symlinks, a title with a newline, a renderer that writes no
# single SVG or runs past its time limit, the opener's own session, `open`
# refusing anything but a page, and that nothing is written outside the data
# directory.

set -u
# A umask that leaves new files readable by others, so the owner-only checks
# test the script's own umask rather than this shell's.
umask 022
DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$DIR/../scripts/katharsis-artifact.sh"
ASSETS="$DIR/../assets/pages"
PASS=0; FAIL=0
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
H="$T/home"; PAGES="$H/.claude/katharsis-data/pages"
mkdir -p "$H" "$T/work" "$T/tmp" "$T/log"

check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else
    echo "FAIL $1: got [$2] want [$3]"; FAIL=$((FAIL+1)); fi }
contains() { case "$2" in *"$3"*) PASS=$((PASS+1));; *)
    echo "FAIL $1: [$2] lacks [$3]"; FAIL=$((FAIL+1));; esac }
lacks() { case "$2" in *"$3"*) echo "FAIL $1: [$2] holds [$3]"; FAIL=$((FAIL+1));; *)
    PASS=$((PASS+1));; esac }
exists() { if [ -e "$2" ]; then PASS=$((PASS+1)); else echo "FAIL $1: $2 missing"; FAIL=$((FAIL+1)); fi }
absent() { if [ -e "$2" ]; then echo "FAIL $1: $2 exists"; FAIL=$((FAIL+1)); else PASS=$((PASS+1)); fi }

# The system tools the script uses, alone on PATH, so a real d2, mmdc, or
# opener on this machine never answers for a fake one.
mkdir -p "$T/sys"
for tool in bash dirname grep sed tr cut tail head cat rm mkdir cp mv mktemp chmod nohup sleep; do
  p="$(command -v "$tool")" || { echo "NOT FOUND: $tool" >&2; exit 2; }
  ln -s "$p" "$T/sys/$tool"
done
# sysmac is sys without timeout, as on stock macOS.
cp -P -R "$T/sys" "$T/sysmac"
if p="$(command -v timeout)"; then ln -s "$p" "$T/sys/timeout"; fi

# fake <dir> <name> <body>: an executable stub that logs its arguments.
fake() {
  mkdir -p "$T/$1"
  { echo '#!/bin/sh'; echo "printf '%s\\n' \"\$*\" >> \"$T/log/$2\""; printf '%s\n' "$3"; } > "$T/$1/$2"
  chmod +x "$T/$1/$2"
}
# D2 nests the drawing in an inner svg, as real D2 output does.
printf '%s\n' '<?xml version="1.0" encoding="utf-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><svg class="d2-svg" width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10"/></svg></svg>' > "$T/d2.svg"
# Mermaid sizes its drawing by an inline max-width and a viewBox, as mmdc does.
printf '%s\n' '<svg id="my-svg" width="100%" xmlns="http://www.w3.org/2000/svg" style="max-width: 1234.5px;" viewBox="-8 -8 1234.5 567"><g/></svg>' > "$T/mmdc.svg"
printf '%s\n' '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>' > "$T/nobox.svg"
# FAKE_SLEEP stalls it, FAKE_DIR writes a folder of boards at the output path,
# as D2 does for layers, and FAKE_SVG names the drawing it writes.
D2_RENDER='printf "%s\n" "$TMPDIR" >> "'"$T"'/log/d2-tmpdir"
[ -n "${FAKE_FAIL-}" ] && { echo "err: in.d2:1:1: unexpected token" >&2; exit 1; }
for a; do out="$a"; done
[ -n "${FAKE_SLEEP-}" ] && sleep "$FAKE_SLEEP"
if [ -n "${FAKE_DIR-}" ]; then mkdir -p "$out" && cat "'"$T"'/d2.svg" > "$out/index.svg"; exit 0; fi
cat "${FAKE_SVG:-'"$T"'/d2.svg}" > "$out"
echo "success: successfully compiled" >&2'
fake d2tala d2 'if [ "$1" = layout ]; then printf "Available layout engines:\n\ndagre (built-in) - Dagre\nelk (built-in) - ELK\ntala (built-in) - TALA\n"; exit 0; fi
'"$D2_RENDER"
fake d2plain d2 'if [ "$1" = layout ]; then printf "Available layout engines:\n\ndagre (built-in) - Dagre\nelk (built-in) - ELK\n"; exit 0; fi
'"$D2_RENDER"
fake mmdc mmdc 'printf "%s\n" "$TMPDIR" >> "'"$T"'/log/mmdc-tmpdir"
while [ $# -gt 0 ]; do [ "$1" = -o ] && out="$2"; shift; done
cat "'"$T"'/mmdc.svg" > "$out"'
fake uname uname 'case "$1" in -s) echo "$FAKE_OS";; -r) echo "$FAKE_REL";; esac'
fake xdg xdg-open 'exit 0'
# An xdg-open that, like its generic mode, waits on the browser: here until the
# suite creates $T/release, for at most five seconds.
fake xdgslow xdg-open 'i=0; while [ ! -e "'"$T"'/release" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
: > "'"$T"'/log/slow-done"'
fake mac open 'exit 0'
fake wslview wslview 'exit 0'
fake explorer explorer.exe 'exit 1'
fake explorer wslpath 'printf "%s\n" "\\\\wsl.localhost\\Ubuntu$2"'
fake setsid setsid 'exec "$@"'

path() { local p="${BASE:-$T/sys}" d; for d in "$@"; do p="$T/$d:$p"; done; printf '%s' "$p"; }
LINUX=(FAKE_OS=Linux FAKE_REL=6.8.0-45-generic)
WSL=(FAKE_OS=Linux FAKE_REL=5.15.153.1-microsoft-standard-WSL2)

# run <PATH> <stdin> <env assignments...> -- <args...>: sets OUT and RC.
run() {
  local p="$1" input="$2" envs=()
  shift 2
  while [ "$1" != -- ]; do envs+=("$1"); shift; done
  shift
  OUT="$(cd "$T/work" && printf '%s' "$input" | env -u KATHARSIS_DATA HOME="$H" TMPDIR="$T/tmp" \
    KLOG="$T/log" PATH="$p" "${envs[@]}" "$SCRIPT" "$@" 2>&1)"
  RC=$?
}
log() { cat "$T/log/$1" 2>/dev/null; }
# launched <name> <arg>: waits up to five seconds for the detached opener
# <name> to log <arg>, then checks that it did.
launched() {
  local i=0
  while ! grep -qxF "$2" "$T/log/$1" 2>/dev/null && [ $i -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
  check "$1 launched with $2" "$(grep -cxF "$2" "$T/log/$1" 2>/dev/null)" "1"
}

# 1. detection: none, mermaid alone, d2 without and with tala, d2 over mermaid
run "$(path uname)" '' "${LINUX[@]}" -- detect
check "detect none rc" "$RC" "0"
check "detect none" "$OUT" "renderer: none. Neither d2 nor mmdc is on PATH. Draw an inline sketch instead."
run "$(path uname mmdc)" '' "${LINUX[@]}" -- detect
check "detect mermaid" "$OUT" "renderer: mermaid. Write Mermaid source and run render mermaid."
run "$(path uname d2plain)" '' "${LINUX[@]}" -- detect
check "detect d2" "$OUT" "renderer: d2. Write D2 source and run render d2."
run "$(path uname d2tala)" '' "${LINUX[@]}" -- detect
check "detect d2 tala" "$OUT" "renderer: d2 (tala layout). Write D2 source and run render d2."
run "$(path uname mmdc d2tala)" '' "${LINUX[@]}" -- detect
check "detect d2 over mermaid" "$OUT" "renderer: d2 (tala layout). Write D2 source and run render d2."
check "detect d2 over mermaid rc" "$RC" "0"

# 2. render with d2 and tala: the page, its source and drawing, the stylesheet
# beside it, and the page opened
SRC='a -> b: calls'
run "$(path uname xdg d2tala)" "$SRC" "${LINUX[@]}" -- render d2 'Checkout & <flow>' 'The retry runs after the charge.'
check "render rc" "$RC" "0"
check "render out" "$OUT" "page: $PAGES/checkout-flow.html
opened with xdg-open"
check "render d2 args" "$(grep -v '^layout' "$T/log/d2")" "--layout=tala $PAGES/checkout-flow.d2 $PAGES/checkout-flow.svg"
launched xdg-open "$PAGES/checkout-flow.html"
check "source kept" "$(cat "$PAGES/checkout-flow.d2")" "$SRC"
exists "drawing kept" "$PAGES/checkout-flow.svg"
check "stylesheet copied" "$(cmp -s "$ASSETS/katharsis.css" "$PAGES/katharsis.css" && echo same)" "same"
check "script copied" "$(cmp -s "$ASSETS/katharsis.js" "$PAGES/katharsis.js" && echo same)" "same"
HTML="$(cat "$PAGES/checkout-flow.html")"
contains "page links the stylesheet by relative path" "$HTML" '<link rel="stylesheet" href="katharsis.css">'
contains "page loads the toggle by relative path" "$HTML" '<script src="katharsis.js"></script>'
contains "page escapes the title" "$HTML" '<title>Checkout &amp; &lt;flow&gt;</title>'
contains "page header" "$HTML" '<h1 class="k-title">Checkout &amp; &lt;flow&gt;</h1>'
contains "page toggle" "$HTML" '<button type="button" class="k-toggle" data-k-toggle>'
contains "page takeaway" "$HTML" '<p class="k-takeaway">The retry runs after the charge.</p>'
contains "page inlines the svg" "$HTML" '<figure class="k-figure" style="--k-svg-width: 10px">
<svg xmlns="http://www.w3.org/2000/svg"'
contains "page keeps d2's inner svg" "$HTML" '<svg class="d2-svg"'
# The dark-mode filter must reach only the figure's own svg: on a descendant
# selector it also hits D2's inner svg, and the second inversion undoes the first.
check "figure filter only on the outer svg" "$(grep -E 'filter: *var\(--k-figure-filter\)' "$PAGES/katharsis.css" | sed 's/ *{.*//')" ".k-figure > svg"
check "renderer TMPDIR under the data directory" "$(log d2-tmpdir)" "$PAGES/.tmp"
exists "renderer TMPDIR created" "$PAGES/.tmp"
lacks "page drops the xml declaration" "$HTML" '<?xml'
# A drawing wider than the figure keeps its viewBox width and the figure
# scrolls; one narrower fills the figure as before.
check "figure svg sized by the drawing's width" "$(grep -E '^\.k-figure > svg' "$PAGES/katharsis.css")" \
  ".k-figure > svg { width: max(100%, var(--k-svg-width, 100%)); max-width: none; height: auto; filter: var(--k-figure-filter); }"
contains "figure scrolls sideways" "$(sed -n '/^\.k-figure {/,/}/p' "$PAGES/katharsis.css")" 'overflow-x: auto;'
contains "page footer" "$HTML" 'Rendered by Katharsis with D2 with the TALA layout from <a href="checkout-flow.d2">'
contains "page credits flexoki" "$HTML" 'href="https://stephango.com/flexoki"'
contains "stylesheet carries the flexoki license" "$(cat "$PAGES/katharsis.css")" 'Copyright (c) 2023 Steph Ango'

# 2b. owner-only: pages/, .tmp/, and every file the render wrote, under umask 022
mode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }
check "pages owner-only" "$(mode "$PAGES")" "700"
check "tmp owner-only" "$(mode "$PAGES/.tmp")" "700"
for f in checkout-flow.html checkout-flow.svg checkout-flow.d2 katharsis.css katharsis.js; do
  check "$f owner-only" "$(mode "$PAGES/$f")" "600"
done

# 3. the same title again takes the next free name, the stale stylesheet is
# refreshed, and a pages/ left readable is made owner-only again
echo 'stale' > "$PAGES/katharsis.css"
chmod 755 "$PAGES"
: > "$T/log/d2"
run "$(path uname xdg d2plain)" "$SRC" "${LINUX[@]}" -- render d2 'Checkout & <flow>'
check "second page out" "$OUT" "page: $PAGES/checkout-flow-2.html
opened with xdg-open"
launched xdg-open "$PAGES/checkout-flow-2.html"
check "plain d2 args" "$(grep -v '^layout' "$T/log/d2")" "$PAGES/checkout-flow-2.d2 $PAGES/checkout-flow-2.svg"
check "stylesheet refreshed" "$(cmp -s "$ASSETS/katharsis.css" "$PAGES/katharsis.css" && echo same)" "same"
check "first page untouched" "$(cat "$PAGES/checkout-flow.html")" "$HTML"
lacks "no takeaway, no takeaway line" "$(cat "$PAGES/checkout-flow-2.html")" 'k-takeaway'
contains "plain d2 footer" "$(cat "$PAGES/checkout-flow-2.html")" 'with D2 from <a href="checkout-flow-2.d2">'
check "readable pages made owner-only" "$(mode "$PAGES")" "700"
check "refreshed stylesheet owner-only" "$(mode "$PAGES/katharsis.css")" "600"

# 4. render with mermaid
run "$(path uname xdg mmdc)" 'graph TD; a-->b' "${LINUX[@]}" -- render mermaid '!!!'
check "mermaid out" "$OUT" "page: $PAGES/diagram.html
opened with xdg-open"
launched xdg-open "$PAGES/diagram.html"
check "mermaid args" "$(log mmdc)" "-i $PAGES/diagram.mmd -o $PAGES/diagram.svg -b transparent"
check "mermaid TMPDIR under the data directory" "$(log mmdc-tmpdir)" "$PAGES/.tmp"
contains "mermaid footer" "$(cat "$PAGES/diagram.html")" 'with the Mermaid CLI from <a href="diagram.mmd">'
contains "mermaid figure width from its viewBox" "$(cat "$PAGES/diagram.html")" '<figure class="k-figure" style="--k-svg-width: 1234.5px">'
run "$(path uname xdg d2plain)" "$SRC" "${LINUX[@]}" FAKE_SVG="$T/nobox.svg" -- render d2 'No box'
launched xdg-open "$PAGES/no-box.html"
contains "no viewBox, no width" "$(cat "$PAGES/no-box.html")" '<figure class="k-figure">
<svg xmlns'

# 5. fallbacks: no renderer for the language, a failed render, no source
run "$(path uname xdg mmdc)" "$SRC" "${LINUX[@]}" -- render d2 'Missing'
check "no d2 rc" "$RC" "0"
check "no d2" "$OUT" "not rendered: d2 is not on PATH. Draw an inline sketch instead."
run "$(path uname xdg)" 'graph TD; a-->b' "${LINUX[@]}" -- render mermaid 'Missing'
check "no mmdc" "$OUT" "not rendered: mmdc is not on PATH. Draw an inline sketch instead."
absent "no renderer writes no source" "$PAGES/missing.d2"
run "$(path uname xdg d2tala)" "$SRC" "${LINUX[@]}" FAKE_FAIL=1 -- render d2 'Broken'
check "failed render rc" "$RC" "0"
check "failed render" "$OUT" "not rendered: d2 exited 1: err: in.d2:1:1: unexpected token. Draw an inline sketch instead."
absent "failed render leaves no source" "$PAGES/broken.d2"
absent "failed render leaves no drawing" "$PAGES/broken.svg"
absent "failed render leaves no page" "$PAGES/broken.html"
run "$(path uname xdg d2tala)" '' "${LINUX[@]}" -- render d2 'Empty'
check "empty source" "$OUT" "not rendered: no diagram source on stdin. Draw an inline sketch instead."
absent "empty source leaves no file" "$PAGES/empty.d2"
: > "$T/notadir"
OUT="$(cd "$T/work" && printf '%s' "$SRC" | env HOME="$H" KATHARSIS_DATA="$T/notadir" PATH="$(path uname xdg d2tala)" \
  "${LINUX[@]}" KLOG="$T/log" "$SCRIPT" render d2 'Nowhere' 2>&1)"; RC=$?
check "unwritable data rc" "$RC" "0"
check "unwritable data" "$OUT" "not rendered: cannot write to $T/notadir/pages. Draw an inline sketch instead."

# 5b. a name already taken goes to the next free one: a page, or a drawing
# left without its page
echo 'kept' > "$PAGES/taken.html"
run "$(path uname xdg d2plain)" "$SRC" "${LINUX[@]}" -- render d2 'Taken'
check "taken page out" "$OUT" "page: $PAGES/taken-2.html
opened with xdg-open"
launched xdg-open "$PAGES/taken-2.html"
check "taken page untouched" "$(cat "$PAGES/taken.html")" "kept"
echo 'kept' > "$PAGES/orphan.svg"
run "$(path uname xdg d2plain)" "$SRC" "${LINUX[@]}" -- render d2 'Orphan'
check "orphan drawing out" "$OUT" "page: $PAGES/orphan-2.html
opened with xdg-open"
launched xdg-open "$PAGES/orphan-2.html"
check "orphan drawing untouched" "$(cat "$PAGES/orphan.svg")" "kept"

# 5c. a concurrent render of the same title never takes the name a render in
# progress holds: the first d2 render waits on its source, and a Mermaid
# render of that title, whose source file has a different name, runs meanwhile
mkfifo "$T/fifo"
(cd "$T/work" && env -u KATHARSIS_DATA HOME="$H" TMPDIR="$T/tmp" PATH="$(path uname xdg d2plain)" \
  "${LINUX[@]}" "$SCRIPT" render d2 'Race' < "$T/fifo" > "$T/race-first.out" 2>&1) &
RACE=$!
exec 3> "$T/fifo"
i=0; while [ ! -e "$PAGES/race.d2" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
run "$(path uname xdg mmdc)" 'graph TD; a-->b' "${LINUX[@]}" -- render mermaid 'Race'
check "concurrent render takes the next name" "$OUT" "page: $PAGES/race-2.html
opened with xdg-open"
printf '%s' "$SRC" >&3; exec 3>&-
wait "$RACE"
check "first render keeps its name" "$(cat "$T/race-first.out")" "page: $PAGES/race.html
opened with xdg-open"
launched xdg-open "$PAGES/race.html"
launched xdg-open "$PAGES/race-2.html"
check "first render keeps its source" "$(cat "$PAGES/race.d2")" "$SRC"
contains "first page inlines its own drawing" "$(cat "$PAGES/race.html")" 'class="d2-svg"'
contains "concurrent page inlines its own drawing" "$(cat "$PAGES/race-2.html")" 'id="my-svg"'
rm -f "$T/fifo"

# 5d. a symlink in pages/ is never written through: one at the stylesheet is
# replaced, and a dangling one at the source name takes the name
echo 'outside' > "$T/outside.css"
rm -f "$PAGES/katharsis.css"; ln -s "$T/outside.css" "$PAGES/katharsis.css"
ln -s "$T/outside-target.d2" "$PAGES/planted.d2"
run "$(path uname xdg d2plain)" "$SRC" "${LINUX[@]}" -- render d2 'Planted'
check "planted out" "$OUT" "page: $PAGES/planted-2.html
opened with xdg-open"
launched xdg-open "$PAGES/planted-2.html"
check "symlinked stylesheet's target untouched" "$(cat "$T/outside.css")" "outside"
check "stylesheet symlink replaced by a file" "$([ -L "$PAGES/katharsis.css" ] && echo link || echo file)" "file"
check "stylesheet refreshed past the symlink" "$(cmp -s "$ASSETS/katharsis.css" "$PAGES/katharsis.css" && echo same)" "same"
absent "dangling symlink's target never created" "$T/outside-target.d2"
check "dangling symlink left in place" "$(readlink "$PAGES/planted.d2")" "$T/outside-target.d2"

# 5e. a title with a newline gives a one-line path and a working source link
run "$(path uname xdg d2plain)" "$SRC" "${LINUX[@]}" -- render d2 $'API\nFlow'
check "newline title out" "$OUT" "page: $PAGES/api-flow.html
opened with xdg-open"
launched xdg-open "$PAGES/api-flow.html"
contains "newline title footer" "$(cat "$PAGES/api-flow.html")" 'from <a href="api-flow.d2"><code>api-flow.d2</code></a>'

# 5f. a renderer that exits 0 with a folder at the drawing's path, as D2 does
# for layers: one line, nothing on stderr, nothing left behind
run "$(path uname xdg d2plain)" "$SRC" "${LINUX[@]}" FAKE_DIR=1 -- render d2 'Boards'
check "boards rc" "$RC" "0"
check "boards" "$OUT" "not rendered: d2 wrote no single SVG, as a diagram with layers, scenarios, or steps does. Draw an inline sketch instead."
absent "boards leaves no folder" "$PAGES/boards.svg"
absent "boards leaves no source" "$PAGES/boards.d2"
absent "boards leaves no page" "$PAGES/boards.html"

# 5g. a renderer past its time limit is stopped where timeout exists, and runs
# to the end where it does not
if [ -e "$T/sys/timeout" ]; then
  START=$SECONDS
  run "$(path uname xdg d2plain)" "$SRC" "${LINUX[@]}" FAKE_SLEEP=5 _KATHARSIS_RENDER_TIMEOUT=1 -- render d2 'Hung'
  check "hung rc" "$RC" "0"
  check "hung" "$OUT" "not rendered: d2 did not finish within 1s. Draw an inline sketch instead."
  check "hung call returned early" "$([ $((SECONDS - START)) -lt 4 ] && echo early)" "early"
  absent "hung leaves no source" "$PAGES/hung.d2"
  absent "hung leaves no drawing" "$PAGES/hung.svg"
  absent "hung leaves no page" "$PAGES/hung.html"
else
  echo "skip: no timeout on this machine"
fi
run "$(BASE="$T/sysmac" path uname xdg d2plain)" "$SRC" "${LINUX[@]}" FAKE_SLEEP=2 _KATHARSIS_RENDER_TIMEOUT=1 -- render d2 'Slow'
check "no timeout, slow render finishes" "$OUT" "page: $PAGES/slow.html
opened with xdg-open"
launched xdg-open "$PAGES/slow.html"

# 6. the opener per platform
F="$PAGES/checkout-flow.html"
: > "$T/log/xdg-open"
run "$(path uname xdg mac wslview explorer)" '' FAKE_OS=Darwin FAKE_REL=24.1.0 -- open "$F"
check "macos" "$OUT" "opened with open"
launched open "$F"
run "$(path uname xdg wslview explorer)" '' "${WSL[@]}" -- open "$F"
check "wsl prefers wslview" "$OUT" "opened with wslview"
launched wslview "$F"
run "$(path uname xdg explorer)" '' "${WSL[@]}" -- open "$F"
check "wsl explorer" "$OUT" "opened with explorer.exe"
launched explorer.exe "\\\\wsl.localhost\\Ubuntu$F"
check "wsl never uses xdg-open" "$(log xdg-open)" ""
run "$(path uname xdg)" '' "${WSL[@]}" -- open "$F"
check "wsl without an opener" "$OUT" "not opened: no opener found on this system. Open $F yourself."
run "$(path uname xdg)" '' FAKE_OS=Linux FAKE_REL=4.4.0-19041-Microsoft -- open "$F"
check "wsl 1 is wsl" "$OUT" "not opened: no opener found on this system. Open $F yourself."
run "$(path uname xdg)" '' "${LINUX[@]}" -- open "$F"
check "linux" "$OUT" "opened with xdg-open"
run "$(path uname)" '' "${LINUX[@]}" -- open "$F"
check "linux without xdg-open" "$OUT" "not opened: no opener found on this system. Open $F yourself."
launched xdg-open "$F"
# an opener that waits on the browser does not hold the call
: > "$T/log/xdg-open"
run "$(path uname xdgslow)" '' "${LINUX[@]}" -- open "$F"
check "slow opener rc" "$RC" "0"
check "slow opener" "$OUT" "opened with xdg-open"
absent "returned before the opener finished" "$T/log/slow-done"
launched xdg-open "$F"
: > "$T/release"
i=0; while [ ! -e "$T/log/slow-done" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
run "$(path uname xdg)" '' FAKE_OS=FreeBSD FAKE_REL=14.1 -- open "$F"
check "unknown platform" "$OUT" "not opened: no opener found on this system. Open $F yourself."
run "$(path uname xdg)" '' "${LINUX[@]}" -- open "$PAGES/nope.html"
check "missing page rc" "$RC" "0"
check "missing page" "$OUT" "not opened: no page at $PAGES/nope.html."
# open launches nothing but a .html file directly under pages/
: > "$T/x.command"
cp "$F" "$T/outside.html"
: > "$T/log/xdg-open"
for f in "$T/x.command" "$T/outside.html" "$PAGES/checkout-flow.svg"; do
  run "$(path uname xdg)" '' "${LINUX[@]}" -- open "$f"
  check "open refuses $f rc" "$RC" "0"
  check "open refuses $f" "$OUT" "not opened: $f is not a page in $PAGES."
done
sleep 0.3
check "refused paths never launched" "$(log xdg-open)" ""
# where setsid exists, the opener runs in its own session
run "$(path uname xdg setsid)" '' "${LINUX[@]}" -- open "$F"
check "setsid out" "$OUT" "opened with xdg-open"
launched setsid "xdg-open $F"
run "$(path uname d2tala)" "$SRC" "${LINUX[@]}" -- render d2 'Unopened'
check "render with no opener" "$OUT" "page: $PAGES/unopened.html
not opened: no opener found on this system. Open $PAGES/unopened.html yourself."

# 7. a wrong call prints the usage and exits 2
for args in '' 'draw' 'detect extra' 'render d2' 'render svg Title' 'open' 'render d2 Title take extra'; do
  # shellcheck disable=SC2086
  run "$(path uname)" '' "${LINUX[@]}" -- $args
  check "usage rc [$args]" "$RC" "2"
  contains "usage text [$args]" "$OUT" "Usage: katharsis-artifact.sh detect"
done
run "$(path uname)" '' "${LINUX[@]}" -- --help
check "help rc" "$RC" "0"

# 8. nothing outside the data directory: the temp HOME holds only pages/, and
# the working and temp directories stay empty
check "home holds only pages" "$(cd "$H" && find . -type f | grep -v '^\./\.claude/katharsis-data/pages/[^/]*$')" ""
check "work dir empty" "$(ls -A "$T/work")" ""
check "tmp dir empty" "$(ls -A "$T/tmp")" ""
check "pages holds only known kinds" "$(cd "$PAGES" && find . -type f | grep -v -E '\.(html|svg|d2|mmd)$|^\./katharsis\.(css|js)$')" ""

echo
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
