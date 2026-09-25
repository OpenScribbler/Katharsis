---
title: kref
description: Read the ledger of coded items from Claude Code or your terminal.
---

`kref` prints items from the ledger.
In Claude Code, prefix it with `!` to run it without a model turn.
Bash mode needs `kref` on your `PATH`, which the [symlink command](#run-kref-from-your-terminal) sets up.

```
! kref            All items from this session, grouped by code
! kref F3         One item
! kref F          Every F item from this session, or from every session if this one has none
! kref -s NA      Titles only
! kref -c         Items in the order they were written
! kref -n         The next free number for each code
! kref-h          The result as an HTML page
```

A query that matches nothing in this session searches every session on record.

## Run kref from your terminal

Link the wrappers into a directory on your `PATH`:

```sh
ln -s ~/.claude/katharsis/bin/kref ~/.claude/katharsis/bin/kref-m ~/.claude/katharsis/bin/kref-h ~/.local/bin/
```

## Example

This recording uses a ledger from a four-day session with 225 coded items.
`kref F100` fetches a finding from two days earlier, and `kref -n` shows the next free numbers.

![A long session: the C21 chip recalls an old caveat, the drawer searches the ledger, and kref fetches F100](../../../../../demo/media/session.gif)
