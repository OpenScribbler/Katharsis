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
- [ ] Every script under `scripts/` still has a suite under `tests/` that asserts exact counts and exit codes (D10 in `docs/design.md`)
- [ ] A change to `rules/placeholders.yaml` or `rules/audit-numbers.yaml` records its reasoning in `docs/design.md`
- [ ] A change to what setup or the audit writes on an installer's machine is recorded in the install manifest, so the uninstall can reverse it
