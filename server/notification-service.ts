/**
 * Notification service for sending alerts when all jobs are complete
 * Supports Discord webhooks and Pushover API
 */

import { logger, captureException } from '../src/lib/sentry';
import { hobworkNotify, linkTo, readSettings } from './hobwork-service';

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
  link?: { url: string; title: string },
): Promise<void> {
  try {
    const params = new URLSearchParams({
      token,
      user: userKey,
      message,
      title: title || 'Frame Shift Video',
    });
    // Pushover shows this as a tappable link under the message.
    if (link) {
      params.set('url', link.url);
      params.set('url_title', link.title);
    }

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
 * A notice from the disc ripper, to Pushover with a link to the page that deals with it. Resolves
 * false when Pushover is not set up; throws when it is and the send failed.
 */
export async function sendPushoverNotice(
  title: string,
  message: string,
  link?: { url: string; title: string },
): Promise<boolean> {
  const token = process.env.PUSHOVER_API_TOKEN;
  const userKey = process.env.PUSHOVER_USER_KEY;
  if (!token || !userKey) return false;
  await sendPushoverNotification(token, userKey, message, title, link);
  return true;
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
    return !!(this.config.discord || this.config.pushover || this.hobworkOn());
  }

  /** Whether notifications also go through Hobwork (connected, and switched on). */
  private hobworkOn(): boolean {
    const settings = readSettings();
    return settings.url !== null && settings.notifications;
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
    if (this.hobworkOn()) {
      methods.push('Hobwork');
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
    const names: string[] = [];

    if (this.config.discord) {
      names.push('Discord');
      promises.push(
        sendDiscordNotification(this.config.discord.webhookUrl, message),
      );
    }

    if (this.config.pushover) {
      const page = linkTo('/');
      names.push('Pushover');
      promises.push(
        sendPushoverNotification(
          this.config.pushover.token,
          this.config.pushover.userKey,
          message,
          'All Jobs Complete',
          page ? { url: page, title: 'Open Frame Shift' } : undefined,
        ),
      );
    }

    if (this.hobworkOn()) {
      names.push('Hobwork');
      promises.push(
        hobworkNotify({
          kind: 'converted',
          id: 'converted',
          title:
            failedCount > 0
              ? `${failedCount} conversion${failedCount === 1 ? '' : 's'} failed`
              : 'Conversions finished',
          message: `Completed: ${completedCount}${failedCount > 0 ? `, failed: ${failedCount}` : ''}`,
          path: '/',
        }).then((sent) => {
          if (!sent) throw new Error('Hobwork did not take the notification');
        }),
      );
    }

    // Wait for all notifications to be sent
    const results = await Promise.allSettled(promises);

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const service = names[index] ?? 'A notification service';
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
