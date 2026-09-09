#!/usr/bin/env bash
# Runs every tests/test-*.sh and fails if any suite fails. D15 in docs/design.md
# is the contract: every script under scripts/ has a suite here, each suite plants
# its own expected outcomes and asserts exact counts and exit codes.

set -u
cd "$(dirname "$0")" || exit 2

FAILED=0
for t in test-*.sh; do
  [ -e "$t" ] || { echo "NOT FOUND: no test-*.sh suites in $(pwd)" >&2; exit 2; }
  if bash "$t"; then
    echo "PASS $t"
  else
    echo "FAIL $t"
    FAILED=1
  fi
done
exit "$FAILED"
