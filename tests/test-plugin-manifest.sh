#!/usr/bin/env bash
# Tests for .claude-plugin/plugin.json. Claude Code's option list cuts a userConfig
# description at 1,024 characters, so /config and the drawer's settings view end a
# longer one mid-word. Every description must fit.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
MANIFEST="$DIR/../.claude-plugin/plugin.json"

out="$(python3 - "$MANIFEST" <<'PY'
import json, sys
config = json.load(open(sys.argv[1])).get('userConfig', {})
long = [f"{k}={len(v.get('description', ''))}" for k, v in config.items() if len(v.get('description', '')) > 1024]
print(f"options={len(config)} over={len(long)} {' '.join(long)}".rstrip())
PY
)"; rc=$?

if [ "$rc" -ne 0 ]; then
  echo "FAIL manifest: python exit=$rc"; exit 1
fi
case "$out" in
  "options=0 "*) echo "FAIL manifest: no userConfig options found"; exit 1 ;;
  *" over=0") echo "PASS manifest: $out"; exit 0 ;;
  *) echo "FAIL manifest: description over 1024 characters: $out"; exit 1 ;;
esac
