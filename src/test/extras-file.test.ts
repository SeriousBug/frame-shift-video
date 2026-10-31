import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { extraFilePath } from '../../server/extras-state';
import { byteRange, discsExtrasFileHandler } from '../../server/handlers/discs';

let dir: string;
let outside: string;
const realEnv = process.env.DISC_RIP_DIR;
const GOOD = '_converted/Duma (2005)/Trailers/Trailer 01 (2 min).mkv';
const BYTES = '0123456789';

async function write(relative: string, text = BYTES) {
  const file = path.join(dir, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
}

const ask = (query: string, headers: Record<string, string> = {}) =>
  discsExtrasFileHandler(
    new Request(`http://x/api/discs/extras/file?${query}`, { headers }),
    {},
  );
const get = (file: string, headers?: Record<string, string>) =>
  ask(new URLSearchParams({ path: file }).toString(), headers);

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'extras-file-'));
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'extras-outside-'));
  process.env.DISC_RIP_DIR = dir;
  await write('_converted/Duma (2005)/Duma (2005).mkv');
  await write(GOOD);
});

afterEach(async () => {
  if (realEnv === undefined) delete process.env.DISC_RIP_DIR;
  else process.env.DISC_RIP_DIR = realEnv;
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rm(outside, { recursive: true, force: true });
});

describe('which files can be watched', () => {
  test('an extra of a movie can', async () => {
    expect(await extraFilePath(dir, GOOD)).toBe(
      path.join(await fs.realpath(dir), GOOD),
    );
  });

  test('the movie itself, folders, other files and escapes cannot', async () => {
    await write('_converted/Duma (2005)/Trailers/notes.txt');
    await write('secret.mkv');
    for (const bad of [
      '_converted/Duma (2005)/Duma (2005).mkv',
      '_converted/Duma (2005)/Trailers',
      '_converted/Duma (2005)/Trailers/notes.txt',
      '_converted/Duma (2005)/Trailers/../../../secret.mkv',
      '_converted/../Trailers/x.mkv',
      '../etc/Trailers/x.mkv',
      '/etc/passwd',
      '_converted/_hidden/Trailers/Trailer 01 (2 min).mkv',
      'secret.mkv',
      '',
    ]) {
      await expect(extraFilePath(dir, bad)).rejects.toThrow();
    }
  });

  test('a link that leads out of the library cannot', async () => {
    await fs.writeFile(path.join(outside, 'outside.mkv'), 'leak');
    await fs.symlink(
      path.join(outside, 'outside.mkv'),
      path.join(dir, '_converted/Duma (2005)/Trailers/Linked.mkv'),
    );
    await expect(
      extraFilePath(dir, '_converted/Duma (2005)/Trailers/Linked.mkv'),
    ).rejects.toThrow('not an extra of a movie');
    const response = await get('_converted/Duma (2005)/Trailers/Linked.mkv');
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('leak');
  });

  test('a file that is gone is not found', async () => {
    const response = await get('_converted/Duma (2005)/Trailers/Gone.mkv');
    expect(response.status).toBe(404);
  });
});

describe('byteRange', () => {
  test('reads the forms a player sends', () => {
    expect(byteRange(null, 10)).toBeNull();
    expect(byteRange('bytes=0-3', 10)).toEqual({ start: 0, end: 3 });
    expect(byteRange('bytes=4-', 10)).toEqual({ start: 4, end: 9 });
    expect(byteRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
    expect(byteRange('bytes=5-999', 10)).toEqual({ start: 5, end: 9 });
  });

  test('refuses what cannot be met', () => {
    for (const bad of [
      'bytes=10-',
      'bytes=7-3',
      'bytes=-',
      'bytes=-0',
      'x=1-2',
      'bytes=1-2,4-5',
    ]) {
      expect(byteRange(bad, 10)).toBe('bad');
    }
  });
});

describe('the route', () => {
  test('sends the whole file with its type, size and the sign that it can be seeked', async () => {
    const response = await get(GOOD);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('video/x-matroska');
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Content-Length')).toBe('10');
    expect(response.headers.get('Content-Disposition')).toStartWith('inline');
    expect(await response.text()).toBe(BYTES);
  });

  test('sends just the part asked for', async () => {
    const response = await get(GOOD, { Range: 'bytes=2-5' });
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(response.headers.get('Content-Length')).toBe('4');
    expect(await response.text()).toBe('2345');
  });

  test('says when the part asked for is past the end', async () => {
    const response = await get(GOOD, { Range: 'bytes=50-' });
    expect(response.status).toBe(416);
    expect(response.headers.get('Content-Range')).toBe('bytes */10');
  });

  test('download makes it a save, not a play', async () => {
    const response = await ask(
      new URLSearchParams({ path: GOOD, download: '1' }).toString(),
    );
    expect(response.headers.get('Content-Disposition')).toStartWith(
      "attachment; filename*=UTF-8''Trailer%2001%20(2%20min).mkv",
    );
  });

  test('needs a path', async () => {
    expect((await ask('')).status).toBe(400);
  });
});
