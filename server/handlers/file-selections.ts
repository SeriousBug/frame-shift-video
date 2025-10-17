import { orderBy } from 'natural-orderby';
import { FileSelectionService } from '../db-service';
import { logger, captureException } from '../../src/lib/sentry';

/**
 * POST /api/file-selections - Save file selections and return key
 * GET /api/file-selections/:key - Get file selections by key
 */
export async function fileSelectionsHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { files, config } = body;

      if (!Array.isArray(files)) {
        return new Response(
          JSON.stringify({ error: 'files must be an array' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        );
      }

      // Sort files naturally before saving
      const sortedFiles = orderBy(files, [(file) => file], ['asc']);

      // Serialize config if provided
      const configJson = config ? JSON.stringify(config) : undefined;
      const key = FileSelectionService.save(sortedFiles, configJson);

      return new Response(JSON.stringify({ key }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (error) {
      logger.error('Error saving file selections', { error });
      captureException(error);
      return new Response(
        JSON.stringify({
          error: 'Failed to save file selections',
          details: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

/**
 * GET /api/file-selections/:key - Get file selections by key
 */
export async function fileSelectionByKeyHandler(
  req: Request,
  key: string,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const result = FileSelectionService.get(key);

    if (!result) {
      return new Response(
        JSON.stringify({ error: 'File selections not found' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    // Extract selectedFiles from the picker state format
    // Expected format: { files: { selectedFiles: [...], ... }, config?: {...} }
    if (
      !result.files ||
      typeof result.files !== 'object' ||
      !('selectedFiles' in result.files) ||
      !Array.isArray((result.files as any).selectedFiles)
    ) {
      return new Response(
        JSON.stringify({
          error: 'Invalid file selection format',
          details: 'Expected picker state with selectedFiles array',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    const files = (result.files as any).selectedFiles;
    const config = result.config || (result.files as any).config;

    // Sort files naturally before returning
    const sortedFiles = orderBy(files, [(file) => file], ['asc']);

    return new Response(JSON.stringify({ files: sortedFiles, config }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    logger.error('Error retrieving file selections', { error });
    captureException(error);
    return new Response(
      JSON.stringify({
        error: 'Failed to retrieve file selections',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
}
