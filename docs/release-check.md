# The real-path check

A release ships nothing that has not run through the path a user gets: the plugin installed from
this repo, the style picked in `/config`, and a real Claude Code session under it. The test suites
run every script against a temporary directory and prove the scripts; this check proves the
wiring between them, which no suite can reach. Run it before every tag, and record the result in
the CHANGELOG entry for that release.

## Setup

1. Install the plugin from a checkout of the commit you are about to tag:

   ```
   claude --plugin-dir /path/to/katharsis --permission-mode default
   ```

   or, for the marketplace path, `/plugin marketplace add` and `/plugin install` as the README
   shows. Start every interactive session in the check with `--permission-mode default`: auto
   mode allows the routing call on its own, which leaves the permission row untested. Before the
   permission row, check that no `permissions.allow` list in the settings the session loads
   holds another rule that matches the routing script, or that rule can pass the row in place of
   setup's entry.
2. In the session, run `/katharsis:setup`. It must print the permission line it added, or that
   the entry was already present, and the two style names.
3. Open `/config`, pick `katharsis:Katharsis`, and start a new session in the same project so the
   SessionStart hook runs with the style active.

Note the session ID, which `kref` and the stamp files are keyed by. `! echo $CLAUDE_CODE_SESSION_ID`
prints it.

## The turns

Send these three messages, in this order, and wait for each reply:

1. `how's it going?` A `status-and-resume` turn. The reply is a sentence or two of state and one
   next step.
2. `what are the trade-offs between keeping the hooks separate and merging them?` A `diagnosis`
   turn. The reply carries at least one coded item, such as an `F` or a `T-O`, so the ledger has
   something to record.
3. `! kref` A bash-mode turn. The command prints the items from turn 2, and the model's reply is
   the single word "Logged."

## Headless variant

`claude -p` covers every row in the table except the PATH row, which needs bash mode, and the
permission row, which needs a prompt to watch, so most of the check runs from a script. From an
empty directory:

```
mkdir -p .claude && echo '{"outputStyle":"katharsis:Katharsis"}' > .claude/settings.local.json
SID=$(python3 -c 'import uuid; print(uuid.uuid4())')
OPTS=(--plugin-dir /path/to/katharsis --setting-sources project,local
      --settings '{"permissions":{"allow":["Bash(~/.claude/katharsis/scripts/katharsis-exchange-style.sh:*)"]}}')
claude -p --session-id "$SID" "${OPTS[@]}" "how's it going?" < /dev/null
claude -p --resume "$SID" "${OPTS[@]}" "what are the trade-offs between keeping the hooks separate and merging them?" < /dev/null
CLAUDE_CODE_SESSION_ID=$SID ~/.claude/katharsis/bin/kref
```

The settings file stands in for the `/config` choice, and the `--settings` argument for the
permission entry that setup writes. Without the settings file the prompt hook never marks the
session active, so the ledger stays empty. With both in
place, this variant proves the hooks and the ledger and leaves the setup script, bash mode's PATH, the `! kref` turn, and the permission row to an interactive session. The second call needs `--resume`
with the same ID, or it starts a new session and the stamp checks read the wrong one, and it
takes no `--session-id`, which Claude Code 2.1.280 rejects beside `--resume`.
`--setting-sources project,local` leaves `~/.claude/settings.json` out of the session, so hooks
and a style configured there do not fire beside the plugin's, and the check measures the plugin
alone.

## What to check

Every line below has to hold, with `DATA` as `~/.claude/katharsis-data` and `SID` as the session
ID.

| Check | Command | Expected |
|---|---|---|
| The symlink points at the plugin | `readlink ~/.claude/katharsis` | The plugin's directory |
| The reminder ran and marked the session active | `ls $DATA/.active-$SID` | Exists |
| The last typed turn was stamped | `cat $DATA/.exchange-last-$SID` | One line: a timestamp, a tab, `diagnosis`, a tab, and an empty third field |
| The gate consumed each turn's stamp | `ls $DATA/.exchange-state-$SID` | Does not exist |
| No turn was counted as a miss | `grep "\"session_id\": \"$SID\"" $DATA/telemetry/gate-misses.jsonl \| grep -c '"status": "missed"'` | `0`; the `! kref` turn may appear as a separate row with status `inherited` |
| The ledger holds turn 2's items | `kref` inside the session, or `CLAUDE_CODE_SESSION_ID=$SID kref` from a terminal | Every coded item the reply showed, with its title |
| The plugin's `bin/` is on bash mode's PATH | `! command -v kref` | A path under the plugin directory |
| The permission entry took | In a new session started after the other rows are checked, ask the model to run the routing script alone, exactly as the style writes it, with `status-and-resume`, then with `diagnosis` | No permission prompt on either call. A prompt on any other call, in any session of the check, settles nothing about this row, including a call where the model chains other commands onto the routing script: answer it with plain "Yes", which writes no rule, and never with the option that switches to auto mode |

The last two rows are the ones no suite covers. If `! command -v kref` prints nothing, bash mode
does not see the plugin's `bin/`, and the README's kref section has to route users through the
symlink instead.

## Then

Run the four checks CI runs, from the checkout:

```
bash tests/run-tests.sh
shellcheck -S warning scripts/*.sh tests/*.sh
claude plugin validate --strict .
claude plugin tag --dry-run --force .
```

## Record

| Date | Katharsis | Claude Code | Result |
|---|---|---|---|
| 2026-10-25 | 0.11.0, `71d3c1e` plus the version bump | 2.1.310 | Interactive session started with `--plugin-dir` on the release branch and `--permission-mode default`. `/katharsis:setup` reported the routing entry already present and added the artifact script's. Symlink (the release checkout), active marker, stamp (`diagnosis`, empty third field), consumed state, 1 ledger item from turn 2 listed by `! kref`, and that turn answered with "Logged.". The one miss was the `/katharsis:setup` turn, run in the same session before turn 1; the three turns of the check had none. Turn 2 recorded a truncated read, because the model sent the guidance script's output to `/dev/null`. Permission row passed in a new session: the routing script sent alone with `status-and-resume`, then with `diagnosis`, and `katharsis-artifact.sh detect` all ran without a prompt. The PATH row was not rerun, because no change since 0.10.0 touches it. |
| 2026-10-15 | 0.10.1, `96ba4fa` plus the version bump | 2.1.301 | Headless variant, run on `main` with the bump before the tag. Symlink, active marker, stamp (`diagnosis`, empty third field), consumed state, 0 misses, 1 ledger item listed by `kref`: turn 2 asked which hooks were meant, since the empty directory holds none. The PATH and permission rows were not rerun, because no change since 0.10.0 touches either. |
| 2026-10-15 | 0.10.0, installed from the marketplace | 2.1.301 | Permission row only, in an interactive session started with `--permission-mode default` under user settings whose allow list holds one Bash rule, the routing script's. Passed. The routing call sent alone with `status-and-resume`, then with `diagnosis` in a second session, and `<routing call> >/dev/null && echo ok` all ran without a prompt. A call that chained `echo ---; pwd; ls -la; ls -la .. \| head -30` onto the routing call raised a prompt whose one rule option allowed reading the parent directory, and `ls -la ..` sent alone raised a prompt with the same option. |
| 2026-10-15 | 0.10.0, `87ba02c` plus the version bump | 2.1.301 | Interactive session, run on `main` with the bump before the tag. `/katharsis:setup` reported the permission entry already present and named both styles. Symlink, active marker, stamp (`diagnosis`, empty third field), consumed state, 0 misses, 6 ledger items from turn 2 listed from a terminal by `CLAUDE_CODE_SESSION_ID=$SID <checkout>/bin/kref`, and the `! kref` turn answered with "Logged.". PATH row not passed as written: `! command -v kref` printed a personal `~/.local/bin/kref` link to a separate copy, which is the one the `! kref` turn ran, and `! type -a kref` listed the plugin's `bin/kref` later on the same PATH. Turn 1 recorded a truncated read, because the model sent the guidance script's output to `/dev/null`. Permission row untested: the session ran in auto mode, the screen showed its classifier allowing turn 1's routing call, and the transcript shows turns 1 and 2 chaining other commands onto that call. The row above records the permission row run on its own. |
| 2026-10-08 | 0.9.2, `b7e365f` plus the version bump | 2.1.295 | Headless variant, run on `main` with the bump before the tag. Symlink, active marker, stamp (`diagnosis`, empty third field), consumed state, 0 misses, 1 ledger item listed by `kref`: turn 2 asked which hooks were meant, since the empty directory holds none. The two bash-mode rows are not yet run. |
| 2026-10-06 | 0.9.1, `317ef0c` plus the version bump | 2.1.291 | Headless variant, run on `main` with the bump before the tag. Symlink, active marker, stamp (`diagnosis`, empty third field), consumed state, 0 misses, 4 ledger items listed by `kref`. The two bash-mode rows are not yet run. |
| 2026-10-05 | 0.9.0, `0b7e603` plus the version bump | 2.1.291 | Headless variant, run on `main` before the tag. Symlink, active marker, stamp (`diagnosis`, empty third field), consumed state, 0 misses, 3 ledger items listed by `kref`: turn 2 asked which hooks were meant, since the empty directory holds none. The two bash-mode rows are not yet run. |
| 2026-10-02 | 0.8.0, `4d7a006` | 2.1.287 | Headless variant, run on the release branch before the tag. Symlink, active marker, stamp (`diagnosis`, empty third field), consumed state, 0 misses, 5 ledger items listed by `kref`. The two bash-mode rows are not yet run. |
| 2026-09-28 | 0.7.0, `1636fe0` | 2.1.284 | Headless variant, run on the release branch before the tag. Symlink, active marker, stamp (`diagnosis`, empty third field), consumed state, 0 misses, 3 ledger items listed by `kref`. The two bash-mode rows are not yet run. |
| 2026-09-25 | 0.6.0, `fc5b372` | 2.1.283 | Headless variant, run on the release branch before the tag. Symlink, active marker, stamp (`diagnosis`, empty third field), consumed state, 0 misses, 1 ledger item listed by `kref`: turn 2 asked which hooks were meant, since the empty directory holds none. The two bash-mode rows are not yet run. |
| 2026-09-25 | 0.5.0, `e5fad13` | 2.1.282 | Headless variant, run on the release branch before the tag. Symlink, active marker, stamp (`diagnosis`, empty third field), consumed state, 0 misses, 6 ledger items listed by `kref`. The two bash-mode rows are not yet run. |
| 2026-09-22 | 0.4.0, `240d6c7` | 2.1.280 | Headless variant, run on the release branch before the tag. Symlink, active marker, stamp (`diagnosis`, empty third field), consumed state, 0 misses, 7 ledger items listed by `kref`. The two bash-mode rows are not yet run. |
| 2026-09-04 | 0.3.0, `b38da48` | 2.1.261 | Headless variant, run after the tag. Symlink, active marker, stamp (`diagnosis`, empty third field), consumed state, 0 misses, 6 ledger items listed by `kref`. The two bash-mode rows are not yet run. |
