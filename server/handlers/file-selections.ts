import { FileSelectionService } from '../db-service';

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

      // Serialize config if provided
      const configJson = config ? JSON.stringify(config) : undefined;
      const key = FileSelectionService.save(files, configJson);

      return new Response(JSON.stringify({ key }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (error) {
      console.error('Error saving file selections:', error);
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

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    console.error('Error retrieving file selections:', error);
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
