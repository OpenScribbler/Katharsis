#!/usr/bin/env bash
# Replays a captured reply into the terminal at a steady rate, for the demo GIF.
# Usage: player.sh <file> <label> <delay-seconds> <hold-seconds> <cols>
set -u
FILE="$1"; LABEL="$2"; DELAY="$3"; HOLD="$4"; COLS="$5"

esc=$(printf '\033')
BOLD="${esc}[1m"; DIM="${esc}[2m"; RESET="${esc}[0m"
CYAN="${esc}[36m"; YELLOW="${esc}[33m"; GREEN="${esc}[32m"; GREY="${esc}[90m"
BLUE="${esc}[94m"

RULE=$(printf '%*s' "$COLS" '' | tr ' ' '-')

printf '%s%s%s\n' "$BOLD$CYAN" "$LABEL" "$RESET"
printf '%s%s%s\n\n' "$GREY" "$RULE" "$RESET"
printf '%s> CI has been flaky and slow. I think the fixed sleep in%s\n' "$DIM" "$RESET"
printf '%s>   orders/retry.py is causing the failures. Run the suite, tell%s\n' "$DIM" "$RESET"
printf '%s>   me what is actually failing and why, and whether to bump the%s\n' "$DIM" "$RESET"
printf '%s>   CI timeout to 30 minutes or split the suite into two jobs.%s\n\n' "$DIM" "$RESET"
sleep 1

# Render the markdown inline the way Claude Code does: bold spans bold, code
# spans coloured, and the marker characters removed so the fold width is the
# width the reader actually sees.
render() {
  sed -E \
    -e "s/\*\*([^*]+)\*\*/${BOLD}\1${RESET}/g" \
    -e "s/\`([^\`]+)\`/${BLUE}\1${RESET}/g"
}

# Fold on the plain text, then render, so the escape bytes never count toward
# the line width.
# The VHS render has no emoji font, so the two decorative markers the question
# format uses are replaced with plain text before folding.
sed -e 's/^\xe2\x9d\x93 //' -e 's/^\xe2\x9e\xa1\xef\xb8\x8f /-> /' "$FILE" \
  | fold -s -w "$COLS" | while IFS= read -r line; do
  case "$line" in
    '## '*)
      printf '%s%s%s\n' "$BOLD$YELLOW" "${line#\#\# }" "$RESET" ;;
    F[0-9]*|D[0-9]*|R[0-9]*|Q[0-9]*|AT[0-9]*|NA[0-9]*)
      printf '%s%s%s\n' "$GREEN" "$(printf '%s' "$line" | render)" "$RESET" ;;
    *)
      printf '%s\n' "$line" | render ;;
  esac
  sleep "$DELAY"
done

sleep "$HOLD"
