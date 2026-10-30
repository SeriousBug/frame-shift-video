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
const realFetch = globalThis.fetch;

beforeEach(() => {
  renames = [];
  failWith = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
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
    expect(screen.getByText('Not named yet. What is this one?')).toBeTruthy();
    expect(
      (await nameBox('Name of the extra Making Of in Duma (2005)')).value,
    ).toBe('Making Of');
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
});
