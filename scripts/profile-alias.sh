#!/usr/bin/env bash
# profile-alias.sh: the deterministic engine behind the setup skill's optional
# shell alias. Append mode installs the kclaude launch wrapper beside the
# rules, and this script appends one alias line for it to the installer's
# shell profile, so the write is recorded and reversible like every other
# write Katharsis makes.
#
# One line serves bash, zsh, and fish alike, because the alias points at an
# executable wrapper rather than carrying shell syntax of its own, and all
# three shells accept alias NAME="VALUE" and expand $HOME inside the quotes.
#
# Modes:
#   status   Report each recorded alias and whether its line is in the profile.
#            Writes nothing.
#   apply    Append the alias line and record it in the install manifest: the
#            profile path, the appended line, and the pre-append hash. A line
#            already there before Katharsis is recorded as was_present and
#            never removed.
#   reverse  Undo a recorded alias. A line the installer had already written
#            is reported and kept.
#
# --dest names the install directory holding the manifest, because an edit no
# manifest records is an edit no uninstall can find.
#
# Usage:
#   profile-alias.sh status  [--dest DIR]
#   profile-alias.sh apply   --profile FILE [--alias NAME] [--dest DIR]
#   profile-alias.sh reverse --profile FILE [--alias NAME] [--dest DIR]
#     --profile FILE   the shell profile to edit, such as ~/.bashrc or
#                      ~/.config/fish/config.fish
#     --alias NAME     the alias name (default: kclaude)
#     --dest DIR       default: ~/.claude/katharsis

set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.claude/katharsis"
PROFILE=""
ALIAS="kclaude"

MODE="${1:-}"
case "$MODE" in
  status|apply|reverse) shift ;;
  *) echo "usage: profile-alias.sh status|apply|reverse [--profile FILE] [--alias NAME] [--dest DIR]" >&2; exit 2 ;;
esac

while [ $# -gt 0 ]; do
  case "$1" in
    --profile) [ $# -ge 2 ] || { echo "--profile requires a value" >&2; exit 2; }; PROFILE="$2"; shift 2 ;;
    --alias)   [ $# -ge 2 ] || { echo "--alias requires a value" >&2; exit 2; }; ALIAS="$2"; shift 2 ;;
    --dest)    [ $# -ge 2 ] || { echo "--dest requires a value" >&2; exit 2; }; DEST="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ "$MODE" != "status" ] && [ -z "$PROFILE" ]; then
  echo "$MODE requires --profile FILE" >&2; exit 2
fi
command -v python3 >/dev/null 2>&1 || { echo "python3 is required and was not found" >&2; exit 2; }

python3 - "$HERE" "$MODE" "$DEST" "$PROFILE" "$ALIAS" <<'PYEOF'
import os, re, sys

here = sys.argv[1]
sys.path.insert(0, here)
import katharsis_manifest as km

mode, dest, profile, alias = sys.argv[2:6]

if not re.fullmatch(r"[A-Za-z0-9_-]+", alias):
    print(f"invalid alias name {alias!r}; use letters, digits, - and _", file=sys.stderr)
    sys.exit(2)

manifest = km.load(dest)
if manifest is None:
    print(f"NOT FOUND: no manifest at {km.manifest_path(dest)}", file=sys.stderr)
    if mode == "reverse":
        print("Nothing recorded this alias, so nothing here can prove Katharsis wrote "
              "it. Remove the line by hand.", file=sys.stderr)
    else:
        print("Run setup-rules.sh apply first, so the alias has somewhere to be recorded.",
              file=sys.stderr)
    sys.exit(2)
manifest.setdefault("aliases", [])

print("katharsis profile-alias")
print(f"manifest: {km.manifest_path(dest)}")
print()

if mode == "status":
    records = manifest["aliases"]
    if not records:
        print("no alias is recorded")
        sys.exit(0)
    for record in records:
        display = record.get("display", record["path"])
        if not os.path.isfile(record["path"]):
            state = "the profile no longer exists"
        else:
            content = open(record["path"], encoding="utf-8").read()
            state = "present" if record["line"] in content.splitlines() else "line removed"
        origin = "was already there before the install" if record.get("was_present") \
            else "appended by Katharsis"
        print(f"{record['name']} in {display}: {state} ({origin})")
    sys.exit(0)

abs_profile = os.path.abspath(profile)
display = km.tilde(profile)
record = km.find_alias(manifest, abs_profile, alias)

if mode == "apply":
    wrapper_path = os.path.join(dest, km.WRAPPER_NAME)
    if not os.path.isfile(wrapper_path):
        print(f"NOT FOUND: no launch wrapper at {wrapper_path}", file=sys.stderr)
        print("Run setup-rules.sh apply --wrapper first; the alias has nothing to point "
              "at without it.", file=sys.stderr)
        sys.exit(2)
    line = km.alias_line(alias, wrapper_path)

    existed = os.path.isfile(abs_profile)
    content = ""
    if existed:
        try:
            content = open(abs_profile, encoding="utf-8").read()
        except (UnicodeDecodeError, OSError) as exc:
            print(f"UNREADABLE: {display}: {exc}", file=sys.stderr)
            print("Nothing was written.", file=sys.stderr)
            sys.exit(2)

    if record and line in content.splitlines():
        print(f"{alias}: already applied by Katharsis; nothing to do")
        sys.exit(0)

    if not record and line in content.splitlines():
        # The exact line predates Katharsis, so it is the installer's and a
        # reversal must leave it. The record still lands, so the uninstall
        # knows to report it rather than guessing.
        manifest["aliases"].append({
            "name": alias, "path": abs_profile, "display": display, "line": line,
            "was_present": True, "applied_at": km.now(),
        })
        km.save(dest, manifest)
        print(f"{alias}: the line was already in {display} before this install; "
              "recorded, nothing written")
        print(f"recorded in {km.manifest_path(dest)}")
        sys.exit(0)

    taken = re.compile(r"^\s*alias\s+" + re.escape(alias) + r"[= ]")
    if any(taken.match(l) for l in content.splitlines()):
        print(f"REFUSING: {display} already defines an alias named {alias}, and it is "
              "not Katharsis's line", file=sys.stderr)
        print("Pick another name with --alias, or remove your own line first. "
              "Nothing was written.", file=sys.stderr)
        sys.exit(2)

    if record:
        # The line was appended before and has since been removed from the
        # profile, so this apply puts it back. Every field describing the
        # pre-install state belongs to the first apply and stays.
        new_record = record
    else:
        new_record = {"name": alias, "path": abs_profile, "display": display,
                      "was_present": False, "applied_at": km.now()}
        if existed:
            new_record["sha256_before"] = km.sha256_bytes(content.encode("utf-8"))
            new_record["backup"] = km.archive(dest, abs_profile,
                                              os.path.basename(abs_profile) + ".bak")
            print(f"saved {display} as it was to {new_record['backup']}")
        else:
            # The apply is creating this file, so a reversal that empties it
            # removes the file rather than leaving a stray line-less profile.
            new_record["created_file"] = True
        new_record["line"] = line
        manifest["aliases"].append(new_record)

    # The manifest is saved before the profile, so a crash between the two
    # writes leaves a record that over-claims a line, which a reversal can
    # check, rather than a line no record names.
    km.save(dest, manifest)
    if content and not content.endswith("\n"):
        content += "\n"
    km.write_atomic(abs_profile, content + line + "\n")
    print(f"{alias}: appended to {display}")
    print(f"the line: {line}")
    print("it takes effect in new shells, or after: source " + display)
else:
    if record is None:
        print(f"{alias}: not recorded for {display}; left alone")
        sys.exit(0)
    if record.get("was_present"):
        print(f"{alias}: left in {display}, because it was already there before the install")
    elif not os.path.isfile(abs_profile):
        print(f"{alias}: gone, {display} no longer exists")
    else:
        line_present = record["line"] in open(abs_profile, encoding="utf-8").read().splitlines()
        if not line_present:
            print(f"{alias}: gone, already removed from {display}")
        else:
            outcome = km.remove_alias_exact(abs_profile, record)
            if outcome == "restored" and not os.path.isfile(abs_profile):
                print(f"{alias}: removed {display}, which the alias write created")
            elif outcome == "restored":
                print(f"{alias}: removed; {display} is back to its pre-append bytes")
            else:
                print(f"{alias}: removed the line from {display}, which had other "
                      "changes since, so the rest stays as it is")
    manifest["aliases"] = [r for r in manifest["aliases"] if r is not record]
    km.save(dest, manifest)

print(f"recorded in {km.manifest_path(dest)}")
PYEOF
exit $?
