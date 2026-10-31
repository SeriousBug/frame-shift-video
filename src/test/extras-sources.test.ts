import { beforeEach, describe, expect, test } from 'bun:test';
import {
  clearDiscDbCache,
  clockSeconds,
  discDbSources,
  discExtras,
  folderKey,
  isRegionOne,
} from '../../server/discdb';
import {
  clearSourceCache,
  fromCompare,
  fromFandom,
  nameSources,
  titleAndYear,
  type SourceDeps,
} from '../../server/extras-sources';
import { compareAt, ListenerUnavailable } from '../../server/extras-eyes';
import type { NameSource } from '../types/discs';

// Shaped like TheDiscDB's real files (Journey to the Center of the Earth, 2008, a Region 1 DVD).
const DISC = {
  Index: 1,
  Format: 'DVD',
  Titles: [
    {
      Duration: '1:33:00',
      Item: { Title: 'Journey to the Center of the Earth', Type: 'MainMovie' },
    },
    {
      Duration: '0:10:08',
      Item: { Title: 'A World Within Our World', Type: 'Featurette' },
    },
    {
      Duration: '0:02:47',
      Item: { Title: 'How to Make Dinosaur Drool', Type: 'DeletedScene' },
    },
    {
      Duration: '0:00:20',
      Item: { Title: 'Theatrical Trailer', Type: 'Trailer' },
    },
    { Duration: '0:03:00', Item: { Title: '', Type: 'Extra' } },
    { Duration: '0:04:00' },
  ],
};
const FOLDER = 'Journey to the Center of the Earth (2008)';
const TREE = {
  tree: [
    { path: `data/movie/${FOLDER}/2008-dvd/disc01.json`, type: 'blob' },
    { path: `data/movie/${FOLDER}/2008-dvd/disc01-summary.txt`, type: 'blob' },
    { path: `data/movie/${FOLDER}/2008-dvd/release.json`, type: 'blob' },
    { path: `data/movie/${FOLDER}/2008-uk-dvd/disc01.json`, type: 'blob' },
    { path: `data/movie/${FOLDER}/2008-bluray/disc01.json`, type: 'blob' },
    { path: 'data/movie/Other (1999)/1999-dvd/disc01.json', type: 'blob' },
  ],
};
const FILES: Record<string, unknown> = {
  [`data/movie/${FOLDER}/2008-dvd/release.json`]: {
    RegionCode: '1',
    Title: 'DVD',
  },
  [`data/movie/${FOLDER}/2008-dvd/disc01.json`]: DISC,
  [`data/movie/${FOLDER}/2008-uk-dvd/release.json`]: { RegionCode: '2' },
  [`data/movie/${FOLDER}/2008-uk-dvd/disc01.json`]: DISC,
  [`data/movie/${FOLDER}/2008-bluray/release.json`]: {
    RegionCode: 'A,B,C; 1',
    Title: 'Blu-ray',
  },
  [`data/movie/${FOLDER}/2008-bluray/disc01.json`]: {
    ...DISC,
    Format: 'Blu-ray',
  },
};

let asked: string[];
let down: boolean;

function github(): typeof fetch {
  return (async (url: string) => {
    asked.push(url);
    if (down) throw new Error('offline');
    if (url.includes('git/trees')) return new Response(JSON.stringify(TREE));
    const path = decodeURI(
      url.replace('https://raw.githubusercontent.com/TheDiscDb/data/main/', ''),
    );
    return FILES[path]
      ? new Response(JSON.stringify(FILES[path]))
      : new Response('nope', { status: 404 });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  asked = [];
  down = false;
  clearDiscDbCache();
  clearSourceCache();
});

describe('reading TheDiscDB', () => {
  test('lengths are read as clock times', () => {
    expect(clockSeconds('0:10:08')).toBe(608);
    expect(clockSeconds('3:45')).toBe(225);
    expect(clockSeconds('0:00:00')).toBeNull();
    expect(clockSeconds('x')).toBeNull();
    expect(clockSeconds(5)).toBeNull();
    expect(clockSeconds('1:2:3:4')).toBeNull();
  });

  test('Region 1 is a region code that has a 1 in it', () => {
    expect(isRegionOne('1')).toBe(true);
    expect(isRegionOne('A,B,C; 1')).toBe(true);
    expect(isRegionOne('2')).toBe(false);
    expect(isRegionOne('11')).toBe(false);
    expect(isRegionOne(undefined)).toBe(false);
  });

  test('a disc gives its named extras with kind and length, never the movie', () => {
    expect(discExtras(DISC)).toEqual([
      {
        text: 'A World Within Our World',
        depth: 1,
        seconds: 608,
        kind: 'Featurettes',
      },
      {
        text: 'How to Make Dinosaur Drool',
        depth: 1,
        seconds: 167,
        kind: 'Deleted Scenes',
      },
      { text: 'Theatrical Trailer', depth: 1, seconds: 20, kind: 'Trailers' },
    ]);
    expect(discExtras(null)).toEqual([]);
    expect(discExtras({ Titles: 'x' })).toEqual([]);
  });

  test('folder names are compared without punctuation', () => {
    expect(folderKey('2001 A Space Odyssey (1968)')).toBe(
      folderKey('2001: A Space Odyssey (1968)'),
    );
    expect(folderKey('The Lion King 1½ (2004)')).toBe(
      folderKey('The Lion King 1 1/2 (2004)'),
    );
  });
});

describe('asking TheDiscDB for a movie', () => {
  test('gives the Region 1 DVD only, with a link to its data', async () => {
    const found = await discDbSources(FOLDER, github());
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      source: 'TheDiscDB',
      page: FOLDER,
      release: 'DVD',
    });
    expect(found[0]!.url).toContain(
      'github.com/TheDiscDb/data/tree/main/data/movie/',
    );
    expect(found[0]!.features).toHaveLength(3);
    expect(asked.some((u) => u.includes('2008-uk-dvd/disc01'))).toBe(false);
  });

  test('finds a movie whose folder differs in punctuation', async () => {
    expect(
      await discDbSources(
        'journey to the center of the earth (2008)',
        github(),
      ),
    ).toHaveLength(1);
  });

  test('a movie it does not have, a different year, and the site being down give nothing', async () => {
    expect(await discDbSources('Nothing (1999)', github())).toEqual([]);
    expect(
      await discDbSources(
        'Journey to the Center of the Earth (2009)',
        github(),
      ),
    ).toEqual([]);
    clearDiscDbCache();
    down = true;
    expect(await discDbSources(FOLDER, github())).toEqual([]);
  });

  test('the listing of everything is asked for once a day', async () => {
    const t0 = 5_000_000;
    await discDbSources(FOLDER, github(), t0);
    await discDbSources('Other (1999)', github(), t0 + 3_600_000);
    expect(asked.filter((u) => u.includes('git/trees'))).toHaveLength(1);
    await discDbSources(FOLDER, github(), t0 + 25 * 3_600_000);
    expect(asked.filter((u) => u.includes('git/trees'))).toHaveLength(2);
  });
});

const FANDOM = {
  found: true,
  page: 'Duma',
  url: 'https://dvd.fandom.com/wiki/Duma',
  runtime: '100 min',
  features: [{ text: 'Theatrical Trailer', depth: 1 }],
};
const DISCDB_SOURCE: NameSource = {
  source: 'TheDiscDB',
  page: 'Duma (2005)',
  url: 'x',
  features: [{ text: 'Making Of', depth: 1, seconds: 600 }],
};
const COMPARE = {
  found: true,
  film: 'Duma',
  url: 'https://www.dvdcompare.net/comparisons/film.php?fid=13117',
  releases: [
    {
      name: 'R1 America - Warner Home Video',
      features: [
        {
          title: 'Play All',
          seconds: 108,
          type: null,
          play_all: true,
          depth: 1,
        },
        {
          title: 'Behind The Net',
          seconds: null,
          type: 'featurette',
          play_all: false,
          depth: 1,
        },
        {
          title: 'Coloring',
          seconds: null,
          type: 'game',
          play_all: false,
          depth: 1,
        },
      ],
    },
  ],
};

describe('putting the databases together', () => {
  test('the movie folder name is a title and a year', () => {
    expect(titleAndYear("Teacher's Pet (2004)")).toEqual({
      title: "Teacher's Pet",
      year: 2004,
    });
    expect(titleAndYear('Stellaluna')).toEqual({
      title: 'Stellaluna',
      year: null,
    });
  });

  test('DVD Compare gives its releases with lengths, play-all marks and kinds', () => {
    const [source] = fromCompare(COMPARE);
    expect(source).toMatchObject({
      source: 'DVD Compare',
      release: 'R1 America - Warner Home Video',
    });
    expect(source!.features[0]).toMatchObject({
      text: 'Play All',
      seconds: 108,
      playAll: true,
    });
    expect(source!.features[1]!.kind).toBe('Featurettes');
    expect(source!.features[2]!.kind).toBeNull();
    expect(fromCompare({ found: false })).toEqual([]);
  });

  test('DVD Fandom gives names with no lengths', () => {
    const [source] = fromFandom(FANDOM);
    expect(source).toMatchObject({ source: 'DVD Fandom', runtime: '100 min' });
    expect(source!.features[0]!.seconds).toBeNull();
    expect(fromFandom({ found: false })).toEqual([]);
  });

  const deps = (over: Partial<SourceDeps> = {}): SourceDeps => ({
    compare: async () => COMPARE,
    discdb: async () => [DISCDB_SOURCE],
    fandom: async () => FANDOM,
    ...over,
  });

  test('all three are asked and every list comes back, in order', async () => {
    const sources = await nameSources('Duma (2005)', deps());
    expect(sources.map((s) => s.source)).toEqual([
      'DVD Compare',
      'TheDiscDB',
      'DVD Fandom',
    ]);
  });

  test('one that fails is left out and the others still count', async () => {
    const sources = await nameSources(
      'Duma (2005)',
      deps({
        compare: async () => {
          throw new ListenerUnavailable('down');
        },
      }),
    );
    expect(sources.map((s) => s.source)).toEqual(['TheDiscDB', 'DVD Fandom']);
  });

  test('an answer is kept an hour, but not one made while a database was down', async () => {
    let asks = 0;
    const counting = deps({
      fandom: async () => {
        asks++;
        return FANDOM;
      },
    });
    await nameSources('Duma (2005)', counting, 1000);
    await nameSources('Duma (2005)', counting, 1000 + 30 * 60_000);
    expect(asks).toBe(1);
    await nameSources('Duma (2005)', counting, 1000 + 61 * 60_000);
    expect(asks).toBe(2);

    clearSourceCache();
    let tries = 0;
    const flaky = deps({
      compare: async () => {
        tries++;
        throw new Error('down');
      },
    });
    await nameSources('Duma (2005)', flaky, 1000);
    await nameSources('Duma (2005)', flaky, 2000);
    expect(tries).toBe(2);
  });
});

describe('asking the listener for DVD Compare', () => {
  const reply = (body: unknown, status = 200) =>
    (async () =>
      new Response(JSON.stringify(body), {
        status,
      })) as unknown as typeof fetch;

  test('sends the title and year and reads the answer', async () => {
    let sent: { url: string; body: string } | null = null;
    const fetcher = (async (url: string, init?: RequestInit) => {
      sent = { url, body: String(init?.body) };
      return new Response(JSON.stringify(COMPARE));
    }) as unknown as typeof fetch;
    expect(
      (await compareAt('Duma', 2005, fetcher, 'http://eyes:3002/')).found,
    ).toBe(true);
    expect(sent!.url).toBe('http://eyes:3002/compare');
    expect(JSON.parse(sent!.body)).toEqual({ title: 'Duma', year: 2005 });
  });

  test('not set up, unreachable and refused are each said', async () => {
    await expect(compareAt('Duma', 2005, reply({}), undefined)).rejects.toThrow(
      ListenerUnavailable,
    );
    const down = (async () => {
      throw new Error('refused');
    }) as unknown as typeof fetch;
    await expect(compareAt('Duma', 2005, down, 'http://x')).rejects.toThrow(
      ListenerUnavailable,
    );
    await expect(
      compareAt(
        'Duma',
        2005,
        reply({ error: 'Could not look that up' }, 500),
        'http://x',
      ),
    ).rejects.toThrow('Could not look');
  });
});
