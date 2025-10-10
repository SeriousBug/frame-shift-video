/**
 * Next.js instrumentation file for server-side initialization
 * This runs once when the server starts
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeJobProcessor } = await import('./lib/job-processor');

    const uploadsDir = process.env.UPLOAD_DIR || './uploads';
    const outputsDir = process.env.OUTPUT_DIR || './outputs';

    try {
      await initializeJobProcessor({
        uploadsDir,
        outputsDir,
        checkInterval: 60000, // Check for new jobs every minute
      });

      console.log('[App] Job processor initialized successfully');
    } catch (error) {
      console.error('[App] Failed to initialize job processor:', error);
      // Don't throw - allow app to start even if job processor fails
      // Jobs can still be created, they just won't be processed until manually triggered
    }
  }
}
