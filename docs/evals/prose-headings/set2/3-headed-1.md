A quickstart teaches the product; an integration guide handles a platform. What each one uniquely supplies is different, and that decides everything else about them.

`quickstart-edge.mdx` runs past 1,060 lines under "Step 1 / Step 2 / Step 3" and builds the entire Aembit object model from nothing — Trust Provider, Client Workload, Credential Provider, Server Workload, Access Policy — then closes with Summary and Common errors. It picks the environment for the reader (GitHub or GitLab CI). The reader arrives knowing nothing and leaves having made one successful call, having absorbed the object model on the way.

`gcp-cloud-run.mdx` runs about 200 lines under task headings: "Where the token comes from", "Write the function", "Fill in your values", "Check the result", "Troubleshooting". It assumes the Aembit config exists and links out for the Client ID. Its unique content is platform truth the reader cannot derive — how GCP mints an identity token, and the `ec` versus `id` subdomain trap.

The numbering is a symptom rather than a style choice. A quickstart numbers its steps because the order is mandatory: you cannot create an Access Policy before a Trust Provider. An integration guide uses task headings because the reader may have half of it done already and will skim to the part they need.

This reaches the snippet question. Integration guides map one-to-one onto `edge-sdks/ts/examples/` because both are environment-scoped: `aws-imds-ec2`, `gcp-identity-token-function`, `oidc-vercel-function`. A quickstart has no environment to be scoped to, so there is nothing to make runnable. That directory is structurally an integration-guide backing store, which leaves option (c) from Q1 with nowhere to put a quickstart example.

And `quickstart.ts` calls `trustProviders.awsMetadataService()`, which resolves only on EC2 with IMDS reachable. A file requiring EC2 is integration-guide content, and the AWS integration guide already shipped under TICKET-2 backed by `ts/examples/aws-imds-ec2`.

## Errata

E1 - **I tied the untracked snippet to TICKET-1 on the strength of its filename** - its `awsMetadataService()` call makes it AWS integration content, which TICKET-2 already covers with a verified example, so TICKET-1 is the wrong home for it.

## Questions

❓ **Q2** - **Does the Edge SDK quickstart show code at all, or stop at the console handoff?** - The distinction above forces this, because code needs an environment and a quickstart has none.
   a. Console-only — the page ends at "get your Edge SDK Client ID" and hands off to an integration guide for code. This matches TICKET-1's own D5 split, where the site owns the console↔code bridge and the repo README keeps the package-only quickstart. No docs-side snippet exists to typecheck, so the untracked files go.
   b. One nominated environment as the default path — then the page is an integration guide with the console config inlined, and it earns a backing example in `edge-sdks/ts/examples/` like the other four.

➡️ **a** — TICKET-1 already assigns the code half to the repo README, and b duplicates whichever integration guide you nominate.
