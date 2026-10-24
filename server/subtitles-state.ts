/**
 * The Discs page's side of the subtitle converter (disc-subs on the host). Like the ripper it is
 * files in the DVDs folder: the converter writes `_subs/index.json` (every movie file and its
 * subtitle tracks), `_subs/current.json` (what it is doing) and `_subs/done/*.json` (what it
 * did), and reads a request file for each movie to convert in `_subs/queue/`. The page also
 * writes `_settings/subs`, 1 or 0, which says whether new discs are converted by themselves.
 */

import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { discsDir } from './disc-state';
import type {
  SubtitleFile,
  SubtitleRequest,
  SubtitleResult,
  SubtitlesState,
  SubtitleTrack,
} from '../src/types/subtitles';

const MAX_RECENT = 40;

async function readText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

async function readJson(file: string): Promise<unknown> {
  const text = await readText(file);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The requests waiting, as the relative paths they ask for. */
async function readQueued(dir: string): Promise<string[]> {
  const folder = path.join(dir, '_subs', 'queue');
  let names: string[];
  try {
    names = await fs.readdir(folder);
  } catch {
    return [];
  }
  const queued: string[] = [];
  for (const name of names.filter((n) => n.endsWith('.req')).sort()) {
    const text = await readText(path.join(folder, name));
    const line = text?.split('\n').find((l) => l.startsWith('path='));
    if (line) queued.push(line.slice('path='.length));
  }
  return queued;
}

function readTrack(value: unknown): SubtitleTrack | null {
  if (!isRecord(value)) return null;
  return {
    language: typeof value.language === 'string' ? value.language : 'und',
    codec: typeof value.codec === 'string' ? value.codec : '',
    name: typeof value.name === 'string' ? value.name : '',
    default: value.default === true,
    forced: value.forced === true,
  };
}

/** What the page shows about subtitles. */
export async function readSubtitlesState(
  dir: string = discsDir(),
): Promise<SubtitlesState> {
  const index = await readJson(path.join(dir, '_subs', 'index.json'));
  const autoText = await readText(path.join(dir, '_settings', 'subs'));
  const auto = autoText === null ? true : autoText.trim() !== '0';

  const currentRaw = await readJson(path.join(dir, '_subs', 'current.json'));
  const current =
    isRecord(currentRaw) && typeof currentRaw.path === 'string'
      ? {
          path: currentRaw.path,
          step: typeof currentRaw.step === 'string' ? currentRaw.step : '',
          done: typeof currentRaw.done === 'number' ? currentRaw.done : null,
          total: typeof currentRaw.total === 'number' ? currentRaw.total : null,
        }
      : null;

  const queued = new Set(await readQueued(dir));

  const files: SubtitleFile[] = [];
  let updated: number | null = null;
  if (isRecord(index) && Array.isArray(index.files)) {
    updated = typeof index.updated === 'number' ? index.updated : null;
    for (const raw of index.files) {
      if (!isRecord(raw) || typeof raw.path !== 'string') continue;
      const tracks = (Array.isArray(raw.tracks) ? raw.tracks : [])
        .map(readTrack)
        .filter((t): t is SubtitleTrack => t !== null);
      const status =
        current?.path === raw.path
          ? 'converting'
          : queued.has(raw.path)
            ? 'queued'
            : null;
      files.push({
        path: raw.path,
        tracks,
        pictures: tracks.filter((t) => t.codec === 'picture').length,
        status,
      });
    }
  }

  const recent: SubtitleResult[] = [];
  try {
    const folder = path.join(dir, '_subs', 'done');
    for (const name of await fs.readdir(folder)) {
      const raw = await readJson(path.join(folder, name));
      if (!isRecord(raw) || typeof raw.path !== 'string') continue;
      recent.push({
        path: raw.path,
        ok: raw.ok === true,
        message: typeof raw.message === 'string' ? raw.message : '',
        at: typeof raw.at === 'number' ? raw.at : 0,
      });
    }
  } catch {
    // Nothing converted yet.
  }
  recent.sort((a, b) => b.at - a.at);

  return {
    available: index !== null,
    auto,
    updated,
    files,
    current,
    recent: recent.slice(0, MAX_RECENT),
  };
}

/** A movie file the converter may be asked about: relative, inside the folder, an .mkv. */
export function cleanSubtitlePath(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Say which file');
  }
  const text = value.trim();
  if (
    text.startsWith('/') ||
    text.includes('\\') ||
    text.includes('\0') ||
    text.length > 400
  ) {
    throw new Error('That is not a file in the DVDs folder');
  }
  const parts = text.split('/');
  if (
    parts.some((p) => p === '' || p === '..' || p === '.') ||
    parts[0].startsWith('_') ||
    !text.toLowerCase().endsWith('.mkv')
  ) {
    throw new Error('That is not a movie file in the DVDs folder');
  }
  return text;
}

async function writeRequest(dir: string, relative: string): Promise<void> {
  const folder = path.join(dir, '_subs', 'queue');
  await fs.mkdir(folder, { recursive: true });
  // Written here as root and cleaned up by the converter as another user, so open to both.
  await fs.chmod(folder, 0o777).catch(() => undefined);
  // The same name the converter gives, so asking twice is one request.
  const name = createHash('md5').update(relative).digest('hex').slice(0, 12);
  const file = path.join(folder, `${name}.req`);
  try {
    await fs.writeFile(
      file,
      `path=${relative}\nat=${Math.floor(Date.now() / 1000)}\n`,
      { flag: 'wx', mode: 0o666 },
    );
    await fs.chmod(file, 0o666).catch(() => undefined);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
}

/** Asks for one file, or every file with picture subtitles, to be converted. Returns how many. */
export async function requestSubtitles(
  dir: string,
  request: SubtitleRequest,
): Promise<number> {
  if ('all' in request) {
    const state = await readSubtitlesState(dir);
    const wanted = state.files.filter(
      (f) => f.pictures > 0 && f.status === null,
    );
    for (const file of wanted)
      await writeRequest(dir, cleanSubtitlePath(file.path));
    return wanted.length;
  }
  const relative = cleanSubtitlePath(request.path);
  const state = await readSubtitlesState(dir);
  const known = state.files.find((f) => f.path === relative);
  if (!known) throw new Error('That file is not in the list of movies');
  if (known.pictures === 0) throw new Error('It has no picture subtitles');
  await writeRequest(dir, relative);
  return 1;
}

/** Turns converting the subtitles of new discs on or off. */
export async function setSubtitlesAuto(
  dir: string,
  enabled: boolean,
): Promise<void> {
  await fs.mkdir(path.join(dir, '_settings'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '_settings', 'subs'),
    enabled ? '1\n' : '0\n',
  );
}
