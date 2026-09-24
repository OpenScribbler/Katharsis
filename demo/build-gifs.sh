#!/usr/bin/env bash
# Rebuilds the session GIF into ../docs/media/. Needs vhs and python3 on PATH.
# The side-by-side GIFs come from tui-gif.py.
set -eu
cd "$(dirname "$0")"
COLS=80

# pane <out.gif> <replay> <title> <delay> <height>: one VHS pane, sized to hold
# the whole replay so nothing scrolls.
pane() {
  cat > "tape-$$.tape" <<EOF
Output $1
Set Shell bash
Set FontSize 13
Set Width 716
Set Height $5
Set Padding 18
Set Framerate 12
Hide
Type "clear; python3 player.py $2 '$3' $4 6.0 $COLS"
Enter
Show
Sleep $6s
EOF
  vhs "tape-$$.tape" > /dev/null
  rm -f "tape-$$.tape"
}

# rows * 16.2px at FontSize 13, plus the padding and the prompt line.
height() { echo $(( $1 * 162 / 10 + 50 )); }

if [ -f captures/session/answer-katharsis.md ]; then
  { echo "> 1. a, 2. a"; echo; cat captures/session/answer-katharsis.md; echo
    echo "> ! kref"; echo; cat captures/session/kref.txt; echo
    echo "> ! kref -f C"; echo; cat captures/session/kref-f-C.txt; } > replay-session.txt
  rows=$(python3 player.py --count replay-session.txt $COLS)
  pane out-session.gif replay-session.txt "Claude Opus 5.5, Katharsis: the next turn and kref" 0.25 \
    "$(height "$rows")" $(( rows * 25 / 100 + 9 ))
  cp out-session.gif ../docs/media/session.gif
  echo "docs/media/session.gif  rows=$rows"
fi
