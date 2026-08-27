# Uninstall

Setup records every write in `~/.claude/katharsis/.katharsis-install.json`, and the uninstall
reads that manifest and nothing else:

```
scripts/uninstall-rules.sh plan     # names every action and every refusal, writes nothing
scripts/uninstall-rules.sh apply    # executes it
```

An install followed by an uninstall returns your memory file and your settings file byte for
byte, formatting included, when you have not edited them since the install. A file you edited
in between gets the managed content spliced out and keeps your edits.

## What it refuses to remove

The manifest records that Katharsis did not write these, so the script keeps them:

- A rule file you edited after the install. The hash no longer matches, so the file is yours.
- `promoted.md` once anything has been promoted into it, and any file the audit created, such
  as `examples.md`.
- A displaced file whose archived original has gone missing, because deleting it would leave
  you with nothing.
- A `katharsis:begin` block that was already in your memory file.
- A settings value that was already set before the install, such as `autoMemoryEnabled` you
  had turned off yourself.

The first three are reported and kept, and the manifest survives so a later run retries them.
The last two were yours before the install, so leaving them in place is the reversal: the run
reports them and still completes.

## With no manifest

The script refuses outright and names what a manual removal would touch, because a guessed
uninstall is worse than none. Remove the managed block from your memory file and delete
`~/.claude/katharsis/` by hand, after checking `promoted.md` for rules you want to keep.

## Settings edits

The two settings edits the skills offer go through their own script, so they reverse the same
way:

```
scripts/settings-edit.sh status
scripts/settings-edit.sh reverse --edit all
```

`reverse` restores a value the install changed and leaves a value that was set before the
install.
