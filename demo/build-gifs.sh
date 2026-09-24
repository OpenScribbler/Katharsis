#!/usr/bin/env bash
# Rebuilds the side-by-side GIF for each model under captures/<model>/, and the
# session GIF, into ../docs/media/. Needs vhs, ffmpeg, and python3 on PATH.
# Usage: build-gifs.sh [model ...]   (default: every directory under captures/)
set -eu
cd "$(dirname "$0")"
COLS=80

label() {
  case "$1" in
    sonnet-5) echo "Claude Sonnet 5" ;;
    opus-5) echo "Claude Opus 5" ;;
    opus-5-5) echo "Claude Opus 5.5" ;;
    fable-5) echo "Claude Fable 5" ;;
    fable-5-1) echo "Claude Fable 5.1" ;;
    *) echo "$1" ;;
  esac
}

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

models=("$@")
if [ ${#models[@]} -eq 0 ]; then
  for d in captures/*/default.md; do models+=("$(basename "$(dirname "$d")")"); done
fi

for m in "${models[@]}"; do
  [ -f "captures/$m/default.md" ] || continue
  cat prompt-ci.txt "captures/$m/default.md" > "replay-$m-default.txt"
  cat prompt-ci.txt "captures/$m/katharsis.md" > "replay-$m-katharsis.txt"
  a=$(python3 player.py --count "replay-$m-default.txt" $COLS)
  b=$(python3 player.py --count "replay-$m-katharsis.txt" $COLS)
  rows=$(( a > b ? a : b ))
  h=$(height "$rows")
  secs=$(( rows * 15 / 100 + 9 ))
  pane "out-$m-default.gif" "replay-$m-default.txt" "$(label "$m"), default style" 0.15 "$h" "$secs"
  pane "out-$m-katharsis.gif" "replay-$m-katharsis.txt" "$(label "$m"), Katharsis" 0.15 "$h" "$secs"
  ffmpeg -y -loglevel error -i "out-$m-default.gif" -i "out-$m-katharsis.gif" -filter_complex \
    "[0:v]pad=iw+4:ih:0:0:color=0x444444[l];[l][1:v]hstack=inputs=2[s];[s]split[x][y];[x]palettegen=stats_mode=diff[p];[y][p]paletteuse=dither=bayer:bayer_scale=3" \
    -loop 0 "../docs/media/demo-$m.gif"
  echo "docs/media/demo-$m.gif  rows=$rows"
done

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
