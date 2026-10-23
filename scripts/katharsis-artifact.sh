#!/usr/bin/env bash
# katharsis-artifact.sh: renders a diagram too dense for an inline sketch into
# an HTML page under the user's Katharsis data directory and opens it. The
# model runs it at the `rich` richness level, under the rules in
# styles/richness/sketches.md, rather than writing these steps itself, so the
# behavior is the same on every machine and a suite can pin it.
#
#   katharsis-artifact.sh detect
#       Names the renderer a render would use, on one line:
#         renderer: d2 (tala layout). ...   D2, and `d2 layout` lists tala
#         renderer: d2. ...                 D2 without TALA
#         renderer: mermaid. ...            the Mermaid CLI, mmdc
#         renderer: none. ...               neither: draw an inline sketch
#       D2 wins over Mermaid when both are installed. Detection runs at each
#       call, so a renderer installed later is used with no setup.
#
#   katharsis-artifact.sh render <d2|mermaid> <title> [takeaway] < source
#       Reads diagram source in that renderer's language on stdin and writes
#       three files to pages/ in the data directory, named from the title:
#       <name>.d2 or <name>.mmd, the source; <name>.svg, the drawing; and
#       <name>.html, a page with the title, the takeaway above the drawing,
#       the SVG inline, and a footer naming the renderer and the source. A
#       name already taken gets -2, -3, and so on, so no page is overwritten:
#       the page's name is reserved by creating <name>.html with noclobber,
#       so two renders of one title at once never share a name.
#       Before the page, it copies the plugin's assets/pages/katharsis.css and
#       katharsis.js over the copies in pages/, which every page links by
#       relative path, so older pages pick up the current look. Prints
#       `page: <path>`, then opens the page as `open` does and prints that
#       line.
#
#   katharsis-artifact.sh open <file>
#       Opens a file with the platform's opener: `open` on macOS; on WSL,
#       `wslview`, else `explorer.exe` with the path `wslpath -w` gives; on
#       other Linux, `xdg-open`. WSL is a Linux kernel release (`uname -r`)
#       naming Microsoft, which both WSL 1 and WSL 2 do. The opener runs
#       detached, so the call returns at once even when the opener waits on
#       the browser, as xdg-open's generic mode does; its exit status is
#       never seen. Prints `opened with <opener>` once it is launched, or
#       `not opened: <why>` when no opener exists.
#
# Every path it cannot help on, no renderer, a render that fails, an
# unwritable data directory, no opener, prints one line saying so and exits 0;
# a render that cannot finish says to draw an inline sketch instead. A wrong
# subcommand or a missing argument prints the usage and exits 2, so a typo
# cannot pass as a fallback.
#
# The script writes nothing outside pages/ in the data directory, and runs the
# renderer with TMPDIR set to pages/.tmp, so a renderer that honors TMPDIR
# keeps its temporary files there too. A cache the renderer keeps in the
# user's home directory is the renderer's. A failed render removes the
# source, drawing, and page this call wrote.
#
# The assets come from the plugin root this script sits in. KATHARSIS_DATA
# overrides ~/.claude/katharsis-data, for tests.

set -u

SELF="$(cd "$(dirname "$0")" && pwd)"
ASSETS="$(dirname "$SELF")/assets/pages"
DATA="${KATHARSIS_DATA:-$HOME/.claude/katharsis-data}"
PAGES="$DATA/pages"
FALLBACK='Draw an inline sketch instead.'

usage() {
  printf 'Usage: %s detect\n       %s render <d2|mermaid> <title> [takeaway] < source\n       %s open <file>\n' \
    "${0##*/}" "${0##*/}" "${0##*/}"
}
bad() { usage >&2; exit 2; }

have() { command -v "$1" >/dev/null 2>&1; }

# The renderer a render uses: d2, with tala when d2 lists that layout, else mmdc.
renderer() {
  if have d2; then
    if d2 layout 2>/dev/null | grep -q '^tala '; then echo 'd2 tala'; else echo d2; fi
  elif have mmdc; then
    echo mermaid
  else
    echo none
  fi
}

# HTML-escapes $1 for text and attribute values.
esc() { printf '%s' "$1" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g; s/"/\&quot;/g'; }

open_file() {
  local f="$1" opener='' win
  case "$(uname -s 2>/dev/null)" in
    Darwin) have open && opener=open ;;
    Linux)
      case "$(uname -r 2>/dev/null)" in
        *[Mm]icrosoft*)
          if have wslview; then opener=wslview
          elif have explorer.exe && have wslpath; then opener=explorer.exe
          fi ;;
        *) have xdg-open && opener=xdg-open ;;
      esac ;;
  esac
  if [ -z "$opener" ]; then
    echo "not opened: no opener found on this system. Open $f yourself."
    return
  fi
  if [ "$opener" = explorer.exe ]; then
    if ! win="$(wslpath -w "$f" 2>/dev/null)"; then
      echo "not opened: wslpath could not convert $f. Open it yourself."
      return
    fi
    f="$win"
  fi
  # Detached, with every stream closed, so an opener that waits on the browser
  # cannot hold the model's Bash call open.
  nohup "$opener" "$f" >/dev/null 2>&1 </dev/null &
  echo "opened with $opener"
}

detect() {
  case "$(renderer)" in
    'd2 tala') echo 'renderer: d2 (tala layout). Write D2 source and run render d2.' ;;
    d2) echo 'renderer: d2. Write D2 source and run render d2.' ;;
    mermaid) echo 'renderer: mermaid. Write Mermaid source and run render mermaid.' ;;
    *) echo "renderer: none. Neither d2 nor mmdc is on PATH. $FALLBACK" ;;
  esac
}

render() {
  local lang="$1" title="$2" takeaway="${3-}" tool ext found label slug name n src svg page err rc why tmp
  case "$lang" in
    d2) tool=d2; ext=d2 ;;
    mermaid) tool=mmdc; ext=mmd ;;
    *) bad ;;
  esac
  [ -n "$title" ] || bad
  if ! have "$tool"; then
    echo "not rendered: $tool is not on PATH. $FALLBACK"
    return
  fi
  if [ -t 0 ]; then
    echo "not rendered: no diagram source on stdin. $FALLBACK"
    return
  fi
  if [ ! -f "$ASSETS/katharsis.css" ] || [ ! -f "$ASSETS/katharsis.js" ]; then
    echo "not rendered: $ASSETS is missing its stylesheet or script. $FALLBACK"
    return
  fi
  if ! mkdir -p "$PAGES" 2>/dev/null || [ ! -w "$PAGES" ]; then
    echo "not rendered: cannot write to $PAGES. $FALLBACK"
    return
  fi

  slug="$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9][^a-z0-9]*/-/g; s/^-//' | cut -c1-60 | sed 's/-$//')"
  [ -n "$slug" ] || slug=diagram
  # Creating the page with noclobber reserves the name: of two renders that
  # pick one name at once, only one creates the file, and the other moves on.
  name="$slug"; n=2
  while :; do
    if [ ! -e "$PAGES/$name.svg" ] && [ ! -e "$PAGES/$name.$ext" ]; then
      (set -C; : > "$PAGES/$name.html") 2>/dev/null && break
      if [ ! -e "$PAGES/$name.html" ]; then
        echo "not rendered: cannot write to $PAGES. $FALLBACK"
        return
      fi
    fi
    name="$slug-$n"; n=$((n + 1))
  done
  src="$PAGES/$name.$ext"; svg="$PAGES/$name.svg"; page="$PAGES/$name.html"

  if ! cat > "$src" 2>/dev/null; then
    rm -f "$src" "$page"
    echo "not rendered: cannot write $src. $FALLBACK"
    return
  fi
  if [ ! -s "$src" ]; then
    rm -f "$src" "$page"
    echo "not rendered: no diagram source on stdin. $FALLBACK"
    return
  fi
  tmp="$PAGES/.tmp"
  if ! mkdir -p "$tmp" 2>/dev/null; then
    rm -f "$src" "$page"
    echo "not rendered: cannot write to $tmp. $FALLBACK"
    return
  fi

  found="$(renderer)"
  if [ "$lang" = mermaid ]; then
    label='the Mermaid CLI'
    err="$(TMPDIR="$tmp" mmdc -i "$src" -o "$svg" -b transparent 2>&1 >/dev/null)"; rc=$?
  elif [ "$found" = 'd2 tala' ]; then
    label='D2 with the TALA layout'
    err="$(TMPDIR="$tmp" d2 --layout=tala "$src" "$svg" 2>&1 >/dev/null)"; rc=$?
  else
    label='D2'
    err="$(TMPDIR="$tmp" d2 "$src" "$svg" 2>&1 >/dev/null)"; rc=$?
  fi
  if [ "$rc" -ne 0 ] || ! grep -q '<svg' "$svg" 2>/dev/null; then
    why="$(printf '%s\n' "$err" | sed '/^[[:space:]]*$/d' | tail -n 1 | cut -c1-200)"
    rm -f "$src" "$svg" "$page"
    echo "not rendered: $tool exited $rc${why:+: $why}. $FALLBACK"
    return
  fi

  if ! cp "$ASSETS/katharsis.css" "$ASSETS/katharsis.js" "$PAGES/" 2>/dev/null; then
    rm -f "$src" "$svg" "$page"
    echo "not rendered: cannot refresh the stylesheet in $PAGES. $FALLBACK"
    return
  fi

  if ! {
    printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    printf '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    printf '<title>%s</title>\n' "$(esc "$title")"
    printf '<link rel="stylesheet" href="katharsis.css">\n<script src="katharsis.js"></script>\n</head>\n<body>\n'
    printf '<header class="k-header">\n<h1 class="k-title">%s</h1>\n' "$(esc "$title")"
    printf '<button type="button" class="k-toggle" data-k-toggle>Theme</button>\n</header>\n<main>\n'
    [ -z "$takeaway" ] || printf '<p class="k-takeaway">%s</p>\n' "$(esc "$takeaway")"
    printf '<figure class="k-figure">\n'
    sed '1s/^<?xml[^>]*?>//; s/<!DOCTYPE[^>]*>//' "$svg"
    printf '\n</figure>\n</main>\n<footer class="k-footer">\n'
    printf 'Rendered by Katharsis with %s from <a href="%s"><code>%s</code></a>.\n' "$label" "$name.$ext" "$name.$ext"
    printf 'Colors: <a href="https://stephango.com/flexoki">Flexoki</a> by Steph Ango.\n'
    printf '</footer>\n</body>\n</html>\n'
  } > "$page" 2>/dev/null; then
    rm -f "$src" "$svg" "$page"
    echo "not rendered: cannot write $page. $FALLBACK"
    return
  fi

  echo "page: $page"
  open_file "$page"
}

case "${1-}" in
  detect)
    [ $# -eq 1 ] || bad
    detect ;;
  render)
    [ $# -ge 3 ] && [ $# -le 4 ] || bad
    render "$2" "$3" "${4-}" ;;
  open)
    [ $# -eq 2 ] && [ -n "$2" ] || bad
    if [ -f "$2" ]; then open_file "$2"; else echo "not opened: no file at $2."; fi ;;
  -h|--help)
    usage ;;
  *)
    bad ;;
esac
exit 0
