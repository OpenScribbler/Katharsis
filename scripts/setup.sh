#!/usr/bin/env bash
# setup.sh: the two things installing the plugin cannot do for the user.
#
#   1. The permission. The output style has the model run
#      ~/.claude/katharsis/scripts/katharsis-exchange-style.sh every turn, and
#      in default permission mode that Bash call prompts on first use in each
#      session. A plugin cannot pre-grant permissions, so this adds the one
#      permissions.allow entry to ~/.claude/settings.json. Idempotent: a second
#      run changes nothing and says so.
#   2. The style. The plugin ships two output styles with one body; the user
#      picks one in /config. This prints both names and what the second keeps.
#
# Runs from a terminal, or inside Claude Code as
# `! ~/.claude/katharsis/scripts/setup.sh`, or through /katharsis:setup, which
# runs this same script so the two paths cannot diverge. --dry-run prints the
# settings change without writing it.
#
# Writes $KATHARSIS_DATA/.setup-done when it finishes; session-link.sh stops
# asking for setup once that exists.
#
# CLAUDE_DIR overrides ~/.claude and KATHARSIS_DATA overrides
# ~/.claude/katharsis-data for tests.

set -u

DRY=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    -h|--help) echo "Usage: ${0##*/} [--dry-run]"; exit 0 ;;
    *) echo "setup: unknown argument $a" >&2; echo "Usage: ${0##*/} [--dry-run]" >&2; exit 2 ;;
  esac
done

DIR="${CLAUDE_DIR:-$HOME/.claude}"
DATA="${KATHARSIS_DATA:-$HOME/.claude/katharsis-data}"
SETTINGS="$DIR/settings.json"
ENTRY='Bash(~/.claude/katharsis/scripts/katharsis-exchange-style.sh:*)'

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found. The Stop hooks and kref need it; install python3 and run setup again." >&2
  exit 1
fi

python3 - "$SETTINGS" "$ENTRY" "$DRY" <<'PYEOF'
import json, os, shutil, sys

path, entry, dry = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
shown = path.replace(os.path.expanduser("~"), "~", 1)

settings = {}
if os.path.exists(path):
    try:
        with open(path, encoding="utf-8") as f:
            settings = json.load(f)
        if not isinstance(settings, dict):
            raise ValueError("top level is not an object")
    except Exception as e:
        print(f"Permission: {shown} is not valid JSON ({e}), so nothing was written.")
        print(f'  Add this entry to its "permissions" > "allow" array by hand: "{entry}"')
        sys.exit(3)

perms = settings.setdefault("permissions", {})
if not isinstance(perms, dict):
    print(f'Permission: "permissions" in {shown} is not an object, so nothing was written.')
    print(f'  Add this entry to its "permissions" > "allow" array by hand: "{entry}"')
    sys.exit(3)
allow = perms.setdefault("allow", [])
if not isinstance(allow, list):
    print(f'Permission: "permissions.allow" in {shown} is not an array, so nothing was written.')
    print(f'  Add this entry to it by hand: "{entry}"')
    sys.exit(3)

if entry in allow:
    print(f"Permission: {entry} is already in {shown}.")
    sys.exit(0)

allow.append(entry)
change = json.dumps({"permissions": {"allow": [entry]}}, indent=2)
if dry:
    print(f"Permission: would add this to {shown} (dry run, nothing written):")
    print("\n".join("  " + line for line in change.splitlines()))
    sys.exit(0)

os.makedirs(os.path.dirname(path), exist_ok=True)
tmp = path + ".katharsis-tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(settings, f, indent=2, ensure_ascii=False)
    f.write("\n")
if os.path.exists(path):
    shutil.copymode(path, tmp)
os.replace(tmp, path)
print(f"Permission: added {entry} to permissions.allow in {shown}.")
PYEOF
rc=$?
[ "$rc" -eq 0 ] || exit "$rc"

cat <<'EOF'

Output style: pick one in /config > Output style. Two are installed, with one body:
  katharsis:Katharsis         the Katharsis style alone
  katharsis:Katharsis coding  the same style, keeping Claude Code's built-in software-engineering instructions
/config saves the choice to .claude/settings.local.json in the current project.
EOF

if [ "$DRY" -eq 0 ]; then
  if ! { mkdir -p "$DATA" && : > "$DATA/.setup-done"; } 2>/dev/null; then
    echo
    echo "setup: could not write ${DATA/#"$HOME"/\~}/.setup-done, so setup is not done. Check that the path is writable and run setup again." >&2
    exit 1
  fi
  echo
  echo "Setup done. The ledger and telemetry live in ${DATA/#"$HOME"/\~}; kref reads them back."
fi
exit 0
