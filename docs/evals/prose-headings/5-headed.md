Scope and precedence — and of the four paths in play, `~/.claude/settings.local.json` is not a settings file at all.

The CLI bundle at `~/.local/share/claude/versions/2.1.268` names its own tiers in order: `User Settings (~/.claude/settings.json)`, `Project settings (.claude/settings.json)`, `Local settings (.claude/settings.local.json)`, then plugin and session hooks. Every string it carries for that third tier reads "this checkout's `.claude/settings.local.json`" — local means local to a repo, never local to you.

I measured the behaviour with an `env.KATH_PROBE` key rather than trusting the strings. Placed in `~/.claude/settings.local.json` it resolved `UNSET`. The same key in this repo's `.claude/settings.local.json` resolved `from-project-local`. With both files carrying it, `from-project-local` won. With the project file restored and only the user one left, `from-user-settings`. All three probe keys are removed and both files hold their original bytes.

So the three real files divide by who a setting is for. `~/.claude/settings.json` is you, in every repo and every worktree, and it loses to anything a project sets. `.claude/settings.json` is the repo and everyone who clones it, since it commits. `.claude/settings.local.json` is you in one checkout, gitignored, and it beats both of the others.

## Findings

F1 - **Q1 is already in force** - `~/.claude/settings.json:223` carries `"outputStyle": "Katharsis"` and the key is gone from `~/.claude/settings.local.json`. Q1 is spent, and `turn-reminder.sh:69` now reads cwd-local, then cwd-project, then user, with the 2026-09-02 measurement recorded in its header comment.

F2 - **The 9 `permissions.allow` entries still in `~/.claude/settings.local.json` do nothing** - that file is the one the harness never reads, so `Bash(gh repo *)`, `Skill(research-delegation)`, and the other 7 have been prompting you all along.

## Trade-offs

### Where a given setting belongs

T-O1 - **`~/.claude/settings.json` forecloses nothing** - any repo can still override it with its own file, so a project that needs a different style or permission set can have one; undoing a key is one edit, and nothing outside your machine ever sees it.

T-O2 - **`.claude/settings.local.json` forecloses every repo you have not visited yet** - the setting exists only where you put it, so each new clone and each git worktree starts without it, and it fails silently rather than erroring.

T-O3 - **`.claude/settings.json` changes what other people get** - a hook or style set in the shared docs repo reaches your colleague's sessions, and reversing it costs a PR instead of an edit.

T-O4 - **The local file assumes you will notice its absence** - nothing warns, which is how `turn-reminder.sh` announced Katharsis for a month with no style loaded.

## Questions

❓ **Q2** - **What should happen to `~/.claude/settings.local.json`?** - it now holds only the 9 inert allow entries from F2.
   a. Merge the 9 entries into `~/.claude/settings.json` and delete the file - the permissions start applying everywhere, and you lose the ability to pretend the file is a scratch space.
   b. Delete the file and re-approve each permission as it comes up - you find out which of the 9 you still want, at the cost of 9 prompts spread over the next weeks.
   c. Leave it - costs nothing today and guarantees the same confusion the next time you edit it.

➡️ a - the entries are ones you already approved deliberately, and a file the harness ignores is the trap that cost a month here.
