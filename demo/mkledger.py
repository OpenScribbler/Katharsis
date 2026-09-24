#!/usr/bin/env python3
"""Write a small curated ledger for the drawer GIFs into a scratch KATHARSIS_DATA.
Usage: mkledger.py <data-dir> <session-id>"""
import json, os, sys

data, sid = sys.argv[1], sys.argv[2]
# Dated ahead so the curated titles supersede what the seed reply records.
ts = "2030-01-01T00:00:00+00:00"

rows = [
    ("F", 1, "The 3 failing tests share one cause: a stale fixture", "tests/fixtures/users.json predates the email column, so every insert fails validation."),
    ("F", 2, "Retries mask the timeout rather than fix it", "The client retries 5 times at 2s each, so a hung call surfaces after 10s as a generic error."),
    ("F", 3, "Staging runs Postgres 15 and production runs 16", "The JSON path syntax in the report query only parses on 16."),
    ("C", 1, "Load behavior was checked at 50 users, not 500", "The staging box caps connections at 60, so the 500-user case is untested."),
    ("AT", 1, "Regenerated the fixture from the current schema", "All 41 tests pass; `make fixtures` rebuilds it."),
    ("AT", 2, "Set the client timeout to 4s with 2 retries", "A hung call now fails in 8s with the endpoint named in the error."),
    ("AT", 3, "Pinned staging to Postgres 16", "The report query runs on staging; `docker-compose.yml` line 12."),
    ("NA", 1, "Add a CI check that fails when fixtures drift from the schema", "The same drift will recur on the next migration without it."),
    ("NA", 2, "Load-test at 500 users once the staging cap is raised", "That closes C1."),
    ("S", 1, "PR #214 is green and waiting on review", "Covers AT1 through AT3."),
    ("W", 1, "The nightly migration dry run reports back at 02:00", "A failure there blocks the release tag."),
]
q = {
    "code": "Q1", "prefix": "Q", "n": 1,
    "title": "Ship the timeout change in this release or the next?",
    "summary": "It changes the error text that two dashboards alert on.",
    "options": [{"key": "a", "text": "This release, and update both alerts today."},
                {"key": "b", "text": "Next release, after the alert owners sign off."}],
    "rec": "a - the alerts are a two-line change and the hang costs users now.",
}

out = os.path.join(data, "ledger", "demo")
os.makedirs(out, exist_ok=True)
with open(os.path.join(out, f"{sid}.jsonl"), "w") as f:
    for p, n, title, summary in rows:
        f.write(json.dumps({"ts": ts, "session_id": sid, "project": "demo", "code": f"{p}{n}",
                            "prefix": p, "n": n, "known": True, "title": title,
                            "summary": summary}) + "\n")
    f.write(json.dumps({"ts": ts, "session_id": sid, "project": "demo", "known": True, **q}) + "\n")
open(os.path.join(data, f".active-{sid}"), "w").close()
print(f"rows={len(rows) + 1}")
