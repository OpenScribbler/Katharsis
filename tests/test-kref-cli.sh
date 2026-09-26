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
exec node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/kref.node.ts
