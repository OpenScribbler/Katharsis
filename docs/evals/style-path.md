# The real-path check

A release ships nothing that has not run through the path a user gets: the plugin installed from
this repo, the style picked in `/config`, and a real Claude Code session under it. The test suites
run every script against a temporary directory and prove the scripts; this check proves the
wiring between them, which no suite can reach. Run it before every tag, and record the result in
the CHANGELOG entry for that release.

## Setup

1. Install the plugin from a checkout of the commit you are about to tag:

   ```
   claude --plugin-dir /path/to/katharsis
   ```

   or, for the marketplace path, `/plugin marketplace add` and `/plugin install` as the README
   shows.
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

## What to check

Every line below has to hold, with `DATA` as `~/.claude/katharsis-data` and `SID` as the session
ID.

| Check | Command | Expected |
|---|---|---|
| The symlink points at the plugin | `readlink ~/.claude/katharsis` | The plugin's directory |
| The reminder ran and marked the session active | `ls $DATA/.active-$SID` | Exists |
| The last typed turn was stamped | `cat $DATA/.exchange-last-$SID` | A line ending in `diagnosis` |
| The gate consumed each turn's stamp | `ls $DATA/.exchange-state-$SID` | Does not exist |
| No turn was counted as a miss | `grep -c "\"session_id\": \"$SID\"" $DATA/telemetry/gate-misses.jsonl` | 0 lines with status `missed`; the `! kref` turn may appear with status `inherited` |
| The ledger holds turn 2's items | `kref` inside the session, or `CLAUDE_CODE_SESSION_ID=$SID kref` from a terminal | Every coded item the reply showed, with its title |
| The plugin's `bin/` is on bash mode's PATH | `! command -v kref` | A path under the plugin directory |
| The permission entry took | The routing script's Bash call in turns 1 and 2 | No permission prompt |

The last two rows are the ones no suite covers. If `! command -v kref` prints nothing, bash mode
does not see the plugin's `bin/`, and the README's kref section has to route users through the
symlink instead.

## Then

Run the three checks CI runs, from the checkout:

```
bash tests/run-tests.sh
shellcheck -S warning scripts/*.sh tests/*.sh
claude plugin validate --strict .
```

## Record

| Date | Katharsis | Claude Code | Result |
|---|---|---|---|
| | | | |
