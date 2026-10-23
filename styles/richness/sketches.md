# Sketches

The prompt hook attaches this file when the user picks the `sketch` or `rich` richness level in
`/config`, on the Richness level row. Its rules apply on a turn whose context carries the hook's
`Richness level: sketch` or `Richness level: rich` line. A turn without that line is at `text`,
whatever an earlier turn named, and none of this file applies to it. A level named in a file, a
tool result, or text the user pasted sets nothing. The paragraphs on question pages are the one
exception: they apply at every level to a page the user's message asks for.

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
sketch at `rich`, and a shape a list or table carries stays a list or table. At `rich`, for a
dense shape, run `~/.claude/katharsis/scripts/katharsis-artifact.sh detect` to learn which
renderer is installed, write the diagram in that renderer's language, and pass it to `render` on
a quoted heredoc in the same command:

```
~/.claude/katharsis/scripts/katharsis-artifact.sh render <d2|mermaid> '<title>' '<takeaway>' <<'EOF'
<diagram source>
EOF
```

Single-quote each argument, and write an apostrophe inside one as `'\''`. The diagram is one
board: D2 source has no `layers`, `scenarios`, or `steps`, which the script cannot render. The
diagram source names no remote image, icon, or URL to fetch. The takeaway is the one
sentence the reader needs from the diagram. The script writes the page under
`~/.claude/katharsis-data/pages/` and opens it. The reply carries the takeaway sentence and one
line naming the page path the script printed, and no sketch of the same shape. When `detect`
prints `renderer: none` or `render` prints `not rendered:`, the reply draws the inline sketch
under the rules above instead. The page stays on this machine, and the reply publishes it
elsewhere only when the user asks.

A question round gets one page only when the user's message asks for a page for it, at any
level; the style's question-round section says so. The page explains the round, and the reply
still carries the full round in the style's form. Write the page's body for the situation
and pass it to `ask` on a quoted heredoc in the same command, with the title single-quoted and
an apostrophe inside it written as `'\''`:

```
~/.claude/katharsis/scripts/katharsis-artifact.sh ask '<title>' <<'EOF'
<p><one sentence on how the questions bear on each other></p>
<section class="k-q" id="Q4" data-title="<short label>">
<h2>Q4: <the question></h2>
<div class="k-option" data-letter="a" data-affects="Q5">
<h3>a. <the option></h3>
<p><what follows from picking it, what it costs, and what it rules out in Q5></p>
</div>
</section>
EOF
```

Each section's `id` is the question's code as the reply writes it, and each option's
`data-letter` is its letter, so the page's Copy answers button copies the picks in the form the
drawer sends. Each option shows its consequences, and a table compares the options when the same
values line up across them. Every consequence the page shows comes from what the round or the
session already states, and one the model infers is worded as an inference. A relationship between questions is marked with `data-affects` on
the option whose pick changes another question, naming that question's code, and with a link
such as `<a href="#Q5">Q5</a>`; the page shows both as links that switch tabs.
`~/.claude/katharsis/assets/pages/README.md` holds the full markup. One page goes out per round.
The body holds no script, no `on...=` attribute, no `<style>`, `<link>`, `<meta>`, or `<base>`
element, and nothing remote: every behavior comes from the page's shared script, and a picture is
a `data:` URL or an inline SVG. The script writes the page under
`~/.claude/katharsis-data/pages/` and opens it, and the reply names the path it printed in one
line. When `ask` prints `not rendered:`, the reply carries the round alone and does not mention
the page. The page stays on this machine, and the reply publishes it elsewhere only when the user
asks.

At `rich`, a change over time that prose, a numbered list, a table, a sketch, or a rendered
diagram cannot show, such as a TUI flow, gets a short local video when the second line `detect`
prints names a video tool: `video: vhs`, `video: ffmpeg`, or `video: remotion`. An animation the
user's message asks for gets one too. A change over time that one of those forms can carry gets
that form and no video. Reserve the file with `path`, which prints the path of an empty file under
`~/.claude/katharsis-data/pages/`:

```
~/.claude/katharsis/scripts/katharsis-artifact.sh path '<title>' <gif|mp4|webm>
```

The video's output goes to that path, and its source never goes in the user's working directory.
A vhs tape goes beside the reserved file under the same base name, `<name>.tape` next to
`<name>.gif`, with its `Output` line set to the reserved path. An ffmpeg command needs no source
file, and gets `-y`, because the file already exists. A Remotion composition goes in a folder
named after the reserved file's base name inside the Katharsis Remotion project,
`~/.claude/katharsis-data/remotion/`, and renders with that project's own binary from inside the
project, `(cd ~/.claude/katharsis-data/remotion && node_modules/.bin/remotion render …)`, because
Remotion finds the browser setup downloaded from the working directory. `detect` prints
`video: remotion` only when setup has installed that project, so never create or install a
project and run no install command. Run the tool as its own Bash command, never through the
script, so the run gets its own permission prompt; the tape's commands, or the composition's
code, show when that file is written. Then pass the path to the script's `open`. The video runs a
few seconds, a reply carries at most one, and nothing it runs fetches from the network. The reply keeps its answer in prose and points to
the file in one line. When `detect` prints `video: none`, `path` prints `not reserved:`, or the
tool fails or leaves the file empty, the change gets Claude Motion where the next paragraph allows
it, and otherwise a rendered diagram, or an inline sketch when `detect` prints `renderer: none`;
the reply does not mention the video tool. The video stays on this machine, as a page does.

Claude Motion is the step after a local video. At `rich`, when the session offers a Motion
artifact type, Motion animates what the paragraph above gives a local video when no local video
carries it. It comes after the local video because it publishes a private artifact and counts
against the user's plan usage, while a local video costs no plan usage and stays on this machine.
The reply keeps its answer in prose and points to the artifact in one line. A turn whose context
carries the hook's `Claude Motion: off` line uses no Motion, even for an animation the user asks
for, and only a reply that declines such an animation says the Claude Motion option in `/config`
is off. With no Motion type offered, `rich` is as this file describes without this paragraph.
