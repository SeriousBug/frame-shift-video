/**
 * The Live Activity for a disc being ripped. The ripper keeps `_status/run.txt` up to date as it
 * works; this watches it and tells Hobwork when the disc or its step changes, and when it is done.
 */

import { readDiscsState } from './disc-state';
import { hobworkActivity, liveActivitiesOn } from './hobwork-service';
import { logger } from '../src/lib/sentry';
import type { DiscAttention, DiscRun } from '../src/types/discs';

const ACTIVITY_ID = 'rip';
const WATCH_INTERVAL_MS = 5000;

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
): { send: Activity | null; last: Watched } {
  if (run?.state === 'running') {
    const name = run.name || 'a disc';
    const key = `${name}|${run.step}`;
    if (last.running && last.key === key) return { send: null, last };
    return {
      send: {
        kind: 'rip',
        id: ACTIVITY_ID,
        state: last.running ? 'update' : 'start',
        title: name,
        subtitle: run.step || 'Working',
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
      const step = nextActivity(last, state.run, state.attention);
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
