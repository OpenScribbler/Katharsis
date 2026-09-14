The validator is registered three times — `Bash`, `Edit`, and `Write` — so the grep counts 7 command lines across 5 distinct scripts. 7 was the correct result, and the migration worked.

## Errata

`E1` - **My predicted "5" counted scripts rather than registrations** - the punt's own "Hooks 52→7" line carries the same 7, and I confirmed that count myself earlier in that session.

## Verified

`V1` - **0 `PAI_DIR` references remain in `~/.claude/settings.json`** - the un-PAI is complete.
`V2` - **Step 2's patch landed** - the pattern reads `/\/hooks\/[^\/]+\.(ts|sh)$/i`, widened since to cover `.sh` hooks, with the sentinel moved to `~/.local/state/maive/.maintenance-mode`.
`V3` - **The same grep returns 6 today** - commit `989e427` dropped the stop-phrase-guard registration on 2026-09-08, so re-running the block now gives 6 rather than the 7 you saw.

## Findings

`F1` - **`hooks/security-validator.ts` has uncommitted changes in maive-core** - `git status` shows ` M` against it.
`F2` - **`hooks/security-validator.ts.bak.20260827160048` sits untracked in `hooks/`** - it ends in a timestamp rather than `.ts`, so the maintenance pattern does not match it, and Wave 1 removed `*.bak` files by policy.

## Next Actions

`NA1` - Commit the validator's pattern edit through a `[git]` subagent.
`NA2` - Move the stray backup to `~/personal/backups/attic-20260821/`.

## Questions

❓ **Q1** - **Which of these should I take now?** Both are small and independent.
   a. Both — commit the pattern edit, then archive the backup.
   b. `NA1` only, if the backup is deliberate.
   c. Neither — you want to look at the uncommitted diff first.

➡️ **a** - the pattern edit is the load-bearing half of the validator move and has sat uncommitted for two weeks, so a machine restored from this repo today would get the unpatched guard.
