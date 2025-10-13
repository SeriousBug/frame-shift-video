import { notificationService } from '../notification-service';
import { JobService } from '../db-service';

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
    console.error('[NotificationHandler] Test notification failed:', error);
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
