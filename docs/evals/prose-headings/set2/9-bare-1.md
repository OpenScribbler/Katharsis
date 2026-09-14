**Antigravity is already an option — AGENTS.md:32 routes it as the bulk mechanical fallback, and `codex-implement` carries a full backend section for it.** The gap your ask points at is evidence across task shapes, not the integration.

I agree with doing the research first. Promoting `agy` from fallback to peer means the routing line claims something the current evidence does not cover, and the skill says so in its own words.

## Findings

F5 - **`agy` is wired in end to end already** - `core/AGENTS.md:32` names it for bulk mechanical work when Codex quota or auth is dead, and `skills/codex-implement/SKILL.md:58-92` holds the invocation, 5 gotchas, and a measured-capability section.

F6 - **The documented model is one generation stale** - the skill pins `gemini-3.7-flash-high`; `~/.gemini/antigravity-cli/settings.json` now defaults to Gemini 3.8 Flash (High), and `agy models` lists three 3.8 tiers.

F7 - **The existing benchmark is one task of one shape** - four pure functions, 35/35 for both backends against a 16-test visible plus 19-test hidden suite, Codex 198s to `agy`'s 311s. The skill already refuses to generalize it to multi-file refactors.

F8 - **`agy models` lists Gemini 3.1 Pro, but it does not run** - `agy --model gemini-3.1-pro-high -p=...` returns "Selected model is not supported in the selected location" against `gcp.location: us`. The listing is misleading and the Flash-only gotcha stands.

F9 - **The write-sandbox gap stands in `agy` 1.2.1** - the new `--sandbox` flag is a *terminal* sandbox per the changelog, restricting commands rather than confining writes to a path. Codex's `-s workspace-write` still has no equivalent.

## Risks

R1 - **`trustedWorkspaces` includes `/home/hhewett`** - so if an `agy` run with `--dangerously-skip-permissions` goes wrong, the blast radius is the whole home directory rather than a task workspace.

## Verified

V1 - **`gemini-3.8-flash-high` responds in print mode** - a probe prompt returned `FLASH_OK` in under 2 minutes.

## Next Actions

NA1 - **Correct F6 and F8 in `codex-implement`** - repin the model to 3.8 Flash (High) and rewrite the 3.1 Pro gotcha to say the model is listed but rejected by location.

## Trade-offs

### Q5 — benchmark scope

The existing fixture measured correctness and speed on the shape where both models are strong. Shapes that separate them are the ones with cross-file state: a signature change that ripples, or a transform where partial application leaves the repo broken. A benchmark that skips those produces a routing line that reads as peer-grade and fails on the first refactor.

Wall time and GCP spend scale with shapes, and every `agy` run bills `docs-ai-20260714`.

## Questions

❓ **Q5** - **How many task shapes should the benchmark cover?** - each shape needs a fixture, a spec, a hidden test suite, and one run per backend.
   a. One more shape — a multi-file refactor with a rippling signature change. Roughly an hour, and it targets exactly the case the skill refuses to license.
   b. Three more shapes — multi-file refactor, test scaffolding from existing code, and a mechanical migration. Most of a working session, and it supports a per-shape routing table rather than one verdict.
   c. No benchmark — promote `agy` to peer on F7's evidence plus a review-the-diff caveat.

➡️ a - it closes the specific gap the skill names, and one shape is enough to tell whether a per-shape table is worth building.

❓ **Q6** - **Start NA1 now, or fold it into the benchmark's commit?** - the corrections stand on their own, but touching the same file twice means two commits.
   a. Now, as its own commit. The stale 3.7 pin is wrong today and a fallback run would use it.
   b. Fold into whatever Q5 produces, so the skill changes once.

➡️ a - F6 and F8 are wrong regardless of how Q5 goes, and leaving a wrong model name in place costs a failed run.
