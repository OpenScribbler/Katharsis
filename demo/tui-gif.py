#!/usr/bin/env python3
"""Records one model's side-by-side GIF from the real Claude Code UI.

  tui-gif.py <model-id>           e.g. claude-sonnet-5
  tui-gif.py compose <model-id>   rebuild the GIF from the last recording

Each side runs interactive Claude Code in its own tmux session, isolated HOME,
and copy of sandbox/: the left with Claude Code's defaults, the right with
Katharsis loaded from this checkout. VHS records each side while it answers
each line of prompt.txt as one turn. ffmpeg speeds up each turn's working time
by the same factor on both sides, holds on the replies, and stacks the sides,
and each reply is saved verbatim under captures/<model>/ from the transcript.
Needs tmux, vhs, ffmpeg, ImageMagick, claude logged in, and the Noto Sans
Symbols font, which draws the ⎿ that opens each tool result line.
"""
import glob, json, math, os, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
WORK = os.environ.get("KD_WORK", "/tmp/katharsis-tui-gif")
COLS, ROWS = 80, 88
CW, RH = 8.2, 15.49
FONT, PAD, FPS = 13, 18, 10
TURN = 6  # seconds the slower side's working time takes in each turn, after the speed-up
HOLD = (5, 8)  # seconds on the replies after each turn, and after the last
T = ["tmux", "-L", "kt", "-f", "/dev/null"]
LABEL = {"default": "Claude Code default", "katharsis": "Katharsis"}


def tmux(*a):
    return subprocess.run(T + list(a), capture_output=True, text=True).stdout


def screen(side):
    return tmux("capture-pane", "-t", side, "-p")


def prepare(side, model):
    # One session per server: a second session under window-size manual
    # crashes the tmux server.
    tmux("kill-server")
    time.sleep(0.5)
    home, run = f"{WORK}/home-{side}", f"{WORK}/run-{side}"
    shutil.rmtree(home, ignore_errors=True)
    shutil.rmtree(run, ignore_errors=True)
    os.makedirs(f"{home}/.claude")
    os.symlink(os.path.expanduser("~/.claude/.credentials.json"), f"{home}/.claude/.credentials.json")
    shutil.copytree(f"{HERE}/sandbox", run)
    # Skip first-run screens and startup notices, which a fresh HOME would
    # otherwise show above the prompt. The notice counters come from your own
    # config, so a new announcement you have already dismissed stays hidden.
    mine = json.load(open(os.path.expanduser("~/.claude.json")))
    version = subprocess.run(["claude", "--version"], capture_output=True, text=True).stdout.split()[0]
    json.dump({"hasCompletedOnboarding": True, "theme": "dark", "hasSeenAutoDefaultNotice": True,
               "lastReleaseNotesSeen": version, "announcementImpressions": mine.get("announcementImpressions", {}),
               "seenNotifications": mine.get("seenNotifications", {}),
               "projects": {run: {"hasTrustDialogAccepted": True}}}, open(f"{home}/.claude.json", "w"))
    cmd = f"cd {run} && clear && HOME={home} command claude --model {model} --allowedTools 'Bash Read Grep Glob Edit Write'"
    if side == "katharsis":
        os.makedirs(f"{run}/.claude")
        json.dump({"outputStyle": "katharsis:Katharsis"}, open(f"{run}/.claude/settings.local.json", "w"))
        subprocess.run([f"{REPO}/scripts/setup.sh"], env={**os.environ, "HOME": home},
                       capture_output=True, check=True)
        cmd += f" --plugin-dir {REPO}"
    tmux("new-session", "-d", "-s", side, "-x", str(COLS), "-y", str(ROWS), cmd)
    for opt in (("status", "off"), ("window-size", "manual"), ("focus-events", "on")):
        tmux("set", "-g", *opt)
    for _ in range(60):
        time.sleep(0.5)
        # 2.1.283 dropped "? for shortcuts" from the footer.
        if any(s in screen(side) for s in ("? for shortcuts", "shift+tab to cycle")):
            break
    else:
        sys.exit(f"{side}: Claude Code never became ready:\n{screen(side)}")
    # About 25s after startup, Claude Code shows a "Plugins changed" notice for
    # about 8s. Wait it out so it stays out of the recording.
    shown = False
    for _ in range(60):
        time.sleep(1)
        now = "Plugins changed" in screen(side)
        if shown and not now:
            return
        shown = shown or now


def drive(side):
    """Sends each prompt as a turn, waits for its reply to finish, and detaches,
    which ends the tape. Logs when each turn was sent and finished, in seconds
    from the start of the tape."""
    t0, turns = time.monotonic(), []
    for prompt in open(f"{HERE}/prompt.txt").read().strip().splitlines():
        tmux("send-keys", "-t", side, "-l", prompt)
        time.sleep(0.5)
        sent = time.monotonic() - t0
        tmux("send-keys", "-t", side, "Enter")
        busy, idle = False, 0
        while idle < 4:
            time.sleep(1)
            working = "esc to interrupt" in screen(side)
            busy = busy or working
            idle = idle + 1 if busy and not working else 0
        # The first idle sample, plus half a second for VHS to draw it: the
        # turn ended somewhere in the second before that sample.
        turns.append((sent, time.monotonic() - t0 - 3 + 0.5))
        time.sleep(1)
    json.dump(turns, open(f"{WORK}/{side}.json", "w"))
    tmux("detach-client", "-s", side)


def record(side):
    raw = f"{WORK}/{side}-raw.mp4"
    tmux("bind", "e", "run-shell", "-b", f"{sys.executable} {os.path.abspath(__file__)} drive {side}")
    w, h = math.ceil(2 * PAD + COLS * CW), math.ceil(2 * PAD + ROWS * RH)
    tape = f"{WORK}/{side}.tape"
    open(tape, "w").write(f"""Output "{raw}"
Set Shell bash
Set FontSize {FONT}
Set Width {w + 24}
Set Height {h + 16}
Set Padding {PAD}
Set Framerate {FPS}
Hide
Type "tmux -L kt attach -t {side}"
Enter
Sleep 2s
Show
Ctrl+B
Type "e"
Wait+Screen@1200s /detached/
""")
    subprocess.run(["vhs", tape], check=True, capture_output=True)
    return raw, json.load(open(f"{WORK}/{side}.json"))


def capture(side, model):
    """Each turn's prompt and reply, verbatim, from the transcript: the reply is
    every assistant text block after the turn's last tool result."""
    path = glob.glob(f"{WORK}/home-{side}/.claude/projects/*/*.jsonl")[0]
    turns = []
    for line in open(path):
        row = json.loads(line)
        m = row.get("message", {})
        if m.get("role") == "user" and isinstance(m.get("content"), str) and not row.get("isMeta"):
            turns.append((m["content"], []))
            continue
        for b in m.get("content", []) if isinstance(m.get("content"), list) else []:
            if b.get("type") == "tool_result" and turns:
                turns[-1][1].clear()
            elif m.get("role") == "assistant" and b.get("type") == "text" and turns:
                turns[-1][1].append(b["text"])
    out = f"{HERE}/captures/{model.removeprefix('claude-')}"
    os.makedirs(out, exist_ok=True)
    open(f"{out}/{side}.md", "w").write("\n\n".join(
        f"> {prompt}\n\n" + "\n\n".join(text).strip() for prompt, text in turns) + "\n")


def main(model):
    os.makedirs(WORK, exist_ok=True)
    runs = {}
    for side in ("default", "katharsis"):
        prepare(side, model)
        runs[side] = record(side)
        capture(side, model)
    tmux("kill-server")
    json.dump(runs, open(f"{WORK}/runs.json", "w"))
    compose(model)


def rule(raw):
    """Where the tmux window ends: VHS draws a light rule down its right edge
    and along its bottom, and tmux fills the rows below it with dots."""
    png = f"{WORK}/rule.png"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-sseof", "-1", "-i", raw, "-frames:v", "1",
                    "-vf", "format=gray", "-f", "image2", "-c:v", "pgm", png.replace(".png", ".pgm")], check=True)
    data = open(png.replace(".png", ".pgm"), "rb").read()
    head = data.split(b"\n", 3)
    w, h = map(int, head[1].split())
    px = head[3]
    col = max(range(w // 2, w), key=lambda x: sum(px[y * w + x] > 90 for y in range(h)))
    lines = [y for y in range(h // 2, h) if sum(px[y * w + x] > 90 for x in range(col)) > 0.8 * col]
    return col, lines[-1] + 1


def segments(runs):
    """Cuts each side's tape into the same list of (start, end, speed, length):
    the prompt at real time, then each turn's working time sped up by the same
    factor on both sides, padded to the slower side, and a hold on the replies.
    A turn starts both sides together, so each turn's race is fair while the
    viewer gets time to read every reply."""
    cuts = {side: [] for side in runs}
    n = len(runs["default"][1])
    starts = {side: 0.0 for side in runs}
    for k in range(n):
        spans = {side: t[k][1] - t[k][0] for side, (_, t) in runs.items()}
        speed = max(1.0, max(spans.values()) / TURN)
        work = max(spans.values()) / speed
        for side, (_, t) in runs.items():
            sent, done = t[k]
            cuts[side].append((starts[side], sent + 1, 1.0, 1 + sent - starts[side]))
            cuts[side].append((sent + 1, done, speed, work - 1 / speed + HOLD[k == n - 1]))
            starts[side] = done
    # Both sides get the same length for the prompt, the slower one's, and the
    # faster one waits before typing so both sides send at the same moment.
    for k in range(0, len(cuts["default"]), 2):
        length = max(c[k][3] for c in cuts.values())
        for c in cuts.values():
            c[k] = c[k][:3] + (length, length - c[k][3])
    return cuts


def compose(model):
    runs = json.load(open(f"{WORK}/runs.json"))
    cuts = segments(runs)
    edge, bottom = rule(runs["default"][0])
    # This ffmpeg has no drawtext, so ImageMagick draws each side's label.
    font = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
    parts, inputs = [], []
    for i, side in enumerate(("default", "katharsis")):
        raw = runs[side][0]
        label = f"{WORK}/label-{side}.png"
        subprocess.run(["magick", "-size", f"{edge + PAD}x34", "xc:#171517", "-font", font, "-pointsize", "16",
                        "-fill", "#5fd7af", "-gravity", "center", "-annotate", "+0+2", LABEL[side], label],
                       check=True)
        inputs += ["-i", raw, "-i", label]
        segs = cuts[side]
        parts.append(f"[{2 * i}]split={len(segs)}" + "".join(f"[r{i}_{j}]" for j in range(len(segs))))
        for j, (a, b, speed, length, *lead) in enumerate(segs):
            # Each piece is sped up, then its last frame held to the piece's length.
            # eof_action=pass keeps the last frame of a piece sped past one frame's worth.
            parts.append(f"[r{i}_{j}]trim={a:.2f}:{b:.2f},setpts=(PTS-STARTPTS)/{speed:.3f},"
                         f"fps={FPS}:eof_action=pass,"
                         f"tpad=start_mode=clone:start_duration={lead[0] if lead else 0:.2f}:"
                         f"stop_mode=clone:stop_duration={length:.2f},trim=0:{length:.2f}[c{i}_{j}]")
        parts.append("".join(f"[c{i}_{j}]" for j in range(len(segs))) + f"concat=n={len(segs)}:v=1:a=0,"
                     f"crop={edge}:{bottom}:0:0,pad={edge + PAD}:{bottom}+34:0:34:color=0x171517[v{i}];"
                     f"[v{i}][{2 * i + 1}]overlay=0:0[s{i}]")
    name = model.removeprefix("claude-")
    out = f"{REPO}/demo/media/demo-{name}.gif"
    total = sum(c[3] for c in cuts["default"])
    fc = ";".join(parts) + (f";[s0][s1]hstack=shortest=0,trim=0:{total:.2f},fps={FPS},"
                            # 0.8 scale and 64 colors halve the file; the README draws it narrower anyway.
                            "scale=iw*0.8:-1:flags=lanczos,"
                            "split[a][b];[a]palettegen=stats_mode=diff:max_colors=64[p];[b][p]paletteuse=dither=none")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", fc, out], check=True)
    print(f"{out} {total:.0f}s, speed " + " ".join(f"{c[2]:.0f}x" for c in cuts["default"][1::2]) + ", "
          + " ".join(f"{s}=" + "+".join(f"{d - t:.0f}s" for t, d in turns) for s, (_, turns) in runs.items()))


if __name__ == "__main__":
    if sys.argv[1] == "drive":
        drive(sys.argv[2])
    elif sys.argv[1] == "compose":
        compose(sys.argv[2])
    else:
        main(sys.argv[1])
