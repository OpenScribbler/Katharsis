#!/usr/bin/env bash
# settings-edit.sh: the deterministic engine behind the two settings edits the
# skills offer. Both skills previously had the model hand-edit a global config
# file with no record and no reversal, which was the least reversible write in
# the product.
#
# Edits:
#   deny-askuserquestion  append "AskUserQuestion" to permissions.deny
#   disable-auto-memory   set autoMemoryEnabled to false
#
# Modes:
#   status   Report each edit's current state in the settings file. Writes nothing.
#   apply    Make the edit and record it in the install manifest, including
#            whether the value was already set before Katharsis touched it.
#   reverse  Undo a recorded edit. A value the installer had already set is
#            reported and kept, never removed.
#
# --dest names the install directory holding the manifest, because an edit no
# manifest records is an edit no uninstall can find.
#
# Usage:
#   settings-edit.sh status  [--settings FILE] [--dest DIR]
#   settings-edit.sh apply   --edit NAME [--settings FILE] [--dest DIR]
#   settings-edit.sh reverse --edit NAME [--settings FILE] [--dest DIR]
#     --edit NAME      deny-askuserquestion | disable-auto-memory | all
#     --settings FILE  default: ~/.claude/settings.json
#     --dest DIR       default: ~/.claude/katharsis

set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
SETTINGS="$HOME/.claude/settings.json"
DEST="$HOME/.claude/katharsis"
EDIT=""

MODE="${1:-}"
case "$MODE" in
  status|apply|reverse) shift ;;
  *) echo "usage: settings-edit.sh status|apply|reverse [--edit NAME] [options]" >&2; exit 2 ;;
esac

while [ $# -gt 0 ]; do
  case "$1" in
    --settings) [ $# -ge 2 ] || { echo "--settings requires a value" >&2; exit 2; }; SETTINGS="$2"; shift 2 ;;
    --dest)     [ $# -ge 2 ] || { echo "--dest requires a value" >&2; exit 2; }; DEST="$2"; shift 2 ;;
    --edit)     [ $# -ge 2 ] || { echo "--edit requires a value" >&2; exit 2; }; EDIT="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ "$MODE" != "status" ] && [ -z "$EDIT" ]; then
  echo "$MODE requires --edit deny-askuserquestion|disable-auto-memory|all" >&2; exit 2
fi
command -v python3 >/dev/null 2>&1 || { echo "python3 is required and was not found" >&2; exit 2; }

python3 - "$HERE" "$MODE" "$SETTINGS" "$DEST" "$EDIT" <<'PYEOF'
import json, os, sys

here = sys.argv[1]
sys.path.insert(0, here)
import katharsis_manifest as km
import katharsis_settings as ks

mode, settings_path, dest, edit = sys.argv[2:6]

names = list(ks.PRESETS) if edit in ("", "all") else [edit]
for name in names:
    if name not in ks.PRESETS:
        print(f"unknown edit {name}; expected one of: {', '.join(ks.PRESETS)}", file=sys.stderr)
        sys.exit(2)

try:
    data, existed = ks.load(settings_path)
except json.JSONDecodeError as exc:
    print(f"REFUSING: {settings_path} is not valid JSON ({exc})", file=sys.stderr)
    print("Fix the file by hand; editing it here would discard content.", file=sys.stderr)
    sys.exit(2)

print("katharsis settings-edit")
print(f"settings: {settings_path}{'' if existed else ' (does not exist yet)'}")
print(f"manifest: {km.manifest_path(dest)}")
print()

if mode == "status":
    for name in names:
        preset = ks.PRESETS[name]
        current = ks.get(data, preset["key"])
        if preset["op"] == "array_append":
            present = isinstance(current, list) and preset["value"] in current
        else:
            present = current is not ks.MISSING and current == preset["value"]
        state = "applied" if present else "not applied"
        print(f"{name}: {state} ({preset['key']} {preset['why']})")
    sys.exit(0)

manifest = km.load(dest)
if manifest is None:
    if mode == "reverse":
        print(f"NOT FOUND: no manifest at {km.manifest_path(dest)}", file=sys.stderr)
        print("Nothing recorded these edits, so nothing here can prove Katharsis made "
              "them. Reverse them by hand.", file=sys.stderr)
        sys.exit(2)
    print(f"NOT FOUND: no manifest at {km.manifest_path(dest)}", file=sys.stderr)
    print("Run setup-rules.sh apply first, so the edit has somewhere to be recorded.",
          file=sys.stderr)
    sys.exit(2)
manifest.setdefault("settings", [])

abs_settings = os.path.abspath(settings_path)
changed_any = False
touched_records = []

if mode == "apply":
    for name in names:
        preset = ks.PRESETS[name]
        try:
            changed, record = ks.apply_edit(data, preset)
        except ValueError as exc:
            print(f"REFUSING {name}: {exc}", file=sys.stderr)
            print("Nothing was written.", file=sys.stderr)
            sys.exit(2)
        record["name"] = name
        record["path"] = abs_settings
        record["display"] = km.tilde(settings_path)
        record["applied_at"] = km.now()
        if not existed:
            # The install is creating this file, so a reversal that empties it
            # removes the file rather than leaving a stray {} behind.
            record["created_file"] = True
        existing = km.find_setting(manifest, abs_settings, preset["key"], preset["value"])
        if existing:
            # Every field describing what the file looked like before Katharsis
            # touched it belongs to the first apply. A second apply sees a file
            # it already edited, so its own readings are wrong: was_present
            # would relabel a Katharsis write as the installer's, and
            # created_keys would forget the containers the first apply made,
            # leaving empty scaffolding behind after a reversal.
            for field in ("was_present", "created_keys", "prior_value", "backup",
                          "applied_at", "created_file"):
                if field in existing:
                    record[field] = existing[field]
            manifest["settings"][manifest["settings"].index(existing)] = record
        else:
            manifest["settings"].append(record)
        touched_records.append(record)
        if record["was_present"]:
            print(f"{name}: already set before this install; recorded, nothing written")
        elif changed:
            if "prior_value" in record:
                print(f"{name}: applied over the value it held "
                      f"({json.dumps(record['prior_value'])}), which a reversal restores")
            else:
                print(f"{name}: applied ({preset['key']} {preset['why']})")
            changed_any = True
        else:
            print(f"{name}: already applied by Katharsis; nothing to do")
else:
    reversed_records = []
    for name in names:
        record = next((r for r in manifest["settings"]
                       if r.get("name") == name and r.get("path") == abs_settings), None)
        if record is None:
            print(f"{name}: not recorded for {settings_path}; left alone")
            continue
        changed, why = ks.reverse_edit(data, record)
        print(f"{name}: {why}")
        if changed:
            changed_any = True
        reversed_records.append(record)
        manifest["settings"] = [r for r in manifest["settings"] if r is not record]

if changed_any:
    if existed:
        backup = km.archive(dest, settings_path, os.path.basename(settings_path) + ".bak")
        print(f"saved {settings_path} as it was to {backup}")
        for record in touched_records:
            record.setdefault("backup", backup)
    if mode == "apply":
        # The manifest is saved before the settings file, so a crash between
        # the two writes leaves a record that over-claims an edit, which a
        # reversal can check, rather than an edit no record names.
        km.save(dest, manifest)
        ks.save(settings_path, data)
        print(f"wrote {settings_path}")
    else:
        # A reversal writes the settings file first for the same reason: the
        # record has to outlive the edit it describes.
        if not data and any(r.get("created_file") for r in reversed_records):
            os.unlink(settings_path)
            print(f"removed {settings_path}, which the install created")
        elif ks.save_or_restore(settings_path, data, dest,
                                {r["backup"] for r in reversed_records if r.get("backup")}):
            print(f"restored {settings_path} to its pre-install bytes")
        else:
            print(f"wrote {settings_path}")
else:
    print(f"{settings_path} needed no change")

km.save(dest, manifest)
print(f"recorded in {km.manifest_path(dest)}")
PYEOF
exit $?
