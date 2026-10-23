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
#       A name held by a symlink counts as taken, so no write follows one.
#       The name comes from the title in lowercase, with every run of other
#       characters, whitespace and newlines included, made one hyphen.
#       The renderer runs under `timeout` where that command exists, so a
#       hung renderer ends the call after 60 seconds; stock macOS has no
#       `timeout`, and there the renderer runs unbounded. A renderer that
#       exits 0 without writing one SVG file, as D2 does for a diagram with
#       layers, scenarios, or steps, counts as a failed render.
#       Before the page, it copies the plugin's assets/pages/katharsis.css and
#       katharsis.js over the copies in pages/, which every page links by
#       relative path, so older pages pick up the current look. Each copy goes
#       to a temporary name in pages/ and is renamed over the old one, so a
#       symlink planted there is replaced rather than written through. The
#       page's figure carries the drawing's width from its viewBox, so the
#       stylesheet shows a wide drawing at that width and scrolls it. Prints
#       `page: <path>`, then opens the page as `open` does and prints that
#       line.
#
#   katharsis-artifact.sh open <page>
#       Opens a page with the platform's opener, and refuses anything but a
#       .html file directly under pages/ in the data directory, so the
#       command's allow entry launches nothing else. The opener is `open` on
#       macOS; on WSL, `wslview`, else `explorer.exe` with the path
#       `wslpath -w` gives; on other Linux, `xdg-open`. WSL is a Linux kernel
#       release (`uname -r`) naming Microsoft, which both WSL 1 and WSL 2 do.
#       The opener runs detached, under `setsid` where it exists and `nohup`
#       otherwise, so the call returns at once even when the opener waits on
#       the browser, as xdg-open's generic mode does, and a kill of the
#       call's process group misses the browser; its exit status is never
#       seen. Prints `opened with <opener>` once it is launched, or
#       `not opened: <why>` when the path is refused or no opener exists.
#
# Every path it cannot help on, no renderer, a render that fails, an
# unwritable data directory, no opener, prints one line saying so and exits 0;
# a render that cannot finish says to draw an inline sketch instead. A wrong
# subcommand or a missing argument prints the usage and exits 2, so a typo
# cannot pass as a fallback.
#
# Everything it creates is readable only by the user: it sets umask 077 and
# makes pages/ 0700 on every render, as kref does for its pages.
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
umask 077

SELF="$(cd "$(dirname "$0")" && pwd)"
ASSETS="$(dirname "$SELF")/assets/pages"
DATA="${KATHARSIS_DATA:-$HOME/.claude/katharsis-data}"
PAGES="$DATA/pages"
FALLBACK='Draw an inline sketch instead.'

usage() {
  printf 'Usage: %s detect\n       %s render <d2|mermaid> <title> [takeaway] < source\n       %s open <page>\n' \
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
  # cannot hold the model's Bash call open; in its own session where setsid
  # exists, so a kill of the call's process group does not reach the browser.
  if have setsid; then
    setsid "$opener" "$f" >/dev/null 2>&1 </dev/null &
  else
    nohup "$opener" "$f" >/dev/null 2>&1 </dev/null &
  fi
  echo "opened with $opener"
}

# taken <path>: true when anything, a dangling symlink included, holds the path.
taken() { [ -e "$1" ] || [ -L "$1" ]; }

# run_renderer <command...>: runs it with TMPDIR under pages/, under timeout
# where that command exists, for $limit seconds.
run_renderer() {
  if have timeout; then
    TMPDIR="$tmp" timeout "$limit" "$@"
  else
    TMPDIR="$tmp" "$@"
  fi
}

# open_page <path>: opens it only when it is a .html file directly under pages/.
open_page() {
  local f="$1" dir pages
  dir="$(cd "$(dirname "$f")" 2>/dev/null && pwd -P)"
  pages="$(cd "$PAGES" 2>/dev/null && pwd -P)"
  case "$f" in
    *.html) ;;
    *) dir='' ;;
  esac
  if [ -z "$dir" ] || [ "$dir" != "$pages" ]; then
    echo "not opened: $f is not a page in $PAGES."
  elif [ ! -f "$f" ] || [ -L "$f" ]; then
    echo "not opened: no page at $f."
  else
    open_file "$f"
  fi
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
  local lang="$1" title="$2" takeaway="${3-}" tool ext found label slug name n src svg page err rc why tmp limit width fail f
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
  if ! mkdir -p "$PAGES" 2>/dev/null || ! chmod 700 "$PAGES" 2>/dev/null || [ ! -w "$PAGES" ]; then
    echo "not rendered: cannot write to $PAGES. $FALLBACK"
    return
  fi

  slug="$(printf '%s' "$title" | tr '[:space:]' ' ' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9][^a-z0-9]*/-/g; s/^-//' | cut -c1-60 | sed 's/-$//')"
  [ -n "$slug" ] || slug=diagram
  # Creating the page with noclobber reserves the name: of two renders that
  # pick one name at once, only one creates the file, and the other moves on.
  name="$slug"; n=2
  while :; do
    if ! taken "$PAGES/$name.svg" && ! taken "$PAGES/$name.$ext" && ! taken "$PAGES/$name.html"; then
      (set -C; : > "$PAGES/$name.html") 2>/dev/null && break
      if ! taken "$PAGES/$name.html"; then
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
  # _KATHARSIS_RENDER_TIMEOUT is for the test suite.
  limit="${_KATHARSIS_RENDER_TIMEOUT:-60}"
  if [ "$lang" = mermaid ]; then
    label='the Mermaid CLI'
    err="$(run_renderer mmdc -i "$src" -o "$svg" -b transparent 2>&1 >/dev/null)"; rc=$?
  elif [ "$found" = 'd2 tala' ]; then
    label='D2 with the TALA layout'
    err="$(run_renderer d2 --layout=tala "$src" "$svg" 2>&1 >/dev/null)"; rc=$?
  else
    label='D2'
    err="$(run_renderer d2 "$src" "$svg" 2>&1 >/dev/null)"; rc=$?
  fi
  # The reserved name kept every one of these paths free, so each one that
  # exists now is this call's or its renderer's, a directory included.
  fail=''
  if [ "$rc" -eq 124 ] && have timeout; then
    fail="$tool did not finish within ${limit}s"
  elif [ "$rc" -ne 0 ]; then
    why="$(printf '%s\n' "$err" | sed '/^[[:space:]]*$/d' | tail -n 1 | cut -c1-200)"
    fail="$tool exited $rc${why:+: $why}"
  elif [ ! -f "$svg" ] || [ -L "$svg" ] || ! grep -q '<svg' "$svg" 2>/dev/null; then
    fail="$tool wrote no single SVG"
    [ "$tool" = d2 ] && fail="$fail, as a diagram with layers, scenarios, or steps does"
  fi
  if [ -n "$fail" ]; then
    rm -rf "$src" "$svg" "$page" 2>/dev/null
    echo "not rendered: $fail. $FALLBACK"
    return
  fi

  # Each asset goes to a fresh temporary name and is renamed over the old copy,
  # which replaces a symlink at that name rather than writing through it.
  for f in katharsis.css katharsis.js; do
    if ! n="$(mktemp "$PAGES/.$f.XXXXXX" 2>/dev/null)" ||
       ! cp "$ASSETS/$f" "$n" 2>/dev/null || ! mv -f "$n" "$PAGES/$f" 2>/dev/null; then
      rm -f "$n" "$src" "$svg" "$page" 2>/dev/null
      echo "not rendered: cannot refresh the stylesheet in $PAGES. $FALLBACK"
      return
    fi
  done

  # The drawing's width from the first <svg> tag's viewBox, for the stylesheet.
  width="$(tr '\n' ' ' < "$svg" | grep -o '<svg[^>]*>' | head -n 1 | grep -o 'viewBox="[^"]*"' |
    sed 's/^viewBox="//; s/"$//; s/,/ /g' | tr -s ' ' ' ' | sed 's/^ //' | cut -d' ' -f3)"
  case "$width" in
    ''|*[!0-9.]*|*.*.*|.*) width='' ;;
  esac

  if ! {
    printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    printf '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    printf '<title>%s</title>\n' "$(esc "$title")"
    printf '<link rel="stylesheet" href="katharsis.css">\n<script src="katharsis.js"></script>\n</head>\n<body>\n'
    printf '<header class="k-header">\n<h1 class="k-title">%s</h1>\n' "$(esc "$title")"
    printf '<button type="button" class="k-toggle" data-k-toggle>Theme</button>\n</header>\n<main>\n'
    [ -z "$takeaway" ] || printf '<p class="k-takeaway">%s</p>\n' "$(esc "$takeaway")"
    if [ -n "$width" ]; then
      printf '<figure class="k-figure" style="--k-svg-width: %spx">\n' "$width"
    else
      printf '<figure class="k-figure">\n'
    fi
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
    open_page "$2" ;;
  -h|--help)
    usage ;;
  *)
    bad ;;
esac
exit 0
