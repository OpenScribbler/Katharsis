#!/usr/bin/env bash
# setup-rules.sh: the deterministic engine behind the katharsis-setup skill.
# Discovery and questions stay in the skill; this script only checks the
# placeholder contract, applies substitutions, and records what it wrote.
#
# Modes:
#   check   Verify rules/*.md against rules/placeholders.yaml: zero undeclared
#           placeholders, zero unused declarations, no file-location mismatches.
#   apply   Copy the chosen rules/*.md to --dest with each {{NAME}} substituted,
#           generate a loader.md that imports only those files, write the
#           install manifest, and optionally insert the managed import block
#           into a memory file, once, idempotently. --select names the rule
#           files to install; without it, every rule file is installed.
#   reseal  Bring the manifest back in step with the installed files after a
#           deliberate edit, such as the audit appending a derived rule. Saves a
#           pre-change copy of every changed file, updates its recorded hash so
#           an uninstall still knows the file is Katharsis's, and registers any
#           new file as content the installer owns. Without this, an edit made
#           through the audit reads as the installer's and the file is kept for
#           ever; with it, the edit stays reversible.
#
# Values come from --set NAME=VALUE. A required placeholder with no value and
# no default is a loud error, and a NAME the contract does not declare is too.
#
# apply verifies every substitution in memory before it writes anything, so a
# leftover placeholder leaves the destination untouched rather than half
# installed. A destination file it did not write is archived under
# .katharsis-displaced/ before being replaced, and the manifest records which
# files were created, which were displaced, and whether the memory-file block
# was inserted here or found already in place. scripts/uninstall-rules.sh reads
# that manifest and nothing else.
#
# The memory file receives one delimited block, never loose lines:
#
#   <!-- katharsis:begin (managed block; remove with scripts/uninstall-rules.sh) -->
#   @~/.claude/katharsis/loader.md
#   <!-- katharsis:end -->
#
# Usage:
#   setup-rules.sh check [--rules DIR] [--contract FILE]
#   setup-rules.sh apply --dest DIR [--set NAME=VALUE]... [--import-into FILE]
#                        [--position top|end] [--select NAME[,NAME]...]
#                        [--wrapper] [--rules DIR] [--contract FILE]
#   setup-rules.sh reseal --dest DIR [--note TEXT]
#     --position top   insert the block at the top of the memory file (default),
#                      after YAML frontmatter when the file opens with it
#     --position end   append the block instead
#     --select NAMES   the rule files to install, by name with or without .md,
#                      such as writing,git-writing (default: every rule file)
#     --wrapper        also write the kclaude launch wrapper, which appends the
#                      installed rules to the system prompt at every launch;
#                      the append-mode alternative to --import-into

set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
RULES="$HERE/../rules"
CONTRACT=""
DEST=""
IMPORT_INTO=""
POSITION="top"
SELECT=""
WRAPPER=0
SETS=()

NOTE=""

MODE="${1:-}"
case "$MODE" in
  check|apply|reseal) shift ;;
  *) echo "usage: setup-rules.sh check|apply|reseal [options]" >&2; exit 2 ;;
esac

while [ $# -gt 0 ]; do
  case "$1" in
    --rules)       [ $# -ge 2 ] || { echo "--rules requires a value" >&2; exit 2; }; RULES="$2"; shift 2 ;;
    --contract)    [ $# -ge 2 ] || { echo "--contract requires a value" >&2; exit 2; }; CONTRACT="$2"; shift 2 ;;
    --dest)        [ $# -ge 2 ] || { echo "--dest requires a value" >&2; exit 2; }; DEST="$2"; shift 2 ;;
    --import-into) [ $# -ge 2 ] || { echo "--import-into requires a value" >&2; exit 2; }; IMPORT_INTO="$2"; shift 2 ;;
    --position)    [ $# -ge 2 ] || { echo "--position requires top or end" >&2; exit 2; }; POSITION="$2"; shift 2 ;;
    --select)      [ $# -ge 2 ] || { echo "--select requires a value" >&2; exit 2; }; SELECT="$2"; shift 2 ;;
    --wrapper)     WRAPPER=1; shift ;;
    --set)         [ $# -ge 2 ] || { echo "--set requires NAME=VALUE" >&2; exit 2; }; SETS+=("$2"); shift 2 ;;
    --note)        [ $# -ge 2 ] || { echo "--note requires a value" >&2; exit 2; }; NOTE="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -n "$CONTRACT" ] || CONTRACT="$RULES/placeholders.yaml"
if [ "$MODE" != "reseal" ]; then
  [ -d "$RULES" ] || { echo "NOT FOUND: rules directory $RULES" >&2; exit 2; }
  [ -f "$CONTRACT" ] || { echo "NOT FOUND: contract $CONTRACT" >&2; exit 2; }
fi
if { [ "$MODE" = "apply" ] || [ "$MODE" = "reseal" ]; } && [ -z "$DEST" ]; then
  echo "$MODE requires --dest" >&2; exit 2
fi
case "$POSITION" in
  top|end) ;;
  *) echo "--position must be top or end, got: $POSITION" >&2; exit 2 ;;
esac
command -v python3 >/dev/null 2>&1 || { echo "python3 is required and was not found" >&2; exit 2; }

python3 - "$HERE" "$MODE" "$RULES" "$CONTRACT" "$DEST" "$IMPORT_INTO" "$POSITION" "$NOTE" "$SELECT" "$WRAPPER" ${SETS+"${SETS[@]}"} <<'PYEOF'
import os, re, sys

here = sys.argv[1]
sys.path.insert(0, here)
import katharsis_manifest as km

try:
    import yaml
except ImportError:
    print("PyYAML is required and was not found (pip install pyyaml)", file=sys.stderr)
    sys.exit(2)

mode, rules_dir, contract_path, dest, import_into, position, note, select, wrapper_flag = sys.argv[2:11]
set_args = sys.argv[11:]
wrapper = wrapper_flag == "1"

if mode == "reseal":
    data = km.load(dest)
    if data is None:
        print(f"NOT FOUND: no install manifest at {km.manifest_path(dest)}", file=sys.stderr)
        print("Run apply first. Nothing was written.", file=sys.stderr)
        sys.exit(2)
    recorded = {e["name"]: e for e in data.get("files") or []}
    data.setdefault("audit", [])
    changed, adopted = [], []

    for name, entry in recorded.items():
        path = os.path.join(dest, name)
        if not os.path.isfile(path):
            continue
        current = km.sha256_file(path)
        if current == entry.get("sha256"):
            entry.pop("sha256_before", None)
            continue
        if current == entry.get("sha256_before"):
            # The last apply saved this record and crashed before the write,
            # so the file still holds the bytes it named. No edit happened,
            # and the record steps back to what is on disk.
            entry["sha256"] = current
            del entry["sha256_before"]
            changed.append(name)
            print(f"resealed {name}: the last apply never wrote it, so the record steps back")
            continue
        saved = km.archive(dest, path, name + ".pre-reseal")
        data["audit"].append({
            "name": name,
            "archived_to": saved,
            "sha256_before": entry.get("sha256"),
            "sha256_after": current,
            "note": note,
            "rewritten_at": km.now(),
        })
        entry["sha256"] = current
        entry.pop("sha256_before", None)
        changed.append(name)
        print(f"resealed {name}: saved the previous copy to {saved}")

    # A file the audit created holds the installer's own accepted content, so it
    # is recorded as theirs: an uninstall reports it and keeps it.
    for name in sorted(f for f in os.listdir(dest) if f.endswith(".md")):
        if name in recorded:
            continue
        path = os.path.join(dest, name)
        data["files"].append({
            "name": name,
            "sha256": km.sha256_file(path),
            "state": "user_content",
            "note": note,
        })
        adopted.append(name)
        print(f"adopted {name} as content you own, which an uninstall keeps")

    if not changed and not adopted:
        print(f"nothing to reseal: the manifest already matches {dest}")
        sys.exit(0)
    km.save(dest, data)
    print(f"updated {km.manifest_path(dest)}")
    sys.exit(0)

with open(contract_path) as fh:
    contract = yaml.safe_load(fh)

declared = {}
for p in contract.get("placeholders") or []:
    name = p.get("name")
    if not isinstance(name, str) or not re.fullmatch(r"[A-Z0-9_]+", name):
        print(f"invalid contract: bad placeholder name {name!r}", file=sys.stderr)
        sys.exit(2)
    if name in declared:
        print(f"invalid contract: duplicate placeholder {name}", file=sys.stderr)
        sys.exit(2)
    if p.get("default") is not None and not isinstance(p["default"], str):
        print(f"invalid contract: default for {name} must be a string or null", file=sys.stderr)
        sys.exit(2)
    declared[name] = p
if not declared:
    print("invalid contract: no placeholders declared", file=sys.stderr)
    sys.exit(2)

PLACEHOLDER = re.compile(r"\{\{([A-Za-z0-9_]+)\}\}")
md_files = sorted(f for f in os.listdir(rules_dir) if f.endswith(".md"))
if not md_files:
    print(f"NOT FOUND: no .md rule files in {rules_dir}", file=sys.stderr)
    sys.exit(2)

# Where each placeholder actually occurs, keyed by name.
occurs = {}
texts = {}
for f in md_files:
    texts[f] = open(os.path.join(rules_dir, f), encoding="utf-8").read()
    for name in PLACEHOLDER.findall(texts[f]):
        occurs.setdefault(name, set()).add(f)

if mode == "check":
    problems = []
    for name, files in sorted(occurs.items()):
        if name not in declared:
            problems.append(f"undeclared placeholder {{{{{name}}}}} in {', '.join(sorted(files))}")
    # A '{{' that is not part of a well-formed placeholder is malformed: apply
    # would leave it behind, so check has to refuse it now.
    for f in md_files:
        stripped = PLACEHOLDER.sub("", texts[f])
        for i, line in enumerate(stripped.splitlines(), 1):
            if "{{" in line:
                problems.append(f"malformed placeholder in {f}:{i}: {line.strip()}")
    for name, p in declared.items():
        actual = occurs.get(name, set())
        stated = set(p.get("appears_in") or [])
        if not actual:
            problems.append(f"unused declaration {name}: appears in no rule file")
        elif actual != stated:
            problems.append(
                f"location mismatch for {name}: contract says {sorted(stated)}, files say {sorted(actual)}")
    if problems:
        for p in problems:
            print(f"CHECK FAILED: {p}", file=sys.stderr)
        sys.exit(1)
    print(f"contract consistent: {len(declared)} placeholders across {len(md_files)} rule files")
    sys.exit(0)

# --- apply ---------------------------------------------------------------------
# The loader is what the memory file imports, so apply generates it from the
# chosen set rather than copying it: each @ import for a rule file that is not
# installed is dropped, and @promoted.md stays because the memory audit writes
# there whatever the set. check validates every file in rules/, so the
# selection starts here.
LOADER = "loader.md"
if LOADER not in md_files:
    print(f"NOT FOUND: {LOADER} in {rules_dir}; apply generates it from the chosen rule files",
          file=sys.stderr)
    sys.exit(2)
rule_names = [f for f in md_files if f != LOADER]
if select:
    chosen = []
    for raw in select.split(","):
        name = raw.strip()
        if not name:
            continue
        fname = name if name.endswith(".md") else name + ".md"
        if fname not in rule_names:
            print(f"--select names {name}, which is not a rule file in {rules_dir}; "
                  f"choose from: {', '.join(n[:-3] for n in rule_names)}", file=sys.stderr)
            sys.exit(2)
        if fname not in chosen:
            chosen.append(fname)
    if not chosen:
        print("--select names no rule file", file=sys.stderr)
        sys.exit(2)
    selected = sorted(chosen)
else:
    selected = rule_names
install_files = sorted(selected + [LOADER])

values = {}
for arg in set_args:
    if "=" not in arg:
        print(f"--set needs NAME=VALUE, got: {arg}", file=sys.stderr)
        sys.exit(2)
    name, _, value = arg.partition("=")
    if name not in declared:
        print(f"--set names {name}, which the contract does not declare", file=sys.stderr)
        sys.exit(2)
    if "\n" in value:
        print(f"--set value for {name} contains a newline; values must be single-line", file=sys.stderr)
        sys.exit(2)
    values[name] = value

# A required placeholder is required only where it lands: one that appears
# solely in a rule file the selection leaves out has no slot to fill.
missing = []
for name, p in declared.items():
    if name not in values and p.get("default") is not None:
        values[name] = p["default"]
    if p.get("required") and occurs.get(name, set()) & set(install_files):
        if not values.get(name, "").strip():
            missing.append(name)
    else:
        values.setdefault(name, "")
if missing:
    for name in sorted(missing):
        print(f"missing required placeholder: {name} ({declared[name]['asks']})", file=sys.stderr)
    sys.exit(2)

# Validate and read the import target before writing anything, so a typo in
# the memory file path or an unreadable file never leaves a partially applied
# install behind.
memory_content = None
if import_into:
    if not os.path.isfile(import_into):
        print(f"NOT FOUND: memory file {import_into}", file=sys.stderr)
        sys.exit(2)
    try:
        memory_content = open(import_into, encoding="utf-8").read()
    except (UnicodeDecodeError, OSError) as exc:
        print(f"UNREADABLE: memory file {import_into}: {exc}", file=sys.stderr)
        print("nothing was written", file=sys.stderr)
        sys.exit(2)

# Substitute and verify entirely in memory. An unsubstituted placeholder must
# leave the destination untouched, so this loop writes nothing: the earlier
# version wrote every file first and reported the leftover afterwards, which
# left a broken install on disk behind a nonzero exit.
IMPORT_LINE = re.compile(r"^@([^/\s]+\.md)$")
outputs = {}
leftovers = []
for f in install_files:
    out = PLACEHOLDER.sub(lambda m: values.get(m.group(1), m.group(0)), texts[f])
    if f == LOADER:
        kept = []
        for line in out.splitlines(keepends=True):
            match = IMPORT_LINE.match(line.rstrip("\r\n"))
            if match and match.group(1) not in selected and match.group(1) != km.PROMOTED_NAME:
                continue
            kept.append(line)
        out = "".join(kept)
    outputs[f] = out
    for i, line in enumerate(out.splitlines(), 1):
        if "{{" in line:
            leftovers.append(f"{f}:{i}: {line.strip()}")
if leftovers:
    for l in leftovers:
        print(f"UNSUBSTITUTED: {l}", file=sys.stderr)
    print("substitution left placeholders behind; the install is incomplete", file=sys.stderr)
    print("nothing was written", file=sys.stderr)
    sys.exit(2)

# The wrapper is generated like the loader rather than shipped, so it flows
# through the same entry classification and the same manifest record as every
# other destination file, and the uninstall removes it the same way.
if wrapper:
    outputs[km.WRAPPER_NAME] = km.WRAPPER_TEXT
    install_files = install_files + [km.WRAPPER_NAME]

os.makedirs(dest, exist_ok=True)
prior = km.load(dest)
data = prior if prior else km.blank(dest)
data["version"] = km.VERSION
data["dest"] = os.path.abspath(dest)
data["dest_display"] = km.tilde(dest)
data.setdefault("settings", [])
data.setdefault("audit", [])
prior_files = {e["name"]: e for e in (prior or {}).get("files") or []}

# Each destination file is one of three things, and the manifest has to say
# which: created (absent before), reinstalled (ours, unchanged since we wrote
# it), or displaced (someone else's bytes, archived before being replaced).
# Nothing is written in this loop: the manifest is saved first, so a crash
# mid-write leaves files it already names rather than files a re-apply would
# archive as the installer's. The manifest over-claims what was written,
# never under-claims.
entries = []
for f in install_files:
    path = os.path.join(dest, f)
    entry = {"name": f, "sha256": km.sha256_bytes(outputs[f].encode("utf-8")), "state": "created"}
    if os.path.exists(path):
        current = km.sha256_file(path)
        previous = prior_files.get(f)
        if (previous and previous.get("state") != "user_content"
                and km.owns_content(prior, previous, current)):
            # A file unchanged since the last apply keeps that apply's record,
            # and so does a file still holding the bytes an apply or an audit
            # rewrite saved its record over, because a crash between the save
            # and the write leaves those bytes and they are Katharsis's. A
            # displaced entry keeps its state and archive pointer in
            # particular, because relabeling it reinstalled would make the
            # uninstall delete the file without restoring the original. A
            # user_content file is the installer's from birth, so it never
            # takes this branch: a ruleset that ships its name displaces it.
            if previous.get("state") == "displaced" and previous.get("archived_to"):
                entry["state"] = "displaced"
                entry["archived_to"] = previous["archived_to"]
                if "archived_sha256" in previous:
                    entry["archived_sha256"] = previous["archived_sha256"]
            else:
                entry["state"] = "reinstalled"
            if current != entry["sha256"]:
                # The manifest is saved before the write, so until the write
                # lands the file holds these bytes, and the record names them.
                entry["sha256_before"] = current
        elif (previous and previous.get("state") == "displaced" and previous.get("archived_to")
                and current == previous.get("archived_sha256")
                and os.path.isfile(os.path.join(dest, previous["archived_to"]))
                and km.sha256_file(os.path.join(dest, previous["archived_to"])) == current):
            # The installer's original is back on disk and its archive still
            # holds the same bytes, so a crash cut off a first apply or an
            # uninstall finished the restore. The archive stands, because a
            # second copy of the same bytes would only leave litter. An archive
            # holding anything else falls through and is replaced by a fresh
            # copy, because the uninstall restores from it.
            entry["state"] = "displaced"
            entry["archived_to"] = previous["archived_to"]
            entry["archived_sha256"] = current
        else:
            # archived_sha256 lets the uninstall recognize a file it already
            # restored, when a crash cut the restore off before the manifest
            # could record it.
            entry["state"] = "displaced"
            entry["archived_to"] = km.archive(dest, path, f)
            entry["archived_sha256"] = current
            print(f"archived the existing {f} to {entry['archived_to']}")
    entries.append(entry)

# promoted.md holds the rules the memory audit promotes, so an install must
# create it and a re-install must never overwrite it. pristine_sha256 is the
# hash of the file as created, and it is never updated: an uninstall deletes
# this file only while it still matches, and archives it once it carries
# anything the installer approved into it.
PROMOTED_TEMPLATE = (
    "# Promoted memory entries\n"
    "\n"
    "The memory audit writes promoted entries here, and loader.md imports this file.\n"
    "An empty file below this line means nothing has been promoted yet.\n"
)
promoted_path = os.path.join(dest, km.PROMOTED_NAME)
promoted_prior = prior_files.get(km.PROMOTED_NAME)
promoted_digest = km.sha256_bytes(PROMOTED_TEMPLATE.encode("utf-8"))
if os.path.exists(promoted_path):
    promoted_entry = {
        "name": km.PROMOTED_NAME,
        "sha256": km.sha256_file(promoted_path),
        "state": "preserved",
        "pristine_sha256": (promoted_prior or {}).get("pristine_sha256", promoted_digest),
    }
else:
    promoted_entry = {"name": km.PROMOTED_NAME, "sha256": promoted_digest, "state": "created",
                      "pristine_sha256": promoted_digest}
entries.append(promoted_entry)

# A prior entry with no counterpart in this apply is carried forward, because
# dropping it would orphan what it records: a user_content file the reseal
# adopted, a displaced record for a rule file the source no longer ships, or a
# rule file a narrower selection leaves out. That last file stays on disk
# unimported rather than being deleted here, because the uninstall is the one
# removal path and it still reads this record.
current_names = {e["name"] for e in entries}
left_out = []
wrapper_left = False
for name, previous in prior_files.items():
    if name not in current_names:
        entries.append(previous)
        if name in rule_names and os.path.isfile(os.path.join(dest, name)):
            left_out.append(name)
        if name == km.WRAPPER_NAME and os.path.isfile(os.path.join(dest, name)):
            wrapper_left = True
data["files"] = entries
data["rules"] = selected
km.save(dest, data)

for f in install_files:
    km.write_atomic(os.path.join(dest, f), outputs[f])
if wrapper:
    # write_atomic gives a new file the temp file's private mode, and the
    # wrapper has to be executable for the alias to run it.
    os.chmod(os.path.join(dest, km.WRAPPER_NAME), 0o755)
if promoted_entry["state"] == "created":
    km.write_atomic(promoted_path, PROMOTED_TEMPLATE)
# The writes landed, so the bytes each record was saved over are gone and
# sha256_before goes with them. Left in place it would let a later edit that
# happens to reproduce the previous output pass as Katharsis's.
for entry in entries:
    if entry["name"] in outputs:
        entry.pop("sha256_before", None)

written = ", ".join(install_files)
print(f"wrote {len(install_files)} files to {dest}: {written}")
print(f"{LOADER} imports {', '.join(selected)} and {km.PROMOTED_NAME}")
for name in left_out:
    print(f"left {name} in place; {LOADER} no longer imports it, and an uninstall still removes it")
if promoted_entry["state"] == "created":
    print(f"created {km.PROMOTED_NAME} for the memory audit's promoted entries")
else:
    print(f"kept the existing {km.PROMOTED_NAME} untouched")
if wrapper:
    print(f"wrote the launch wrapper {km.WRAPPER_NAME}, which concatenates the installed "
          f"rules and {km.PROMOTED_NAME} at every launch")
    print(f"launch with: {data['dest_display']}/{km.WRAPPER_NAME}")
elif wrapper_left:
    print(f"left {km.WRAPPER_NAME} in place; this apply did not regenerate it, and an "
          "uninstall still removes it")

if import_into:
    block = km.block_text(data["dest_display"])
    content = memory_content
    span = km.find_block(content)
    legacy = km.find_legacy_import(content)
    record = {
        "path": os.path.abspath(import_into),
        "display": km.tilde(import_into),
        "sha256_before": km.sha256_bytes(content.encode("utf-8")),
    }
    previous_block = (prior or {}).get("memory_file") or {}
    same_file = previous_block.get("path") == record["path"]
    owned_before = previous_block.get("block") in ("prepended", "appended")

    # A re-apply pointed at a different memory file removes the block the
    # previous apply wrote, because the manifest holds one memory_file record
    # and replacing it would orphan that block where no uninstall can find it.
    if owned_before and not same_file:
        old_path = previous_block.get("path")
        if old_path and os.path.isfile(old_path):
            outcome = km.remove_block_exact(old_path, previous_block, dest)
            if outcome != "gone":
                old_display = previous_block.get("display", old_path)
                print(f"removed the managed block from {old_display}, which this "
                      "install no longer imports into")

    if span:
        # The block is here. Whether Katharsis may remove it later depends on
        # whether Katharsis put it here, which only the previous manifest knows.
        if same_file and owned_before:
            record["block"] = previous_block["block"]
            record["position"] = previous_block.get("position", position)
            record["sha256_before"] = previous_block.get("sha256_before", record["sha256_before"])
            record["backup"] = previous_block.get("backup")
            print(f"managed block already present in {import_into} (recorded as ours)")
        else:
            record["block"] = "already_present"
            record["position"] = "unknown"
            print(f"managed block already present in {import_into} (not recorded as ours; "
                  "an uninstall will leave it alone)")
    elif legacy:
        # A bare import line from before the managed block existed. Replacing it
        # would rewrite a line Katharsis cannot prove it wrote, so report it.
        record["block"] = "already_present"
        record["position"] = "unknown"
        print(f"import line already present in {import_into} without the managed block; "
              "left as it is")
    else:
        record["backup"] = km.archive(dest, import_into, os.path.basename(import_into) + ".bak")
        record["block"] = "prepended" if position == "top" else "appended"
        record["position"] = position
        # Recorded before the block is written. A crash between the two leaves
        # a record of a block that is not there, which a re-apply and an
        # uninstall both read as gone; the other order leaves a block no
        # record claims, which a re-apply would relabel as the installer's.
        data["memory_file"] = record
        km.save(dest, data)
        km.write_atomic(import_into, km.insert_block(content, block, position))
        where = "top of" if position == "top" else "end of"
        print(f"inserted the managed block at the {where} {import_into}")
        print(f"saved {import_into} as it was to {record['backup']}")
    data["memory_file"] = record

# The two load modes are alternatives by default, and this is the double-load
# case: the memory file imports the rules into every session, and the wrapper
# appends the same text to the system prompt of the sessions it launches.
if wrapper and (data.get("memory_file") or {}).get("block"):
    print("note: the memory file imports the rules and the wrapper appends them, so a "
          "session launched through the wrapper loads the rule text twice and its "
          "context window grows by the size of the rule set")

km.save(dest, data)
print(f"recorded the install in {km.manifest_path(dest)}")
print("uninstall with: scripts/uninstall-rules.sh plan --dest " + dest)
PYEOF
exit $?
