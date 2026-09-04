## Situation

<!-- The problem that prompted the change, for someone who has not read the issue. Link the issue. -->

## Target

<!-- The end state you want. Stays true if the method changes. -->

## Proposal

<!-- The method, then the alternative you rejected and why. -->

## Checklist

- [ ] `bash tests/run-tests.sh` passes
- [ ] `shellcheck -S warning scripts/*.sh tests/*.sh` is clean
- [ ] `claude plugin validate --strict .` passes
- [ ] `CHANGELOG.md` has a line under `[Unreleased]`, or the change is not visible to an installer
- [ ] Every script under `scripts/` still has a suite under `tests/` that asserts exact outputs and exit codes (D15 in `docs/design.md`)
- [ ] Every hook still exits 0 on every path (D5 in `docs/design.md`)
- [ ] A change to the output style's body is made in both `output-styles/` files, and a change to the reference-code table is made in both the style and `styles/README.md`
