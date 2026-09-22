The routing table already carries `agy`, so this is a promotion from fallback to peer — and one thing blocks it.

## Findings

F1 - **`agy` is already routed, as a fallback** - `AGENTS.md` has the "bulk mechanical fallback" line, and `codex-implement/SKILL.md:58-88` carries the run recipe, 5 gotchas, and a benchmark.

F2 - **Published benchmarks split by work shape rather than crowning a winner** - Gemini 3.8 Flash takes Terminal-Bench 2.1 at 90.8%, and trails on long-horizon SWE at 71.0% on DeepSWE v1 against GPT-5.6 Sol's 72.7% and Opus 5's 74.0%, per [Vellum](https://www.vellum.ai/blog/gemini-3-8-flash-benchmarks-explained) and [BenchLM](https://benchlm.ai/models/gemini-3-8-flash). Those score models, not the two CLI harnesses.

F3 - **The sandbox gap is real, and I reproduced it just now** - `agy --sandbox --mode accept-edits --model gemini-3.8-flash-high -p` on a 3-step fixture exited 0 having written zero files, and `/tmp/agy-probe/run-sandbox.log` says a tool needed the `command` permission that headless mode auto-denies.

F4 - **`--dangerously-skip-permissions` cancels `--sandbox`** - [antigravity-cli issue #36](https://github.com/google-antigravity/antigravity-cli/issues/36) is open and reports that the flag auto-approves the sandbox-bypass prompt itself. So today you get either a sandbox that cannot run your tests or test execution with no sandbox.

F5 - **Three claims in the skill are stale** - `--sandbox` exists and is OS-level (workspace and temp writable, `~/.ssh` and `.env` blocked, network off by default) against the skill's "no path-scoped write sandbox"; `gemini-3.8-flash-high` supersedes the pinned 3.7; and `agy models` now lists `gemini-3.1-pro-low` and `gemini-3.1-pro-high` against the gotcha saying Pro is unavailable in the `us` location.

F6 - **`trustedWorkspaces` in `~/.gemini/antigravity-cli/settings.json` lists `/home/hhewett`** - your whole home directory, which is wider than the skill's "throwaway or per-task workspace" warning.

## Risks

R1 - **Promoting `agy` to peer on today's recipe removes the write boundary from every bulk run** - with F6, one wrong path in a spec reaches anything under `$HOME`, and Codex's `-s workspace-write` is the only thing currently preventing that on the default route.

## Next Actions

NA1 - **Test the `permissions.allow` route** - the denial in F3 names `command(<target>)` allow-rules as the alternative to the dangerous flag. If a rule grants build and test execution while `--sandbox` stays on, F4 stops mattering and `agy` becomes a legitimate peer. It needs an edit to your work-billed global `settings.json`.

NA2 - **Refresh F5's three stale claims in `codex-implement`** - including repinning the model to `gemini-3.8-flash-high`, which changes what every future delegated run uses.

NA3 - **Build the multi-shape benchmark** - the existing fixture is 4 pure functions, and the skill says so itself. Multi-file refactor, test scaffolding from an existing suite, and a bug fix from a failing test are the three shapes that would actually answer your question.

## Questions

❓ **Q5** - **Which of the three do I start?** - the promotion is blocked on F4 regardless of how the models score, so the sandbox question gates the benchmark rather than the other way round.
   a. NA1 - one probe, ~10 minutes, and it either unblocks the peer promotion or confirms `agy` stays a fallback. Requires me to add an allow-rule to your global `~/.gemini/antigravity-cli/settings.json`, which I would keep to one line and show you before saving.
   b. NA3 - answers the "different types of work" question you asked, but costs an hour or more of fixture building plus paired runs, and the result cannot change the routing while F4 stands.
   c. NA2 alone - cheapest, corrects documentation that is wrong today, and leaves the promotion where it is.

➡️ a, then c - NA1 is the only work that can change the routing decision, and NA3 is worth its hour only after the answer comes back yes.
