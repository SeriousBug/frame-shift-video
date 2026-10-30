import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  cleanExtraName,
  readExtras,
  renameExtra,
} from '../../server/extras-state';

let dir: string;

async function write(relative: string, text = 'video') {
  const file = path.join(dir, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
}

const exists = (relative: string) =>
  fs.access(path.join(dir, relative)).then(
    () => true,
    () => false,
  );

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'extras-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('readExtras', () => {
  test('lists the extras of finished movies, in their folders', async () => {
    await write('_converted/Duma (2005)/Duma (2005).mkv');
    await write('_converted/Duma (2005)/Trailers/Trailer 01 (2 min).mkv');
    await write('_converted/Duma (2005)/Featurettes/The Making of Duma.mkv');
    const movies = await readExtras(dir);
    expect(movies).toHaveLength(1);
    expect(movies[0]?.movie).toBe('Duma (2005)');
    expect(movies[0]?.items).toEqual([
      {
        path: '_converted/Duma (2005)/Trailers/Trailer 01 (2 min).mkv',
        folder: 'Trailers',
        name: 'Trailer 01 (2 min)',
        unnamed: true,
      },
      {
        path: '_converted/Duma (2005)/Featurettes/The Making of Duma.mkv',
        folder: 'Featurettes',
        name: 'The Making of Duma',
        unnamed: false,
      },
    ]);
  });

  test('the movie itself, other files and internal folders are not extras', async () => {
    await write('_converted/Duma (2005)/Duma (2005).mkv');
    await write('_converted/Duma (2005)/Trailers/notes.txt');
    await write('_converted/Duma (2005)/Random/Thing.mkv');
    await write('_converting/Work/Trailers/Trailer 01 (2 min).mkv');
    await write('_subs/before/x/Trailers/a.mkv');
    expect(await readExtras(dir)).toEqual([]);
  });

  test('a movie filed in the DVDs folder itself is listed too', async () => {
    await write('Old Movie (1999)/Other/Extra 01 (50 min).mkv');
    const movies = await readExtras(dir);
    expect(movies[0]?.items[0]?.path).toBe(
      'Old Movie (1999)/Other/Extra 01 (50 min).mkv',
    );
  });

  test('movies with extras still to be named come first', async () => {
    await write('_converted/A Movie/Trailers/Real Name.mkv');
    await write('_converted/Z Movie/Trailers/Trailer 01 (1 min).mkv');
    const movies = await readExtras(dir);
    expect(movies.map((m) => m.movie)).toEqual(['Z Movie', 'A Movie']);
  });
});

describe('cleanExtraName', () => {
  test('keeps plain names, squeezes spaces', () => {
    expect(cleanExtraName("  The  Making of Duma's Story ")).toBe(
      "The Making of Duma's Story",
    );
  });

  test('refuses what is not a plain name', () => {
    for (const bad of [
      '',
      '   ',
      '../x',
      'a/b',
      'a\\b',
      'a:b',
      'what?',
      '.hidden',
      'x'.repeat(151),
      'bell\u0007name',
      5,
      null,
    ]) {
      expect(() => cleanExtraName(bad)).toThrow();
    }
  });
});

describe('renameExtra', () => {
  const trailer = '_converted/Duma (2005)/Trailers/Trailer 01 (2 min).mkv';
  beforeEach(async () => {
    await write(trailer, 'one');
    await write('_converted/Duma (2005)/Duma (2005).mkv', 'movie');
  });

  test('gives the extra its name and keeps its file ending', async () => {
    const now = await renameExtra(dir, trailer, 'Theatrical Trailer');
    expect(now).toBe('_converted/Duma (2005)/Trailers/Theatrical Trailer.mkv');
    expect(await exists(trailer)).toBe(false);
    expect(await fs.readFile(path.join(dir, now), 'utf8')).toBe('one');
  });

  test('moves it to another extras folder when asked', async () => {
    const now = await renameExtra(
      dir,
      trailer,
      'Interview with the Director',
      'Interviews',
    );
    expect(now).toBe(
      '_converted/Duma (2005)/Interviews/Interview with the Director.mkv',
    );
    expect(await exists(now)).toBe(true);
    expect(await exists(trailer)).toBe(false);
  });

  test('an extra in the DVDs folder itself can be named', async () => {
    await write('Old (1999)/Other/Extra 01 (50 min).mkv');
    const now = await renameExtra(
      dir,
      'Old (1999)/Other/Extra 01 (50 min).mkv',
      'Documentary',
    );
    expect(now).toBe('Old (1999)/Other/Documentary.mkv');
    expect(await exists(now)).toBe(true);
  });

  test('a name that is taken is refused and nothing changes', async () => {
    await write('_converted/Duma (2005)/Trailers/Taken.mkv', 'other');
    await expect(renameExtra(dir, trailer, 'Taken')).rejects.toThrow(
      'already an extra',
    );
    expect(await exists(trailer)).toBe(true);
    expect(
      await fs.readFile(
        path.join(dir, '_converted/Duma (2005)/Trailers/Taken.mkv'),
        'utf8',
      ),
    ).toBe('other');
  });

  test('the same name in the same place changes nothing', async () => {
    expect(await renameExtra(dir, trailer, 'Trailer 01 (2 min)')).toBe(trailer);
    expect(await exists(trailer)).toBe(true);
  });

  test('only an extra can be renamed, not the movie or anything else', async () => {
    // Each of these is really there, so only the checks can stop them.
    const refused = [
      '_converted/Duma (2005)/Duma (2005).mkv',
      '_converted/Duma (2005)/Trailers/Trailer 01 (2 min).txt',
      '_converted/Duma (2005)/Random/Trailer 01 (2 min).mkv',
      '_settings/Trailers/a.mkv',
      '_converting/Duma/Trailers/a.mkv',
      '_converted/_Hidden/Trailers/a.mkv',
      'Trailers/a.mkv',
    ];
    for (const bad of refused) await write(bad, 'keep');
    const never = [
      '_converted/Duma (2005)/Trailers/../Duma (2005).mkv',
      '_converted/../outside/Trailers/a.mkv',
      '/etc/passwd',
      '',
    ];
    for (const bad of [...refused, ...never]) {
      await expect(renameExtra(dir, bad, 'x')).rejects.toThrow(
        'not an extra of a movie',
      );
    }
    for (const kept of refused) expect(await exists(kept)).toBe(true);
    expect(await exists('_converted/Duma (2005)/x.mkv')).toBe(false);
  });

  test('a folder that is not an extras folder is refused', async () => {
    await expect(renameExtra(dir, trailer, 'x', '../..')).rejects.toThrow(
      'extras folders',
    );
    await expect(renameExtra(dir, trailer, 'x', 'Random')).rejects.toThrow();
    expect(await exists(trailer)).toBe(true);
  });

  test('an extra that is gone is reported', async () => {
    await fs.rm(path.join(dir, trailer));
    await expect(renameExtra(dir, trailer, 'x')).rejects.toThrow('not there');
  });
});
