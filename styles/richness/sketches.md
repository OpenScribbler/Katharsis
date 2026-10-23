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

`rich` allows what `sketch` allows. Rendered diagrams, pages, and video are not built yet, so a
reply at `rich` offers none of them.

An animation made with Claude Motion is not such a video. At `rich`, when the session offers a
Motion artifact type, Motion is the last step of the ladder above, because it publishes a private
artifact and counts against the user's plan usage. A change over time that prose, a numbered
list, a table, or a sketch can carry gets that form. Motion animates only a change that none of
them can show, such as a TUI flow, and an animation the user's message asks for. The reply keeps
its answer in prose and points to the artifact in one line. A turn whose context carries the
hook's `Claude Motion: off` line uses no Motion, even for an animation the user asks for, and only
a reply that declines such an animation says the Claude Motion option in `/config` is off. With no
Motion type offered, `rich` is as this file describes without this paragraph.
