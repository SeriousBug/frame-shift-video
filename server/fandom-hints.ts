/**
 * What DVD Fandom (dvd.fandom.com, a wiki of DVD releases) lists as the bonus features of a movie's disc.
 *
 * A disc stores no names for its extras, so a person names them on the Discs page. This looks the
 * movie up on the wiki and hands back its list of bonus features (and its running time) to read
 * beside the naming boxes. It names things only: the wiki gives no lengths for extras, so nothing is
 * matched or renamed from it.
 */

import type { FandomHint } from '../src/types/discs';

const API = 'https://dvd.fandom.com/api.php';
const WIKI = 'https://dvd.fandom.com/wiki/';
const FOUND_MS = 24 * 60 * 60 * 1000;
const MISSED_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 8000;
const MAX_LINES = 60;
const MAX_MOVIE = 150;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const cache = new Map<string, { at: number; hint: FandomHint }>();

/** "Teacher's Pet (2004)" is the title and the year the ripper filed the movie under. */
export function splitMovie(movie: string): { title: string; year: string } {
  const match = movie.match(/^(.*?)\s*\((\d{4})\)\s*$/);
  return match
    ? { title: match[1]!.trim(), year: match[2]! }
    : { title: movie.trim(), year: '' };
}

/** Titles compared without case, punctuation, a leading "The", or "½" against "1/2". */
function normal(title: string): string {
  return title
    .toLowerCase()
    .replace(/½/g, ' 1/2 ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

/**
 * Which search hit is the movie: the page called exactly "Title (year)", else exactly "Title".
 * A page for another year of the same name (a 1958 film for a 2004 one) is never taken.
 */
export function pickPage(
  titles: string[],
  title: string,
  year: string,
): string | null {
  const want = normal(title);
  const withYear = (page: string) => page.match(/^(.*?)\s*\((\d{4})\)\s*$/);
  let plain: string | null = null;
  for (const page of titles) {
    const parts = withYear(page);
    const base = normal(parts ? parts[1]! : page);
    if (base !== want) continue;
    if (parts && year && parts[2] === year) return page;
    if (!parts && plain === null) plain = page;
  }
  return plain;
}

/** Wiki markup to plain text. */
function plain(line: string): string {
  return line
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/'{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The running time the wiki gives the movie ("Approx. 77 minutes"), if any. */
export function readRuntime(wikitext: string): string | null {
  const match = wikitext.match(/^\|\s*time\s*=\s*(.+)$/m);
  const text = match ? plain(match[1]!) : '';
  return text || null;
}

/**
 * The lines under the bonus features heading: list items with their depth, and "Disc 1" style
 * headings as depth 0.
 */
export function readFeatures(
  wikitext: string,
): { text: string; depth: number }[] {
  const heading =
    /^==\s*(bonus features|special features|bonus material|extras)\s*==\s*$/im;
  const start = wikitext.search(heading);
  if (start < 0) return [];
  const rest = wikitext.slice(start).split('\n').slice(1);
  const lines: { text: string; depth: number }[] = [];
  for (const raw of rest) {
    if (/^==[^=]/.test(raw)) break;
    const sub = raw.match(/^===+\s*([^=]+?)\s*=+\s*$/);
    if (sub) {
      lines.push({ text: plain(sub[1]!), depth: 0 });
      continue;
    }
    const item = raw.match(/^(\*+)\s*(.*)$/);
    if (!item) continue;
    const text = plain(item[2]!);
    if (text) lines.push({ text, depth: item[1]!.length });
    if (lines.length >= MAX_LINES) break;
  }
  return lines;
}

async function getJson(
  fetcher: Fetcher,
  params: Record<string, string>,
): Promise<unknown> {
  const url = `${API}?${new URLSearchParams({ ...params, format: 'json' })}`;
  const response = await fetcher(url, {
    headers: { 'User-Agent': 'frame-shift-video (home media server)' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`DVD Fandom answered ${response.status}`);
  return response.json();
}

/**
 * The wiki's list for a movie folder name, or `{ found: false }`. Never throws: the wiki being down
 * is the same to the page as the wiki having no entry. Answers are kept for a day (an hour when
 * there was none, so a new entry shows soon).
 */
export async function fandomHint(
  movie: string,
  fetcher: Fetcher = fetch,
  now: number = Date.now(),
): Promise<FandomHint> {
  const name = movie.trim();
  if (!name || name.length > MAX_MOVIE) return { found: false };
  const kept = cache.get(name);
  if (kept && now - kept.at < (kept.hint.found ? FOUND_MS : MISSED_MS)) {
    return kept.hint;
  }
  let hint: FandomHint = { found: false };
  try {
    const { title, year } = splitMovie(name);
    const search = (await getJson(fetcher, {
      action: 'query',
      list: 'search',
      srsearch: title,
      srlimit: '10',
    })) as { query?: { search?: { title: string }[] } };
    const page = pickPage(
      (search.query?.search ?? []).map((hit) => hit.title),
      title,
      year,
    );
    if (page) {
      const parsed = (await getJson(fetcher, {
        action: 'parse',
        page,
        prop: 'wikitext',
        redirects: '1',
      })) as { parse?: { wikitext?: { '*'?: string } } };
      const wikitext = parsed.parse?.wikitext?.['*'] ?? '';
      hint = {
        found: true,
        page,
        url: `${WIKI}${encodeURIComponent(page.replace(/ /g, '_'))}`,
        runtime: readRuntime(wikitext),
        features: readFeatures(wikitext),
      };
    }
  } catch {
    // The wiki is down or slow: not kept, so the next look tries again.
    return { found: false };
  }
  cache.set(name, { at: now, hint });
  return hint;
}

/** For tests. */
export function clearFandomCache(): void {
  cache.clear();
}
