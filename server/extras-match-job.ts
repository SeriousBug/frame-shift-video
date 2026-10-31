/**
 * "Try to match the names": measures a movie's unnamed extras and compares their lengths with the
 * lengths the databases list (answers at once), then runs each through the listener one at a time (it
 * is slow, and the machine is shared) to add what is written on it and said in it. The answers are
 * kept for the page to read as they arrive.
 *
 * Nothing is renamed here. The answers are suggestions a person presses a button to use.
 */

import fs from 'fs/promises';
import path from 'path';
import { readExtras } from './extras-state';
import { ListenerUnavailable, lookAt } from './extras-eyes';
import { extraFilePath } from './extras-state';
import { videoSeconds } from './extras-preview';
import { nameSources } from './extras-sources';
import { candidatesFrom, matchMovie, type Look } from './extras-match';
import type { ExtraMatch, NameSource } from '../src/types/discs';

const MAX_MOVIES = 50;
const MAX_LOOKS = 500;

export interface Deps {
  look: (relative: string) => Promise<Look>;
  sources: (movie: string) => Promise<NameSource[]>;
  seconds: (dir: string, relative: string) => Promise<number | null>;
}

const realDeps: Deps = {
  look: (p) => lookAt(p),
  sources: (m) => nameSources(m),
  seconds: async (dir, relative) =>
    videoSeconds(await extraFilePath(dir, relative)).catch(() => null),
};

const jobs = new Map<string, ExtraMatch>();
/** What the listener said about a file, kept while the file is unchanged (listening is slow). */
const looks = new Map<string, Look>();

/** The state of a movie's matching, or null when it has not been started. */
export function matchState(movie: string): ExtraMatch | null {
  return jobs.get(movie) ?? null;
}

/** For tests. */
export function clearMatches(): void {
  jobs.clear();
  looks.clear();
}

async function looked(
  dir: string,
  relative: string,
  deps: Deps,
): Promise<Look> {
  const stat = await fs.stat(path.join(dir, relative));
  const key = `${relative}|${stat.size}|${stat.mtimeMs}`;
  const kept = looks.get(key);
  if (kept) return kept;
  const result = await deps.look(relative);
  if (looks.size >= MAX_LOOKS) looks.delete(looks.keys().next().value!);
  looks.set(key, result);
  return result;
}

/**
 * Starts matching the unnamed extras of `movie`, unless that is already going. Returns the state
 * at once and a promise that settles when the matching is over (for tests; the page just polls).
 */
export async function startMatch(
  dir: string,
  movie: string,
  deps: Deps = realDeps,
): Promise<{ state: ExtraMatch; finished: Promise<void> }> {
  const running = jobs.get(movie);
  if (running?.status === 'running') {
    return { state: running, finished: Promise.resolve() };
  }
  const found = (await readExtras(dir)).find((m) => m.movie === movie);
  if (!found) throw new Error('That movie has no extras to match');
  const items = found.items.filter((i) => i.unnamed);
  if (items.length === 0) throw new Error('Every extra of that movie is named');

  if (jobs.size >= MAX_MOVIES && !jobs.has(movie)) {
    jobs.delete(jobs.keys().next().value!);
  }
  const state: ExtraMatch = {
    status: 'running',
    total: items.length,
    done: 0,
    suggestions: {},
  };
  jobs.set(movie, state);

  const finished = (async () => {
    const looks: Record<string, Look | null> = {};
    let unlooked = 0;
    try {
      const lengths: Record<string, number | null> = {};
      for (const item of items) {
        lengths[item.path] = await deps.seconds(dir, item.path);
        looks[item.path] = null;
      }
      const sources = await deps.sources(movie);
      const names = candidatesFrom(sources);
      state.sources = [...new Set(sources.map((s) => s.source))];
      const decide = () => {
        state.suggestions = matchMovie(
          items.map((i) => ({
            path: i.path,
            seconds: lengths[i.path] ?? null,
            look: looks[i.path] ?? null,
          })),
          names,
        );
      };
      // By length first: it needs no listening, so the page has answers straight away.
      decide();
      for (const item of items) {
        try {
          looks[item.path] = await looked(dir, item.path, deps);
        } catch (error) {
          if (error instanceof ListenerUnavailable) {
            state.warning = `${error.message}, so these suggestions are by length only.`;
            break;
          }
          unlooked += 1;
          state.warning = `The listener could not look at ${unlooked === 1 ? 'one extra' : `${unlooked} extras`}.`;
        }
        decide();
        state.done += 1;
      }
      state.status = 'done';
    } catch (error) {
      state.status = 'failed';
      state.error = error instanceof Error ? error.message : String(error);
    }
  })();
  return { state, finished };
}
