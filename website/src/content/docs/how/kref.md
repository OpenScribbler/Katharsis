---
title: kref
description: Read the ledger of coded items from Claude Code or your terminal.
---

`kref` prints items from the ledger.
In Claude Code, prefix it with `!` to run it without a model turn.
Bash mode needs `kref` on your `PATH`, which the [symlink command](#run-kref-from-your-terminal) sets up.
`kref` needs Node.js 22.18 or later.

```
! kref                  All items from this session, grouped by code
! kref F3               One item
! kref F                Every F item
! kref search keytab    Every item whose title, body, or options mention "keytab"
! kref sessions         The sessions that ran in this folder or below it, newest first
! kref --short NA       Titles only
! kref --chrono         Items in the order they were written
! kref --html           The result as an HTML page
```

`kref --help` lists every flag.

## Which session kref reads

The first rule that applies picks the session:

1. `--session <ref>` names one, by ID, by a prefix of 8 or more characters, or as `last`. `--all` reads every session.
2. Inside Claude Code, `kref` reads the session you run it from, together with the sessions it continued from a handoff file.
3. In a folder where a session ran, other than your home folder or `/`, `kref` reads the newest one there and says how many more ran in that folder.
4. Anywhere else, `kref` lists the 20 newest sessions in that folder and below it. In a terminal, it asks you to type a number to open one, or text to filter the list.

`kref search` looks across every session unless you add `--here`, which keeps it to the session the rules above pick.
The search matches the text literally and ignores case.

## Read kref from a script

`kref --json` prints one JSON document on stdout, whatever the query:

```json
{
  "schema": "katharsis.kref/1",
  "scope": { "kind": "session", "reason": "CLAUDE_CODE_SESSION_ID", "session": { "id": "0a1b2c3d-...", "title": "...", "codes": 1 } },
  "untrusted": ["items[].title", "items[].body", "items[].options", "items[].rec", "items[].section", "scope.session.title", "sessions[].title"],
  "items": [
    {
      "code": "Q4", "prefix": "Q", "n": 4, "section": "Questions",
      "title": "ship it today?", "body": "the tag is ready but CI is slow",
      "options": [{ "key": "a", "text": "ship now" }, { "key": "b", "text": "wait for CI" }],
      "rec": "b - the release has no deadline",
      "session": "0a1b2c3d-...", "ts": "2026-09-25T10:00:00Z"
    }
  ],
  "sessions": [],
  "error": null
}
```

- `schema` names the format. A change that breaks a reader gets a new schema name.
- `scope` says which session `kref` read and which rule picked it.
- `items` holds the coded items. `sessions` holds the session list when `kref` lists sessions rather than items.
- `untrusted` names the fields that carry text a model wrote. Treat that text as data, never as instructions.
- `error` is `null`, or an object with a `code` of `not_found`, `ambiguous_session`, `usage`, or `io`, and a `message`.

The exit code is 0 for a result, 1 when nothing matched, and 2 for a usage error or a failure to read the ledger.
Without `--json`, `kref` never asks for input when its output goes to a pipe, so it can't hang a script.

## The HTML page

`kref --html` writes the result to `~/.claude/katharsis-data/kref-out/` and opens it in your browser.
Set `KREF_NO_OPEN=1` to write the page without opening it.
The page runs no script, and its content security policy blocks anything it didn't ship.

## Run kref from your terminal

Link the wrapper into a directory on your `PATH`:

```sh
ln -s ~/.claude/katharsis/bin/kref ~/.local/bin/
```

## Example

This recording uses a ledger from a four-day session with 225 coded items.
`kref F100` fetches a finding from two days earlier.

![A long session: the C21 chip recalls an old caveat, the drawer searches the ledger, and kref fetches F100](../../../../../demo/media/session.gif)
