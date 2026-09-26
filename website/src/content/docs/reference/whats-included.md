---
title: What's included
description: Every file the plugin ships and what it does.
---

| Path | Kind | What it does |
|---|---|---|
| `output-styles/katharsis.md`, `katharsis-coding.md` | Output styles | The classification table, the reference codes, the question form. One body, two frontmatters. |
| `styles/*.md` | Guidance files | One per exchange type: cues, ceiling, shape, ambiguities, verification, examples. `README.md` holds the shared rules. |
| `styles/models/*.md` | Model notes | One per model family, or per version where a version needs its own, attached by the prompt hook when the note changes and after a compaction. |
| `scripts/katharsis-exchange-style.sh` | Script | Prints a type's guidance file and stamps the type. The model runs it once per typed turn. |
| `hooks/register.ts` | Hooks module | The prompt hook: the per-turn reminder, the active-session marker, the handoff chain link, the next free code numbers. |
| `hooks/drawer.tsx` | Hooks module | [The drawer](../../how/drawer/): the band, the drawer `/kdrawer` opens, and the reply chips. |
| `scripts/stop-classify.sh` | Hook | Stop: consumes the stamp, records a miss to telemetry, never blocks. |
| `scripts/ledger-stop.sh` | Hook | Stop: writes every coded item in the reply to the ledger, records per-reply counts, and holds the reply once for a code whose claim changed. |
| `scripts/stop-verifier.sh` | Hook | Stop: holds the reply once for an opening that buries the finding, and asks for the finding on its own line rather than a rewrite. |
| `scripts/detect-reply.sh`, `scripts/packs/*.txt` | Script | Runs the writing rules over one reply and prints a fix line per hit. The verifier calls it, and you can run it over a saved reply. |
| `scripts/session-link.sh` | Hook | SessionStart: remakes the `~/.claude/katharsis` symlink and asks for setup until setup has run. |
| `cli/kref.ts`, `bin/kref` | Script | Reads the ledger back in the terminal, as JSON, or as HTML. |
| `scripts/setup.sh`, `skills/setup/` | Setup | Checks the Claude Code version and the function-hooks variable, adds the one permission entry, and names the two styles. |
| `hooks/hooks.json` | Manifest | Wires the five hooks and names the hooks module. |

