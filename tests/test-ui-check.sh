#!/usr/bin/env bash
# Tests for tests/ui-check.py's offline half: the ANSI parser and the cell
# checks, over screens built here. The capture half drives a live Claude Code
# session and has no offline test.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"

out="$(python3 - "$ROOT/tests/ui-check.py" <<'PYEOF'
import importlib.util, sys
spec = importlib.util.spec_from_file_location("ui", sys.argv[1])
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)
passed = failed = 0

def expect(name, got, want):
    global passed, failed
    if got == want:
        passed += 1
    else:
        failed += 1
        print(f"FAIL {name}\n  got:  {got!r}\n  want: {want!r}")

def findings(rows, cols=20):
    return [(l, m) for l, m in ui.check(ui.parse(rows, "dark"), cols) if l != "info"]

# The parser: colors, a hyperlink that draws only its text, a wide character.
g = ui.parse(["\x1b[1;38;2;20;184;166mAB\x1b[0m\x1b]8;id=x;https://a.invalid/\x1b\\F1\x1b]8;;\x1b\\ 界!"], "dark")
row = g[0]
expect("parse text", "".join(c[0] for c in row), "ABF1 界!")
expect("parse truecolor and bold", (row[0][1], row[0][3]), ("#14b8a6", True))
expect("parse reset", row[2][1], None)
expect("parse wide character takes two cells", [c[0] for c in row[5:8]], ["界", "", "!"])
expect("parse 256-color", ui.parse(["\x1b[38;5;196mx"], "dark")[0][0][1], "#ff0000")
expect("parse colon-form truecolor", ui.parse(["\x1b[38:2::20:184:166mx"], "dark")[0][0][1], "#14b8a6")
expect("parse colon-form truecolor without a color space", ui.parse(["\x1b[38:2:20:184:166mx"], "dark")[0][0][1], "#14b8a6")
expect("parse skips an underline color", ui.parse(["\x1b[58;2;1;2;3mx"], "dark")[0][0][3:7], (False, False, False, False))
expect("parse curly underline", ui.parse(["\x1b[4:3mx"], "dark")[0][0][6], True)

# Boxes.
whole = ["╭──────╮", "│ ok   │", "╰──────╯"]
expect("a whole box passes", findings(whole), [])
expect("a broken right edge fails", findings(["╭──────╮", "│ okay  x", "╰──────╯"]),
       [("fail", "row 2: the box from row 1 has its right edge broken by ' ', so content is drawn past it")])
expect("a top edge off the screen fails", findings(["      ╭─────", "      │ card", "      ╰─────"], cols=12),
       [("fail", "row 1, col 7: a box's top edge runs off the screen")])
expect("a box cut by its container fails", findings(
    ["╭────────────╮", "│ ╭──────╮   │", "│ │ menu │   │", "╰────────────╯"]),
    [("fail", "row 2, col 3: a box is cut off at row 4 by the edge of the box around it")])
expect("a box past the screen bottom fails", findings(["╭────╮", "│ ab │"]),
       [("fail", "row 1, col 1: a box runs past the bottom of the screen")])
expect("the engine's [-] over a corner warns", findings(["╭─────[-]", "│ F1    │", "╰───────╯"], cols=9),
       [("warn", "row 1: Claude Code's [-] control covers the top-right corner of the box at col 1")])
expect("a wide character is not a box corner", findings(["界 ok"]), [])
expect("a gap in a top edge fails", findings(["╭  ──╮", "│ ab │", "╰────╯"]),
       [("fail", "row 1: the box at col 1 has its top edge broken by ' ' at col 2")])
expect("a gap in a bottom edge fails", findings(["╭────╮", "│ ab │", "╰  ──╯"]),
       [("fail", "row 3: the box from row 1 has its bottom edge broken by ' ' at col 2")])
expect("card titles one column right at two-digit codes fail",
       findings(["╭────────────╮", "│ F9  alpha  │", "│ F10  beta  │", "╰────────────╯"], cols=14),
       [("fail", "card rows at col 1 start their titles in 2 different columns (+6: F9 (row 2); +7: F10 (row 3))")])
expect("card titles padded past a closed code's mark line up",
       findings(["╭─────────────╮", "│ F9 ✓  alpha │", "│ F10   beta  │", "╰─────────────╯"], cols=15), [])
expect("the engine's close control on a pane's top edge is no break", findings(["╭─────✕─╮", "│ F1    │", "╰───────╯"], cols=9), [])
expect("a close glyph mid-edge still breaks the box", findings(["╭──✕────╮", "│ F1    │", "╰───────╯"], cols=9),
       [("fail", "row 1: the box at col 1 has its top edge broken by '✕' at col 4")])
expect("a combining character beside the engine's [-] does not crash", findings(["╭─e\u0301──[-]", "│ F1    │", "╰───────╯"], cols=9)[0][0], "warn")
expect("a box past the screen top fails", findings(["│ ab │", "╰────╯"]),
       [("fail", "row 2, col 1: a box runs past the top of the screen")])
expect("a covered top-left corner fails", findings(["x────╮", "│ ab │", "╰────╯"]),
       [("fail", "row 1, col 1: a box's top-left corner is covered by 'x'")])
expect("card titles in one column pass", findings(["│ F9   one", "│ F10  two"]), [])
expect("card titles out of column fail", [l for l, _ in findings(["│ F9  one", "│ F10  two"])], ["fail"])
expect("a one-space card title out of column fails", [l for l, _ in findings(["│ F9   one", "│ F10 two"])], ["fail"])
expect("prose in a card after a code passes", findings(["│ F1 · title", "│ F12 explains it"]), [])
expect("a box past the screen's left edge fails", findings(["────╮", " ab │", "────╯"]),
       [("fail", "row 1, col 5: a box runs off the left of the screen")])
expect("text into a box edge warns", findings(["╭────╮", "│ abc│", "╰────╯"]),
       [("warn", "row 2: text runs into the right edge of the box from row 1, and may be clipped")])

# Drawer rows.
aligned = ["▸ F1   ○ one", "▸ AT12 ✓ two", "▸ NA3  ✗ three"]
expect("aligned rows pass", findings(aligned), [])
got = findings(["▸ F1 ○ one", "▸ AT12 ✓ two"])
expect("misaligned rows fail", [l for l, _ in got], ["fail"])
expect("misaligned rows name both columns", "marker col 1, glyph +5, title +7: F1 (row 1)" in got[0][1] and "AT12 (row 2)" in got[0][1], True)
expect("a shifted drawer row fails", [l for l, _ in findings(["▸ F1   ○ one", "  ▸ AT12 ○ two"])], ["fail"])

# Error text, and an ellipsis at the screen edge as information only.
expect("error text fails", findings(["TypeError: x is not a function"], cols=40)[0][0], "fail")
expect("the word undefined fails", findings(["title: undefined"])[0][0], "fail")
info = [l for l, _ in ui.check(ui.parse(["abcdefghi…"], "dark"), 10)]
expect("an ellipsis at the edge is information", info, ["info"])

print(f"pass={passed} fail={failed}")
PYEOF
)"
status=$?
echo "$out"
[ "$status" -eq 0 ] && echo "$out" | grep -q 'fail=0$'
