import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { SubtitlesSection } from '@/components/subtitles-section';
import type { SubtitlesState } from '@/types/subtitles';

const base: SubtitlesState = {
  available: true,
  auto: false,
  updated: 1,
  files: [],
  held: [],
  current: null,
  batch: null,
  recent: [],
};

let state: SubtitlesState;
const realFetch = globalThis.fetch;

beforeEach(() => {
  state = base;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(state), {
      status: 200,
    })) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SubtitlesSection />
    </QueryClientProvider>,
  );
}

const bar = () => screen.findByRole('progressbar');

describe('the progress of a run of subtitle requests', () => {
  test('a run of typo fixes says how far along it is, and the bar matches', async () => {
    state = { ...base, batch: { kind: 'recheck', total: 14, done: 3 } };
    show();
    const progress = await bar();
    expect(progress.getAttribute('aria-valuenow')).toBe('3');
    expect(progress.getAttribute('aria-valuemax')).toBe('14');
    expect(progress.getAttribute('aria-label')).toBe('Fixing typing mistakes');
    expect(
      (await screen.findByText(/3 of\s+14 movies done/)).textContent,
    ).toContain('Fixing typing mistakes');
    const fill = progress.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('21%');
  });

  test('a run of picture conversions is named for what it does', async () => {
    state = { ...base, batch: { kind: 'convert', total: 2, done: 1 } };
    show();
    expect(
      (await screen.findByText(/1 of\s+2 movies done/)).textContent,
    ).toContain('Converting subtitles');
    expect(((await bar()).firstElementChild as HTMLElement).style.width).toBe(
      '50%',
    );
  });

  test('the file being converted is shown under the run', async () => {
    state = {
      ...base,
      batch: { kind: 'convert', total: 2, done: 0 },
      current: { path: 'A/A (2001).mkv', step: 'Reading', done: 1, total: 4 },
    };
    show();
    expect((await screen.findByText(/A \(2001\)\.mkv/)).textContent).toContain(
      'Converting',
    );
    expect(await screen.findAllByText(/Reading/)).toHaveLength(1);
  });

  test('nothing is shown when nothing is running', async () => {
    show();
    await screen.findByText(/Convert the subtitles of new discs/);
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
  });
});
