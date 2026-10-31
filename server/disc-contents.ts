/**
 * What a filed disc holds, for the Filed list on the Discs page: the movie, its trailers and
 * featurettes, other extras, other versions of the movie, and the copies of it that were left out.
 * It is read from the files in the movie's folder, and from the note the ripper leaves beside the
 * movie for what the files cannot say (`.disc-rip-skipped`: one "title<TAB>seconds" line for each
 * title that was a copy of the movie).
 */

import fs from 'fs/promises';
import path from 'path';
import type { DiscContents } from '../src/types/discs';

/** The folders Plex looks in for a movie's extras. */
export const EXTRA_FOLDERS = [
  'Trailers',
  'Featurettes',
  'Behind The Scenes',
  'Deleted Scenes',
  'Interviews',
  'Scenes',
  'Shorts',
  'Other',
] as const;

export const VIDEO = /\.(mkv|mp4|m4v|avi|mov)$/i;
/** What the ripper calls a title nearly as long as the movie. */
export const ALTERNATE = /^Alternate Version \d+/;

async function listNames(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

const cache = new Map<string, { at: number; value: DiscContents }>();
const CACHE_SECONDS = 30;

/** What is in a finished movie's or show's folder. Read at most every 30 seconds. */
export async function readContents(
  folder: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<DiscContents> {
  const cached = cache.get(folder);
  if (cached && now - cached.at < CACHE_SECONDS) return cached.value;

  const value: DiscContents = {
    movie: false,
    episodes: 0,
    trailers: 0,
    featurettes: 0,
    extras: 0,
    alternates: 0,
    copies: 0,
  };
  for (const name of await listNames(folder)) {
    if (name.startsWith('.')) continue;
    if (VIDEO.test(name)) value.movie = true;
    else if (/^Season \d+$/i.test(name)) {
      value.episodes += (await listNames(path.join(folder, name))).filter(
        (file) => VIDEO.test(file) && !file.startsWith('.'),
      ).length;
    }
  }
  for (const kind of EXTRA_FOLDERS) {
    for (const file of await listNames(path.join(folder, kind))) {
      if (!VIDEO.test(file) || file.startsWith('.')) continue;
      if (ALTERNATE.test(file)) value.alternates++;
      else if (kind === 'Trailers') value.trailers++;
      else if (kind === 'Featurettes') value.featurettes++;
      else value.extras++;
    }
  }
  try {
    const skipped = await fs.readFile(
      path.join(folder, '.disc-rip-skipped'),
      'utf8',
    );
    value.copies = skipped
      .split('\n')
      .filter((line) => /^\d+\t\d+$/.test(line)).length;
  } catch {
    // No note: nothing was left out, or the disc is from before it was written.
  }
  cache.set(folder, { at: now, value });
  return value;
}
