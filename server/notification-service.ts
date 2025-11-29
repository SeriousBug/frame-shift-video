/**
 * Notification service for sending alerts when all jobs are complete
 * Supports Discord webhooks and Pushover API
 */

import { logger, captureException } from '../src/lib/sentry';

/**
 * Notification configuration from environment variables
 */
interface NotificationConfig {
  discord?: {
    webhookUrl: string;
  };
  pushover?: {
    token: string;
    userKey: string;
  };
}

/**
 * Get notification configuration from environment variables
 */
function getNotificationConfig(): NotificationConfig {
  const config: NotificationConfig = {};

  // Discord webhook configuration
  const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
  if (discordWebhook) {
    config.discord = { webhookUrl: discordWebhook };
  }

  // Pushover configuration
  const pushoverToken = process.env.PUSHOVER_API_TOKEN;
  const pushoverUser = process.env.PUSHOVER_USER_KEY;
  if (pushoverToken && pushoverUser) {
    config.pushover = {
      token: pushoverToken,
      userKey: pushoverUser,
    };
  }

  return config;
}

/**
 * Send a Discord webhook notification
 */
async function sendDiscordNotification(
  webhookUrl: string,
  message: string,
): Promise<void> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: message,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error('Discord webhook request failed', {
        cause: { status: response.status, response: responseText },
      });
    }

    logger.info('[NotificationService] Discord notification sent successfully');
  } catch (error) {
    logger.error('[NotificationService] Failed to send Discord notification', {
      error: error instanceof Error ? error.message : String(error),
    });
    captureException(error);
    throw error;
  }
}

/**
 * Send a Pushover notification
 */
async function sendPushoverNotification(
  token: string,
  userKey: string,
  message: string,
  title?: string,
): Promise<void> {
  try {
    const params = new URLSearchParams({
      token,
      user: userKey,
      message,
      title: title || 'Frame Shift Video',
    });

    const response = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error('Pushover API request failed', {
        cause: { status: response.status, error: errorText },
      });
    }

    logger.info(
      '[NotificationService] Pushover notification sent successfully',
    );
  } catch (error) {
    logger.error('[NotificationService] Failed to send Pushover notification', {
      error: error instanceof Error ? error.message : String(error),
    });
    captureException(error);
    throw error;
  }
}

/**
 * Notification service for sending alerts
 */
export class NotificationService {
  private config: NotificationConfig;
  private lastNotificationSent: Date | null = null;
  private notificationCooldown = 60000; // 1 minute cooldown to prevent spam

  constructor() {
    this.config = getNotificationConfig();
  }

  /**
   * Check if notifications are enabled
   */
  isEnabled(): boolean {
    return !!(this.config.discord || this.config.pushover);
  }

  /**
   * Get list of configured notification methods (without revealing secrets)
   */
  getConfiguredMethods(): string[] {
    const methods: string[] = [];
    if (this.config.discord) {
      methods.push('Discord');
    }
    if (this.config.pushover) {
      methods.push('Pushover');
    }
    return methods;
  }

  /**
   * Send notification that all jobs are complete
   */
  async notifyAllJobsComplete(
    completedCount: number,
    failedCount: number,
  ): Promise<void> {
    // Check cooldown to prevent spam
    if (this.lastNotificationSent) {
      const timeSinceLastNotification =
        Date.now() - this.lastNotificationSent.getTime();
      if (timeSinceLastNotification < this.notificationCooldown) {
        logger.debug(
          '[NotificationService] Skipping notification due to cooldown',
        );
        return;
      }
    }

    // Create message
    let message = '✅ All video processing jobs complete!\n\n';
    message += `Completed: ${completedCount}\n`;
    if (failedCount > 0) {
      message += `Failed: ${failedCount}\n`;
    }

    logger.info('[NotificationService] Sending completion notification', {
      completedCount,
      failedCount,
    });

    // Send notifications to all enabled services
    const promises: Promise<void>[] = [];

    if (this.config.discord) {
      promises.push(
        sendDiscordNotification(this.config.discord.webhookUrl, message),
      );
    }

    if (this.config.pushover) {
      promises.push(
        sendPushoverNotification(
          this.config.pushover.token,
          this.config.pushover.userKey,
          message,
          'All Jobs Complete',
        ),
      );
    }

    // Wait for all notifications to be sent
    const results = await Promise.allSettled(promises);

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const service = index === 0 ? 'Discord' : 'Pushover';
        logger.error(`[NotificationService] ${service} notification failed`, {
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
        captureException(result.reason);
      }
    });

    // Update last notification time
    this.lastNotificationSent = new Date();
  }

  /**
   * Reset the notification cooldown (useful for testing or manual triggers)
   */
  resetCooldown(): void {
    this.lastNotificationSent = null;
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
