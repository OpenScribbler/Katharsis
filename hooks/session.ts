// session.ts: how the session record changes, katharsis-data/sessions/<id>.json.
// The engine loads one hooks module per plugin, takes one hook per event from
// it, and never lets $ cross an import, so the hooks that write the record
// live where their events already are: register.ts touches it on each
// prompt, and drawer.tsx adds the transcript at Stop and the title at
// turn.complete. This file holds what they share, with no engine calls, so
// the CLI can import it under node.
//
// The record is created on the session's first Katharsis prompt and touched
// on every one after, given the transcript's path at each Stop, and given a
// title by a fork of the conversation after turn 3 and every 15 turns after
// that. A session outside Katharsis gets no record.

import type { Release, SessionRecord } from './ledger.ts';

export const TITLE_PROMPT =
  'Name the work this session is doing in 3 to 6 words, as a gerund phrase such as "Researching the Katharsis CLI". Reply with the phrase alone: no classification, no punctuation at the end, no other text.';

// The fork's reply as a title, or '' when it is not one: the first line,
// without quotes, markdown or a closing period, at most 8 words.
export function cleanTitle(text: string): string {
  const line = text.split('\n').map((l) => l.trim()).find((l) => l) ?? '';
  const t = line.replace(/^[#>*_`"'\s]+|[*_`"'.\s]+$/g, '').trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  return words >= 1 && words <= 8 && t.length <= 80 ? t : '';
}

// Whether this turn asks the fork for a title: from turn 3 until one lands,
// then every 15 turns so the title follows the work when it drifts.
export function wantsTitle(rec: SessionRecord, turns: number): boolean {
  return turns >= 3 && (!rec.title || (turns - 3) % 15 === 0);
}

// The running plugin's version from its plugin.json, and the commit Claude
// Code installed it from when installed_plugins.json has an entry at this
// root. A --plugin-dir checkout has no entry, so it gets the version alone.
export function releaseOf(root: string, manifest: string | null, installed: string | null): Release | null {
  let version = '';
  try {
    version = String(JSON.parse(manifest ?? '{}').version ?? '');
  } catch {
    return null;
  }
  if (!version) return null;
  try {
    const plugins = JSON.parse(installed ?? '{}').plugins ?? {};
    const entries = Object.values(plugins).flat() as { installPath?: string; gitCommitSha?: string }[];
    const commit = entries.find((p) => p.installPath === root)?.gitCommitSha;
    if (commit) return { version, commit };
  } catch {
    // no install record to read the commit from
  }
  return { version };
}

// The record after a prompt: created when there was none, then the time, the
// handoff parent, and a new release entry when a reinstall changed the plugin
// mid-session. cwd and branch count only on creation.
export function touched(
  old: SessionRecord | null,
  f: { id: string; now: string; cwd: string; branch: string; parent: string; release: Release | null },
): SessionRecord {
  const rec: SessionRecord = old
    ? { ...old, katharsis: [...old.katharsis] }
    : { id: f.id, cwd: f.cwd, ...(f.branch ? { branch: f.branch } : {}), started: f.now, updated: f.now, katharsis: [] };
  rec.updated = f.now;
  if (f.parent) rec.parent = f.parent;
  const last = rec.katharsis[rec.katharsis.length - 1];
  if (f.release && (last?.version !== f.release.version || last?.commit !== f.release.commit)) rec.katharsis.push(f.release);
  return rec;
}

// The record after a Stop, or null when nothing changed. A path is marked
// seen once the file exists and stays seen after cleanup deletes it, so a
// session run with --no-session-persistence keeps a path never seen.
export function withTranscript(rec: SessionRecord, path: string, exists: boolean): SessionRecord | null {
  const seen = Boolean(rec.transcriptSeen) || exists;
  if (rec.transcript === path && Boolean(rec.transcriptSeen) === seen) return null;
  return { ...rec, transcript: path, ...(seen ? { transcriptSeen: true } : {}) };
}
