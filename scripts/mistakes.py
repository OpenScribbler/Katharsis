#!/usr/bin/env python3
"""mistakes.py: checks a finished reply against what the session's tools showed.

    mistakes.sh                       Stop hook: reads the hook payload on stdin
    mistakes.sh --replay <transcript> runs every Stop of a finished transcript
                                      and prints the records on stdout

A model owns few of its own mistakes unprompted, and most of the ones that
matter are claims a tool result in the same session contradicts. So the
plugin, not the model, says so. Each check is deterministic:

  tests-claim / ci-claim  the reply, or a ticked checklist line in a PR body
                          or commit, says tests, a build, plugin validation, a
                          linter, or CI pass, and the latest run of that check
                          failed, ran before a later edit, or never ran.
  verify-claim            the reply says the change was verified, and nothing
                          after the turn's last edit ran successfully.
  count                   the reply's headline count is the output of a count
                          that skips files (grep -I, rg without -uu) or counts
                          lines instead of matches, and no exact count in the
                          same command or turn printed the same number. Live
                          only: a grep -r or rg count of one word under a
                          folder is recounted over every file, and a notice
                          names the skipped files that hold the difference.
  clobber                 PreToolUse and PostToolUse on Bash: a command that
                          replaces a file no earlier call named (`>`, `tee`,
                          `cp`, `mv`, `dd of=`) is compared line by line with the
                          file's content before it ran. When lines are gone, the
                          earlier copy goes under clobbered/ (0600 in 0700
                          folders), and the user and the model each get one
                          line with the restore command.
                          A transcript does not hold file content, so the replay
                          has no clobber check.

A record goes to detections/<session>.jsonl and the user sees one
systemMessage line per record. A wrong claim never holds the reply, because
the fix would contradict a line already on screen. A clobber the reply does
not mention holds once for one appended line. Every path the script cannot
help on exits 0 and prints nothing.
"""
import datetime
import json
import os
import re
import shlex
import stat
import sys
import tempfile

V = '0.1'
DATA = os.environ.get('KATHARSIS_DATA') or os.path.join(os.path.expanduser('~'), '.claude', 'katharsis-data')

# ------------------------------------------------------------------ transcript

UNTYPED = ('<command-name>', '<command-message>', '<local-command', '<task-notification>', '<bash-input>',
           '<bash-stdout>', 'Caveat: The messages below', '[Request interrupted',
           'This session is being continued from a previous conversation', 'Stop hook feedback')


def content_text(c):
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return '\n'.join(b.get('text', '') for b in c if isinstance(b, dict) and b.get('type') == 'text')
    return ''


def events_of(lines):
    """Ordered events of the main thread: user (typed or not), text, call, result."""
    ev = []
    for raw in lines:
        try:
            d = json.loads(raw)
        except ValueError:
            continue
        if not isinstance(d, dict) or d.get('isSidechain') or d.get('type') not in ('user', 'assistant'):
            continue
        c = (d.get('message') or {}).get('content')
        cwd = d.get('cwd') or ''
        ts = d.get('timestamp') or ''
        if d['type'] == 'user':
            blocks = c if isinstance(c, list) else [{'type': 'text', 'text': c or ''}]
            results = [b for b in blocks if isinstance(b, dict) and b.get('type') == 'tool_result']
            for b in results:
                ev.append({'t': 'result', 'id': b.get('tool_use_id'), 'text': content_text(b.get('content')),
                           'err': bool(b.get('is_error')), 'ts': ts})
            if not results:
                text = content_text(c)
                typed = not d.get('isMeta') and not d.get('isCompactSummary') and bool(text.strip()) and \
                    not any(text.lstrip().startswith(m) or m in text[:200] for m in UNTYPED)
                ev.append({'t': 'user', 'text': text, 'typed': typed, 'ts': ts})
            continue
        for b in c if isinstance(c, list) else []:
            if not isinstance(b, dict):
                continue
            if b.get('type') == 'text' and b.get('text', '').strip():
                ev.append({'t': 'text', 'text': b['text'], 'ts': ts})
            elif b.get('type') == 'tool_use':
                ev.append({'t': 'call', 'id': b.get('id'), 'name': b.get('name', ''), 'input': b.get('input') or {},
                           'cwd': cwd, 'ts': ts})
    results = {e['id']: e for e in ev if e['t'] == 'result'}
    for e in ev:
        if e['t'] == 'call':
            e['res'] = results.get(e['id'])
    return ev


# --------------------------------------------------------------------- helpers

def clip(s, n=300):
    s = re.sub(r'\s+', ' ', s or '').strip()
    return s if len(s) <= n else s[:n - 1] + '…'


def cmd_of(call):
    return call['input'].get('command', '') if call['name'] == 'Bash' else ''


HEREDOC = re.compile(r'<<-?\s*[\'"]?(\w+)[\'"]?[^\n]*\n.*?(\n\1[ \t]*(?=\n|$)|$)', re.S)


def shell_of(call):
    """The Bash command with heredoc bodies cut and `>` or `|` inside quotes masked."""
    cmd = HEREDOC.sub(' ', cmd_of(call))
    return re.sub(r'"[^"]*"|\'[^\']*\'', lambda m: re.sub(r'[>|]', '_', m.group(0)), cmd)


def read_regular(path, limit):
    """Up to `limit` bytes of a regular file, or None for anything else.

    Opened without following a final symlink and without blocking, so a FIFO
    or device in the file's place is never waited on.
    """
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
    except OSError:
        return None
    with os.fdopen(fd, 'rb') as fh:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            return None
        return fh.read(limit)


def res_text(call):
    return (call.get('res') or {}).get('text', '')


def res_err(call):
    return bool((call.get('res') or {}).get('err'))


def sentences(text):
    text = re.sub(r'```.*?```', ' ', text, flags=re.S)
    out = []
    for line in text.split('\n'):
        for s in re.split(r'(?<=[.!?])\s+', line):
            s = s.strip(' -*>#\t')
            if s:
                out.append(s)
    return out


def plain(s):
    return re.sub(r'[*_`]', '', s).lower()


# A test script counts only where it runs: first in a command, or after a shell. `grep x tests/a.sh` reads it.
TEST_CMD = re.compile(r'\b(pytest|unittest|(npm|yarn|pnpm|bun)( run)? test|go test|cargo test|jest|vitest|mocha|'
                      r'rspec|phpunit|ctest|make (test|check)|tox|nox|plugin test)\b|'
                      r'(?:^|[;&|(\n]\s*|(?<![\w.-])(?:ba|z)?sh\s+(?:-\w+\s+)*)(?:\./)?(?:[\w.-]+/)*'
                      r'(?:tests?/[\w.-]+|[\w.-]*test[\w.-]*)\.sh\b')
BUILD_CMD = re.compile(r'\b((npm|yarn|pnpm|bun)( run)? build|cargo build|go build|tsc\b|vite build|astro build|'
                       r'gradle|mvn|make\b(?! (test|check))|build\.sh)')
CI_CMD = re.compile(r'\bgh\s+(pr\s+(checks|view|status)|run\s+(list|view|watch)|api\s+\S*(check-runs|status|actions/runs))')
FAIL_OUT = re.compile(r'FAILED \(|^FAIL\b|\bFAIL:|\b[1-9]\d* (failed|failing|failures?|errors?)\b|Traceback \(most recent|'
                      r'^\s*[✗✘]|^X\s|Exit code [1-9]|Some checks were not successful|Checks failing|'
                      r'"(conclusion|state|bucket)":\s*"(failure|FAILURE|fail)"|\bnot ok\b|error TS\d+|Build failed', re.M)
PASS_OUT = re.compile(r'^OK\b|\b\d+ passed\b|\bPASS\b|All checks were successful|\b0 failed\b|Build complete|built in', re.M)
DOC_EXT = ('.md', '.mdx', '.txt', '.rst', '.adoc')
SCRATCH_EXT = ('.log', '.out', '.tmp', '.bak', '.swp', '.pid')


def verdict(call):
    out = res_text(call)
    if res_err(call) or FAIL_OUT.search(out):
        return 'fail'
    return 'pass' if PASS_OUT.search(out) else 'unknown'


def edits(calls, cwd):
    """(index, path) of every successful file change inside the working tree."""
    out = []
    for i, c in enumerate(calls):
        ps = []
        if c['name'] in ('Edit', 'Write', 'MultiEdit', 'NotebookEdit'):
            ps = [c['input'].get('file_path') or c['input'].get('notebook_path')]
        elif c['name'] == 'Bash':
            cmd = cmd_of(c)
            m = re.search(r'\bsed\s+-i\S*\s+(?:\'[^\']*\'|"[^"]*"|\S+)\s+([^\s;&|]+)', shell_of(c))
            ps = [m.group(1).strip('\'"')] if m else []
            if re.match(r'\s*cd\s+[\'"]?/tmp/', cmd):
                continue  # scratch space, which no check covers
            # A Python heredoc that writes files: every quoted path literal in it counts as edited.
            if re.search(r'\bpython3?\s+-\s*<<', cmd) and re.search(r"open\([^)]*,\s*['\"][wa]|write_text\(", cmd):
                read = set(re.findall(r"open\(\s*['\"]([^'\"]+)['\"]\s*\)", cmd))
                ps += [p for p in re.findall(r"['\"]([\w./-]+\.[A-Za-z]{1,5})['\"]", cmd) if p not in read]
            # A redirect, tee, cp, mv, or dd that writes a source file is an edit; a log it writes is not.
            ps += [p for p in write_targets(cmd, c.get('cwd') or cwd, appends=True) if not p.endswith(SCRATCH_EXT)]
        for p in ps:
            if p and re.fullmatch(r'[\w~./-]+', p) and not p.startswith('/tmp/') and ('.' in p or '/' in p) and not res_err(c) and (not cwd or not p.startswith('/') or p.startswith(cwd.rstrip('/') + '/')):
                out.append((i, p))
    return out


# ------------------------------------------------------------------- the checks

def rec(kind, severity, evidence, detector, certainty, turn, tool_use_id, notice):
    return {'kind': kind, 'severity': severity, 'evidence': clip(evidence), 'detector': f'{detector}@{V}',
            'certainty': certainty, 'turn': turn, 'tool_use_id': tool_use_id, 'surfaced': [],
            'ts': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), '_notice': notice}


NEG = re.compile(r"\b(not|\w+n[’']t|cannot|never|fail\w*|red|errors?|broken|except|unless|until|once|if|should|would|will|might|"
                 r"expect\w*|pending|yet|skip\w*|before|whether|when)\b|\?")
CLAIMS = {
    'tests': re.compile(r'\b(tests?|suite|specs?)\b(?!\s+-[a-z]\b)[^.;]{0,40}\b(pass(es|ed|ing)?|green|succeed(s|ed)?)\b'
                        r'(?!\s+(arguments?|through|along|over|the|an?|its?|them)\b)|'
                        r'\b\d+ (tests? )?passed\b|\b(all|every) \d* ?tests?\b[^.;]{0,20}\bpass'),
    'build': re.compile(r'\bbuilds?\b[^.;]{0,30}\b(pass(es|ed)?|succeed(s|ed)?|green|clean(ly)?)\b|\bbuilt (cleanly|successfully)\b'),
    'ci': re.compile(r'\b(ci|pr checks|workflows?|pipeline|github actions)\b[^.;]{0,30}\b(green|pass(es|ed|ing)?|succeed(s|ed)?)\b'),
    'validate': re.compile(r'\b((strict|plugin) validation|validate( --strict)?)\b[^.;]{0,30}\b(pass(es|ed)?|succeed(s|ed)?|clean)\b|'
                           r'\bpass(es|ed)?\b[^.;]{0,40}\b(strict|plugin) validation\b'),
    'lint': re.compile(r'\b(shellcheck|lint(er|ing)?|eslint|ruff)\b[^.;]{0,30}\b(pass(es|ed)?|clean|green|succeed(s|ed)?)\b'),
}
DISCLOSES = {
    'tests': re.compile(r'\b(fail\w*|red|errors?|not (green|pass\w*)|can.?t pass|broken|skipp?\w*)\b'),
    'build': re.compile(r'\b(fail\w*|errors?|broken|not (clean|pass\w*))\b'),
    'ci': re.compile(r'\b(fail\w*|red|(not|\w+n[’\']t) (green|pass\w*)|pending|in progress|cancel\w*|queued)\b'),
    'validate': re.compile(r'\b(fail\w*|errors?|not (clean|pass\w*))\b'),
    'lint': re.compile(r'\b(fail\w*|warnings?|errors?|not (clean|pass\w*))\b'),
}
CHECK_CMD = {'tests': TEST_CMD, 'build': BUILD_CMD, 'ci': CI_CMD, 'validate': re.compile(r'\bplugin\s+validate\b'),
             'lint': re.compile(r'\b(shellcheck|eslint|ruff|flake8|pylint|(npm|yarn|pnpm|bun)( run)? lint|golangci-lint)\b')}
KIND = {'tests': 'tests-claim', 'build': 'tests-claim', 'ci': 'ci-claim', 'validate': 'tests-claim', 'lint': 'tests-claim'}
NAME = {'tests': 'the tests pass', 'build': 'the build passes', 'ci': 'CI is green', 'validate': 'validation passes',
        'lint': 'the linter is clean'}
RUNNER = {'tests': 'test', 'build': 'build', 'validate': 'validate', 'lint': 'lint'}


def judge(key, claim, calls, end, cwd, turn, where):
    """A record when the claim that `key` passes, made at call index `end`, has no passing run behind it."""
    runs = [(i, c) for i, c in enumerate(calls[:end]) if c['name'] == 'Bash' and CHECK_CMD[key].search(shell_of(c))]
    if not runs:
        if key != 'ci' and any(c['name'] in ('Agent', 'Task') and re.search(r'\bpass', res_text(c)) for c in calls[:end]):
            return None
        what = 'no CI status was read' if key == 'ci' else f'no {RUNNER[key]} command ran'
        return rec(KIND[key], 'wrong-claim', f'{where}"{claim}" Session: {what}.', 'claim-diff', 'medium', turn,
                   calls[end]['id'] if end < len(calls) else None, f'{WHO[where]} says {NAME[key]}, but {what} in this session.')
    i, last = runs[-1]
    shown = clip(cmd_of(last), 80)
    if verdict(last) == 'fail':
        tail = clip(res_text(last)[-160:], 160)
        return rec(KIND[key], 'wrong-claim', f'{where}"{claim}" Last run `{shown}` failed: {tail}', 'claim-diff', 'high',
                   turn, last['id'], f'{WHO[where]} says {NAME[key]}, but the last run (`{shown}`) failed.')
    if key == 'ci':
        return None
    # Docs count against a build run inside the directory it built, and plugin component docs against validation.
    site = re.search(r'\bcd\s+([\w./~-]+)', shell_of(last)) if key == 'build' else None
    later = [p for j, p in edits(calls[:end], cwd) if j > i and (not p.endswith(DOC_EXT) or (key == 'validate' and PLUGIN_DOC.search(p)) or
                                                                 (site and f'/{os.path.basename(site.group(1).rstrip("/"))}/' in f'/{p}'))]
    if not later:
        return None
    return rec(KIND[key], 'wrong-claim', f'{where}"{claim}" Changed after the last run `{shown}`: '
               f'{", ".join(sorted({os.path.basename(p) for p in later}))}', 'claim-diff', 'medium', turn, last['id'],
               f'{WHO[where]} says {NAME[key]}, but {os.path.basename(later[-1])} changed after the last run (`{shown}`) '
               f'and nothing ran since.')


SUBJECT = {'tests': re.compile(r'\b(tests?|suites?|specs?)\b'), 'build': re.compile(r'\bbuil(d|ds|t)\b'),
           'ci': re.compile(r'\b(ci|checks?|workflows?|pipeline|actions)\b'), 'validate': re.compile(r'\bvalidat'),
           'lint': re.compile(r'\b(shellcheck|lint\w*|eslint|ruff)\b')}
PROOF = re.compile(r'\bfails? (without|before|on the old|against the old)\b[^.;]*')
PLUGIN_DOC = re.compile(r'(^|/)(skills|agents|commands|output-styles)/|(^|/)(SKILL|CLAUDE|AGENTS)\.md$')
ON_PR = re.compile(r'\bpr\s*#?\d+|\bci\b|\bon (the )?pr\b|\bchecks\b')
WHO = {'Reply: ': 'the reply', 'PR checklist: ': 'a ticked PR checklist line'}
PUBLISH = re.compile(r'\bgh\s+pr\s+(create|edit)\b|\bgit\s+commit\b')
TICK = re.compile(r'^\s*[-*]\s+\[[xX]\]\s+(.+)$', re.M)
BODY_FILE = re.compile(r'(?:\s(?:--body-file|--file|-F)(?:=|\s+))([^\s;&|<>]+)')
BODY_MAX = 64 * 1024


def published_text(call):
    """The command, plus the body file a `gh pr` or `git commit` call read (at most 64 KiB, as it is now)."""
    text = cmd_of(call).replace('\\n', '\n')
    for f in BODY_FILE.findall(shell_of(call)):
        f = f.strip('\'"')
        if f != '-' and not re.search(r'[$`*?]', f):
            body = read_regular(os.path.join(call.get('cwd') or '', os.path.expanduser(f)), BODY_MAX)
            text += '\n' + (body or b'').decode('utf-8', 'replace')
    return text


def claim_checks(reply, calls, turn_start, cwd, turn):
    out = []
    said = [plain(s) for s in sentences(reply)]
    for key, rx in CLAIMS.items():
        # A failure the reply reports about this check, not a regression test shown failing without the fix.
        if any(SUBJECT[key].search(s) and DISCLOSES[key].search(PROOF.sub(' ', s)) for s in said):
            continue
        # A sentence about a PR's checks is a CI claim, whichever job names it lists.
        claim = next((s for s in sentences(reply) if rx.search(plain(s)) and not NEG.search(plain(s))
                      and not (key == 'ci' and 'local' in plain(s)) and not (key != 'ci' and ON_PR.search(plain(s)))), None)
        if claim:
            out.append(judge(key, claim, calls, len(calls), cwd, turn, 'Reply: '))
    # A ticked checklist line in a PR body or commit this turn is a claim the check passed when it was published.
    for k in range(turn_start, len(calls)):
        c = calls[k]
        if c['name'] != 'Bash' or res_err(c) or not PUBLISH.search(shell_of(c)):
            continue
        for item in TICK.findall(published_text(c)):
            key = next((key for key in ('lint', 'validate', 'build', 'tests') if CHECK_CMD[key].search(item)), None)
            if key:
                out.append(judge(key, clip(item.strip(), 100), calls, k, cwd, turn, 'PR checklist: '))
    return [r for r in out if r]


VERIFY = re.compile(r'\b(verified (it|the fix|that it works?)|double-?checked (it|the fix)|tested (it|the fix)|'
                    r'confirmed (it|the fix|that it) works?)\b')


def verify_check(reply, calls, turn_start, cwd, turn):
    claim = next((s for s in sentences(reply) if VERIFY.search(plain(s)) and not re.search(r"\b(not|\w+n[’']t|cannot|couldn|unable)\b", plain(s))), None)
    if not claim:
        return []
    ed = [(j, p) for j, p in edits(calls, cwd) if j >= turn_start and not p.endswith(DOC_EXT)]
    if not ed:
        return []
    j, p = ed[-1]
    after = [c for c in calls[j + 1:] if c['name'] == 'Bash']
    ok = [c for c in after if not res_err(c) and not re.search(r'Traceback \(most recent|ModuleNotFoundError|ImportError|'
                                                               r'SyntaxError|command not found', res_text(c))]
    if ok:
        return []
    what = 'every run after it failed' if after else 'nothing ran after it'
    return [rec('verify-claim', 'wrong-claim', f'Reply: "{claim}" Last edit: {os.path.basename(p)}; {what}.', 'claim-diff',
                'high' if after else 'medium', turn, calls[j]['id'],
                f'the reply says the change was verified, but {what} (last edit: {os.path.basename(p)}).')]


COUNT_ASK = re.compile(r'\b(how many|count|number of|exact number|tally)\b', re.I)


def lossy(cmd, name, inp):
    """Why a command's count may be short, or '' when one of its counting pipelines is exact."""
    if name == 'Grep':
        return 'the Grep tool skips hidden and gitignored files' + (' and counts lines' if inp.get('output_mode') == 'count' else '')
    why, exact = [], False
    # Each pipeline that counts is judged alone, so an exact count beside a lossy one clears the command.
    for seg in re.split(r'&&|\|\||;|\n|\$\(|\)|`', HEREDOC.sub(' ', cmd)):
        greps = list(re.finditer(r'\b(e|f)?grep((?:\s+(?:-[A-Za-z]+|--[\w-]+(?:=\S+)?))*)', seg))
        rg = re.search(r'(^|[\s|(])rg\s', seg)
        wc = re.search(r'\|\s*wc\s+-l', seg)
        short = ''.join(''.join(re.findall(r'\s-([A-Za-z]+)', m.group(2))) for m in greps[:1])
        if rg and not greps:
            short = ''.join(re.findall(r'\s-([A-Za-z]+)', seg[rg.end() - 1:]))
        if not (greps or rg) or not (wc or 'c' in short or re.search(r'\s--count\b', seg)):
            continue
        mine = []
        if greps:
            flags = greps[0].group(2)
            if 'I' in short or 'binary-files=without-match' in flags:
                mine.append('grep -I skips binary files')
            # A pattern anchored at line start matches once per line, so counting lines is exact.
            anchored = re.match(r'\s*[\'"]?\^', seg[greps[0].end():])
            if not anchored and ('c' in short or ('o' not in short and wc)):
                mine.append('it counts matching lines, not matches')
        if rg and not greps and 'c' in short:
            mine.append('it counts matching lines, not matches')
        if rg:
            # rg is exact only with -uu (or -uuu), or with --no-ignore and --hidden together.
            us = sum(f.count('u') for f in re.findall(r'(?:^|\s)-([a-zA-Z]+)', seg))
            hidden, ignored = us >= 2 or '--hidden' in seg, us >= 1 or '--no-ignore' in seg
            if not (hidden and ignored):
                mine.append('rg skips ' + ' and '.join(w for w, ok in (('hidden', hidden), ('gitignored', ignored)) if not ok) + ' files')
        if not mine:
            exact = True
        why += mine
    return '' if exact else '; '.join(dict.fromkeys(why))


def count_check(reply, ask, calls, turn_start, turn):
    if not COUNT_ASK.search(ask or ''):
        return []
    first = next((s for s in sentences(reply)), '')
    m = re.search(r'(?<![\w./-])(\d{1,6})(?![\w/.-]|\.\d)', re.sub(r'[*_`]', '', first))
    if not m:
        return []
    n = m.group(1)
    hit = re.compile(rf'(?m)(^|[:=]\s*|\s)({n})\s*$')
    makers = [c for c in calls[turn_start:] if c['name'] in ('Bash', 'Grep') and hit.search(res_text(c))]
    if not makers:
        return []
    reasons = [lossy(cmd_of(c), c['name'], c['input']) for c in makers]
    if not all(reasons):
        return []
    c = makers[-1]
    shown = clip(cmd_of(c) or json.dumps(c['input']), 90)
    return [rec('count', 'wrong-claim', f'Reply: "{clip(first, 120)}" {n} came from `{shown}`: {reasons[-1]}.', 'count-source',
                'medium', turn, c['id'], f'the reply\'s count {n} came from a command where {reasons[-1]}.')]


RECOUNT_FILES, RECOUNT_BYTES, RECOUNT_SECS = 5000, 32 * 1024 * 1024, 3.0
GREP_FLAGS = {'r': 'r', 'R': 'r', 'i': 'i', 'w': 'w', 'o': 'o', 'a': 'a', 'I': 'I', 'n': '', 'H': '', 'h': '', 's': '',
              'F': '', 'E': ''}
RG_FLAGS = {'i': 'i', 'w': 'w', 'o': 'o', 'a': 'a', 'u': 'u', '.': 'H', 'n': '', 'N': '', 'H': '', 's': '', 'F': ''}
LONG_FLAGS = {'--recursive': 'r', '--ignore-case': 'i', '--word-regexp': 'w', '--only-matching': 'o', '--text': 'a',
              '--hidden': 'H', '--no-ignore': 'N', '--fixed-strings': '', '--line-number': '', '--no-filename': '',
              '--with-filename': '', '--case-sensitive': ''}


def count_spec(piece):
    """(tool, word, flags, paths) for `grep` or `rg` searching one literal word, or None for anything else."""
    try:
        argv = shlex.split(piece)
    except ValueError:
        return None
    if not argv or argv[0] not in ('grep', 'rg'):
        return None
    short = GREP_FLAGS if argv[0] == 'grep' else RG_FLAGS
    flags, rest, k = '', [], 1
    while k < len(argv):
        a = argv[k]
        if a == '-e' and k + 1 < len(argv):
            rest.insert(0, argv[k + 1])
            k += 1
        elif a.startswith('--'):
            if a not in LONG_FLAGS and not a.startswith('--color'):
                return None
            flags += LONG_FLAGS.get(a, '')
        elif a.startswith('-') and len(a) > 1:
            if any(ch not in short for ch in a[1:]):
                return None
            flags += ''.join(short[ch] for ch in a[1:])
        else:
            rest.append(a)
        k += 1
    if not rest or not re.fullmatch(r'\w+', rest[0]) or (argv[0] == 'grep' and 'r' not in flags) or 'I' in flags:
        return None
    return argv[0], rest[0], flags, rest[1:] or ['.']


def recount(tool, word, flags, paths, cwd, clock):
    """Every file's count of `word` under `paths`, binaries included, as {relpath: (count, skipped-because)},
    or None when a path is not a plain directory, a symlink or special file is in the tree, or a bound is hit."""
    rx = re.compile((rb'(?<!\w)%s(?!\w)' if 'w' in flags else rb'%s') % re.escape(word.encode()), re.I if 'i' in flags else 0)
    per, files, size = {}, 0, 0
    for p in paths:
        top = os.path.join(cwd, p)
        if re.search(r'[$`*?~]', p) or os.path.islink(top) or not os.path.isdir(top):
            return None
        for root, dirs, names in os.walk(top):
            for n in dirs + names:
                st = os.lstat(os.path.join(root, n))
                if stat.S_ISLNK(st.st_mode) or not (stat.S_ISDIR(st.st_mode) or stat.S_ISREG(st.st_mode)):
                    return None
            for n in names:
                f = os.path.join(root, n)
                files, size = files + 1, size + os.lstat(f).st_size
                if files > RECOUNT_FILES or size > RECOUNT_BYTES or clock() > RECOUNT_SECS:
                    return None
                data = read_regular(f, RECOUNT_BYTES + 1)
                if data is None:
                    return None
                got = len(rx.findall(data)) if 'o' in flags else sum(1 for l in data.split(b'\n') if rx.search(l))
                if not got:
                    continue
                rel = os.path.relpath(f, cwd)
                try:
                    data.decode('utf-8')
                    binary = b'\0' in data
                except UnicodeDecodeError:
                    binary = tool == 'grep' or b'\0' in data
                hidden = any(x.startswith('.') and x not in ('.', '..') for x in rel.split(os.sep))
                why = 'binary' if binary and 'a' not in flags and flags.count('u') < 3 else \
                    'hidden' if tool == 'rg' and hidden and 'H' not in flags and flags.count('u') < 2 else ''
                per[rel] = (got, why)
    return per


def recount_check(reply, ask, calls, turn_start, turn):
    """A live count the session took with grep or rg over a directory, recounted here with every file read.

    The notice needs the recount to be complete, to differ from the reply's number, and to match that number
    once the files grep or rg skips are left out, so it can say which files hold the difference."""
    if not COUNT_ASK.search(ask or ''):
        return []
    first = next((s for s in sentences(reply)), '')
    m = re.search(r'(?<![\w./-])(\d{1,6})(?![\w/.-]|\.\d)', re.sub(r'[*_`]', '', first))
    if not m:
        return []
    n = int(m.group(1))
    hit = re.compile(rf'(?m)(^|[:=]\s*|\s)({n})\s*$')
    start = datetime.datetime.now().timestamp()
    clock = lambda: datetime.datetime.now().timestamp() - start
    best = None
    for c in calls[turn_start:]:
        cmd = cmd_of(c)
        if not hit.search(res_text(c)) or re.search(r'(^|[;&|(]\s*)(cd|pushd)\s', cmd):
            continue
        parts = re.split(r'(&&|\|\||;|\n|\$\(|\)|`|\|)', HEREDOC.sub(' ', cmd))
        for k in range(0, len(parts) - 2, 2):
            if parts[k + 1] != '|' or not re.fullmatch(r'\s*wc\s+-l\s*', parts[k + 2]):
                continue
            spec = count_spec(parts[k])
            per = recount(*spec, c.get('cwd') or '', clock) if spec else None
            if per is None:
                continue
            full = sum(g for g, _ in per.values())
            seen = sum(g for g, why in per.values() if not why)
            if full == n:
                return []
            if seen == n and not best:
                best = (c, parts[k].strip(), spec[0], full, {f: v for f, v in per.items() if v[1]})
    if not best:
        return []
    c, shown, tool, full, skipped = best
    where = ', '.join(f'{g} in {f} ({why})' for f, (g, why) in sorted(skipped.items()))
    return [rec('count', 'wrong-claim', f'Reply: "{clip(first, 120)}" {n} came from `{clip(shown, 80)}`; a recount of every '
                f'file finds {full}: {where}.', 'count-recount', 'high', turn, c['id'],
                f'the reply\'s count is {n}, but a recount of every file finds {full}. {tool} skipped {where}.')]


def check_stop(calls, turn_start, reply, ask, cwd, turn, live=False):
    found = []
    found += claim_checks(reply, calls, turn_start, cwd, turn)
    found += verify_check(reply, calls, turn_start, cwd, turn)
    found += count_check(reply, ask, calls, turn_start, turn)
    # The files a transcript counted may be gone or changed, so the replay never recounts.
    if live and not any(r['kind'] == 'count' for r in found):
        found += recount_check(reply, ask, calls, turn_start, turn)
    return found


# --------------------------------------------------------------------- clobber

SNAP_MAX = 256 * 1024          # a file larger than this is never copied
SAVED_MAX = 64 * 1024 * 1024   # clobbered/ takes no new copy past this size; nothing is ever deleted from it
REMOTE = {'ssh', 'scp', 'sftp', 'eval', 'sh', 'bash', 'zsh', 'dash'}
HEREDOC_OPEN = re.compile(r'(?<!<)<<(?!<)-?\s*([\'"]?)([A-Za-z_][\w-]*)\1')


def strip_heredocs(cmd):
    """The command without heredoc bodies, which hold arbitrary text, `>` included."""
    out, tag = [], None
    for line in cmd.split('\n'):
        if tag is not None:
            if line.strip() == tag:
                tag = None
            continue
        out.append(line)
        m = HEREDOC_OPEN.search(line)
        if m:
            tag = m.group(2)
    return '\n'.join(out)


def write_targets(command, cwd, home='', appends=False):
    """Absolute paths a Bash command replaces whole.

    Appends (`>>`, `tee -a`) count only with `appends`. Stderr redirects,
    /dev, and paths built from variables, substitutions, or globs are left
    out. Each path is resolved through symlinks, so `link/../f` names the
    file the kernel would open. The command splits on
    `&&`, `||`, `;`, `|`, `&` and newlines, with quoted text kept whole, so
    `mkdir -p d && cat > d/f <<EOF` finds d/f. A literal `cd` moves where
    later relative paths resolve, and any other directory change drops them.
    A segment run by ssh, a shell wrapper, or eval is skipped.
    """
    quoted = []

    def stash(m):
        quoted.append(m.group(0)[1:-1])
        return f'\0{len(quoted) - 1}\0'

    def word(w):
        return re.sub(r'\0(\d+)\0', lambda m: quoted[int(m.group(1))], w)

    cmd = re.sub(r'"[^"]*"|\'[^\']*\'', stash, strip_heredocs(command))
    here, found = cwd, []
    for seg in re.split(r'&&|\|\||;|\n|(?<![>&])\|(?!\|)|(?<![>&0-9])&(?![>&])', cmd):
        words = seg.split()
        if not words:
            continue
        head = word(words[0])
        if head in ('cd', 'pushd', 'popd'):
            dest = word(words[1]) if len(words) > 1 and head != 'popd' else ('' if head == 'cd' else None)
            if dest == '' and home:
                here = home
            elif dest and not re.search(r'[$`*?]', dest) and dest != '-' and (not dest.startswith('~') or dest.startswith('~/')):
                dest = home + dest[1:] if dest.startswith('~/') else dest
                here = os.path.realpath(os.path.join(here, dest)) if here else (os.path.realpath(dest) if dest.startswith('/') else None)
            else:
                here = None
            continue
        if head in REMOTE or any(word(w) in ('ssh', 'scp', 'sftp') for w in words):
            continue
        redirect = r'(?:^|[^>0-9&])&?>>?\|?(?![>&])\s*([^\s<>()]+)' if appends else r'(?:^|[^>0-9&])&?>\|?(?![>&])\s*([^\s<>()]+)'
        raw = [m.group(1) for m in re.finditer(redirect, seg)]
        i = next((k for k, w in enumerate(words) if w in ('tee', 'cp', 'mv', 'dd')), -1)
        if i >= 0:
            args = []
            for w in words[i + 1:]:
                if re.match(r'[0-9&]*[<>]', w):
                    break
                args.append(w)
            tool = words[i]
            if tool == 'tee':
                if appends or not any(a in ('-a', '--append') for a in args):
                    raw += [a for a in args if not a.startswith('-')]
            elif tool == 'dd':
                raw += [a[3:] for a in args if a.startswith('of=')]
            else:
                plain_args = [a for a in args if not a.startswith('-')]
                if len(plain_args) == 2 and '-t' not in args:
                    raw.append(plain_args[1])
        for r in raw:
            p = word(r)
            if not p or p.startswith('/dev/') or re.search(r'[$`*?\0]', p) or (p.startswith('~') and not p.startswith('~/')):
                continue
            if p.startswith('~/'):
                if not home:
                    continue
                p = home + p[1:]
            if not p.startswith('/'):
                if not here:
                    continue
                p = os.path.join(here, p)
            p = os.path.realpath(p)
            if p not in found:
                found.append(p)
    return found


def lost_lines(before, after):
    """Non-blank lines of the old content that the new content no longer has."""
    kept = {l.strip() for l in after.split('\n')}
    return list(dict.fromkeys(t for t in (l.strip() for l in before.split('\n')) if t and t not in kept))


def earlier_inputs(transcript_path, tool_use_id):
    """The path, command, and pattern of every main-thread call before this one."""
    out = []
    try:
        fh = open(transcript_path or '', encoding='utf-8', errors='replace')
    except OSError:
        return out
    with fh:
        for raw in fh:
            if '"tool_use"' not in raw:
                continue
            try:
                d = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(d, dict) or d.get('isSidechain') or d.get('type') != 'assistant':
                continue
            c = (d.get('message') or {}).get('content')
            for b in c if isinstance(c, list) else []:
                if isinstance(b, dict) and b.get('type') == 'tool_use' and b.get('id') != tool_use_id:
                    inp = b.get('input') or {}
                    out += [v for k in ('file_path', 'path', 'command', 'pattern', 'notebook_path')
                            if isinstance(v := inp.get(k), str)]
    return out


def pending_dir(sid):
    # Pre-call copies wait here until the call ends: outside the data directory, private to this user.
    return os.path.join(tempfile.gettempdir(), f'katharsis-{os.getuid()}', sid)


def private_dir(base):
    """`base` made 0700 if missing, or None when it or its parent is not this user's own private folder."""
    try:
        os.makedirs(base, mode=0o700, exist_ok=True)
        for d in (os.path.dirname(base), base):
            st = os.lstat(d)
            if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid() or (d == base and st.st_mode & 0o077):
                return None
    except OSError:
        return None
    return base


def ids_of(payload):
    sid, tid = payload.get('session_id'), payload.get('tool_use_id')
    ok = all(isinstance(x, str) and re.fullmatch(r'[\w-]+', x) for x in (sid, tid))
    return (sid, tid) if ok else (None, None)


def pre_tool(payload):
    """Copy each existing file the command replaces and no earlier call named."""
    sid, tid = ids_of(payload)
    inp = payload.get('tool_input')
    if not sid or payload.get('tool_name') != 'Bash' or payload.get('agent_id') or not isinstance(inp, dict):
        return 0
    cwd = payload.get('cwd') or ''
    targets = []
    for t in write_targets(inp.get('command') or '', cwd, os.path.expanduser('~')):
        data = read_regular(t, SNAP_MAX + 1)
        if data and len(data) <= SNAP_MAX:
            targets.append((t, data))
    if not targets:
        return 0
    seen = earlier_inputs(payload.get('transcript_path'), tid)
    targets = [(t, data) for t, data in targets if not any(os.path.basename(t) in s for s in seen)]
    base = private_dir(pending_dir(sid)) if targets else None  # a folder someone else made or can open gets no copy
    if not base:
        return 0
    now = datetime.datetime.now().timestamp()
    for f in os.listdir(base):  # a call that never finished leaves its copy behind
        try:
            if now - os.path.getmtime(os.path.join(base, f)) > 3600:
                os.remove(os.path.join(base, f))
        except OSError:
            pass
    kept = []
    for t, data in targets:
        try:
            fd = os.open(os.path.join(base, f'{tid}.{len(kept)}'), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except OSError:
            continue
        with os.fdopen(fd, 'wb') as out:
            out.write(data)
        kept.append(t)
    if kept:
        with open(os.path.join(base, f'{tid}.json'), 'w', encoding='utf-8') as fh:
            json.dump(kept, fh)
    return 0


def dir_size(path):
    total = 0
    for root, _, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def post_tool(payload):
    """Compare each copied file with what the call left, and report lost lines."""
    sid, tid = ids_of(payload)
    if not sid:
        return 0
    base = pending_dir(sid)
    index = os.path.join(base, f'{tid}.json')
    try:
        with open(index, encoding='utf-8') as fh:
            targets = json.load(fh)
    except (OSError, ValueError):
        return 0
    notes, notices = [], []
    for i, target in enumerate(targets):
        snap = os.path.join(base, f'{tid}.{i}')
        try:
            with open(snap, 'rb') as fh:
                before = fh.read()
            os.remove(snap)
        except OSError:
            continue
        # A missing file lost everything; anything but a regular file in its place is left alone.
        after = b'' if not os.path.lexists(target) else read_regular(target, 4 * SNAP_MAX)
        if after is None:
            continue
        lost = lost_lines(before.decode('utf-8', 'replace'), after.decode('utf-8', 'replace'))
        if not lost:
            continue
        ts = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        saved, full = None, dir_size(os.path.join(DATA, 'clobbered')) + len(before) > SAVED_MAX
        folder = None if full or not private_dir(os.path.join(DATA, 'clobbered')) else private_dir(os.path.join(DATA, 'clobbered', sid))
        # The short name first; the call and target index make the second one unique. Neither is ever reopened.
        stamp = ts.replace(':', '')
        for name in (f'{stamp}-{os.path.basename(target)}', f'{stamp}-{tid}-{i}-{os.path.basename(target)}') if folder else ():
            try:
                fd = os.open(os.path.join(folder, name), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            except OSError:
                continue
            with os.fdopen(fd, 'wb') as fh:
                fh.write(before)
            saved = os.path.join(folder, name)
            break
        n = len(lost)
        lines = f'{n} line{"" if n == 1 else "s"}'
        cmd = f'cp {shlex.quote(saved)} {shlex.quote(target)}' if saved else ''
        try:
            ev = events_of(open(payload.get('transcript_path') or '', encoding='utf-8', errors='replace'))
            turn = turn_view(ev)[3]
        except OSError:
            turn = 0
        r = {'kind': 'clobber', 'severity': 'data-loss',
             'evidence': clip(f'{target} existed and this session never read it; the command replaced it and '
                              f'{lines} are gone: {" | ".join(lost)}'),
             'detector': f'clobber@{V}', 'certainty': 'high', 'turn': turn, 'tool_use_id': tid,
             'surfaced': ['system_notice'], 'ts': ts, 'target': target, 'saved': saved}
        path = os.path.join(DATA, 'detections', f'{sid}.jsonl')
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'a', encoding='utf-8') as fh:
            fh.write(json.dumps(r) + '\n')
        notices.append(f'Katharsis: {target} was replaced unread; {lines} lost. ' +
                       (f'Restore: {cmd}' if cmd else f'No copy was saved{": clobbered/ is past its 64 MiB limit" if full else ""}.'))
        notes.append(f'{target} existed, this session never read it, and this command replaced it: {lines} lost '
                     f'({clip(" | ".join(lost), 120)}). Say so in one sentence at the end of your reply, ' +
                     (f'with the restore command: {cmd}' if cmd else 'and say that no copy was saved.'))
    try:
        os.remove(index)
    except OSError:
        pass
    if notices:
        print(json.dumps({'systemMessage': '\n'.join(notices),
                          'hookSpecificOutput': {'hookEventName': payload.get('hook_event_name') or 'PostToolUse',
                                                 'additionalContext': '\n'.join(notes)}}))
    return 0


# ------------------------------------------------------------------ Stop hook

def seen_keys(path):
    keys = set()
    try:
        for line in open(path, encoding='utf-8'):
            try:
                d = json.loads(line)
            except ValueError:
                continue
            keys.add((d.get('kind'), d.get('tool_use_id'), d.get('evidence')))
    except OSError:
        pass
    return keys


def load_detections(path):
    out = []
    try:
        for line in open(path, encoding='utf-8'):
            try:
                out.append(json.loads(line))
            except ValueError:
                pass
    except OSError:
        pass
    return out


def turn_view(ev):
    """calls, the index of the first call in the last typed turn, the typed text, and the turn number."""
    calls = [e for e in ev if e['t'] == 'call']
    turn, start, ask, n = 0, 0, '', 0
    for e in ev:
        if e['t'] == 'call':
            n += 1
        elif e['t'] == 'user' and e['typed']:
            turn, start, ask = turn + 1, n, e['text']
    return calls, start, ask, turn


CLOBBER_SAID = re.compile(r'overwr|replac|existing|already|previous|restor|lost|earlier', re.I)
NEVER_THERE = re.compile(r"\b((did|does|do)( not|n[’']t) (exist|have)|never existed|(was|were)( not|n[’']t) there|"
                         r"no (existing|previous|prior|earlier)|(new|fresh) file|nothing (was )?(overwritten|replaced|lost)|"
                         r"(not|n[’']t) (overwrite|replace)\w*)\b")


def stop(payload):
    sid = payload.get('session_id') or ''
    if not sid or not os.path.exists(os.path.join(DATA, f'.active-{sid}')):
        return 0
    reply = payload.get('last_assistant_message') or ''
    try:
        ev = events_of(open(payload.get('transcript_path') or '', encoding='utf-8', errors='replace'))
    except OSError:
        return 0
    calls, start, ask, turn = turn_view(ev)
    cwd = payload.get('cwd') or ''
    texts = [e['text'] for e in ev if e['t'] == 'text'] + [reply]
    found = check_stop(calls, start, reply, ask, cwd, turn, live=True)
    path = os.path.join(DATA, 'detections', f'{sid}.jsonl')
    keys = seen_keys(path)
    fresh = [r for r in found if (r['kind'], r['tool_use_id'], r['evidence']) not in keys]
    notices = []
    if fresh:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'a', encoding='utf-8') as fh:
            for r in fresh:
                notices.append(r.pop('_notice'))
                r['surfaced'] = ['system_notice']
                fh.write(json.dumps(r) + '\n')
    # A clobber this turn that the reply still does not mention holds once. A reply that says the file
    # was never there gets a notice instead, since the appended line would contradict one on screen.
    turn_ids = {c['id'] for c in calls[start:]}
    hold = None
    for d in load_detections(path) if not payload.get('stop_hook_active') else []:
        target = d.get('target')
        if d.get('kind') != 'clobber' or d.get('certainty') != 'high' or d.get('tool_use_id') not in turn_ids \
                or not isinstance(target, str):
            continue
        base = os.path.basename(target)
        said = sentences(' '.join(texts[-3:]))
        restore = f'cp {shlex.quote(d["saved"])} {shlex.quote(target)}' if d.get('saved') else ''
        if any(base in x and NEVER_THERE.search(plain(x)) for x in said):
            folder = private_dir(pending_dir(sid)) if re.fullmatch(r'[\w-]+', sid) else None
            try:  # one notice per replaced file, however many Stops the turn has
                os.close(os.open(os.path.join(folder, f'{d["tool_use_id"]}.{base}.told'), os.O_CREAT | os.O_EXCL, 0o600))
            except (OSError, TypeError):
                continue
            notices.append(f'the reply says {base} was not there before, but this session replaced an existing '
                           f'{target} without reading it. ' + (f'Restore: {restore}' if restore else 'No copy was saved.'))
            continue
        if base in ' '.join(said) and CLOBBER_SAID.search(' '.join(said)):
            continue
        hold = (f'Katharsis: {target} was replaced unread. Add one sentence at the end of the reply that says so, ' +
                (f'with the restore command: {restore}' if restore else 'and that no copy was saved') +
                '. Leave the rest of the reply as it is.')
        break
    if not notices and not hold:
        return 0
    out = {}
    if notices:
        out['systemMessage'] = '\n'.join(f'Katharsis check: {n}' for n in notices)
    if hold:
        out['decision'] = 'block'
        out['reason'] = hold
    print(json.dumps(out))
    return 0


# --------------------------------------------------------------------- replay

def replay(path, sid=None):
    ev = events_of(open(path, encoding='utf-8', errors='replace'))
    sid = sid or os.path.splitext(os.path.basename(path))[0]
    calls = [e for e in ev if e['t'] == 'call']
    seen = set()
    turn, start, ask, n = 0, 0, '', 0
    cwd = next((e['cwd'] for e in ev if e['t'] == 'call' and e.get('cwd')), '')
    stops = []
    # A Stop falls before every user message and at the end, where text came since the last one.
    for k, e in enumerate(ev + [{'t': 'user', 'typed': False, 'text': ''}]):
        if e['t'] == 'user':
            stops.append((k, n, turn, start, ask))
            if e['typed']:
                turn, start, ask = turn + 1, n, e['text']
        elif e['t'] == 'call':
            n += 1
    last_user = -1
    for k, ncalls, turn_k, start_k, ask_k in stops:
        seg = ev[last_user + 1:k]
        last_user = k
        texts = [x for x in seg if x['t'] == 'text']
        if not texts or turn_k == 0:
            continue
        # The reply the Stop hook reads: the text after the segment's last call.
        tail = []
        for x in seg:
            if x['t'] == 'call':
                tail = []
            elif x['t'] == 'text':
                tail.append(x['text'])
        reply = '\n'.join(tail)
        if not reply:
            continue
        upto = calls[:ncalls]
        found = check_stop(upto, start_k, reply, ask_k, cwd, turn_k)
        when = next((x['ts'] for x in reversed(seg) if x['t'] == 'text' and x.get('ts')), '')
        for r in found:
            if when:
                r['ts'] = when[:19] + 'Z'  # the contract's second-resolution UTC form
            key = (r['kind'], r['tool_use_id'], r['evidence'])
            if key in seen:
                continue
            seen.add(key)
            r.pop('_notice')
            r['surfaced'] = ['system_notice']
            r['session'] = sid
            print(json.dumps(r))
    return 0


def main(argv):
    if len(argv) >= 2 and argv[0] == '--replay':
        return replay(argv[1], argv[3] if len(argv) >= 4 and argv[2] == '--session' else None)
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return 0
    if not isinstance(payload, dict):
        return 0
    event = payload.get('hook_event_name')
    if event == 'PreToolUse':
        return pre_tool(payload)
    if event in ('PostToolUse', 'PostToolUseFailure'):
        return post_tool(payload)
    return stop(payload)


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception:
        if '--replay' in sys.argv:
            raise
        sys.exit(0)
