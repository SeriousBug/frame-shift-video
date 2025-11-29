import { notificationService } from '../notification-service';
import { JobService } from '../db-service';
import { logger, captureException } from '../../src/lib/sentry';

/** Response for GET /api/notifications/status */
export interface NotificationStatusResponse {
  enabled: boolean;
  methods: string[];
}

/**
 * GET /api/notifications/status - Get notification configuration status
 */
export async function notificationStatusHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    const enabled = notificationService.isEnabled();
    const methods = notificationService.getConfiguredMethods();

    return new Response(
      JSON.stringify({
        enabled,
        methods,
      } satisfies NotificationStatusResponse),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  } catch (error) {
    logger.error('[NotificationHandler] Failed to get notification status', {
      error,
    });
    captureException(error);
    return new Response(
      JSON.stringify({
        error: 'Failed to get notification status',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
}

/**
 * POST /api/notifications/test - Send a test notification
 */
export async function testNotificationHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    // Check if notifications are enabled
    if (!notificationService.isEnabled()) {
      return new Response(
        JSON.stringify({
          error: 'Notifications are not configured',
          message:
            'Please set up DISCORD_WEBHOOK_URL or PUSHOVER_API_TOKEN/PUSHOVER_USER_KEY environment variables',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    // Get actual job counts for the test notification
    const completedJobs = JobService.getByStatus('completed');
    const failedJobs = JobService.getByStatus('failed');

    // Reset cooldown to allow test notification to be sent
    notificationService.resetCooldown();

    // Send the test notification with actual counts
    await notificationService.notifyAllJobsComplete(
      completedJobs.length,
      failedJobs.length,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Test notification sent successfully',
        completedCount: completedJobs.length,
        failedCount: failedJobs.length,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  } catch (error) {
    logger.error('[NotificationHandler] Test notification failed', { error });
    captureException(error);
    return new Response(
      JSON.stringify({
        error: 'Failed to send test notification',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
}
