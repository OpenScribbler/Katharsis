#!/usr/bin/env python3
"""A/B harness for guidance changes: a fixed prompt set, replied to under a
baseline and a changed style, judged blind in shuffled pairs, and reported
against a bar registered before any reply exists. docs/ab-harness.md walks
through a run.

  ab.py init RUN --prompts FILE --baseline ROOT --changed ROOT --bar WINS/PAIRS [--model M]
  ab.py status RUN
  ab.py blind RUN [--seed N]
  ab.py judge RUN
  ab.py report RUN

ROOT is a plugin root, such as this checkout or a worktree. init snapshots its
output style and guidance files into the run, so a later edit to the root
changes nothing about a run already started. The replies come from subagents
of one interactive session that follow RUN/generate.md, one per brief in
RUN/briefs. Briefs, replies, and snapshots name each side by a label, a or b,
drawn at random; the mapping sits in RUN/run.json. The run keeps the prompt set, the replies, and the verdicts, and no
other message text.

Exit codes: 0 done or the bar is met; 1 not yet (replies missing, the bar not
met); 2 a usage error, with nothing written.
"""
import argparse, json, os, random, re, shutil, sys, tempfile

SIDES = ("baseline", "changed")
MODEL = "opus"
LABELS = ("a", "b")


def die(msg):
    sys.stdout.flush()
    print(f"ab.py: {msg}", file=sys.stderr)
    sys.exit(2)


def load(run, name):
    try:
        return json.load(open(os.path.join(run, name)))
    except FileNotFoundError:
        die(f"{run} has no {name}; start a run with ab.py init")
    except ValueError as e:
        die(f"{os.path.join(run, name)} is not valid JSON: {e}")


def blinded(run):
    """Whether blind finished: key.json appears whole, as its last step. Checks the file without reading it."""
    if not os.path.exists(os.path.join(run, "key.json")):
        die(f"{run} is not blinded yet; run ab.py blind first")


def body(style):
    """The style without its frontmatter."""
    return re.sub(r"\A---\n.*?\n---\n+", "", style, flags=re.S)


BRIEF = """\
You are writing one reply in a test of a reply style. Write the reply exactly as you would send it to the user, \
then save it with the Write tool to:

  {reply}

Save only the reply text. You may read and search files to answer, with Read, Grep, and Glob, but change \
nothing: Write is for the reply file alone, and no other tool is yours. In {run}, read only the style files \
under {side}; everything else there belongs to the test, not to your answer.

The style below is your output style: follow it as if it were your system prompt. Where it tells you to run \
`katharsis-exchange-style.sh <type>`, read `{side}/styles/<type>.md` instead.

<style>
{style}
</style>
{conversation}
<message>
{message}
</message>
"""

GENERATE = """\
Generate the replies for the A/B run in {run}.

For each file in {run}/briefs, spawn one general-purpose subagent with model {model}, whose whole prompt is \
"Read <file> and do exactly what it says.", with the file's path in place of <file>. Run up to 6 at a time. Each subagent writes its own reply file, so write no reply \
yourself and judge none of them.

When every subagent has finished, run `python3 {ab} status {run}`. Re-spawn the subagent for each brief it lists \
as missing, once. Then write the status output to {run}/generated.done.
"""


def init(a):
    run = os.path.abspath(a.run)
    if os.path.exists(run):
        die(f"{run} already exists")
    m = re.fullmatch(r"(\d+)/(\d+)", a.bar)
    if not m or not 1 <= int(m[1]) <= int(m[2]):
        die(f"--bar takes WINS/PAIRS with 1 <= WINS <= PAIRS, got {a.bar}")
    wins, pairs = int(m[1]), int(m[2])
    try:
        prompts = json.load(open(a.prompts))
    except (OSError, ValueError) as e:
        die(f"cannot read the prompt set: {e}")
    if not isinstance(prompts, list):
        die("the prompt set must be a JSON list of prompts")
    seen = set()
    for i, p in enumerate(prompts, 1):
        if not isinstance(p, dict):
            die(f"prompt {i}: must be an object with an id and a message")
        if not isinstance(p.get("message"), str) or not p["message"].strip():
            die(f"prompt {i}: message must be a non-empty string")
        if not isinstance(p.get("context", ""), str):
            die(f"prompt {i}: context must be a string")
        if not isinstance(p.get("id"), str) or not re.fullmatch(r"[a-z0-9-]+", p["id"]):
            die(f"prompt {i}: id must match [a-z0-9-]+, got {p.get('id')!r}")
        if p["id"] in seen:
            die(f"prompt {i}: id {p['id']!r} is repeated")
        seen.add(p["id"])
    if pairs != len(prompts):
        die(f"the bar is out of {pairs} pairs, but the prompt set has {len(prompts)} prompts")
    roots = {"baseline": a.baseline, "changed": a.changed}
    for root in roots.values():
        if not os.path.isfile(os.path.join(root, "output-styles", "katharsis.md")):
            die(f"{root} has no output-styles/katharsis.md")
        if not os.path.isdir(os.path.join(root, "styles")):
            die(f"{root} has no styles/")
    # The generator sees only the label, so no path it reads or writes names its side.
    drawn = random.SystemRandom().sample(LABELS, 2)
    labels = dict(zip(SIDES, drawn))

    # Built beside RUN and renamed into place last, so a failure leaves no partial run.
    tmp = None
    try:
        os.makedirs(os.path.dirname(run), exist_ok=True)
        tmp = tempfile.mkdtemp(dir=os.path.dirname(run), prefix=".ab-init-")
        for d in ("briefs", "replies"):
            os.makedirs(os.path.join(tmp, d))
        for s, root in roots.items():
            snap = os.path.join(run, "sides", labels[s])
            out = os.path.join(tmp, "sides", labels[s])
            shutil.copytree(os.path.join(root, "output-styles"), os.path.join(out, "output-styles"))
            shutil.copytree(os.path.join(root, "styles"), os.path.join(out, "styles"))
            style = body(open(os.path.join(out, "output-styles", "katharsis.md")).read())
            style = style.replace("~/.claude/katharsis/", snap + "/")
            for p in prompts:
                ctx = p.get("context")
                conv = f"\n<conversation>\n{ctx}\n</conversation>\n" if ctx else ""
                name = f"{p['id']}-{labels[s]}"
                open(os.path.join(tmp, "briefs", name + ".md"), "w").write(BRIEF.format(
                    reply=os.path.join(run, "replies", name + ".md"), run=run, side=snap,
                    style=style.strip(), conversation=conv, message=p["message"]))
        json.dump(prompts, open(os.path.join(tmp, "prompts.json"), "w"), indent=1)
        json.dump({"bar": {"wins": wins, "pairs": pairs}, "model": a.model, "labels": labels,
                   "roots": {s: os.path.abspath(r) for s, r in roots.items()}},
                  open(os.path.join(tmp, "run.json"), "w"), indent=1)
        open(os.path.join(tmp, "generate.md"), "w").write(
            GENERATE.format(run=run, model=a.model, ab=os.path.abspath(__file__)))
        os.rename(tmp, run)
    except (OSError, ValueError) as e:
        if tmp:
            shutil.rmtree(tmp, ignore_errors=True)
        die(f"cannot write {run}: {e}")
    print(f"run {run}: {len(prompts)} prompts, {2 * len(prompts)} briefs, bar {wins} of {pairs}")


def missing(run):
    out = []
    for p in load(run, "prompts.json"):
        for l in LABELS:
            f = os.path.join(run, "replies", f"{p['id']}-{l}.md")
            if not os.path.isfile(f) or not open(f).read().strip():
                out.append(f"{p['id']}-{l}")
    return out


def status(a):
    run = os.path.abspath(a.run)
    total = 2 * len(load(run, "prompts.json"))
    gone = missing(run)
    line = f"{total - len(gone)} of {total} replies written"
    print(line + (f"; missing: {' '.join(gone)}" if gone else ""))
    return 1 if gone else 0


def blind(a):
    run = os.path.abspath(a.run)
    prompts = load(run, "prompts.json")
    if os.path.exists(os.path.join(run, "key.json")):
        print(f"{run} is already blinded; the order stays as first drawn")
        return 1
    gone = missing(run)
    if gone:
        whole = len({p["id"] for p in prompts} - {g.rsplit("-", 1)[0] for g in gone})
        print(f"{whole} of {len(prompts)} pairs complete; write the missing replies first: {' '.join(gone)}")
        return 1
    labels = load(run, "run.json")["labels"]
    seed = a.seed if a.seed is not None else random.SystemRandom().randrange(2**32)
    rng = random.Random(seed)
    order = prompts[:]
    rng.shuffle(order)
    pairs = [{"pair": n, "prompt": p["id"], "first": rng.choice(SIDES)} for n, p in enumerate(order, 1)]
    # A blind cut short leaves judge/ without key.json, which appears whole as the last step; start over.
    shutil.rmtree(os.path.join(run, "judge"), ignore_errors=True)
    os.makedirs(os.path.join(run, "judge"))
    for k, p in zip(pairs, order):
        second = SIDES[1 - SIDES.index(k["first"])]
        reply = lambda s: open(os.path.join(run, "replies", f"{p['id']}-{labels[s]}.md")).read().strip()
        conv = f"## Conversation so far\n\n{p['context']}\n\n" if p.get("context") else ""
        open(os.path.join(run, "judge", f"{k['pair']:02d}.md"), "w").write(
            f"# Pair {k['pair']} of {len(pairs)}\n\n{conv}## Message\n\n{p['message']}\n\n"
            f"===== Reply 1 =====\n\n{reply(k['first'])}\n\n===== Reply 2 =====\n\n{reply(second)}\n")
    json.dump({"seed": seed, "pairs": pairs}, open(os.path.join(run, "key.json.tmp"), "w"), indent=1)
    os.replace(os.path.join(run, "key.json.tmp"), os.path.join(run, "key.json"))
    print(f"blinded {len(pairs)} pairs into {os.path.join(run, 'judge')}")


def verdicts(run):
    """The first verdict recorded for each pair. A line cut short by a killed judge is skipped."""
    f = os.path.join(run, "verdicts.jsonl")
    out = {}
    for l in open(f) if os.path.exists(f) else []:
        try:
            v = json.loads(l)
        except ValueError:
            continue
        out.setdefault(v["pair"], v["pick"])
    return out


def judge(a):
    """Shows each unjudged pair from RUN/judge alone; the key is never read here."""
    run = os.path.abspath(a.run)
    blinded(run)
    total = len(load(run, "prompts.json"))
    done = set(verdicts(run))
    log = os.path.join(run, "verdicts.jsonl")
    for n in range(1, total + 1):
        if n in done:
            continue
        try:
            print(open(os.path.join(run, "judge", f"{n:02d}.md")).read())
        except FileNotFoundError:
            die(f"{run}/judge has no {n:02d}.md; the blind output is incomplete")
        pick = None
        try:
            ask = f"Pair {n} of {total}. Better reply: 1, 2, or t for a tie: "
            while pick is None:
                ans = input(ask).strip().lower()
                if not sys.stdin.isatty():
                    print()
                pick = {"1": "1", "2": "2", "t": "tie"}.get(ans)
                if pick is None:
                    print("Answer 1, 2, or t.")
        except EOFError:
            print()
            break
        # A line cut short by a killed judge gets its own line ended first.
        cut = os.path.exists(log) and os.path.getsize(log) and not open(log).read().endswith("\n")
        with open(log, "a") as f:
            f.write(("\n" if cut else "") + json.dumps({"pair": n, "pick": pick}) + "\n")
        done.add(n)
    print(f"{len(done)} of {total} pairs judged")
    return 0 if len(done) == total else 1


def report(a):
    run = os.path.abspath(a.run)
    bar = load(run, "run.json")["bar"]
    blinded(run)
    first = {k["pair"]: k["first"] for k in load(run, "key.json")["pairs"]}
    vs = {n: pick for n, pick in verdicts(run).items() if n in first}
    print(f"{len(vs)} of {len(first)} pairs judged")
    # Counts read between verdicts would unblind the pair just judged, so they wait for the last one.
    if len(vs) < len(first):
        print("result: inconclusive")
        return 1
    wins = losses = ties = 0
    for n, pick in vs.items():
        if pick == "tie":
            ties += 1
        elif (pick == "1") == (first[n] == "changed"):
            wins += 1
        else:
            losses += 1
    met = wins >= bar["wins"]
    print(f"changed side: wins {wins}, losses {losses}, ties {ties}")
    print(f"bar: {bar['wins']} wins of {bar['pairs']}")
    print(f"result: {'pass' if met else 'inconclusive'}")
    return 0 if met else 1


def main():
    ap = argparse.ArgumentParser(prog="ab.py")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("init")
    p.add_argument("run")
    p.add_argument("--prompts", required=True)
    p.add_argument("--baseline", required=True)
    p.add_argument("--changed", required=True)
    p.add_argument("--bar", required=True)
    p.add_argument("--model", default=MODEL)
    sub.add_parser("status").add_argument("run")
    p = sub.add_parser("blind")
    p.add_argument("run")
    p.add_argument("--seed", type=int)
    sub.add_parser("judge").add_argument("run")
    sub.add_parser("report").add_argument("run")
    a = ap.parse_args()
    sys.exit({"init": init, "status": status, "blind": blind, "judge": judge, "report": report}[a.cmd](a) or 0)


if __name__ == "__main__":
    main()
