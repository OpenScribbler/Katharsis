#!/usr/bin/env bash
# Tests for .claude-plugin/plugin.json and the skills it ships. Claude Code's option
# list cuts a userConfig description at 1,024 characters, so /config ends a longer one
# mid-word. Every description must fit. The richness option offers text, sketch, and
# rich, with text as the default, because the prompt hook names every level but text. The
# motion option is a boolean that is on by default, because the prompt hook names it only
# when it is off.
# The git skills write text colleagues read, so each one keeps model invocation off.
# The hooks modules name no event an organization-managed account skips for a plugin the
# person installed (issue #132): every classic.* event, and the prompt, skill, attribution,
# compact, and settings events below. There a hook on one never runs and /plugin lists the
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

# The scan reads every quoted literal in hooks/*.ts and *.tsx, comments included, rather
# than parsing on() calls, so a hook written on (, across lines, with a comment inside the
# call, or through a constant or a template literal is still found. A literal that names a
# skipped event, or a '*' hook, which classic events reach, fails. As a positive control,
# the scan must find the 'turn.complete' literal the drawer hooks.
scan_events() { # $1 = directory of hooks modules; prints files=N control=N then each hit
  python3 - "$1" <<'PY'
import glob, os, re, sys
NAMES = r"classic\.[^'\"`]*|\*|prompt\.(?:section|context|attachment|compose)|skill\.prompt|attribution\.text|session\.compact|settings\.read"
SKIPPED = re.compile(r"(['\"`])(" + NAMES + r")\1")
CONTROL = re.compile(r"(['\"`])turn\.complete\1")
hits, control = [], 0
files = sorted(glob.glob(os.path.join(sys.argv[1], '*.ts')) + glob.glob(os.path.join(sys.argv[1], '*.tsx')))
for f in files:
    src = open(f, encoding='utf-8').read()
    control += len(CONTROL.findall(src))
    hits += [f"{os.path.basename(f)}:{m.group(2)}" for m in SKIPPED.finditer(src)]
print(f"files={len(files)} control={control} {' '.join(hits)}".rstrip())
PY
}

skipped="$(scan_events "$DIR/../hooks")"
case "$skipped" in
  "files=0 "*) echo "FAIL managed-events: no hooks modules found"; FAILED=1 ;;
  *" control=0"*) echo "FAIL managed-events: the scan did not find the drawer's turn.complete hook: $skipped"; FAILED=1 ;;
  *" control="[0-9]*" "*) echo "FAIL managed-events: literals naming events a managed account skips: ${skipped#* * }"; FAILED=1 ;;
  *) echo "PASS managed-events: $skipped" ;;
esac

# Every way a skipped event can be written in a hooks module is found.
FIXTURES="$(mktemp -d)"
trap 'rm -rf "$FIXTURES"' EXIT
form=0
while IFS= read -r src; do
  form=$((form+1))
  rm -f "$FIXTURES"/*.ts
  printf '%b\n' "$src" > "$FIXTURES/m.ts"
  got="$(scan_events "$FIXTURES")"
  case "$got" in
    *" m.ts:"*) echo "PASS managed-events form $form: ${got#* * }" ;;
    *) echo "FAIL managed-events form $form not found: $src"; FAILED=1 ;;
  esac
done <<'FORMS'
on('classic.Stop', h);
on ("classic.Stop", h);
on(/* why */ 'classic.Stop', h);
on(\n  // why\n  'classic.Stop',\n  h,\n);
const STOP = 'classic.Stop';\non(STOP, h);
on(`classic.${name}`, h);
on('*', h);
on('prompt.section', h);
on('prompt.context', h);
on('prompt.attachment', h);
on('prompt.compose', h);
on('skill.prompt', h);
on('attribution.text', h);
on('session.compact', h);
on('settings.read', h);
FORMS
if [ "$form" -ne 15 ]; then echo "FAIL managed-events: ran $form forms, want 15"; FAILED=1; fi

exit "$FAILED"
