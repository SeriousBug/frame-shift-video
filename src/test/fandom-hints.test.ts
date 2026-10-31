import { beforeEach, describe, expect, test } from 'bun:test';
import {
  clearFandomCache,
  fandomHint,
  pickPage,
  readFeatures,
  readRuntime,
  splitMovie,
} from '../../server/fandom-hints';
import { discsExtrasHintHandler } from '../../server/handlers/discs';

// Trimmed from the live pages on dvd.fandom.com.
const TEACHERS_PET = `[[File:Teachers-pet-cover-art.jpg|thumb|180px]]
'''Teacher's Pet''' is the film adaption.
==Scene Selection==
#Opening/The Blue Fairy
==Bonus Features==
*Bonus Episode: "Muttamorphosis"
*Deleted Scenes
**Pretty Boy & Mr. Jolly On The Road
**N.E.A.T.O. Awards
*The Art Of Gary Baseman
*Music Video: "Teacher's Pet"
*Register Your DVD

==Sneak Peeks==
*''[[Aladdin: Platinum Edition|Aladdin: Special Edition]]''
`;

const LION_KING = `{{Movie DVD
|name = The Lion King 1 1/2
|time = Approx. 77 minutes
}}
==Bonus Features==
===Disc 1===
*Hidden Mickey Hunt
*Deleted Scenes
**Opening Concept 1
===Disc 2===
*Games & Activities
**Timon & Pumbaa's Virtual Safari 1.5
==Sneak Peeks==
*''[[Aladdin: Platinum Edition]]''
`;

const SEARCH: Record<string, string[]> = {
  "Teacher's Pet": [
    "Teacher's Pet (1958)",
    "Teacher's Pet (2004)",
    'Gimme Gimme Gimme',
  ],
  'The Lion King 1½': [
    'The Lion King 1 1/2',
    'The Lion King 1 1/2 (2012 Reissue)',
    'The Lion King',
  ],
  'Santa vs. Snowmen': ['The Snowman', 'The Santa Clause 2'],
};
const PAGES: Record<string, string> = {
  "Teacher's Pet (2004)": TEACHERS_PET,
  "Teacher's Pet (1958)": '==Bonus Features==\n*Wrong movie\n',
  'The Lion King 1 1/2': LION_KING,
};

let asked: string[];
let down: boolean;

function wiki(): typeof fetch {
  return (async (url: string) => {
    asked.push(String(url));
    if (down) throw new Error('offline');
    const params = new URL(String(url)).searchParams;
    if (params.get('list') === 'search') {
      const hits = SEARCH[params.get('srsearch')!] ?? [];
      return new Response(
        JSON.stringify({ query: { search: hits.map((title) => ({ title })) } }),
      );
    }
    return new Response(
      JSON.stringify({
        parse: { wikitext: { '*': PAGES[params.get('page')!] ?? '' } },
      }),
    );
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  asked = [];
  down = false;
  clearFandomCache();
});

describe('reading the wiki text', () => {
  test('splits the folder name into title and year', () => {
    expect(splitMovie("Teacher's Pet (2004)")).toEqual({
      title: "Teacher's Pet",
      year: '2004',
    });
    expect(splitMovie('Stellaluna')).toEqual({ title: 'Stellaluna', year: '' });
  });

  test('reads the bonus features with their depth, stopping at the next section', () => {
    expect(readFeatures(TEACHERS_PET)).toEqual([
      { text: 'Bonus Episode: "Muttamorphosis"', depth: 1 },
      { text: 'Deleted Scenes', depth: 1 },
      { text: 'Pretty Boy & Mr. Jolly On The Road', depth: 2 },
      { text: 'N.E.A.T.O. Awards', depth: 2 },
      { text: 'The Art Of Gary Baseman', depth: 1 },
      { text: 'Music Video: "Teacher\'s Pet"', depth: 1 },
      { text: 'Register Your DVD', depth: 1 },
    ]);
  });

  test('keeps Disc 1 and Disc 2 headings and reads the running time', () => {
    expect(readFeatures(LION_KING).map((l) => l.text)).toEqual([
      'Disc 1',
      'Hidden Mickey Hunt',
      'Deleted Scenes',
      'Opening Concept 1',
      'Disc 2',
      'Games & Activities',
      "Timon & Pumbaa's Virtual Safari 1.5",
    ]);
    expect(readFeatures(LION_KING)[0]!.depth).toBe(0);
    expect(readRuntime(LION_KING)).toBe('Approx. 77 minutes');
    expect(readRuntime(TEACHERS_PET)).toBeNull();
  });

  test('a page with no bonus features section gives none', () => {
    expect(readFeatures('==Scene Selection==\n#One\n')).toEqual([]);
  });
});

describe('picking the page', () => {
  test('takes the page of the right year, never another year of the same name', () => {
    const hits = ["Teacher's Pet (1958)", "Teacher's Pet (2004)"];
    expect(pickPage(hits, "Teacher's Pet", '2004')).toBe(
      "Teacher's Pet (2004)",
    );
    expect(pickPage(hits, "Teacher's Pet", '1999')).toBeNull();
    expect(
      pickPage(["Teacher's Pet (1958)"], "Teacher's Pet", '2004'),
    ).toBeNull();
  });

  test('takes a page without a year, but not a reissue or another movie', () => {
    expect(
      pickPage(
        ['The Lion King 1 1/2 (2012 Reissue)', 'The Lion King 1 1/2'],
        'The Lion King 1½',
        '2004',
      ),
    ).toBe('The Lion King 1 1/2');
    expect(
      pickPage(['The Lion King', 'The Snowman'], 'Stellaluna', ''),
    ).toBeNull();
  });
});

describe('looking a movie up', () => {
  test("finds the 2004 Teacher's Pet list and links its page", async () => {
    const hint = await fandomHint("Teacher's Pet (2004)", wiki());
    expect(hint.found).toBe(true);
    expect(hint.page).toBe("Teacher's Pet (2004)");
    expect(hint.url).toBe("https://dvd.fandom.com/wiki/Teacher's_Pet_(2004)");
    expect(hint.features?.[0]?.text).toBe('Bonus Episode: "Muttamorphosis"');
    expect(asked.some((u) => u.includes('Wrong'))).toBe(false);
  });

  test('a movie the wiki has no page for is not found', async () => {
    expect(await fandomHint('Santa vs. Snowmen (2020)', wiki())).toEqual({
      found: false,
    });
  });

  test('the wiki being down is not found, and is not remembered', async () => {
    down = true;
    expect(await fandomHint("Teacher's Pet (2004)", wiki())).toEqual({
      found: false,
    });
    down = false;
    expect((await fandomHint("Teacher's Pet (2004)", wiki())).found).toBe(true);
  });

  test('a found answer is kept for a day, a missing one for an hour', async () => {
    const t0 = 1_000_000;
    await fandomHint("Teacher's Pet (2004)", wiki(), t0);
    await fandomHint("Teacher's Pet (2004)", wiki(), t0 + 3_600_000 * 23);
    expect(asked.length).toBe(2);
    await fandomHint("Teacher's Pet (2004)", wiki(), t0 + 3_600_000 * 25);
    expect(asked.length).toBe(4);

    asked = [];
    await fandomHint('Santa vs. Snowmen (2020)', wiki(), t0);
    await fandomHint('Santa vs. Snowmen (2020)', wiki(), t0 + 1_800_000);
    expect(asked.length).toBe(1);
    await fandomHint('Santa vs. Snowmen (2020)', wiki(), t0 + 3_700_000);
    expect(asked.length).toBe(2);
  });

  test('an empty or very long name is not looked up', async () => {
    expect(await fandomHint('  ', wiki())).toEqual({ found: false });
    expect(await fandomHint('x'.repeat(200), wiki())).toEqual({ found: false });
    expect(asked).toEqual([]);
  });
});

describe('the route', () => {
  test('needs a movie', async () => {
    const response = await discsExtrasHintHandler(
      new Request('http://x/api/discs/extras/hint'),
      {},
    );
    expect(response.status).toBe(400);
  });
});
