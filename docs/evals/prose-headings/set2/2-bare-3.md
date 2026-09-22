Yes, and it already works: `ledger-stop.sh` detects codes by shape rather than by an allowlist, so the stock set is a `known: true|false` field rather than a filter.

I ran a reply defining `WV` under a `## Wave codes` header through the hook. It recorded `{"code": "WV1", "prefix": "WV", "known": false, "section": "Wave codes", "section_note": "WV marks a migration wave…"}` — the defining sentence rides along with the item, because `section_note` captures the first line under each header. `kref WV --full` prints it back under that header, a bare `kref` sorts stock codes ahead of it, and `kref --next` returns `F10  WV2`. `tests/test-kref.sh:94-99` and `tests/test-ledger.sh:66` already assert all of that.

One constraint: the prefix must be uppercase, 1 to 4 characters, and immediately followed by a digit — `WV`, `T-O`, and `MIG` capture; `wave1` and `MIGR1` do not.
