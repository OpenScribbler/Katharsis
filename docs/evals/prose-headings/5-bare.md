`~/.claude/settings.local.json` is not a settings file Claude Code reads, so the pair you are choosing between does not exist — the real choice is three destinations.

The scope table in the 2.1.268 binary names exactly three non-managed sources: `userSettings` → `~/.claude/settings.json`, `projectSettings` → `<repo>/.claude/settings.json`, and `localSettings` → `<repo>/.claude/settings.local.json`. Every other string mentioning `settings.local.json` qualifies it as "this checkout's". Above those sit managed settings and `--settings`, and precedence runs managed → `--settings` → local → project → user. That makes the checkout's local file the highest-priority source you control and user settings the floor everything else overrides.

So "local" is a statement about the checkout rather than about you. The `.local` suffix means gitignored-and-this-clone-only, which is why a copy in your home directory resolves to no scope at all and is read by nothing.

The case against treating this as settled: I proved the loader's scope list from strings in the binary rather than from documentation, and confirmed it with live probes on 2.1.268. A future version could add a user-local scope and silently re-activate that file.

## Findings

F1 - **Q1 is already applied** - `outputStyle` sits at `~/.claude/settings.json:223` and the key is gone from `~/.claude/settings.local.json`, dated 2026-09-08, so that decision is spent.

F2 - **The 9 permission rules still in `~/.claude/settings.local.json` are inert** - same cause, so `Bash(gh repo *)`, `Bash(env)`, and the other 7 have never granted anything and you have been approving those prompts by hand.

F3 - **A sibling worktree does not inherit the canonical checkout's local settings** - with `learning-capture` in `main/.claude/settings.local.json`, a probe from `main` returned `learning-capture` and the same probe from the `wt` worktree returned `Katharsis`, the user-settings value.

## Trade-offs

### Where a given setting goes

T-O1 - **`~/.claude/settings.json`** - forecloses per-repo variation: the setting is identical in the shared docs repo and in the lab, so you cannot run a drift experiment in one repo without turning the behavior off everywhere. Undo is deleting the key, with nothing to coordinate, and nothing outside your machine ever sees it.

T-O2 - **`<repo>/.claude/settings.json`** - forecloses treating the setting as yours, because it lands in your colleague's checkout on their next pull and becomes a repo convention they can object to. Undo costs a commit and his pull. It breaks when it points at a path only you have, such as `~/.claude/katharsis/`.

T-O3 - **`<repo>/.claude/settings.local.json`** - forecloses nothing outside one checkout, and per F3 every new `atd-*` worktree starts without it, which is the exact shape of the failure that hid Katharsis for a month. Undo is deleting the file.

## Questions

❓ **Q2** - **What happens to the dead `~/.claude/settings.local.json`?** - it holds only the 9 inert allow rules from F2.
   a. Merge the 9 rules into `permissions.allow` in `~/.claude/settings.json` and delete the file — the prompts stop, and no file is left that looks authoritative and is not.
   b. Delete the file and let the rules go — you re-approve those 9 patterns interactively as they come up.
   c. Leave it — it keeps a record of what you once allowed, at the cost of a file that will mislead the next diagnosis the same way it misled this one.

➡️ a - the rules were written because you wanted those prompts gone, and the merge is what makes that true for the first time.
