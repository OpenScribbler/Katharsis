# Demo

Everything behind the two GIFs at the top of the README. `docs/media/demo.gif` is the
side-by-side output demo, interpreted by [docs/evals/ci-triage.md](../docs/evals/ci-triage.md),
and the two replies it replays are stored verbatim in
[docs/evals/captures/](../docs/evals/captures). `docs/media/setup.gif` replays one
`katharsis-setup` run, measured by [docs/evals/setup-skill.md](../docs/evals/setup-skill.md),
whose captures hold that run's three turns unedited alongside the same three prompts answered
with the rules loaded.

Nothing here is part of the plugin. `claude plugin validate` ignores it, and an installer never
receives it.

| File | What it is |
|---|---|
| `prompt.txt` | The prompt both CI-triage runs answered, word for word |
| `prompt-ci.txt` | The same prompt trimmed to four lines, prepended to each replay file |
| `sandbox/` | The repo both runs worked in: an order-pricing package with a rounding bug and a slow retry suite |
| `player.sh` | Replays a captured reply into a terminal at a fixed line rate, with light colouring |
| `capture-setup.txt` | The abridged setup run the setup GIF replays |
| `tape-off.tape`, `tape-on.tape`, `tape-setup.tape` | [VHS](https://github.com/charmbracelet/vhs) tapes, one pane each |

## Reproducing the captures

The rules-off run has to be a genuine baseline, so it runs under an isolated `HOME` that carries
no memory file and no plugins. Link your credentials into it rather than copying them, so the
secret stays in one place with its own permissions:

```
mkdir -p /tmp/demo-home/.claude
ln -s "$HOME/.claude/.credentials.json" /tmp/demo-home/.claude/.credentials.json
```

Then run both sides against the sandbox:

```
cd demo/sandbox
HOME=/tmp/demo-home claude -p "$(cat ../prompt.txt)" --model opus \
  --allowedTools "Bash Read Grep Glob" > /tmp/rules-off.md

cat ../../dist/rules/*.md > /tmp/katharsis-rules.md
HOME=/tmp/demo-home claude -p "$(cat ../prompt.txt)" --model opus \
  --allowedTools "Bash Read Grep Glob" \
  --append-system-prompt-file /tmp/katharsis-rules.md > /tmp/rules-on.md
```

The rules-on side loads `dist/rules/`, the generic build, because it needs no setup step. An
install through `katharsis-setup` loads the same text with your own values substituted.

## Capturing the setup run

The setup GIF replays a real `katharsis-setup` run against the plugin installed from this repo,
under the same isolated `HOME`. Install the plugin into it, seed a memory file for the wizard to
discover, then drive the three turns with `--resume`:

```
HOME=/tmp/demo-home claude plugin marketplace add "$PWD/.."
HOME=/tmp/demo-home claude plugin install katharsis@openscribbler
printf '# Working agreements\n\nRun `pytest -q` before saying anything is done.\n' \
  > /tmp/demo-home/AGENTS.md

HOME=/tmp/demo-home claude -p "Set up my writing rules" --model opus \
  --allowedTools "Bash Read Grep Glob" --output-format json > /tmp/turn1.json
HOME=/tmp/demo-home claude -p --resume "<session id from turn1.json>" \
  "All three files. Memory import. Call me Holden. ..." --model opus \
  --allowedTools "Bash Read Grep Glob Write Edit" --output-format json > /tmp/turn2.json
HOME=/tmp/demo-home claude -p --resume "<same session id>" "Go." --model opus \
  --allowedTools "Bash Read Grep Glob Write Edit" --output-format json > /tmp/turn3.json
```

Every write lands inside the isolated `HOME`, so the run installs the rules there and leaves your
own `~/.claude` alone.

`docs/evals/captures/setup-skill-rules-off.md` holds all three replies unedited, and
`docs/evals/captures/setup-skill-rules-on.md` answers the same prompts with the rules loaded.
`capture-setup.txt` is the abridged
script the GIF replays, and it differs from the full run in four ways: it drops the paragraphs
that name the sandbox path, it drops the questions the wizard answered at length in favour of the
one-line version of each, it renders the three markdown tables as aligned columns because a
terminal shows a pipe table as source, and it shortens two command blocks onto fewer lines. The
plan, the choices, the writes, and the way out are the run's own.

## Rebuilding the GIFs

`vhs` and `ffmpeg` have to be on `PATH`. Build each replay file first, because `player.sh` reads
the prompt and the reply from one file and prints a `> ` line as a dimmed user turn:

```
cat prompt-ci.txt ../docs/evals/captures/ci-triage-rules-off.md > capture-rules-off.txt
cat prompt-ci.txt ../docs/evals/captures/ci-triage-rules-on.md > capture-rules-on.txt

vhs tape-off.tape
vhs tape-on.tape
ffmpeg -y -i demo-off.gif -i demo-on.gif -filter_complex \
  "[0:v]pad=684:1560:0:0:color=0x444444[l];[l][1:v]hstack=inputs=2[s];\
   [s]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3" \
  -loop 0 ../docs/media/demo.gif

vhs tape-setup.tape && cp demo-setup.gif ../docs/media/setup.gif
```

The setup GIF is one pane, so it needs no `ffmpeg` stack.

Each tape sizes its pane to hold the longer reply without scrolling, which keeps the GIF small
because only the newest lines change between frames. The rules-on pane stops partway down the
same canvas, and that gap is the point.

The VHS render has no emoji font, so `player.sh` replaces the two decorative markers in the
question format with plain text before printing, and it drops code-fence lines because a terminal
has nothing to do with them. The words are otherwise the captured reply, unedited.
