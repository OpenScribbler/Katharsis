#!/usr/bin/env bash
# Tests for .claude-plugin/plugin.json and the skills it ships. Claude Code's option
# list cuts a userConfig description at 1,024 characters, so /config ends a longer one
# mid-word. Every description must fit. The richness option offers text, sketch, and
# rich, with text as the default, because the prompt hook names every level but text.
# The git skills write text colleagues read, so each one keeps model invocation off.

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
  *" over=0") echo "PASS manifest: $out" ;;
  *) echo "FAIL manifest: description over 1024 characters: $out"; exit 1 ;;
esac

FAILED=0

richness="$(python3 - "$MANIFEST" <<'PY'
import json, sys
r = json.load(open(sys.argv[1])).get('userConfig', {}).get('richness')
if r is None:
    print('missing')
else:
    print(f"type={r.get('type')} default={r.get('default')} options={','.join(r.get('options', []))} required={r.get('required')}")
PY
)"
if [ "$richness" != "type=string default=text options=text,sketch,rich required=False" ]; then
  echo "FAIL richness: $richness"; FAILED=1
else
  echo "PASS richness: $richness"
fi

# Each git skill's frontmatter sets disable-model-invocation: true, the key Claude Code
# reads to keep a skill out of the model's reach while /name still runs it.
GIT_SKILLS=(pr commit review-reply)
for skill in "${GIT_SKILLS[@]}"; do
  file="$DIR/../skills/$skill/SKILL.md"
  got="$(awk 'NR==1 && $0!="---" {exit} NR>1 && $0=="---" {exit} /^disable-model-invocation:/ {print $2}' "$file" 2>/dev/null)"
  if [ "$got" = "true" ]; then
    echo "PASS typed-only: skills/$skill"
  else
    echo "FAIL typed-only: skills/$skill disable-model-invocation='$got'"; FAILED=1
  fi
done

# The commit skill reads ../pr/conventions.md, so a rename of skills/pr/ breaks it.
if test -f "$DIR/../skills/pr/conventions.md"; then
  echo "PASS conventions: skills/pr/conventions.md"
else
  echo "FAIL conventions: skills/pr/conventions.md missing"; FAILED=1
fi
exit "$FAILED"
