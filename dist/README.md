# dist

`dist/rules/` is the generic build of the rule files: the same content as `rules/`, with every
`{{PLACEHOLDER}}` already substituted. `READER_NAME` becomes "the user", and every other
placeholder takes the default `rules/placeholders.yaml` declares.

Use these files where no setup step runs, such as a cross-tool package manager or registry.
Where setup can run, prefer the canonical files, because setup substitutes your own name, your
memory file, and your house conventions instead of the generic values.

The files are generated, so edit `rules/` instead and regenerate with
`scripts/make-dist.sh build`. The test suite fails when the two drift.
