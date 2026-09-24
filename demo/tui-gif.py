#!/usr/bin/env python3
"""Records one model's side-by-side GIF from the real Claude Code UI.

  tui-gif.py <model-id>           e.g. claude-sonnet-5
  tui-gif.py compose <model-id>   rebuild the GIF from the last recording

Each side runs interactive Claude Code in its own tmux session, isolated HOME,
and copy of sandbox/: the left with Claude Code's defaults, the right with
Katharsis loaded from this checkout. VHS records each side while it answers
prompt.txt, ffmpeg speeds both up by the same factor and stacks them, and each
reply is saved verbatim under captures/<model>/ from the session transcript.
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
LONGEST = 30  # seconds the slower side takes after the speed-up
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
    # Skip first-run screens, which a fresh HOME would otherwise show.
    json.dump({"hasCompletedOnboarding": True, "theme": "dark",
               "projects": {run: {"hasTrustDialogAccepted": True}}}, open(f"{home}/.claude.json", "w"))
    cmd = f"cd {run} && clear && HOME={home} command claude --model {model} --allowedTools 'Bash Read Grep Glob Edit Write'"
    if side == "katharsis":
        os.makedirs(f"{run}/.claude")
        json.dump({"outputStyle": "katharsis:Katharsis"}, open(f"{run}/.claude/settings.local.json", "w"))
        subprocess.run([f"{REPO}/scripts/setup.sh"], env={**os.environ, "HOME": home},
                       capture_output=True, check=True)
        cmd += f" --plugin-dir {REPO}"
    tmux("new-session", "-d", "-s", side, "-x", str(COLS), "-y", str(ROWS), cmd)
    for opt in (("status", "off"), ("window-size", "manual")):
        tmux("set", "-g", *opt)
    for _ in range(60):
        time.sleep(0.5)
        if "? for shortcuts" in screen(side):
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
    """Sends the prompt, waits for the reply to finish, and detaches, which ends
    the tape. Logs when the reply finished, relative to the prompt."""
    prompt = open(f"{HERE}/prompt.txt").read().strip()
    tmux("send-keys", "-t", side, "-l", prompt)
    time.sleep(0.5)
    t0 = time.monotonic()
    tmux("send-keys", "-t", side, "Enter")
    busy, idle = False, 0
    while idle < 4:
        time.sleep(1)
        working = "esc to interrupt" in screen(side)
        busy = busy or working
        idle = idle + 1 if busy and not working else 0
    done = time.monotonic() - t0 - 4
    json.dump({"done": done}, open(f"{WORK}/{side}.json", "w"))
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
    return raw, json.load(open(f"{WORK}/{side}.json"))["done"]


def capture(side, model):
    """The reply text, verbatim, from the transcript: every assistant text block
    after the last tool result."""
    path = glob.glob(f"{WORK}/home-{side}/.claude/projects/*/*.jsonl")[0]
    text = []
    for line in open(path):
        m = json.loads(line).get("message", {})
        for b in m.get("content", []) if isinstance(m.get("content"), list) else []:
            if b.get("type") == "tool_result":
                text = []
            elif m.get("role") == "assistant" and b.get("type") == "text":
                text.append(b["text"])
    out = f"{HERE}/captures/{model.removeprefix('claude-')}"
    os.makedirs(out, exist_ok=True)
    open(f"{out}/{side}.md", "w").write("\n\n".join(text).strip() + "\n")


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


def compose(model):
    runs = json.load(open(f"{WORK}/runs.json"))
    # The same speed-up for both sides, so their relative pace stays true.
    speed = max(1.0, max(d for _, d in runs.values()) / LONGEST)
    edge, bottom = rule(runs["default"][0])
    # This ffmpeg has no drawtext, so ImageMagick draws each side's label.
    font = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
    parts, inputs = [], []
    for i, side in enumerate(("default", "katharsis")):
        raw, done = runs[side]
        label = f"{WORK}/label-{side}.png"
        subprocess.run(["magick", "-size", f"{edge + PAD}x34", "xc:#171517", "-font", font, "-pointsize", "16",
                        "-fill", "#5fd7af", "-gravity", "center", "-annotate", "+0+2", LABEL[side], label],
                       check=True)
        inputs += ["-i", raw, "-i", label]
        # 2s of the prompt before the speed-up starts, then the answer.
        parts.append(f"[{2 * i}]trim=0:{2 + done + 1:.2f},setpts='if(lt(T,2),PTS,2/TB+(PTS-2/TB)/{speed:.3f})',"
                     f"crop={edge}:{bottom}:0:0,pad={edge + PAD}:{bottom}+34:0:34:color=0x171517[v{i}];"
                     f"[v{i}][{2 * i + 1}]overlay=0:0,tpad=stop_mode=clone:stop_duration=60[s{i}]")
    name = model.removeprefix("claude-")
    out = f"{REPO}/docs/media/demo-{name}.gif"
    fc = ";".join(parts) + (";[s0][s1]hstack=shortest=0,trim=0:"
                            f"{2 + max(d for _, d in runs.values()) / speed + 5:.2f},fps={FPS},"
                            "split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", fc, out], check=True)
    print(f"{out} speed={speed:.1f}x " + " ".join(f"{s}={d:.0f}s" for s, (_, d) in runs.items()))


if __name__ == "__main__":
    if sys.argv[1] == "drive":
        drive(sys.argv[2])
    elif sys.argv[1] == "compose":
        compose(sys.argv[2])
    else:
        main(sys.argv[1])
