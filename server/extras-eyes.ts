/**
 * The client of the listener (colossus's extras-eyes container, eyes.py): asks it what an extra
 * shows at its start and says in its first minute and a half.
 */

import type { Look } from './extras-match';

const TIMEOUT_MS = 4 * 60 * 1000;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export class ListenerUnavailable extends Error {}

/** Asks the listener about the extra at `path` (under the DVDs folder). */
export async function lookAt(
  path: string,
  fetcher: Fetcher = fetch,
  base: string | undefined = process.env.EXTRAS_EYES_URL,
): Promise<Look> {
  if (!base) throw new ListenerUnavailable('The listener is not set up here');
  let response: Response;
  try {
    response = await fetcher(`${base.replace(/\/$/, '')}/look`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ListenerUnavailable('The listener could not be reached');
  }
  const body = (await response.json().catch(() => null)) as
    (Partial<Look> & { error?: string }) | null;
  if (!response.ok || !body) {
    throw new Error(body?.error ?? 'The listener could not look at that');
  }
  return {
    seconds: Number(body.seconds) || 0,
    ocr: Array.isArray(body.ocr) ? body.ocr : [],
    speech: Array.isArray(body.speech) ? body.speech : [],
  };
}

/** What dvdcompare.net lists for a movie's Region 1 DVD, as the listener answers it. */
export interface CompareAnswer {
  found: boolean;
  film?: string;
  year?: number | null;
  url?: string;
  releases?: {
    name: string;
    features: {
      title: string;
      seconds: number | null;
      type: string | null;
      play_all: boolean;
      depth: number;
    }[];
  }[];
}

/** Asks the listener to look the movie up on dvdcompare.net (slow the first time). */
export async function compareAt(
  title: string,
  year: number | null,
  fetcher: Fetcher = fetch,
  base: string | undefined = process.env.EXTRAS_EYES_URL,
): Promise<CompareAnswer> {
  if (!base) throw new ListenerUnavailable('The listener is not set up here');
  let response: Response;
  try {
    response = await fetcher(`${base.replace(/\/$/, '')}/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, year }),
      signal: AbortSignal.timeout(90 * 1000),
    });
  } catch {
    throw new ListenerUnavailable('The listener could not be reached');
  }
  const body = (await response.json().catch(() => null)) as
    (CompareAnswer & { error?: string }) | null;
  if (!response.ok || !body) {
    throw new Error(body?.error ?? 'DVD Compare could not be asked');
  }
  return body;
}
