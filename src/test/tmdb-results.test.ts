import { describe, expect, test } from 'bun:test';
import {
  parseLabel,
  parseTmdbResults,
  posterUrl,
  sourceName,
  tmdbPage,
} from '../lib/tmdb-results';

describe('parseTmdbResults', () => {
  test('reads one result per line', () => {
    const message = [
      'movie\t21352\tAndre (1994)\t94 min\tA seal befriends a girl.\t/p.jpg',
      'tv\t7\tA Show (2001)\t1 season\tx\t',
    ].join('\n');
    expect(parseTmdbResults(message)).toEqual([
      {
        kind: 'movie',
        id: 21352,
        name: 'Andre (1994)',
        size: '94 min',
        overview: 'A seal befriends a girl.',
        poster: '/p.jpg',
        source: 'tmdb',
      },
      {
        kind: 'tv',
        id: 7,
        name: 'A Show (2001)',
        size: '1 season',
        overview: 'x',
        poster: '',
        source: 'tmdb',
      },
    ]);
  });

  test('skips lines that are not results', () => {
    expect(parseTmdbResults('TMDB has nothing called "x"')).toEqual([]);
    expect(parseTmdbResults('')).toEqual([]);
    expect(parseTmdbResults(undefined)).toEqual([]);
    expect(parseTmdbResults('book\t1\tName\t\t\t')).toEqual([]);
    expect(parseTmdbResults('movie\tx\tName\t\t\t')).toEqual([]);
    expect(parseTmdbResults('movie\t1\t\t\t\t')).toEqual([]);
  });

  test('a short line still gives a result', () => {
    expect(parseTmdbResults('movie\t1\tName')).toEqual([
      {
        kind: 'movie',
        id: 1,
        name: 'Name',
        size: '',
        overview: '',
        poster: '',
        source: 'tmdb',
      },
    ]);
  });
});

describe('addresses', () => {
  test('a poster path becomes an image address, an empty one nothing', () => {
    expect(posterUrl('/p.jpg')).toBe('https://image.tmdb.org/t/p/w154/p.jpg');
    expect(posterUrl('')).toBeNull();
  });

  test('a result links to its TMDB page', () => {
    expect(
      tmdbPage({
        kind: 'movie',
        id: 21352,
        name: 'x',
        size: '',
        overview: '',
        poster: '',
        source: 'tmdb',
      }),
    ).toBe('https://www.themoviedb.org/movie/21352');
  });
});

describe('results from TheTVDB', () => {
  const row =
    'movie\t52065\tSanta vs. the Snowman (2002)\t21 min\tOnce upon a time.\thttps://artworks.thetvdb.com/banners/movies/52065/posters/52065.jpg\ttvdb';

  test('the seventh column says the result is from TheTVDB', () => {
    const [result] = parseTmdbResults(row);
    expect(result).toMatchObject({
      id: 52065,
      source: 'tvdb',
      size: '21 min',
    });
    expect(sourceName(result!)).toBe('TVDB');
  });

  test('a row with no source, or one the page does not know, is TMDB', () => {
    expect(parseTmdbResults('movie\t1\tName\t\t\t\t')[0]?.source).toBe('tmdb');
    expect(parseTmdbResults('movie\t1\tName\t\t\t\tother')[0]?.source).toBe(
      'tmdb',
    );
    expect(sourceName(parseTmdbResults('movie\t1\tName')[0]!)).toBe('TMDB');
  });

  test('a TVDB poster is used only from its artwork server', () => {
    expect(
      posterUrl('https://artworks.thetvdb.com/banners/movies/1/posters/1.jpg'),
    ).toBe('https://artworks.thetvdb.com/banners/movies/1/posters/1.jpg');
    expect(
      posterUrl('https://evil.example/artworks.thetvdb.com/x.jpg'),
    ).toBeNull();
    expect(posterUrl('http://artworks.thetvdb.com/x.jpg')).toBeNull();
  });

  test('a result links to its TheTVDB page, a show as a series', () => {
    const [movie] = parseTmdbResults(row);
    expect(tmdbPage(movie!)).toBe('https://thetvdb.com/dereferrer/movie/52065');
    const [show] = parseTmdbResults(
      "tv\t73733\tTeacher's Pet (2000)\t1 season\tx\t\ttvdb",
    );
    expect(tmdbPage(show!)).toBe('https://thetvdb.com/dereferrer/series/73733');
  });
});

describe('parseLabel', () => {
  test('a plain label is a title', () => {
    expect(parseLabel('STELLALUNA')).toEqual({
      title: 'Stellaluna',
      season: null,
      disc: null,
    });
    expect(parseLabel('AIR_BUD_SPIKES_B').title).toBe('Air Bud Spikes B');
  });

  test('a season and a disc are taken out of the title', () => {
    expect(parseLabel('BILLY_EXTERMINATOR_S4_D1')).toEqual({
      title: 'Billy Exterminator',
      season: 4,
      disc: 1,
    });
    expect(parseLabel('Show Name Season 2 Disc 3')).toEqual({
      title: 'Show Name',
      season: 2,
      disc: 3,
    });
  });

  test('format words are dropped', () => {
    expect(parseLabel('MY_MOVIE_WS_NTSC').title).toBe('My Movie');
  });

  test('an S or D inside a word is left alone', () => {
    expect(parseLabel('SPACED_DISCO').title).toBe('Spaced Disco');
    expect(parseLabel('SPACED_DISCO').season).toBeNull();
  });
});
