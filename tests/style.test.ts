// Tests for hooks/style.ts, run by `claude plugin test .`. The cases are a
// style file's name as Claude Code 2.1.323 reads it, the walk over the
// output-styles folders, how an outputStyle value stands for Katharsis given
// the user's own style files, and the qualified name each spelling means.

import { describe, expect, test } from 'claude-code/testing';
import { ownStyleNames, qualifiedFor, styleName, styleState, type StyleFs } from '../hooks/style.ts';

describe('styleName', () => {
  test('the frontmatter name without quotes or a trailing comment, else the file name', () => {
    const names = [
      styleName('a.md', '---\nname: Katharsis # my copy\n---\nbody'),
      styleName('a.md', "---\r\nname: 'Katharsis coding'\r\n---\r\n"),
      styleName('a.md', '---\nname: "Katharsis # kept"\n---\n'),
      styleName('a.md', '---\nname: Katharsis\ndescription: [unclosed\n---\n'),
      styleName('Katharsis.md', '# no frontmatter\nname: Other\n'),
      styleName('Katharsis.md', '---\ndescription: x\n---\n'),
      styleName('Katharsis.md', '---\nname: [Katharsis\n---\n'),
    ];
    expect(names).toEqual(['Katharsis', 'Katharsis coding', 'Katharsis # kept', 'Katharsis', 'Katharsis', 'Katharsis', '[Katharsis']);
  });
});

// A folder tree in memory: a path ending in / is a folder, a key in links
// is a linked entry that resolves to its value.
type Tree = { files: Record<string, string>; links: Record<string, string> };

// Where a path lands once each link on it is followed.
function realOf(t: Tree, p: string): string {
  const hit = Object.entries(t.links).find(([from]) => p === from || p.startsWith(`${from}/`));
  return hit ? realOf(t, hit[1] + p.slice(hit[0].length)) : p;
}

// The entries a folder holds: the files, folders, and links under where it
// lands, so a link inside a linked folder shows there too.
function entriesOf(t: Tree, dir: string) {
  const d = `${realOf(t, dir)}/`;
  const names = new Map<string, { name: string; kind: string; isLink: boolean }>();
  for (const rest of Object.keys(t.files).filter((k) => k.startsWith(d)).map((k) => k.slice(d.length))) {
    const name = rest.split('/')[0] ?? '';
    names.set(name, { name, kind: rest.includes('/') ? 'dir' : 'file', isLink: false });
  }
  const own = Object.keys(t.links).filter((from) => from.startsWith(d) && !from.slice(d.length).includes('/'));
  for (const name of own.map((from) => from.slice(d.length))) names.set(name, { name, kind: 'other', isLink: true });
  return [...names.values()];
}

function statOf(t: Tree, p: string) {
  const r = realOf(t, p);
  if (r in t.files) return { kind: 'file', realPath: r };
  return Object.keys(t.files).some((k) => k.startsWith(`${r}/`)) ? { kind: 'dir', realPath: r } : null;
}

function memoryFs(files: Record<string, string>, links: Record<string, string> = {}): StyleFs {
  const t = { files, links };
  return {
    list: async (dir) => entriesOf(t, dir),
    read: async (p) => files[realOf(t, p)] ?? null,
    stat: async (p) => statOf(t, p),
  };
}

describe('ownStyleNames', () => {
  test('every .md file under each folder, subfolders and linked folders included', async () => {
    const fs = memoryFs(
      {
        '/u/os/a.md': '---\nname: A\n---\n',
        '/u/os/deep/er/b.md': '---\nname: B\n---\n',
        '/u/os/c.MD': '---\nname: C\n---\n',
        '/elsewhere/d.md': '---\nname: D\n---\n',
        '/p/os/e.md': '# E\n',
      },
      { '/u/os/linked': '/elsewhere' },
    );
    expect([...(await ownStyleNames(fs, ['/u/os', '/p/os', '/missing']))].sort()).toEqual(['A', 'B', 'D', 'e']);
  });

  test('a link back to a folder above it is walked once', async () => {
    const fs = memoryFs({ '/u/os/a.md': '---\nname: A\n---\n' }, { '/u/os/loop': '/u/os' });
    expect([...(await ownStyleNames(fs, ['/u/os']))]).toEqual(['A']);
  });

  test('a link whose landing place the engine cannot name is not followed', async () => {
    const fs = memoryFs({ '/elsewhere/d.md': '---\nname: D\n---\n' }, { '/u/os/linked': '/elsewhere' });
    const blind: StyleFs = { ...fs, stat: async (p) => {
      const st = await fs.stat(p);
      return st && { kind: st.kind };
    } };
    expect({ blind: [...(await ownStyleNames(blind, ['/u/os']))], seen: [...(await ownStyleNames(fs, ['/u/os']))] }).toEqual({ blind: [], seen: ['D'] });
  });

  test('a folder that fails to list counts as empty', async () => {
    const broken: StyleFs = { list: async () => Promise.reject(new Error('EACCES')), read: async () => null, stat: async () => null };
    expect([...(await ownStyleNames(broken, ['/u/os']))]).toEqual([]);
  });
});

describe('styleState', () => {
  test('qualified names are on and other styles off, without looking for style files', async () => {
    const never = async (): Promise<boolean> => {
      throw new Error('looked for style files');
    };
    const states = await Promise.all(['katharsis:Katharsis', 'katharsis:Katharsis coding', 'Concise', undefined, 3].map((s) => styleState(s, never)));
    expect(states).toEqual(['on', 'on', 'off', 'off', 'off']);
  });

  test('any other spelling of a Katharsis name is on only when a style file of the user\'s own goes by exactly it', async () => {
    const asked: string[] = [];
    const own = (names: string[]) => async (n: string) => {
      asked.push(n);
      return names.includes(n);
    };
    const states = [
      await styleState('Katharsis', own([])),
      await styleState('Katharsis', own(['Katharsis'])),
      await styleState('Katharsis', own(['Katharsis coding'])),
      await styleState('Katharsis coding', own(['Katharsis coding'])),
      await styleState(' katharsis', own(['Katharsis'])),
      await styleState('katharsis:katharsis', own(['katharsis:katharsis'])),
    ];
    expect({ states, asked }).toEqual({
      states: ['unloaded', 'on', 'unloaded', 'on', 'unloaded', 'on'],
      asked: ['Katharsis', 'Katharsis', 'Katharsis', 'Katharsis coding', ' katharsis', 'katharsis:katharsis'],
    });
  });
});

describe('qualifiedFor', () => {
  test('each spelling of a Katharsis name means its qualified style, and any other value none', () => {
    const named = ['Katharsis', ' katharsis', 'katharsis:katharsis coding', 'Katharsis coding', 'Concise', 'Katharsis2'].map(qualifiedFor);
    expect(named).toEqual(['katharsis:Katharsis', 'katharsis:Katharsis', 'katharsis:Katharsis coding', 'katharsis:Katharsis coding', undefined, undefined]);
  });
});
