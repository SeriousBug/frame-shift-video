/**
 * Shared monitoring system for both client and server
 * Uses Sentry when configured, falls back to console logging otherwise
 */

export interface SentryConfig {
  dsn?: string;
  environment?: string;
  sendDefaultPii?: boolean;
  enableLogs?: boolean;
}

interface SettingsResponse {
  version?: string | null;
  sentry?: SentryConfig;
}

export interface SpanContext {
  op: string;
  name: string;
}

export interface Logger {
  trace(message: string, data?: Record<string, any>): void;
  debug(message: string | TemplateStringsArray, ...values: any[]): void;
  info(message: string, data?: Record<string, any>): void;
  warn(message: string, data?: Record<string, any>): void;
  error(message: string, data?: Record<string, any>): void;
  fatal(message: string, data?: Record<string, any>): void;
  fmt(strings: TemplateStringsArray, ...values: any[]): string;
}

export interface CaptureContext {
  tags?: Record<string, string>;
  extra?: Record<string, any>;
  contexts?: Record<string, any>;
}

export interface Monitor {
  captureException(error: Error | unknown, context?: CaptureContext): void;
  startSpan<T>(context: SpanContext, callback: (span: any) => T): T;
  logger: Logger;
}

class SentryMonitor implements Monitor {
  logger: Logger;
  private sentryInstance: any;

  constructor(sentryInstance: any) {
    this.sentryInstance = sentryInstance;
    this.logger = {
      trace: (message: string, data?: Record<string, any>) => {
        sentryInstance.logger.trace(message, data);
      },
      debug: (message: string | TemplateStringsArray, ...values: any[]) => {
        if (typeof message === 'string') {
          sentryInstance.logger.debug(message);
        } else {
          sentryInstance.logger.debug(
            sentryInstance.logger.fmt(message, ...values),
          );
        }
      },
      info: (message: string, data?: Record<string, any>) => {
        sentryInstance.logger.info(message, data);
      },
      warn: (message: string, data?: Record<string, any>) => {
        sentryInstance.logger.warn(message, data);
      },
      error: (message: string, data?: Record<string, any>) => {
        sentryInstance.logger.error(message, data);
      },
      fatal: (message: string, data?: Record<string, any>) => {
        sentryInstance.logger.fatal(message, data);
      },
      fmt: (strings: TemplateStringsArray, ...values: any[]) => {
        return sentryInstance.logger.fmt(strings, ...values);
      },
    };
  }

  captureException(error: Error | unknown, context?: CaptureContext): void {
    this.sentryInstance.captureException(error, context);
  }

  startSpan<T>(context: SpanContext, callback: (span: any) => T): T {
    return this.sentryInstance.startSpan(context, callback);
  }
}

export class ConsoleMonitor implements Monitor {
  logger: Logger;

  constructor() {
    this.logger = {
      trace: (message: string, data?: Record<string, any>) => {
        console.debug('[TRACE]', message, data);
      },
      debug: (message: string | TemplateStringsArray, ...values: any[]) => {
        console.debug('[DEBUG]', message, ...values);
      },
      info: (message: string, data?: Record<string, any>) => {
        console.info('[INFO]', message, data);
      },
      warn: (message: string, data?: Record<string, any>) => {
        console.warn('[WARN]', message, data);
      },
      error: (message: string, data?: Record<string, any>) => {
        console.error('[ERROR]', message, data);
      },
      fatal: (message: string, data?: Record<string, any>) => {
        console.error('[FATAL]', message, data);
      },
      fmt: (strings: TemplateStringsArray, ...values: any[]) => {
        return strings.reduce(
          (acc, str, i) => acc + str + (values[i] ?? ''),
          '',
        );
      },
    };
  }

  captureException(error: Error | unknown, context?: CaptureContext): void {
    console.error('Exception:', error);
    if (context) {
      console.error('Context:', context);
    }
  }

  startSpan<T>(context: SpanContext, callback: (span: any) => T): T {
    console.log(`Span [${context.op}]: ${context.name}`);
    return callback(null);
  }
}

let monitor: Monitor | null = null;

/**
 * Initialize monitoring on the client by fetching configuration from the server.
 * This must be called early in the application lifecycle.
 */
export async function initializeClientMonitoring(): Promise<void> {
  try {
    const response = await fetch('/api/settings');
    const data: SettingsResponse = await response.json();

    // Only initialize Sentry if config is provided
    if (data.sentry?.dsn) {
      const Sentry = await import('@sentry/react');
      Sentry.init({
        dsn: data.sentry.dsn,
        environment: data.sentry.environment || 'production',
        sendDefaultPii: data.sentry.sendDefaultPii ?? true,
        enableLogs: data.sentry.enableLogs ?? true,
      });
      monitor = new SentryMonitor(Sentry);
      console.log('Sentry (client) initialized successfully');
    } else {
      monitor = new ConsoleMonitor();
      console.log('Sentry not configured - using console logging fallback');
    }
  } catch (error) {
    console.error('Failed to initialize client monitoring:', error);
    monitor = new ConsoleMonitor();
  }
}

/**
 * Initialize monitoring on the server from environment variables.
 * This must be called early in the application lifecycle.
 * Uses dynamic import to avoid bundling server code in client builds.
 */
export async function initializeServerMonitoring(): Promise<void> {
  try {
    const dsn = process.env.SENTRY_SERVER_DSN;

    // Only initialize Sentry if DSN is provided
    if (dsn) {
      const Sentry = await import('@sentry/bun');
      Sentry.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT || 'production',
        sendDefaultPii: process.env.SENTRY_SEND_DEFAULT_PII === 'true',
        enableLogs: true,
      });
      monitor = new SentryMonitor(Sentry);
      console.log('Sentry (server) initialized successfully');
    } else {
      monitor = new ConsoleMonitor();
      console.log('Sentry not configured - using console logging fallback');
    }
  } catch (error) {
    console.error('Failed to initialize server monitoring:', error);
    monitor = new ConsoleMonitor();
  }
}

/**
 * Legacy alias for client initialization (for backward compatibility)
 * @deprecated Use initializeClientMonitoring() instead
 */
export const initializeMonitoring = initializeClientMonitoring;

/**
 * Get the monitor instance
 */
export function getMonitor(): Monitor {
  if (!monitor) {
    throw new Error(
      'Monitor not initialized. Call initializeMonitoring() first.',
    );
  }
  return monitor;
}

/**
 * Convenience exports for common operations
 */
export const captureException = (
  error: Error | unknown,
  context?: CaptureContext,
) => getMonitor().captureException(error, context);
export const startSpan = <T>(
  context: SpanContext,
  callback: (span: any) => T,
): T => getMonitor().startSpan(context, callback);
export const logger = new Proxy({} as Logger, {
  get: (_, prop: string) => {
    return (...args: any[]) => (getMonitor().logger as any)[prop](...args);
  },
});
