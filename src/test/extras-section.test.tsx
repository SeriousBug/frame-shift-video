import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExtrasSection } from '@/components/extras-section';

const MOVIES = [
  {
    movie: 'Duma (2005)',
    items: [
      {
        path: '_converted/Duma (2005)/Trailers/Trailer 01 (2 min).mkv',
        folder: 'Trailers',
        name: 'Trailer 01 (2 min)',
        unnamed: true,
      },
      {
        path: '_converted/Duma (2005)/Featurettes/Making Of.mkv',
        folder: 'Featurettes',
        name: 'Making Of',
        unnamed: false,
      },
    ],
  },
];

type Rename = { path: string; name: string; folder?: string };
let renames: Rename[];
let failWith: string | null;
let hint: unknown;
let hintAsked: string[];
const realFetch = globalThis.fetch;

beforeEach(() => {
  renames = [];
  failWith = null;
  hintAsked = [];
  hint = { found: false };
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (String(url).includes('/discs/extras/hint')) {
      hintAsked.push(
        new URL(String(url), 'http://x').searchParams.get('movie')!,
      );
      return new Response(JSON.stringify({ hint }));
    }
    if (String(url).endsWith('/discs/extras/rename')) {
      renames.push(JSON.parse(String(init?.body)));
      return failWith
        ? new Response(JSON.stringify({ error: failWith }), { status: 400 })
        : new Response(JSON.stringify({ path: 'x' }));
    }
    return new Response(JSON.stringify({ movies: MOVIES }));
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

function page() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ExtrasSection />
    </QueryClientProvider>,
  );
}

const nameBox = (label: string) =>
  screen.findByRole('textbox', { name: label }) as Promise<HTMLInputElement>;

describe('the "Name the extras" section', () => {
  test('lists each extra under its movie, and says which are not named yet', async () => {
    page();
    expect(await screen.findByText('Duma (2005)')).toBeTruthy();
    expect(screen.getByText('1 not named')).toBeTruthy();
    expect(
      screen.getByText('Not named yet (Trailer 01 (2 min)). What is this one?'),
    ).toBeTruthy();
    expect(
      (await nameBox('Name of the extra Making Of in Duma (2005)')).value,
    ).toBe('Making Of');
  });

  test('a box for an extra with no name yet starts empty, and the length is not in it', async () => {
    page();
    const box = await nameBox(
      'Name of the extra Trailer 01 (2 min) in Duma (2005)',
    );
    expect(box.value).toBe('');
    expect(box.placeholder).toBe('Type its name');
    expect(box.value).not.toContain('min');
  });

  test('each extra has a link to watch it and one to save it', async () => {
    page();
    const path = '_converted/Duma (2005)/Trailers/Trailer 01 (2 min).mkv';
    const watch = (await screen.findByRole('link', {
      name: 'Watch the extra Trailer 01 (2 min) in Duma (2005)',
    })) as HTMLAnchorElement;
    expect(watch.getAttribute('href')).toBe(
      `/api/discs/extras/file?${new URLSearchParams({ path })}`,
    );
    expect(watch.target).toBe('_blank');
    const save = screen.getByRole('link', {
      name: 'Download the extra Trailer 01 (2 min) in Duma (2005)',
    }) as HTMLAnchorElement;
    expect(save.getAttribute('href')).toBe(
      `/api/discs/extras/file?${new URLSearchParams({ path, download: '1' })}`,
    );
  });

  test('an empty box with nothing else changed saves nothing', async () => {
    page();
    await nameBox('Name of the extra Trailer 01 (2 min) in Duma (2005)');
    const [save] = screen.getAllByRole('button', { name: 'Save' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });

  test('Save waits until something is changed, then sends the new name', async () => {
    page();
    const box = await nameBox(
      'Name of the extra Trailer 01 (2 min) in Duma (2005)',
    );
    const [save] = screen.getAllByRole('button', { name: 'Save' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: 'Theatrical Trailer' } });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save!);
    await waitFor(() => expect(renames).toHaveLength(1));
    expect(renames[0]).toEqual({
      path: '_converted/Duma (2005)/Trailers/Trailer 01 (2 min).mkv',
      name: 'Theatrical Trailer',
    });
  });

  test('choosing another kind sends the folder too', async () => {
    page();
    const kind = (await screen.findByRole('combobox', {
      name: 'Kind of the extra Trailer 01 (2 min) in Duma (2005)',
    })) as HTMLSelectElement;
    fireEvent.change(kind, { target: { value: 'Deleted Scenes' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]!);
    await waitFor(() => expect(renames).toHaveLength(1));
    expect(renames[0]).toMatchObject({
      name: 'Trailer 01 (2 min)',
      folder: 'Deleted Scenes',
    });
  });

  test('what the server refuses is shown next to that extra', async () => {
    failWith = 'There is already an extra with that name';
    page();
    const box = await nameBox(
      'Name of the extra Trailer 01 (2 min) in Duma (2005)',
    );
    fireEvent.change(box, { target: { value: 'Making Of' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]!);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'already an extra',
    );
  });

  test('nothing is shown when there are no extras', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ movies: [] }))) as unknown as typeof fetch;
    const { container } = page();
    await new Promise((r) => setTimeout(r, 100));
    expect(container.textContent).toBe('');
  });

  test('shows what DVD Fandom lists for a movie that has unnamed extras', async () => {
    hint = {
      found: true,
      page: 'Duma',
      url: 'https://dvd.fandom.com/wiki/Duma',
      runtime: 'Approx. 100 minutes',
      features: [
        { text: 'Disc 2', depth: 0 },
        { text: 'Deleted Scenes', depth: 1 },
        { text: 'Zebra Cut', depth: 2 },
      ],
    };
    page();
    expect(
      await screen.findByText(
        'What DVD Fandom lists on this disc (the movie: Approx. 100 minutes)',
      ),
    ).toBeTruthy();
    expect(hintAsked).toEqual(['Duma (2005)']);
    expect(screen.getByText('Zebra Cut')).toBeTruthy();
    const link = screen.getByRole('link', {
      name: 'Duma on DVD Fandom',
    }) as HTMLAnchorElement;
    expect(link.href).toBe('https://dvd.fandom.com/wiki/Duma');
  });

  test('says so when DVD Fandom has no list, and still lets the extras be named', async () => {
    page();
    expect(
      await screen.findByText('DVD Fandom has no list for this movie.'),
    ).toBeTruthy();
    expect(
      await nameBox('Name of the extra Trailer 01 (2 min) in Duma (2005)'),
    ).toBeTruthy();
  });

  test('a movie whose extras are all named is not looked up', async () => {
    globalThis.fetch = (async (url: string) => {
      if (String(url).includes('/discs/extras/hint')) hintAsked.push('asked');
      return new Response(
        JSON.stringify({
          movies: [
            {
              movie: 'Done (2001)',
              items: [
                {
                  path: 'a',
                  folder: 'Featurettes',
                  name: 'Making Of',
                  unnamed: false,
                },
              ],
            },
          ],
        }),
      );
    }) as unknown as typeof fetch;
    page();
    expect(await screen.findByText('Done (2001)')).toBeTruthy();
    await new Promise((r) => setTimeout(r, 100));
    expect(hintAsked).toEqual([]);
    expect(screen.queryByText(/DVD Fandom/)).toBeNull();
  });
});
