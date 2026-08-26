#!/usr/bin/env bash
# setup-rules.sh: the deterministic engine behind the katharsis-setup skill.
# Discovery and questions stay in the skill; this script only checks the
# placeholder contract and applies substitutions.
#
# Modes:
#   check   Verify rules/*.md against rules/placeholders.yaml: zero undeclared
#           placeholders, zero unused declarations, no file-location mismatches.
#   apply   Copy every rules/*.md to --dest with each {{NAME}} substituted,
#           verify no '{{' survives, and optionally append the loader import
#           line to a memory file, once, idempotently.
#
# Values come from --set NAME=VALUE. A required placeholder with no value and
# no default is a loud error, and a NAME the contract does not declare is too.
#
# Usage:
#   setup-rules.sh check [--rules DIR] [--contract FILE]
#   setup-rules.sh apply --dest DIR [--set NAME=VALUE]... [--import-into FILE]
#                        [--rules DIR] [--contract FILE]

set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
RULES="$HERE/../rules"
CONTRACT=""
DEST=""
IMPORT_INTO=""
SETS=()

MODE="${1:-}"
case "$MODE" in
  check|apply) shift ;;
  *) echo "usage: setup-rules.sh check|apply [options]" >&2; exit 2 ;;
esac

while [ $# -gt 0 ]; do
  case "$1" in
    --rules)       [ $# -ge 2 ] || { echo "--rules requires a value" >&2; exit 2; }; RULES="$2"; shift 2 ;;
    --contract)    [ $# -ge 2 ] || { echo "--contract requires a value" >&2; exit 2; }; CONTRACT="$2"; shift 2 ;;
    --dest)        [ $# -ge 2 ] || { echo "--dest requires a value" >&2; exit 2; }; DEST="$2"; shift 2 ;;
    --import-into) [ $# -ge 2 ] || { echo "--import-into requires a value" >&2; exit 2; }; IMPORT_INTO="$2"; shift 2 ;;
    --set)         [ $# -ge 2 ] || { echo "--set requires NAME=VALUE" >&2; exit 2; }; SETS+=("$2"); shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -n "$CONTRACT" ] || CONTRACT="$RULES/placeholders.yaml"
[ -d "$RULES" ] || { echo "NOT FOUND: rules directory $RULES" >&2; exit 2; }
[ -f "$CONTRACT" ] || { echo "NOT FOUND: contract $CONTRACT" >&2; exit 2; }
if [ "$MODE" = "apply" ] && [ -z "$DEST" ]; then
  echo "apply requires --dest" >&2; exit 2
fi
command -v python3 >/dev/null 2>&1 || { echo "python3 is required and was not found" >&2; exit 2; }

python3 - "$MODE" "$RULES" "$CONTRACT" "$DEST" "$IMPORT_INTO" ${SETS+"${SETS[@]}"} <<'PYEOF'
import os, re, sys

try:
    import yaml
except ImportError:
    print("PyYAML is required and was not found (pip install pyyaml)", file=sys.stderr)
    sys.exit(2)

mode, rules_dir, contract_path, dest, import_into = sys.argv[1:6]
set_args = sys.argv[6:]

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

missing = []
for name, p in declared.items():
    if name not in values and p.get("default") is not None:
        values[name] = p["default"]
    if p.get("required"):
        if not values.get(name, "").strip():
            missing.append(name)
    else:
        values.setdefault(name, "")
if missing:
    for name in sorted(missing):
        print(f"missing required placeholder: {name} ({declared[name]['asks']})", file=sys.stderr)
    sys.exit(2)

# Validate the import target before writing anything, so a typo in the memory
# file path never leaves a partially applied install behind.
if import_into and not os.path.isfile(import_into):
    print(f"NOT FOUND: memory file {import_into}", file=sys.stderr)
    sys.exit(2)

os.makedirs(dest, exist_ok=True)
leftovers = []
for f in md_files:
    out = PLACEHOLDER.sub(lambda m: values.get(m.group(1), m.group(0)), texts[f])
    path = os.path.join(dest, f)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(out)
    for i, line in enumerate(out.splitlines(), 1):
        if "{{" in line:
            leftovers.append(f"{path}:{i}: {line.strip()}")
if leftovers:
    for l in leftovers:
        print(f"UNSUBSTITUTED: {l}", file=sys.stderr)
    print("substitution left placeholders behind; the install is incomplete", file=sys.stderr)
    sys.exit(2)

written = ", ".join(md_files)
print(f"wrote {len(md_files)} files to {dest}: {written}")

if import_into:
    home = os.path.expanduser("~")
    shown = os.path.abspath(dest)
    if shown == home or shown.startswith(home + os.sep):
        shown = "~" + shown[len(home):]
    line = f"@{shown}/loader.md"
    content = open(import_into, encoding="utf-8").read()
    if line in content.splitlines():
        print(f"import line already present in {import_into}: {line}")
    else:
        with open(import_into, "a", encoding="utf-8") as fh:
            if content and not content.endswith("\n"):
                fh.write("\n")
            fh.write(line + "\n")
        print(f"appended to {import_into}: {line}")
PYEOF
exit $?
