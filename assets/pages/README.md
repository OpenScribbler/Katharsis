# Page assets

`scripts/katharsis-artifact.sh` builds every page Katharsis writes under `~/.claude/katharsis-data/pages/` from these
two files. On every page write it copies `katharsis.css` and `katharsis.js` over the copies in `pages/`, and every page
links them by relative path, so a change here reaches every page already written the next time any page is rendered.

- `katharsis.css` holds the Flexoki color tokens and the page shell. Its header carries Flexoki's MIT license, which
  ships with every copy.
- `katharsis.js` is the theme toggle. It applies a stored choice before the body draws and keeps it in
  `localStorage` under `katharsis-theme`. With no choice stored, or with storage blocked, the page follows the OS.

## The shell

A page uses these parts, in this order.

| Part | Class | Use it for |
|---|---|---|
| Header | `.k-header`, `.k-title`, `.k-toggle` | The page's title and the theme toggle. Every page has one. |
| Takeaway | `.k-takeaway` | The one sentence the reply also carries, above the figure. Leave it out when there is none. |
| Figure | `.k-figure` | The rendered SVG, inline. Dark mode inverts the drawing and turns the hues back, so one render serves both themes. |
| Footer | `.k-footer` | The renderer, a link to the source file beside the page, and the Flexoki credit. Every page has one. |

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
