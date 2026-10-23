/**
 * The Live Activity for conversions. The job processor says when a job starts, moves along,
 * finishes or fails; this keeps count of the batch (the jobs from the queue starting up until it
 * is empty again) and tells Hobwork.
 */

import path from 'path';
import { hobworkActivity, liveActivitiesOn } from './hobwork-service';
import type { Job } from '../src/types/database';

const ACTIVITY_ID = 'convert';
/** Progress changes come every second or so; a phone needs one every few seconds. */
const MIN_SECONDS_BETWEEN_UPDATES = 10;

type Activity = Parameters<typeof hobworkActivity>[0];

export interface QueueCounts {
  pending: number;
  processing: number;
}

export interface ConvertActivityOptions {
  counts: () => QueueCounts;
  send: (activity: Activity) => void | Promise<unknown>;
  enabled: () => boolean;
  /** Seconds, for tests */
  now?: () => number;
}

/** A job's name for a title: the file it converts, without its folder or extension. */
export function jobTitle(job: Pick<Job, 'input_file' | 'name'>): string {
  const file = job.input_file
    ? path.parse(job.input_file).name
    : job.name || 'Converting';
  return file.length > 64 ? `${file.slice(0, 63)}…` : file;
}

export class ConvertActivity {
  private done = 0;
  private failed = 0;
  private lastSent = 0;
  private active = false;

  constructor(private readonly options: ConvertActivityOptions) {}

  private now(): number {
    return (this.options.now ?? (() => Date.now() / 1000))();
  }

  private total(): number {
    const { pending, processing } = this.options.counts();
    return this.done + this.failed + pending + processing;
  }

  private overall(job: Job): number {
    const total = Math.max(1, this.total());
    const within = Math.min(1, Math.max(0, (job.progress ?? 0) / 100));
    return Math.min(1, (this.done + this.failed + within) / total);
  }

  private async update(job: Job, force: boolean): Promise<void> {
    if (!this.options.enabled()) {
      this.active = false;
      return;
    }
    const now = this.now();
    if (!force && now - this.lastSent < MIN_SECONDS_BETWEEN_UPDATES) return;
    this.lastSent = now;
    const total = Math.max(1, this.total());
    const position = Math.min(total, this.done + this.failed + 1);
    const percent = Math.round(Math.min(100, Math.max(0, job.progress ?? 0)));
    const state = this.active ? 'update' : 'start';
    this.active = true;
    await this.options.send({
      kind: 'convert',
      id: ACTIVITY_ID,
      state,
      title: jobTitle(job),
      subtitle:
        total > 1 ? `${position} of ${total} · ${percent}%` : `${percent}%`,
      progress: this.overall(job),
      value: `${percent}%`,
      icon: 'film',
      path: '/',
    });
  }

  /** A job began. */
  onStart(job: Job): Promise<void> {
    return this.update(job, true);
  }

  /** A job moved along. */
  onProgress(job: Job): Promise<void> {
    return this.update(job, false);
  }

  /** A job finished or failed; says when the whole queue is done. */
  async onFinish(job: Job, failed: boolean): Promise<void> {
    if (failed) this.failed++;
    else this.done++;
    const { pending, processing } = this.options.counts();
    if (pending + processing > 0) return;
    // The queue is empty: close the activity and start the next batch's count over.
    const done = this.done;
    const failures = this.failed;
    this.done = 0;
    this.failed = 0;
    if (!this.active || !this.options.enabled()) {
      this.active = false;
      return;
    }
    this.active = false;
    await this.options.send({
      kind: 'convert',
      id: ACTIVITY_ID,
      state: 'end',
      title:
        failures > 0
          ? `${failures} failed`
          : done === 1
            ? 'Conversion finished'
            : `${done} conversions finished`,
      subtitle:
        failures > 0
          ? `${done} converted, ${failures} failed`
          : `Last: ${jobTitle(job)}`,
      progress: failures > 0 ? undefined : 1,
      failed: failures > 0,
      icon: failures > 0 ? 'exclamationmark.triangle' : 'checkmark.circle',
      path: '/',
    });
  }
}

/** Connects a conversion activity to the job processor's events. */
export function attachConvertActivity(
  processor: {
    on(
      event: 'job:start' | 'job:progress' | 'job:complete',
      fn: (job: Job) => void,
    ): unknown;
    on(event: 'job:fail', fn: (job: Job, error: string) => void): unknown;
  },
  counts: () => QueueCounts,
): ConvertActivity {
  const activity = new ConvertActivity({
    counts,
    send: (event) => hobworkActivity(event),
    enabled: liveActivitiesOn,
  });
  const quietly = (promise: Promise<void>) => void promise.catch(() => {});
  processor.on('job:start', (job) => quietly(activity.onStart(job)));
  processor.on('job:progress', (job) => quietly(activity.onProgress(job)));
  processor.on('job:complete', (job) => quietly(activity.onFinish(job, false)));
  processor.on('job:fail', (job) => quietly(activity.onFinish(job, true)));
  return activity;
}
