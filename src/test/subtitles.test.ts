import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  cleanSubtitlePath,
  readSubtitlesState,
  requestSubtitles,
  setSubtitlesAuto,
} from '../../server/subtitles-state';
import { describeTrack, movieName } from '../components/subtitles-section';

let dir: string;

async function write(relative: string, text: string) {
  const file = path.join(dir, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
}

const DUMA = 'Duma (2005)/Duma (2005).mkv';
const HERO = "Everyone's Hero (2006)/Everyone's Hero (2006).mkv";

async function writeIndex() {
  await write(
    '_subs/index.json',
    JSON.stringify({
      updated: 1000,
      files: [
        {
          path: DUMA,
          size: 1,
          mtime: 1,
          tracks: [
            {
              language: 'eng',
              codec: 'picture',
              name: '',
              default: true,
              forced: false,
            },
            {
              language: 'fre',
              codec: 'picture',
              name: '',
              default: false,
              forced: false,
            },
          ],
        },
        {
          path: HERO,
          size: 1,
          mtime: 1,
          tracks: [
            {
              language: 'eng',
              codec: 'S_TEXT/UTF8',
              name: 'English',
              default: true,
              forced: false,
            },
          ],
        },
        { path: 'Odd/odd.mkv', size: 1, mtime: 1, tracks: [] },
      ],
    }),
  );
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'subs-test-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('the subtitles state', () => {
  test('is not available until the converter has listed the movies', async () => {
    const state = await readSubtitlesState(dir);
    expect(state.available).toBe(false);
    expect(state.files).toEqual([]);
    expect(state.auto).toBe(true);
    expect(state.current).toBeNull();
  });

  test('lists each file with how many picture tracks it has', async () => {
    await writeIndex();
    const state = await readSubtitlesState(dir);
    expect(state.available).toBe(true);
    expect(state.updated).toBe(1000);
    expect(state.files.map((f) => [f.path, f.pictures, f.status])).toEqual([
      [DUMA, 2, null],
      [HERO, 0, null],
      ['Odd/odd.mkv', 0, null],
    ]);
  });

  test('says which file is being converted and which are waiting', async () => {
    await writeIndex();
    await write(
      '_subs/current.json',
      JSON.stringify({
        path: DUMA,
        step: 'Reading the subtitles',
        done: 1,
        total: 4,
      }),
    );
    await write('_subs/queue/abc.req', `path=${HERO}\nat=5\n`);
    const state = await readSubtitlesState(dir);
    expect(state.current).toEqual({
      path: DUMA,
      step: 'Reading the subtitles',
      done: 1,
      total: 4,
    });
    expect(state.files[0]?.status).toBe('converting');
    expect(state.files[1]?.status).toBe('queued');
  });

  test('keeps what was done, newest first', async () => {
    await writeIndex();
    await write(
      '_subs/done/a.json',
      JSON.stringify({ path: DUMA, ok: true, message: 'ok', at: 100 }),
    );
    await write(
      '_subs/done/b.json',
      JSON.stringify({ path: HERO, ok: false, message: 'broke', at: 200 }),
    );
    await write('_subs/done/c.json', 'not json');
    const state = await readSubtitlesState(dir);
    expect(state.recent.map((r) => [r.path, r.ok, r.at])).toEqual([
      [HERO, false, 200],
      [DUMA, true, 100],
    ]);
  });

  test('converting new discs is on unless it was switched off', async () => {
    expect((await readSubtitlesState(dir)).auto).toBe(true);
    await setSubtitlesAuto(dir, false);
    expect((await readSubtitlesState(dir)).auto).toBe(false);
    expect(await fs.readFile(path.join(dir, '_settings', 'subs'), 'utf8')).toBe(
      '0\n',
    );
    await setSubtitlesAuto(dir, true);
    expect((await readSubtitlesState(dir)).auto).toBe(true);
  });
});

describe('asking for a conversion', () => {
  test('only movie files inside the folder can be asked for', () => {
    expect(cleanSubtitlePath(DUMA)).toBe(DUMA);
    for (const bad of [
      '',
      '/etc/x.mkv',
      '../x.mkv',
      'a/../b.mkv',
      '_subs/x.mkv',
      'a/b.txt',
      'a//b.mkv',
      'a\\b.mkv',
      7,
      null,
    ]) {
      expect(() => cleanSubtitlePath(bad)).toThrow();
    }
  });

  test('one file makes one request, however often it is asked for', async () => {
    await writeIndex();
    expect(await requestSubtitles(dir, { path: DUMA })).toBe(1);
    expect(await requestSubtitles(dir, { path: DUMA })).toBe(1);
    const names = await fs.readdir(path.join(dir, '_subs', 'queue'));
    expect(names).toHaveLength(1);
    const text = await fs.readFile(
      path.join(dir, '_subs', 'queue', names[0] as string),
      'utf8',
    );
    expect(text.split('\n')[0]).toBe(`path=${DUMA}`);
  });

  test('the queue folder and the request are open to the converter, which is another user', async () => {
    await writeIndex();
    await requestSubtitles(dir, { path: DUMA });
    const folder = path.join(dir, '_subs', 'queue');
    expect((await fs.stat(folder)).mode & 0o777).toBe(0o777);
    const [name] = await fs.readdir(folder);
    expect(
      (await fs.stat(path.join(folder, name as string))).mode & 0o666,
    ).toBe(0o666);
  });

  test('the request has the name the converter gives it', async () => {
    await writeIndex();
    await requestSubtitles(dir, { path: DUMA });
    // md5 of the relative path, first 12 characters, as disc-subs --enqueue makes it.
    const { createHash } = await import('crypto');
    const name = `${createHash('md5').update(DUMA).digest('hex').slice(0, 12)}.req`;
    expect(await fs.readdir(path.join(dir, '_subs', 'queue'))).toEqual([name]);
  });

  test('a file that is not listed, or has no picture subtitles, is refused', async () => {
    await writeIndex();
    await expect(
      requestSubtitles(dir, { path: 'Nope/nope.mkv' }),
    ).rejects.toThrow('not in the list');
    await expect(requestSubtitles(dir, { path: HERO })).rejects.toThrow(
      'no picture subtitles',
    );
  });

  test('all asks for every file that has picture subtitles and is not already waiting', async () => {
    await writeIndex();
    await write('_subs/queue/x.req', `path=${DUMA}\nat=1\n`);
    expect(await requestSubtitles(dir, { all: true })).toBe(0);
    await fs.rm(path.join(dir, '_subs', 'queue', 'x.req'));
    expect(await requestSubtitles(dir, { all: true })).toBe(1);
    expect(await requestSubtitles(dir, { all: true })).toBe(0);
  });
});

describe('how tracks are described', () => {
  test('with the language and what is special about them', () => {
    expect(
      describeTrack({
        language: 'eng',
        codec: 'S_TEXT/UTF8',
        name: '',
        default: true,
        forced: false,
      }),
    ).toBe('English (default)');
    expect(
      describeTrack({
        language: 'spa',
        codec: 'picture',
        name: '',
        default: false,
        forced: true,
      }),
    ).toBe('Spanish (picture, forced)');
    expect(
      describeTrack({
        language: 'xyz',
        codec: 'x',
        name: '',
        default: false,
        forced: false,
      }),
    ).toBe('xyz');
  });

  test('a movie is named by its folder', () => {
    expect(movieName(DUMA)).toBe('Duma (2005)');
    expect(movieName('Movie.mkv')).toBe('Movie.mkv');
  });
});
