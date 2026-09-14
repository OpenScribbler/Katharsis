Searches done. I checked around 40 repos and read the closest 25. Writing up the list now.

Twenty-eight repos below do what Katharsis does in part. Only three classify the message per turn, which is the piece that makes Katharsis distinct.

## Per-turn classification or routing

These three route each message to a reply shape, so they are the closest cousins.

- [narek-keshishyan/claude-gist](https://github.com/narek-keshishyan/claude-gist) - A UserPromptSubmit hook runs a heuristic classifier and injects `THIS TURN: minimal|terse|full`. Destructive or security-sensitive work forces full prose.
- [turbobeest/shut-yer-yapper](https://github.com/turbobeest/shut-yer-yapper) - A "clarity router" picks one of four style rule sets (Hemingway, ADHD, STE, Caveman) per reply by reasoning load, ordered actions, and ambiguity. It protects substance and quoted text from compression.
- [andreavadacchino/fuoco-chiaro](https://github.com/andreavadacchino/fuoco-chiaro) - Escalates from Compact to Complete mode when it detects risk signals such as unproven root cause or destructive operations. Ships for Claude Code, Codex, and Cursor.

## Hook-enforced style

- [D0shi-Eng/precision-enforcer-for-claude-code](https://github.com/D0shi-Eng/precision-enforcer-for-claude-code) - Forced output style, per-turn reinforcement, and a deterministic Stop hook that checks prose length and repetition. Same three-layer mechanism as Katharsis, without the classification.
- [rennf93/opus-fable-playbook](https://github.com/rennf93/opus-fable-playbook) - Output style plus drift-catching hooks and an eval loop against golden transcripts. The eval loop is the part worth borrowing.
- [elon-choo/fablever](https://github.com/elon-choo/fablever) - Always-on style plus hooks and an MCP for subagent injection. Aims at Fable-like decisiveness and outcome-first framing.
- [HurleySk/terse](https://github.com/HurleySk/terse) - UserPromptSubmit hook measures prose against word budgets, PreToolUse hook denies over-commented code.
- [waitdeadai/llm-dark-patterns](https://github.com/waitdeadai/llm-dark-patterns) - Stop hooks with regex judges that block sycophancy, false-success claims, and permission loops, then hand back a repair template.
- [nagisanzenin/less](https://github.com/nagisanzenin/less) - UserPromptSubmit hook injects an answer-first protocol with pick-list replies. Three modes, no classification.
- [kmbt/10bps](https://github.com/kmbt/10bps) - Per-turn hook injects one rule line: under 40 words, no hedging, straight critique.
- [preeya/short-claude](https://github.com/preeya/short-claude) - Caps displayed reply at 70 words with "go on" paging, optional Stop hook for style enforcement.
- [V-Songbird/hush](https://github.com/V-Songbird/hush) - Cuts narration and trims tool output. Its benchmark reports median prose dropping from 367 to 69 words.

## Answer-first output styles, no hooks

- [michael-denyer/signal-output-style](https://github.com/michael-denyer/signal-output-style) - Sizes replies to the question: one fact gets one line, a design question gets a recommendation plus support. Every number carries unit and source.
- [kbluck/briefing-output-style](https://github.com/kbluck/briefing-output-style) - Answer before reasoning, no tool-call narration, a maintained banned-phrase log.
- [borgr/claude-readable-reports](https://github.com/borgr/claude-readable-reports) - Reorders content by importance rather than discovery order. Closest to your item-order rule.
- [nxofares/claude-straight-talk](https://github.com/nxofares/claude-straight-talk) - Answer first, evidence for claims, assumptions surfaced, decisions reported rather than steps.
- [VincentHHY/big-picture](https://github.com/VincentHHY/big-picture) - Keeps implementation detail below a marked line so the reader judges the decision without reading code.
- [alexgreensh/attention-span](https://github.com/alexgreensh/attention-span) - ADHD-friendly rules in about 650 tokens. Most-starred in this space at around 1,000.
- [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd) - Ten rules: lead with the next action, number steps, cap lists at five. Widely forked.
- [suffmade/no-mess](https://github.com/suffmade/no-mess) - Fourteen rules covering answer-first structure and flagged uncertainty.
- [amaezey/bro-skill](https://github.com/amaezey/bro-skill) - Resends a drifted reply in a fixed template: answer, bullets, tables, ranked options.
- [coderlevelup/straight-talk](https://github.com/coderlevelup/straight-talk) - Anti-filler and anti-softening rules written to CLAUDE.md.
- [raiyanyahya/justsaydone](https://github.com/raiyanyahya/justsaydone) - Replies "done" after verified work, full answer only when you ask for one.
- [carlosduplar/caveman-output-style-claude-code](https://github.com/carlosduplar/caveman-output-style-claude-code) and [fingerskier/terse-claude-plugin](https://github.com/fingerskier/terse-claude-plugin) - Telegraphic fragments for token savings, the opposite trade from your "cut content, not grammar" rule.

## Post-processors and collections

- [adnanakil/nobuzz](https://github.com/adnanakil/nobuzz) - The one you named. A `/debuzz` skill pipes the reply through Gemini via the Antigravity CLI and prints the rewrite verbatim. Three audience modes: colleague, manager, director.
- [sirambrosio/humanink](https://github.com/sirambrosio/humanink) and [MohamedAbdallah-14/unslop](https://github.com/MohamedAbdallah-14/unslop) - Strip AI tells from prose after the fact.
- [smixs/awesome-claude-output-styles](https://github.com/smixs/awesome-claude-output-styles) and [hesreallyhim/awesome-claude-code-output-styles-that-i-really-like](https://github.com/hesreallyhim/awesome-claude-code-output-styles-that-i-really-like) - Curated collections, 20 and a dozen styles each.

## Findings

F1 - **Nothing else carries reference codes or a cross-session ledger** - none of the 25 READMEs I read mention numbered items like `F1` or `NA2`, or a Stop hook that persists them, so that remains Katharsis's unique claim.

## Caveats

C1 - **Coverage is GitHub search plus one web search** - repos whose descriptions avoid the words "output style", "answer first", "terse", or "ADHD" would not have surfaced.

## Questions

❓ **Q1** - **Save this list into the repo?** - it fits as a related-work note under `docs/`.
   a. write it to `docs/related-work.md` now
   b. leave it in the chat

➡️ b - you asked for it here, and a docs file is a separate call.
