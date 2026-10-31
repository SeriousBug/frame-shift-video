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
