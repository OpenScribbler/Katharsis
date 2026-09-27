#!/usr/bin/env bash
# instruction-files.sh: lists every instruction file Claude Code loads for a
# folder, so the rules-check skill reads the same set the model receives.
#
#   instruction-files.sh [folder]     (default: the current folder)
#
# Prints one line per file, "<kind><TAB><path>", in load order, each file once:
#
#   managed   the managed policy file (/etc/claude-code or
#             /Library/Application Support/ClaudeCode)
#   user      ~/.claude/CLAUDE.md and ~/.claude/rules/**/*.md
#   project   CLAUDE.md, .claude/CLAUDE.md, CLAUDE.local.md in the folder and
#             every folder above it, and the folder's .claude/rules/**/*.md
#   agents    AGENTS.md in the same folders, listed only where Claude Code
#             reads it: no CLAUDE.md anywhere in that chain, or the
#             instructionFiles setting is claude-md-and-agents-md
#   subdir    CLAUDE.md and CLAUDE.local.md below the folder, which load when
#             Claude reads a file in that subfolder
#   import    a file pulled in with @path from any file above, up to four
#             hops, skipping code spans and fenced blocks
#
# Reads only; writes nothing. Exits 0 with no output when no file exists, and
# 2 when the folder does not exist. CLAUDE_DIR overrides ~/.claude and
# KATHARSIS_MANAGED overrides the managed policy file's path, for the tests.

set -u
DIR="${1:-$PWD}"
[ -d "$DIR" ] || { echo "instruction-files: no folder $DIR" >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo "instruction-files: python3 not found" >&2; exit 2; }

exec python3 - "$DIR" "${CLAUDE_DIR:-$HOME/.claude}" "${KATHARSIS_MANAGED:-}" <<'PY'
import json, os, re, sys

folder = os.path.realpath(sys.argv[1])
claude_dir = sys.argv[2]
managed = [sys.argv[3]] if sys.argv[3] else ["/etc/claude-code/CLAUDE.md", "/Library/Application Support/ClaudeCode/CLAUDE.md"]
seen, out = set(), []


def add(kind, path):
    if not os.path.isfile(path):
        return False
    real = os.path.realpath(path)
    if real in seen:
        return False
    seen.add(real)
    out.append((kind, path))
    return True


def rules(base):
    found = []
    for root, dirs, files in os.walk(base):
        dirs.sort()
        found += [os.path.join(root, f) for f in sorted(files) if f.endswith(".md")]
    return found


def setting():
    # The most specific settings file that sets it wins.
    value = None
    for p in (f"{claude_dir}/settings.json", f"{folder}/.claude/settings.json", f"{folder}/.claude/settings.local.json"):
        try:
            value = json.load(open(p)).get("instructionFiles") or value
        except (OSError, ValueError, AttributeError):
            pass
    return value


for p in managed:
    add("managed", p)
add("user", f"{claude_dir}/CLAUDE.md")
for p in rules(f"{claude_dir}/rules"):
    add("user", p)

chain, d = [], folder
while True:
    chain.insert(0, d)
    if d == os.path.dirname(d):
        break
    d = os.path.dirname(d)
has_claude = any(os.path.isfile(f"{c}/CLAUDE.md") or os.path.isfile(f"{c}/.claude/CLAUDE.md") for c in chain)
agents = not has_claude or setting() == "claude-md-and-agents-md"
for c in chain:
    add("project", f"{c}/CLAUDE.md")
    add("project", f"{c}/.claude/CLAUDE.md")
    add("project", f"{c}/CLAUDE.local.md")
    if agents:
        add("agents", f"{c}/AGENTS.md")
for p in rules(f"{folder}/.claude/rules"):
    add("project", p)

skip = {".git", "node_modules", ".venv", "venv", "dist", "build", "target"}
for root, dirs, files in os.walk(folder):
    dirs[:] = sorted(x for x in dirs if x not in skip)
    if root == folder:
        continue
    for name in ("CLAUDE.md", "CLAUDE.local.md"):
        add("subdir", os.path.join(root, name))

IMPORT = re.compile(r"(?<![\w@`])@((?:~|\.{1,2})?/?[\w.~-][^\s`)\]>'\"]*)")


def imports(path):
    try:
        text = open(path, encoding="utf-8", errors="replace").read()
    except OSError:
        return []
    text = re.sub(r"^(```|~~~).*?^\1", "", text, flags=re.S | re.M)
    text = re.sub(r"`[^`\n]*`", "", text)
    found = []
    for m in IMPORT.finditer(text):
        ref = m.group(1).rstrip(".,;:!?")
        ref = os.path.expanduser(ref) if ref.startswith("~") else ref
        found.append(os.path.normpath(os.path.join(os.path.dirname(path), ref)))
    return found


frontier = [p for _, p in out]
for _ in range(4):
    nxt = []
    for p in frontier:
        for q in imports(p):
            if add("import", q):
                nxt.append(q)
    frontier = nxt

for kind, path in out:
    print(f"{kind}\t{path}")
PY
