#!/usr/bin/env bash
# Runs the node suite for cli/kref.ts (tests/kref.node.ts). The CLI needs
# node 22.18 or later, where type stripping is on by default.

set -u
cd "$(dirname "$0")/.." || exit 2

command -v node >/dev/null 2>&1 || { echo "FAIL: node not found; cli/kref.ts needs node 22.18 or later" >&2; exit 1; }
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 18) ? 0 : 1)' || {
  echo "FAIL: node $(node --version) is older than 22.18" >&2
  exit 1
}
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/kref.node.ts || exit 1

# bin/kref is the shim users run: it must reach the CLI with the arguments intact.
SANDBOX="$(mktemp -d)" || exit 2
trap 'rm -rf "$SANDBOX"' EXIT
SID=0a1b2c3d-0000-4000-8000-000000000001
mkdir -p "$SANDBOX/ledger/p"
printf '%s\n' "{\"ts\":\"2026-09-25T00:00:00Z\",\"session_id\":\"$SID\",\"code\":\"F1\",\"prefix\":\"F\",\"n\":1,\"title\":\"shim reaches the cli\",\"summary\":\"\"}" > "$SANDBOX/ledger/p/$SID.jsonl"
OUT="$(HOME="$SANDBOX" KATHARSIS_DATA="$SANDBOX" CLAUDE_CODE_SESSION_ID="$SID" bin/kref F1 2>&1)"; RC=$?
case "$RC:$OUT" in
  0:*"shim reaches the cli"*) echo "PASS bin/kref runs the cli" ;;
  *) echo "FAIL bin/kref: rc=$RC [$OUT]"; exit 1 ;;
esac
