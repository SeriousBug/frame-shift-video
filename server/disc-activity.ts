/**
 * The Live Activity for a disc being ripped. The ripper keeps `_status/run.txt` up to date as it
 * works; this watches it and tells Hobwork when the disc or its step changes, and when it is done.
 */

import { readDiscsState } from './disc-state';
import { hobworkActivity, liveActivitiesOn } from './hobwork-service';
import { logger } from '../src/lib/sentry';
import { copyProgress } from '../src/lib/copy-progress';
import type { DiscAttention, DiscCopy, DiscRun } from '../src/types/discs';

const ACTIVITY_ID = 'rip';
const WATCH_INTERVAL_MS = 5000;
/** The card moves up in steps this big while a disc is copied, so the phone is not flooded. */
const COPY_STEP_PERCENT = 2;

export interface Watched {
  /** Whether a disc was being ripped at the last look */
  running: boolean;
  name: string;
  /** What was last sent, so the same thing is not sent twice */
  key: string;
}

export const IDLE: Watched = { running: false, name: '', key: '' };

type Activity = Parameters<typeof hobworkActivity>[0];

/** What to tell Hobwork now, if anything, and what is remembered for the next look. */
export function nextActivity(
  last: Watched,
  run: DiscRun | null,
  attention: DiscAttention[],
  copy: DiscCopy | null = null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): { send: Activity | null; last: Watched } {
  if (run?.state === 'running') {
    const name = run.name || 'a disc';
    const bar = copy ? copyProgress(copy, nowSeconds) : null;
    const step = bar ? Math.floor(bar.percent / COPY_STEP_PERCENT) : null;
    const key = `${name}|${run.step}|${step ?? ''}`;
    if (last.running && last.key === key) return { send: null, last };
    return {
      send: {
        kind: 'rip',
        id: ACTIVITY_ID,
        state: last.running ? 'update' : 'start',
        title: name,
        subtitle: bar
          ? `${run.step || 'Copying'}: ${bar.percent}%${bar.left ? `, ${bar.left}` : ''}`
          : run.step || 'Working',
        ...(bar ? { progress: bar.percent / 100 } : {}),
        icon: 'opticaldisc',
        path: '/discs',
      },
      last: { running: true, name, key },
    };
  }
  if (!last.running) return { send: null, last };

  // It was running and now it is not: done, or stopped because something needs a person.
  const needsYou = attention.some((note) => note.name === last.name);
  return {
    send: {
      kind: 'rip',
      id: ACTIVITY_ID,
      state: 'end',
      title: last.name,
      subtitle: needsYou ? 'Needs your attention' : 'Finished',
      progress: needsYou ? undefined : 1,
      failed: needsYou,
      icon: needsYou ? 'exclamationmark.triangle' : 'checkmark.circle',
      path: '/discs',
    },
    last: IDLE,
  };
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Starts watching. Does nothing while Hobwork Live Activities are off. */
export function startDiscActivityWatcher(): void {
  if (timer) return;
  let last: Watched = IDLE;
  let busy = false;
  timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      if (!liveActivitiesOn()) {
        // Turned off while one was showing: forget it, so turning it on starts fresh.
        last = IDLE;
        return;
      }
      const state = await readDiscsState();
      if (!state.available) return;
      const copy = state.working.find((disc) => disc.copy)?.copy ?? null;
      const step = nextActivity(last, state.run, state.attention, copy);
      last = step.last;
      if (step.send) await hobworkActivity(step.send);
    } catch (error) {
      logger.warn('[DiscActivity] Could not check the ripper', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      busy = false;
    }
  }, WATCH_INTERVAL_MS);
  // The watcher must not keep the server alive on its own.
  timer.unref?.();
}
