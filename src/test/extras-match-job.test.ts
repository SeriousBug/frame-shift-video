import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  clearMatches,
  matchState,
  startMatch,
  type Deps,
} from '../../server/extras-match-job';
import { ListenerUnavailable, lookAt } from '../../server/extras-eyes';
import type { Look } from '../../server/extras-match';

let dir: string;
const MOVIE = 'Stellaluna (2004)';
const CARD = `_converted/${MOVIE}/Featurettes/Featurette 01 (20 min).mkv`;
const BLANK = `_converted/${MOVIE}/Trailers/Trailer 01 (2 min).mkv`;
const NAMED = `_converted/${MOVIE}/Featurettes/Making Of.mkv`;

const LOOKS: Record<string, Look> = {
  [CARD]: {
    seconds: 5,
    ocr: [{ t: 0.5, lines: ['THE NOT-SO-SCARY', 'WORLD OF BATS'] }],
    speech: [
      { start: 0, end: 4, text: 'Welcome to the not so scary world of bats.' },
    ],
  },
  [BLANK]: { seconds: 60, ocr: [], speech: [] },
};

const HINT = {
  found: true,
  features: [
    { text: 'Featurettes', depth: 1 },
    { text: 'The Not-So-Scary World of Bats', depth: 2 },
    { text: 'Create Your Own Stellaluna', depth: 2 },
  ],
};

let asked: string[];
const deps = (over: Partial<Deps> = {}): Deps => ({
  look: async (relative) => {
    asked.push(relative);
    return LOOKS[relative]!;
  },
  hint: async () => HINT,
  ...over,
});

async function write(relative: string) {
  const file = path.join(dir, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, 'video');
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'extras-match-'));
  asked = [];
  clearMatches();
  await write(`_converted/${MOVIE}/${MOVIE}.mkv`);
  await write(CARD);
  await write(BLANK);
  await write(NAMED);
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('matching a movie', () => {
  test('listens to each unnamed extra in turn and suggests the clear one', async () => {
    const { state, finished } = await startMatch(dir, MOVIE, deps());
    expect(state.status).toBe('running');
    expect(state.total).toBe(2);
    await finished;
    expect(state.status).toBe('done');
    expect(state.done).toBe(2);
    expect(asked.sort()).toEqual([BLANK, CARD].sort());
    expect(state.suggestions[CARD]).toMatchObject({
      state: 'matched',
      name: 'The Not-So-Scary World of Bats',
      kind: 'Featurettes',
    });
    expect(state.suggestions[BLANK]?.state).toBe('none');
    expect(matchState(MOVIE)).toBe(state);
  });

  test('an extra that already has a name is left alone', async () => {
    const { finished } = await startMatch(dir, MOVIE, deps());
    await finished;
    expect(asked).not.toContain(NAMED);
  });

  test('one at a time: they are looked at in order, not together', async () => {
    let active = 0;
    let most = 0;
    const slow = deps({
      look: async (relative) => {
        active++;
        most = Math.max(most, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        return LOOKS[relative]!;
      },
    });
    await (
      await startMatch(dir, MOVIE, slow)
    ).finished;
    expect(most).toBe(1);
  });

  test('starting again while it is going does not start a second run', async () => {
    const first = await startMatch(dir, MOVIE, deps());
    const second = await startMatch(dir, MOVIE, deps());
    expect(second.state).toBe(first.state);
    await first.finished;
    expect(asked).toHaveLength(2);
  });

  test('what was heard is kept while the file is unchanged, and listened to again when it changes', async () => {
    await (
      await startMatch(dir, MOVIE, deps())
    ).finished;
    await (
      await startMatch(dir, MOVIE, deps())
    ).finished;
    expect(asked).toHaveLength(2);
    await new Promise((r) => setTimeout(r, 20));
    await fs.writeFile(path.join(dir, CARD), 'a different video');
    await (
      await startMatch(dir, MOVIE, deps())
    ).finished;
    expect(asked.filter((a) => a === CARD)).toHaveLength(2);
    expect(asked.filter((a) => a === BLANK)).toHaveLength(1);
  });

  test('with no wiki list, the evidence is still kept and nothing is suggested', async () => {
    const none = deps({ hint: async () => ({ found: false }) });
    const { state, finished } = await startMatch(dir, MOVIE, none);
    await finished;
    expect(state.suggestions[CARD]?.state).toBe('none');
    expect(state.suggestions[CARD]?.saw).toContain('WORLD OF BATS');
  });

  test('two extras that look like one name are both taken back', async () => {
    const same = deps({ look: async () => LOOKS[CARD]! });
    const { state, finished } = await startMatch(dir, MOVIE, same);
    await finished;
    expect(state.suggestions[CARD]?.state).toBe('unsure');
    expect(state.suggestions[BLANK]?.state).toBe('unsure');
  });

  test('one extra the listener cannot look at does not stop the others', async () => {
    const flaky = deps({
      look: async (relative) => {
        if (relative === BLANK) throw new Error('bad video');
        return LOOKS[relative]!;
      },
    });
    const { state, finished } = await startMatch(dir, MOVIE, flaky);
    await finished;
    expect(state.status).toBe('done');
    expect(state.suggestions[BLANK]?.note).toContain('could not look');
    expect(state.suggestions[CARD]?.state).toBe('matched');
  });

  test('the listener being down stops it, and says so', async () => {
    const down = deps({
      look: async () => {
        throw new ListenerUnavailable('The listener could not be reached');
      },
    });
    const { state, finished } = await startMatch(dir, MOVIE, down);
    await finished;
    expect(state.status).toBe('failed');
    expect(state.error).toContain('could not be reached');
  });

  test('a movie with no extras, or all named, is refused', async () => {
    await expect(startMatch(dir, 'Nothing (1999)', deps())).rejects.toThrow(
      'no extras',
    );
    await fs.rm(path.join(dir, CARD));
    await fs.rm(path.join(dir, BLANK));
    await expect(startMatch(dir, MOVIE, deps())).rejects.toThrow('named');
  });

  test('after a failure it can be started again', async () => {
    const down = deps({
      look: async () => {
        throw new ListenerUnavailable('down');
      },
    });
    await (
      await startMatch(dir, MOVIE, down)
    ).finished;
    const again = await startMatch(dir, MOVIE, deps());
    await again.finished;
    expect(again.state.status).toBe('done');
  });
});

describe('the listener client', () => {
  const reply = (body: unknown, status = 200) =>
    (async () =>
      new Response(JSON.stringify(body), {
        status,
      })) as unknown as typeof fetch;

  test('sends the path and reads what comes back', async () => {
    let seen: { url: string; body: string } | null = null;
    const fetcher = (async (url: string, init?: RequestInit) => {
      seen = { url, body: String(init?.body) };
      return new Response(JSON.stringify({ seconds: 5, ocr: [], speech: [] }));
    }) as unknown as typeof fetch;
    const look = await lookAt('a/b.mkv', fetcher, 'http://eyes:3002/');
    expect(look).toEqual({ seconds: 5, ocr: [], speech: [] });
    expect(seen!.url).toBe('http://eyes:3002/look');
    expect(JSON.parse(seen!.body)).toEqual({ path: 'a/b.mkv' });
  });

  test('not being set up is said', async () => {
    await expect(lookAt('a.mkv', reply({}), undefined)).rejects.toThrow(
      ListenerUnavailable,
    );
  });

  test('being unreachable is said, as is the listener refusing', async () => {
    const down = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    await expect(lookAt('a.mkv', down, 'http://x')).rejects.toThrow(
      ListenerUnavailable,
    );
    await expect(
      lookAt(
        'a.mkv',
        reply({ error: 'That is outside the library' }, 400),
        'http://x',
      ),
    ).rejects.toThrow('outside the library');
  });

  test('an odd answer is made into something safe', async () => {
    const look = await lookAt(
      'a.mkv',
      reply({ seconds: 'x', ocr: 5 }),
      'http://x',
    );
    expect(look).toEqual({ seconds: 0, ocr: [], speech: [] });
  });
});
