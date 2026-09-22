`agy` is already wired in as a backend, so the open work is capability-based routing rather than adding the option.

## Findings

F5 - **Antigravity sits in both config surfaces already** - `core/AGENTS.md` model routing carries a "bulk mechanical fallback" line, and `skills/codex-implement/SKILL.md:58-90` has a run recipe, 5 gotchas, and a measured benchmark. The gate is quota and auth, never capability.

F6 - **The existing benchmark covers one shape** - four pure functions in one file, 35 of 35 for both backends, Codex 198s against `agy` 311s. The skill's own closing sentence says it "does not license `agy` for multi-file refactors," so it cannot support a routing table.

F7 - **The skill names a superseded model** - it pins `gemini-3.7-flash-high`, and `~/.gemini/antigravity-cli/settings.json` now defaults to Gemini 3.8 Flash (High), with all three 3.8 tiers listed.

F8 - **`agy models` lists models that fail at run time** - it prints `gemini-3.1-pro-low` and `-high`, but running `gemini-3.1-pro-low` returns "Selected model is not supported in the selected location." The skill's Pro gotcha still holds; the model list is what misleads.

F9 - **`core/AGENTS.md` has uncommitted edits right now** - along with `core/guidance.md`, `hooks/security-validator.ts`, `settings/settings.base.json`, and 2 skill files, plus an untracked validator `.bak` from 2026-08-27. A routing-line edit collides with whatever you have open there.

## Risks

R2 - **`--dangerously-skip-permissions` auto-approves writes across your whole home directory** - `trustedWorkspaces` lists `/home/hhewett`, which contradicts the skill's rule to run `agy` "only in a throwaway or per-task workspace." A misfiring run reaches `~/personal`, `~/workspaces`, and `~/.claude` alike.

## Verified

V1 - **Both backends are live** - `codex-cli 0.153.3` logged in via ChatGPT, `agy 1.2.1` answering. Neither is in the quota-spent state the current fallback line waits for.

## Next Actions

NA1 - **Correct the skill for F7 and F8** - repin the model to 3.8 Flash (High) and note that `agy models` advertises Pro tiers the `us` location rejects.

## Questions

❓ **Q5** - **What shapes should the comparison cover?** - the pure-function result is a tie, so routing needs shapes where the two diverge.
   a. One shape: a multi-file mechanical edit, the exact case the current benchmark disclaims. One fixture, two runs, roughly half a session.
   b. Three shapes: multi-file mechanical edit, test-writing against existing code, and read-only analysis. Enough to write a real routing line, and a full session of work plus three fixtures of GCP spend.
   c. Five shapes, adding a cross-package refactor and an API migration. Best routing table, and it spans more than one sitting.

➡️ b - it matches "different types of work" and lands the routing line in one session. Take a if you want a stopping point sooner, since the multi-file case is the one blocking the promotion.

❓ **Q6** - **Start NA1 now, or hold it until after the benchmark?** - the benchmark will likely rewrite the same section.

➡️ Hold it. Folding the model repin into the benchmark's own edit avoids touching `codex-implement/SKILL.md` twice.

❓ **Q7** - **Narrow `trustedWorkspaces` to fix R2?** - dropping `/home/hhewett` makes interactive `agy` prompt you for approval outside a named workspace.
   a. Leave it, and rely on running `agy` only from a per-task workspace by discipline.
   b. Replace `/home/hhewett` with the specific workspaces you actually use `agy` in.

➡️ b - the skill already tells you to treat `agy` as unsandboxed, and the settings file currently undoes that instruction.
