import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { readContents } from '../../server/disc-contents';
import { readDiscsState } from '../../server/disc-state';
import { describeContents } from '../lib/disc-contents';

let dir: string;

async function write(relative: string, text = 'v') {
  const file = path.join(dir, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'contents-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

let clock = 1_000_000;
const read = (folder: string) =>
  readContents(path.join(dir, folder), (clock += 100));

describe('readContents', () => {
  test('counts the movie and each kind of extra', async () => {
    await write('Duma/Duma.mkv');
    await write('Duma/Trailers/Trailer 01 (2 min).mkv');
    await write('Duma/Trailers/Trailer 02 (1 min).mkv');
    await write('Duma/Featurettes/Making Of.mkv');
    await write('Duma/Deleted Scenes/Cut.mkv');
    await write('Duma/Other/Extra 01 (50 min).mkv');
    await write('Duma/Other/Alternate Version 01 (80 min).mkv');
    expect(await read('Duma')).toEqual({
      movie: true,
      episodes: 0,
      trailers: 2,
      featurettes: 1,
      extras: 2,
      alternates: 1,
      copies: 0,
    });
  });

  test('an alternate version is counted as one, wherever it was put', async () => {
    await write('Duma/Duma.mkv');
    await write('Duma/Featurettes/Alternate Version 02 (77 min).mkv');
    const contents = await read('Duma');
    expect(contents.alternates).toBe(1);
    expect(contents.featurettes).toBe(0);
  });

  test("copies that were left out come from the ripper's note", async () => {
    await write('Duma/Duma.mkv');
    await write('Duma/.disc-rip-skipped', '4\t5411\n8\t5410\nnot a line\n');
    expect((await read('Duma')).copies).toBe(2);
  });

  test('a show counts its episodes, and hidden files and other files are not counted', async () => {
    await write('Show/Season 01/Show - s01e01.mkv');
    await write('Show/Season 01/Show - s01e02.mkv');
    await write('Show/Season 02/Show - s02e01.mkv');
    await write('Show/Season 01/notes.txt');
    await write('Show/.hidden.mkv');
    const contents = await read('Show');
    expect(contents.episodes).toBe(3);
    expect(contents.movie).toBe(false);
  });

  test('a folder that is not there says nothing is in it', async () => {
    expect(await read('Nope')).toMatchObject({ movie: false, trailers: 0 });
  });
});

describe('describeContents', () => {
  const empty = {
    movie: false,
    episodes: 0,
    trailers: 0,
    featurettes: 0,
    extras: 0,
    alternates: 0,
    copies: 0,
  };

  test('says what was made, in plain words', () => {
    expect(
      describeContents({
        ...empty,
        movie: true,
        trailers: 3,
        featurettes: 1,
        extras: 21,
        alternates: 1,
        copies: 2,
      }),
    ).toBe(
      'Movie · 1 other version of the movie · 3 trailers · 1 featurette · 21 other extras · 2 copies of the movie left out',
    );
    expect(describeContents({ ...empty, movie: true })).toBe('Movie');
    expect(describeContents({ ...empty, episodes: 1 })).toBe('1 episode');
    expect(describeContents(empty)).toBe('');
  });
});

describe('the Filed list', () => {
  test('each filed disc carries what it holds', async () => {
    await write('_converted/Duma (2005)/Duma (2005).mkv');
    await write('_converted/Duma (2005)/Trailers/Trailer 01 (2 min).mkv');
    await write('Old (1999)/Old (1999).mkv');
    const state = await readDiscsState(dir, undefined, []);
    const byName = Object.fromEntries(state.recent.map((r) => [r.name, r]));
    expect(byName['Duma (2005)']?.contents).toMatchObject({
      movie: true,
      trailers: 1,
    });
    expect(byName['Old (1999)']?.contents).toMatchObject({ movie: true });
  });
});
