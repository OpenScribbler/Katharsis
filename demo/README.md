# Demo

Everything behind the GIFs in the README. Each `docs/media/demo-<model>.gif` puts one CI-triage
prompt side by side, answered by one Claude model under Claude Code's default style and under
Katharsis. `docs/media/session.gif` continues the Claude Opus 5.5 Katharsis session: the user
answers the two questions by code, and `kref` reads the session's items back from the ledger.

Every reply and every `kref` output the GIFs replay is stored verbatim in `captures/`. The
player changes how they look, never what they say.

Nothing here is part of the plugin. `claude plugin validate` ignores it, and an installer never
receives it.

| File | What it is |
|---|---|
| `prompt.txt` | The prompt both runs answered, word for word |
| `prompt-ci.txt` | The same prompt trimmed to four lines, which the side-by-side GIF shows as the user turn |
| `sandbox/` | The repo both runs worked in: an order-pricing package with a rounding bug and a slow retry suite |
| `captures/<model>/` | Both first-turn replies from one model, as `default.md` and `katharsis.md`, for `sonnet-5`, `opus-5`, `opus-5-5`, `fable-5`, and `fable-5-1` |
| `captures/session/` | The Opus 5.5 Katharsis reply to `1. a, 2. a`, and the two `kref` outputs |
| `player.py` | Replays a capture into a terminal at a fixed line rate, rendering the markdown roughly the way Claude Code does |
| `build-gifs.sh` | Renders every pane with [VHS](https://github.com/charmbracelet/vhs) and stacks each model's pair into one GIF |

## Reproducing the captures

Both runs use an isolated `HOME` that carries no memory file, no plugins, and no settings, so the
default side is a genuine baseline and the Katharsis side runs only what the plugin ships. Link
your credentials into it rather than copying them, so the secret stays in one place with its own
permissions, and run the plugin's setup script against it:

```
export DEMO=/tmp/katharsis-demo K=$PWD   # run from the repo root
mkdir -p $DEMO/home/.claude
ln -s "$HOME/.claude/.credentials.json" $DEMO/home/.claude/.credentials.json
HOME=$DEMO/home $K/scripts/setup.sh
```

Each run works in its own copy of the sandbox, because the Katharsis session edits it on the
second turn. Set `MODEL` to the model ID, such as `claude-sonnet-5`, and store the two replies
under `captures/<model>/` without the `claude-` prefix. The default side:

```
cp -r $K/demo/sandbox $DEMO/run-default && cd $DEMO/run-default
HOME=$DEMO/home claude -p "$(cat $K/demo/prompt.txt)" --model $MODEL \
  --allowedTools "Bash Read Grep Glob" < /dev/null > $DEMO/default.md
```

The Katharsis side picks the style the way `/config` does, in the project's
`.claude/settings.local.json`. The `--settings` flag is not a substitute: the hooks read the
style from the settings files on disk, so a style passed on the command line reaches the model
and leaves the ledger empty.

```
cp -r $K/demo/sandbox $DEMO/run-katharsis && cd $DEMO/run-katharsis
mkdir .claude && echo '{"outputStyle":"katharsis:Katharsis"}' > .claude/settings.local.json
SID=$(python3 -c 'import uuid; print(uuid.uuid4())')
HOME=$DEMO/home claude -p --session-id $SID "$(cat $K/demo/prompt.txt)" --model $MODEL \
  --plugin-dir $K --allowedTools "Bash Read Grep Glob" < /dev/null > $DEMO/katharsis.md
HOME=$DEMO/home claude -p --resume $SID "1. a, 2. a" --model $MODEL \
  --plugin-dir $K --allowedTools "Bash Read Grep Glob Edit Write" < /dev/null > $DEMO/answer.md
HOME=$DEMO/home CLAUDE_CODE_SESSION_ID=$SID $K/bin/kref > $DEMO/kref.txt
HOME=$DEMO/home CLAUDE_CODE_SESSION_ID=$SID $K/bin/kref -f C > $DEMO/kref-f-C.txt
```

The stored captures came from Claude Code 2.1.280 and Katharsis 0.4.0 on 2026-09-22; the second turn and the `kref` outputs come from the Opus 5.5 session only. A rerun
gives different words, because the model is not deterministic.

## Rebuilding the GIFs

`vhs`, `ffmpeg`, and `python3` have to be on `PATH`. `build-gifs.sh` rebuilds every model's GIF
and the session GIF into `docs/media/`, or only the models you name:

```
./build-gifs.sh              # every directory under captures/
./build-gifs.sh sonnet-5     # one model
```

For each model it writes a replay file that puts `prompt-ci.txt` ahead of the reply, because
`player.py` prints a `> ` line as a dimmed user turn. It sizes both panes to the longer replay, so
neither scrolls and only the newest line changes between frames, which keeps the GIF small.
`python3 player.py --count <replay> 80` prints the rows a replay takes. A model whose name the
script does not know is labelled with its directory name.

The VHS render has no emoji font, so `player.py` replaces the two decorative markers in the
question format with plain text, and it drops code-fence lines because a terminal draws the code
without them. Pipe tables print as aligned columns, as Claude Code draws them.
