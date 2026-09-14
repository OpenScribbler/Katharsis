An integration guide's code has a runnable twin in `ts/examples/` that edge-sdks CI compiles. A quickstart's code can't have one, so a docs-side typecheck is the only check it can get.

## Environment is the dividing line

An integration guide covers one environment. The TICKET-2 AWS EC2 guide covers IMDS attestation and its Trust Provider. Its `EXAMPLE_CONFIG` block matches `ts/examples/aws-imds-ec2/index.ts` field for field. Every integration guide has a twin like that, and edge-sdks CI compiles every twin.

A quickstart covers the product flow. TICKET-1 calls it the console↔code bridge: create the Trust Provider, Client Workload, and Access Policy, get the Client ID, install, and retrieve a credential. Which environment the code runs in doesn't matter to it. The ticket sends deep code to the repo examples.

## A runnable quickstart turns into an integration example

Every Trust Provider in the SDK attests a real environment through IMDS, a cloud identity token, or an OIDC token. A quickstart example that actually runs has to pick one of those environments. At that point it duplicates an existing example. Quickstart code can compile anywhere, but it only runs inside one environment. The untracked snippet targets exactly this gap: it copies the README quickstart (F8), and edge-sdks CI never compiles README code (F9).

## What a compile check can't catch

The strongest case against a docs-side typecheck is F10. The check proves the API calls are valid. It proves nothing about the placeholder values a reader copies.

## Findings

F8 - **`quickstart.ts` is the edge-sdks TypeScript README's `## Quickstart` block with 3 edits** - the port changed from `5432` to `443`, an `await client.authenticate()` call was added, and the log prints `credential` instead of `credential.data`. `baseUrl`, `clientId`, `awsMetadataService()`, and `host: "db.internal"` match exactly.
F9 - **edge-sdks CI never compiles the README's code** - the `typescript` job typechecks `src/**/*.ts` and `examples/**/*.ts`, and the `markdown` job only runs `markdownlint-cli2` and the license-header check.
F10 - **The README quickstart uses the wrong host format** - it sets `baseUrl: "https://tenant.aembit.io"`, but `aws-imds-ec2/index.ts` and the AWS EC2 guide use `https://<tenant>.ec.<stack>.aembit.io`. Both strings pass a typecheck.

## Errata

E1 - **Option c in Q1, a `ts/examples/quickstart/` example, can't work** - a runnable quickstart has to attest a real environment, so it would duplicate an existing integration example.
E2 - **My recommendation in Q1 to delete the scaffold was wrong** - quickstart code is the one kind of SDK code with no runnable twin and no CI coverage. That makes a docs-side typecheck worth keeping.

## Trade-offs

### Q2

T-O1 - **a keeps the check in `aembit-docs`** - the docs build fails when the SDK API changes. Undoing it means deleting 2 files and 1 script.
T-O2 - **b fixes the README too, but hands the check to Eng** - it needs Eng to agree, and the site would copy the README. TICKET-1's D5 split rules out that overlap.
T-O3 - **c leaves the first code a reader copies unchecked** - it would be the only SDK code on the site with no compile check.

## Questions

❓ **Q2** - **Where does the quickstart snippet's check live?**
   a. Wire up the scaffold under TICKET-1. Rewrite the snippet so its placeholders map to console fields and it uses the `ec` host.
   b. Ask Eng to typecheck the README's code blocks in edge-sdks CI, then copy the README quickstart into TICKET-1.
   c. Delete both files and ship the quickstart code with review only.

➡️ a - under D5, the site's snippet is docs-owned bridge code that no upstream file will hold, so only a docs-side check can cover it.

❓ **Q3** - **Do we report F10 to Eng now?**
   a. Report it now. Filing a Jira ticket from here needs the Atlassian plugin re-authorized through `/mcp`.
   b. Record it in TICKET-1 and raise it when that page starts.

➡️ a - the wrong host is on the public npm README today, and every new SDK user reads that first.
