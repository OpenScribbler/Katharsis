# Demo

Everything behind `docs/media/demo.gif`, the side-by-side GIF at the top of the README. The eval
that interprets it is [docs/evals/ci-triage.md](../docs/evals/ci-triage.md), and the two replies
it replays are stored verbatim in [docs/evals/captures/](../docs/evals/captures).

Nothing here is part of the plugin. `claude plugin validate` ignores it, and an installer never
receives it.

| File | What it is |
|---|---|
| `prompt.txt` | The prompt both runs answered, word for word |
| `sandbox/` | The repo both runs worked in: an order-pricing package with a rounding bug and a slow retry suite |
| `player.sh` | Replays a captured reply into a terminal at a fixed line rate, with light colouring |
| `tape-off.tape`, `tape-on.tape` | [VHS](https://github.com/charmbracelet/vhs) tapes, one pane each |

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

## Rebuilding the GIF

`vhs` and `ffmpeg` have to be on `PATH`. From this directory, with the two captures and
`player.sh` beside the tapes:

```
vhs tape-off.tape
vhs tape-on.tape
ffmpeg -y -i demo-off.gif -i demo-on.gif -filter_complex \
  "[0:v]pad=684:1560:0:0:color=0x444444[l];[l][1:v]hstack=inputs=2[s];\
   [s]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3" \
  -loop 0 ../docs/media/demo.gif
```

Each tape sizes its pane to hold the longer reply without scrolling, which keeps the GIF small
because only the newest lines change between frames. The rules-on pane stops partway down the
same canvas, and that gap is the point.

The VHS render has no emoji font, so `player.sh` replaces the two decorative markers in the
question format with plain text before printing. The words are otherwise the captured reply,
unedited.
