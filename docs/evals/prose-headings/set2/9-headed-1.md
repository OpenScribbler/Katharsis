Gemini 3.8 Flash has closed the capability gap, so the reason to keep `agy` second is now the sandbox, not the model.

## Findings

F5 - **`agy` is already in the routing table, as a fallback rather than a peer** - the `bulk mechanical fallback` line in `~/AGENTS.md` names it, conditioned on "Codex quota is spent or its auth is dead", with two disqualifiers attached.

F6 - **The tie recorded in the skill is against a superseded model** - `codex-implement/SKILL.md` benchmarked `gemini-3.7-flash-high`, and the account now defaults to Gemini 3.8 Flash (High) per `~/.gemini/antigravity-cli/settings.json`.

F7 - **Published benchmarks put 3.8 Flash at peer level for agentic coding, behind on the hardest long-horizon work** - Terminal-bench 2.1 gives it 89.4% against Opus 5's 89.1%, while DeepSWE v1 gives it 71.0% against GPT-5.6 Sol's 72.7% and Opus 5's 74.0%, and SWE-bench Pro 61.6% against 3.7's 60.4% ([Vellum](https://www.vellum.ai/blog/gemini-3-8-flash-benchmarks-explained), [codingfleet](https://codingfleet.com/blog/gemini-38-flash-review/), [beam.ai](https://beam.ai/agentic-insights/gemini-3-8-flash-ai-agents)).

F8 - **The "GPT-5.5" label in AGENTS.md names nothing pinned** - `~/.codex/config.toml` carries only `trust_level` entries with no `model` key, so Codex CLI 0.153.3 uses its server-side default, and GPT-5.6 Sol now exists.

F9 - **Both disqualifiers are harness-level and both still hold** - `agy` has no equivalent of `codex exec -s workspace-write`, so `--dangerously-skip-permissions` is a global auto-approve, and `gcp.project: docs-ai-20260714` bills work cloud budget even on personal repos.

## Verified

V1 - **Gemini 3.1 Pro remains unusable from this account** - `agy --model gemini-3.1-pro-high` exits 1 with "Selected model is not supported in the selected location", even though `agy models` now lists it, so Flash tiers stay the ceiling.

V2 - **Both CLIs are live** - `codex login status` reports "Logged in using ChatGPT", and `agy` reached the API far enough to return a model-availability error rather than an auth error.

## Questions

❓ **Q5** - **Promote `agy` to a peer backend now, or get local evidence first?** - the published numbers cover model capability; they say nothing about how `agy` behaves on your repos under your spec format.
   a. Apply this wording to the `bulk mechanical implementation` line now, folding the two lines into one and dropping the stale version label from F8:
      > `bulk mechanical implementation: Codex CLI or Antigravity CLI (agy), per codex-implement — peers on capability. Codex is the default. Reach for agy when the work runs in a per-task workspace clone of a work repo; it has no path-scoped write sandbox and bills the work GCP project, so it never touches a personal repo or a repo you cannot restore.`
   b. Run a head-to-head across four task shapes first — multi-file refactor, test scaffolding, a migration, and a bug fix from a failing test — scoring correctness, files touched outside scope, and wall time, then write the routing line against the result. Costs a few hours and some work GCP budget.
   c. Leave the fallback wording alone; the sandbox gap alone justifies second place regardless of capability.

➡️ a, then b as a separate session. The sandbox and billing constraints already decide routing on their own, and they are facts rather than measurements, so the benchmark would refine a line that option a already gets right. Running it first delays a change you can make in one edit.
