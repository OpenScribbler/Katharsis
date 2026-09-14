`grep -c` counts matching lines rather than scripts, and the validator is registered three times — Bash, Edit, and Write — so 5 distinct scripts produce 7 matching lines.

## Errata

`E1` - **My "expect 5" was wrong** - the correct expected value for that command was 7. Your run was right; nothing needs re-running.

## Verified

`V1` - **7 was correct at the moment you ran it** - `settings/settings.base.json` at `ab58b52` ("Finish the hook migration") has 7 lines matching `~/.claude/hooks/` and 5 distinct scripts behind them.

`V2` - **The migration itself came out clean** - `~/.claude/settings.json` now has 0 `PAI_DIR` references.

## Findings

`F1` - **Your pattern edit closed a hole in the one I handed you** - you committed `/\/hooks\/[^\/]+\.(ts|sh)$/i`; my version covered `.ts` only, which would have left `atlassian-account-gate.sh` and `stop-phrase-guard.sh` editable outside maintenance mode. You also moved the sentinel to `~/.local/state/maive/.maintenance-mode`, which finishes the un-PAI further than I took it.

`F2` - **The same command returns 6 today** - `989e427` unwired the stop-phrase guard from `Stop`, dropping its line. 5 scripts, 6 lines, same arithmetic.

## State

`S1` - **`maive-core` has uncommitted work** - 6 modified files, including a validator change tightening the `rm` patterns that false-positived during the migration.

## Questions

❓ **Q1** - **Do you want the stray validator backup removed?** - `hooks/security-validator.ts.bak.20260827160048` has been sitting untracked in the hooks directory since 2026-08-27.

   a. Remove it — the committed history already holds every version of that file, so the backup carries nothing `git show` cannot produce.
   b. Leave it — costs nothing but a line in `git status`, and its `.bak` suffix means the maintenance pattern does not match it, so it is not executable protection you would be giving up.

➡️ **a** - it predates the pattern fix, so keeping it invites someone to diff against a copy that is missing the `.sh` coverage.
