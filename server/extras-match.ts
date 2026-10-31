/**
 * Compares what the listener (eyes.py) read and heard in an extra with the bonus-feature names DVD
 * Fandom lists for its movie, and says whether one of them is clearly it.
 *
 * Like Shelver's auto-match it is careful: a name is suggested only when the evidence is clear (the
 * title card reads it, or it is said and also written, and nothing else fits nearly as well), and
 * every answer says why. Everything else is left for the person, with what was seen and heard, so
 * they still have something to go on. Nothing is renamed by this; a person presses a button.
 */

import type { FandomHint } from '../src/types/discs';

export interface Look {
  seconds: number;
  ocr: { t: number; lines: string[] }[];
  speech: { start: number; end: number; text: string }[];
}

export interface Candidate {
  /** The name as it would be a file's name */
  name: string;
  /** The extras folder its place on the page suggests, if it suggests one */
  kind: string | null;
  /** The name's words that have to turn up */
  words: string[];
}

export interface Suggestion {
  state: 'matched' | 'unsure' | 'none';
  /** One sentence saying why */
  note: string;
  name?: string;
  kind?: string | null;
  /** What was written on the video and what was said in it, for a person to judge by */
  saw: string;
  heard: string;
}

const STOP = new Set([
  'the',
  'a',
  'an',
  'of',
  'and',
  'to',
  'in',
  'on',
  'for',
  'with',
  'from',
  'at',
  'is',
  'it',
  'by',
  'or',
  'as',
]);

/** The folder a wiki heading or a name's own words point to. */
const KINDS: [RegExp, string][] = [
  [/deleted|extended|alternate scene|outtake/i, 'Deleted Scenes'],
  [/behind the scenes|making of|the making/i, 'Behind The Scenes'],
  [/interview/i, 'Interviews'],
  [/featurette|documentary/i, 'Featurettes'],
  [/trailer|sneak peek|preview|teaser|promo/i, 'Trailers'],
  [/short|bonus episode/i, 'Shorts'],
];

export function kindOf(...texts: (string | null)[]): string | null {
  for (const text of texts) {
    if (!text) continue;
    for (const [pattern, kind] of KINDS) if (pattern.test(text)) return kind;
  }
  return null;
}

/** Lower case, no accents or punctuation, "½" as "1/2": for comparing what was said with a name. */
export function words(text: string): string[] {
  return (
    text
      // Before normalising, which would turn "½" into "1⁄2".
      .replace(/\u00bd/g, ' 1 2 ')
      .normalize('NFKD')
      .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
  );
}

/** A name from the wiki's words, as a file name (no characters a share dislikes). */
export function fileName(text: string): string {
  return text
    .replace(/^["“]|["”]$/g, '')
    .replace(/:\s*/g, ' - ')
    .replace(/["“”<>|*?\\/]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The names a movie's wiki list offers: its items that have nothing under them (a heading such as
 * "Deleted Scenes" is a kind, not a name; what is under it is the names), with the kind they sit under.
 */
export function candidates(hint: FandomHint): Candidate[] {
  const lines = hint.features ?? [];
  const out: Candidate[] = [];
  const parents: (string | null)[] = [];
  lines.forEach((line, index) => {
    if (line.depth === 0) {
      parents.length = 0;
      return;
    }
    parents.length = line.depth - 1;
    parents[line.depth - 1] = line.text;
    const next = lines[index + 1];
    if (next && next.depth > line.depth) return;
    const name = fileName(line.text);
    const significant = words(name).filter((w) => !STOP.has(w));
    if (!name || significant.length === 0) return;
    out.push({
      name,
      kind: kindOf(...parents.slice(0, -1).reverse(), line.text),
      words: significant,
    });
  });
  return out;
}

/** The edit distance between two short words, capped: only "off by one letter" matters here. */
function near(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1)
    return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const restA = a.slice(i);
  const restB = b.slice(i);
  return (
    restA.slice(1) === restB.slice(1) ||
    restA.slice(1) === restB ||
    restA === restB.slice(1)
  );
}

/** How much of the name's words are among the heard words (a word off by one letter counts). */
function coverage(name: string[], heard: string[]): number {
  if (name.length === 0) return 0;
  const hit = name.filter((w) => heard.some((h) => near(w, h))).length;
  return hit / name.length;
}

/** Whether the name's words are said one after another, in order, with at most one word between. */
function inOrder(name: string[], heard: string[]): boolean {
  for (let start = 0; start < heard.length; start++) {
    let at = start;
    let gaps = 0;
    let ok = true;
    for (const w of name) {
      let found = -1;
      for (let j = at; j < Math.min(at + 2, heard.length); j++) {
        if (near(w, heard[j]!)) {
          found = j;
          break;
        }
      }
      if (found < 0) {
        ok = false;
        break;
      }
      if (found > at) gaps++;
      at = found + 1;
    }
    if (ok && gaps <= 1) return true;
  }
  return false;
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** Compares one extra's look with the names. */
export function matchExtra(look: Look, names: Candidate[]): Suggestion {
  const written = look.ocr.flatMap((m) => m.lines);
  const spoken = look.speech.map((s) => s.text);
  const saw = written.join(' / ');
  const heard = spoken.join(' ');
  if (names.length === 0) {
    return {
      state: 'none',
      note: 'DVD Fandom lists no bonus-feature names for this movie, so there is nothing to compare with.',
      saw,
      heard,
    };
  }
  if (written.length === 0 && spoken.length === 0) {
    return {
      state: 'none',
      note: 'Nothing is written on it or said in it that could be read, so it has to be named by watching it.',
      saw,
      heard,
    };
  }
  const writtenWords = words(written.join(' '));
  const spokenWords = words(heard);

  const scored = names
    .map((candidate) => {
      const onScreen = coverage(candidate.words, writtenWords);
      const saidOut = coverage(candidate.words, spokenWords);
      const inSpeech =
        candidate.words.length >= 3 && inOrder(candidate.words, spokenWords);
      // A title card that reads the whole name, or a name both written and said, is clear.
      // Speech alone is clear only for a longer name said in order (a short one is said in passing).
      const strong =
        (candidate.words.length >= 2 && onScreen >= 0.99) ||
        (candidate.words.length >= 2 && onScreen >= 0.6 && saidOut >= 0.6) ||
        inSpeech;
      const score = Math.max(
        onScreen,
        0.9 * saidOut * (inSpeech ? 1 : 0.7),
        (onScreen + saidOut) / 2,
      );
      return { candidate, onScreen, saidOut, strong, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0]!;
  const rivals = scored.filter(
    (s) => s !== best && s.score >= 0.6 && s.score >= best.score - 0.25,
  );
  const because = (s: (typeof scored)[number]) => {
    const parts: string[] = [];
    const card = look.ocr.find(
      (m) => coverage(s.candidate.words, words(m.lines.join(' '))) >= 0.6,
    );
    if (s.onScreen >= 0.6 && card)
      parts.push(`the writing at ${clock(card.t)} reads it`);
    if (s.saidOut >= 0.6)
      parts.push('it is said in the first minute and a half');
    return parts.join(' and ');
  };

  if (best.strong && rivals.length === 0) {
    return {
      state: 'matched',
      name: best.candidate.name,
      kind: best.candidate.kind,
      note: `Looks like “${best.candidate.name}”: ${because(best)}.`,
      saw,
      heard,
    };
  }
  if (best.score >= 0.6) {
    const others = [best, ...rivals].map((s) => `“${s.candidate.name}”`);
    return {
      state: 'unsure',
      name: best.candidate.name,
      kind: best.candidate.kind,
      note:
        rivals.length > 0
          ? `Could be ${others.join(' or ')}; it is not clear which.`
          : `Might be “${best.candidate.name}”, but only part of it was found.`,
      saw,
      heard,
    };
  }
  return {
    state: 'none',
    note: 'What was written or said does not look like any of the names DVD Fandom lists.',
    saw,
    heard,
  };
}

/**
 * Matches all of a movie's looks, and takes back a name that two extras both matched (one of them
 * is wrong, and which is not clear), saying so.
 */
export function matchMovie(
  looks: Record<string, Look>,
  names: Candidate[],
): Record<string, Suggestion> {
  const out: Record<string, Suggestion> = {};
  for (const [path, look] of Object.entries(looks))
    out[path] = matchExtra(look, names);
  const claimed = new Map<string, string[]>();
  for (const [path, s] of Object.entries(out)) {
    if (s.state === 'matched' && s.name)
      claimed.set(s.name, [...(claimed.get(s.name) ?? []), path]);
  }
  for (const paths of claimed.values()) {
    if (paths.length < 2) continue;
    for (const path of paths) {
      const s = out[path]!;
      out[path] = {
        ...s,
        state: 'unsure',
        note: `Two extras look like “${s.name}”, so it is not clear which is right.`,
      };
    }
  }
  return out;
}
