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

# 1b. A symlink to bin/kref, as the docs set up, still finds the CLI.
ln -s "$ROOT/bin/kref" "$SANDBOX/bin/kref-link"
OUT="$(HOME="$SANDBOX" KATHARSIS_DATA="$SANDBOX" CLAUDE_CODE_SESSION_ID="$SID" "$SANDBOX/bin/kref-link" F1 2>&1)"
check "bin/kref through a symlink" 0 $? "shim reaches the cli" "$OUT"
# A readlink with no -f, as on older macOS, and a relative link in front
# of the absolute one: the wrapper follows each hop itself.
mkdir "$SANDBOX/bsd"
printf '#!/bin/sh\n[ "$1" = -f ] && { echo "readlink: illegal option -- f" >&2; exit 1; }\nexec "%s" "$@"\n' "$(command -v readlink)" > "$SANDBOX/bsd/readlink"
chmod +x "$SANDBOX/bsd/readlink"
ln -s ../bin/kref-link "$SANDBOX/bsd/kref"
OUT="$(PATH="$SANDBOX/bsd:$PATH" HOME="$SANDBOX" KATHARSIS_DATA="$SANDBOX" CLAUDE_CODE_SESSION_ID="$SID" "$SANDBOX/bsd/kref" F1 2>&1)"
check "bin/kref through two links without readlink -f" 0 $? "shim reaches the cli" "$OUT"
rm -r "$SANDBOX/bin/kref-link" "$SANDBOX/bsd"

# 2. With no node on PATH, bin/kref says so and exits 2.
OUT="$(PATH="$SANDBOX/bin" /bin/bash "$ROOT/bin/kref" F1 2>&1)"
check "bin/kref without node" 2 $? "kref: node not found" "$OUT"

# 3. The version check refuses anything older than 22.18 and runs 22.18 on.
#    The fake node reports a version and hands everything else to the real one.
REAL_NODE="$(command -v node)"
fake_node() {
  printf '#!/bin/sh\n[ "$1" = "--version" ] && { echo %s; exit 0; }\nexec "%s" "$@"\n' "$1" "$REAL_NODE" > "$SANDBOX/bin/node"
  chmod +x "$SANDBOX/bin/node"
}
for old in v20.11.0 v22.17.1 v21.99.0; do
  fake_node "$old"
  OUT="$(PATH="$SANDBOX/bin:$PATH" CLAUDE_CODE_SESSION_ID="$SID" kref F1 2>&1)"
  check "bin/kref refuses node $old" 2 $? "kref: node $old is older than 22.18" "$OUT"
done
for ok in v22.18.0 v23.0.0 v100.0.0; do
  fake_node "$ok"
  OUT="$(PATH="$SANDBOX/bin:$PATH" CLAUDE_CODE_SESSION_ID="$SID" kref F1 2>&1)"
  check "bin/kref runs on node $ok" 0 $? "shim reaches the cli" "$OUT"
done
fake_node "garbage"
OUT="$(PATH="$SANDBOX/bin:$PATH" kref F1 2>&1)"
check "bin/kref with an unreadable version" 2 $? "can't read the node version" "$OUT"
rm "$SANDBOX/bin/node"

# 4. --html writes a 0600 page in a 0700 folder, with no script, and prints its path.
OUT="$(CLAUDE_CODE_SESSION_ID="$SID" KREF_NO_OPEN=1 kref --html 2>&1)"
check "--html prints the page path" 0 $? "$SANDBOX/kref-out/0a1b2c3d-session.html" "$OUT"
PAGE="$SANDBOX/kref-out/0a1b2c3d-session.html"
check "--html page mode" 0 0 "600" "$(stat -c %a "$PAGE" 2>&1)"
check "--html folder mode" 0 0 "700" "$(stat -c %a "$SANDBOX/kref-out" 2>&1)"
grep -qi '<script' "$PAGE"
check "--html page has no script" 1 $? "" ""

# 5. In a terminal, a folder with sessions below it offers the picker. A
#    number opens that session; Ctrl-C and the end of input quit with exit 0.
# BSD script, as on macOS, takes other flags, so those cases need util-linux.
script -V 2>&1 | grep -q util-linux || { echo "FAIL: the picker cases need script from util-linux for a pty" >&2; exit 1; }
# The keys go in once the prompt shows, and each run gets 10 seconds to end.
picker() { # keys to type
  local out="$SANDBOX/pty.out" in="$SANDBOX/pty.in" pid
  rm -f "$out" "$in"
  mkfifo "$in"
  (cd "$SANDBOX/work" && env -u CLAUDE_CODE_SESSION_ID HOME="$SANDBOX" KATHARSIS_DATA="$SANDBOX" \
    script -qfec "$ROOT/bin/kref --short; echo EXIT=\$?" /dev/null < "$in" > "$out" 2>&1) &
  pid=$!
  exec 3> "$in"
  for _ in $(seq 100); do grep -q "Number, or text to filter" "$out" 2>/dev/null && break; sleep 0.1; done
  printf '%b' "$1" >&3
  for _ in $(seq 100); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
  exec 3>&-
  kill "$pid" 2>/dev/null
  wait "$pid" 2>/dev/null
  cat "$out"
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
