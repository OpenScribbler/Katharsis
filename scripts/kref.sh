#!/usr/bin/env bash
# kref.sh: reads back the coded items ledger-stop.sh recorded. A grep and a
# sort over ledger/<project-slug>/*.jsonl, not a lookup service: no index, no
# state, and no failure mode worse than an empty result.
#
# Usage:
#   kref.sh                 this session's items, grouped by code, titles only
#   kref.sh F               every F item this session defined, else every one on record
#   kref.sh F3              one item
#   kref.sh --full [query]  titles with their summaries
#   kref.sh --html [query]  render the same result to an HTML page and open it
#   kref.sh --chrono [query] one flat list in the order the items were written
#   kref.sh --next          one line: the next free number per code prefix in this chain
#
# A handoff chain is one numbering space. ledger/chains/<sessionId> holds the
# parent session's ID, and a session's scope is itself plus every ancestor, so
# F14 resolves wherever in the chain it was written and the counters never
# reset across a handoff. Nothing here writes that file: it is the hook point
# for a handoff tool, which writes the parent's ID there when it opens the
# child session.
#
# Built for bash mode: `! kref F3` in the Claude Code prompt runs in the
# shell and prints in well under a second, with no model turn between the
# question and the answer. bin/kref, bin/kref-m, and bin/kref-h wrap it.
#
# The ledger lives in the data directory, ~/.claude/katharsis-data;
# KATHARSIS_DATA overrides it for tests.
#
# Scope is the session first, the whole ledger second. A bare call reads this
# session's records wherever they landed: rows written before the hook keyed the
# project on the transcript's directory (F25) sit under whichever cwd the Stop
# saw, so one session can span two of them. A query that this session does not answer
# widens to every project rather than returning nothing, since the codes the
# user asks about by name are usually the ones that have left context.
#
# One line per (session, code): a code redefined later in the same session
# supersedes the earlier record, across files as well as within one, so a
# session that moved directories does not show D1 twice.
#
# Rows group under their section (Findings, Decisions, ...) with stock codes
# ahead of bespoke ones. A result spanning more than one session groups by
# session, oldest first and numbered, with the current session marked and any
# session outside this chain marked too: `##` per session with a legend in the
# terminal, a <details> per session in HTML with the current one open. The HTML
# also carries a second tab, one flat list in the order the items were written,
# which --chrono prints in the terminal.

set -u
command -v python3 >/dev/null 2>&1 || { echo "kref: python3 not found" >&2; exit 1; }

MODE=md; FULL=0; CHRONO=0; QUERY=""
for a in "$@"; do
  case "$a" in
    --html|-h) MODE=html ;;
    --md|-m) MODE=md ;;
    --full|-f) FULL=1 ;;
    --chrono|-c) CHRONO=1 ;;
    --next|-n) MODE=next ;;
    -*) echo "kref: unknown flag $a" >&2; exit 1 ;;
    *) QUERY="$a" ;;
  esac
done

DATA="${KATHARSIS_DATA:-$HOME/.claude/katharsis-data}"
OUTDIR="$DATA/kref-out"

python3 - "$DATA/ledger" "${CLAUDE_CODE_SESSION_ID-}" "$QUERY" "$MODE" "$FULL" "$OUTDIR" "$CHRONO" <<'PYEOF'
import glob, html, json, os, re, sys

root, session, query, mode, full, outdir, chrono = sys.argv[1:8]
session, query, full, chrono = session.strip(), query.strip(), full == "1", chrono == "1"

m = re.fullmatch(r"([A-Za-z][A-Za-z-]{0,3})(\d*)", query) if query else None
if query and not m:
    print(f"kref: {query} is not a code or a code prefix")
    sys.exit(1)

everything = sorted(glob.glob(os.path.join(root, "*", "*.jsonl")))
if not everything:
    if mode != "next":
        print("kref: the ledger is empty")
    sys.exit(0)


def chain(sid):
    ids = []
    while sid and sid not in ids and len(ids) < 20:
        ids.append(sid)
        try:
            sid = open(os.path.join(root, "chains", sid), encoding="utf-8").read().strip()
        except OSError:
            break
    return ids


ids = chain(session)
mine = sorted(f for sid in ids for f in glob.glob(os.path.join(root, "*", f"{sid}.jsonl")))

SECTION = {"F": "Findings", "D": "Decisions", "A": "Assumptions", "R": "Risks", "C": "Caveats",
           "AT": "Actions Taken", "V": "Verified", "NA": "Next Actions", "B": "Blocked",
           "MV": "Your Move", "W": "Waiting", "X": "Excluded", "S": "State", "T-O": "Trade-offs",
           "E": "Errata", "Q": "Questions"}
ORDER = ["F", "D", "A", "R", "C", "AT", "V", "NA", "B", "MV", "W", "X", "S", "T-O", "E", "Q"]


def read(files, one_space=False):
    latest = {}
    for path in files:
        for line in open(path, encoding="utf-8", errors="replace"):
            try:
                r = json.loads(line)
            except Exception:
                continue
            if m and r.get("prefix", "").upper() != m.group(1).upper():
                continue
            if m and m.group(2) and str(r.get("n")) != m.group(2):
                continue
            key = ("chain" if one_space else r.get("session_id"), str(r.get("code")).upper())
            old = latest.get(key)
            # the later definition wins; equal stamps fall to file order
            if old is None or str(r.get("ts", "")) >= str(old.get("ts", "")):
                latest[key] = r
    return list(latest.values())


rows = read(mine, one_space=True)
scope = "this session"

if mode == "next":
    nxt = {}
    for r in rows:
        nxt[r.get("prefix")] = max(nxt.get(r.get("prefix"), 0), int(r.get("n") or 0))
    if nxt:
        order = ORDER
        keys = [k for k in order if k in nxt] + sorted(k for k in nxt if k not in order)
        print("Katharsis codes continue, never restart. Next free: "
              + "  ".join(f"{k}{nxt[k] + 1}" for k in keys))
    sys.exit(0)
if not rows and (query or not mine):  # widen rather than return nothing
    rows = read(everything)
    scope = "the ledger"

if not rows:
    print(f"kref: nothing matches {query or 'this session'} in {scope}")
    sys.exit(0)

rows.sort(key=lambda r: (not r.get("known"), r.get("prefix", ""), r.get("n", 0),
                         str(r.get("ts", ""))))
# A chain query with rows from 2 or more sessions groups the same way a
# widened one does, with this chain's sessions first and open. The current
# session is marked as such and its ancestors as part of the chain.
multi_session = len({r.get("session_id") for r in rows}) > 1
multi_project = multi_session and len({r.get("project") for r in rows}) > 1


def section_of(r):
    p = str(r.get("prefix", "")).upper()
    return SECTION.get(p) or (r.get("section") or "").strip() or "Other codes"


def grouped(items):
    out = []
    for r in items:
        sec = section_of(r)
        if not out or out[-1][0] != sec:
            out.append((sec, []))
        out[-1][1].append(r)
    return out


# A widened result spanning sessions groups by session, this chain first, then
# the others newest first. Inside a session the rows group by section as usual.
def short(proj):
    proj = re.sub(r"^home-[a-z0-9]+-", "", str(proj or ""))
    return proj if len(proj) <= 44 else "…" + proj[-43:]


def mark(sid):
    return " (current)" if sid == session else "" if sid in ids else " (outside this chain)"


def label(sid, items):
    proj = short(next((r.get("project") for r in items if r.get("project")), ""))
    day = min(str(r.get("ts", ""))[:10] for r in items)
    n = len(items)
    return f"{seq.get(sid, 0)}  {str(sid)[:8]}{mark(sid)}  {day}  {n} item{'s' if n != 1 else ''}  stop dir {proj}"


def when(r):
    return str(r.get("ts", ""))[5:16].replace("T", " ")


sessions = []
seq = {}
if multi_session:
    by = {}
    for r in rows:
        by.setdefault(r.get("session_id"), []).append(r)
    order = sorted(by, key=lambda sid: min(str(r.get("ts", "")) for r in by[sid]))
    sessions = [(sid, by[sid]) for sid in order]
    seq = {sid: i + 1 for i, sid in enumerate(order)}

if mode == "md":
    def print_sections(items, level):
        first = True
        for name, secs in grouped(items):
            if not first:
                print()
            first = False
            print(f"{'#' * level} {name}")
            for r in secs:
                line = f"{r.get('code')}  {r.get('title')}"
                if full and r.get("summary"):
                    line += f" - {r.get('summary')}"
                    print()  # summaries wrap, so a blank line separates the items
                print(line)
    if chrono:
        for r in sorted(rows, key=lambda r: str(r.get("ts", ""))):
            tag = f"  [{seq[r.get('session_id')]}]" if seq else ""
            line = f"{when(r)}  {r.get('code')}{tag}  {r.get('title')}"
            if full and r.get("summary"):
                line += f" - {r.get('summary')}"
                print()
            print(line)
        sys.exit(0)
    if sessions:
        print("Sessions, oldest first (stop dir is where the Stop hook ran when the row was written):")
        for sid, items in sessions:
            print("  " + label(sid, items))
        for sid, items in sessions:
            print()
            print(f"## {label(sid, items)}")
            print_sections(items, 3)
    else:
        print_sections(rows, 2)
    sys.exit(0)

# --- html ---
title = f"kref: {query}" if query else "kref: this session"
if scope == "the ledger":
    title += " (whole ledger)"
parts = [f"""<!doctype html><meta charset="utf-8"><title>{html.escape(title)}</title>
<style>
:root{{color-scheme:light dark;--fg:#1c1c1c;--muted:#6b6b6b;--rule:#ddd;--bg:#fbfbf9;--code:#eef1f5}}
@media(prefers-color-scheme:dark){{:root{{--fg:#e8e8e8;--muted:#9a9a9a;--rule:#333;--bg:#161616;--code:#24282e}}}}
body{{margin:0 auto;max-width:60rem;padding:2rem 1.5rem;font:15px/1.5 system-ui,sans-serif;color:var(--fg);background:var(--bg)}}
h1{{font-size:1.25rem;margin:0 0 1.5rem}}
h2{{font-size:1rem;margin:2rem 0 .5rem;border-bottom:1px solid var(--rule);padding-bottom:.25rem}}
h3{{font-size:.95rem;margin:1.25rem 0 .35rem;color:var(--muted)}}
details{{margin:1rem 0;border:1px solid var(--rule);border-radius:6px;padding:.25rem 1rem}}
.tabs{{display:flex;gap:.25rem;border-bottom:1px solid var(--rule);margin-bottom:1rem}}
.tabs label{{padding:.4rem .9rem;cursor:pointer;border:1px solid transparent;border-bottom:0;border-radius:6px 6px 0 0;color:var(--muted)}}
input.tab{{display:none}} .pane{{display:none}}
#t-session:checked~.tabs label[for=t-session],#t-chrono:checked~.tabs label[for=t-chrono]{{color:var(--fg);border-color:var(--rule);background:var(--bg);margin-bottom:-1px;font-weight:600}}
#t-session:checked~#p-session,#t-chrono:checked~#p-chrono{{display:block}}
.legend{{color:var(--muted);margin:0 0 1rem}} .legend li{{margin:.15rem 0}}
.filters{{display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;margin:0 0 .75rem;color:var(--muted)}}
.filters select,.filters input{{font:inherit;color:var(--fg);background:var(--code);border:1px solid var(--rule);border-radius:4px;padding:.2rem .4rem}}
.filters .count{{margin-left:auto}}
th{{text-align:left;padding:.35rem .5rem;border-bottom:2px solid var(--rule);color:var(--muted);font-weight:600;cursor:pointer;user-select:none;white-space:nowrap}}
th.on::after{{content:" ▲"}} th.on.desc::after{{content:" ▼"}}
tr[hidden]{{display:none}}
td.when{{white-space:nowrap;color:var(--muted);font-family:ui-monospace,monospace;width:6.5rem}}
td.sess{{white-space:nowrap;color:var(--muted);font-family:ui-monospace,monospace;width:8rem}}
summary{{cursor:pointer;font-weight:600;padding:.5rem 0}} summary .meta{{color:var(--muted);font-weight:400;margin-left:.75rem}}
table{{border-collapse:collapse;width:100%}}
td{{vertical-align:top;padding:.35rem .5rem;border-bottom:1px solid var(--rule)}}
td.code{{white-space:nowrap;font-family:ui-monospace,monospace;font-weight:600;width:4rem}}
.title{{font-weight:600}} .summary{{color:var(--muted);margin-top:.15rem}}
code{{background:var(--code);padding:0 .25em;border-radius:3px;font-size:.9em}}
</style>
<h1>{html.escape(title)}</h1>"""]


def inline(s):
    s = html.escape(s or "")
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)


def html_sections(items, tag):
    for name, secs in grouped(items):
        parts.append(f"<{tag}>{html.escape(name)}</{tag}><table>")
        for r in secs:
            summary = f'<div class="summary">{inline(r.get("summary"))}</div>' if r.get("summary") else ""
            parts.append(f'<tr><td class="code">{html.escape(str(r.get("code")))}</td>'
                         f'<td><div class="title">{inline(r.get("title"))}</div>{summary}</td></tr>')
        parts.append("</table>")


if sessions:
    parts.append('<input class="tab" type="radio" name="view" id="t-chrono" checked>'
                 '<input class="tab" type="radio" name="view" id="t-session">'
                 '<div class="tabs"><label for="t-chrono">Chronological</label><label for="t-session">By session</label></div>')
    chron = sorted(rows, key=lambda r: str(r.get("ts", "")))
    prefixes = [k for k in ORDER if any(str(r.get("prefix", "")).upper() == k for r in rows)]
    prefixes += sorted({str(r.get("prefix", "")).upper() for r in rows} - set(ORDER))
    days = sorted({str(r.get("ts", ""))[:10] for r in rows})
    opts = lambda vals, fmt=lambda v: v: "".join(f'<option value="{html.escape(str(v))}">{html.escape(fmt(v))}</option>' for v in vals)
    parts.append('<div class="pane" id="p-chrono"><div class="filters">'
                 f'<label>Code <select id="f-code"><option value="">all</option>{opts(prefixes, lambda k: f"{k} · {SECTION.get(k, k)}")}</select></label>'
                 f'<label>Date <select id="f-day"><option value="">all</option>{opts(days)}</select></label>'
                 f'<label>Session <select id="f-sess"><option value="">all</option>{opts([sid for sid, _ in sessions], lambda sid: f"{seq[sid]} · {str(sid)[:8]}{mark(sid)}")}</select></label>'
                 '<label>Text <input id="f-text" type="search" placeholder="title or summary"></label>'
                 '<span class="count" id="f-count"></span></div>'
                 '<table id="chron"><thead><tr><th data-k="ts" class="on">When</th><th data-k="code">Code</th><th data-k="sess">Session</th><th data-k="title">Item</th></tr></thead><tbody>')
    for r in chron:
        summary = f'<div class="summary">{inline(r.get("summary"))}</div>' if r.get("summary") else ""
        sid = r.get("session_id")
        parts.append(f'<tr data-ts="{html.escape(str(r.get("ts", "")))}" data-prefix="{html.escape(str(r.get("prefix", "")).upper())}" '
                     f'data-n="{int(r.get("n") or 0)}" data-day="{html.escape(str(r.get("ts", ""))[:10])}" data-sess="{html.escape(str(sid))}" data-seq="{seq[sid]}">'
                     f'<td class="when">{html.escape(when(r))}</td><td class="code">{html.escape(str(r.get("code")))}</td>'
                     f'<td class="sess">{seq[sid]} · {html.escape(str(sid)[:8])}</td>'
                     f'<td><div class="title">{inline(r.get("title"))}</div>{summary}</td></tr>')
    parts.append("</tbody></table></div>")
    parts.append('<div class="pane" id="p-session"><ul class="legend">')
    for sid, items in sessions:
        parts.append(f"<li>{html.escape(label(sid, items))}</li>")
    parts.append("</ul>")
    for sid, items in sessions:
        proj = short(next((r.get("project") for r in items if r.get("project")), ""))
        day = min(str(r.get("ts", ""))[:10] for r in items)
        n = len(items)
        parts.append(f'<details{" open" if sid == session else ""}><summary>{seq[sid]} · {html.escape(str(sid)[:8] + mark(sid))}'
                     f'<span class="meta">{html.escape(day)} · {n} item{"s" if n != 1 else ""} · stop dir {html.escape(proj)}</span></summary>')
        html_sections(items, "h3")
        parts.append("</details>")
    parts.append("</div>")
    parts.append('''<script>
(function(){
  var tb=document.querySelector('#chron tbody'),rows=[].slice.call(tb.rows),count=document.getElementById('f-count');
  var f={code:document.getElementById('f-code'),day:document.getElementById('f-day'),sess:document.getElementById('f-sess'),text:document.getElementById('f-text')};
  var key='ts',desc=false;
  function apply(){
    var q=f.text.value.trim().toLowerCase(),n=0;
    rows.forEach(function(r){
      var ok=(!f.code.value||r.dataset.prefix===f.code.value)&&(!f.day.value||r.dataset.day===f.day.value)
        &&(!f.sess.value||r.dataset.sess===f.sess.value)&&(!q||r.cells[3].textContent.toLowerCase().indexOf(q)>=0);
      r.hidden=!ok; if(ok)n++;
    });
    count.textContent=n+' of '+rows.length+' items';
  }
  function val(r){
    if(key==='ts')return r.dataset.ts;
    if(key==='code')return [r.dataset.prefix,('00000'+r.dataset.n).slice(-5)].join(' ');
    if(key==='sess')return [('000'+r.dataset.seq).slice(-3),r.dataset.ts].join(' ');
    return r.cells[3].textContent.toLowerCase();
  }
  function sort(){
    rows.sort(function(a,b){var x=val(a),y=val(b);return (x<y?-1:x>y?1:0)*(desc?-1:1);});
    rows.forEach(function(r){tb.appendChild(r);});
    [].forEach.call(document.querySelectorAll('#chron th'),function(h){h.className=h.dataset.k===key?('on'+(desc?' desc':'')):'';});
  }
  [].forEach.call(document.querySelectorAll('#chron th'),function(h){h.addEventListener('click',function(){
    if(key===h.dataset.k)desc=!desc;else{key=h.dataset.k;desc=false;} sort();});});
  Object.keys(f).forEach(function(k){f[k].addEventListener('input',apply);f[k].addEventListener('change',apply);});
  apply();
})();
</script>''')
else:
    html_sections(rows, "h2")

os.makedirs(outdir, exist_ok=True)
name = re.sub(r"[^A-Za-z0-9]+", "-", f"{session[:8] or 'all'}-{query or 'session'}").strip("-")
out = os.path.join(outdir, f"{name}.html")
open(out, "w", encoding="utf-8").write("\n".join(parts))
print(out)
PYEOF
RC=$?
[ "$MODE" = html ] && [ "$RC" -eq 0 ] && [ -z "${KREF_NO_OPEN-}" ] && {
  OUT="$(ls -t "$OUTDIR"/*.html 2>/dev/null | head -1)"
  if [ -n "$OUT" ]; then
    if command -v wslview >/dev/null 2>&1; then wslview "$OUT" >/dev/null 2>&1 &
    elif command -v explorer.exe >/dev/null 2>&1 && command -v wslpath >/dev/null 2>&1; then
      explorer.exe "$(wslpath -w "$OUT")" >/dev/null 2>&1 &
    elif [ "$(uname -s)" = Darwin ] && command -v open >/dev/null 2>&1; then open "$OUT" >/dev/null 2>&1 &
    elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$OUT" >/dev/null 2>&1 &
    fi
  fi
}
exit "$RC"
