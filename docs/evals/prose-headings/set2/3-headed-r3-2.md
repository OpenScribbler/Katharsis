A quickstart gets a reader to a first credential with no platform underneath. An integration guide wires the SDK into one platform's runtime and the identity source that platform provides.

## What separates the two

The quickstart on main uses `trustProviders.oidcIdToken({ identityToken: "your-oidc-id-token" })` and runs locally with `npx tsx quickstart.ts` (`quickstart.mdx:249`). Commit `a4a031e1` says the environment-neutral provider was deliberate, because TICKET-1's acceptance criteria require it. The quickstart's code is written for the page, and no edge-sdks example exists behind it.

Each integration guide is tied to one platform. The Cloud Run guide gets its identity token from the GCP metadata server. The Vercel guide builds the client on every request because the identity is request-scoped. The code in both is transcribed from `edge-sdks/ts/examples/<platform>/`.

## Why that sinks my recommendation

The integration guides have a compiled source upstream, and the quickstart has none. Option (a) would have left the only unbacked page unverified. Option (c) would have turned the quickstart into a platform example, which defeats the point of a quickstart.

## Errata

E1 - **My Q1 recommendation treated the quickstart as an integration guide missing its example** - the correct reading is that a page-authored snippet needs its own typecheck, and `a788fd7e` states that reasoning.

E2 - **F4 overstated what edge-sdks CI verifies** - the examples import from `../../src/`, including `src/internal/protocol/errors.js` in the GCP example. CI therefore checks the SDK source and never the published package, so a broken exports map still passes (commit `a788fd7e` body).

## State

S1 - **TICKET-1 already shipped the page and the snippet** - `a788fd7e` and `a4a031e1` landed on 2026-08-26 and merged to main via #749 on 2026-08-27. `quickstart.mdx:21` imports the snippet with `?raw`, so the rendered code and the compiled code are the same bytes.

S2 - **This worktree sits on a stale local `main`** - HEAD is `873efecb`, which predates #749. The untracked files I described last turn no longer exist here.

## Findings

F8 - **Nothing compiles the quickstart snippet today** - `git ls-tree origin/main` lists `quickstart.ts` but not `tsconfig.snippets.json`, and no script on main mentions snippets. Commit `a4a031e1` left the tsconfig out for a follow-up PR under the Dependency Test. The harness now exists only in commit `a788fd7e`.

## Caveats

C1 - **The zero-error `tsc` result is 19 days old** - it ran against `@aembit/edge-sdk@1.34.0-rc.4`. The edge-sdks repo was pushed at 2026-09-14T18:16Z and now exports 9 trust providers, up from 6, and I have not re-run the check.

## Next Actions

NA1 - **Land the follow-up PR from `a4a031e1`** - restore `tsconfig.snippets.json` from `a788fd7e`, add `@aembit/edge-sdk` as a devDependency, add a script, and run it in CI.

## Questions

❓ **Q2** - **Should I start NA1 now?** - The PR adds a CI check that fails docs builds whenever the published SDK surface breaks the quickstart.
   a. Start now, pinned to the current npm release. The quickstart gets compiled on every PR, but SDK release candidates can turn docs CI red.
   b. Start now as a local script only, with no CI step. It cannot block anyone, but the snippet stays unverified unless someone runs it.
   c. Hold. Main keeps shipping uncompiled quickstart code.

➡️ a - the quickstart is the one page with no upstream example, so CI is its only check.
