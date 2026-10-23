import type { TmdbResult } from '@/types/discs';

/**
 * Reads the ripper helper's answer to a TMDB search: one result per line, with kind, id,
 * name, size, description and poster separated by tabs. Lines that are not results (an
 * error sentence, a blank line) are skipped.
 */
export function parseTmdbResults(message: string | undefined): TmdbResult[] {
  const results: TmdbResult[] = [];
  for (const line of (message ?? '').split('\n')) {
    const [kind, id, name, size, overview, poster] = line.split('\t');
    if (
      (kind !== 'movie' && kind !== 'tv') ||
      !name ||
      !/^\d+$/.test(id ?? '')
    ) {
      continue;
    }
    results.push({
      kind,
      id: Number(id),
      name,
      size: size ?? '',
      overview: overview ?? '',
      poster: poster ?? '',
    });
  }
  return results;
}

/** A poster's address on TMDB's image server, or null when there is no poster. */
export function posterUrl(path: string): string | null {
  return path.startsWith('/') ? `https://image.tmdb.org/t/p/w154${path}` : null;
}

/** A TMDB page for a result, to check it is the one. */
export function tmdbPage(result: TmdbResult): string {
  return `https://www.themoviedb.org/${result.kind}/${result.id}`;
}

/**
 * A disc label as a title to search for, with the season and disc it names when it does:
 * BILLY_EXTERMINATOR_S4_D1 is "Billy Exterminator", season 4, disc 1. The same reading the
 * ripper does, so the page and the ripper agree.
 */
export function parseLabel(label: string): {
  title: string;
  season: number | null;
  disc: number | null;
} {
  let text = label.replace(/[_.]+/g, ' ').trim();
  let season: number | null = null;
  let disc: number | null = null;

  const seasonMatch = /\b(?:season|s)\s*(\d{1,2})\b/i.exec(text);
  if (seasonMatch) {
    season = Number(seasonMatch[1]);
    text = text.replace(seasonMatch[0], ' ');
  }
  const discMatch = /\b(?:disc|disk|dvd|d)\s*(\d{1,2})\b/i.exec(text);
  if (discMatch) {
    disc = Number(discMatch[1]);
    text = text.replace(discMatch[0], ' ');
  }
  text = text.replace(/\b(?:ws|fs|ntsc|pal|dvd)\b/gi, ' ');

  const title = text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  return { title, season, disc };
}
