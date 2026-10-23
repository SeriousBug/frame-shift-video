/**
 * Types for the Discs page: the DVD ripper on the server, as seen from the files it
 * leaves in the DVDs folder.
 */

/** The drive, as last reported by the ripper's host-side helper. */
export interface DiscDrive {
  /** Whether a disc is in the drive */
  media: boolean;
  /** The disc's label, empty when there is no disc */
  label: string;
  /** When the helper last reported, in seconds since the epoch */
  updated: number | null;
  /** Whether the helper reported recently enough to trust */
  alive: boolean;
}

/** What the ripper is doing, as it reported it. */
export interface DiscRun {
  state: 'running' | 'idle';
  name: string;
  step: string;
  /** Seconds since the epoch */
  updated: number;
}

/** A note for the next disc that goes in, so it is named or filed as TV right away. */
export interface DiscNext {
  /**
   * The note is for the disc already being ripped (a movie, named while it is read), not for
   * the one after it
   */
  current?: boolean;
  mode: 'movie' | 'tv';
  name?: string;
  show?: string;
  season?: number;
  episode?: number;
}

/** A note the ripper left because something needs a person. */
export interface DiscAttention {
  /** The file name, which is what dismisses it */
  file: string;
  /** The disc it is about */
  name: string;
  lines: string[];
}

/** A disc that is being copied, extracted or converted. */
export interface DiscWorking {
  name: string;
  /** The last lines of its log */
  lines: string[];
  /** Whether its titles have been queued in Frame Shift */
  queued: boolean;
}

/** What TMDB made of a parked disc's label, left beside it by the ripper. */
export interface DiscSuggestion {
  show?: string;
  season?: number;
  disc?: number;
}

/** One match from a TMDB search, to pick from. */
export interface TmdbResult {
  kind: 'movie' | 'tv';
  id: number;
  /** "Title (Year)", already safe to use as a name */
  name: string;
  /** A movie's length, or how many seasons a show has */
  size: string;
  overview: string;
  /** TMDB's poster path, or empty */
  poster: string;
}

/** A disc that was copied and is waiting to be told what it is. */
export interface DiscParked {
  /** Its folder name, which is what a request to convert it is made by */
  name: string;
  suggestion: DiscSuggestion | null;
}

export interface DiscsState {
  /** Whether the DVDs folder exists on the server */
  available: boolean;
  /** Whether the ripper ejects a disc when it is done with it */
  eject: boolean;
  /** Whether a disc that goes in is scanned and ripped without being asked */
  autoScan: boolean;
  /** Whether only a movie is made from a disc, with none of its extras */
  movieOnly: boolean;
  drive: DiscDrive | null;
  run: DiscRun | null;
  next: DiscNext | null;
  attention: DiscAttention[];
  working: DiscWorking[];
  /** Discs copied and waiting to be told what they are, by folder name */
  parked: DiscParked[];
  /** Finished folders whose name has no year in it, which Plex wants */
  needsYear: string[];
  /** How many finished folders there are */
  finishedCount: number;
}

/** What the page can ask the host to do. */
export type DiscCommand =
  | { action: 'eject' }
  | { action: 'rip'; mode: 'movie'; name?: string; image?: string }
  | {
      action: 'rip';
      mode: 'tv';
      show: string;
      season: number;
      episode?: number;
      image?: string;
    }
  | { action: 'rename'; old: string; new: string }
  /** Ask TMDB which movie a finished folder is, and rename it Title (Year) */
  | { action: 'match'; old: string }
  /** Search TMDB for movies, shows or either; the query may be a TMDB or IMDb address */
  | {
      action: 'search';
      kind: 'movie' | 'tv' | 'any';
      query: string;
      year?: number;
    };

export interface DiscCommandResult {
  /** Whether the host has answered yet */
  done: boolean;
  ok?: boolean;
  message?: string;
}
