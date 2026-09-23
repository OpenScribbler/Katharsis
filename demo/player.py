#!/usr/bin/env python3
"""Replay a captured reply into the terminal at a steady rate, for the demo GIFs.

Usage: player.py <file> <label> <delay-seconds> <hold-seconds> <cols>
       player.py --count <file> <cols>

The file carries the user's turns as well as the replies: a line starting with
"> " is a user turn and prints dimmed. Markdown renders roughly the way Claude
Code draws it: headings bold, bold spans bold, code spans coloured, pipe tables
as aligned columns, and fence lines dropped. --count prints how many rows the
replay takes, so a tape can size its pane to hold it without scrolling.
"""
import re
import sys
import textwrap
import time

ESC = "\033["
BOLD, DIM, RESET = ESC + "1m", ESC + "2m", ESC + "0m"
CYAN, YELLOW, GREEN, GREY, BLUE = ESC + "36m", ESC + "33m", ESC + "32m", ESC + "90m", ESC + "94m"

# A coded line: F1, AT2, NA3, T-O1, and the question line once its emoji is gone.
CODED = re.compile(r"^(\*\*)?(T-O|[A-Z]{1,2})[0-9]+\b")


def toggles(s):
    """Swap markdown markers for one-character toggles, so wrapping cannot split one."""
    return s.replace("**", "\x01").replace("`", "\x02")


def colour(s, state, base):
    """Turn toggles into escapes, carrying open bold and code spans across wrapped lines."""
    out = base + (BOLD if state["b"] else "") + (BLUE if state["c"] else "")
    for ch in s:
        if ch == "\x01":
            state["b"] = not state["b"]
        elif ch == "\x02":
            state["c"] = not state["c"]
        else:
            out += ch
            continue
        out += RESET + base + (BOLD if state["b"] else "") + (BLUE if state["c"] else "")
    return out + RESET


def plain(s):
    return re.sub(r"\*\*([^*]+)\*\*", r"\1", s).replace("`", "")


def table(rows, cols):
    cells = [[plain(c.strip()) for c in r.strip().strip("|").split("|")] for r in rows]
    cells = [r for r in cells if not all(re.fullmatch(r":?-+:?", c) for c in r)]
    widths = [max(len(r[i]) for r in cells if i < len(r)) for i in range(len(cells[0]))]
    out = []
    for n, r in enumerate(cells):
        line = "  ".join(c.ljust(widths[i]) for i, c in enumerate(r)).rstrip()[:cols]
        out.append(BOLD + line + RESET if n == 0 else line)
    return out


def render(path, cols):
    """Return the replay as a list of display lines, escapes included."""
    text = open(path, encoding="utf-8").read()
    # The VHS render has no emoji font, so the question format's two markers go.
    text = text.replace("❓ ", "").replace("➡️ ", "-> ")
    lines = text.split("\n")
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("|"):
            block = []
            while i < len(lines) and lines[i].startswith("|"):
                block.append(lines[i])
                i += 1
            out.extend(table(block, cols))
            continue
        i += 1
        if line.startswith("```"):
            continue
        if line.startswith("> "):
            out.extend(DIM + w + RESET for w in textwrap.wrap(line, cols) or [""])
            continue
        if line.startswith("#"):
            out.append(BOLD + YELLOW + line.lstrip("#").strip() + RESET)
            continue
        indent = re.match(r"\s*(?:[-*] |[a-z]\. |[0-9]+\. )?", line).group(0)
        base = GREEN if CODED.match(line) else ""
        state = {"b": False, "c": False}
        for w in textwrap.wrap(toggles(line), cols, subsequent_indent=" " * len(indent)) or [""]:
            out.append(colour(w, state, base))
    return out


def main():
    if sys.argv[1] == "--count":
        print(len(render(sys.argv[2], int(sys.argv[3]))) + 3)
        return
    path, label, delay, hold, cols = sys.argv[1:6]
    delay, hold, cols = float(delay), float(hold), int(cols)
    print(BOLD + CYAN + label + RESET)
    print(GREY + "-" * cols + RESET + "\n", flush=True)
    time.sleep(1)
    for line in render(path, cols):
        print(line, flush=True)
        time.sleep(delay)
    time.sleep(hold)


if __name__ == "__main__":
    main()
