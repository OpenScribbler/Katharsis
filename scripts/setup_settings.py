"""setup_settings.py: the two settings steps of setup.sh, which runs it.

  setup_settings.py permissions <settings.json> <dry 0|1> <entry>...
      Adds each missing entry to permissions.allow. Exits 3, writing nothing,
      when the file or its permissions are not the JSON shape it expects.
  setup_settings.py bare-names <config dir>
      Prints a line for each settings file whose outputStyle is a bare
      Katharsis name or another spelling of one (bare_names, below).

Paths print from ~ when they are under HOME and whole otherwise.
"""

import json
import os
import re
import shutil
import sys

QUALIFIED = ["katharsis:Katharsis", "katharsis:Katharsis coding"]
NAMES = {"katharsis": QUALIFIED[0], "katharsis:katharsis": QUALIFIED[0],
         "katharsis coding": QUALIFIED[1], "katharsis:katharsis coding": QUALIFIED[1]}
# The managed folders, on Linux and on macOS: their settings outrank every
# other file, and their output styles reach every project.
MANAGED_DIRS = ["/etc/claude-code", "/Library/Application Support/ClaudeCode"]


def shown(path):
    home = os.path.expanduser("~")
    if path == home or path.startswith(home + os.sep):
        return "~" + path[len(home):]
    return path


# --- permissions ---------------------------------------------------------

def refuse(what, hand):
    print(f"Permission: {what}, so nothing was written.")
    print(f"  {hand}")
    return 3


def load_allow(path, hand):
    """The settings and their allow list, or an exit code when either is not
    the shape setup can edit."""
    name, add = shown(path), f'Add these entries to its "permissions" > "allow" array by hand: {hand}'
    settings = {}
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                settings = json.load(f)
            if not isinstance(settings, dict):
                raise ValueError("top level is not an object")
        except Exception as e:
            return refuse(f"{name} is not valid JSON ({e})", add)
    perms = settings.setdefault("permissions", {})
    if not isinstance(perms, dict):
        return refuse(f'"permissions" in {name} is not an object', add)
    allow = perms.setdefault("allow", [])
    if not isinstance(allow, list):
        return refuse(f'"permissions.allow" in {name} is not an array', f"Add these entries to it by hand: {hand}")
    return settings, allow


def write_settings(path, settings):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".katharsis-tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2, ensure_ascii=False)
        f.write("\n")
    if os.path.exists(path):
        shutil.copymode(path, tmp)
    os.replace(tmp, path)


def permissions(path, dry, entries):
    name = shown(path)
    loaded = load_allow(path, ", ".join(f'"{e}"' for e in entries))
    if isinstance(loaded, int):
        return loaded
    settings, allow = loaded
    missing = [e for e in entries if e not in allow]
    for e in entries:
        if e not in missing:
            print(f"Permission: {e} is already in {name}.")
    if not missing:
        return 0
    allow.extend(missing)
    if dry:
        change = json.dumps({"permissions": {"allow": missing}}, indent=2)
        print(f"Permission: would add this to {name} (dry run, nothing written):")
        print("\n".join("  " + line for line in change.splitlines()))
        return 0
    write_settings(path, settings)
    for e in missing:
        print(f"Permission: added {e} to permissions.allow in {name}.")
    return 0


# --- bare names ----------------------------------------------------------
#
# Claude Code loads a plugin's style only under its exact qualified name, and
# any other value loads a style only from an output style file of the user's
# own by exactly that name. Setup looks for one where Claude Code's loader
# does, as the hooks do (hooks/style.ts): the user's output-styles folder,
# each .claude/output-styles from the working directory up to the git root,
# or up to HOME outside a repo, a worktree's main repository, and the managed
# folder, subfolders and linked folders included, .md files only. A file's
# style name is the frontmatter name, without quotes or a trailing # comment,
# else the file name. A user or managed settings file is answered only by the
# user's or the managed folder, which reach every project; a project file by
# any of them. The user, project, local, and managed settings files rise in
# precedence, managed-settings.json before the managed-settings.d files in
# name order, a path that resolves to a file already read (setup run from
# $HOME) counts once, and only a string outputStyle counts. A name in the file
# that wins applies here. One a later file overrides with another value still
# applies where that file does not reach: the user file in every other
# project, a project file for anyone without this local file. /config writes
# the local file, so it cannot override a managed value.

def style_name(path):
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except (OSError, UnicodeDecodeError):
        return None
    front = re.match(r"---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)", text)
    m = re.search(r"^name:[ \t]*(.*)$", front.group(1), re.M) if front else None
    value = m.group(1).strip() if m else ""
    q = re.match(r"""(["'])(.*?)\1""", value)
    value = q.group(2) if q else re.sub(r"\s+#.*$", "", value).strip()
    return value or os.path.basename(path)[:-3]


def own(dirs):
    """Each style name under the folders, with the first file that has it."""
    found, seen = {}, set()
    for top in dirs:
        for root, subdirs, files in os.walk(top, followlinks=True):
            real = os.path.realpath(root)
            if real in seen:
                subdirs[:] = []
                continue
            seen.add(real)
            for n in sorted(f for f in files if f.endswith(".md")):
                name = style_name(os.path.join(root, n))
                if name is not None:
                    found.setdefault(name, os.path.join(root, n))
    return found


def main_repo(root):
    """A worktree's main repository, from the gitdir line of the .git file at
    its root, which git writes relative to that root for --relative-paths."""
    try:
        with open(os.path.join(root, ".git"), encoding="utf-8") as f:
            gitdir = f.read().strip().removeprefix("gitdir:").strip()
    except OSError:
        return None
    m = re.match(r"(.*)/\.git/worktrees/[^/]+/?$", gitdir)
    return os.path.normpath(os.path.join(root, m.group(1))) if m else None


def project_dirs():
    home = os.path.expanduser("~")
    dirs, d = [], os.path.abspath(".")
    while True:
        if d == home:  # HOME's .claude is the user's, never a project's (hooks/style.ts)
            return dirs
        dirs.append(os.path.join(d, ".claude", "output-styles"))
        git = os.path.join(d, ".git")
        if os.path.isfile(git):
            repo = main_repo(d)
            if repo:
                dirs.append(os.path.join(repo, ".claude", "output-styles"))
            return dirs
        if os.path.isdir(git) or os.path.dirname(d) == d:
            return dirs
        d = os.path.dirname(d)


def managed_files():
    """Each managed settings file, lowest precedence first."""
    files = []
    for d in MANAGED_DIRS:
        drop = os.path.join(d, "managed-settings.d")
        names = sorted(n for n in os.listdir(drop) if n.endswith(".json") and not n.startswith(".")) if os.path.isdir(drop) else []
        files += [os.path.join(d, "managed-settings.json")] + [os.path.join(drop, n) for n in names]
    return files


def styles_set(user, managed):
    """(path, outputStyle) for each settings file with a string one, lowest
    precedence first."""
    found, seen = [], set()
    for path in [user, ".claude/settings.json", ".claude/settings.local.json"] + managed:
        real = os.path.realpath(path)
        if real in seen:
            continue
        seen.add(real)
        try:
            with open(path, encoding="utf-8") as f:
                settings = json.load(f)
        except (OSError, ValueError):
            continue
        style = settings.get("outputStyle") if isinstance(settings, dict) else None
        if isinstance(style, str):
            found.append((path, style))
    return found


def override(found, i, managed):
    """The sentence naming the later file that overrides found[i] here, or ''."""
    last, winner = found[-1]
    if i == len(found) - 1 or winner == found[i][1]:
        return ""
    if last in managed:
        return f' {shown(last)}, a managed settings file, overrides it with "{winner}" on this machine.'
    return f' {shown(last)} overrides it here with "{winner}".'


def fix(found, i, target, managed):
    """Where to set the qualified name. /config writes the local file, so it
    fixes the value only when no managed file sets one."""
    path = found[i][0]
    if path in managed:
        return f" Ask whoever manages {shown(path)} to set it to {target}: /config cannot override it."
    if i == len(found) - 1:
        return f" Set it to {target} there, or pick {target} in /config."
    return f" Set it to {target} there."


def unloaded_line(found, i, target, managed, everywhere):
    path, style = found[i]
    line = f'Output style: {shown(path)} sets outputStyle to "{style}", which loads no Katharsis style: no output style file of your own is named "{style}".'
    ov = override(found, i, managed)
    if ov and found[-1][0] not in managed:
        where = "in every project without an override" if everywhere else "for anyone using this project without that file"
        ov = ov[:-1] + f", but it still applies {where}."
    return line + ov + fix(found, i, target, managed)


def loaded_line(head, mine, ov):
    """The line for a name your own style file answers: leave it, and, when a
    later file overrides it, where it still loads."""
    leave = " Leave it as it is: it loads that file wherever the later file does not reach." if ov else " Leave it as it is."
    return f"{head}, which loads your own output style {shown(mine)}.{ov}{leave}"


def bare_line(ctx, i, target):
    """The report for one settings file whose outputStyle spells a Katharsis
    name. ctx holds the settings files found, the user and managed files, and
    the own style names that reach every project and the ones that reach this
    one."""
    found, managed, styles = ctx["found"], ctx["managed"], ctx["styles"]
    path, style = found[i]
    everywhere = path == ctx["user"] or path in managed
    head = f'Output style: {shown(path)} sets outputStyle to "{style}"'
    ov = override(found, i, managed)
    mine = styles["everywhere" if everywhere else "here"].get(style)
    if mine:
        return loaded_line(head, mine, ov)
    local = styles["here"].get(style)
    if everywhere and local:
        return f"{head}, which loads your own output style {shown(local)} in this project only, and no Katharsis style in a project without one.{ov}" + (fix(found, i, target, managed) if path in managed else f" Set it to {target} there.")
    return unloaded_line(found, i, target, managed, everywhere)


def bare_names(config):
    user = os.path.join(config, "settings.json")
    shared = [os.path.join(config, "output-styles")] + [os.path.join(d, ".claude", "output-styles") for d in MANAGED_DIRS]
    managed = managed_files()
    found = styles_set(user, managed)
    styles = {"everywhere": own(shared), "here": own(shared + project_dirs())}
    ctx = {"found": found, "user": user, "managed": managed, "styles": styles}
    for i, (_, style) in enumerate(found):
        target = NAMES.get(style.strip().lower())
        if target is not None and style not in QUALIFIED:
            print(bare_line(ctx, i, target))
    return 0


def main(argv):
    if argv[:1] == ["permissions"]:
        return permissions(argv[1], argv[2] == "1", argv[3:])
    if argv[:1] == ["bare-names"]:
        return bare_names(argv[1])
    print("usage: setup_settings.py permissions <settings> <dry> <entry>... | bare-names <config>", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
