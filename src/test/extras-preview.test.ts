import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  frameJpeg,
  previewTimes,
  videoSeconds,
} from '../../server/extras-preview';
import {
  discsExtrasFrameHandler,
  discsExtrasPreviewHandler,
} from '../../server/handlers/discs';

let dir: string;
const realEnv = process.env.DISC_RIP_DIR;
const REL = '_converted/Duma (2005)/Trailers/Trailer 01 (2 min).mkv';
let video: string;

// A real 6 second video: the picture counts seconds, so a still shows what moment it is from.
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'extras-preview-'));
  video = path.join(dir, REL);
  await fs.mkdir(path.dirname(video), { recursive: true });
  await fs.writeFile(
    path.join(dir, '_converted/Duma (2005)/Duma (2005).mkv'),
    'x',
  );
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=320x180:rate=24:duration=6',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=6',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    video,
  ]);
  process.env.DISC_RIP_DIR = dir;
});

afterAll(async () => {
  if (realEnv === undefined) delete process.env.DISC_RIP_DIR;
  else process.env.DISC_RIP_DIR = realEnv;
  await fs.rm(dir, { recursive: true, force: true });
});

const JPEG = [0xff, 0xd8, 0xff];

describe('looking inside a video', () => {
  test('knows how long it is', async () => {
    expect(await videoSeconds(video)).toBeCloseTo(6, 0);
  });

  test('picks moments spread evenly, in the middle of each part', () => {
    expect(previewTimes(80, 8)).toEqual([5, 15, 25, 35, 45, 55, 65, 75]);
    expect(previewTimes(6)).toHaveLength(8);
    expect(previewTimes(6).every((t) => t > 0 && t < 6)).toBe(true);
  });

  test('takes a real picture from a moment, and different moments differ', async () => {
    const early = await frameJpeg(video, 0.5);
    const late = await frameJpeg(video, 4.5);
    expect([...early.subarray(0, 3)]).toEqual(JPEG);
    expect(early.length).toBeGreaterThan(500);
    expect(Buffer.compare(early, late)).not.toBe(0);
  });

  test('a moment past the end is refused', async () => {
    await expect(frameJpeg(video, 600)).rejects.toThrow('no picture');
  });

  test('a negative or odd moment is refused', async () => {
    await expect(frameJpeg(video, -1)).rejects.toThrow();
    await expect(frameJpeg(video, Number.NaN)).rejects.toThrow();
  });
});

describe('the routes', () => {
  const ask = (
    handler: typeof discsExtrasPreviewHandler,
    params: Record<string, string>,
  ) => handler(new Request(`http://x/api?${new URLSearchParams(params)}`), {});

  test('the preview says the length and the moments', async () => {
    const response = await ask(discsExtrasPreviewHandler, { path: REL });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      seconds: number;
      times: number[];
    };
    expect(body.seconds).toBeCloseTo(6, 0);
    expect(body.times).toHaveLength(8);
  });

  test('a frame comes back as a JPEG that can be kept a day', async () => {
    const response = await ask(discsExtrasFrameHandler, { path: REL, t: '2' });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('Cache-Control')).toContain('max-age=86400');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.subarray(0, 3)]).toEqual(JPEG);
  });

  test('only extras can be looked into, not the movie or anything outside', async () => {
    for (const path of [
      '_converted/Duma (2005)/Duma (2005).mkv',
      '../../etc/passwd',
      '_converted/Duma (2005)/Trailers/../../../x.mkv',
    ]) {
      expect((await ask(discsExtrasPreviewHandler, { path })).status).toBe(404);
      expect(
        (await ask(discsExtrasFrameHandler, { path, t: '1' })).status,
      ).toBe(404);
    }
  });

  test('a missing path or moment is a bad request, and a moment past the end is not found', async () => {
    expect((await ask(discsExtrasPreviewHandler, {})).status).toBe(400);
    expect((await ask(discsExtrasFrameHandler, { path: REL })).status).toBe(
      400,
    );
    expect(
      (await ask(discsExtrasFrameHandler, { path: REL, t: '-3' })).status,
    ).toBe(400);
    expect(
      (await ask(discsExtrasFrameHandler, { path: REL, t: 'abc' })).status,
    ).toBe(400);
    expect(
      (await ask(discsExtrasFrameHandler, { path: REL, t: '900' })).status,
    ).toBe(404);
  });
});
