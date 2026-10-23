#!/usr/bin/env bash
# setup.sh: the two things installing the plugin cannot do for the user.
#
#   1. The permissions. The output style has the model run
#      ~/.claude/katharsis/scripts/katharsis-exchange-style.sh every turn, and
#      at the `rich` richness level
#      ~/.claude/katharsis/scripts/katharsis-artifact.sh to render a diagram
#      or reserve and open a video.
#      In default permission mode each Bash call prompts on first use in each
#      session. A plugin cannot pre-grant permissions, so this adds one
#      permissions.allow entry per script to ~/.claude/settings.json.
#      Idempotent: a second run changes nothing and says so.
#   2. The style. The plugin ships two output styles with one body; the user
#      picks one in /config. This prints both names and what the second keeps.
#   3. The engine. The per-turn reminder is a mod hook, which Claude Code
#      loads with no flag from 2.1.287 on. Without mods, the style loads but nothing marks
#      the session active, so the Stop hooks and the ledger stay silent with
#      no error anywhere. Setup checks the version, still grants the
#      permission, and exits 4 without marking setup done when it is older,
#      so the session-start reminder keeps asking until it holds. A `claude` that
#      will not run leaves the version unchecked rather than failed.
#   4. The tools. Last, it reports which of the tools the `rich` richness
#      level uses are on PATH: the diagram renderers d2 and mmdc, and the
#      video tools vhs, ffmpeg, and remotion, with an install command for
#      each one missing. The report prints only when setup gets this far, so
#      an exit 3 on a settings file it cannot edit, an exit 4 on a Claude
#      Code too old, and an exit 1 print none. Remotion counts only as the
#      Katharsis Remotion project, remotion/ in the data directory with
#      node_modules/.bin/remotion executable and the .katharsis-ready
#      marker, the same test katharsis-artifact.sh detect makes. When vhs or
#      ffmpeg is found, Remotion is reported as not needed with no command,
#      because detect names the first of vhs, ffmpeg, and Remotion it finds.
#      It installs nothing; /katharsis:setup runs a command only after the
#      user says yes to it. The install commands use Homebrew where `brew`
#      is on PATH, else go for vhs, apt-get for ffmpeg, npm for mmdc, and
#      D2's own installer through curl. Remotion's command creates the
#      project, writes its package.json when it has none, installs remotion,
#      @remotion/cli, react, and react-dom in it, downloads the browser it
#      renders with, so a later render needs no network, and only then
#      writes the marker. A command whose installer is not on PATH is never
#      printed; the line names the missing installer instead. Each command
#      sits alone in backticks, so a note after it is never mistaken for
#      part of it.
#
# Runs from a terminal, or inside Claude Code as
# `! ~/.claude/katharsis/scripts/setup.sh`, or through /katharsis:setup, which
# runs this same script so the two paths cannot diverge. --dry-run prints the
# settings change without writing it.
#
# Writes $KATHARSIS_DATA/.setup-done when it finishes; session-link.sh stops
# asking for setup once that exists.
#
# CLAUDE_DIR overrides ~/.claude, KATHARSIS_DATA overrides
# ~/.claude/katharsis-data, and KATHARSIS_CLAUDE overrides the claude binary,
# for tests.

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
ENTRIES=(
  'Bash(~/.claude/katharsis/scripts/katharsis-exchange-style.sh:*)'
  'Bash(~/.claude/katharsis/scripts/katharsis-artifact.sh:*)'
)

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found. The Stop hooks need it; install python3 and run setup again." >&2
  exit 1
fi

# True when version $1 comes before $2. sort -V would do it, but macOS sort lacks -V.
older() {
  local IFS=. a b i
  read -r -a a <<< "$1"; read -r -a b <<< "$2"
  for i in 0 1 2; do
    [ "${a[i]}" -lt "${b[i]}" ] && return 0
    [ "${a[i]}" -gt "${b[i]}" ] && return 1
  done
  return 1
}
MIN=2.1.287
ENGINE_OK=1
ver="$("${KATHARSIS_CLAUDE:-claude}" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
if [ -z "$ver" ]; then
  echo "Claude Code: \`claude --version\` did not run here, so the version is unchecked. Katharsis needs $MIN or later."
elif older "$ver" "$MIN"; then
  echo "Claude Code: $ver is older than $MIN, the oldest version Katharsis supports. Run \`claude update\`, then setup again."
  ENGINE_OK=0
else
  echo "Claude Code: $ver, which meets the $MIN minimum."
fi
echo

python3 - "$SETTINGS" "$DRY" "${ENTRIES[@]}" <<'PYEOF'
import json, os, shutil, sys

path, dry, entries = sys.argv[1], sys.argv[2] == "1", sys.argv[3:]
shown = path.replace(os.path.expanduser("~"), "~", 1)
hand = ", ".join(f'"{e}"' for e in entries)

settings = {}
if os.path.exists(path):
    try:
        with open(path, encoding="utf-8") as f:
            settings = json.load(f)
        if not isinstance(settings, dict):
            raise ValueError("top level is not an object")
    except Exception as e:
        print(f"Permission: {shown} is not valid JSON ({e}), so nothing was written.")
        print(f'  Add these entries to its "permissions" > "allow" array by hand: {hand}')
        sys.exit(3)

perms = settings.setdefault("permissions", {})
if not isinstance(perms, dict):
    print(f'Permission: "permissions" in {shown} is not an object, so nothing was written.')
    print(f'  Add these entries to its "permissions" > "allow" array by hand: {hand}')
    sys.exit(3)
allow = perms.setdefault("allow", [])
if not isinstance(allow, list):
    print(f'Permission: "permissions.allow" in {shown} is not an array, so nothing was written.')
    print(f'  Add these entries to it by hand: {hand}')
    sys.exit(3)

missing = [e for e in entries if e not in allow]
for e in entries:
    if e not in missing:
        print(f"Permission: {e} is already in {shown}.")
if not missing:
    sys.exit(0)

allow.extend(missing)
change = json.dumps({"permissions": {"allow": missing}}, indent=2)
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
for e in missing:
    print(f"Permission: added {e} to permissions.allow in {shown}.")
PYEOF
rc=$?
[ "$rc" -eq 0 ] || exit "$rc"

cat <<'EOF'

Output style: pick one in /config > Output style. Two are installed, with one body:
  katharsis:Katharsis         the Katharsis style alone
  katharsis:Katharsis coding  the same style, keeping Claude Code's built-in software-engineering instructions
/config saves the choice to .claude/settings.local.json in the current project.
EOF

if [ "$ENGINE_OK" -eq 0 ]; then
  echo
  echo "setup: Katharsis needs Claude Code $MIN or later, so setup is not done. Fix the line above and run setup again." >&2
  exit 4
fi

if [ "$DRY" -eq 0 ]; then
  if ! { mkdir -p "$DATA" && : > "$DATA/.setup-done"; } 2>/dev/null; then
    echo
    echo "setup: could not write ${DATA/#"$HOME"/\~}/.setup-done, so setup is not done. Check that the path is writable and run setup again." >&2
    exit 1
  fi
  echo
  echo "Setup done. The ledger and telemetry live in ${DATA/#"$HOME"/\~}; kref reads them back."
fi

have() { command -v "$1" >/dev/null 2>&1; }
# Remotion counts only as the Katharsis Remotion project, as
# katharsis-artifact.sh detects it: a global remotion renders nothing alone.
RPROJ="$DATA/remotion"
RBIN="$RPROJ/node_modules/.bin/remotion"
RREADY="$RPROJ/.katharsis-ready"
found() {
  if [ "$1" = remotion ]; then [ -f "$RBIN" ] && [ -x "$RBIN" ] && [ -f "$RREADY" ]; else have "$1"; fi
}
case "$RPROJ" in
  "$HOME"/*) RSHOWN=\~/"$(printf '%q' "${RPROJ#"$HOME"/}")" ;;
  *) RSHOWN="$(printf '%q' "$RPROJ")" ;;
esac
# install_hint <tool>: how to install it here, the command alone in backticks
# and any note after them, or the installers its command needs that are missing.
install_hint() {
  case "$1" in
    d2)
      if have brew; then echo 'install with `brew install d2`'
      elif have curl; then echo 'install with `curl -fsSL https://d2lang.com/install.sh | sh -s --`'
      else echo 'its installer needs Homebrew or curl, and neither is on PATH'
      fi ;;
    mmdc)
      if have npm; then echo 'install with `npm install -g @mermaid-js/mermaid-cli`'
      else echo 'its installer needs npm, which is not on PATH'
      fi ;;
    vhs)
      if have brew; then echo 'install with `brew install vhs`'
      elif have go; then echo "install with \`go install github.com/charmbracelet/vhs@latest\`; vhs also needs ttyd, ffmpeg, and Go's bin directory on PATH"
      else echo 'its installer needs Homebrew or Go, and neither is on PATH'
      fi ;;
    ffmpeg)
      if have brew; then echo 'install with `brew install ffmpeg`'
      elif have apt-get; then echo 'install with `sudo apt-get update && sudo apt-get install -y ffmpeg`'
      else echo 'its installer needs Homebrew or apt-get, and neither is on PATH; another package manager or https://ffmpeg.org/download.html has it'
      fi ;;
    remotion)
      if have npm; then
        echo "install with \`(mkdir -p $RSHOWN && cd $RSHOWN && { [ -f package.json ] || echo '{\"private\": true}' > package.json; } && npm install remotion @remotion/cli react react-dom && npx remotion browser ensure && touch .katharsis-ready)\`; Remotion needs a paid company license for an organization above its small-team threshold, see https://www.remotion.dev/license"
      else echo 'its installer needs npm, which is not on PATH'
      fi ;;
  esac
}
echo
echo "Tools for the rich richness level, which looks for them again each time it needs one:"
for t in d2:renderer mmdc:renderer vhs:video ffmpeg:video remotion:video; do
  tool="${t%:*}"
  if [ "${t#*:}" = renderer ]; then kind='diagram renderer'; else kind='video tool'; fi
  if found "$tool"; then
    printf '  %-9s %-17s found\n' "$tool" "$kind"
  elif [ "$tool" = remotion ] && { have vhs || have ffmpeg; }; then
    if have vhs; then first=vhs; else first=ffmpeg; fi
    printf '  %-9s %-17s not needed; %s is found, and rich uses it first\n' "$tool" "$kind" "$first"
  else
    printf '  %-9s %-17s missing; %s\n' "$tool" "$kind" "$(install_hint "$tool")"
  fi
done
echo "Without a video tool, rich uses Claude Motion when offered and on, else a rendered diagram, else an inline sketch."
exit 0
