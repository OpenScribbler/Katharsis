They are different Diátaxis modes, and the difference is a verification difference — which undoes the recommendation I gave you in Q1.

A quickstart is learning-oriented. The repo's own framework doc lists "production-ready patterns" and "multiple paths or options" under what a tutorial should **not** contain: one path, minimal, builds confidence. An integration guide is task-oriented, and the same doc lists "production-ready examples and patterns" plus troubleshooting under what a how-to **should** contain. The shipped Cloud Run guide matches that exactly — it opens with "Before you start" and closes with "Troubleshooting."

The consequence is that their code carries different obligations. An integration guide's code gets deployed, so it needs a runnable example in a named environment. That is what `ts/examples/` is: seven directories, six of them named for a deployment target, all typechecked in CI. Right mechanism, already built.

A quickstart's code gets read, not deployed. It has no environment, which is why no `ts/examples/quickstart/` exists and why creating one would push a learning artifact into a directory organized by deployment target. Its only obligation is a correct API surface — which is what the untracked scaffold checks and nothing else does.

TICKET-1 already encodes the boundary: "the site owns the console↔code bridge; the repo README keeps a package-only quickstart. Boundary: deep code → repo examples." Environment-shaped code goes upstream; the quickstart's few lines stay on the site.

One limit before you decide. The typecheck proves API shape and cannot prove values, because `baseUrl` is typed `string`. It would pass the wrong host format sitting in `quickstart.ts` today. A tutorial's one obligation is steps that definitely work, so that gap costs the quickstart more than it costs the integration guides.

## Errata

E1 - **My Q1 recommendation of (a), delete both files, was wrong** - I reached it by treating both guide types as having one verification need, so I counted the scaffold as duplicating edge-sdks CI when it covers the case that CI structurally cannot.

## Questions

❓ **Q2** - **Given the tutorial/how-to split, where does the snippet scaffold land?** — Q1 is spent; the distinction rules out its (a) and (c).
   a. Wire it in the docs repo, scoped to tutorial snippets only — Quickstart today, nothing that has an upstream example. Costs a second typecheck path, buys the only verification a tutorial's code can get.
   b. Same as (a), plus a value check that asserts placeholders like `baseUrl` match a canonical list. Closes the gap the typecheck cannot, at the cost of writing and maintaining that list.
   c. Leave quickstart code unverified and rely on review. Zero mechanism to maintain, and it puts the artifact type with the strictest "must work" obligation on the weakest check.

➡️ **a** — get the mechanism in place scoped correctly first. The value gap is real but it applies to every guide type equally, so it is its own problem rather than a reason to widen this one.
