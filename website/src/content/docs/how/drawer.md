---
title: The drawer
description: Browse coded items inside Claude Code from the band, the pane, and the rows under each reply.
---

The drawer shows ledger items inside Claude Code.
It needs [function hooks](../../start/install/#function-hooks) and appears only when a Katharsis style is active.

## Band

The band sits above the prompt and lists the code types in the session, such as `F:3|C:1|AT:2|Q:1`.
Hover a type to see its 10 latest titles.
Select a title to open that item, or select the type to list every item of that type.

![The pointer hovers the NA label in the band, then selects it, and the pane lists every next action](../../../../../demo/media/drawer-band.gif)

![The pointer hovers the AT label and selects the AT2 title, which opens its card in the pane](../../../../../demo/media/drawer-hover.gif)

## Pane

To open the pane, select **open** on the band or run `/kdrawer [query]`.
The pane groups items by type and has a search box, a filter menu, and a toggle between titles and full items.
A query spelled as a code, such as `F3`, finds that code only.
Press Esc to close the pane.

![The pane: a search for timeout, the filter menu, the Next actions filter, and the full view](../../../../../demo/media/drawer-drawer.gif)

## Codes in a reply

Each code in a reply is a link that opens the item in the pane.
The **Codes this turn** row under the reply lists the codes the reply cites.
Hover a code to see the full item.

![Hovering the F1 and AT2 chips under a reply shows their cards](../../../../../demo/media/drawer-chips.gif)

## Still open

The **Still open** row under the latest reply lists open questions, your moves, blocks, and risks.
It shows the 3 newest of each type and a count of the rest.
Select **show all** to list them in the pane.

| Code | Closes when |
|---|---|
| `Q` | You answer it, or a later `AT` or `V` line cites it |
| `NA`, `MV`, `W` | A later `AT` or `V` line cites it |
| `B`, `R` | Any later coded line cites it |
| `F` | Never |

A closed item's card shows a check mark and what closed it, such as `✓ Answered: b · Closed by AT22`.
A finding's card lists the codes that cite it.
