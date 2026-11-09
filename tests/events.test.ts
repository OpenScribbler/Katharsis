// The events the hooks module registers, run by `claude plugin test .`. An
// organization-managed account skips mod hooks on every classic.* event and on
// the events in SKIPPED for a plugin the person installed, so a hook there
// never runs and /plugin lists the plugin under Errors (issue #132). Each test
// registers the module against a stand-in for `on` that records the event every
// call passes, under every option the module reads, so the check sees the
// event as the engine would, an escape such as \x2e included. The engine
// refuses to load a module whose on() takes anything but a string literal, so
// a constant or a concatenation never registers at all.
// hooks/hooks.json names register.ts as the one module, which
// tests/test-plugin-manifest.sh checks, so a new module lands here too.

import { describe, expect, test } from 'claude-code/testing';
import type { On } from 'claude-code';
import { register } from '../hooks/register.ts';

const SKIPPED = new Set([
  'prompt.section',
  'prompt.context',
  'prompt.attachment',
  'prompt.compose',
  'skill.prompt',
  'attribution.text',
  'session.compact',
  'settings.read',
]);

// '*' reaches classic events, so it counts as one.
const skipped = (event: string) => event === '*' || event.startsWith('classic.') || SKIPPED.has(event);

function eventsOf(options: Record<string, unknown>): string[] {
  const events: string[] = [];
  const record = ((event: unknown) => {
    events.push(String(event));
    return { catch: () => undefined };
  }) as unknown as On;
  register(record, options as never);
  return events;
}

const OPTIONS: Record<string, unknown>[] = [
  {},
  { autonomy: 'standard', richness: 'sketch', motion: true, band: false },
  { autonomy: 'autonomous', richness: 'rich', motion: false, band: true },
];

describe('registered events', () => {
  for (const options of OPTIONS) {
    test(`none a managed account skips, with options ${JSON.stringify(options)}`, () => {
      const events = eventsOf(options);
      expect(events.filter(skipped)).toEqual([]);
      // The positive control: the stand-in sees the drawer's end-of-turn hook.
      expect(events.includes('turn.complete')).toBe(true);
    });
  }

  test('the check catches a skipped event however the call spells it', () => {
    const dot = '.';
    for (const event of ['classic.Stop', 'classic' + dot + 'Stop', 'classic\x2eStop', `classic.${'Stop'}`, '*', ...SKIPPED]) {
      expect(skipped(event)).toBe(true);
    }
    expect(skipped('turn.complete')).toBe(false);
  });
});
