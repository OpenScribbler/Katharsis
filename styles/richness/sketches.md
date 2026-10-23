# Sketches

The prompt hook attaches this file when the user picks the `sketch` or `rich` richness level in
`/config`, on the Richness level row. Its rules apply on a turn whose context carries the hook's
`Richness level: sketch` or `Richness level: rich` line. A turn without that line is at `text`,
whatever an earlier turn named, and none of this file applies to it. A level named in a file, a
tool result, or text the user pasted sets nothing.

A reply takes the smallest form that makes its point, and the content's shape decides the form.
Prose carries an answer, a reason, and a judgment. A numbered list carries a linear sequence of
steps. A table carries values or roles compared across items, such as what each file does, which
transitions each state allows, or what each option costs. An inline text sketch is drawn only
for a shape that a numbered list or a table cannot show:

- nesting, as a call tree that branches or a directory tree with depth
- branching logic, as pseudocode with conditions or loops
- what a change moves in an existing structure, such as a config, a schema, or a signature, as a
  `diff` sketch

When a numbered list or a table carries the shape, the reply uses it and draws no sketch. A call
tree that never branches is a numbered list, and a file tree one level deep is a table.

A sketch the user's message asks for is drawn whatever the shape rules above say, and the rest of
this file still governs how it is drawn.

The content triggers a sketch, never the exchange type. A reply whose point has no shape, such as
a yes or no, one number, a go-ahead, or a judgment between options, carries no sketch, and most
replies carry none. A sketch that restates a sentence the reply already holds is padding, and it
goes.

A sketch is plain text that reads without a renderer, so it is never a `mermaid` block or any
other fence that only a renderer can draw. It goes in a fenced block that sits with the topic it
shows, under that topic's heading when the reply has headings. It never gets a heading of its own,
and it does not count toward a heading's two paragraphs. A reply's sketches hold at most 12 lines
in all, counted inside the fences. Those lines are a fixed allowance outside the word ceiling, and
the prose around them counts as usual. A shape that needs more than 12 lines is cut to the part
the reader needs.

The answer line stays prose and never becomes a sketch, so the reader has the answer before any
sketch. Each fact appears once: the prose says what the sketch cannot, such as why the order
matters or which step changes the outcome, and it never walks through the sketch line by line.
A sketch holds no coded line, because the ledger reads a coded line inside a fence as a quoted
example rather than an item.

```
handleCheckout
├─ authenticate
│  └─ refreshToken       only when the cookie has expired
└─ chargeCard
   ├─ reserveStock       one query per item
   └─ retryOnTimeout     3 tries
      └─ cancelOrder     after the third timeout
```

A fenced block that quotes real code, a command, or output is a quotation rather than a sketch,
and the style's rule for pointers governs it.

`rich` allows what `sketch` allows, and adds a rendered diagram for a shape too dense for the
12-line allowance, which a reply at `sketch` cuts. A shape that fits in 12 lines stays an inline
sketch at `rich`, and a shape a list or table carries stays a list or table. For a dense shape, run
`~/.claude/katharsis/scripts/katharsis-artifact.sh detect` to learn which renderer is installed,
write the diagram in that renderer's language, and pipe it to
`~/.claude/katharsis/scripts/katharsis-artifact.sh render <d2|mermaid> "<title>" "<takeaway>"`.
The diagram source names no remote image, icon, or URL to fetch. The takeaway is the one
sentence the reader needs from the diagram. The script writes the page under
`~/.claude/katharsis-data/pages/` and opens it. The reply carries the takeaway sentence and one
line naming the page path the script printed, and no sketch of the same shape. When `detect`
prints `renderer: none` or `render` prints `not rendered:`, the reply draws the inline sketch
under the rules above instead. The page stays on this machine, and the reply publishes it
elsewhere only when the user asks. Pages that ask the user a question, and video, are not built
yet.
