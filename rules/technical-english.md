# Technical English

`writing.md` governs what to say and in what order: the finding first, evidence beside the claim,
reference codes, one term for one thing. This file governs the sentences themselves. Where the two
disagree, `writing.md` wins. `git-writing.md` covers commit messages, PR bodies, and review comments.

Subagents spawned by the agent tool inherit this file through the `{{MEMORY_FILE}}` import, so do not
restate it in a delegation prompt.

## Global rules for every destination below

- Use active voice and name the actor. Write "the build strips the import" rather than "the import is
  stripped."
- Use present tense for behavior that is always true. Reserve past tense for events that happened.
- Put one idea in each sentence. A second clause is fine when it names that idea's relation to the
  first, using because, but, so, or which. Cut a clause that only adds an unrelated idea.
- Keep sentences under 25 words. Keep steps in a procedure under 20.
- Use one term for each concept and repeat it. Never substitute a synonym for variety.
- State what happens rather than what does not happen.
- Do not use analogies, idioms, metaphors, or figurative language, unless explicitly requested. Avoid
  rhetorical questions.
- Do not use an abstract noun where a concrete one exists: substrate, wedge, vector, locus, vantage,
  nexus, primitive, harness, bedrock, scaffolding, modality, paradigm. Write base, way, method, or
  the thing itself. A term a repo lexicon or glossary defines is exempt.
- Write is or has rather than serves as, stands as, boasts, or features.
- Use an -ing form only as a technical noun or a modifier. Never end a sentence with a trailing
  participial clause such as "highlighting the risk" or "ensuring consistency".
- Prefer the plain word, because the fancier synonym is rarely clearer. Utilize becomes use and
  facilitate becomes help. Treat those as illustrations of the test rather than a list to check
  against.
- Keep a noun cluster to three words. Break a longer one with a preposition: write "trust provider
  for workload identity federation" rather than stacking five nouns. Product names and lexicon terms
  are exempt.
- Keep a paragraph to six sentences.
- Write headings in sentence case.
- Use straight quotes and straight apostrophes.
- Expand an abbreviation at its first use in a document, then use the short form.
- Give every pronoun an antecedent in the same sentence. Otherwise name the thing.
- Keep list items parallel in grammatical form.

## Chat replies to {{READER_NAME}}

Write short complete sentences. Every sentence keeps its subject and verb. Reach concision by cutting
content, never by dropping grammar.

## Tickets and wiki pages

Write the summary as one declarative sentence that names the affected component. Write descriptions
in complete sentences. Put each acceptance criterion in its own sentence in the present tense.

## Docs under a house style guide

Both this file and the house style guide apply, and the house style guide wins every conflict. Use
the house guide's terminology over any term here.

{{HOUSE_STYLE_NOTE}}

Where a linter enforces a sentence-length limit, the 25-word target above satisfies any limit of 25
words or more.
