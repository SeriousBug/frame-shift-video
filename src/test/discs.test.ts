import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  cleanName,
  cleanNumber,
  commandLines,
  commandResult,
  dismissAttention,
  readDiscsState,
  sendCommand,
  setEject,
  setNext,
} from '../../server/disc-state';

let dir: string;

async function write(relative: string, text: string) {
  const file = path.join(dir, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'discs-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('cleanName', () => {
  test('keeps what Plex names use', () => {
    expect(cleanName('The Fairly OddParents (2001) {tmdb-1}')).toBe(
      'The Fairly OddParents (2001) {tmdb-1}',
    );
    expect(cleanName("Don't Stop")).toBe("Don't Stop");
  });

  test('drops shell and path characters and squeezes spaces', () => {
    expect(cleanName('$(touch x) ; echo  hi')).toBe('(touch x) echo hi');
    expect(cleanName('../etc/passwd')).toBe('..etcpasswd');
    expect(cleanName('  Two   Spaces  ')).toBe('Two Spaces');
  });

  test('refuses an empty or non-text name', () => {
    expect(() => cleanName('///')).toThrow();
    expect(() => cleanName(5)).toThrow();
    expect(() => cleanName('x'.repeat(101))).toThrow();
  });
});

describe('cleanNumber', () => {
  test('accepts whole numbers, as text or number', () => {
    expect(cleanNumber(2, 'The season')).toBe(2);
    expect(cleanNumber('07', 'The season')).toBe(7);
  });

  test('refuses everything else', () => {
    for (const bad of [0, -1, 1.5, 1000, 'abc', '', null, undefined]) {
      expect(() => cleanNumber(bad, 'The season')).toThrow();
    }
  });
});

describe('readDiscsState', () => {
  test('a missing folder is reported as not available', async () => {
    const state = await readDiscsState(path.join(dir, 'nope'));
    expect(state.available).toBe(false);
    expect(state.attention).toEqual([]);
  });

  test('an empty folder has nothing in it', async () => {
    const state = await readDiscsState(dir);
    expect(state).toEqual({
      available: true,
      eject: false,
      drive: null,
      run: null,
      next: null,
      attention: [],
      working: [],
      parked: [],
      needsYear: [],
      finishedCount: 0,
    });
  });

  test('reads the drive, and says when the helper has gone quiet', async () => {
    await write('_status/drive.txt', 'media=1\nlabel=ANDRE\nupdated=1000\n');
    const fresh = await readDiscsState(dir, 1030);
    expect(fresh.drive).toEqual({
      media: true,
      label: 'ANDRE',
      updated: 1000,
      alive: true,
    });
    const stale = await readDiscsState(dir, 1200);
    expect(stale.drive?.alive).toBe(false);
  });

  test('reads what the ripper is doing', async () => {
    await write(
      '_status/run.txt',
      'state=running\nname=Andre\nstep=Copying the disc\nupdated=5\n',
    );
    const state = await readDiscsState(dir);
    expect(state.run).toEqual({
      state: 'running',
      name: 'Andre',
      step: 'Copying the disc',
      updated: 5,
    });
  });

  test('reads the notes, the logs and the parked discs', async () => {
    await write('ATTENTION - Andre.txt', 'one\ntwo\n');
    await write('ATTENTION - Other.txt', 'three\n');
    await write('notes.txt', 'not a note');
    await write(
      '_converting/Andre/STATUS.txt',
      Array.from({ length: 9 }, (_, i) => `line ${i + 1}`).join('\n') + '\n',
    );
    await write('_converting/Andre/submitted', '');
    await write('_converting/.lock', '');
    await write('_images/Showdisc/Showdisc.iso', '');
    const state = await readDiscsState(dir);
    expect(state.attention.map((note) => note.name)).toEqual([
      'Andre',
      'Other',
    ]);
    expect(state.attention[0]?.lines).toEqual(['one', 'two']);
    expect(state.working).toHaveLength(1);
    expect(state.working[0]?.lines).toEqual([
      'line 4',
      'line 5',
      'line 6',
      'line 7',
      'line 8',
      'line 9',
    ]);
    expect(state.working[0]?.queued).toBe(true);
    expect(state.parked).toEqual(['Showdisc']);
  });

  test('lists finished folders that have no year', async () => {
    await write('Stellaluna/Stellaluna.mkv', '');
    await write('Andre (2020)/Andre (2020).mkv', '');
    await write('_images/x/y', '');
    const state = await readDiscsState(dir);
    expect(state.needsYear).toEqual(['Stellaluna']);
    expect(state.finishedCount).toBe(2);
  });
});

describe('settings the page writes', () => {
  test('eject is read back as written', async () => {
    await setEject(dir, true);
    expect((await readDiscsState(dir)).eject).toBe(true);
    await setEject(dir, false);
    expect((await readDiscsState(dir)).eject).toBe(false);
  });

  test('a note for a TV disc is written for the ripper to read', async () => {
    await setNext(dir, {
      mode: 'tv',
      show: 'Show (2010)',
      season: 3,
      episode: 7,
    });
    const text = await fs.readFile(path.join(dir, '_settings', 'next'), 'utf8');
    expect(text).toBe('mode=tv\nshow=Show (2010)\nseason=3\nepisode=7\n');
    expect((await readDiscsState(dir)).next).toEqual({
      mode: 'tv',
      show: 'Show (2010)',
      season: 3,
      episode: 7,
    });
  });

  test('a note for a movie, with and without a name', async () => {
    await setNext(dir, { mode: 'movie', name: 'Stellaluna (1996)' });
    expect((await readDiscsState(dir)).next).toEqual({
      mode: 'movie',
      name: 'Stellaluna (1996)',
    });
    await setNext(dir, { mode: 'movie' });
    expect((await readDiscsState(dir)).next).toEqual({ mode: 'movie' });
  });

  test('a note can be taken back', async () => {
    await setNext(dir, { mode: 'movie' });
    await setNext(dir, null);
    expect((await readDiscsState(dir)).next).toBeNull();
    await setNext(dir, null);
  });

  test('a note with a bad value is refused and nothing is written', async () => {
    await expect(
      setNext(dir, { mode: 'tv', show: 'Show', season: 0 }),
    ).rejects.toThrow();
    await expect(setNext(dir, { mode: 'sideways' } as never)).rejects.toThrow();
    expect((await readDiscsState(dir)).next).toBeNull();
  });
});

describe('dismissAttention', () => {
  test('removes a note the ripper left', async () => {
    await write('ATTENTION - Andre.txt', 'x\n');
    await dismissAttention(dir, 'ATTENTION - Andre.txt');
    expect((await readDiscsState(dir)).attention).toEqual([]);
  });

  test('refuses anything that is not a listed note', async () => {
    await write('Stellaluna/Stellaluna.mkv', '');
    await write('secret.txt', 'keep');
    await expect(dismissAttention(dir, 'secret.txt')).rejects.toThrow();
    await expect(dismissAttention(dir, '../secret.txt')).rejects.toThrow();
    await expect(
      dismissAttention(dir, 'ATTENTION - ../../secret.txt'),
    ).rejects.toThrow();
    expect(await fs.readFile(path.join(dir, 'secret.txt'), 'utf8')).toBe(
      'keep',
    );
  });
});

describe('commands', () => {
  test('each request becomes the lines the host reads', () => {
    expect(commandLines({ action: 'eject' })).toEqual(['action=eject']);
    expect(
      commandLines({ action: 'rip', mode: 'movie', name: 'Stellaluna (1996)' }),
    ).toEqual(['action=rip', 'mode=movie', 'name=Stellaluna (1996)']);
    expect(
      commandLines({
        action: 'rip',
        mode: 'tv',
        show: 'Show (2001)',
        season: 2,
        episode: 5,
        image: 'Showdisc',
      }),
    ).toEqual([
      'action=rip',
      'image=Showdisc',
      'mode=tv',
      'show=Show (2001)',
      'season=2',
      'episode=5',
    ]);
    expect(
      commandLines({
        action: 'rename',
        old: 'Stellaluna',
        new: 'Stellaluna (1996)',
      }),
    ).toEqual(['action=rename', 'old=Stellaluna', 'new=Stellaluna (1996)']);
  });

  test('the first episode defaults to 1', () => {
    expect(
      commandLines({ action: 'rip', mode: 'tv', show: 'Show', season: 1 }),
    ).toContain('episode=1');
  });

  test('bad requests are refused', () => {
    expect(() => commandLines({ action: 'format' } as never)).toThrow();
    expect(() =>
      commandLines({ action: 'rip', mode: 'tv', show: 'Show', season: 0 }),
    ).toThrow();
    expect(() =>
      commandLines({ action: 'rip', mode: 'sideways' } as never),
    ).toThrow();
    expect(() =>
      commandLines({ action: 'rip', mode: 'movie', image: '../etc' }),
    ).toThrow();
    expect(() =>
      commandLines({ action: 'rename', old: '../x', new: 'Y (2000)' }),
    ).toThrow();
    expect(() =>
      commandLines({ action: 'rename', old: 'X', new: '///' }),
    ).toThrow();
  });

  test('a newline in a value cannot add a line of its own', () => {
    const lines = commandLines({
      action: 'rip',
      mode: 'movie',
      name: 'Name\naction=eject',
    });
    expect(lines).toEqual(['action=rip', 'mode=movie', 'name=Nameactioneject']);
  });

  test('a request is written whole, under its id, and read back when answered', async () => {
    const id = await sendCommand(dir, { action: 'eject' });
    expect(id).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(
      await fs.readFile(path.join(dir, '_commands', `${id}.cmd`), 'utf8'),
    ).toBe('action=eject\n');
    expect(await fs.readdir(path.join(dir, '_commands'))).toEqual([
      `${id}.cmd`,
    ]);

    expect(await commandResult(dir, id)).toEqual({ done: false });
    await write(`_commands/done/${id}.result`, 'ok\nEjected.\n');
    expect(await commandResult(dir, id)).toEqual({
      done: true,
      ok: true,
      message: 'Ejected.',
    });
    await write(`_commands/done/${id}.result`, 'error\nThe ripper is busy.\n');
    expect(await commandResult(dir, id)).toEqual({
      done: true,
      ok: false,
      message: 'The ripper is busy.',
    });
  });

  test('an id with a path in it is refused', async () => {
    await expect(commandResult(dir, '../x')).rejects.toThrow();
  });
});
