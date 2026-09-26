#!/usr/bin/env bash
# Runs the node suite for cli/kref.ts (tests/kref.node.ts), then tests what
# the node suite can't reach: the bin/kref wrapper's node check, a real
# --html run, and the picker in a real terminal. The CLI needs node 22.18 or
# later, where type stripping is on by default.

set -u
cd "$(dirname "$0")/.." || exit 2
ROOT="$(pwd)"

command -v node >/dev/null 2>&1 || { echo "FAIL: node not found; cli/kref.ts needs node 22.18 or later" >&2; exit 1; }
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 18) ? 0 : 1)' || {
  echo "FAIL: node $(node --version) is older than 22.18" >&2
  exit 1
}
# A test that hangs fails after 10 seconds rather than stalling CI.
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --test-timeout=10000 tests/kref.node.ts || exit 1

PASS=0
FAIL=0
check() { # name, expected rc, actual rc, text the output must contain, output
  case "$3:$5" in
    "$2:"*"$4"*) PASS=$((PASS+1)) ;;
    *) echo "FAIL $1: rc=$3 [$5]"; FAIL=$((FAIL+1)) ;;
  esac
}

SANDBOX="$(mktemp -d)" || exit 2
trap 'rm -rf "$SANDBOX"' EXIT
SID=0a1b2c3d-0000-4000-8000-000000000001
mkdir -p "$SANDBOX/ledger/p" "$SANDBOX/sessions" "$SANDBOX/work/app" "$SANDBOX/bin"
printf '%s\n' "{\"ts\":\"2026-09-25T00:00:00Z\",\"session_id\":\"$SID\",\"code\":\"F1\",\"prefix\":\"F\",\"n\":1,\"title\":\"shim reaches the cli\",\"summary\":\"\"}" > "$SANDBOX/ledger/p/$SID.jsonl"
printf '%s\n' "{\"id\":\"$SID\",\"cwd\":\"$SANDBOX/work/app\",\"title\":\"sandbox session\",\"started\":\"2026-09-25T00:00:00Z\",\"updated\":\"2026-09-25T00:00:00Z\"}" > "$SANDBOX/sessions/$SID.json"
kref() { HOME="$SANDBOX" KATHARSIS_DATA="$SANDBOX" "$ROOT/bin/kref" "$@"; }

# 1. bin/kref reaches the CLI with the arguments intact.
OUT="$(CLAUDE_CODE_SESSION_ID="$SID" kref F1 2>&1)"
check "bin/kref runs the cli" 0 $? "shim reaches the cli" "$OUT"

# 2. With no node on PATH, bin/kref says so and exits 2.
OUT="$(PATH="$SANDBOX/bin" /bin/bash "$ROOT/bin/kref" F1 2>&1)"
check "bin/kref without node" 2 $? "kref: node not found" "$OUT"

# 3. An old node is refused with its version named.
cat > "$SANDBOX/bin/node" <<'EOF'
#!/bin/sh
[ "$1" = "--version" ] && { echo v20.11.0; exit 0; }
exit 1
EOF
chmod +x "$SANDBOX/bin/node"
OUT="$(PATH="$SANDBOX/bin:$PATH" kref F1 2>&1)"
check "bin/kref with node 20" 2 $? "kref: node v20.11.0 is older than 22.18" "$OUT"
rm "$SANDBOX/bin/node"

# 4. --html writes a 0600 page in a 0700 folder, with no script, and prints its path.
OUT="$(CLAUDE_CODE_SESSION_ID="$SID" KREF_NO_OPEN=1 kref --html 2>&1)"
check "--html prints the page path" 0 $? "$SANDBOX/kref-out/0a1b2c3d-session.html" "$OUT"
PAGE="$SANDBOX/kref-out/0a1b2c3d-session.html"
check "--html page mode" 0 0 "600" "$(stat -c %a "$PAGE" 2>&1)"
check "--html folder mode" 0 0 "700" "$(stat -c %a "$SANDBOX/kref-out" 2>&1)"
if grep -qi '<script' "$PAGE"; then echo "FAIL --html page carries a script"; FAIL=$((FAIL+1)); else PASS=$((PASS+1)); fi

# 5. In a terminal, a folder with sessions below it offers the picker. A
#    number opens that session; Ctrl-C and the end of input quit with exit 0.
command -v script >/dev/null 2>&1 || { echo "FAIL: script (util-linux) not found; the picker cases need a pty" >&2; exit 1; }
picker() { # keys to type, one second after start
  (cd "$SANDBOX/work" && { sleep 1; printf '%b' "$1"; sleep 1; } |
    env -u CLAUDE_CODE_SESSION_ID HOME="$SANDBOX" KATHARSIS_DATA="$SANDBOX" \
      script -qfec "$ROOT/bin/kref --short; echo EXIT=\$?" /dev/null 2>&1)
}
OUT="$(picker '1\r')"
check "picker opens a number" 0 0 "shim reaches the cli" "$OUT"
check "picker exit after a number" 0 0 "EXIT=0" "$OUT"
OUT="$(picker '\003')"
check "picker was showing at Ctrl-C" 0 0 "Number, or text to filter" "$OUT"
check "picker quits on Ctrl-C" 0 0 "EXIT=0" "$OUT"
case "$OUT" in *"shim reaches the cli"*) echo "FAIL picker printed codes after Ctrl-C"; FAIL=$((FAIL+1));; *) PASS=$((PASS+1));; esac
OUT="$(picker '\004')"
check "picker was showing at the end of input" 0 0 "Number, or text to filter" "$OUT"
check "picker quits at the end of input" 0 0 "EXIT=0" "$OUT"

echo "kref cli: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
