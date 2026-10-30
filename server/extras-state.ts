/**
 * The extras of ripped movies (trailers, featurettes, anything else on the disc), and naming them.
 *
 * The ripper cannot know what an extra is: a DVD stores no names for them. It sorts them into Plex's
 * extras folders by length and calls them "Trailer 01 (2 min)", "Featurette 01 (20 min)". This is
 * where a person gives them their real names. Plex shows a file's name as the extra's title and its
 * folder as the kind, so both can be changed here.
 *
 * Only a video file that is already inside one of those folders of a movie can be renamed, and only
 * to a plain name in one of those folders.
 */

import fs from 'fs/promises';
import path from 'path';
import { outputFolder } from './disc-state';
import type { ExtraItem, ExtraMovie } from '../src/types/discs';

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

const VIDEO = /\.(mkv|mp4|m4v|avi|mov)$/i;
/** The names the ripper gives: "Trailer 01 (2 min).mkv". */
const GENERIC = /^(Trailer|Featurette|Extra) \d+ \(\d+ min\)$/;
const MAX_MOVIES = 200;
const MAX_NAME = 150;

async function listNames(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).sort();
  } catch {
    return [];
  }
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** The movies that have extras: those still called by the ripper's names come first. */
export async function readExtras(dir: string): Promise<ExtraMovie[]> {
  const output = await outputFolder(dir);
  const movies: ExtraMovie[] = [];
  for (const parent of [output, '']) {
    for (const movie of await listNames(path.join(dir, parent))) {
      if (movie.startsWith('_') || movie.startsWith('.') || movie === output) {
        continue;
      }
      const items: ExtraItem[] = [];
      for (const folder of EXTRA_FOLDERS) {
        const where = path.join(dir, parent, movie, folder);
        for (const file of await listNames(where)) {
          if (!VIDEO.test(file)) continue;
          const name = file.replace(VIDEO, '');
          items.push({
            path: [parent, movie, folder, file].filter(Boolean).join('/'),
            folder,
            name,
            unnamed: GENERIC.test(name),
          });
        }
      }
      if (items.length > 0) movies.push({ movie, items });
    }
  }
  movies.sort(
    (a, b) =>
      Number(b.items.some((i) => i.unnamed)) -
        Number(a.items.some((i) => i.unnamed)) ||
      a.movie.localeCompare(b.movie),
  );
  return movies.slice(0, MAX_MOVIES);
}

/** A name for a file: plain text, no folders, nothing that is awkward on a share. */
export function cleanExtraName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Give the extra a name');
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Give the extra a name');
  if (name.length > MAX_NAME) throw new Error('That name is too long');
  if (/[/\\:*?"<>|\u0000-\u001f]/.test(name)) {
    throw new Error('A name cannot have / \\ : * ? " < > | in it');
  }
  if (name.startsWith('.')) throw new Error('A name cannot start with a dot');
  return name;
}

/**
 * Where the file is: its movie's folder, the extras folder and its name, and which of the two roots
 * (the finished-discs folder, or the DVDs folder itself) holds the movie.
 */
function locate(
  file: string,
  output: string,
): { parent: string; movie: string; folder: string; base: string } {
  const parts = file.split('/');
  const parent = parts.length === 4 ? parts[0]! : '';
  if (parts.length !== (parent ? 4 : 3) || (parent && parent !== output)) {
    throw new Error('That is not an extra of a movie');
  }
  const [movie, folder, base] = parent
    ? [parts[1]!, parts[2]!, parts[3]!]
    : [parts[0]!, parts[1]!, parts[2]!];
  if (
    [movie, folder, base].some(
      (part) => !part || part === '.' || part === '..' || part.startsWith('_'),
    ) ||
    !(EXTRA_FOLDERS as readonly string[]).includes(folder) ||
    !VIDEO.test(base)
  ) {
    throw new Error('That is not an extra of a movie');
  }
  return { parent, movie, folder, base };
}

/**
 * Gives an extra its name, and moves it to another extras folder if asked. Returns where it is now.
 * Nothing is overwritten: a name that is taken is refused.
 */
export async function renameExtra(
  dir: string,
  file: string,
  newName: unknown,
  newFolder?: unknown,
): Promise<string> {
  const output = await outputFolder(dir);
  const here = locate(file, output);
  const name = cleanExtraName(newName);
  const folder =
    newFolder === undefined || newFolder === null ? here.folder : newFolder;
  if (
    typeof folder !== 'string' ||
    !(EXTRA_FOLDERS as readonly string[]).includes(folder)
  ) {
    throw new Error('Pick one of the extras folders');
  }
  const root = path.join(dir, here.parent, here.movie);
  const from = path.join(root, here.folder, here.base);
  if (!(await isDirectory(root))) throw new Error('That movie is not there');
  try {
    if (!(await fs.stat(from)).isFile()) throw new Error('not a file');
  } catch {
    throw new Error('That extra is not there any more');
  }
  const base = `${name}${path.extname(here.base)}`;
  const to = path.join(root, folder, base);
  if (to === from) return file;
  // A name that differs only in case is the same file on some shares; let it through.
  const same = to.toLowerCase() === from.toLowerCase();
  if (!same) {
    try {
      await fs.access(to);
      throw new Error('There is already an extra with that name');
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('There is'))
        throw error;
    }
  }
  await fs.mkdir(path.join(root, folder), { recursive: true });
  await fs.rename(from, to);
  return [here.parent, here.movie, folder, base].filter(Boolean).join('/');
}
