import {
  cleanPublicUrl,
  hobworkNotify,
  linkTo,
  publicState,
  saveSettings,
  sendTest,
  type HobworkChanges,
} from '../hobwork-service';
import { sendPushoverNotice } from '../notification-service';
import { logger, captureException } from '../../src/lib/sentry';

function json(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === 'object'
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** GET /api/hobwork: whether Frame Shift is connected, and the switches. The address is never sent. */
export async function hobworkStateHandler(
  _req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  return json(publicState(), 200, corsHeaders);
}

/**
 * PUT /api/hobwork
 * Body: any of { url: string | null, notifications, liveActivities, publicUrl: string | null }.
 */
export async function hobworkSaveHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const body = await readBody(req);
  if (!body) return json({ error: 'Send JSON' }, 400, corsHeaders);
  try {
    const changes: HobworkChanges = {};
    if ('url' in body) {
      changes.url =
        body.url === null || body.url === '' ? null : (body.url as string);
    }
    if (typeof body.notifications === 'boolean') {
      changes.notifications = body.notifications;
    }
    if (typeof body.liveActivities === 'boolean') {
      changes.liveActivities = body.liveActivities;
    }
    if ('publicUrl' in body) {
      changes.publicUrl =
        body.publicUrl === null || body.publicUrl === ''
          ? null
          : cleanPublicUrl(body.publicUrl);
    }
    saveSettings(changes);
    return json(publicState(), 200, corsHeaders);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Could not save' },
      400,
      corsHeaders,
    );
  }
}

/** POST /api/hobwork/test: a test notification to everyone who turned any on in Hobwork. */
export async function hobworkTestHandler(
  _req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const state = publicState();
  if (!state.connected) {
    return json(
      { ok: false, message: 'Connect to Hobwork first.' },
      400,
      corsHeaders,
    );
  }
  const result = await sendTest();
  if (!result.ok) {
    return json(
      { ok: false, message: `Hobwork did not take it: ${result.error}` },
      502,
      corsHeaders,
    );
  }
  const message =
    result.people === 0
      ? 'Hobwork got it, but nobody has a notification turned on yet. Turn one on in the Hobwork app, in Frame Shift.'
      : `Sent to ${result.people} ${result.people === 1 ? 'person' : 'people'}.`;
  return json({ ok: true, message }, 200, corsHeaders);
}

const NOTICE_KINDS = ['attention', 'ejected'] as const;

/**
 * POST /api/disc-notice
 * Body: { kind: "attention" | "ejected", title, message, path? }. From the disc ripper on the same
 * host: Frame Shift sends it to Pushover (with a link to the page that fixes it) and to Hobwork.
 * Answers an error only when Pushover is set up and failed, so the ripper can try Pushover itself.
 */
export async function discNoticeHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const body = await readBody(req);
  const kind = body?.kind;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const path =
    typeof body?.path === 'string' && body.path.startsWith('/')
      ? body.path.slice(0, 200)
      : '/discs';
  if (!NOTICE_KINDS.includes(kind as (typeof NOTICE_KINDS)[number]) || !title) {
    return json({ error: 'Send { kind, title, message }' }, 400, corsHeaders);
  }

  const page = linkTo(path);
  let pushover: boolean | 'failed' = false;
  try {
    pushover = await sendPushoverNotice(
      title.slice(0, 250),
      (message || title).slice(0, 1000),
      page ? { url: page, title: 'Open Frame Shift' } : undefined,
    );
  } catch (error) {
    pushover = 'failed';
    logger.error('[DiscNotice] Pushover failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    captureException(error);
  }
  const hobwork = await hobworkNotify({
    kind: kind as (typeof NOTICE_KINDS)[number],
    id: `${kind}:${title}`.slice(0, 120),
    title: title.slice(0, 120),
    message: message.slice(0, 1000),
    path,
  });
  return json(
    { pushover: pushover === true, hobwork },
    pushover === 'failed' ? 502 : 200,
    corsHeaders,
  );
}
