The difference is whether the document is bound to an environment, and that decides whether a runnable example can exist behind it.

An integration guide answers "how do I run this on Cloud Run?" The reader already has a deployment target, so the code is a deployable artifact. That is why TICKET-4 counts six examples in `edge-sdks/ts/examples/`, one per supported environment: `aws-imds-ec2`, `aws-role-lambda`, `azure-function-entra-oidc`, `azure-imds-vm`, `gcp-identity-token-function`, `oidc-vercel-function`.

A quickstart answers "what does using this SDK look like at all?" The reader has no environment yet. TICKET-1 defines it as the console↔code bridge and states its boundary outright: "deep code → repo examples." The code there is illustrative.

So option (c) last turn cannot work. There is no `ts/examples/quickstart/` because a quickstart has no environment to run in, and inventing one would turn it into a seventh environment example — TICKET-2 or TICKET-3's job rather than TICKET-1's.

That also explains the untracked `quickstart.ts`. Its `host: "db.internal"` and `baseUrl: "https://tenant.aembit.io"` are generic on purpose. It is the one piece of Edge SDK code in the docs that structurally cannot be backed by a runnable example.

The part that still cuts against keeping it: a typecheck catches API shape drift, such as a renamed factory or a changed signature, and nothing else. It did not catch the wrong `baseUrl`, which is a string and compiled clean when I ran it. A quickstart's realistic failure is a wrong placeholder value, which is the half the typecheck misses.

## Errata

E1 - **Option (c) in my last turn was incoherent** - it proposed pushing a quickstart into a directory whose entries are each named for a deployment environment, and a quickstart has none.

## Questions

❓ **Q2** - **Does the Quickstart's code get a typechecked snippet file, or a reviewed fenced block?**
   a. keep `quickstart.ts` and wire the typecheck — catches API drift that TICKET-1's code has no other guard against, at the cost of a dependency and a script in the docs repo
   b. fenced block, reviewed against the SDK source when the page is written — no infrastructure, and the drift exposure is one page

➡️ a, narrowed — the Quickstart is the only Edge SDK page with no upstream example behind it, so it is the one place a docs-side typecheck earns its keep. Pair it with a value review, since the `baseUrl` gap shows the compile alone is not enough.
