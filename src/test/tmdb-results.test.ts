import { describe, expect, test } from 'bun:test';
import {
  parseLabel,
  parseTmdbResults,
  posterUrl,
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
      },
      {
        kind: 'tv',
        id: 7,
        name: 'A Show (2001)',
        size: '1 season',
        overview: 'x',
        poster: '',
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
      }),
    ).toBe('https://www.themoviedb.org/movie/21352');
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
