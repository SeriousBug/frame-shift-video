/**
 * The Discs page's side of the DVD ripper. The ripper runs on the host; Frame Shift
 * sees the same share, so the two trade small files in the DVDs folder:
 *
 *   _status/drive.txt, _status/run.txt   written by the host: the drive and the ripper
 *   ATTENTION - <name>.txt               written by the ripper: something needs a person
 *   _converting/<disc>/STATUS.txt        written by the ripper: a disc's log
 *   _images/<disc>/                      a copied disc waiting to be told what it is
 *   _images/<disc>/suggest.txt           written by the ripper: what TMDB made of its label
 *   _settings/eject                      written here: 1 or 0, read by the ripper
 *   _settings/next                       written here: a note for the next disc
 *   _commands/<id>.cmd                   written here, run by the host: eject, rip, rename, match,
 *                                        search (TMDB; the host holds the token)
 *   _commands/done/<id>.result           written by the host: "ok" or "error", then a sentence
 *
 * Everything written here is made of a small set of checked values, and the host
 * checks it again, so the page can only ask for those five things.
 */

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
  DiscAttention,
  DiscCommand,
  DiscCommandResult,
  DiscDrive,
  DiscNext,
  DiscParked,
  DiscRun,
  DiscsState,
  DiscWorking,
} from '../src/types/discs';

/** The drive helper reports every 30 seconds at least; past this it is not running. */
const DRIVE_ALIVE_SECONDS = 90;
const MAX_NAME_LENGTH = 100;
const MAX_LIST = 100;

/** Where the ripper's folder is, as this server sees it. */
export function discsDir(): string {
  if (process.env.DISC_RIP_DIR) return process.env.DISC_RIP_DIR;
  return path.join(process.env.FRAME_SHIFT_HOME || '/', 'DVDs');
}

/**
 * A name that is safe in a file name and in the ripper's own rules: letters, digits,
 * spaces and ( ) & , . ' { } - only. Throws when nothing is left.
 */
export function cleanName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('A name is needed');
  const cleaned = value
    .replace(/[^A-Za-z0-9 ()&,.'{}-]/g, '')
    .replace(/ +/g, ' ')
    .trim();
  if (!cleaned) throw new Error('The name has no usable characters');
  if (cleaned.length > MAX_NAME_LENGTH) throw new Error('The name is too long');
  return cleaned;
}

/** A whole number from 1 to 999. */
export function cleanNumber(value: unknown, what: string): number {
  const number = typeof value === 'string' ? Number(value) : value;
  if (
    typeof number !== 'number' ||
    !Number.isInteger(number) ||
    number < 1 ||
    number > 999
  ) {
    throw new Error(`${what} must be a whole number from 1 to 999`);
  }
  return number;
}

/** A four-digit year, for narrowing a TMDB search. */
export function cleanYear(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1888 ||
    value > 2100
  ) {
    throw new Error('The year must be a four-digit year');
  }
  return value;
}

/** Reads a file, or null when it is not there. */
async function readText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

/** key=value lines. */
function parseKeyValues(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const at = line.indexOf('=');
    if (at > 0) values[line.slice(0, at)] = line.slice(at + 1).trim();
  }
  return values;
}

async function listDirs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function lastLines(text: string, count: number): string[] {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-count);
}

async function readDrive(dir: string, now: number): Promise<DiscDrive | null> {
  const text = await readText(path.join(dir, '_status', 'drive.txt'));
  if (text === null) return null;
  const values = parseKeyValues(text);
  const updated = Number(values.updated) || null;
  return {
    media: values.media === '1',
    label: values.label ?? '',
    updated,
    alive: updated !== null && now - updated < DRIVE_ALIVE_SECONDS,
  };
}

async function readRun(dir: string): Promise<DiscRun | null> {
  const text = await readText(path.join(dir, '_status', 'run.txt'));
  if (text === null) return null;
  const values = parseKeyValues(text);
  return {
    state: values.state === 'running' ? 'running' : 'idle',
    name: values.name ?? '',
    step: values.step ?? '',
    updated: Number(values.updated) || 0,
  };
}

async function readNext(dir: string): Promise<DiscNext | null> {
  const text = await readText(path.join(dir, '_settings', 'next'));
  if (text === null) return null;
  const values = parseKeyValues(text);
  if (values.mode === 'tv' && values.show && values.season) {
    return {
      mode: 'tv',
      show: values.show,
      season: Number(values.season),
      episode: values.episode ? Number(values.episode) : 1,
    };
  }
  if (values.mode === 'movie') {
    return { mode: 'movie', ...(values.name ? { name: values.name } : {}) };
  }
  return null;
}

async function readAttention(dir: string): Promise<DiscAttention[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const notes: DiscAttention[] = [];
  for (const file of names.sort()) {
    const match = /^ATTENTION - (.+)\.txt$/.exec(file);
    if (!match) continue;
    const text = (await readText(path.join(dir, file))) ?? '';
    notes.push({
      file,
      name: match[1]!,
      lines: text
        .split('\n')
        .map((line) => line.trimEnd())
        .filter(Boolean),
    });
  }
  return notes.slice(0, MAX_LIST);
}

/** Discs that were copied and parked, with the ripper's guess from TMDB when it left one. */
async function readParked(dir: string): Promise<DiscParked[]> {
  const folders = await listDirs(path.join(dir, '_images'));
  const parked: DiscParked[] = [];
  for (const name of folders.slice(0, MAX_LIST)) {
    const text = await readText(path.join(dir, '_images', name, 'suggest.txt'));
    const values = text === null ? {} : parseKeyValues(text);
    const season = Number(values.season);
    const disc = Number(values.disc);
    const suggestion = {
      ...(values.show ? { show: values.show } : {}),
      ...(Number.isInteger(season) && season > 0 ? { season } : {}),
      ...(Number.isInteger(disc) && disc > 0 ? { disc } : {}),
    };
    parked.push({
      name,
      suggestion: Object.keys(suggestion).length > 0 ? suggestion : null,
    });
  }
  return parked;
}

async function readWorking(dir: string): Promise<DiscWorking[]> {
  const folders = await listDirs(path.join(dir, '_converting'));
  const working: DiscWorking[] = [];
  for (const name of folders) {
    const folder = path.join(dir, '_converting', name);
    const log = await readText(path.join(folder, 'STATUS.txt'));
    const queued = (await readText(path.join(folder, 'submitted'))) !== null;
    working.push({ name, lines: lastLines(log ?? '', 6), queued });
  }
  return working.slice(0, MAX_LIST);
}

/** Everything the Discs page shows, from the files in the DVDs folder. */
export async function readDiscsState(
  dir: string = discsDir(),
  now: number = Math.floor(Date.now() / 1000),
): Promise<DiscsState> {
  try {
    await fs.access(dir);
  } catch {
    return {
      available: false,
      eject: false,
      drive: null,
      run: null,
      next: null,
      attention: [],
      working: [],
      parked: [],
      needsYear: [],
      finishedCount: 0,
    };
  }

  const ejectText = await readText(path.join(dir, '_settings', 'eject'));
  const folders = (await listDirs(dir)).filter((name) => !name.startsWith('_'));
  return {
    available: true,
    // On unless it was switched off: the ripper ejects a disc once it is not needed.
    eject: ejectText === null ? true : ejectText.trim() !== '0',
    drive: await readDrive(dir, now),
    run: await readRun(dir),
    next: await readNext(dir),
    attention: await readAttention(dir),
    working: await readWorking(dir),
    parked: await readParked(dir),
    needsYear: folders
      .filter((name) => !/\(\d{4}\)/.test(name))
      .slice(0, MAX_LIST),
    finishedCount: folders.length,
  };
}

/** Turns ejecting on or off for the ripper. */
export async function setEject(dir: string, enabled: boolean): Promise<void> {
  await fs.mkdir(path.join(dir, '_settings'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '_settings', 'eject'),
    enabled ? '1\n' : '0\n',
  );
}

/** Leaves a note for the next disc, or takes it back when null. */
export async function setNext(
  dir: string,
  note: DiscNext | null,
): Promise<void> {
  const file = path.join(dir, '_settings', 'next');
  if (note === null) {
    await fs.rm(file, { force: true });
    return;
  }
  const lines: string[] = [];
  if (note.mode === 'tv') {
    lines.push(
      'mode=tv',
      `show=${cleanName(note.show)}`,
      `season=${cleanNumber(note.season, 'The season')}`,
      `episode=${cleanNumber(note.episode ?? 1, 'The first episode')}`,
    );
  } else if (note.mode === 'movie') {
    lines.push('mode=movie');
    if (note.name) lines.push(`name=${cleanName(note.name)}`);
  } else {
    throw new Error('Say whether the next disc is a movie or a TV show');
  }
  await fs.mkdir(path.join(dir, '_settings'), { recursive: true });
  await fs.writeFile(file, lines.join('\n') + '\n');
}

/** Removes a note the ripper left. Only a file that is listed as one can go. */
export async function dismissAttention(
  dir: string,
  file: string,
): Promise<void> {
  const notes = await readAttention(dir);
  if (!notes.some((note) => note.file === file)) {
    throw new Error('No such note');
  }
  await fs.rm(path.join(dir, file), { force: true });
}

/** Checks a request from the page, and turns it into the lines the host reads. */
export function commandLines(command: DiscCommand): string[] {
  switch (command.action) {
    case 'eject':
      return ['action=eject'];
    case 'rip': {
      const lines = ['action=rip'];
      if (command.image) lines.push(`image=${cleanFolder(command.image)}`);
      if (command.mode === 'tv') {
        lines.push(
          'mode=tv',
          `show=${cleanName(command.show)}`,
          `season=${cleanNumber(command.season, 'The season')}`,
          `episode=${cleanNumber(command.episode ?? 1, 'The first episode')}`,
        );
      } else if (command.mode === 'movie') {
        lines.push('mode=movie');
        if (command.name) lines.push(`name=${cleanName(command.name)}`);
      } else {
        throw new Error('Say whether it is a movie or a TV show');
      }
      return lines;
    }
    case 'rename':
      return [
        'action=rename',
        `old=${cleanFolder(command.old)}`,
        `new=${cleanName(command.new)}`,
      ];
    case 'match':
      return ['action=match', `old=${cleanFolder(command.old)}`];
    case 'search': {
      if (
        command.kind !== 'movie' &&
        command.kind !== 'tv' &&
        command.kind !== 'any'
      ) {
        throw new Error('Search for a movie, a show or either');
      }
      const lines = [
        'action=search',
        `kind=${command.kind}`,
        `query=${cleanQuery(command.query)}`,
      ];
      if (command.year !== undefined) {
        lines.push(`year=${cleanYear(command.year)}`);
      }
      return lines;
    }
    default:
      throw new Error('Unknown request');
  }
}

/**
 * What a person typed into a TMDB search box. It can be a title or a pasted address, so
 * punctuation stays; control characters (a newline would start another line of the request)
 * do not.
 */
function cleanQuery(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('Type something to search for');
  // eslint-disable-next-line no-control-regex
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/ +/g, ' ')
    .trim();
  if (!cleaned) throw new Error('Type something to search for');
  if (cleaned.length > 200) throw new Error('That is too long to search for');
  return cleaned;
}

/** A folder name from the page: no slashes, no leading dot or underscore trickery. */
function cleanFolder(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value ||
    /[/\\\n]/.test(value) ||
    value.startsWith('.')
  ) {
    throw new Error('Not a folder name');
  }
  return value;
}

/** Hands a request to the host. Returns the id to ask the answer by. */
export async function sendCommand(
  dir: string,
  command: DiscCommand,
): Promise<string> {
  const lines = commandLines(command);
  const id = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const folder = path.join(dir, '_commands');
  await fs.mkdir(folder, { recursive: true });
  // Written whole and then renamed, so the host never reads half a request.
  const temp = path.join(folder, `.${id}.tmp`);
  await fs.writeFile(temp, lines.join('\n') + '\n');
  await fs.rename(temp, path.join(folder, `${id}.cmd`));
  return id;
}

/** The host's answer to a request, once there is one. */
export async function commandResult(
  dir: string,
  id: string,
): Promise<DiscCommandResult> {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error('Not a request id');
  const text = await readText(
    path.join(dir, '_commands', 'done', `${id}.result`),
  );
  if (text === null) return { done: false };
  const [status, ...message] = text.split('\n');
  return {
    done: true,
    ok: status?.trim() === 'ok',
    message: message.join('\n').trim(),
  };
}
