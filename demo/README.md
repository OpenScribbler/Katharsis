# Demo

Everything behind the GIFs in the README. Each `media/demo-<model>.gif` records the real
Claude Code interface twice, side by side: one Claude model answering the same two-turn
exchange under Claude Code's defaults, left, and under Katharsis, right. The user asks whether
to change the code or the tests over a rounding rule finance never confirmed, then says "go with
what you recommend". `media/session.gif`
records the drawer and `kref` over the ledger of a four-day session.

Every reply the side-by-side GIFs show is stored verbatim in `captures/`.

Nothing here is part of the plugin. `claude plugin validate` ignores it, and an installer never
receives it.

| File | What it is |
|---|---|
| `prompt.txt` | The prompts both sides answered, word for word, one turn per line |
| `sandbox/` | The repo both sides worked in: an order-pricing package whose tests expect a different rounding rule than its code uses, and a slow retry suite |
| `tui-gif.py` | Records one model's side-by-side GIF and saves both replies under `captures/<model>/` |
| `captures/<model>/` | Both replies from one model, as `default.md` and `katharsis.md`, for `sonnet-5`, `opus-5`, `opus-5-5`, `fable-5`, and `fable-5-1` |
| `drawer-gif.py` | Records the four `media/drawer-*.gif` files and `session.gif` from a live Claude Code session in tmux |
| `mkledger.py` | Writes the curated ledger the drawer GIFs show, or imports a real session's ledger for the session GIF |
| `drawer-seed.txt` | The prompt that gives the drawer session a reply with links and chips |
| `session-seed.txt` | The prompt that gives the session GIF its reply, reusing codes from the imported ledger |

## Recording the side-by-side GIFs

`tui-gif.py` needs `tmux`, `vhs`, `ffmpeg`, ImageMagick 7 (`magick`), and a logged-in `claude`.
Pass the model ID, and run from the repo root:

```
python3 demo/tui-gif.py claude-sonnet-5
python3 demo/tui-gif.py compose claude-sonnet-5   # rebuild the GIF from the last recording
```

Each side runs interactive Claude Code in tmux with an isolated `HOME` and its own copy of
`sandbox/`. The `HOME` carries no memory file, no plugins, and no settings, so the left side is
a genuine baseline, and it links your credentials rather than copying them. The right side
loads Katharsis from this checkout and picks the style in the project's
`.claude/settings.local.json`, the way `/config` does. Both sides may run Bash, Read, Grep, Glob,
Edit, and Write without asking, so no permission prompt stalls a recording.

The script sends each line of `prompt.txt` as a turn and waits for the reply to finish before
sending the next. VHS records each side, and ffmpeg cuts both recordings at the same points:
each turn starts on both sides together, its working time is sped up by the same factor on both
sides so the slower side takes 6 seconds, the faster side waits on its finished reply, and both
replies then hold for 5 seconds, or 8 after the last turn. The fresh `HOME` marks Claude Code's
startup notices as seen, using the counters in your own `~/.claude.json`, so no announcement
covers the prompt. The stored captures came from Claude Code 2.1.283 and Katharsis 0.6.0 with
the unreleased changes on main, on 2026-09-27. A rerun gives different words, because the model
is not deterministic.

## Recording the drawer GIFs

The `drawer-*.gif` files record the real Claude Code interface with the plugin loaded from this
checkout. `drawer-gif.py` runs Claude Code in a 140x40 tmux session in `/tmp/demo-app`, and it
sends mouse events to the band, the drawer, and the reply. VHS records the tmux client, and ffmpeg
draws a pointer over the recording from the script's own log of those events.

The script needs `tmux`, `vhs`, `ffmpeg`, ImageMagick 7 (`magick`), and the Noto Sans Symbols 2
font, which draws the `⏵` glyph in Claude Code's footer. Before the first run, create `/tmp/demo-app`, start `claude` there once,
and accept the folder trust prompt.

`seed` starts a new session over a curated ledger and sends `drawer-seed.txt`, which costs one
model reply. Each `record` resumes that session and records one scene. Run from the repo root:

```
python3 demo/drawer-gif.py seed
python3 demo/drawer-gif.py record band     # also hover, drawer, chips
```

`KD_WORK` sets the scratch directory, which defaults to `/tmp/katharsis-drawer-gif`. The ledger
rows carry a 2030 timestamp so that their titles win over the titles the seed reply records.

## Recording the session GIF

The session GIF uses the same script over a real ledger: the merged ledgers of one session chain
on this repo, from 2026-09-05 to 2026-09-09. `mkledger.py` rewrites every row to the demo
session and drops each row that names a bead ID. The ledger file is not in the repo, because it
is the author's own session record. Use a separate `KD_WORK`, so the drawer session survives:

```
KD_WORK=/tmp/katharsis-session-gif python3 demo/drawer-gif.py seed <ledger.jsonl>
KD_WORK=/tmp/katharsis-session-gif python3 demo/drawer-gif.py record session
```

The scene runs `! kref` twice, and each run adds a turn to the session. Copy the session's
transcript and `kdata` after seeding, and restore both before each new take.
