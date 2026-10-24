import {
  readSubtitlesState,
  requestSubtitles,
  setSubtitlesAuto,
} from '../subtitles-state';
import { discsDir } from '../disc-state';

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

/** GET /api/subtitles: the movie files, their subtitle tracks and what the converter is doing. */
export async function subtitlesStateHandler(
  _req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  return json(await readSubtitlesState(discsDir()), 200, corsHeaders);
}

/**
 * POST /api/subtitles/convert
 * Body: { path } for one file, or { all: true } for every file with picture subtitles.
 */
export async function subtitlesConvertHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const body = await readBody(req);
  if (!body) return json({ error: 'Send JSON' }, 400, corsHeaders);
  try {
    const count = await requestSubtitles(
      discsDir(),
      body.all === true ? { all: true } : { path: body.path as string },
    );
    return json({ queued: count }, 200, corsHeaders);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Could not ask' },
      400,
      corsHeaders,
    );
  }
}

/** PUT /api/subtitles/auto, body { enabled }: convert the subtitles of new discs by itself. */
export async function subtitlesAutoHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const body = await readBody(req);
  if (!body || typeof body.enabled !== 'boolean') {
    return json({ error: 'enabled must be true or false' }, 400, corsHeaders);
  }
  await setSubtitlesAuto(discsDir(), body.enabled);
  return json({ auto: body.enabled }, 200, corsHeaders);
}
