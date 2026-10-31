/**
 * "Try to match the names": runs a movie's unnamed extras through the listener one at a time (it is
 * slow, and the machine is shared), compares each with the names DVD Fandom lists, and keeps the
 * answers for the page to read as they arrive.
 *
 * Nothing is renamed here. The answers are suggestions a person presses a button to use.
 */

import fs from 'fs/promises';
import path from 'path';
import { readExtras } from './extras-state';
import { fandomHint } from './fandom-hints';
import { ListenerUnavailable, lookAt } from './extras-eyes';
import { candidates, matchMovie, type Look } from './extras-match';
import type { ExtraMatch, FandomHint } from '../src/types/discs';

const MAX_MOVIES = 50;
const MAX_LOOKS = 500;

export interface Deps {
  look: (relative: string) => Promise<Look>;
  hint: (movie: string) => Promise<FandomHint>;
}

const realDeps: Deps = { look: (p) => lookAt(p), hint: (m) => fandomHint(m) };

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
    const heard: Record<string, Look> = {};
    try {
      const names = candidates(await deps.hint(movie));
      for (const item of items) {
        try {
          heard[item.path] = await looked(dir, item.path, deps);
        } catch (error) {
          if (error instanceof ListenerUnavailable) throw error;
          state.suggestions[item.path] = {
            state: 'none',
            note: 'The listener could not look at this one.',
            saw: '',
            heard: '',
          };
        }
        Object.assign(state.suggestions, matchMovie(heard, names));
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
