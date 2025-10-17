# Error Handling & Sentry Integration

## Overview

The application uses a multi-layered error handling approach with Sentry integration for monitoring production errors.

## Architecture

### 1. Handler Error Wrapper (`server/handler-wrapper.ts`)

All API handlers are wrapped with `withErrorHandler()` which provides automatic error catching and Sentry reporting. This is the **outer layer** of defense.

```typescript
const wrappedHandler = withErrorHandler(myHandler, 'MyHandler');
```

**Benefits:**

- Catches any unexpected errors that slip through handler logic
- Automatically logs and sends to Sentry
- Provides consistent error response format
- Defense in depth - catches programming errors

### 2. Handler-Level Error Handling

Handlers contain internal try/catch blocks for **specific error handling**:

```typescript
export async function myHandler(
  req: Request,
  corsHeaders: Record<string, string>,
) {
  try {
    // Business logic
    const result = await someOperation();
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (error) {
    // Specific error with custom message and status code
    logger.error('Operation failed', { error });
    captureException(error); // Send to Sentry
    return new Response(
      JSON.stringify({ error: 'Custom error message' }),
      { status: 400 }, // Can use any appropriate status code
    );
  }
}
```

**Benefits:**

- Custom error messages for users
- Appropriate HTTP status codes (400, 404, etc.)
- Specific context in logs

### 3. Routes-Level Safety Net (`server/routes.ts`)

A final try/catch in `setupRoutes()` catches route-level errors:

```typescript
try {
  // Route handling
  return await wrappedHandler(req, corsHeaders);
} catch (error) {
  // Final safety net
  captureException(error);
  return new Response(...);
}
```

## Where Exceptions Are Thrown

### Server-Side

1. **API Handlers** (`server/handlers/*.ts`)
   - All throw statements are caught by internal try/catch
   - All errors sent to Sentry via `captureException()`
   - ✅ Fully covered

2. **Job Processor** (`server/job-processor.ts`)
   - Errors during FFmpeg execution
   - File system operations
   - ✅ All caught and sent to Sentry

3. **Notification Service** (`server/notification-service.ts`)
   - Network errors from Discord/Pushover
   - ✅ All caught and sent to Sentry

4. **File Picker Service** (`server/file-picker-service.ts`)
   - Path validation errors
   - Thrown errors propagate to handlers
   - ✅ Caught by handler wrappers

5. **FFmpeg Command Builder** (`src/lib/ffmpeg-command.ts`)
   - Security validation errors (path traversal, dangerous characters)
   - Command generation errors
   - Called from handlers, so errors are caught
   - ✅ Covered

6. **Temp File Service** (`server/temp-file-service.ts`)
   - File system errors
   - Called from job processor with error handling
   - ✅ Covered

### Client-Side

Client-side Sentry is initialized separately via `initializeClientMonitoring()` in `src/main.tsx`.

## Best Practices

### For New Handlers

**Option 1: Let the wrapper handle it (recommended for simple handlers)**

```typescript
export async function simpleHandler(
  req: Request,
  corsHeaders: Record<string, string>,
) {
  // No try/catch needed - wrapper catches everything
  const data = await operation();
  return new Response(JSON.stringify(data), { status: 200 });
}
```

**Option 2: Specific error handling (recommended for complex handlers)**

```typescript
export async function complexHandler(
  req: Request,
  corsHeaders: Record<string, string>,
) {
  try {
    const data = await operation();
    return new Response(JSON.stringify(data), { status: 200 });
  } catch (error) {
    logger.error('Specific operation failed', { error });
    captureException(error);
    return new Response(JSON.stringify({ error: 'User-friendly message' }), {
      status: 400,
    });
  }
}
```

**Option 3: Mix both (recommended for most handlers)**

```typescript
export async function mixedHandler(
  req: Request,
  corsHeaders: Record<string, string>,
) {
  // Validate input
  if (!req.body) {
    return new Response(JSON.stringify({ error: 'Body required' }), {
      status: 400,
    });
  }

  // Complex operation - catch expected errors
  try {
    const data = await complexOperation();
    return new Response(JSON.stringify(data), { status: 200 });
  } catch (error) {
    if (error instanceof SpecificError) {
      // Handle known error
      return new Response(JSON.stringify({ error: 'Specific message' }), {
        status: 400,
      });
    }
    // Unknown error - rethrow to be caught by wrapper
    throw error;
  }
}
```

### For Service Functions

Always log errors before throwing:

```typescript
export function someServiceFunction() {
  try {
    // Operation
  } catch (error) {
    logger.error('Service operation failed', { error });
    throw error; // Let caller handle it
  }
}
```

## Monitoring

### Sentry Configuration

**Server:**

- Set `SENTRY_SERVER_DSN` environment variable
- Initialized in `server/index.ts` via `initializeServerMonitoring()`

**Client:**

- Set `SENTRY_CLIENT_DSN` environment variable
- Exposed to client via `/api/settings` endpoint
- Initialized in `src/main.tsx` via `initializeClientMonitoring()`

**Optional:**

- `SENTRY_ENVIRONMENT` - Environment name (default: 'production')
- `SENTRY_SEND_DEFAULT_PII` - Send user info (default: false)

### Testing Sentry

1. Set DSN in environment
2. Trigger an error (e.g., file with invalid characters)
3. Check Sentry dashboard for captured exception

### Logs vs Sentry

- **`logger.error()`** - Logs to console/file, does NOT send to Sentry
- **`captureException(error)`** - Sends to Sentry with full context
- **Always use both** for complete error tracking

## Current Coverage

✅ All API handlers wrapped with error handler
✅ All handler try/catch blocks call captureException()
✅ Job processor errors captured
✅ Notification errors captured
✅ File system errors captured
✅ FFmpeg command errors captured
✅ Defense in depth with multiple layers

## Future Improvements

- [ ] Custom error classes with status codes to reduce boilerplate
- [ ] Error rate monitoring and alerting
- [ ] Automatic error grouping by type
- [ ] Performance monitoring with Sentry spans (already available via `startSpan()`)
