import { describe, expect, test } from 'bun:test';
import {
  candidates,
  fileName,
  kindOf,
  matchExtra,
  matchMovie,
  words,
  type Look,
} from '../../server/extras-match';
import type { FandomHint } from '../types/discs';

// From the live DVD Fandom pages (trimmed).
const STELLALUNA: FandomHint = {
  found: true,
  features: [
    { text: 'Featurettes', depth: 1 },
    { text: 'The Not-So-Scary World of Bats', depth: 2 },
    { text: 'Create Your Own Stellaluna', depth: 2 },
    { text: 'Learn to Draw Stellaluna', depth: 1 },
    { text: 'Sing-Along version', depth: 1 },
    { text: 'Previews', depth: 1 },
  ],
};

const LION_KING: FandomHint = {
  found: true,
  features: [
    { text: 'Disc 1', depth: 0 },
    { text: 'Hidden Mickey Hunt', depth: 1 },
    { text: 'Deleted Scenes', depth: 1 },
    { text: 'Opening Concept 1', depth: 2 },
    { text: 'Opening Concept 2', depth: 2 },
    { text: 'Old Fearless Buzz', depth: 2 },
    { text: 'Disc 2', depth: 0 },
    { text: 'Featurettes', depth: 1 },
    { text: 'Timon: Behind the Legend', depth: 2 },
    { text: '"Grazing in the Grass" Music Video Performed by Raven', depth: 2 },
    { text: 'Games & Activities', depth: 1 },
    { text: "Timon & Pumbaa's Virtual Safari 1.5", depth: 2 },
  ],
};

// What the listener really made of the fixture video (a title card, narration of the same words).
const BATS_CARD: Look = {
  seconds: 5.1,
  ocr: [{ t: 0.5, lines: ['THE NOT-SO-SCARY', 'WORLD OF BATS'] }],
  speech: [
    {
      start: 0,
      end: 4.7,
      text: 'Welcome to the not so scary world of bats, today we visit a real bat cave and meet the',
    },
  ],
};

const nothing = (): Look => ({ seconds: 60, ocr: [], speech: [] });

describe('the names a wiki list offers', () => {
  test('a heading is a kind and what is under it is the names', () => {
    const found = candidates(STELLALUNA);
    expect(found.map((c) => c.name)).toEqual([
      'The Not-So-Scary World of Bats',
      'Create Your Own Stellaluna',
      'Learn to Draw Stellaluna',
      'Sing-Along version',
      'Previews',
    ]);
    expect(found[0]!.kind).toBe('Featurettes');
    expect(found[0]!.words).toEqual(['not', 'so', 'scary', 'world', 'bats']);
  });

  test('"Disc 1" headings are not names, and a kind carries to what is under it', () => {
    const found = candidates(LION_KING);
    expect(found.map((c) => c.name)).not.toContain('Disc 1');
    expect(found.map((c) => c.name)).not.toContain('Deleted Scenes');
    expect(found.find((c) => c.name === 'Opening Concept 1')?.kind).toBe(
      'Deleted Scenes',
    );
    expect(
      found.find((c) => c.name === 'Timon - Behind the Legend')?.kind,
    ).toBe('Featurettes'); // the wiki puts it under Featurettes, so that is its kind
  });

  test('a name from the wiki is made safe as a file name', () => {
    expect(fileName('Music Video: "Teacher\'s Pet"')).toBe(
      "Music Video - Teacher's Pet",
    );
    expect(fileName('"Grazing in the Grass" Music Video')).toBe(
      'Grazing in the Grass Music Video',
    );
    expect(fileName('A/B <c> | d?')).toBe('AB c d');
  });

  test('no list gives no names', () => {
    expect(candidates({ found: false })).toEqual([]);
  });

  test('words ignores case, accents and punctuation, and reads ½ as 1 2', () => {
    expect(words('Café — THE Lion King 1½!')).toEqual([
      'cafe',
      'the',
      'lion',
      'king',
      '1',
      '1',
      '2',
    ]);
    expect(kindOf('Featurettes', null)).toBe('Featurettes');
    expect(kindOf(null, 'Music Video')).toBeNull();
  });
});

describe('matching one extra', () => {
  const names = candidates(STELLALUNA);

  test('a title card that reads the whole name is a match, with its kind and the reason', () => {
    const answer = matchExtra(BATS_CARD, names);
    expect(answer.state).toBe('matched');
    expect(answer.name).toBe('The Not-So-Scary World of Bats');
    expect(answer.kind).toBe('Featurettes');
    expect(answer.note).toContain('writing at 0:00 reads it');
    expect(answer.note).toContain('said in the first minute');
    expect(answer.saw).toBe('THE NOT-SO-SCARY / WORLD OF BATS');
    expect(answer.heard).toContain('scary world of bats');
  });

  test('a letter the reader got wrong does not stop it', () => {
    const look = {
      ...BATS_CARD,
      ocr: [{ t: 1, lines: ['THE NOT-SO-SCARV', 'WORLO OF BATS'] }],
      speech: [],
    };
    expect(matchExtra(look, names).state).toBe('matched');
  });

  test('a longer name said in order is a match even with no title card', () => {
    const look: Look = {
      seconds: 80,
      ocr: [],
      speech: [
        {
          start: 1,
          end: 5,
          text: 'Now, create your own Stellaluna, with paper.',
        },
      ],
    };
    expect(matchExtra(look, names).name).toBe('Create Your Own Stellaluna');
    expect(matchExtra(look, names).state).toBe('matched');
  });

  test('a short name only said in passing is not a match', () => {
    const look: Look = {
      seconds: 80,
      ocr: [],
      speech: [
        { start: 1, end: 5, text: 'We will see the previews of other movies.' },
      ],
    };
    expect(matchExtra(look, names).state).not.toBe('matched');
  });

  test('most of a name is unsure, not a match', () => {
    const look: Look = {
      seconds: 60,
      ocr: [{ t: 2, lines: ['NOT-SO-SCARY WORLD'] }],
      speech: [],
    };
    const answer = matchExtra(look, names);
    expect(answer.state).toBe('unsure');
    expect(answer.note).toContain('only part');
    expect(answer.name).toBe('The Not-So-Scary World of Bats');
  });

  test('a couple of words of a long name are not enough to suggest it', () => {
    const look: Look = {
      seconds: 60,
      ocr: [{ t: 2, lines: ['WORLD OF BATS'] }],
      speech: [],
    };
    expect(matchExtra(look, names).state).toBe('none');
  });

  test('two names that fit about equally are unsure and both are named', () => {
    const lion = candidates(LION_KING);
    const look: Look = {
      seconds: 90,
      ocr: [{ t: 1, lines: ['OPENING CONCEPT'] }],
      speech: [],
    };
    const answer = matchExtra(look, lion);
    expect(answer.state).toBe('unsure');
    expect(answer.note).toContain('Opening Concept 1');
    expect(answer.note).toContain('Opening Concept 2');
  });

  test('a full match with another name that fits as well is unsure, not a match', () => {
    const look: Look = {
      seconds: 90,
      ocr: [{ t: 1, lines: ['OPENING CONCEPT 1', 'OPENING CONCEPT 2'] }],
      speech: [],
    };
    const answer = matchExtra(look, candidates(LION_KING));
    expect(answer.state).toBe('unsure');
    expect(answer.note).toContain('not clear which');
  });

  test('a full match that another name only partly fits is still a match', () => {
    const look: Look = {
      seconds: 90,
      ocr: [{ t: 1, lines: ['OPENING CONCEPT 1'] }],
      speech: [],
    };
    const answer = matchExtra(look, candidates(LION_KING));
    expect(answer.state).toBe('matched');
    expect(answer.name).toBe('Opening Concept 1');
    expect(answer.kind).toBe('Deleted Scenes');
  });

  test('writing that is nothing like a name is no match, and the evidence is kept', () => {
    const look: Look = {
      seconds: 60,
      ocr: [{ t: 1, lines: ['DISNEY ENTERPRISES 2004'] }],
      speech: [{ start: 0, end: 2, text: 'Hello there.' }],
    };
    const answer = matchExtra(look, names);
    expect(answer.state).toBe('none');
    expect(answer.saw).toBe('DISNEY ENTERPRISES 2004');
    expect(answer.heard).toBe('Hello there.');
  });

  test('nothing to read or hear, and no list, are said plainly', () => {
    expect(matchExtra(nothing(), names).note).toContain('watching it');
    expect(matchExtra(BATS_CARD, []).note).toContain('nothing to compare');
  });
});

describe('matching a whole movie', () => {
  const names = candidates(STELLALUNA);

  test('each extra is matched on its own', () => {
    const out = matchMovie({ a: BATS_CARD, b: nothing() }, names);
    expect(out.a!.state).toBe('matched');
    expect(out.b!.state).toBe('none');
  });

  test('a name two extras both match is taken back from both', () => {
    const out = matchMovie({ a: BATS_CARD, b: BATS_CARD }, names);
    for (const key of ['a', 'b']) {
      expect(out[key]!.state).toBe('unsure');
      expect(out[key]!.note).toContain('Two extras look like');
    }
  });
});
