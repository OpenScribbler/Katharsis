The Stop hook no longer forces a reprint. It still does the one thing a prompt hook can't, which is check what I actually wrote.

## What the Stop hook still buys

stop-verifier.sh now blocks on only 2 rules, `r4-opening-narration` and `r15-question-outside-round` (stop-verifier.sh:75-76). Its fix asks me to add an `## Errata` section below the reply instead of rewriting the whole thing. Every other rule gets logged to the corpus without blocking. The script's header gives the reason as the 10,679 words reprinted in the 2026-08-30 measurement. Of 1,722 replies captured since 2026-09-08, 34 had a blocking hit.

A `UserPromptSubmit` hook only sees your prompt, never my draft, because turn-reminder.sh reads just `prompt`, `session_id`, and `cwd` from its input. So the Stop hook is the only place a finished reply can be checked. Without it, the guidance goes in and nothing confirms it worked.

## Your pre-reply idea

The idea is sound, and half of it already runs. turn-reminder.sh, the prompt hook, adds the classify-then-read instruction and a verification reminder before every typed reply in a Katharsis session. Its header explains why verification moved there: a Stop hook can't give advice without forcing a reprint. punt-shape.sh is exactly your keyword pattern. It matches `/tmp/punt-*.md` in your prompt and adds the shape for a punt opening.

The missing half is matching cue words. Right now the style's cue table depends on me doing the classifying. A hook that spots "research" or "I don't understand" could name the likely type before I write. The risk is misfires. "I don't understand why the hook fired" is a broken-report message, not a request for an explanation. So the hook should suggest a type and log its suggestion next to the type I pick.

## What r7-colon matches

It flags a lowercase letter or closing parenthesis, then a colon, a space, and another lowercase letter (`[a-z)]: [a-z]`, detect-reply.sh:169). "The fix: rename it" matches, while "Note: Rename" and URLs don't. The rule now only logs and never blocks.

## Findings

F64 - **I skipped the classification step on 21 typed turns** - `telemetry/gate-misses.jsonl` logs 21 misses on typed turns, 4 on skill loads, and 1 after a compaction resume. A cue-matching hook would close that gap.

F65 - **No keyword hook fires while the Katharsis style is on** - punt-shape.sh exits at line 43 when the style is active. That's on purpose: the style's status-and-resume guidance now carries the punt shape (punt-shape.sh:15-17). A cue-matching hook would be the only keyword hook running under the style.

## Caveats

C1 - **The 34-of-1,722 block count is too high** - capture-stop.sh also logs subagent replies, which never go through the blocking Stop hook. Also, I scored older replies with today's detector, so the count isn't what the hook actually did at the time.

## Questions

❓ **Q27** - **Should turn-reminder.sh suggest a type based on cue words in your prompt?** - It would scan your prompt for cue phrases and print a suggested type before the classify instruction.
   a. Suggest only, and log the suggestion next to the type I pick, so misfires show up as disagreements
   b. Assign the type and skip my classifying, which fixes the 21 misses but hides every misfire
   c. Leave the prompt hook alone and study the 21 misses first

➡️ a - misfires are the main cost, and only a suggestion that gets logged turns each misfire into a disagreement we can count, not a wrong reply.
