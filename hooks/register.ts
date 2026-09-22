// register.ts: the Katharsis hooks module. It runs where Claude Code loads
// function hooks (CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 on build 2.1.278; the
// surface is early access) and takes over one job from the classic hooks: the
// per-turn reminder that scripts/turn-reminder.sh emits at UserPromptSubmit.
// Everything else stays a command hook in hooks.json. Both kinds load from the
// same manifest, so with the flag off nothing here runs and the script does
// the whole job as before.
//
// The script's first line, "<style> output style is active", is not emitted
// here: the engine attaches that same sentence itself on every turn of a
// custom style (an `output_style` attachment, seen on 2.1.278 with the flag
// off as well as on), so a second copy only costs the model a repeated line.
//
// Two things the script cannot know, the module reads from the engine:
//
// - Which output style is active. The script parses three settings files by
//   regex in the order /config writes them, and cannot see a `--settings`
//   file or a policy. `$.settings.read()` answers the merge the engine runs
//   under, so the module agrees with the system prompt by construction.
// - Whether the user typed this turn. The script sniffs the prompt for the
//   markers a task notification, a bash-mode result, or a compaction summary
//   carry. `e.origin.kind` is the engine's own stamp for the first two and for
//   every delivery a peer session, a scheduled task, or a plugin makes; the
//   text markers stay for a skill load and a compaction resume, which arrive
//   from the composer.
//
// Handoff to the script: session.start sets KATHARSIS_HOOKS_MODULE in the
// process environment, which every command hook started afterwards inherits,
// and turn-reminder.sh exits at once when it is set. A module that fails to
// load never sets it. A hook that throws mid-turn clears it in its .catch
// handler and passes the prompt through, so the script is back on the next
// turn and no turn goes without a reminder for longer than the one that
// broke.
//
// State stays where the Stop hooks and kref read it: the data directory,
// ~/.claude/katharsis-data (KATHARSIS_DATA overrides it for tests), holding
// .active-<sid>, .exchange-state-<sid>, .exchange-last-<sid> and
// ledger/chains/<sid>, in the formats the scripts write.

import type { Register } from 'claude-code';

const KATHARSIS_STYLES = new Set([
  'Katharsis',
  'katharsis:Katharsis',
  'Katharsis coding',
  'katharsis:Katharsis coding',
]);

// Origins where a person typed the text, at a terminal, a bridge client, or
// the -p command line. Every other origin is a turn nobody typed.
const TYPED_ORIGINS = new Set(['composer', 'bridge', 'sdk']);

// Untyped turns the origin cannot tell apart from a typed one, in the order
// the script checks them.
const TEXT_MARKERS: ReadonlyArray<readonly [string, string]> = [
  ['<bash-input>', 'bash-input'],
  ['<task-notification>', 'task-notification'],
  ['<command-name>', 'skill'],
  ['Base directory for this skill', 'skill'],
  ['<local-command-stdout>', 'local-command'],
  ['This session is being continued from a previous conversation', 'compaction-resume'],
];

const CLASSIFY_LINES = [
  'Classify the user\'s message by exchange type and read the matching guidance file in ~/.claude/katharsis/styles/ before shaping the reply.',
  'Before sending the reply, re-read what the user actually asked and run that guidance file\'s Verification section against your draft.',
];

export function turnKind(text: string, originKind: string): string {
  if (!TYPED_ORIGINS.has(originKind)) return originKind;
  for (const [marker, kind] of TEXT_MARKERS) {
    if (text.includes(marker)) return kind;
  }
  return 'typed';
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.env.set('KATHARSIS_HOOKS_MODULE', '1');
    return next(e);
  });

  on('prompt.submit', async ($, e, next) => {
    const home = (await $.env.get('HOME')) ?? '';
    const data = (await $.env.get('KATHARSIS_DATA')) ?? `${home}/.claude/katharsis-data`;
    const sid = await $.session.id();
    const marker = `${data}/.active${sid ? `-${sid}` : ''}`;

    const settings = await $.settings.read();
    const style = typeof settings.outputStyle === 'string' ? settings.outputStyle : '';

    // A session that switched away from Katharsis drops its marker here, so
    // the Stop hooks go idle on the same turn.
    if (!KATHARSIS_STYLES.has(style)) {
      await $.process.run(['rm', '-f', marker]);
      return next(e);
    }

    await $.fs.write(marker, '');
    const lines: string[] = [];

    // The handoff chain link: a punt opening names a punt file, and that file
    // names the session that wrote it. Recording new -> parent makes the pair
    // one numbering space for kref and for the counter line below.
    const punt = e.text.match(/\/tmp\/punt-[A-Za-z0-9]+\.md/)?.[0];
    if (punt && sid && (await $.fs.exists(punt))) {
      const text = String(await $.fs.read(punt));
      const parent = text.match(/^Ledger parent:[ \t]*([A-Za-z0-9-]*)/m)?.[1];
      if (parent && parent !== sid) {
        await $.fs.write(`${data}/ledger/chains/${sid}`, `${parent}\n`);
      }
    }

    // A turn nobody typed inherits the last typed message's type. That needs
    // no judgment, so the module stamps it instead of asking the model to.
    const kind = turnKind(e.text, e.origin.kind);
    if (kind === 'typed') {
      lines.push(...CLASSIFY_LINES);
    } else {
      const last = `${data}/.exchange-last${sid ? `-${sid}` : ''}`;
      const stamp = `${data}/.exchange-state${sid ? `-${sid}` : ''}`;
      let primary = '';
      if (await $.fs.exists(last)) {
        primary = String(await $.fs.read(last)).split('\t')[1]?.trim() ?? '';
      }
      if (primary) {
        await $.fs.write(stamp, `${isoNow()}\t${primary}\tinherited\n`);
        lines.push(
          `Untyped turn (${kind}): it inherits \`${primary}\` from the last typed message, and the stamp is already made. Shape the reply to that type; do not run the script.`,
        );
      } else {
        lines.push(
          `Untyped turn (${kind}) with no earlier type in this session: treat it as \`status-and-resume\` and run the script with that type.`,
        );
      }
    }

    // One line of counters from the ledger, so numbering survives compaction
    // and handoffs. kref.sh is the one reader of the ledger's format.
    if (sid) {
      const counters = await $.process.run(['bash', `${$.plugin.root}/scripts/kref.sh`, '--next'], {
        env: { CLAUDE_CODE_SESSION_ID: sid, KATHARSIS_DATA: data },
      });
      const line = counters.stdout.trim();
      if (counters.exitCode === 0 && line) lines.push(line);
    }

    return next({ ...e, context: [...(e.context ?? []), lines.join('\n')] });
  }).catch(async ($, e, next) => {
    await $.env.set('KATHARSIS_HOOKS_MODULE', undefined);
    return next(e);
  });
};
