#!/usr/bin/env bash
# Tests for .claude-plugin/plugin.json and the skills it ships. Claude Code's option
# list cuts a userConfig description at 1,024 characters, so /config ends a longer one
# mid-word. Every description must fit. The richness option offers text, sketch, and
# rich, with text as the default, because the prompt hook names every level but text. The
# motion option is a boolean that is on by default, because the prompt hook names it only
# when it is off.
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

# tests/events.test.ts registers register.ts and checks the events it hooks, so the
# manifest must name that module alone: a second one would go unchecked.
modules="$(python3 -c 'import json,sys; print(" ".join(json.load(open(sys.argv[1])).get("modules", [])))' "$DIR/../hooks/hooks.json")"
if [ "$modules" = "./register.ts" ]; then
  echo "PASS hooks modules: $modules"
else
  echo "FAIL hooks modules: '$modules', and tests/events.test.ts registers ./register.ts alone"; FAILED=1
fi


# tests/events.test.ts enumerates every option plugin.json offers, so the two must agree:
# a new option or value would otherwise go unregistered there.
opts="$(python3 - "$MANIFEST" <<'PY'
import json, sys
config = json.load(open(sys.argv[1])).get('userConfig', {})
print(' '.join(f"{k}={','.join(v.get('options', [])) if v.get('type') == 'string' else v.get('type')}" for k, v in config.items()))
PY
)"
want_opts="autonomy=guided,standard,autonomous richness=text,sketch,rich motion=boolean recheck=number band=boolean"
if [ "$opts" = "$want_opts" ]; then
  echo "PASS events options: $opts"
else
  echo "FAIL events options: plugin.json offers '$opts', tests/events.test.ts enumerates '$want_opts'"; FAILED=1
fi

# The skipped events tests/events.test.ts checks are the ones AGENTS.md publishes.
lists="$(python3 - "$DIR/../AGENTS.md" "$DIR/events.test.ts" <<'PY'
import re, sys
doc = open(sys.argv[1], encoding='utf-8').read()
bullet = doc[doc.index('**An organization-managed account skips'):]
bullet = bullet[:bullet.index('A hook there')]
published = [e for e in re.findall(r'`([a-z]+\.[a-zA-Z.*]+)`', bullet) if e != 'classic.*']
src = open(sys.argv[2], encoding='utf-8').read()
block = src[src.index('const SKIPPED = new Set(['):]
block = block[:block.index(']);')]
tested = re.findall(r"'([^']+)'", block)
print(' '.join(published) + ' | ' + ' '.join(tested))
PY
)"
if [ -n "${lists%% | *}" ] && [ "${lists%% | *}" = "${lists#* | }" ]; then
  echo "PASS skipped events match AGENTS.md: ${lists%% | *}"
else
  echo "FAIL skipped events: AGENTS.md and tests/events.test.ts differ: $lists"; FAILED=1
fi

exit "$FAILED"
