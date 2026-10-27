/**
 * Handlers for the Discs page: the DVD ripper that runs on the server host.
 * See ../disc-state.ts for how the page and the ripper trade files.
 */

import {
  commandResult,
  discsDir,
  dismissAttention,
  readDiscsState,
  sendCommand,
  setEject,
  setAutoScan,
  setMovieOnly,
  setPreset,
  setNext,
} from '../disc-state';
import type { DiscCommand, DiscNext } from '../../src/types/discs';

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

/** A body that is a JSON object, or null. */
async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Runs something that throws on a bad value, and answers 400 with the reason. */
async function asBadRequest(
  corsHeaders: Record<string, string>,
  run: () => Promise<Response>,
): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      400,
      corsHeaders,
    );
  }
}

/**
 * GET /api/discs
 * Everything the Discs page shows.
 */
export async function discsStateHandler(
  _req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  return json(await readDiscsState(), 200, corsHeaders);
}

/**
 * PUT /api/discs/eject
 * Body: { enabled: boolean }. Whether the ripper ejects a disc when it is done.
 */
export async function discsEjectHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const body = await readBody(req);
  if (!body || typeof body.enabled !== 'boolean') {
    return json({ error: 'enabled must be true or false' }, 400, corsHeaders);
  }
  await setEject(discsDir(), body.enabled);
  return json({ eject: body.enabled }, 200, corsHeaders);
}

/**
 * PUT /api/discs/auto-scan
 * Body: { enabled: boolean }. Whether a disc that goes in is scanned and ripped by itself.
 */
export async function discsAutoScanHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const body = await readBody(req);
  if (!body || typeof body.enabled !== 'boolean') {
    return json({ error: 'enabled must be true or false' }, 400, corsHeaders);
  }
  await setAutoScan(discsDir(), body.enabled);
  return json({ autoScan: body.enabled }, 200, corsHeaders);
}

/**
 * PUT /api/discs/movie-only
 * Body: { enabled: boolean }. Whether only the movie is made from a disc, without its extras.
 */
export async function discsMovieOnlyHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const body = await readBody(req);
  if (!body || typeof body.enabled !== 'boolean') {
    return json({ error: 'enabled must be true or false' }, 400, corsHeaders);
  }
  await setMovieOnly(discsDir(), body.enabled);
  return json({ movieOnly: body.enabled }, 200, corsHeaders);
}

/**
 * PUT /api/discs/preset
 * Body: { id: string }. How discs queued from now on are converted: one of the presets the
 * ripper lists in its settings file.
 */
export async function discsPresetHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const body = await readBody(req);
  if (!body || typeof body.id !== 'string') {
    return json({ error: 'id must be the name of a choice' }, 400, corsHeaders);
  }
  const id = body.id;
  return asBadRequest(corsHeaders, async () => {
    await setPreset(discsDir(), id);
    return json({ chosen: id }, 200, corsHeaders);
  });
}

/**
 * PUT /api/discs/next, DELETE /api/discs/next
 * A note for the next disc that goes in, or taking it back.
 */
export async function discsNextHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (req.method === 'DELETE') {
    await setNext(discsDir(), null);
    return json({ next: null }, 200, corsHeaders);
  }
  const body = await readBody(req);
  if (!body) return json({ error: 'A JSON body is needed' }, 400, corsHeaders);
  return asBadRequest(corsHeaders, async () => {
    await setNext(discsDir(), body as unknown as DiscNext);
    return json({ ok: true }, 200, corsHeaders);
  });
}

/**
 * DELETE /api/discs/attention
 * Body: { file: string }. Removes a note the ripper left.
 */
export async function discsAttentionHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const body = await readBody(req);
  if (!body || typeof body.file !== 'string') {
    return json({ error: 'file is needed' }, 400, corsHeaders);
  }
  const file = body.file;
  return asBadRequest(corsHeaders, async () => {
    await dismissAttention(discsDir(), file);
    return json({ ok: true }, 200, corsHeaders);
  });
}

/**
 * POST /api/discs/commands
 * Body: a DiscCommand. Hands it to the host and answers with the id to ask about.
 */
export async function discsCommandsHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const body = await readBody(req);
  if (!body) return json({ error: 'A JSON body is needed' }, 400, corsHeaders);
  return asBadRequest(corsHeaders, async () => {
    const id = await sendCommand(discsDir(), body as unknown as DiscCommand);
    return json({ id }, 202, corsHeaders);
  });
}

/**
 * GET /api/discs/commands/:id
 * The host's answer to a request, once it has one.
 */
export async function discsCommandResultHandler(
  _req: Request,
  id: string,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  return asBadRequest(corsHeaders, async () =>
    json(await commandResult(discsDir(), id), 200, corsHeaders),
  );
}
