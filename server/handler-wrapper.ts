/**
 * Handler wrapper utility for automatic error handling and Sentry capture
 * Wraps API handlers to catch errors, log them, and send to Sentry automatically
 */

import { logger, captureException } from '../src/lib/sentry';

type HandlerFunction = (
  req: Request,
  ...args: any[]
) => Promise<Response> | Response;

/**
 * Wraps an API handler with automatic error catching, logging, and Sentry capture
 *
 * @param handler - The handler function to wrap
 * @param handlerName - Optional name for logging (defaults to 'Handler')
 * @returns Wrapped handler that catches and reports errors automatically
 *
 * @example
 * export const myHandler = withErrorHandler(
 *   async (req, corsHeaders) => {
 *     // Your handler code - any thrown errors will be caught and reported
 *     const data = await someOperation();
 *     return new Response(JSON.stringify(data), { status: 200 });
 *   },
 *   'MyHandler'
 * );
 */
export function withErrorHandler<T extends HandlerFunction>(
  handler: T,
  handlerName: string = 'Handler',
): T {
  return (async (req: Request, ...args: any[]) => {
    // Extract corsHeaders if present (usually the last argument)
    const corsHeaders =
      args.length > 0 && typeof args[args.length - 1] === 'object'
        ? args[args.length - 1]
        : {};

    try {
      return await handler(req, ...args);
    } catch (error) {
      // Log the error with context
      logger.error(`[${handlerName}] Unhandled error`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        path: new URL(req.url).pathname,
        method: req.method,
      });

      // Capture exception to Sentry
      captureException(error);

      // Return error response
      return new Response(
        JSON.stringify({
          error: `${handlerName} failed`,
          details: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }
  }) as T;
}

/**
 * Higher-order function for wrapping multiple handlers at once
 *
 * @example
 * const handlers = wrapHandlers({
 *   jobs: jobsHandler,
 *   files: filesHandler,
 * });
 */
export function wrapHandlers<T extends Record<string, HandlerFunction>>(
  handlers: T,
): T {
  const wrapped: any = {};
  for (const [name, handler] of Object.entries(handlers)) {
    wrapped[name] = withErrorHandler(handler, name);
  }
  return wrapped;
}
