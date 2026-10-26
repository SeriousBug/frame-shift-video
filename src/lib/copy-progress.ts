import type { DiscCopy } from '@/types/discs';

/** What the Discs page shows about a disc that is being copied. */
export interface CopyProgress {
  /** 0 to 100 */
  percent: number;
  copied: string;
  total: string;
  /** Like "2.1 MB/s", or null while it is too early to say */
  speed: string | null;
  /** Like "about 14 minutes left", or null while it is too early to say or the copy has stopped writing */
  left: string | null;
  /** The copy has not written anything for a while */
  stalled: boolean;
}

/** Seconds without an update after which the numbers are no longer trusted. */
const STALLED_SECONDS = 90;
/** The speed is only worked out once this much has been copied, or it jumps about. */
const MIN_SECONDS = 20;

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(0, Math.round(bytes / 1e3))} KB`;
}

/** "about 40 seconds", "about 14 minutes", "about 1 hour 5 minutes". */
export function formatDuration(seconds: number): string {
  if (seconds < 90)
    return `about ${Math.max(5, Math.round(seconds / 5) * 5)} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `about ${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `about ${hours} hour${hours === 1 ? '' : 's'}${rest ? ` ${rest} minutes` : ''}`;
}

/**
 * The bar, and the time left, from what the ripper wrote: how much of the disc is copied, when the
 * copy started and when it last wrote. The speed is the average since the start, which is steady
 * enough to trust for a copy that runs at one speed.
 */
export function copyProgress(
  copy: DiscCopy,
  nowSeconds: number,
): CopyProgress | null {
  if (copy.total <= 0 || copy.bytes < 0) return null;
  const bytes = Math.min(copy.bytes, copy.total);
  const percent = Math.min(100, Math.floor((bytes / copy.total) * 100));
  const elapsed = copy.updatedAt - copy.startedAt;
  const stalled = nowSeconds - copy.updatedAt > STALLED_SECONDS;
  const known = elapsed >= MIN_SECONDS && bytes > 0;
  const rate = known ? bytes / elapsed : 0;
  return {
    percent,
    copied: formatBytes(bytes),
    total: formatBytes(copy.total),
    speed: known ? `${(rate / 1e6).toFixed(1)} MB/s` : null,
    left:
      known && !stalled ? formatDuration((copy.total - bytes) / rate) : null,
    stalled,
  };
}
