import { filesHandler } from './handlers/files';
import { jobsHandler, jobByIdHandler } from './handlers/jobs';
import {
  fileSelectionsHandler,
  fileSelectionByKeyHandler,
} from './handlers/file-selections';

export async function setupRoutes(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const { pathname } = url;

  // Enable CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Route: GET /api/files
    if (pathname === '/api/files' && req.method === 'GET') {
      return await filesHandler(req, corsHeaders);
    }

    // Route: GET /api/jobs
    if (pathname === '/api/jobs' && req.method === 'GET') {
      return await jobsHandler(req, corsHeaders);
    }

    // Route: POST /api/jobs
    if (pathname === '/api/jobs' && req.method === 'POST') {
      return await jobsHandler(req, corsHeaders);
    }

    // Route: PATCH /api/jobs/:id
    const jobIdMatch = pathname.match(/^\/api\/jobs\/(\d+)$/);
    if (jobIdMatch && req.method === 'PATCH') {
      const jobId = parseInt(jobIdMatch[1], 10);
      return await jobByIdHandler(req, jobId, corsHeaders);
    }

    // Route: POST /api/file-selections
    if (pathname === '/api/file-selections' && req.method === 'POST') {
      return await fileSelectionsHandler(req, corsHeaders);
    }

    // Route: GET /api/file-selections/:key
    const fileSelectionMatch = pathname.match(/^\/api\/file-selections\/(.+)$/);
    if (fileSelectionMatch && req.method === 'GET') {
      const key = fileSelectionMatch[1];
      return await fileSelectionByKeyHandler(req, key, corsHeaders);
    }

    // 404 Not Found
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    console.error('Error handling request:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
}
