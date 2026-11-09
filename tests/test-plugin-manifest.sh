#!/usr/bin/env bash
# Tests for .claude-plugin/plugin.json and the skills it ships. Claude Code's option
# list cuts a userConfig description at 1,024 characters, so /config ends a longer one
# mid-word. Every description must fit. The richness option offers text, sketch, and
# rich, with text as the default, because the prompt hook names every level but text. The
# motion option is a boolean that is on by default, because the prompt hook names it only
# when it is off.
# The git skills write text colleagues read, so each one keeps model invocation off.
# The hooks modules hook no event an organization-managed account skips for a plugin the
# person installed (issue #132): every classic.* event, and the prompt, skill, attribution,
# compact, and settings events below. There the hook never runs and /plugin lists the
# plugin under Errors.

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

motion="$(python3 - "$MANIFEST" <<'PY'
import json, sys
m = json.load(open(sys.argv[1])).get('userConfig', {}).get('motion')
if m is None:
    print('missing')
else:
    print(f"type={m.get('type')} default={m.get('default')} required={m.get('required')}")
PY
)"
if [ "$motion" != "type=boolean default=True required=False" ]; then
  echo "FAIL motion: $motion"; FAILED=1
else
  echo "PASS motion: $motion"
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

# A hook on an event a managed account skips, written on('event' or on("event", counting
# a '*' hook, which classic events reach.
skipped="$(python3 - "$DIR/../hooks" <<'PY'
import glob, os, re, sys
SKIPPED = re.compile(r"classic\.[A-Za-z*]+|\*|prompt\.(?:section|context|attachment|compose)|skill\.prompt|attribution\.text|session\.compact|settings\.read")
HOOK = re.compile(r"\bon\(\s*['\"`]([^'\"`]+)['\"`]")
hits = []
files = sorted(glob.glob(os.path.join(sys.argv[1], '*.ts')) + glob.glob(os.path.join(sys.argv[1], '*.tsx')))
for f in files:
    for event in HOOK.findall(open(f, encoding='utf-8').read()):
        if SKIPPED.fullmatch(event):
            hits.append(f"{os.path.basename(f)}:{event}")
print(f"files={len(files)} {' '.join(hits)}".rstrip())
PY
)"
case "$skipped" in
  "files=0") echo "FAIL managed-events: no hooks modules found"; FAILED=1 ;;
  files=[0-9]*" "*) echo "FAIL managed-events: hooks on events a managed account skips: ${skipped#* }"; FAILED=1 ;;
  *) echo "PASS managed-events: $skipped" ;;
esac
exit "$FAILED"
