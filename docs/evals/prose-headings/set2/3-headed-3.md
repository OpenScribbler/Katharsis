A quickstart owns the console configuration and has no environment. An integration guide assumes the configuration already exists and owns exactly one platform. That difference rules out pushing a quickstart upstream, which was my fallback recommendation.

The two page shapes in this docs set already show it. The existing Edge API quickstart runs 1,008 lines to its summary and spends Step 1 and Step 2 entirely in the Aembit console — Trust Provider, Client Workload, Credential Provider, Server Workload, Access Policy — before any code appears in Step 3. The Cloud Run integration guide has seven headings, opens with "Where the token comes from", and goes straight to "Write the function". One teaches first success once; the other deploys a known configuration onto a named platform.

That is why `ts/examples/` holds six directories named for environments and none named for a task. A runnable example must run somewhere. A quickstart deliberately runs nowhere, so making it runnable means picking a platform, and picking a platform converts it into an integration guide. TICKET-1 already recorded this as decided: "the site owns the console↔code bridge; the repo README keeps a package-only quickstart. No overlap. **Boundary:** deep code → repo examples."

The consequence you have not named is what this does to the scaffold. The quickstart's snippet is the only Edge SDK code in the docs set with no upstream example behind it, and by that boundary it never will have one. So the docs-repo typecheck is not a duplicate of edge-sdks CI — it is the only check available for the one page the boundary keeps on the site. Deleting it removes verification from the single snippet that cannot borrow any.

Its guarantee is narrower than a runnable example's, though. A typecheck would pass `baseUrl: "https://tenant.aembit.io"` unchanged, because that is a string. It catches renamed exports and changed option shapes, which matters at 1.34.0-rc.4, and it catches nothing about whether the values are right.

## Errata

E1 - **My Q1 recommendation was wrong** - I recommended (a) delete, falling back to (c) upstream a quickstart example; (c) contradicts the D5 boundary already recorded on TICKET-1, and (a) discards the only check the quickstart can have.

## Questions

❓ **Q2** - **Where does the snippet scaffold land, now that the quickstart cannot borrow an example?** - Q1 is spent; these are the options the genre distinction leaves standing.
   a. Wire it under TICKET-1, scoped to quickstart snippets only — the page that needs it owns the dependency, and the scope stays one file rather than growing into a parallel sample tree
   b. Wire it as its own ATD under TICKET-5, so TICKET-4's Python request has a real TypeScript precedent to extend — honest dependency, one more ticket
   c. Keep the files parked untracked until TICKET-1 actually starts — costs nothing now, risks the same rediscovery we just did

➡️ **a** — the scaffold's only justified consumer is the Quickstart page, so it should ship as that page's content dependency and pass the repo's own dependency test. TICKET-4 can then point at TICKET-1 for the TypeScript precedent instead of at a standalone infrastructure ticket.
