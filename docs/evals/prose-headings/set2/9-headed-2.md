**Antigravity is already in the routing — you added it on 2026-08-25 as a fallback, not as a co-equal option.** The open call is whether to promote it, and the research you asked for is thinner than the routing line implies.

## Findings

F1 - **`agy` already sits in both config surfaces** - `~/AGENTS.md` names it under "bulk mechanical fallback, when Codex quota is spent or its auth is dead", and `~/.claude/skills/codex-implement/SKILL.md:58-90` carries the invocation, 5 gotchas, and the benchmark result.

F2 - **The benchmark behind that line is one task of one shape** - four pure functions scored against a 16-test visible plus 19-test hidden suite, where `gemini-3.7-flash-high` and GPT-5.5 both passed 35 of 35, with Codex at 198s against `agy`'s 311s. The skill says so itself, and a `find` over `$HOME` for fixtures or `agy.md` artifacts since 2026-07-01 returned zero, so it cannot be re-run without rebuilding it.

F3 - **Public benchmarks split by work type, which is the split you asked about** - Gemini 3.7 Flash trails on agentic and terminal work (Terminal-Bench 2.1 85.8% against 87.4%, DeepSWE v1.1 65.3% against 69.6%, Terminal-Bench 3.0 14.9% against 20.8%) and leads on production code quality (FrontierCode 1.1 43.6% against 41.3%), at roughly 3× the speed and 62–69% less cost.

F4 - **Gemini 3.8 Flash has shipped** - it scores 90.8% on Terminal-Bench 2.1 where 3.7 Flash scores 81.6%, so the `--model gemini-3.7-flash-high` the skill hardcodes is a version behind.

## Risks

R1 - **Promoting `agy` to co-equal removes the two guards that made it a fallback** - it has no path-scoped write sandbox, so `--dangerously-skip-permissions` auto-approves globally, and it bills `docs-ai-20260714`, meaning routine personal-repo work spends Aembit cloud budget.

## Verified

V1 - **Both CLIs are live** - `codex` at the mise node 24.15.0 bin, `agy` at `~/.local/bin/agy`.

V2 - **The billing project is current** - `~/.gemini/antigravity-cli/settings.json` still names `"project": "docs-ai-20260714"`.

## Caveats

C1 - **The public numbers compare against GPT-5.6 Terra, not the GPT-5.5 your routing names** - and two sources disagree on 3.7 Flash's Terminal-Bench 2.1 score (85.8% against 81.6%), so treat F3 as direction rather than margin.

## Questions

❓ **Q1** - **What should "option" mean in the routing line?** - the current line makes `agy` conditional on Codex being unavailable.
   a. Promote to co-equal, picked per task — you accept R1 on every run, including personal repos
   b. Keep it a fallback, widen the trigger to include "Codex is slow or the task is throughput-bound" — R1 stays rare and opt-in
   c. Split by work type: `agy` for single-file and pure-function work, Codex for multi-file and terminal-heavy work, per F3

➡️ c - it answers the question you actually asked, and it keeps R1 off multi-file work where an unsandboxed writer costs the most.

❓ **Q2** - **Do you want a local benchmark before I edit the routing?** - F2's fixture is gone, so this means building one.
   a. Rebuild across 3 shapes (single-file pure functions, a multi-file refactor, a docs-content pass) — about an hour, and it measures your actual repos
   b. Go with F3's public data and edit the routing now — free, but no evidence from your codebases
   c. Benchmark the multi-file shape only, since F2 already covers single-file

➡️ c - it tests the one case the existing evidence explicitly disclaims, and F4 means I would pin `gemini-3.8-flash-high` for the run rather than the 3.7 the skill names.

Sources: [DataCamp — Gemini 3.7 Flash](https://www.datacamp.com/blog/gemini-3-7-flash), [CodingFleet — Gemini 3.7 Flash vs GPT-5.6 Terra](https://codingfleet.com/blog/gemini-3-7-flash-vs-gpt-5-6-terra/), [emergent.sh — Gemini 3.7 Flash Benchmarks](https://emergent.sh/learn/gemini-3-7-flash-benchmarks), [DataCamp — Gemini 3.8 Flash](https://www.datacamp.com/blog/gemini-3-8-flash-cyber)
