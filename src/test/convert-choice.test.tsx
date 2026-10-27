import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConvertChoice } from '@/components/convert-choice';
import type { DiscConvert, DiscPreset } from '@/types/discs';

const builtIn: DiscPreset = {
  id: 'hevc-mkv',
  name: 'Small and sharp (HEVC, MKV)',
  container: 'mkv',
  video: 'libx265',
  quality: 22,
  speed: 'faster',
  tenBit: true,
  audio: 'copy',
  deinterlace: true,
  subtitles: 'keep',
  builtIn: true,
};
const mine: DiscPreset = {
  ...builtIn,
  id: 'custom-phone',
  name: 'Phone',
  container: 'mp4',
  video: 'libx264',
  quality: 26,
  speed: 'veryfast',
  tenBit: false,
  audio: 'aac',
  subtitles: 'none',
  builtIn: false,
};
const convert: DiscConvert = { presets: [builtIn, mine], chosen: 'hevc-mkv' };

type Call = { url: string; method: string; body: Record<string, unknown> };
let calls: Call[];
let reply: { status: number; body: unknown };
const realFetch = globalThis.fetch;
const realConfirm = window.confirm;

beforeEach(() => {
  calls = [];
  reply = { status: 200, body: {} };
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : {},
    });
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  window.confirm = realConfirm;
});

function show(
  value: DiscConvert = convert,
  onChoose: (id: string) => void = () => {},
) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ConvertChoice
        convert={value}
        folder="_converted"
        pending={false}
        onChoose={onChoose}
      />
    </QueryClientProvider>,
  );
}

const checked = (el: HTMLElement) => (el as HTMLInputElement).checked;
const disabled = (el: HTMLElement) => (el as HTMLInputElement).disabled;
const present = (el: HTMLElement) => document.body.contains(el);

const field = (label: string) =>
  screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) =>
  fireEvent.change(field(label), { target: { value } });
const press = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));

describe('choosing how discs are converted', () => {
  test('lists the presets, and picking one tells the page', () => {
    const picked: string[] = [];
    show(convert, (id) => picked.push(id));
    expect(checked(screen.getByLabelText(builtIn.name))).toBe(true);
    expect(checked(screen.getByLabelText('Phone'))).toBe(false);
    fireEvent.click(screen.getByLabelText('Phone'));
    expect(picked).toEqual(['custom-phone']);
  });

  test('only the ones you made can be changed', () => {
    show();
    expect(screen.getAllByRole('button', { name: /^Change / })).toHaveLength(1);
    expect(present(screen.getByRole('button', { name: 'Change Phone' }))).toBe(
      true,
    );
  });

  test('before the list exists there is nothing to add to', () => {
    show({ presets: [], chosen: '' });
    expect(present(screen.getByText(/show up here after the next disc/))).toBe(
      true,
    );
    expect(
      screen.queryByRole('button', { name: /Make your own/ })?.textContent ??
        null,
    ).toBeNull();
  });
});

describe('making a preset of your own', () => {
  test('what is filled in is what is sent, and the form closes', async () => {
    show();
    press('Make your own…');
    type('Name', 'Small for the tablet');
    type('File type', 'mkv');
    type('Picture', 'libsvtav1');
    type('Quality (0 to 51)', '34');
    type('How long to spend on each disc', 'slow');
    type('Sound', 'ac3');
    fireEvent.click(screen.getByLabelText(/Clean up interlaced/));
    press('Save');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      url: '/api/discs/presets',
      method: 'POST',
      body: {
        name: 'Small for the tablet',
        container: 'mkv',
        video: 'libsvtav1',
        quality: 34,
        speed: 'slow',
        tenBit: true,
        audio: 'ac3',
        deinterlace: false,
        subtitles: 'keep',
      },
    });
    await waitFor(() =>
      expect(
        screen.queryByText('Make your own')?.textContent ?? null,
      ).toBeNull(),
    );
  });

  test('a new preset starts as the way discs were always made', () => {
    show();
    press('Make your own…');
    expect(field('File type').value).toBe('mkv');
    expect(field('Picture').value).toBe('libx265');
    expect(field('Quality (0 to 51)').value).toBe('22');
    expect(field('Sound').value).toBe('copy');
    expect(checked(screen.getByLabelText(/10-bit/))).toBe(true);
    expect(checked(screen.getByLabelText(/Clean up interlaced/))).toBe(true);
  });

  test('an MP4 has no subtitles, and says so', async () => {
    show();
    press('Make your own…');
    type('Name', 'Phone too');
    type('File type', 'mp4');
    expect(disabled(field('Subtitles'))).toBe(true);
    expect(field('Subtitles').value).toBe('none');
    press('Save');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toMatchObject({
      container: 'mp4',
      subtitles: 'none',
    });
  });

  test('keeping the picture as it is switches off what cannot apply', async () => {
    show();
    press('Make your own…');
    type('Name', 'Untouched');
    type('Picture', 'copy');
    expect(disabled(field('Quality (0 to 51)'))).toBe(true);
    expect(disabled(field('How long to spend on each disc'))).toBe(true);
    expect(disabled(screen.getByLabelText(/10-bit/))).toBe(true);
    expect(disabled(screen.getByLabelText(/Clean up interlaced/))).toBe(true);
    press('Save');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toMatchObject({
      video: 'copy',
      tenBit: false,
      deinterlace: false,
    });
  });

  test('10-bit is only for HEVC and AV1', async () => {
    show();
    press('Make your own…');
    type('Name', 'Plain');
    type('Picture', 'libx264');
    expect(disabled(screen.getByLabelText(/10-bit/))).toBe(true);
    expect(checked(screen.getByLabelText(/10-bit/))).toBe(false);
    press('Save');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toMatchObject({ video: 'libx264', tenBit: false });
  });

  test('a missing name or a quality out of range is said in words, and nothing is sent', async () => {
    show();
    press('Make your own…');
    press('Save');
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Give the preset a name.',
    );
    type('Name', 'Fine');
    for (const bad of ['52', '-1', '22.5', 'high', '']) {
      type('Quality (0 to 51)', bad);
      press('Save');
      expect((await screen.findByRole('alert')).textContent).toContain(
        'Quality is a whole number from 0 to 51.',
      );
    }
    expect(calls).toHaveLength(0);
  });

  test("the server's reason is shown and the form stays open", async () => {
    reply = { status: 400, body: { error: 'That is plenty of presets.' } };
    show();
    press('Make your own…');
    type('Name', 'One too many');
    press('Save');
    expect((await screen.findByRole('alert')).textContent).toContain(
      'That is plenty of presets.',
    );
    expect(present(screen.getByText('Make your own'))).toBe(true);
  });

  test('cancel closes the form without sending anything', () => {
    show();
    press('Make your own…');
    type('Name', 'Never mind');
    press('Cancel');
    expect(screen.queryByText('Make your own')?.textContent ?? null).toBeNull();
    expect(
      present(screen.getByRole('button', { name: 'Make your own…' })),
    ).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe('changing and deleting one of your own', () => {
  test('the form opens with what it has, and saving sends its id', async () => {
    show();
    press('Change Phone');
    expect(field('Name').value).toBe('Phone');
    expect(field('File type').value).toBe('mp4');
    expect(field('Quality (0 to 51)').value).toBe('26');
    expect(field('How long to spend on each disc').value).toBe('veryfast');
    type('Quality (0 to 51)', '28');
    press('Save');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toMatchObject({
      id: 'custom-phone',
      name: 'Phone',
      quality: 28,
      container: 'mp4',
    });
    expect(calls[0].body).not.toHaveProperty('builtIn');
  });

  test('deleting asks first, and only then sends it', async () => {
    show();
    press('Change Phone');
    window.confirm = () => false;
    press('Delete');
    expect(calls).toHaveLength(0);
    window.confirm = () => true;
    press('Delete');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      url: '/api/discs/presets',
      method: 'DELETE',
      body: { id: 'custom-phone' },
    });
    await waitFor(() =>
      expect(
        screen.queryByText('Change “Phone”')?.textContent ?? null,
      ).toBeNull(),
    );
  });

  test('a new preset has no delete button', () => {
    show();
    press('Make your own…');
    expect(
      screen.queryByRole('button', { name: 'Delete' })?.textContent ?? null,
    ).toBeNull();
  });
});
