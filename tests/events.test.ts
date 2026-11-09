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

// The list AGENTS.md publishes, in its order. tests/test-plugin-manifest.sh
// fails when the two differ, so an event dropped from either is caught.
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

// on() takes an event's name, '*', a glob over a namespace such as
// 'session.*', or a negation such as '!tool.describe' (Pattern in the mods
// API). '*' and every negation reach the classic events, and a glob reaches a
// skipped event when its namespace holds one.
const SKIPPED_NAMESPACES = new Set(['classic', ...[...SKIPPED].map((e) => e.split('.')[0])]);
const reachesClassic = (event: string) => event === '*' || event.startsWith('!') || event.startsWith('classic.');
const globReachesSkipped = (event: string) => event.endsWith('.*') && SKIPPED_NAMESPACES.has(event.slice(0, -2));
const skipped = (event: string) => reachesClassic(event) || SKIPPED.has(event) || globReachesSkipped(event);

function eventsOf(options: Record<string, unknown>): string[] {
  const events: string[] = [];
  const record = ((event: unknown) => {
    events.push(String(event));
    return { catch: () => undefined };
  }) as unknown as On;
  register(record, options as never);
  return events;
}

// Every combination of the options the module reads, each unset or set to
// each value plugin.json offers. tests/test-plugin-manifest.sh fails when
// plugin.json's options differ from these, so a new option or value lands here.
const VALUES: Record<string, unknown[]> = {
  autonomy: ['guided', 'standard', 'autonomous'],
  richness: ['text', 'sketch', 'rich'],
  motion: [true, false],
  band: [true, false],
};
const OPTIONS = Object.entries(VALUES).reduce<Record<string, unknown>[]>(
  (sets, [key, values]) => sets.flatMap((set) => [set, ...values.map((v) => ({ ...set, [key]: v }))]),
  [{}],
);

describe('registered events', () => {
  test('every combination of the options is registered', () => {
    expect(OPTIONS.length).toBe(4 * 4 * 3 * 3);
  });

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
    const caught = ['classic.Stop', 'classic' + dot + 'Stop', 'classic\x2eStop', `classic.${'Stop'}`, '*', 'classic.*', 'session.*', 'prompt.*', 'skill.*', 'attribution.*', 'settings.*', '!tool.describe', ...SKIPPED];
    for (const event of caught) expect([event, skipped(event)]).toEqual([event, true]);
    for (const event of ['turn.complete', 'ui.*', 'tool.call', 'prompt.submit']) expect([event, skipped(event)]).toEqual([event, false]);
  });
});
