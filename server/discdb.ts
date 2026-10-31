/**
 * TheDiscDB (thediscdb.com, its open data at github.com/TheDiscDb/data): what people who scanned a DVD
 * found on it, with a name, a kind and the exact length of each title. Only Region 1 DVDs are used.
 *
 * The data is a folder of JSON per release, so one listing of the whole repository (kept for a day)
 * says which movies it has, and a movie's own files are then fetched from raw.githubusercontent.com.
 */

import type { NameEntry, NameSource } from '../src/types/discs';

const TREE =
  'https://api.github.com/repos/TheDiscDb/data/git/trees/main?recursive=1';
const RAW = 'https://raw.githubusercontent.com/TheDiscDb/data/main/';
const SITE = 'https://github.com/TheDiscDb/data/tree/main/data/movie/';
const INDEX_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 20000;
const MAX_FILES = 12;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** "Duma (2005)" -> "duma 2005": for comparing folder names that differ in punctuation. */
export function folderKey(name: string): string {
  return name
    .replace(/½/g, ' 1 2 ')
    .normalize('NFKD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "0:06:00" or "6:00" as seconds, or null. */
export function clockSeconds(text: unknown): number | null {
  if (typeof text !== 'string') return null;
  const parts = text.split(':').map(Number);
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some((p) => !Number.isFinite(p))
  ) {
    return null;
  }
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds > 0 ? seconds : null;
}

const KINDS: Record<string, string | null> = {
  Trailer: 'Trailers',
  Featurette: 'Featurettes',
  DeletedScene: 'Deleted Scenes',
  Short: 'Shorts',
  Interview: 'Interviews',
  BehindTheScenes: 'Behind The Scenes',
  Scene: 'Scenes',
  Other: 'Other',
};

/** The extras on one disc: every title that is named and is not the movie. */
export function discExtras(disc: unknown): NameEntry[] {
  const out: NameEntry[] = [];
  const titles = (disc as { Titles?: unknown[] } | null)?.Titles;
  for (const title of Array.isArray(titles) ? titles : []) {
    const t = title as {
      Duration?: unknown;
      Item?: { Title?: unknown; Type?: unknown };
    };
    const text = typeof t.Item?.Title === 'string' ? t.Item.Title.trim() : '';
    const type = typeof t.Item?.Type === 'string' ? t.Item.Type : '';
    if (!text || type === 'MainMovie') continue;
    out.push({
      text,
      depth: 1,
      seconds: clockSeconds(t.Duration),
      kind: KINDS[type] ?? null,
    });
  }
  return out;
}

/** Whether a release's region code includes Region 1 ("1", or "A,B,C; 1"). */
export function isRegionOne(code: unknown): boolean {
  return typeof code === 'string' && /(^|[^0-9])1([^0-9]|$)/.test(code);
}

interface Index {
  at: number;
  /** movie folder (as TheDiscDB names it) -> release folder -> disc file paths */
  movies: Map<string, Map<string, string[]>>;
}

let index: Index | null = null;

export function clearDiscDbCache(): void {
  index = null;
}

async function getJson(fetcher: Fetcher, url: string): Promise<unknown> {
  const response = await fetcher(url, {
    headers: { 'User-Agent': 'frame-shift-video (home media server)' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`TheDiscDB answered ${response.status}`);
  return response.json();
}

async function loadIndex(fetcher: Fetcher, now: number): Promise<Index> {
  if (index && now - index.at < INDEX_MS) return index;
  const tree = (await getJson(fetcher, TREE)) as {
    tree?: { path: string; type: string }[];
  };
  const movies = new Map<string, Map<string, string[]>>();
  for (const entry of tree.tree ?? []) {
    const match = entry.path.match(
      /^data\/movie\/([^/]+)\/([^/]+)\/(disc\d+\.json)$/,
    );
    if (!match) continue;
    const [, movie, release] = match as unknown as [string, string, string];
    const releases = movies.get(movie) ?? new Map<string, string[]>();
    releases.set(release, [...(releases.get(release) ?? []), entry.path]);
    movies.set(movie, releases);
  }
  index = { at: now, movies };
  return index;
}

/**
 * What TheDiscDB has for a movie folder name ("Duma (2005)"): one list per Region 1 DVD disc that has
 * extras. Empty when it does not have the movie, and when it cannot be reached.
 */
export async function discDbSources(
  movie: string,
  fetcher: Fetcher = fetch,
  now: number = Date.now(),
): Promise<NameSource[]> {
  try {
    const { movies } = await loadIndex(fetcher, now);
    const wanted = folderKey(movie);
    const folder = [...movies.keys()].find(
      (name) => folderKey(name) === wanted,
    );
    if (!folder) return [];
    const out: NameSource[] = [];
    let files = 0;
    for (const [release, discs] of movies.get(folder)!) {
      const base = `data/movie/${folder}/${release}`;
      const info = (await getJson(
        fetcher,
        `${RAW}${encodeURI(`${base}/release.json`)}`,
      ).catch(() => null)) as { RegionCode?: unknown; Title?: unknown } | null;
      if (!info || !isRegionOne(info.RegionCode)) continue;
      for (const path of discs) {
        if (++files > MAX_FILES) return out;
        const disc = (await getJson(fetcher, `${RAW}${encodeURI(path)}`).catch(
          () => null,
        )) as { Format?: unknown } | null;
        if (!disc || disc.Format !== 'DVD') continue;
        const features = discExtras(disc);
        if (features.length === 0) continue;
        out.push({
          source: 'TheDiscDB',
          page: folder,
          url: `${SITE}${encodeURIComponent(folder)}/${encodeURIComponent(release)}`,
          release: typeof info.Title === 'string' ? info.Title : release,
          features,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}
