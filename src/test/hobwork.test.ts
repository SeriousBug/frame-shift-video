import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import { initializeServerMonitoring } from '../lib/sentry';
import { resetDatabase } from '../../server/database';
import {
  cleanPublicUrl,
  cleanWebhookUrl,
  hobworkActivity,
  hobworkNotify,
  linkTo,
  liveActivitiesOn,
  postEvent,
  publicState,
  readSettings,
  saveSettings,
  sendTest,
  setFetchForTests,
} from '../../server/hobwork-service';
import {
  discNoticeHandler,
  hobworkSaveHandler,
  hobworkStateHandler,
  hobworkTestHandler,
} from '../../server/handlers/hobwork';
import { ConvertActivity, jobTitle } from '../../server/convert-activity';
import { IDLE, nextActivity } from '../../server/disc-activity';
import type { Job } from '../../src/types/database';

const HOOK = 'https://hob.example/_hobwork/hooks/events/secret-token';

let sent: { url: string; body: Record<string, unknown> }[] = [];

function fakeHobwork(status = 200, answer: unknown = { people: 2 }) {
  sent = [];
  setFetchForTests(async (url, init) => {
    sent.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? '{}')),
    });
    return new Response(JSON.stringify(answer), { status });
  });
}

// The service logs a failed send, which needs the logger up.
beforeAll(() => initializeServerMonitoring());

beforeEach(() => {
  resetDatabase();
  delete process.env.FRAME_SHIFT_URL;
  delete process.env.PUSHOVER_API_TOKEN;
  delete process.env.PUSHOVER_USER_KEY;
  fakeHobwork();
});

afterEach(() => setFetchForTests(null));

describe('the connection', () => {
  test('starts disconnected, with both switches on', () => {
    expect(readSettings()).toEqual({
      url: null,
      notifications: true,
      liveActivities: true,
      publicUrl: null,
    });
    expect(publicState().connected).toBe(false);
  });

  test('the address is checked and never shown again', () => {
    expect(() => cleanWebhookUrl('nonsense')).toThrow();
    expect(() =>
      cleanWebhookUrl('ftp://hob.example/_hobwork/hooks/x'),
    ).toThrow();
    expect(() => cleanWebhookUrl('https://example.com/hook')).toThrow(
      /not a Hobwork webhook/,
    );
    saveSettings({ url: HOOK });
    const state = publicState();
    expect(state.connected).toBe(true);
    expect(state.host).toBe('hob.example');
    expect(JSON.stringify(state)).not.toContain('secret-token');
  });

  test('it can be disconnected and its switches turned off', () => {
    saveSettings({ url: HOOK, notifications: false, liveActivities: false });
    expect(liveActivitiesOn()).toBe(false);
    saveSettings({ liveActivities: true });
    expect(liveActivitiesOn()).toBe(true);
    saveSettings({ url: null });
    expect(publicState().connected).toBe(false);
    expect(liveActivitiesOn()).toBe(false);
  });

  test('links are built from the saved address, or the environment', () => {
    expect(linkTo('/discs')).toBeUndefined();
    saveSettings({ publicUrl: 'http://frame-shift.example/' });
    expect(linkTo('/discs')).toBe('http://frame-shift.example/discs');
    process.env.FRAME_SHIFT_URL = 'https://fs.example/';
    expect(linkTo('/')).toBe('https://fs.example/');
    expect(publicState().publicUrlFromEnvironment).toBe(true);
    expect(() => cleanPublicUrl('javascript:alert(1)')).toThrow();
  });
});

describe('sending', () => {
  test('nothing is sent when not connected', async () => {
    expect(
      await hobworkNotify({
        kind: 'attention',
        id: 'a',
        title: 'x',
        message: '',
      }),
    ).toBe(false);
    expect(sent).toHaveLength(0);
    expect((await postEvent({ type: 'test' })).ok).toBe(false);
  });

  test('a notification carries the link to the page that fixes it', async () => {
    saveSettings({ url: HOOK, publicUrl: 'http://frame-shift.example' });
    expect(
      await hobworkNotify({
        kind: 'attention',
        id: 'attention:Duma',
        title: 'Disc rip: Duma',
        message: 'Could not read it',
        path: '/discs',
      }),
    ).toBe(true);
    expect(sent[0]?.url).toBe(HOOK);
    expect(sent[0]?.body).toEqual({
      type: 'notify',
      kind: 'attention',
      id: 'attention:Duma',
      title: 'Disc rip: Duma',
      message: 'Could not read it',
      url: 'http://frame-shift.example/discs',
    });
  });

  test('the switches keep things from being sent', async () => {
    saveSettings({ url: HOOK, notifications: false, liveActivities: false });
    expect(
      await hobworkNotify({
        kind: 'ejected',
        id: 'e',
        title: 'x',
        message: '',
      }),
    ).toBe(false);
    expect(
      await hobworkActivity({
        kind: 'rip',
        id: 'rip',
        state: 'update',
        title: 'x',
      }),
    ).toBe(false);
    expect(sent).toHaveLength(0);
  });

  test('a failure is returned, not thrown', async () => {
    saveSettings({ url: HOOK });
    fakeHobwork(500, { error: 'boom' });
    const result = await postEvent({ type: 'test' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
    setFetchForTests(async () => {
      throw new Error('network down');
    });
    expect((await postEvent({ type: 'test' })).error).toBe('network down');
  });

  test('a test says how many people it reached', async () => {
    saveSettings({ url: HOOK });
    expect(await sendTest()).toEqual({ ok: true, people: 2 });
  });
});

describe('the handlers', () => {
  const put = (body: unknown) =>
    hobworkSaveHandler(
      new Request('http://x/api/hobwork', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
      {},
    );

  test('connecting and changing switches', async () => {
    const bad = await put({ url: 'https://example.com/nope' });
    expect(bad.status).toBe(400);
    const good = await put({ url: HOOK, liveActivities: false });
    expect(good.status).toBe(200);
    const state = await (
      await hobworkStateHandler(new Request('http://x'), {})
    ).json();
    expect(state).toMatchObject({ connected: true, liveActivities: false });
    expect(JSON.stringify(state)).not.toContain('secret-token');
  });

  test('a test needs a connection', async () => {
    const refused = await hobworkTestHandler(
      new Request('http://x', { method: 'POST' }),
      {},
    );
    expect(refused.status).toBe(400);
    saveSettings({ url: HOOK });
    const ok = await (
      await hobworkTestHandler(new Request('http://x', { method: 'POST' }), {})
    ).json();
    expect(ok).toEqual({ ok: true, message: 'Sent to 2 people.' });
    fakeHobwork(200, { people: 0 });
    const none = await (
      await hobworkTestHandler(new Request('http://x', { method: 'POST' }), {})
    ).json();
    expect(none.message).toContain('nobody has a notification turned on');
  });

  test('a disc notice goes to Hobwork with a link, and Pushover when it is set up', async () => {
    saveSettings({ url: HOOK, publicUrl: 'http://frame-shift.example' });
    const notice = (body: unknown) =>
      discNoticeHandler(
        new Request('http://x', { method: 'POST', body: JSON.stringify(body) }),
        {},
      );
    expect((await notice({ kind: 'spam', title: 'x' })).status).toBe(400);
    expect((await notice({ kind: 'attention' })).status).toBe(400);
    const answer = await (
      await notice({
        kind: 'attention',
        title: 'Disc rip: Duma',
        message: 'Needs you',
      })
    ).json();
    expect(answer).toEqual({ pushover: false, hobwork: true });
    expect(sent[0]?.body).toMatchObject({
      type: 'notify',
      kind: 'attention',
      url: 'http://frame-shift.example/discs',
    });
  });
});

const job = (progress: number, file = '/videos/DVDs/Duma/Duma.mkv'): Job =>
  ({ id: 1, name: 'Convert', input_file: file, progress }) as unknown as Job;

describe('the conversion Live Activity', () => {
  function activity(
    counts: { pending: number; processing: number },
    enabled = true,
  ) {
    const events: Record<string, unknown>[] = [];
    let now = 1000;
    const tracker = new ConvertActivity({
      counts: () => counts,
      send: (event) => void events.push(event as never),
      enabled: () => enabled,
      now: () => now,
    });
    return { tracker, events, advance: (seconds: number) => (now += seconds) };
  }

  test('starts with the job, updates are spaced out, and it ends with the queue', async () => {
    const counts = { pending: 1, processing: 1 };
    const { tracker, events, advance } = activity(counts);
    await tracker.onStart(job(0));
    expect(events[0]).toMatchObject({
      kind: 'convert',
      state: 'start',
      title: 'Duma',
      subtitle: '1 of 2 · 0%',
      value: '0%',
    });
    await tracker.onProgress(job(10));
    expect(events).toHaveLength(1);
    advance(11);
    await tracker.onProgress(job(40));
    expect(events[1]).toMatchObject({
      state: 'update',
      subtitle: '1 of 2 · 40%',
      progress: 0.2,
    });

    counts.pending = 0;
    counts.processing = 1;
    await tracker.onFinish(job(100), false);
    expect(events).toHaveLength(2);
    counts.processing = 0;
    await tracker.onFinish(job(100, '/videos/x/Other.mkv'), false);
    expect(events[2]).toMatchObject({
      state: 'end',
      title: '2 conversions finished',
      progress: 1,
    });
  });

  test('a failure ends it as failed, and the next batch starts counting again', async () => {
    const counts = { pending: 0, processing: 1 };
    const { tracker, events } = activity(counts);
    await tracker.onStart(job(0));
    counts.processing = 0;
    await tracker.onFinish(job(5), true);
    expect(events[1]).toMatchObject({
      state: 'end',
      failed: true,
      title: '1 failed',
    });
    counts.processing = 1;
    await tracker.onStart(job(0));
    expect(events[2]).toMatchObject({ state: 'start', subtitle: '0%' });
  });

  test('nothing is sent while it is off', async () => {
    const { tracker, events } = activity({ pending: 0, processing: 1 }, false);
    await tracker.onStart(job(0));
    expect(events).toHaveLength(0);
  });

  test('the title is the file, without its folder or extension', () => {
    expect(jobTitle({ input_file: '/a/b/My Movie.mkv', name: 'x' })).toBe(
      'My Movie',
    );
    expect(
      jobTitle({ input_file: '/a/' + 'z'.repeat(100) + '.mkv', name: 'x' })
        .length,
    ).toBe(64);
  });
});

describe('the disc ripper Live Activity', () => {
  const run = (name: string, step: string) => ({
    state: 'running' as const,
    name,
    step,
    updated: 0,
  });
  const idle = {
    state: 'idle' as const,
    name: 'Duma',
    step: 'Idle',
    updated: 0,
  };

  test('starts, follows each step once, and ends', () => {
    const first = nextActivity(IDLE, run('Duma', 'Scanning'), []);
    expect(first.send).toMatchObject({
      kind: 'rip',
      state: 'start',
      title: 'Duma',
      subtitle: 'Scanning',
      path: '/discs',
    });
    expect(
      nextActivity(first.last, run('Duma', 'Scanning'), []).send,
    ).toBeNull();
    const second = nextActivity(
      first.last,
      run('Duma', 'Copying the disc'),
      [],
    );
    expect(second.send).toMatchObject({
      state: 'update',
      subtitle: 'Copying the disc',
    });
    const done = nextActivity(second.last, idle, []);
    expect(done.send).toMatchObject({
      state: 'end',
      title: 'Duma',
      subtitle: 'Finished',
      progress: 1,
    });
    expect(nextActivity(done.last, idle, []).send).toBeNull();
  });

  test('a disc that needs a person ends as failed', () => {
    const copying = nextActivity(IDLE, run('Duma', 'Copying the disc'), []);
    const done = nextActivity(copying.last, idle, [
      { file: 'ATTENTION - Duma.txt', name: 'Duma', lines: [] },
    ]);
    expect(done.send).toMatchObject({
      state: 'end',
      failed: true,
      subtitle: 'Needs your attention',
    });
  });

  test('no ripper run, nothing to say', () => {
    expect(nextActivity(IDLE, null, []).send).toBeNull();
  });
});
