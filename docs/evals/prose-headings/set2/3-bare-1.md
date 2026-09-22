They're different Diátaxis types, and that difference is what makes option (c) wrong.

An integration guide is a how-to. It names a platform — Cloud Run, Vercel, Lambda, EC2 — and its claim is "this runs there." That claim is checkable only by running it, which is why edge-sdks carries seven example directories, one per supported environment, and typechecks them in CI. The code is a deployment artifact: handler signature, metadata URL, bundler, audience.

A quickstart is a tutorial. Its reader has no Aembit configuration yet, and its job is one first success. Per TICKET-1 it is the console↔code bridge: configure the three objects in the console, get the Client ID, install, retrieve a credential. The code shows the API's shape — three calls in order. Nobody deploys it.

The implication you have not said: quickstart code is the one category that cannot have a runnable example, because it has no environment to run in. A laptop has no IMDS, so the draft's `trustProviders.awsMetadataService()` fails there. Pushing it to `edge-sdks/ts/examples/quickstart/` would invent an environment that does not exist. A docs-repo typecheck is therefore not a duplicate of edge-sdks CI — it covers the complement: code that must compile against real types but can never be executed. That is what `tsc` proved when it passed with no environment at all.

TICKET-1 already recorded this boundary in July: "the site owns the console↔code bridge; the repo README keeps a package-only quickstart. No overlap. Boundary: deep code → repo examples." Deep code goes upstream, and the quickstart is by design not deep code.

Two things the split exposes in the draft. It picks AWS, which is an environment choice leaking integration-guide thinking into tutorial code, and a first-success path should not require EC2. And a typecheck cannot catch the wrong `baseUrl`, because every string typechecks, so the mechanism covers API drift rather than value accuracy.

## Errata

E1 - **My Q1 recommendation of option (a) was wrong** - I judged the scaffold redundant with edge-sdks CI, when the two cover different content types with different failure modes; option (b) is the correct read.

## Questions

❓ **Q2** - **Where does the snippet scaffold land, given the tutorial/how-to split?** - Q1 is spent, since the split changes which option survives.
   a. delete both files — now only defensible if the site quickstart carries no code at all and points at the repo README instead
   b. keep the scaffold scoped to quickstart snippets and wire it under TICKET-1 — the one mechanism available for code with no environment
   c. push a quickstart example upstream to edge-sdks — ruled out by TICKET-1's own boundary and by the absent environment

➡️ **b** - it is the complement of edge-sdks CI rather than a second copy of it, and TICKET-4's "Path 2" wording then describes something that exists.

❓ **Q3** - **What does the quickstart attest with, if not AWS?**
   a. `trustProviders.oidcIdToken()` with a token the reader pastes — runs anywhere, including a laptop, and keeps the tutorial environment-free
   b. keep an environment-specific provider and accept that the quickstart assumes a cloud host — simpler prose, but the reader cannot follow it locally
   c. defer until TICKET-1 starts

➡️ **a** - a first-success path that runs on the reader's own machine is the whole point of a tutorial, and it is the only option where the typecheck and the reader's experience agree.
