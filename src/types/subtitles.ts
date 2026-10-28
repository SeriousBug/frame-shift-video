/** One subtitle track of a movie file. `codec` is "picture" for a DVD's picture subtitles. */
export interface SubtitleTrack {
  language: string;
  codec: string;
  name: string;
  default: boolean;
  forced: boolean;
}

/** A movie file under the DVDs folder, with its subtitle tracks. */
export interface SubtitleFile {
  /** Relative to the DVDs folder */
  path: string;
  tracks: SubtitleTrack[];
  /** How many of the tracks are picture subtitles that can be converted */
  pictures: number;
  /** Has text subtitles that were not cleaned with the current rules */
  needsClean: boolean;
  /** Waiting its turn, or being converted now */
  status: 'queued' | 'converting' | null;
}

/** The file as it was before its subtitles were converted, kept until someone deletes it. */
export interface HeldFile {
  /** The movie file it belongs to, relative to the DVDs folder */
  path: string;
  /** Bytes */
  size: number;
  /** When it was set aside, unix seconds */
  at: number;
  /** 0 for the newest copy of this movie, which "put back" brings back; 1 and up are older */
  version: number;
}

export interface SubtitleResult {
  /** The name of its record, to dismiss it by */
  id: string;
  path: string;
  ok: boolean;
  message: string;
  /** Unix seconds */
  at: number;
  /** Words that were corrected, as "old → new" (the first few) */
  details: string[];
}

export interface SubtitlesState {
  /** Whether the DVDs folder (and the converter's list of files) is there */
  available: boolean;
  /** Whether the subtitles of new discs are converted by themselves */
  auto: boolean;
  /** When the list of files was made, unix seconds, or null */
  updated: number | null;
  files: SubtitleFile[];
  /** Old copies kept from before conversions, newest first */
  held: HeldFile[];
  /** The file being converted now, and where it is */
  current: {
    path: string;
    step: string;
    done: number | null;
    total: number | null;
  } | null;
  /** The run of requests being worked through: how many there were and how many are finished */
  batch: {
    kind: 'convert' | 'recheck' | 'mixed';
    total: number;
    done: number;
  } | null;
  /** What was converted last, newest first */
  recent: SubtitleResult[];
}

/** What can be asked: one file, or every file that still has picture subtitles. */
export type SubtitleRequest = { path: string } | { all: true };

/** Clean the text subtitles already in a file, or in every file that needs it. */
export type SubtitleCleanRequest = { path: string } | { all: true };

/** What can be taken off the page: a waiting file, every waiting file, or finished entries. */
export type SubtitleDismiss =
  | { queued: string }
  | { queue: 'all' }
  | { result: string }
  | { results: 'all' };
