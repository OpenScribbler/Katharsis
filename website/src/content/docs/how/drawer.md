---
title: The drawer
description: The band, the pane, the reply chips, and the Still open row inside Claude Code.
---

With `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` set (see [Function hooks](../../start/install/#function-hooks)),
the ledger's items are one click away inside Claude Code. The drawer draws nothing in a session
where Katharsis is inactive.

## The band

A one-row band above the prompt names the code types the session has, such as
`▸ Katharsis · open | use /kdrawer · F:3|C:1|AT:2|Q:1`. Hover a type for its latest 10 titles,
then press a title to open that item in the pane, or press the type or its list-all button to list
every item of that type.

![The Katharsis band above the prompt: the pointer hovers the NA label, which pops up its 2 titles, then presses it, and the pane lists every next action](../../../../../demo/media/drawer-band.gif)

![The pointer hovers the AT label, moves up into its popup, and presses the AT2 title, which opens AT2's card in the pane](../../../../../demo/media/drawer-hover.gif)

## The pane

The band's open button, or `/kdrawer [query]`, opens a pane that groups every item under its
type's name (Findings, Caveats, Actions taken), with a search box, a filter menu, a Clear button
that resets both, and a toggle between titles only and the full view. The pane opens on titles
only; press a row to open that item as a card. A query spelled as a code, such as `F3`, finds
that code alone. Esc closes the pane.

![The drawer pane: a search for timeout, Clear, the filter menu with a count per type, the Next actions filter, and the full view](../../../../../demo/media/drawer-drawer.gif)

## Codes in a reply

In a reply, each code on record is a link: click it to open the pane at that item. A "Codes this
turn" row under the reply names the cited codes, and hovering a chip shows a card that starts with
what the code is, such as `F3 · Finding 3`, followed by the item in full.

![A reply with its codes as links and a row of chips under it: hovering the F1 and AT2 chips shows their cards, and clicking the inline AT2 opens the pane](../../../../../demo/media/drawer-chips.gif)

## Still open

Under the latest reply, a "Still open" row names what someone still has to act on: open
questions, your moves, blocks, and risks. It shows the 3 newest of each type with a count of the
rest, so an unsettled question never drops out of sight, and its "show all" button opens them all
in the pane.

An item leaves the row when something closes it:

| Code | Closes on |
|---|---|
| `Q` | Your answer, or a later action (`AT`) or check (`V`) that cites it |
| `NA`, `MV`, `W` | A later action or check that cites it |
| `B`, `R` | Any later coded line that cites it |
| `F` | Never; its card lists the codes that cite it |

A closed code's card shows a check beside the code and what closed it:
`✓ Answered: b · Closed by AT22`. The answer hint, `Ex: Q3 a or Q3 z <custom>`, shows on the row
in your first 3 sessions and afterward only in a question's hover card. Deleting `hint-sessions`
in the data directory brings it back.
