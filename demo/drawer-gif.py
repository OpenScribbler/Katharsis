#!/usr/bin/env python3
"""Records a drawer GIF from the real Claude Code UI.

  drawer-gif.py seed              one-time: a demo session with one coded reply
  drawer-gif.py seed <ledger>     the same over a real session's ledger, for the session GIF
  drawer-gif.py record <name>     launch, record with VHS, draw the pointer

The session runs in tmux on its own server (-L kd). VHS records a terminal
attached to it, and a tmux key binding starts `drive`, which sends the scene's
keys and SGR mouse events and logs where the pointer was. ffmpeg then draws a
pointer onto each frame from that log, since the terminal has none of its own.
Needs tmux, vhs, ffmpeg, ImageMagick, and claude; the plugin loads from this checkout.
"""
import json, math, os, subprocess, sys, time, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("KD_WORK", "/tmp/katharsis-drawer-gif")
APP = "/tmp/demo-app"  # a short path for the header; the folder must be trusted once
DATA = f"{WORK}/kdata"
COLS, ROWS = 140, 40
FONT, PAD = 13, 18
CW, RH = 8.2, 15.49  # px per cell at FontSize 13, measured from a recorded frame
FPS = 15
T = ["tmux", "-L", "kd", "-f", "/dev/null"]


def tmux(*a, **kw):
    return subprocess.run(T + list(a), check=False, capture_output=True, text=True, **kw).stdout


def screen():
    return tmux("capture-pane", "-t", "kd", "-p").split("\n")


def launch(extra=()):
    tmux("kill-server")
    time.sleep(0.5)
    sid = open(f"{WORK}/sid").read().strip()
    settings = json.dumps({"statusLine": {"type": "command", "command": "true"}})
    # The repo's plugin and kref rather than the installed ones, so a GIF shows this checkout.
    cmd = (f"cd {APP} && clear && PATH={os.path.dirname(HERE)}/bin:$PATH KATHARSIS_DATA={DATA} CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 "
           f"command claude {' '.join(extra)} --plugin-dir {os.path.dirname(HERE)} --settings '{settings}'")
    if not extra:
        cmd += f" --resume {sid}"
    tmux("new-session", "-d", "-s", "kd", "-x", str(COLS), "-y", str(ROWS), cmd)
    for opt in (("mouse", "on"), ("status", "off"), ("focus-events", "on"), ("window-size", "manual")):
        tmux("set", "-g", *opt)
    for _ in range(60):
        time.sleep(0.5)
        if any("Katharsis ·" in l for l in screen()):
            time.sleep(1.5)
            if not extra:
                redraw()
            return
    sys.exit("the band never appeared:\n" + "\n".join(screen()))


def redraw():
    """A resumed reply draws before the ledger loads, so it has no code links
    or chips until a full redraw. Opening and closing the pane forces one."""
    tmux("send-keys", "-t", "kd", "-l", "/kdrawer")
    time.sleep(0.4)
    tmux("send-keys", "-t", "kd", "Enter")
    time.sleep(2)
    c, r = find({"text": "✕", "right": True}, None)
    for seq in (f"<35;{c};{r}M", f"<0;{c};{r}M", f"<0;{c};{r}m"):
        tmux("send-keys", "-t", "kd", "-l", "\x1b[" + seq)
        time.sleep(0.2)
    time.sleep(1.5)


def seed(ledger=None):
    os.makedirs(APP, exist_ok=True)
    subprocess.run(["rm", "-rf", DATA])
    os.makedirs(WORK, exist_ok=True)
    sid = str(uuid.uuid4())
    open(f"{WORK}/sid", "w").write(sid)
    subprocess.run([sys.executable, f"{HERE}/mkledger.py", DATA, sid] + ([ledger] if ledger else []), check=True)
    launch(("--session-id", sid))
    prompt = "session-seed.txt" if ledger else "drawer-seed.txt"
    tmux("send-keys", "-t", "kd", "-l", open(f"{HERE}/{prompt}").read().strip())
    time.sleep(0.5)
    tmux("send-keys", "-t", "kd", "Enter")
    for _ in range(240):
        time.sleep(0.5)
        if any(l.strip().startswith("codes:") for l in screen()):
            break
    time.sleep(3)
    tmux("kill-server")
    print(f"seeded {sid}")


# --- scenes ---------------------------------------------------------------
# Each step: ("wait", s) | ("move", target, s) | ("click",) | ("type", text)
# | ("key", name) | ("scroll", lines), negative for up. A target is (col, row), 1-based, or a text to find on
# screen: {"text": ..., "right": bool, "first": bool, "dx": cells}, or a
# step from the pointer: {"rel": (dcol, drow)}.

BAND = lambda text, dx=0: {"text": text, "band": True, "dx": dx}

SCENES = {
    # One label, reached from above so the pointer crosses no other label on
    # the way, then its list-all press. The hover scene covers title presses.
    "band": [
        ("wait", 1.5),
        ("move", BAND("NA:2"), 1.4),
        ("wait", 2.5),
        ("click",),
        ("wait", 3.5),
    ],
    "hover": [
        ("wait", 1.0),
        ("move", BAND("F:3"), 1.0),
        ("wait", 1.5),
        ("move", BAND("C:1"), 0.5),
        ("wait", 0.8),
        ("move", BAND("AT:3"), 0.5),
        ("wait", 1.5),
        ("move", {"rel": (0, -3)}, 0.5),
        ("move", {"text": "Set the client timeout", "dx": 6}, 0.7),
        ("wait", 0.6),
        ("click",),
        ("wait", 3.5),
    ],
    "drawer": [
        ("wait", 0.8),
        ("move", BAND("open", 1), 0.9),
        ("wait", 0.4),
        ("click",),
        ("wait", 1.5),
        ("move", {"text": "Search:", "right": True, "dx": 10}, 0.7),
        ("click",),
        ("wait", 0.4),
        ("type", "timeout"),
        ("wait", 2.0),
        ("move", {"text": "Clear", "right": True, "dx": 2}, 0.7),
        ("wait", 0.3),
        ("click",),
        ("wait", 1.2),
        ("move", {"text": "Filter", "right": True, "dx": 3}, 0.6),
        ("wait", 0.3),
        ("click",),
        ("wait", 1.5),
        ("move", {"text": "Next actions", "right": True, "dx": 3, "first": True}, 0.7),
        ("wait", 0.3),
        ("click",),
        ("wait", 1.5),
        ("move", {"text": "Show full", "right": True, "dx": 3}, 0.7),
        ("wait", 0.3),
        ("click",),
        ("wait", 3.0),
    ],
    # Deep in a long session: a chip recalls an earlier caveat, the
    # drawer searches and filters 225 items, and kref fetches a day-one finding.
    "session": [
        ("wait", 1.5),
        ("move", {"text": "codes:", "dx": 8}, 1.0),
        ("move", {"text": "C21"}, 0.6),
        ("wait", 2.5),
        ("move", BAND("Q:"), 1.0),
        ("wait", 2.5),
        ("move", BAND("open", 1), 0.8),
        ("wait", 0.3),
        ("click",),
        ("wait", 1.5),
        ("move", {"text": "Findings (F)", "right": True, "dx": 12}, 0.7),
        ("scroll", 12),
        ("wait", 0.8),
        ("scroll", -12),
        ("wait", 0.5),
        ("move", {"text": "Search:", "right": True, "dx": 10}, 0.7),
        ("click",),
        ("wait", 0.4),
        ("type", "drift"),
        ("wait", 2.5),
        ("move", {"text": "Clear", "right": True, "dx": 2}, 0.7),
        ("click",),
        ("wait", 1.0),
        ("move", {"text": "Filter", "right": True, "dx": 3}, 0.6),
        ("click",),
        ("wait", 1.2),
        ("move", {"text": "Questions", "right": True, "dx": 3, "first": True}, 0.7),
        ("click",),
        ("wait", 2.5),
        ("move", {"text": "✕", "right": True}, 0.8),
        ("click",),
        ("wait", 1.0),
        ("type", "!"),
        ("type", "kref F100"),
        ("key", "Enter"),
        ("wait", 3.5),
        ("type", "!"),
        ("type", "kref -n"),
        ("key", "Enter"),
        ("wait", 3.5),
    ],
    "chips": [
        ("wait", 1.0),
        ("move", {"text": "codes:", "dx": 10}, 1.0),
        ("wait", 2.5),
        ("move", {"text": "codes:", "dx": 18}, 0.5),
        ("wait", 2.5),
        ("move", {"text": "AT2 -", "first": True, "dx": 1}, 0.9),
        ("wait", 0.6),
        ("click",),
        ("wait", 3.5),
    ],
}


def find(t, pos):
    if isinstance(t, tuple):
        return t
    if "rel" in t:
        return (pos[0] + t["rel"][0], pos[1] + t["rel"][1])
    rows = screen()
    order = range(len(rows)) if t.get("first") else range(len(rows) - 1, -1, -1)
    for r in order:
        line = rows[r]
        if t.get("band") and "Katharsis ·" not in line:
            continue
        lo = line.find("│") + 1 if t.get("right") else 0  # the pane divider
        c = line.find(t["text"], lo)
        if c >= 0 and (t.get("right") or "│" not in line[:c] or not t.get("band")):
            return (c + 1 + t.get("dx", 0), r + 1)
    sys.exit(f"not on screen: {t}\n" + "\n".join(rows))


def ease(s):
    return s * s * (3 - 2 * s)


def drive(name):
    t0 = time.monotonic()
    now = lambda: time.monotonic() - t0
    pos = (COLS // 2, ROWS // 2 - 6)
    log = {"start": list(pos), "moves": [], "clicks": []}
    mouse = lambda b, c, r, end="M": tmux("send-keys", "-t", "kd", "-l", f"\x1b[<{b};{c};{r}{end}")
    for step in SCENES[name]:
        kind = step[0]
        if kind == "wait":
            time.sleep(step[1])
        elif kind == "move":
            dst, dur = find(step[1], pos), step[2]
            a, last = now(), None
            while True:
                s = min(1.0, (now() - a) / dur)
                e = ease(s)
                cell = (round(pos[0] + (dst[0] - pos[0]) * e), round(pos[1] + (dst[1] - pos[1]) * e))
                if cell != last:
                    mouse(35, *cell)
                    last = cell
                if s >= 1:
                    break
                time.sleep(0.03)
            log["moves"].append([a, a + dur, list(pos), list(dst)])
            pos = dst
        elif kind == "click":
            log["clicks"].append(now())
            mouse(0, *pos)
            time.sleep(0.08)
            mouse(0, *pos, end="m")
        elif kind == "type":
            for ch in step[1]:
                tmux("send-keys", "-t", "kd", "-l", ch)
                time.sleep(0.09)
        elif kind == "key":
            tmux("send-keys", "-t", "kd", step[1])
        elif kind == "scroll":
            for _ in range(abs(step[1])):
                mouse(65 if step[1] > 0 else 64, *pos)
                time.sleep(0.12)
    log["end"] = now()
    json.dump(log, open(f"{WORK}/{name}.json", "w"))


# --- recording ------------------------------------------------------------

def px(cell):
    return PAD + (cell[0] - 0.5) * CW, PAD + (cell[1] - 0.5) * RH


def expr(log, axis, offset):
    """A piecewise ffmpeg expression for the pointer's x or y over time."""
    moves = log["moves"]
    out = str(round(px(moves[-1][3] if moves else log["start"])[axis]))
    for a, b, p, q in reversed(moves):
        a, b = a + offset, b + offset
        v0, v1 = px(p)[axis], px(q)[axis]
        s = f"(clip((t-{a:.3f})/{b - a:.3f},0,1))"
        glide = f"{v0:.1f}+({v1 - v0:.1f})*{s}*{s}*(3-2*{s})"
        out = f"if(lt(t,{a:.3f}),{round(v0)},if(lt(t,{b:.3f}),{glide},{out}))"
    return out


def pointer_images():
    arrow, ring = f"{WORK}/arrow.png", f"{WORK}/ring.png"
    if not os.path.exists(arrow):
        subprocess.run(["magick", "-size", "16x22", "xc:none", "-fill", "white", "-stroke", "black",
                        "-strokewidth", "1.2", "-draw",
                        "polygon 1,1 1,17 5,13 8,20 10.5,19 7.5,12 13,12", arrow], check=True)
        subprocess.run(["magick", "-size", "26x26", "xc:none", "-fill", "none", "-stroke", "#5fd7af",
                        "-strokewidth", "2", "-draw", "circle 13,13 13,3", ring], check=True)
    return arrow, ring


def record(name, offset=0.15):
    launch()
    raw, log_path = f"{WORK}/{name}-raw.gif", f"{WORK}/{name}.json"
    if os.path.exists(log_path):
        os.remove(log_path)
    tmux("bind", "e", "run-shell", "-b", f"{sys.executable} {os.path.abspath(__file__)} drive {name}")
    secs = sum(s[1] if s[0] == "wait" else s[2] if s[0] == "move" else
               0.09 * len(s[1]) if s[0] == "type" else 0.12 * abs(s[1]) if s[0] == "scroll" else 0.1 for s in SCENES[name]) + 1.5
    w, h = math.ceil(2 * PAD + COLS * CW), math.ceil(2 * PAD + ROWS * RH)
    tape = f"{WORK}/{name}.tape"
    open(tape, "w").write(f"""Output "{raw}"
Set Shell bash
Set FontSize {FONT}
Set Width {w + 24}
Set Height {h + 16}
Set Padding {PAD}
Set Framerate {FPS}
Set TypingSpeed 10ms
Hide
Type "tmux -L kd attach -t kd"
Enter
Sleep 2s
Show
Ctrl+B
Type "e"
Sleep {secs:.1f}s
""")
    subprocess.run(["vhs", tape], check=True, capture_output=True)
    log = json.load(open(log_path))
    arrow, ring = pointer_images()
    x, y = expr(log, 0, offset), expr(log, 1, offset)
    rings = "+".join(f"between(t,{c + offset:.3f},{c + offset + 0.3:.3f})" for c in log["clicks"]) or "0"
    edge = int(PAD + COLS * CW) - 1  # VHS draws a rule where the tmux client ends
    out = os.path.join(HERE, "media", "session.gif" if name == "session" else f"drawer-{name}.gif")
    fc = (f"[0][2]overlay=x='({x})-13':y='({y})-13':enable='{rings}':eval=frame[r];"
          f"[r][1]overlay=x='{x}':y='{y}':eval=frame,crop={edge}:{h}:0:0,"
          f"pad={edge + PAD}:{h}:0:0:color=0x171517,"
          f"split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-i", arrow, "-i", ring,
                    "-filter_complex", fc, out], check=True)
    tmux("kill-server")
    print(out)


if __name__ == "__main__":
    cmd = sys.argv[1]
    {"seed": lambda: seed(*sys.argv[2:3]), "drive": lambda: drive(sys.argv[2]),
     "record": lambda: record(sys.argv[2])}[cmd]()
