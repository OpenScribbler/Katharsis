An integration guide copies a platform example that edge-sdks CI compiles. A quickstart runs one generic program that exists nowhere upstream, so a docs-side typecheck is the only check its code can get.

## What each page type owns

The quickstart that shipped sets up the Aembit side from zero. `dev-guide/sdk/edge/quickstart.mdx` on main is 282 lines long. Lines 50–195 create five console objects: Trust Provider, Client Workload, Credential Provider, Server Workload, and Access Policy. The code is one program built for that setup. It uses a static OIDC token and `credentialType: "ApiKey"`, and you run it once with `npx tsx`. No directory in `edge-sdks/ts/examples/` holds that program. Six of the seven directories are platforms, and the seventh is `logging_integration`.

The AWS EC2 integration guide assumes the Tenant is already configured. It is 129 lines long, and its only console heading is "Get your Edge SDK Client ID." Its runnable source is `ts/examples/aws-imds-ec2`, and edge-sdks CI typechecks that example on every PR.

## Why this puts the check in the docs repo

The page type decides where the code can be verified. Integration guide code has a compiler upstream. Quickstart code has none, and neither does the Quickstart block in the package README, because `ts/tsconfig.json` does not cover it. That is the contrast TICKET-4 draws with "the way the TypeScript snippets can." The scaffold was the quickstart's only check, and only half of it shipped.

## The case against wiring it

A docs-side typecheck covers only 1 of the 5 SDK pages. The four integration guides are copied from the examples by hand and have no docs-side check. An SDK breaking change can still leave them out of date without anyone noticing.

## Errata

E1 - **My Q1 recommendation to delete the scaffold was wrong** - edge-sdks CI compiles only the per-platform examples, so deleting the scaffold would have removed the only check on the quickstart code.
E2 - **Q1 option c conflicts with the agreed split** - TICKET-1 records decision D5: the repo README keeps a package-only quickstart, and the site owns the console-to-code bridge.

## Findings

F8 - **The page shipped using the snippet, but the typecheck did not ship** - `quickstart.mdx` loads `/src/snippets/edge-sdk/quickstart.ts?raw` and arrived with APM-365 #749 on 2026-08-27. Main has no `tsconfig.snippets.json`, no snippet script, no workflow step, and no `@aembit/edge-sdk` dependency.
F9 - **The local `tsconfig.snippets.json` is gone** - the worktree switched to main on 08-26 at 13:37, and the file no longer exists on disk. I rebuilt it in a scratch project from the contents I read earlier.
F10 - **The wrong host in F3 came from upstream** - the local `quickstart.ts` was adapted from the edge-sdks `ts/README.md` Quickstart. That README still shows `baseUrl: "https://tenant.aembit.io"`.

## Verified

V1 - **The snippet on main compiles today** - `tsc` passed against `@aembit/edge-sdk@1.34.1` with the original tsconfig settings, but nothing will catch a future break.

## Caveats

C1 - **The TICKET-1 text I quoted is from earlier this session** - the Atlassian plugin has disconnected, and it needs re-authorization through `/mcp` in an interactive session.

## Questions

❓ **Q2** - **Should we add the missing snippet typecheck to main?** - This would be a separate tooling PR. It adds the tsconfig, a pinned `@aembit/edge-sdk` devDependency, a script, and a CI step.
   a. Add it. An SDK API change then fails the docs build before a broken quickstart ships, but someone has to bump the pinned version with each SDK release.
   b. Leave it. Readers are the first to hit the break when the SDK API changes.

➡️ a - the quickstart is the first code a new SDK user runs, and nothing else checks it.

❓ **Q3** - **Which ticket should carry the work?**
   a. A new ATD under TICKET-5, linked from TICKET-4. The TypeScript check ships now.
   b. Fold it into TICKET-4. That ticket is blocked on SDK-21, so the TypeScript check would wait behind the Python work.

➡️ a - the TypeScript check is not blocked by anything.
