**16 repos found that shape or shorten Claude Code replies, grouped by how close their mechanism is to Katharsis.**

Katharsis classifies the message, reads a per-type guide, sizes the reply, codes items, and enforces through a Stop hook and a ledger. Nothing I found does the classify-then-shape step. The nearest neighbours are the ones that enforce reply shape through hooks rather than prompt text alone.

## Closest: hook-enforced reply shape

- [justinstimatze/cope](https://github.com/justinstimatze/cope) - A linter that scores each reply on voicing (editable "cards") and structure (reply shape, decision placement, ending clarity) through hooks, with A/B testing. The only one that judges reply structure, so it is the nearest cousin.
- [hseinmoussa/exo](https://github.com/hseinmoussa/exo) - Action-first output through three layers: a per-turn hook injecting rules, a response linter that rejects filler endings, and an optional output style.
- [HurleySk/terse](https://github.com/HurleySk/terse) - A UserPromptSubmit hook measures prose in the last reply and injects a correction only when the word budget is exceeded, plus PreToolUse hooks that block noise comments.
- [elon-choo/fablever](https://github.com/elon-choo/fablever) - Applies Anthropic's Fable working-style guidance as an always-on output style with hooks, an MCP server, and subagent injection, with offline measurements.

## Output styles for terse or answer-first replies

- [raiyanyahya/justsaydone](https://github.com/raiyanyahya/justsaydone) - A plugin output style that replies "done" after work turns, with "explain" or "why" as the escape hatch for one full reply.
- [borgr/claude-readable-reports](https://github.com/borgr/claude-readable-reports) - Two styles, one reformatting long agent reports into conclusions with context, one for co-writing papers and grants.
- [DennisWei9898/verbosity-tuner](https://github.com/DennisWei9898/verbosity-tuner) - An audit script, a handbook, and a skill for applying the built-in Concise style without losing engineering instructions.
- [jensensics/claude-code-output-styles](https://github.com/jensensics/claude-code-output-styles) - A guide to writing custom output styles, with a word-count-optimised example using mechanical rules such as one line per point.

## Skills and prompt files that compress output

- [adnanakil/nobuzz](https://github.com/adnanakil/nobuzz) - Your starting point. A skill that pipes Claude's last reply through Gemini via the Antigravity CLI to strip the "BuzzFeed voice", with colleague, manager, and director modes.
- [o4f6bgpac3/concise](https://github.com/o4f6bgpac3/concise) - A skill that cuts output tokens by a claimed 60 to 70 percent while keeping natural English.
- [Dragoon0x/terse](https://github.com/Dragoon0x/terse) - A skill with 10 modes and 5 levels that compresses replies while protecting code, identifiers, numbers, and safety caveats. Labelled experimental.
- [drona23/claude-token-efficient](https://github.com/drona23/claude-token-efficient) - One CLAUDE.md file with terse response rules, claiming 63 percent output reduction.

## Style collections

- [smixs/awesome-claude-output-styles](https://github.com/smixs/awesome-claude-output-styles) - 20 styles built from credited methodologies, with an install script and an `--enforce` flag that adds the per-turn reinforcement hook Katharsis also relies on.
- [hesreallyhim/awesome-claude-code-output-styles-that-i-really-like](https://github.com/hesreallyhim/awesome-claude-code-output-styles-that-i-really-like) - Curated persona styles, mostly playful.
- [CaptCanadaMan/claude-personas](https://github.com/CaptCanadaMan/claude-personas) - 17 archetype voices compiled from personality dials into hot-swappable output styles.
- [anthropics/claude-code learning-output-style](https://github.com/anthropics/claude-code/tree/main/plugins/learning-output-style) - Anthropic's own reference plugin for shipping an output style.

## Caveats

C1 - **Descriptions for claude-personas and learning-output-style come from search snippets and the GitHub topic page** - I fetched and verified the other 14 READMEs directly.

C2 - **Search covered GitHub topics, web search, and README fetches, all on 2026-09-11** - the `output-styles` topic page lists 11 repos and I did not crawl `claude-code-plugins` or the plugin marketplaces, so more exist.

## Questions

❓ **Q1** - **Save this list into the repo?** - a "Related projects" section in the README or a `docs/related.md` file would keep it findable.
   a. add to README as a short section
   b. add `docs/related.md` with this full grouped list
   c. leave it in the chat only

➡️ c - you asked for a list here, and a README section is a separate call about what Katharsis's front page should carry.
