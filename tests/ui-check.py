#!/usr/bin/env python3
"""Capture everything the drawer module draws, check the cells, and leave
images for review. Run it after a change to anything under hooks/ that draws.

  ui-check.py [--widths 80,120,160] [--themes dark,light] [--ledgers empty,long]
              [--states reply,drawer,...] [--jobs 4] [--out DIR]
  ui-check.py review <out-dir> "<what the change should look like>" [<diff-file>]

Each condition, one width by one theme by one ledger, is a real Claude Code
session on its own tmux server, loading this checkout's plugin over a scratch
KATHARSIS_DATA, so nothing touches HOME or the live sessions. One model reply
per condition is unavoidable: the Still open row draws only after a live turn
completes. The pointer and keys then drive the session through every state in
STATES, and each state is saved as a PNG, the plain text, and the raw cells.

The scripted checks read the cells: a box whose border is broken or runs off
the screen, text touching a box's edge, drawer titles out of their column,
and error text. report.md lists every image with its checks, and exit status
is 1 when any check fails. The review subcommand hands the images, a statement
of intent, and optionally the diff to a vision model, which writes a verdict
per image to review.md."""
import argparse, concurrent.futures, datetime, html, json, os, re, shutil, subprocess, sys, time, unicodedata, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
ROWS = 44
CACHE = os.path.join(os.environ.get("XDG_CACHE_HOME") or os.path.expanduser("~/.cache"), "katharsis-ui-check")
# One project directory for every run, so the folder-trust prompt appears once per machine.
APP = os.path.join(CACHE, "app")
MODEL = os.environ.get("UI_CHECK_MODEL", "sonnet")


# --- the long ledger --------------------------------------------------------
# Every type, open and closed items, an answered and a dismissed question, an
# erratum, long titles that wrap, an unbreakable token, and three-letter codes
# beside one-letter ones, so the title column has to fit the widest code.

TS = "2030-01-01T00:00:00+00:00"  # dated ahead, so these titles outrank what the seed reply records

LONG = [
    ("F", "The 3 failing tests share one cause: a stale fixture", "tests/fixtures/users.json predates the email column."),
    ("F", "Retries mask the timeout rather than fix it, because the client retries 5 times at 2s each and a hung call surfaces after 10s as a generic error with no endpoint named", ""),
    ("F", "Staging runs Postgres 15 and production runs 16", "The JSON path syntax only parses on 16."),
    ("F", "The export URL is https://example.invalid/reports/2030/quarterly/export?format=csv&include=archived&tz=UTC", "An unbreakable token wider than most drawers."),
    ("C", "Load behavior was checked at 50 users, not 500", "The staging box caps connections at 60."),
    ("C", "The fix is verified on Linux only", "No macOS runner in CI."),
    ("A", "Read “the report” as the weekly one, not the monthly", "The monthly one has no timeout."),
    ("R", "The alert text changes, so two dashboards stop matching", "They alert on the literal error string."),
    ("AT", "Regenerated the fixture from the current schema", "All 41 tests pass."),
    ("AT", "Set the client timeout to 4s with 2 retries, per NA1", "A hung call fails in 8s."),
    ("AT", "Pinned staging to Postgres 16, which retires R1", "docker-compose.yml line 12."),
    ("V", "The suite passes on the pinned staging image, 41 tests", ""),
    ("NA", "Make the retry delay configurable", ""),
    ("NA", "Add a CI check that fails when fixtures drift from the schema", ""),
    ("NA", "Load-test at 500 users once the staging cap is raised", ""),
    ("NA", "Backfill tests for the legacy exporter", ""),
    ("X", "Dropped NA4, the exporter is being deleted next sprint", ""),
    ("MV", "Run the migration on staging: make migrate ENV=staging, and expect 3 tables altered", ""),
    ("B", "The pricing service owners review the rounding change", ""),
    ("W", "The nightly migration dry run reports back at 02:00", ""),
    ("S", "PR #214 is green and waiting on review", ""),
    ("E", "F3 as first written: staging runs Postgres 14", "The image tag says 15."),
]
QUESTIONS = [
    ("Ship the timeout change in this release or the next?", [("a", "This release, and update both alerts today."), ("b", "Next release, after the alert owners sign off.")]),
    ("Should the retry delay be a per-call argument or a module setting?", [("a", "per-call argument"), ("b", "module setting")]),
    ("Rename the pricing module while we are in there, even though three other services import it by its current path?", [("a", "rename"), ("b", "leave it")]),
    ("Keep the old endpoint alive for one release?", [("a", "yes"), ("b", "no")]),
]


def write_ledger(data, sid, kind):
    os.makedirs(os.path.join(data, "ledger", "demo"), exist_ok=True)
    os.makedirs(os.path.join(data, "answers"), exist_ok=True)
    rows, n = [], {}
    base = dict(ts=TS, session_id=sid, project="demo", known=True)
    if kind == "long":
        # Three copies of the base set, so the drawer has to scroll and the codes reach two digits.
        for rep in range(3):
            for p, title, summary in LONG:
                n[p] = n.get(p, 0) + 1
                rows.append(dict(base, code=f"{p}{n[p]}", prefix=p, n=n[p], title=title, summary=summary))
            for title, opts in QUESTIONS:
                n["Q"] = n.get("Q", 0) + 1
                rows.append(dict(base, code=f"Q{n['Q']}", prefix="Q", n=n["Q"], title=title, summary="",
                                 options=[dict(key=k, text=t) for k, t in opts], rec=f"{opts[0][0]} - the cheaper change."))
    with open(os.path.join(data, "ledger", "demo", f"{sid}.jsonl"), "w") as f:
        f.writelines(json.dumps(r) + "\n" for r in rows)
    with open(os.path.join(data, "answers", f"{sid}.jsonl"), "w") as f:
        if kind == "long":
            f.write(json.dumps(dict(ts=TS, session_id=sid, code="Q2", letter="a", how="code")) + "\n")
            f.write(json.dumps(dict(ts=TS, session_id=sid, code="Q3", letter="x", how="dismissed")) + "\n")
    open(os.path.join(data, f".active-{sid}"), "w").close()


# The seed prompt. With codes on record, the reply cites some so it gets links
# and chips; with none, it must cite nothing, or the ledger would not stay empty.
SEED = {
    "long": ("Reply with exactly this sentence and nothing else: The stale fixture in F1 explains the "
             "failures, AT2 set the timeout per NA1, C1 still holds, and the rest waits on Q1."),
    "empty": "Reply with the single word ok.",
}


# --- a session on its own tmux server ---------------------------------------

class Session:
    def __init__(self, cond, work):
        self.cond, self.work = cond, work
        self.sock = f"kuc-{os.getpid()}-{cond['name']}"
        self.cols = cond["width"]
        self.pos = (self.cols // 2, ROWS // 2)

    def tmux(self, *a):
        return subprocess.run(["tmux", "-L", self.sock, "-f", "/dev/null", *a], capture_output=True, text=True).stdout

    def screen(self):
        return self.tmux("capture-pane", "-t", "k", "-p").split("\n")[:ROWS]

    def start(self):
        # KATHARSIS_DIR moves the link the SessionStart hook writes, which would
        # otherwise repoint ~/.claude/katharsis, and every session's style, here.
        data = os.path.join(self.work, "kdata")
        sid = str(uuid.uuid4())
        write_ledger(data, sid, self.cond["ledger"])
        settings = json.dumps({
            "statusLine": {"type": "command", "command": "true"},
            "outputStyle": "katharsis:Katharsis",
            "theme": self.cond["theme"],
            # The installed plugin would register a second drawer beside this checkout's.
            "enabledPlugins": {"katharsis@openscribbler": False},
        })
        cmd = (f"cd {APP} && clear && COLORTERM=truecolor PATH={REPO}/bin:$PATH KATHARSIS_DATA={data} "
               f"KATHARSIS_DIR={self.work}/katharsis CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 command claude --model {MODEL} --session-id {sid} "
               f"--plugin-dir {REPO} --settings '{settings}'")
        self.tmux("new-session", "-d", "-s", "k", "-x", str(self.cols), "-y", str(ROWS),
                  "-e", "TERM=xterm-256color", cmd)
        for opt in (("mouse", "on"), ("status", "off"), ("focus-events", "on"), ("window-size", "manual"),
                    ("default-terminal", "tmux-256color")):
            self.tmux("set", "-g", *opt)
        self.tmux("set", "-as", "terminal-features", ",*:RGB")
        for _ in range(120):
            time.sleep(0.5)
            text = "\n".join(self.screen())
            if "Yes, I trust this folder" in text:
                # The prompt's default is "No, exit", so move to Yes before confirming.
                if "❯ Yes, I trust" not in text:
                    self.tmux("send-keys", "-t", "k", "Down")
                    continue
                self.tmux("send-keys", "-t", "k", "Enter")
                time.sleep(2)
            elif "Katharsis" in text and "❯" in text:
                break
        else:
            raise RuntimeError("Claude Code never reached its prompt:\n" + text)
        time.sleep(2)
        self.type(SEED[self.cond["ledger"]])
        self.tmux("send-keys", "-t", "k", "Enter")
        if not self.settle(timeout=180, busy=("esc to interrupt",)):
            raise RuntimeError("the seed reply did not finish within 180s:\n" + "\n".join(self.screen()))
        time.sleep(6)  # the drawer reloads the ledger 1.5s and 5s after the turn completes

    def type(self, text):
        self.tmux("send-keys", "-t", "k", "-l", text)
        time.sleep(0.2)

    def settle(self, timeout=15.0, busy=()):
        """Wait until the screen stops changing and shows none of the busy texts."""
        last, same, t0 = None, 0, time.monotonic()
        while time.monotonic() - t0 < timeout:
            time.sleep(0.5)
            now = self.screen()
            if now == last and not any(b in "\n".join(now) for b in busy):
                same += 1
                if same >= 3:
                    return True
            else:
                same = 0
            last = now
        return False

    def find(self, t):
        """A target on screen: (col, row), or a dict with text, and optionally
        band (the band row only), pane (inside the drawer), first (search from
        the top), and dx. Returns 1-based cells, or None."""
        if isinstance(t, tuple):
            return t
        if "rel" in t:
            return (self.pos[0] + t["rel"][0], self.pos[1] + t["rel"][1])
        rows = self.screen()
        order = range(len(rows)) if t.get("first") else range(len(rows) - 1, -1, -1)
        for r in order:
            line = rows[r]
            if t.get("band") and "Katharsis ·" not in line:
                continue
            c = line.find(t["text"])
            if c >= 0:
                return (cells_before(line, c) + 1 + t.get("dx", 0), r + 1)
        return None

    def mouse(self, b, c, r, end="M"):
        self.tmux("send-keys", "-t", "k", "-l", f"\x1b[<{b};{c};{r}{end}")

    def run(self, steps):
        """Run a state's steps; returns the first target that was not on screen."""
        for step in steps:
            kind = step[0]
            if kind == "move":
                dst = self.find(step[1])
                if dst is None:
                    return step[1]
                # Two hops, so the engine sees the pointer arrive rather than appear.
                self.mouse(35, dst[0], max(1, dst[1] - 1))
                time.sleep(0.15)
                self.mouse(35, *dst)
                self.pos = dst
            elif kind == "click":
                self.mouse(0, *self.pos)
                time.sleep(0.08)
                self.mouse(0, *self.pos, end="m")
            elif kind == "type":
                self.type(step[1])
            elif kind == "key":
                self.tmux("send-keys", "-t", "k", step[1])
            elif kind == "scroll":
                for _ in range(abs(step[1])):
                    self.mouse(65 if step[1] > 0 else 64, *self.pos)
                    time.sleep(0.08)
            elif kind == "wait":
                time.sleep(step[1])
            self.settle(timeout=4)
        return None

    def capture(self):
        return self.tmux("capture-pane", "-t", "k", "-p", "-e").split("\n")[:ROWS]

    def stop(self):
        self.tmux("kill-server")


def cells_before(line, index):
    return sum(width(ch) for ch in line[:index])


def width(ch):
    if unicodedata.combining(ch) or ch in "​‍️":
        return 0
    return 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1


# --- states -------------------------------------------------------------------
# Each state: the steps that reach it from the previous one, a pattern for the
# text that proves it was reached (or one per ledger), and whether it needs
# codes on record. A state with no pattern must at least change the screen. States run in
# order within one session, so each starts where the last one left off.

BAND = lambda text, dx=0: {"text": text, "band": True, "dx": dx}
NEUTRAL = [("move", (2, 3))]

STATES = [
    ("reply", "the finished reply: its code links, the Codes this turn row, the Still open row, and the band",
     False, NEUTRAL, {"long": "Codes this turn:", "empty": "● ok"}),
    ("band-hover", "the pointer on the band's F label, revealing its titles",
     True, [("move", BAND("F:"))], None),
    ("chip-hover", "the pointer on a chip under the reply, showing its hover card",
     True, NEUTRAL + [("move", {"text": "F1", "first": False, "chip": True})], "╭"),
    ("drawer", "the drawer, opened with /kdrawer",
     False, NEUTRAL + [("type", "/kdrawer"), ("key", "Enter"), ("wait", 1.5)], "Search:"),
    ("drawer-filter", "the drawer's Filter menu, open",
     False, [("move", {"text": "Filter", "dx": 2}), ("click",)], r"Filter: [^▾▴]*▴"),
    ("drawer-status", "the drawer's Status menu, open",
     False, [("click",), ("move", {"text": "Status", "dx": 2}), ("click",)], r"Status: \w+ ▴"),
    ("drawer-search", "the drawer filtered by the search text 'timeout'",
     True, [("click",), ("move", {"text": "Search:", "dx": 9}), ("click",), ("type", "timeout"), ("wait", 1)], "Search: timeout"),
    ("drawer-card", "the card of AT2, opened by pressing its code in the search results",
     True, [("move", {"text": "▸ AT2 ", "first": True, "dx": 2}), ("click",)], "AT2 · Action taken 2"),
    ("drawer-scroll", "the drawer scrolled down 15 lines",
     True, [("move", {"text": "Clear", "dx": 1}), ("click",), ("wait", 0.5),
            ("move", {"text": "Search:", "dx": 4}), ("move", {"rel": (0, 8)}), ("scroll", 15)], None),
    ("drawer-full", "the drawer's full view",
     True, [("scroll", -15), ("move", {"text": "Show full", "dx": 2}), ("click",), ("wait", 1)], "Show short view"),
    # Escape closes the full view and then the drawer, whichever is open.
    ("still-open", "the drawer opened from the Still open row's show all button, listing only open items",
     True, [("key", "Escape"), ("wait", 0.5), ("key", "Escape"), ("wait", 1),
            ("move", {"text": "show all"}), ("click",), ("wait", 1.5)], "Filter: open ▾"),
]


# --- rendering ----------------------------------------------------------------

THEMES = {
    "dark": dict(bg="#1e1e1e", fg="#d4d4d4", ansi=[
        "#000000", "#cd3131", "#0dbc79", "#e5e510", "#2472c8", "#bc3fbc", "#11a8cd", "#e5e5e5",
        "#666666", "#f14c4c", "#23d18b", "#f5f543", "#3b8eea", "#d670d6", "#29b8db", "#ffffff"]),
    "light": dict(bg="#ffffff", fg="#1f1f1f", ansi=[
        "#000000", "#cd3131", "#00bc00", "#949800", "#0451a5", "#bc05bc", "#0598bc", "#555555",
        "#666666", "#cd3131", "#14ce14", "#b5ba00", "#0451a5", "#bc05bc", "#0598bc", "#a5a5a5"]),
}


def xterm256(n, ansi):
    if n < 16:
        return ansi[n]
    if n < 232:
        n -= 16
        lv = [0, 95, 135, 175, 215, 255]
        return "#%02x%02x%02x" % (lv[n // 36], lv[n // 6 % 6], lv[n % 6])
    v = 8 + (n - 232) * 10
    return "#%02x%02x%02x" % (v, v, v)


def parse(lines, theme):
    """ANSI lines to a grid of cells: (char, fg, bg, bold, dim, italic, underline).
    A wide character's second cell is an empty string."""
    pal = THEMES[theme]["ansi"]
    grid = []
    for line in lines:
        st = dict(fg=None, bg=None, bold=False, dim=False, italic=False, ul=False, rev=False)
        row, i = [], 0
        while i < len(line):
            m = re.match(r"\x1b\[([0-9;:]*)m", line[i:])
            if m:
                ps = []
                for group in (m.group(1) or "0").split(";"):
                    sub = [int(p) if p else 0 for p in group.split(":")]
                    # Colon form keeps a color's parts in one group, with an optional
                    # color-space id before the RGB: 38:2::R:G:B or 38:2:R:G:B.
                    if len(sub) > 1 and sub[0] in (38, 48) and sub[1] == 2:
                        ps += [sub[0], 2] + sub[-3:]
                    elif len(sub) > 1 and sub[0] == 4:
                        ps.append(24 if sub[1] == 0 else 4)
                    else:
                        ps += sub
                j = 0
                while j < len(ps):
                    p = ps[j]
                    if p == 0: st.update(fg=None, bg=None, bold=False, dim=False, italic=False, ul=False, rev=False)
                    elif p == 1: st["bold"] = True
                    elif p == 2: st["dim"] = True
                    elif p == 3: st["italic"] = True
                    elif p == 4: st["ul"] = True
                    elif p == 7: st["rev"] = True
                    elif p == 22: st.update(bold=False, dim=False)
                    elif p == 23: st["italic"] = False
                    elif p == 24: st["ul"] = False
                    elif p == 27: st["rev"] = False
                    elif 30 <= p <= 37: st["fg"] = pal[p - 30]
                    elif 90 <= p <= 97: st["fg"] = pal[p - 82]
                    elif 40 <= p <= 47: st["bg"] = pal[p - 40]
                    elif 100 <= p <= 107: st["bg"] = pal[p - 92]
                    elif p == 39: st["fg"] = None
                    elif p == 49: st["bg"] = None
                    elif p in (38, 48) and j + 1 < len(ps):
                        key = "fg" if p == 38 else "bg"
                        if ps[j + 1] == 5 and j + 2 < len(ps):
                            st[key] = xterm256(ps[j + 2], pal); j += 2
                        elif ps[j + 1] == 2 and j + 4 < len(ps):
                            st[key] = "#%02x%02x%02x" % tuple(ps[j + 2:j + 5]); j += 4
                    j += 1
                i += m.end()
                continue
            m = re.match(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[^\]a-zA-Z][^a-zA-Z]*[a-zA-Z]|\x1b[a-zA-Z]", line[i:])
            if m:  # any other escape, such as a hyperlink, draws nothing
                i += m.end()
                continue
            ch = line[i]
            i += 1
            if ch < " " or ch == "\x7f":
                continue
            w = width(ch)
            if w == 0:
                if row:
                    row[-1] = (row[-1][0] + ch,) + row[-1][1:]
                continue
            fg, bg = st["fg"], st["bg"]
            if st["rev"]:
                fg, bg = bg or "DEFBG", fg or "DEFFG"
            cell = (ch, fg, bg, st["bold"], st["dim"], st["italic"], st["ul"])
            row.append(cell)
            if w == 2:
                row.append(("", fg, bg, False, False, False, False))
        grid.append(row)
    return grid


CW, RH, FS, PAD = 8.4, 17, 14, 10


def svg(grid, cols, theme):
    t = THEMES[theme]
    color = lambda c, dflt: {"DEFBG": t["bg"], "DEFFG": t["fg"]}.get(c, c) if c else dflt
    w, h = int(PAD * 2 + cols * CW), int(PAD * 2 + ROWS * RH)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}">',
           f'<rect width="100%" height="100%" fill="{t["bg"]}"/>',
           f'<g font-family="DejaVu Sans Mono, monospace" font-size="{FS}px" xml:space="preserve">']
    for r, row in enumerate(grid):
        y = PAD + r * RH
        for c, (ch, fg, bg, bold, dim, italic, ul) in enumerate(row[:cols]):
            x = PAD + c * CW
            if bg:
                out.append(f'<rect x="{x:.1f}" y="{y}" width="{CW + 0.5:.1f}" height="{RH}" fill="{color(bg, t["bg"])}"/>')
        # Runs of one style share a text element; every run starts at its own cell.
        c = 0
        while c < min(len(row), cols):
            ch, fg, bg, bold, dim, italic, ul = row[c]
            if ch in ("", " "):
                c += 1
                continue
            style = (fg, bold, dim, italic, ul)
            run, start = "", c
            while c < min(len(row), cols) and (row[c][1], row[c][3], row[c][4], row[c][5], row[c][6]) == style \
                    and row[c][0] != "" and width(row[c][0][0]) == 1 and not is_box(row[c][0]):
                run += row[c][0]
                c += 1
            if not run:  # a wide or box-drawing character, placed on its own
                run, c = row[c][0], c + 1
            attrs = f'fill="{color(fg, t["fg"])}"'
            if bold: attrs += ' font-weight="bold"'
            if dim: attrs += ' fill-opacity="0.55"'
            if italic: attrs += ' font-style="italic"'
            if ul: attrs += ' text-decoration="underline"'
            x = PAD + start * CW
            if len(run) > 1:
                attrs += f' textLength="{len(run) * CW:.1f}" lengthAdjust="spacing"'
            out.append(f'<text x="{x:.1f}" y="{y + RH - 4.5:.1f}" {attrs}>{html.escape(run)}</text>')
    out.append("</g></svg>")
    return "\n".join(out)


def is_box(ch):
    return "─" <= ch[:1] <= "╿"


# --- scripted checks ------------------------------------------------------------
# Each returns (level, message): fail for a defect a script can be sure of,
# warn for one worth a look.

ERRORS = re.compile(r"TypeError|ReferenceError|SyntaxError|is not a function|is not defined|"
                    r"\[object Object\]|\bundefined\b|\bNaN\b|hook error|Error:|Traceback")
CODE_ROW = re.compile(r"[▸▾] ([A-Z][A-Z-]{0,3}\d+)\s+([○✓✗!])\s+(\S)")


def plain(grid):
    return ["".join(c[0] for c in row) for row in grid]


def chars(grid):
    """Per row, one character per cell, with a wide character's second cell as ''."""
    return [[c[0] for c in row] for row in grid]


def check(grid, cols):
    found = []
    text = plain(grid)
    # A wide character's second cell is "", which `in` would match against any
    # border set, so it becomes a character no border set holds.
    g = [[ch or "\0" for ch in row] for row in chars(grid)]
    at = lambda r, c: g[r][c] if 0 <= r < len(g) and 0 <= c < len(g[r]) else " "
    for r, line in enumerate(text):
        m = ERRORS.search(line)
        if m:
            found.append(("fail", f"row {r + 1}: error text on screen: {line.strip()[:90]}"))
    # Boxes: every top-left corner must close into a whole rectangle. A break
    # in an edge is content drawn over the border; a corner with no partner on
    # its row is a box running off the screen.
    for r in range(len(g)):
        for c in range(len(g[r])):
            if g[r][c] not in "╭┌":
                continue
            right = next((k for k in range(c + 1, len(g[r])) if g[r][k] in "╮┐"), None)
            if right is None:
                # Claude Code draws its own [-] collapse control over the top-right
                # of the band's region, so a box there loses its corner to the engine.
                if "".join(g[r]).rstrip().endswith("─[-]"):
                    found.append(("warn", f"row {r + 1}: Claude Code's [-] control covers the top-right corner of the box at col {c + 1}"))
                    right = len("".join(g[r]).rstrip()) - 1
                else:
                    found.append(("fail", f"row {r + 1}, col {c + 1}: a box's top edge runs off the screen"))
                    continue
            top_end = right - 3 if g[r][right] not in "╮┐" else right  # stop short of the [-]
            gap = next((k for k in range(c + 1, top_end) if g[r][k] not in "─━"), None)
            if gap is not None:
                found.append(("fail", f"row {r + 1}: the box at col {c + 1} has its top edge broken by {g[r][gap]!r} at col {gap + 1}"))
                continue
            bottom = r + 1
            while bottom < len(g) and at(bottom, c) in "│┃":
                bottom += 1
            if bottom == len(g):
                found.append(("fail", f"row {r + 1}, col {c + 1}: a box runs past the bottom of the screen"))
                continue
            if at(bottom, c) in "─━":
                found.append(("fail", f"row {r + 1}, col {c + 1}: a box is cut off at row {bottom + 1} by the edge of the box around it"))
                continue
            if at(bottom, c) not in "╰└":
                found.append(("fail", f"row {bottom + 1}: the box from row {r + 1} has its left edge broken by {at(bottom, c)!r}, so content is drawn past it"))
                continue
            if at(bottom, right) not in "╯┘":
                found.append(("fail", f"row {bottom + 1}: the box from row {r + 1} has no bottom-right corner at col {right + 1} (found {at(bottom, right)!r})"))
                continue
            gap = next((k for k in range(c + 1, right) if at(bottom, k) not in "─━"), None)
            if gap is not None:
                found.append(("fail", f"row {bottom + 1}: the box from row {r + 1} has its bottom edge broken by {at(bottom, gap)!r} at col {gap + 1}"))
                continue
            for k in range(r + 1, bottom):
                if at(k, c) not in "│┃" or at(k, right) not in "│┃":
                    side = "left" if at(k, c) not in "│┃" else "right"
                    ch = at(k, c if side == "left" else right)
                    found.append(("fail", f"row {k + 1}: the box from row {r + 1} has its {side} edge broken by {ch!r}, so content is drawn past it"))
                    break
            else:
                for k in range(r + 1, bottom):
                    if at(k, right - 1) not in (" ", "") and at(k, right - 2) not in (" ", "") and not is_box(at(k, right - 1)):
                        found.append(("warn", f"row {k + 1}: text runs into the right edge of the box from row {r + 1}, and may be clipped"))
                        break
    # A row cut short with an ellipsis is a deliberate clip, listed so a reviewer can judge it.
    for r, row in enumerate(g):
        if len(row) >= cols and row[cols - 1] == "…":
            found.append(("info", f"row {r + 1}: text is cut at the screen edge ({text[r].rstrip()[-40:]!r})"))
    # Drawer rows: the code cell fits the widest code, so every status glyph
    # and every title sits the same distance from its row's marker.
    offsets = {}
    for r, line in enumerate(text):
        for m in CODE_ROW.finditer(line):
            key = (cells_before(line, m.start(2)) - cells_before(line, m.start()),
                   cells_before(line, m.start(3)) - cells_before(line, m.start()))
            offsets.setdefault(key, []).append(f"{m.group(1)} (row {r + 1})")
    if len(offsets) > 1:
        detail = "; ".join(f"glyph +{g}, title +{t}: {', '.join(rs[:4])}{'…' if len(rs) > 4 else ''}"
                           for (g, t), rs in sorted(offsets.items()))
        found.append(("fail", f"drawer rows put their glyphs and titles in {len(offsets)} different columns ({detail})"))
    return found


# --- a run --------------------------------------------------------------------

def condition(cond, out, states):
    work = os.path.join(out, "_work", cond["name"])
    os.makedirs(work, exist_ok=True)
    s = Session(cond, work)
    results = []
    try:
        s.start()
        for name, intent, needs_items, steps, expect in states:
            if needs_items and cond["ledger"] == "empty":
                continue
            if any(st[1].get("chip") for st in steps if st[0] == "move" and isinstance(st[1], dict)):
                steps = chip_steps(s, steps)
            before = s.screen()
            missing = s.run(steps)
            settled = s.settle(timeout=5)
            lines = s.capture()
            grid = parse(lines, cond["theme"])
            base = os.path.join(out, f"{cond['name']}--{name}")
            open(base + ".ansi", "w").write("\n".join(lines))
            open(base + ".txt", "w").write("\n".join(plain(grid)))
            open(base + ".svg", "w").write(svg(grid, s.cols, cond["theme"]))
            subprocess.run(["rsvg-convert", "-o", base + ".png", base + ".svg"], check=True)
            os.remove(base + ".svg")
            found = check(grid, s.cols)
            if missing is not None:
                found.insert(0, ("fail", f"state not reached: {missing!r} was not on screen"))
            else:
                if isinstance(expect, dict):
                    expect = expect[cond["ledger"]]
                if expect and not re.search(expect, "\n".join(plain(grid))):
                    found.insert(0, ("fail", f"state not reached: {expect!r} is not on screen"))
                elif not expect and name != "reply" and s.screen() == before:
                    found.insert(0, ("fail", "state not reached: the steps left the screen unchanged"))
            if not settled:
                found.append(("warn", "the screen was still changing 5s after the last step"))
            results.append(dict(image=os.path.basename(base) + ".png", condition=cond["name"], state=name,
                                intent=intent, checks=[dict(level=l, message=m) for l, m in found]))
    except Exception as e:  # one broken condition still leaves the others' images
        results.append(dict(image=None, condition=cond["name"], state="launch", intent="the session starts",
                            checks=[dict(level="fail", message=str(e)[:2000])]))
    finally:
        s.stop()
    return results


def chip_steps(s, steps):
    """A chip is found on the Codes this turn row, below the reply, rather than in its text."""
    rows = s.screen()
    for r in range(len(rows) - 1, -1, -1):
        m = re.search(r"Codes this turn:\s*", rows[r])
        if m:
            return [st if not (st[0] == "move" and isinstance(st[1], dict) and st[1].get("chip"))
                    else ("move", (cells_before(rows[r], m.end()) + 1, r + 1)) for st in steps]
    return steps


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--widths", default="80,120,160")
    ap.add_argument("--themes", default="dark,light")
    ap.add_argument("--ledgers", default="empty,long")
    ap.add_argument("--states", default=",".join(s[0] for s in STATES))
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    for tool in ("tmux", "rsvg-convert", "claude"):
        if not shutil.which(tool):
            sys.exit(f"ui-check needs {tool} on PATH")
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    out = os.path.abspath(a.out or os.path.join(CACHE, "runs", stamp))
    os.makedirs(out, exist_ok=True)
    os.makedirs(APP, exist_ok=True)
    if not os.path.isdir(os.path.join(APP, ".git")):
        subprocess.run("git init -q && git -c user.name=t -c user.email=t@t commit -q --allow-empty -m init",
                       shell=True, cwd=APP, check=True)
    wanted = a.states.split(",")
    states = [s for s in STATES if s[0] in wanted]
    conds = [dict(name=f"w{w}-{t}-{l}", width=int(w), theme=t, ledger=l)
             for w in a.widths.split(",") for t in a.themes.split(",") for l in a.ledgers.split(",")]
    # The first condition runs alone, so a first-run trust prompt is answered once.
    try:
        results = condition(conds[0], out, states)
        with concurrent.futures.ThreadPoolExecutor(max_workers=a.jobs) as ex:
            for r in ex.map(lambda c: condition(c, out, states), conds[1:]):
                results.extend(r)
    finally:
        shutil.rmtree(os.path.join(out, "_work"), ignore_errors=True)
    json.dump(results, open(os.path.join(out, "manifest.json"), "w"), indent=1)
    fails = sum(1 for r in results for c in r["checks"] if c["level"] == "fail")
    warns = sum(1 for r in results for c in r["checks"] if c["level"] == "warn")
    with open(os.path.join(out, "report.md"), "w") as f:
        f.write(f"# UI check, {stamp}\n\n{len(results)} captures, {fails} failed checks, {warns} warnings.\n\n")
        for r in results:
            f.write(f"## {r['condition']} · {r['state']}\n\n{r['intent']}\n\n")
            if r["image"]:
                f.write(f"![{r['state']}]({r['image']})\n\n")
            for c in r["checks"]:
                f.write(f"- **{c['level']}** {c['message']}\n")
            f.write("\n")
    print(f"{len(results)} captures, {fails} failed checks, {warns} warnings")
    print(os.path.join(out, "report.md"))
    sys.exit(1 if fails else 0)


# --- vision review ------------------------------------------------------------

REVIEW = """You are reviewing screenshots of a terminal UI after a code change. The UI is
Katharsis, a Claude Code plugin that draws a band above the prompt, a drawer
panel that lists coded items, code links and chips under replies, and hover
cards. Each screenshot is one state of the UI under one condition (terminal
width, light or dark theme, empty or long ledger).

What the change should look like, in the author's words:
{intent}

{diff}The captures are listed in manifest.json in the current directory. Each entry
names the image, the condition, the state and what it shows, and the checks a
script already ran on the terminal cells. Read manifest.json, then open every
image with the Read tool and look at it.

For each image, judge two things: whether it shows what the author intended,
and whether anything looks broken regardless of intent — text overlapping or
cut off, borders misaligned, colors unreadable against the background, a
missing element, stray characters. Treat a script check marked fail as a claim
to confirm against the image.

Write review.md in the current directory: one line per image,

- PASS|FAIL `<image>` - <one sentence naming what you saw>

with every FAIL first, then a final line counting passes and fails. Write
nothing else to any file."""


def review(out, intent, diff_file=None):
    diff = ""
    if diff_file:
        diff = "The diff under review:\n\n```diff\n" + open(diff_file).read()[:60000] + "\n```\n\n"
    prompt = REVIEW.format(intent=intent, diff=diff)
    settings = json.dumps({"outputStyle": "default"})
    path = os.path.join(out, "review.md")
    if os.path.exists(path):
        os.remove(path)  # a verdict from an earlier review must not stand in for this one
    r = subprocess.run(["claude", "-p", "--model", MODEL, "--settings", settings,
                        "--allowedTools", "Read,Write(review.md)", "--permission-mode", "acceptEdits"],
                       input=prompt, text=True, cwd=out, capture_output=True, timeout=1800)
    if r.returncode != 0 or not os.path.exists(path):
        sys.exit("the review failed or wrote no review.md:\n" + r.stdout[-2000:] + r.stderr[-2000:])
    text = open(path).read()
    print(text)
    images = [m["image"] for m in json.load(open(os.path.join(out, "manifest.json"))) if m["image"]]
    judged = set(re.findall(r"^- (?:PASS|FAIL) `([^`]+)`", text, re.M))
    unjudged = [i for i in images if i not in judged]
    if unjudged:
        sys.exit(f"the review gave no verdict on {len(unjudged)} images: " + ", ".join(unjudged[:10]))
    sys.exit(1 if re.search(r"^- FAIL", text, re.M) else 0)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "review":
        if len(sys.argv) < 4:
            sys.exit('usage: ui-check.py review <out-dir> "<intent>" [<diff-file>]')
        review(os.path.abspath(sys.argv[2]), sys.argv[3], *sys.argv[4:5])
    else:
        main()
