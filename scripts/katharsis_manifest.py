"""The install manifest: the one record of what Katharsis wrote and what it found.

Every script that writes to an installer's disk records it here, and
`uninstall-rules.sh` reads nothing else. Three fields carry the reversibility:

  files[].state       created, displaced, or preserved
  memory_file.block   prepended, appended, or already_present
  settings[].was_present  whether the key was already set before Katharsis

Each one separates a write Katharsis made from state it merely found, which is
the distinction an uninstall cannot make by looking at the files alone.

Imported by the python heredocs in scripts/*.sh, which put this directory on
sys.path. Kept as a module rather than duplicated per script, because four
writers sharing one schema must not drift.
"""

import hashlib
import json
import os
import re
import shutil
import tempfile
import time

VERSION = 1
MANIFEST_NAME = ".katharsis-install.json"
DISPLACED_DIR = ".katharsis-displaced"
PROMOTED_NAME = "promoted.md"

BLOCK_BEGIN = "<!-- katharsis:begin (managed block; remove with scripts/uninstall-rules.sh) -->"
BLOCK_END = "<!-- katharsis:end -->"

# Matches the whole managed block, including the markers, so a removal splices
# out exactly what an install spliced in.
BLOCK_RE = re.compile(
    re.escape(BLOCK_BEGIN) + r".*?" + re.escape(BLOCK_END),
    re.DOTALL,
)

# The pre-block format: one bare import line, appended by an earlier version.
LEGACY_IMPORT_RE = re.compile(r"^@.*/loader\.md$", re.MULTILINE)

# A leading YAML frontmatter block, which a prepend must land after rather than
# before, because splitting frontmatter breaks every reader of the file.
FRONTMATTER_RE = re.compile(r"\A---\r?\n.*?\r?\n---[ \t]*\r?\n", re.DOTALL)


# --- paths and hashes -----------------------------------------------------------

def tilde(path):
    """Render an absolute path with ~ for HOME, which is how the import line reads."""
    home = os.path.expanduser("~")
    absolute = os.path.abspath(path)
    if absolute == home:
        return "~"
    if absolute.startswith(home + os.sep):
        return "~" + absolute[len(home):]
    return absolute


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha256_file(path):
    with open(path, "rb") as fh:
        return sha256_bytes(fh.read())


def manifest_path(dest):
    return os.path.join(dest, MANIFEST_NAME)


def displaced_dir(dest):
    return os.path.join(dest, DISPLACED_DIR)


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# --- load and save --------------------------------------------------------------

def load(dest):
    """Return the manifest at dest, or None when there is none to read."""
    path = manifest_path(dest)
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def blank(dest):
    return {
        "version": VERSION,
        "tool": "katharsis",
        "backend": "native",
        "installed_at": now(),
        "updated_at": now(),
        "dest": os.path.abspath(dest),
        "dest_display": tilde(dest),
        "files": [],
        "memory_file": None,
        "settings": [],
        "audit": [],
    }


def save(dest, data):
    """Write the manifest through a temp file, so a crash never truncates it."""
    data["updated_at"] = now()
    path = manifest_path(dest)
    os.makedirs(dest, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=dest, prefix=".manifest-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, sort_keys=False)
            fh.write("\n")
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def find_file(data, name):
    for entry in data.get("files") or []:
        if entry.get("name") == name:
            return entry
    return None


def find_setting(data, path, key, value):
    for entry in data.get("settings") or []:
        if (entry.get("path") == path and entry.get("key") == key
                and entry.get("value") == value):
            return entry
    return None


# --- archiving ------------------------------------------------------------------

def archive(dest, src, label):
    """Copy src under the displaced directory and return its manifest-relative path.

    A name already taken gets a numeric suffix rather than an overwrite, because
    the point of the archive is that nothing it holds is lost.
    """
    target_dir = displaced_dir(dest)
    os.makedirs(target_dir, exist_ok=True)
    candidate = os.path.join(target_dir, label)
    n = 1
    while os.path.exists(candidate):
        root, ext = os.path.splitext(label)
        candidate = os.path.join(target_dir, f"{root}.{n}{ext}")
        n += 1
    shutil.copy2(src, candidate)
    return os.path.join(DISPLACED_DIR, os.path.basename(candidate))


def write_atomic(path, text):
    """Replace path's contents in one step, so a reader never sees a half file."""
    directory = os.path.dirname(os.path.abspath(path)) or "."
    os.makedirs(directory, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=directory, prefix=".katharsis-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


# --- the managed block ----------------------------------------------------------

def block_text(dest_display):
    return f"{BLOCK_BEGIN}\n@{dest_display}/loader.md\n{BLOCK_END}"


def find_block(text):
    """Return the (start, end) span of the managed block, or None."""
    match = BLOCK_RE.search(text)
    return match.span() if match else None


def find_legacy_import(text):
    """Return the span of a bare pre-block import line, or None."""
    match = LEGACY_IMPORT_RE.search(text)
    return match.span() if match else None


def insert_block(text, block, position):
    """Return text with block inserted at position, which is 'top' or 'end'.

    A 'top' insert lands after YAML frontmatter when the file opens with it.
    """
    if position not in ("top", "end"):
        raise ValueError(f"position must be top or end, got {position!r}")

    if position == "end":
        if not text:
            return block + "\n"
        if not text.endswith("\n"):
            text += "\n"
        return text + "\n" + block + "\n"

    if not text:
        return block + "\n"
    frontmatter = FRONTMATTER_RE.match(text)
    if frontmatter:
        head, tail = text[:frontmatter.end()], text[frontmatter.end():]
        return head + "\n" + block + "\n\n" + tail.lstrip("\n")
    return block + "\n\n" + text.lstrip("\n")


def remove_block(text, span):
    """Splice the block out, restoring the bytes an insert_block call replaced.

    A block written at top or end round-trips exactly: insert then remove
    returns the original file byte for byte. A block a reader moved into the
    middle of the file loses the blank lines around it, which is the one case
    the insert did not create.
    """
    start, end = span
    before, after = text[:start], text[end:]
    head = before.rstrip("\n") + "\n" if before.strip() else ""
    tail = after.lstrip("\n")
    return head + tail
