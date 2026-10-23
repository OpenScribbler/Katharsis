# Page assets

`scripts/katharsis-artifact.sh` builds every page Katharsis writes under `~/.claude/katharsis-data/pages/` from these
two files. On every page write it copies `katharsis.css` and `katharsis.js` over the copies in `pages/`, and every page
links them by relative path, so a change here reaches every page already written the next time any page is rendered.

- `katharsis.css` holds the Flexoki color tokens and the page shell. Its header carries Flexoki's MIT license, which
  ships with every copy.
- `katharsis.js` is the theme toggle. It applies a stored choice before the body draws and keeps it in
  `localStorage` under `katharsis-theme`. With no choice stored, or with storage blocked, the page follows the OS. On a
  question page it also runs the tabs, the picks, and the copy bar described below. Loaded with no `document`, as a
  test loads it, it only sets `KatharsisPage.answerLines` on the global object.

## The shell

A page uses these parts, in this order.

| Part | Class | Use it for |
|---|---|---|
| Header | `.k-header`, `.k-title`, `.k-toggle` | The page's title and the theme toggle. Every page has one. |
| Takeaway | `.k-takeaway` | The one sentence the reply also carries, above the figure. Leave it out when there is none. |
| Figure | `.k-figure` | The rendered SVG, inline. Dark mode inverts the drawing and turns the hues back, so one render serves both themes. The script sets `--k-svg-width` on the figure to the drawing's viewBox width, so a drawing wider than the page keeps that width and the figure scrolls sideways. |
| Footer | `.k-footer` | The renderer, a link to the source file beside the page, and the Flexoki credit. Every page has one. |

## Question pages

`katharsis-artifact.sh ask` puts the model's body fragment inside `<main class="k-ask">`, between the header and a copy
bar, and `katharsis.js` adds every behavior from these attributes, so the body holds no script.

| Markup | What `katharsis.js` does with it |
|---|---|
| `<section class="k-q" id="Q12" data-title="Session store">` | One question. The `id` is the question's code exactly as the reply writes it, and `data-title` is the tab's short label. The script builds one tab per section in page order, before the first section, and shows one section at a time; the arrow keys, Home, and End move between tabs. A `#Q12` at the end of the page's address opens that tab. |
| `<div class="k-option" data-letter="a">` inside a section | One option, with the option's own heading and its consequences inside it. A click, Enter, or Space picks it and clears any other pick in that question; a second click clears it. A link inside an option follows the link and picks nothing. |
| `data-affects="Q13"` on an option | The questions this option's pick bears on, separated by spaces or commas. The script adds an `Affects Q13 Session expiry` line of links to the option, and while the option is picked it marks each affected tab and opens each affected section with an `Affected by your pick: Q12 b` line. A code that names no section, or the option's own question, is ignored. |
| `<a href="#Q13">` anywhere in the body | Switches to that question's tab. With scripts off it scrolls to the section. |

With scripts off, every section stays visible in page order and no copy bar shows. A table inside the body scrolls
sideways at phone width.

The copy bar holds the Copy answers button, a preview of what it copies, and a status line. It copies one `Q12 a` line
per question that holds a pick, in page order, joined by newlines, which is what the drawer's send posts for picks with
no note (`answerText` in `hooks/drawer.tsx`; `tests/question-page.test.ts` holds the two to the same text). With no
pick it copies nothing and says so. It tries the Clipboard API, then the browser's older copy command, and when both
fail it asks the user to select the preview and copy it.

| Part | Class |
|---|---|
| Body | `.k-ask` |
| Tabs, built by the script | `.k-tabs`, `.k-tab`, `.k-tab-code`, `.k-tab-title`, `.k-tab-pick`, `.k-tab-flag` |
| Question and option | `.k-q`, `.k-option`, `.k-affects`, `.k-notice` |
| Copy bar | `.k-answers`, `.k-copy`, `.k-preview`, `.k-copied` |

## Tokens

Rules use only the semantic `--k-*` tokens, never a `--flexoki-*` value, so one rule serves both themes. The light set
sits on `:root`. The dark set applies under `prefers-color-scheme: dark` unless the toggle chose light, and under
`data-theme="dark"`.

| Token | Role |
|---|---|
| `--k-bg`, `--k-bg-2` | Main and secondary background |
| `--k-tx`, `--k-tx-2`, `--k-tx-3` | Primary, muted, and faint text |
| `--k-ui`, `--k-ui-2`, `--k-ui-3` | Borders: normal, hovered, active |
| `--k-accent` | Links and active states |
| `--k-error`, `--k-warning`, `--k-success` | Status colors |
| `--k-figure-filter` | The filter the figure's SVG takes in each theme |

The role mapping is the one stephango.com/flexoki uses. A new token or part lands in this file, `katharsis.css`, and
the script's page template together.
