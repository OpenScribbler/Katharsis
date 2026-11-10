// Tests for hooks/session.ts, run by `claude plugin test .`. The cases are
// the title's cleanup and schedule, the release read from the manifests, and
// the record's changes on a prompt and at Stop.

import { describe, expect, test } from 'claude-code/testing';
import type { SessionRecord } from '../hooks/ledger.ts';
import { cleanTitle, releaseOf, touched, wantsTitle, withTranscript } from '../hooks/session.ts';

const REC: SessionRecord = { id: 's1', cwd: '/w', started: 't0', updated: 't0', katharsis: [{ version: '0.5.0' }] };

describe('cleanTitle', () => {
  test('keeps the first line without quotes, markdown or a closing period', () => {
    expect(cleanTitle('\n"Researching the Katharsis CLI."\nmore')).toBe('Researching the Katharsis CLI');
    expect(cleanTitle('**Fixing the drawer band**')).toBe('Fixing the drawer band');
  });

  test('refuses an empty reply and one past 8 words', () => {
    expect(cleanTitle('  \n')).toBe('');
    expect(cleanTitle('one two three four five six seven eight nine')).toBe('');
  });
});

describe('wantsTitle', () => {
  test('from turn 3 until a title lands, then every 15 turns', () => {
    expect([2, 3, 4].map((t) => wantsTitle(REC, t))).toEqual([false, true, true]);
    const titled = { ...REC, title: 'Doing X' };
    expect([3, 4, 17, 18, 33].map((t) => wantsTitle(titled, t))).toEqual([true, false, false, true, true]);
  });
});

describe('releaseOf', () => {
  const installed = JSON.stringify({
    version: 2,
    plugins: { 'katharsis@x': [{ installPath: '/cache/k/0.5.0', gitCommitSha: 'abc123' }] },
  });

  test('the version, plus the commit of the install at this root', () => {
    expect(releaseOf('/cache/k/0.5.0', '{"version":"0.5.0"}', installed)).toEqual({ version: '0.5.0', commit: 'abc123' });
  });

  test('a checkout outside the install records the version alone', () => {
    expect(releaseOf('/src/k', '{"version":"0.6.0"}', installed)).toEqual({ version: '0.6.0' });
    expect(releaseOf('/src/k', '{"version":"0.6.0"}', null)).toEqual({ version: '0.6.0' });
  });

  test('no readable version gives no release', () => {
    expect(releaseOf('/src/k', null, installed)).toBe(null);
    expect(releaseOf('/src/k', '{bad', installed)).toBe(null);
  });
});

describe('touched', () => {
  const f = { id: 's1', now: 't1', cwd: '/w', branch: 'main', parent: '', release: { version: '0.5.0' } };

  test('a new record takes every field', () => {
    expect(touched(null, f)).toEqual({ id: 's1', cwd: '/w', branch: 'main', started: 't1', updated: 't1', katharsis: [{ version: '0.5.0' }] });
  });

  test('a later prompt moves updated and keeps the rest', () => {
    const rec = touched(REC, { ...f, now: 't2', cwd: '', branch: '' });
    expect(rec).toEqual({ ...REC, updated: 't2' });
  });

  test('a handoff parent is recorded when the chain link appears', () => {
    expect(touched(REC, { ...f, parent: 'p0' }).parent).toBe('p0');
  });

  test('a reinstall adds a release entry, and the same release adds none', () => {
    const again = touched(REC, f);
    expect(again.katharsis).toEqual([{ version: '0.5.0' }]);
    const moved = touched(REC, { ...f, release: { version: '0.5.1', commit: 'def' } });
    expect(moved.katharsis).toEqual([{ version: '0.5.0' }, { version: '0.5.1', commit: 'def' }]);
    expect(REC.katharsis.length).toBe(1);
  });
});

describe('withTranscript', () => {
  test('records the path, and marks it seen once the file exists', () => {
    const unseen = withTranscript(REC, '/p/s1.jsonl', false);
    expect(unseen).toEqual({ ...REC, transcript: '/p/s1.jsonl' });
    expect(withTranscript(unseen as SessionRecord, '/p/s1.jsonl', true)).toEqual({ ...REC, transcript: '/p/s1.jsonl', transcriptSeen: true });
  });

  test('a seen transcript stays seen after cleanup deletes it, with no rewrite', () => {
    const seen = { ...REC, transcript: '/p/s1.jsonl', transcriptSeen: true };
    expect(withTranscript(seen, '/p/s1.jsonl', false)).toBe(null);
  });
});
