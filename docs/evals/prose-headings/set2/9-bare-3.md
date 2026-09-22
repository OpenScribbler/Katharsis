**`agy` already is the bulk-mechanical fallback — it shipped on 2026-08-25 in `4b2f36b` and is pushed to `origin/main`.**

Your research instinct is right, because the one benchmark behind that line covers a single task shape, and review data from today already hints at a difference the benchmark cannot see.

## Findings

F1 - **`core/AGENTS.md:32` carries the routing entry** - "bulk mechanical fallback, when Codex quota is spent or its auth is dead: Gemini Flash via Antigravity CLI (`agy`), per `codex-implement`."

F2 - **`skills/codex-implement/SKILL.md:58-90` carries the full backend section** - the invocation, 2 reasons it is the fallback, 5 gotchas, and a "Measured capability" subsection.

F3 - **The benchmark tested one shape and the skill says so** - 4 pure functions against 16 visible plus 19 hidden tests, both backends 35 of 35, Codex 198s against `agy`'s 311s, closing with "That is one task of one shape."

F4 - **On review work today, `agy` agreed with everything** - reviewing a 29-comment draft of `edge-sdks`, `agy` returned 27 **AGREE** and 0 disagreements, while Codex on the same repo returned 20 agreements and 4 disagreements. A backend that never pushes back is worth less as a second opinion than its agreement rate suggests.

F5 - **The two review runs saw different drafts** - `2026-09-11-main-1/draft.md` and `2026-09-11-main-2/draft.md` differ by 102 diff lines, so F4 is a signal rather than a result.

F6 - **`agy` spends 54% of its report on absolute-path links** - `agy.md` is 35,867 characters, and 16,434 remain after stripping the `file:///home/hhewett/...` URLs it attaches to every citation.

## Questions

❓ **Q5** - **Does `agy` stay a fallback, or become a peer option?** - the current line gates it on Codex quota being spent, which your ask may have meant to loosen.
   a. Leave it gated - the 2 stated reasons still hold: no path-scoped write sandbox, and it bills `docs-ai-20260714`
   b. Make it a peer for bulk mechanical work, choosing by task shape rather than by Codex availability

➡️ a until F3's gap closes - the GCP billing reason is independent of capability, so no benchmark result removes it

❓ **Q6** - **What research do you want, given each `agy` run bills the work GCP project?** - the cheap options settle less.
   a. Re-run Codex against `2026-09-11-main-2/draft.md` alone, making F4 a clean head-to-head on review work for roughly one Codex run
   b. Add 2 implementation fixtures to the existing benchmark — a multi-file refactor and a bug fix from a failing test — which are the shapes F3 leaves untested
   c. Both a and b

➡️ a first - it costs one run, uses artifacts already on disk, and F4 is the only place the two backends currently look different
