import { filesHandler } from './handlers/files';
import { jobsHandler, jobByIdHandler } from './handlers/jobs';
import {
  fileSelectionsHandler,
  fileSelectionByKeyHandler,
} from './handlers/file-selections';
import {
  getPickerStateHandler,
  pickerActionHandler,
} from './handlers/file-picker';
import { testNotificationHandler } from './handlers/notifications';
import { logger, captureException } from '../src/lib/sentry';
import { withErrorHandler } from './handler-wrapper';

function getSettingsResponse(corsHeaders: Record<string, string>): Response {
  const version = process.env.APP_VERSION || null;
  const sentryClientDsn = process.env.SENTRY_CLIENT_DSN || null;
  const sentryEnvironment = process.env.SENTRY_ENVIRONMENT || 'production';
  const sentrySendDefaultPii = process.env.SENTRY_SEND_DEFAULT_PII === 'true';

  const response: any = { version };

  // Include Sentry config for the client if DSN is set
  if (sentryClientDsn) {
    response.sentry = {
      dsn: sentryClientDsn,
      environment: sentryEnvironment,
      sendDefaultPii: sentrySendDefaultPii,
      enableLogs: true,
    };
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Wrap all handlers with error handling for defense in depth
// This catches any errors that slip through the handlers' internal error handling
const wrappedFilesHandler = withErrorHandler(filesHandler, 'FilesHandler');
const wrappedJobsHandler = withErrorHandler(jobsHandler, 'JobsHandler');
const wrappedJobByIdHandler = withErrorHandler(
  jobByIdHandler,
  'JobByIdHandler',
);
const wrappedFileSelectionsHandler = withErrorHandler(
  fileSelectionsHandler,
  'FileSelectionsHandler',
);
const wrappedFileSelectionByKeyHandler = withErrorHandler(
  fileSelectionByKeyHandler,
  'FileSelectionByKeyHandler',
);
const wrappedGetPickerStateHandler = withErrorHandler(
  getPickerStateHandler,
  'GetPickerStateHandler',
);
const wrappedPickerActionHandler = withErrorHandler(
  pickerActionHandler,
  'PickerActionHandler',
);
const wrappedTestNotificationHandler = withErrorHandler(
  testNotificationHandler,
  'TestNotificationHandler',
);

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
      return await wrappedFilesHandler(req, corsHeaders);
    }

    // Route: GET /api/jobs
    if (pathname === '/api/jobs' && req.method === 'GET') {
      return await wrappedJobsHandler(req, corsHeaders);
    }

    // Route: POST /api/jobs
    if (pathname === '/api/jobs' && req.method === 'POST') {
      return await wrappedJobsHandler(req, corsHeaders);
    }

    // Route: PUT /api/jobs
    if (pathname === '/api/jobs' && req.method === 'PUT') {
      return await wrappedJobsHandler(req, corsHeaders);
    }

    // Route: DELETE /api/jobs
    if (pathname === '/api/jobs' && req.method === 'DELETE') {
      return await wrappedJobsHandler(req, corsHeaders);
    }

    // Route: GET /api/jobs/:id
    const jobIdMatch = pathname.match(/^\/api\/jobs\/(\d+)$/);
    if (jobIdMatch && req.method === 'GET') {
      const jobId = parseInt(jobIdMatch[1], 10);
      return await wrappedJobByIdHandler(req, jobId, corsHeaders);
    }

    // Route: PATCH /api/jobs/:id
    if (jobIdMatch && req.method === 'PATCH') {
      const jobId = parseInt(jobIdMatch[1], 10);
      return await wrappedJobByIdHandler(req, jobId, corsHeaders);
    }

    // Route: POST /api/file-selections
    if (pathname === '/api/file-selections' && req.method === 'POST') {
      return await wrappedFileSelectionsHandler(req, corsHeaders);
    }

    // Route: GET /api/file-selections/:key
    const fileSelectionMatch = pathname.match(/^\/api\/file-selections\/(.+)$/);
    if (fileSelectionMatch && req.method === 'GET') {
      const key = fileSelectionMatch[1];
      return await wrappedFileSelectionByKeyHandler(req, key, corsHeaders);
    }

    // Route: GET /api/picker-state
    if (pathname === '/api/picker-state' && req.method === 'GET') {
      return await wrappedGetPickerStateHandler(req, corsHeaders);
    }

    // Route: POST /api/picker-action
    if (pathname === '/api/picker-action' && req.method === 'POST') {
      return await wrappedPickerActionHandler(req, corsHeaders);
    }

    // Route: GET /api/settings
    if (pathname === '/api/settings' && req.method === 'GET') {
      return getSettingsResponse(corsHeaders);
    }

    // Route: GET /api/version (kept for backwards compatibility)
    if (pathname === '/api/version' && req.method === 'GET') {
      return getSettingsResponse(corsHeaders);
    }

    // Route: POST /api/notifications/test
    if (pathname === '/api/notifications/test' && req.method === 'POST') {
      return await wrappedTestNotificationHandler(req, corsHeaders);
    }

    // 404 Not Found
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    // This is a final safety net - should rarely be hit since handlers are wrapped
    logger.error('[API] Error handling request', {
      error: error instanceof Error ? error.message : String(error),
      path: pathname,
      method: req.method,
    });
    captureException(error);
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
