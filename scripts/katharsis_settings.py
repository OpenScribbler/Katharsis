"""Settings edits Katharsis makes, and the record that lets it undo them.

Two edits are offered to an installer, one by each skill:

  deny-askuserquestion   append "AskUserQuestion" to permissions.deny
  disable-auto-memory    set autoMemoryEnabled to false

Both mutate a settings file the installer owns, so each edit records whether
the value was already there before Katharsis touched it. A reversal removes
only what Katharsis added, and restores rather than deletes a key that already
held a different value.

Imported by scripts/settings-edit.sh and scripts/uninstall-rules.sh, which put
this directory on sys.path.
"""

import json
import os
import shutil

import katharsis_manifest as km

# Each preset names one edit, in the form the manifest records it.
PRESETS = {
    "deny-askuserquestion": {
        "key": "permissions.deny",
        "op": "array_append",
        "value": "AskUserQuestion",
        "why": "removes the AskUserQuestion tool from the assistant's context",
    },
    "disable-auto-memory": {
        "key": "autoMemoryEnabled",
        "op": "set",
        "value": False,
        "why": "turns the auto memory feature off",
    },
}

MISSING = object()


def load(path):
    """Return (data, existed). A missing or empty file reads as an empty object."""
    if not os.path.isfile(path):
        return {}, False
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    if not text.strip():
        return {}, True
    return json.loads(text), True


def save(path, data):
    km.write_atomic(path, json.dumps(data, indent=2) + "\n")


def get(data, dotted):
    """Return the value at a dotted key, or MISSING."""
    node = data
    for part in dotted.split("."):
        if not isinstance(node, dict) or part not in node:
            return MISSING
        node = node[part]
    return node


def _containers(data, dotted):
    """Walk to the parent of a dotted key, creating dicts, and report which it created.

    An intermediate key holding a non-dict is refused rather than replaced,
    because replacing it would destroy a value the installer set."""
    parts = dotted.split(".")
    created = []
    node = data
    walked = []
    for part in parts[:-1]:
        walked.append(part)
        if part not in node:
            node[part] = {}
            created.append(".".join(walked))
        elif not isinstance(node[part], dict):
            raise ValueError(f"{'.'.join(walked)} is not an object; refusing to edit inside it")
        node = node[part]
    return node, parts[-1], created


def _find_parent(data, dotted):
    """Walk to the parent of a dotted key without creating or replacing anything.

    Returns (parent, leaf), with parent None when any container on the path is
    missing or holds a non-dict, so a reversal never writes where it only reads."""
    parts = dotted.split(".")
    node = data
    for part in parts[:-1]:
        if not isinstance(node, dict) or part not in node or not isinstance(node[part], dict):
            return None, parts[-1]
        node = node[part]
    return node, parts[-1]


def apply_edit(data, preset):
    """Apply one preset. Returns (changed, record fields describing what to undo)."""
    key, op, value = preset["key"], preset["op"], preset["value"]
    current = get(data, key)
    parent, leaf, created = _containers(data, key)

    if op == "array_append":
        # A key holding null is a value the installer wrote, so it is refused
        # like any other non-array rather than treated as missing.
        if leaf not in parent:
            parent[leaf] = []
            created.append(key)
        elif not isinstance(parent[leaf], list):
            raise ValueError(f"{key} is not an array; refusing to edit it")
        was_present = value in parent[leaf]
        if not was_present:
            parent[leaf].append(value)
        return (not was_present), {
            "key": key, "op": op, "value": value,
            "was_present": was_present, "created_keys": created,
        }

    if op == "set":
        # was_present means the key already held this exact value, which is what
        # gates the reversal. A key holding something else is recorded as
        # prior_value instead, so the reversal restores it rather than deleting it.
        key_existed = current is not MISSING
        was_present = key_existed and current == value
        parent[leaf] = value
        record = {
            "key": key, "op": op, "value": value,
            "was_present": was_present, "created_keys": created,
        }
        if key_existed and not was_present:
            record["prior_value"] = current
        return (not was_present), record

    raise ValueError(f"unknown op {op!r}")


def reverse_edit(data, record):
    """Undo one recorded edit. Returns (changed, reason).

    A value the installer had already set is never removed: was_present is the
    field that separates a Katharsis write from state Katharsis found. A key
    that held a different value is restored to it rather than deleted.
    """
    key, op = record["key"], record["op"]
    if record.get("was_present"):
        return False, "was already set before the install; left as it is"

    parent, leaf = _find_parent(data, key)
    if parent is None:
        return False, "the containers that held it are already gone"
    changed = False
    reason = "the install's entry is already gone"

    if op == "array_append":
        arr = parent.get(leaf)
        if isinstance(arr, list) and record["value"] in arr:
            arr.remove(record["value"])
            changed = True
            reason = "removed the entry the install added"
        if (isinstance(parent.get(leaf), list) and not parent[leaf]
                and key in (record.get("created_keys") or [])):
            del parent[leaf]
    elif op == "set":
        if leaf in parent and parent[leaf] == record["value"]:
            if "prior_value" in record:
                parent[leaf] = record["prior_value"]
                reason = "restored the value it had before"
            else:
                del parent[leaf]
                reason = "removed the entry the install added"
            changed = True
    else:
        raise ValueError(f"unknown op {op!r}")

    # Prune only the containers this edit created, and only while they are empty.
    for dotted in sorted(record.get("created_keys") or [], key=len, reverse=True):
        if dotted == key:
            continue
        node, leaf_name = _find_parent(data, dotted)
        if node is not None and isinstance(node.get(leaf_name), dict) and not node[leaf_name]:
            del node[leaf_name]
    return changed, reason


def save_or_restore(path, data, dest, backups):
    """Write data to path, restoring the pre-install bytes where they match.

    Writing JSON back through a serializer reformats the whole file, so a
    reversal landing on exactly the data a recorded backup holds copies that
    backup's bytes instead. `backups` holds the manifest-relative backup names
    recorded for path; anything the installer changed since the backup fails
    the comparison and takes the re-serialized write. Returns True when the
    backup's bytes were restored."""
    if len(backups) == 1:
        source = os.path.join(dest, next(iter(backups)))
        if os.path.isfile(source):
            try:
                with open(source, encoding="utf-8") as fh:
                    if json.load(fh) == data:
                        shutil.copy2(source, path)
                        return True
            except (json.JSONDecodeError, OSError):
                pass
    save(path, data)
    return False
