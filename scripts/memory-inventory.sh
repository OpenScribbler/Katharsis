#!/usr/bin/env bash
# memory-inventory.sh: the deterministic engine behind the memory audit in the
# katharsis-audit skill. Inventories an assistant memory store, resolves the
# wiki-style links between entries, and archives entries with a rollback path.
#
# Modes:
#   list     One line per entry, carrying its type, size, link degrees, and the
#            description its own frontmatter states. The skill turns that into
#            the keep-or-delete checklist without calling a model.
#   links    One line per wiki link, each marked exact, normalized, or dangling.
#   impact   Name entries with --delete and report every link in a surviving
#            entry that the delete would leave dangling. Writes nothing.
#   archive  Move the named entries into --to, remove their lines from the
#            project index, and print the command that puts everything back.
#
# A delete that breaks a surviving entry's link is refused, because a purge that
# silently breaks references is worse than no purge. Links that already dangle
# are reported and never block, because the delete did not cause them.
#
# An entry whose frontmatter does not parse is reported and counted rather than
# ending the run, because one malformed file must not hide the other 167.
#
# Usage:
#   memory-inventory.sh list    [--root DIR] [--project SLUG]
#   memory-inventory.sh links   [--root DIR] [--project SLUG]
#   memory-inventory.sh impact  --delete NAME [--delete NAME]... [--root DIR] [--project SLUG]
#   memory-inventory.sh archive --delete NAME [--delete NAME]... --to DIR [--root DIR] [--project SLUG]
#     --root DIR    config root holding projects/ (default: ~/.claude)
#     --project S   restrict to one project directory under projects/
#     --delete NAME an entry stem, or project/stem when the stem is ambiguous

set -u

ROOT="$HOME/.claude"
PROJECT=""
TO=""
DELETES=()

MODE="${1:-}"
case "$MODE" in
  list|links|impact|archive) shift ;;
  *) echo "usage: memory-inventory.sh list|links|impact|archive [options]" >&2; exit 2 ;;
esac

while [ $# -gt 0 ]; do
  case "$1" in
    --root)    [ $# -ge 2 ] || { echo "--root requires a value" >&2; exit 2; }; ROOT="$2"; shift 2 ;;
    --project) [ $# -ge 2 ] || { echo "--project requires a value" >&2; exit 2; }; PROJECT="$2"; shift 2 ;;
    --to)      [ $# -ge 2 ] || { echo "--to requires a value" >&2; exit 2; }; TO="$2"; shift 2 ;;
    --delete)  [ $# -ge 2 ] || { echo "--delete requires a value" >&2; exit 2; }; DELETES+=("$2"); shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

PROJECTS="$ROOT/projects"
[ -d "$PROJECTS" ] || {
  echo "NOT FOUND: $PROJECTS (no project directories at this root; pass --root)" >&2
  echo "The memory store is UNREAD, not empty. Exiting nonzero." >&2
  exit 2
}
case "$MODE" in
  impact|archive)
    [ "${#DELETES[@]}" -gt 0 ] || { echo "$MODE requires at least one --delete NAME" >&2; exit 2; } ;;
esac
[ "$MODE" != "archive" ] || [ -n "$TO" ] || { echo "archive requires --to DIR" >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo "python3 is required and was not found" >&2; exit 2; }

python3 - "$MODE" "$PROJECTS" "$PROJECT" "$TO" ${DELETES+"${DELETES[@]}"} <<'PYEOF'
import os, re, shutil, sys

try:
    import yaml
except ImportError:
    print("PyYAML is required and was not found (pip install pyyaml)", file=sys.stderr)
    sys.exit(2)

mode, projects_dir, project, to_dir = sys.argv[1:5]
deletes = sys.argv[5:]

INDEX = "MEMORY.md"
WIKI = re.compile(r"\[\[([^\]\n]+)\]\]")
MD_LINK = re.compile(r"\]\(([^)\s]+\.md)\)")


def key(name):
    """Fold case and separators, because a link and its file disagree on both."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def one_line(text):
    return " ".join(str(text).split())


# --- read the store -------------------------------------------------------------
slugs = sorted(d for d in os.listdir(projects_dir)
               if os.path.isdir(os.path.join(projects_dir, d, "memory")))
if project:
    if project not in slugs:
        print(f"NOT FOUND: project {project} has no memory directory under {projects_dir}",
              file=sys.stderr)
        sys.exit(2)
    slugs = [project]
if not slugs:
    print(f"NOT FOUND: no memory directories under {projects_dir}", file=sys.stderr)
    print("The memory store is UNREAD, not empty. Exiting nonzero.", file=sys.stderr)
    sys.exit(2)

entries = {}       # (slug, stem) -> dict
malformed = []
for slug in slugs:
    mem = os.path.join(projects_dir, slug, "memory")
    for fname in sorted(os.listdir(mem)):
        if not fname.endswith(".md") or fname == INDEX:
            continue
        stem = fname[:-3]
        path = os.path.join(mem, fname)
        text = open(path, encoding="utf-8", errors="replace").read()
        name = desc = kind = ""
        parsed = False
        if text.startswith("---"):
            block = text.split("---", 2)[1] if text.count("---") >= 2 else ""
            try:
                front = yaml.safe_load(block)
                if isinstance(front, dict):
                    name = one_line(front.get("name") or "")
                    desc = one_line(front.get("description") or "")
                    kind = one_line(front.get("type") or "")
                    parsed = bool(desc)
            except yaml.YAMLError:
                parsed = False
        if not parsed:
            malformed.append((slug, stem))
        entries[(slug, stem)] = {
            "path": path, "name": name, "desc": desc, "type": kind or "none",
            "bytes": len(text.encode("utf-8")),
            "links": [l.strip() for l in WIKI.findall(text)],
            "parsed": parsed,
        }

by_key = {}
for slug, stem in entries:
    by_key.setdefault((slug, key(stem)), []).append(stem)

resolved = {}      # (slug, stem, target) -> (status, target_stem or None)
indegree = {k: 0 for k in entries}
for (slug, stem), e in entries.items():
    for target in e["links"]:
        if (slug, target) in entries:
            status, hit = "exact", target
        else:
            candidates = by_key.get((slug, key(target)), [])
            status, hit = ("normalized", candidates[0]) if len(candidates) == 1 else ("dangling", None)
        resolved[(slug, stem, target)] = (status, hit)
        if hit:
            indegree[(slug, hit)] += 1

index_links = {}   # slug -> [(lineno, target, exists)]
for slug in slugs:
    path = os.path.join(projects_dir, slug, "memory", INDEX)
    rows = []
    if os.path.isfile(path):
        for i, line in enumerate(open(path, encoding="utf-8", errors="replace"), 1):
            for target in MD_LINK.findall(line):
                rows.append((i, target, os.path.isfile(
                    os.path.join(projects_dir, slug, "memory", target))))
    index_links[slug] = rows

n_exact = sum(1 for s, _ in resolved.values() if s == "exact")
n_norm = sum(1 for s, _ in resolved.values() if s == "normalized")
n_dang = sum(1 for s, _ in resolved.values() if s == "dangling")
n_index = sum(len(rows) for rows in index_links.values())
n_index_dang = sum(1 for rows in index_links.values() for _, _, ok in rows if not ok)

print("katharsis memory-inventory")
print(f"root: {projects_dir}   scope: {project or 'all projects'}")
print()


def totals():
    print()
    print(f"totals projects={len(slugs)} entries={len(entries)} malformed={len(malformed)} "
          f"links={len(resolved)} exact={n_exact} normalized={n_norm} dangling={n_dang} "
          f"index={n_index} index_dangling={n_index_dang}")


if mode == "list":
    for (slug, stem), e in sorted(entries.items()):
        print(f"entry {slug}/{stem} type={e['type']} bytes={e['bytes']} "
              f"out={len(e['links'])} in={indegree[(slug, stem)]} desc={e['desc']}")
    for slug, stem in malformed:
        print(f"malformed {slug}/{stem} (frontmatter states no description this script can read)")
    totals()
    sys.exit(0)

if mode == "links":
    for (slug, stem, target), (status, hit) in sorted(resolved.items()):
        tail = f" resolved={hit}" if hit else ""
        print(f"link {slug}/{stem} -> {target} status={status}{tail}")
    for slug, rows in sorted(index_links.items()):
        for lineno, target, ok in rows:
            if not ok:
                print(f"index {slug}/{INDEX}:{lineno} -> {target} status=dangling")
    totals()
    sys.exit(0)

# --- impact and archive ---------------------------------------------------------
doomed, unresolved = [], []
for name in deletes:
    slug, sep, stem = name.rpartition("/")
    hits = [(s, t) for (s, t) in entries
            if t == stem and (not sep or s == slug)]
    if len(hits) != 1:
        where = ", ".join(f"{s}/{t}" for s, t in sorted(hits)) or "nothing"
        unresolved.append(f"--delete {name} names {len(hits)} entries ({where})")
        continue
    doomed.append(hits[0])
if unresolved:
    for u in unresolved:
        print(f"NOT RESOLVED: {u}", file=sys.stderr)
    print("Name an entry as project/stem when the stem is ambiguous. Nothing was moved.",
          file=sys.stderr)
    sys.exit(2)

doomed = sorted(set(doomed))
breaks = []
for (slug, stem, target), (status, hit) in sorted(resolved.items()):
    if hit and (slug, hit) in doomed and (slug, stem) not in doomed:
        breaks.append((slug, stem, target, hit))

for slug, stem in doomed:
    print(f"delete {slug}/{stem} in={indegree[(slug, stem)]}")
for slug, stem, target, hit in breaks:
    print(f"break {slug}/{stem} -> {target} names {hit}, which this delete removes")

index_hits = []
for slug, stem in doomed:
    for lineno, target, _ in index_links[slug]:
        if target == f"{stem}.md":
            index_hits.append((slug, lineno, target))
for slug, lineno, target in index_hits:
    print(f"index {slug}/{INDEX}:{lineno} names {target}")

print()
print(f"totals deleting={len(doomed)} breaks={len(breaks)} index_lines={len(index_hits)}")

if mode == "impact":
    sys.exit(0)

if breaks:
    print(f"REFUSING: {len(breaks)} link(s) in surviving entries would dangle", file=sys.stderr)
    print("Delete the referring entries too, or edit the links out first. Nothing was moved.",
          file=sys.stderr)
    sys.exit(1)

# Every destination is checked before the first move, so a collision never leaves
# half the entries archived.
planned = []
for slug, stem in doomed:
    dest_dir = os.path.join(to_dir, slug)
    dest = os.path.join(dest_dir, f"{stem}.md")
    if os.path.exists(dest):
        print(f"REFUSING: {dest} already exists", file=sys.stderr)
        print("Pick an empty --to directory. Nothing was moved.", file=sys.stderr)
        sys.exit(1)
    planned.append((slug, stem, dest_dir, dest))

touched = sorted({slug for slug, _ in doomed})
for slug in touched:
    src = os.path.join(projects_dir, slug, "memory", INDEX)
    dest_dir = os.path.join(to_dir, slug)
    os.makedirs(dest_dir, exist_ok=True)
    if os.path.isfile(src):
        shutil.copy2(src, os.path.join(dest_dir, INDEX))
        print(f"saved {os.path.join(dest_dir, INDEX)} (the index as it was)")

for slug, stem, dest_dir, dest in planned:
    os.makedirs(dest_dir, exist_ok=True)
    shutil.move(entries[(slug, stem)]["path"], dest)
    print(f"archived {slug}/{stem} -> {dest}")

for slug in touched:
    src = os.path.join(projects_dir, slug, "memory", INDEX)
    if not os.path.isfile(src):
        continue
    doomed_files = {f"{stem}.md" for s, stem in doomed if s == slug}
    kept, dropped = [], 0
    for line in open(src, encoding="utf-8", errors="replace"):
        if any(t in doomed_files for t in MD_LINK.findall(line)):
            dropped += 1
            continue
        kept.append(line)
    if dropped:
        with open(src, "w", encoding="utf-8") as fh:
            fh.writelines(kept)
        print(f"index {slug}/{INDEX}: removed {dropped} line(s)")

print()
for slug in touched:
    print(f"rollback: cp -a {os.path.join(to_dir, slug)}/. "
          f"{os.path.join(projects_dir, slug, 'memory')}/")
PYEOF
exit $?
