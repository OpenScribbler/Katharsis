# The A/B harness

A guidance change ships only after it clears a bar fixed before the run. `tests/ab.py` runs the
comparison: a fixed prompt set, one reply per prompt under the baseline style and one under the
changed style, the pairs judged blind in a shuffled order, and a report of wins against the bar.

## A run, step by step

1. **Write the prompt set.** A JSON list of prompts, each with an `id` (lowercase letters, digits,
   and hyphens) and a `message`, plus an optional `context` that stands for the conversation before
   the message. Every prompt must be answerable without doing work, because a generating
   subagent may read and search files but changes nothing: a work request needs a `context` that
   holds the work's results, or the replies describe edits that never happened. `tests/ab-dry-run.json` is a small example.
2. **Register the bar and start the run.** The bar is `WINS/PAIRS`, and `PAIRS` must equal the
   number of prompts:

   ```
   python3 tests/ab.py init RUN --prompts set.json --baseline ../katharsis --changed . --bar 20/30
   ```

   Each side is a plugin root, such as `main` and a worktree. `init` copies each side's
   `output-styles/` and `styles/` into `RUN/sides/`, so editing a worktree after `init` changes
   nothing about the run. It writes one brief per prompt per side into `RUN/briefs/`, and the
   generator's instructions into `RUN/generate.md`. The bar sits in `RUN/run.json`, and no command
   changes it.
3. **Generate the replies.** Start one interactive Claude Code session, on bigbiscuit for a long
   run, and give it `RUN/generate.md`. It spawns a subagent per brief, and each subagent writes its
   reply to `RUN/replies/`. `python3 tests/ab.py status RUN` lists the replies still missing.
4. **Shuffle.** `python3 tests/ab.py blind RUN` shuffles the pair order and which side shows
   first in each pair, writes `RUN/judge/NN.md` for each pair, and keeps the mapping in
   `RUN/key.json`. It refuses a second shuffle, so the order stays as first drawn.
5. **Judge.** `python3 tests/ab.py judge RUN` shows each pair from `RUN/judge/` and records `1`,
   `2`, or `t` for a tie in `RUN/verdicts.jsonl`. It never reads the key. Stop at any point with
   end of input (`Ctrl-D`), and the next `judge` resumes at the first unjudged pair. To read a pair
   somewhere else, open `RUN/judge/NN.md`, and never `RUN/key.json` or `RUN/replies/`.
6. **Report.** `python3 tests/ab.py report RUN` unblinds the verdicts and prints the changed
   side's wins, losses, and ties against the bar. It exits 0 on `result: pass` and 1 on
   `result: inconclusive`, which includes a run with pairs still unjudged. An inconclusive run
   blocks the change.

## What the replies stand for

Each reply comes from a subagent that is handed the side's style as text and told to follow it as
its system prompt, and to read the side's guidance file where the style says to run the routing
script. That reproduces the style and the guidance files. It leaves out the hooks: no prompt-hook
context, no stamp, no Stop-hook hold. A change that works through a hook needs a live session to
test, and the harness does not reach it.

A subagent also loads what any session in its working directory loads: the project's instruction
files and the parent session's git snapshot. Both sides get the same, so the comparison holds, but
a reply can cite them. Start the generating session in a directory whose instruction files you
want the replies to see.

## What a run keeps

The prompt set, the two snapshots, the briefs, the replies, the key, and the verdicts. A run
holds no message text outside its prompt set. Keep each run directory outside the repo, and cite
it in the PR that the run decides.
