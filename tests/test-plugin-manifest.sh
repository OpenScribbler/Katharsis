#!/usr/bin/env bash
# Tests for .claude-plugin/plugin.json. Claude Code's option list cuts a userConfig
# description at 1,024 characters, so /config ends a longer one mid-word. Every
# description must fit. The richness option offers text, sketch, and rich, with
# sketch as the default, because the prompt hook names every level but sketch.

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
  *" over=0") ;;
  *) echo "FAIL manifest: description over 1024 characters: $out"; exit 1 ;;
esac

richness="$(python3 - "$MANIFEST" <<'PY'
import json, sys
r = json.load(open(sys.argv[1])).get('userConfig', {}).get('richness')
if r is None:
    print('missing')
else:
    print(f"type={r.get('type')} default={r.get('default')} options={','.join(r.get('options', []))} required={r.get('required')}")
PY
)"
if [ "$richness" != "type=string default=sketch options=text,sketch,rich required=False" ]; then
  echo "FAIL manifest: richness option: $richness"; exit 1
fi
echo "PASS manifest: $out; $richness"
