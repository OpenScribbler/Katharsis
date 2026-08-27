#!/usr/bin/env bash
# uninstall-rules.sh: removes what setup-rules.sh installed, and refuses to
# remove anything it cannot prove Katharsis wrote.
#
# The install manifest is the only input. Three of its fields carry the
# decisions: files[].state says whether a file was created here or displaced
# from an installer's own copy, memory_file.block says whether the managed
# block was inserted here or found already in place, and settings[].was_present
# says whether a settings value predates the install.
#
# Modes:
#   plan    Name every action and every refusal. Writes nothing.
#   apply   Execute the plan.
#
# What it refuses, and why:
#   - A destination file whose hash no longer matches the manifest. The
#     installer edited it, so it is theirs now.
#   - promoted.md once anything has been promoted into it, and any file the
#     audit created, such as examples.md. The content inside was written and
#     approved by the installer.
#   - A displaced file whose archived original is missing. Deleting it would
#     leave the installer with nothing.
#   - Everything, when there is no manifest. A guessed uninstall is worse than
#     none, so the run names what a manual removal would touch and stops.
#
# A memory-file block recorded as already_present and a settings value recorded
# as was_present were there before the install, so leaving them in place IS the
# reversal: the run reports them and still completes.
#
# A run that leaves a refusal behind keeps the manifest, holding only the
# remaining entries, so a later run retries them. A clean run removes it.
#
# Usage:
#   uninstall-rules.sh plan  [--dest DIR] [--keep-archive]
#   uninstall-rules.sh apply [--dest DIR] [--keep-archive]
#     --dest DIR       install directory (default: ~/.claude/katharsis)
#     --keep-archive   leave .katharsis-displaced/ in place even when empty

set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.claude/katharsis"
KEEP_ARCHIVE=0

MODE="${1:-}"
case "$MODE" in
  plan|apply) shift ;;
  *) echo "usage: uninstall-rules.sh plan|apply [--dest DIR] [--keep-archive]" >&2; exit 2 ;;
esac

while [ $# -gt 0 ]; do
  case "$1" in
    --dest)         [ $# -ge 2 ] || { echo "--dest requires a value" >&2; exit 2; }; DEST="$2"; shift 2 ;;
    --keep-archive) KEEP_ARCHIVE=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -d "$DEST" ] || {
  echo "NOT FOUND: install directory $DEST (pass --dest)" >&2
  echo "Nothing was read. Exiting nonzero." >&2
  exit 2
}
command -v python3 >/dev/null 2>&1 || { echo "python3 is required and was not found" >&2; exit 2; }

python3 - "$HERE" "$MODE" "$DEST" "$KEEP_ARCHIVE" <<'PYEOF'
import json, os, shutil, sys

here = sys.argv[1]
sys.path.insert(0, here)
import katharsis_manifest as km
import katharsis_settings as ks

mode, dest, keep_archive = sys.argv[2], sys.argv[3], sys.argv[4] == "1"

manifest_file = km.manifest_path(dest)
if not os.path.isfile(manifest_file):
    print(f"NOT FOUND: no install manifest at {manifest_file}", file=sys.stderr)
    print("Katharsis cannot tell its own files from yours without it, and a guessed "
          "uninstall is worse than none. Nothing was read or written.", file=sys.stderr)
    print("", file=sys.stderr)
    print("A manual removal would touch:", file=sys.stderr)
    print(f"  the rule files under {dest}", file=sys.stderr)
    print("  the katharsis:begin block in your memory file (AGENTS.md or CLAUDE.md)",
          file=sys.stderr)
    print('  "AskUserQuestion" in permissions.deny and "autoMemoryEnabled" in '
          "~/.claude/settings.json", file=sys.stderr)
    sys.exit(2)

try:
    data = km.load(dest)
except json.JSONDecodeError as exc:
    print(f"REFUSING: {manifest_file} is not valid JSON ({exc})", file=sys.stderr)
    print("Nothing was written. Repair or delete the manifest by hand.", file=sys.stderr)
    sys.exit(2)

if int(data.get("version", 0)) > km.VERSION:
    print(f"REFUSING: manifest version {data['version']} is newer than this script "
          f"understands ({km.VERSION})", file=sys.stderr)
    print("Use the version of Katharsis that wrote it. Nothing was written.", file=sys.stderr)
    sys.exit(2)

backend = data.get("backend", "native")
if backend != "native":
    print(f"REFUSING: this install was made with the {backend} backend", file=sys.stderr)
    print(f"Uninstall it with {backend}, because that is what holds its records. "
          "Nothing was written.", file=sys.stderr)
    sys.exit(2)

DO = mode == "apply"
print("katharsis uninstall")
print(f"dest: {dest}   manifest: {manifest_file}   mode: {mode}")
print(f"installed: {data.get('installed_at', 'unknown')}")
print()

removed, restored, kept = [], [], []


def keep(what, why):
    kept.append((what, why))
    print(f"keep {what}: {why}")


# --- the rule files -------------------------------------------------------------
remaining_files = []
for entry in data.get("files") or []:
    name = entry["name"]
    path = os.path.join(dest, name)
    archived = entry.get("archived_to")

    if not os.path.exists(path):
        print(f"gone {name}: already removed")
        continue

    current = km.sha256_file(path)

    # A file the audit created holds content the installer accepted, so it is
    # theirs from birth and an uninstall never deletes it.
    if entry.get("state") == "user_content":
        keep(name, "holds content you accepted, so it is yours")
        remaining_files.append(entry)
        continue

    # promoted.md is the installer's own approved content once anything lands in
    # it, so it is removable only while it still matches the file as created.
    if entry.get("pristine_sha256") is not None and current != entry["pristine_sha256"]:
        keep(name, "carries promoted entries you approved")
        remaining_files.append(entry)
        continue

    if current != entry.get("sha256"):
        keep(name, "edited since the install, so it is yours now")
        remaining_files.append(entry)
        continue

    # A displaced file's archive is checked before anything is deleted, because
    # removing the file first and finding the archive missing would leave the
    # installer with neither their original nor a record of it.
    if entry.get("state") == "displaced" and archived:
        source = os.path.join(dest, archived)
        if not os.path.isfile(source):
            keep(name, f"the manifest names {archived}, which is missing, and removing "
                       "the file with nothing to restore would lose your original")
            remaining_files.append(entry)
            continue
        print(f"remove {name}")
        print(f"restore {name} from {archived}")
        if DO:
            shutil.copy2(source, path)
            os.unlink(source)
        removed.append(name)
        restored.append(name)
        continue

    print(f"remove {name}")
    if DO:
        os.unlink(path)
    removed.append(name)

# --- the memory-file block ------------------------------------------------------
memory = data.get("memory_file")
if memory:
    path = memory["path"]
    display = memory.get("display", path)
    state = memory.get("block")
    if state == "already_present":
        # The block predates the install, so leaving it is the reversal. It
        # never blocks completion, or the manifest would name it for ever.
        print(f"leave the block in {display}: it was already there before the install")
    elif not os.path.isfile(path):
        print(f"gone the block in {display}: the file no longer exists")
    else:
        content = open(path, encoding="utf-8").read()
        if km.find_block(content) is None:
            print(f"gone the block in {display}: already removed")
        else:
            print(f"remove the block from {display}")
            if DO:
                outcome = km.remove_block_exact(path, memory, dest)
                if outcome == "restored":
                    print(f"restored {display} to its pre-install bytes")
            removed.append(f"block in {display}")

# --- the settings edits ---------------------------------------------------------
remaining_settings = []
by_file = {}
for record in data.get("settings") or []:
    by_file.setdefault(record["path"], []).append(record)

for settings_path, records in sorted(by_file.items()):
    try:
        settings, existed = ks.load(settings_path)
    except json.JSONDecodeError as exc:
        for record in records:
            keep(f"{record['name']} in {settings_path}", f"the file is not valid JSON ({exc})")
            remaining_settings.append(record)
        continue
    if not existed:
        for record in records:
            print(f"gone {record['name']}: {settings_path} does not exist")
        continue

    touched = False
    for record in records:
        changed, why = ks.reverse_edit(settings, record)
        if record.get("was_present"):
            # The value predates the install, so leaving it is the reversal.
            # It never blocks completion.
            print(f"leave {record['name']} in {km.tilde(settings_path)}: {why}")
            continue
        print(f"reverse {record['name']} in {km.tilde(settings_path)}: {why}")
        if changed:
            touched = True
            removed.append(record["name"])
    if touched and DO:
        backup = km.archive(dest, settings_path, os.path.basename(settings_path) + ".uninstall.bak")
        print(f"saved {settings_path} as it was to {backup}")
        if not settings and any(r.get("created_file") for r in records):
            # The install created this file, so an emptied reversal removes it
            # rather than leaving a stray {} behind.
            os.unlink(settings_path)
            print(f"removed {settings_path}, which the install created")
        elif ks.save_or_restore(settings_path, settings, dest,
                                {r["backup"] for r in records if r.get("backup")}):
            print(f"restored {settings_path} to its pre-install bytes")

# --- the audit's saved copies ---------------------------------------------------
for record in data.get("audit") or []:
    saved = record.get("archived_to")
    if saved and os.path.isfile(os.path.join(dest, saved)):
        print(f"note the audit's pre-rewrite copy of {record.get('name', 'a rule file')} "
              f"is at {saved}")

# --- summary --------------------------------------------------------------------
print()
print(f"totals removed={len(removed)} restored={len(restored)} kept={len(kept)}")

if not DO:
    print()
    print("This was a plan and wrote nothing. Run the same command with apply to execute it.")
    sys.exit(0)

leftovers = remaining_files or remaining_settings
if leftovers:
    data["files"] = remaining_files
    data["settings"] = remaining_settings
    data["memory_file"] = None
    data["audit"] = data.get("audit") or []
    km.save(dest, data)
    print()
    print(f"{len(kept)} item(s) were kept, so {manifest_file} stays and still names them.")
    print("Re-run this script after resolving them, or remove them by hand.")
    sys.exit(0)

os.unlink(manifest_file)
print(f"removed {manifest_file}")

archive_dir = km.displaced_dir(dest)
if os.path.isdir(archive_dir):
    contents = os.listdir(archive_dir)
    if contents and not keep_archive:
        print(f"kept {archive_dir}, which still holds {len(contents)} saved file(s): "
              f"{', '.join(sorted(contents))}")
    elif not contents and not keep_archive:
        os.rmdir(archive_dir)
        print(f"removed the empty {archive_dir}")

if os.path.isdir(dest) and not os.listdir(dest):
    os.rmdir(dest)
    print(f"removed the empty {dest}")

print("uninstall complete")
PYEOF
exit $?
