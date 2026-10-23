/**
 * The connection to Hobwork, which turns Frame Shift's events into notifications and Live
 * Activities on the phones of the people who chose them. Frame Shift posts each event as JSON to a
 * webhook address Hobwork made for it (the "events" webhook of the frame-shift hob); who gets what
 * is each person's choice in the Hobwork app, so everything here is on once it is connected.
 */

import { MetaService } from './db-service';
import { logger } from '../src/lib/sentry';

const META_KEY = 'hobwork';
const SEND_TIMEOUT_MS = 8000;

/** What is saved. The webhook address is a secret: it is never sent back to the page. */
export interface HobworkSettings {
  /** The events webhook address, or null when not connected */
  url: string | null;
  /** Send notifications through Hobwork */
  notifications: boolean;
  /** Send Live Activities through Hobwork */
  liveActivities: boolean;
  /** Where Frame Shift is reached from a phone, so a notification can link to a page */
  publicUrl: string | null;
}

/** What the page may see. */
export interface HobworkState {
  connected: boolean;
  /** The host the address points at, to show which Hobwork it is */
  host: string | null;
  notifications: boolean;
  liveActivities: boolean;
  publicUrl: string | null;
  /** True when FRAME_SHIFT_URL is set, which wins over the saved address */
  publicUrlFromEnvironment: boolean;
}

const DEFAULTS: HobworkSettings = {
  url: null,
  notifications: true,
  liveActivities: true,
  publicUrl: null,
};

/** What is posted to the webhook; see the frame-shift hob's src/events.ts. */
export type HobworkEvent =
  | {
      type: 'notify';
      kind: 'attention' | 'ejected' | 'converted';
      id: string;
      title: string;
      message: string;
      url?: string;
    }
  | {
      type: 'activity';
      kind: 'rip' | 'convert';
      id: string;
      state: 'start' | 'update' | 'end';
      title: string;
      subtitle?: string;
      progress?: number;
      value?: string;
      icon?: string;
      failed?: boolean;
      url?: string;
    }
  | { type: 'test'; url?: string };

export interface SendResult {
  ok: boolean;
  /** How many people the event went to, when Hobwork said */
  people?: number;
  error?: string;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const realFetch: Fetcher = (input, init) => fetch(input, init);
let doFetch: Fetcher = realFetch;

/** Replaces the network call, for tests. */
export function setFetchForTests(replacement: Fetcher | null): void {
  doFetch = replacement ?? realFetch;
}

export function readSettings(): HobworkSettings {
  const text = MetaService.get(META_KEY);
  if (!text) return { ...DEFAULTS };
  try {
    const saved = JSON.parse(text) as Partial<HobworkSettings>;
    return {
      url: typeof saved.url === 'string' ? saved.url : null,
      notifications: saved.notifications !== false,
      liveActivities: saved.liveActivities !== false,
      publicUrl: typeof saved.publicUrl === 'string' ? saved.publicUrl : null,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(settings: HobworkSettings): void {
  MetaService.set(META_KEY, JSON.stringify(settings));
}

/** A Hobwork webhook address: http(s), with the path Hobwork gives webhooks. Throws otherwise. */
export function cleanWebhookUrl(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('Paste the address Hobwork gave');
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('That is not an address');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('The address has to start with https:// or http://');
  }
  if (!url.pathname.startsWith('/_hobwork/hooks/')) {
    throw new Error(
      'That is not a Hobwork webhook address (it has /_hobwork/hooks/ in it)',
    );
  }
  return url.toString();
}

/** A page address Frame Shift is reached at, without a trailing slash. Throws otherwise. */
export function cleanPublicUrl(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('Type the address of Frame Shift');
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('That is not an address');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('The address has to start with https:// or http://');
  }
  return url.origin + url.pathname.replace(/\/+$/, '');
}

export interface HobworkChanges {
  url?: string | null;
  notifications?: boolean;
  liveActivities?: boolean;
  publicUrl?: string | null;
}

export function saveSettings(changes: HobworkChanges): HobworkSettings {
  const settings = readSettings();
  if (changes.url !== undefined) {
    settings.url = changes.url === null ? null : cleanWebhookUrl(changes.url);
  }
  if (typeof changes.notifications === 'boolean') {
    settings.notifications = changes.notifications;
  }
  if (typeof changes.liveActivities === 'boolean') {
    settings.liveActivities = changes.liveActivities;
  }
  if (changes.publicUrl !== undefined) {
    settings.publicUrl =
      changes.publicUrl === null || changes.publicUrl === ''
        ? null
        : cleanPublicUrl(changes.publicUrl);
  }
  write(settings);
  return settings;
}

export function publicState(): HobworkState {
  const settings = readSettings();
  let host: string | null = null;
  if (settings.url) {
    try {
      host = new URL(settings.url).host;
    } catch {
      host = null;
    }
  }
  return {
    connected: settings.url !== null,
    host,
    notifications: settings.notifications,
    liveActivities: settings.liveActivities,
    publicUrl: process.env.FRAME_SHIFT_URL
      ? process.env.FRAME_SHIFT_URL
      : settings.publicUrl,
    publicUrlFromEnvironment: !!process.env.FRAME_SHIFT_URL,
  };
}

/** The address of a page of Frame Shift for a phone, or undefined when it is not known. */
export function linkTo(pathname: string): string | undefined {
  const base = (process.env.FRAME_SHIFT_URL || readSettings().publicUrl || '')
    .trim()
    .replace(/\/+$/, '');
  if (!base) return undefined;
  return `${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

/** Posts one event to Hobwork. Never throws: a failure is logged and returned. */
export async function postEvent(event: HobworkEvent): Promise<SendResult> {
  const { url } = readSettings();
  if (!url) return { ok: false, error: 'Not connected to Hobwork' };
  try {
    const response = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      const text = (await response.text()).slice(0, 200);
      logger.warn('[Hobwork] Hobwork refused an event', {
        status: response.status,
        text,
      });
      return {
        ok: false,
        error: `Hobwork answered ${response.status}: ${text}`,
      };
    }
    const body = (await response.json().catch(() => ({}))) as {
      people?: number;
    };
    return {
      ok: true,
      ...(typeof body.people === 'number' ? { people: body.people } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('[Hobwork] Could not reach Hobwork', { error: message });
    return { ok: false, error: message };
  }
}

/** A notification, if connected and notifications are on. Resolves false when nothing was sent. */
export async function hobworkNotify(notice: {
  kind: 'attention' | 'ejected' | 'converted';
  id: string;
  title: string;
  message: string;
  path?: string;
}): Promise<boolean> {
  const settings = readSettings();
  if (!settings.url || !settings.notifications) return false;
  const link = notice.path ? linkTo(notice.path) : undefined;
  const result = await postEvent({
    type: 'notify',
    kind: notice.kind,
    id: notice.id,
    title: notice.title,
    message: notice.message,
    ...(link ? { url: link } : {}),
  });
  return result.ok;
}

/** A Live Activity change, if connected and Live Activities are on. */
export async function hobworkActivity(
  activity: Omit<
    Extract<HobworkEvent, { type: 'activity' }>,
    'type' | 'url'
  > & {
    path?: string;
  },
): Promise<boolean> {
  const settings = readSettings();
  if (!settings.url || !settings.liveActivities) return false;
  const { path, ...rest } = activity;
  const link = path ? linkTo(path) : undefined;
  const result = await postEvent({
    type: 'activity',
    ...rest,
    ...(link ? { url: link } : {}),
  });
  return result.ok;
}

/** Whether Live Activities are going to Hobwork, so the watchers can stay idle when not. */
export function liveActivitiesOn(): boolean {
  const settings = readSettings();
  return settings.url !== null && settings.liveActivities;
}

/** A test notification to everyone who has a notification turned on in Hobwork. */
export async function sendTest(): Promise<SendResult> {
  const link = linkTo('/');
  return postEvent({ type: 'test', ...(link ? { url: link } : {}) });
}
