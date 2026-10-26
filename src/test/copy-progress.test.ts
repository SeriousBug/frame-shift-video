import { describe, expect, test } from 'bun:test';
import {
  copyProgress,
  formatBytes,
  formatDuration,
} from '../lib/copy-progress';

const GB = 1e9;

describe('the copy progress of a disc', () => {
  test('percent, sizes and the time left come from how fast it has gone so far', () => {
    // 1.2 GB of 4.6 GB in 10 minutes: 2 MB/s, so 3.4 GB takes 28 minutes more.
    const result = copyProgress(
      { total: 4.6 * GB, bytes: 1.2 * GB, startedAt: 1000, updatedAt: 1600 },
      1610,
    );
    expect(result).toEqual({
      percent: 26,
      copied: '1.2 GB',
      total: '4.6 GB',
      speed: '2.0 MB/s',
      left: 'about 28 minutes',
      stalled: false,
    });
  });

  test('does not guess the time in the first seconds, when the speed jumps about', () => {
    const result = copyProgress(
      { total: 4.6 * GB, bytes: 50e6, startedAt: 1000, updatedAt: 1010 },
      1012,
    );
    expect(result?.speed).toBeNull();
    expect(result?.left).toBeNull();
    expect(result?.percent).toBe(1);
  });

  test('says it is not updating, and gives no time, when nothing was written for a while', () => {
    const result = copyProgress(
      { total: 4.6 * GB, bytes: 2 * GB, startedAt: 1000, updatedAt: 1600 },
      1600 + 200,
    );
    expect(result?.stalled).toBe(true);
    expect(result?.left).toBeNull();
    expect(result?.percent).toBe(43);
  });

  test('never goes past 100 and refuses numbers that make no sense', () => {
    expect(
      copyProgress(
        { total: 1 * GB, bytes: 2 * GB, startedAt: 0, updatedAt: 600 },
        600,
      )?.percent,
    ).toBe(100);
    expect(
      copyProgress({ total: 0, bytes: 5, startedAt: 0, updatedAt: 10 }, 10),
    ).toBeNull();
    expect(
      copyProgress({ total: 5, bytes: -1, startedAt: 0, updatedAt: 10 }, 10),
    ).toBeNull();
  });

  test('says sizes and times in plain words', () => {
    expect(formatBytes(4.6e9)).toBe('4.6 GB');
    expect(formatBytes(415e6)).toBe('415 MB');
    expect(formatBytes(900)).toBe('1 KB');
    expect(formatDuration(40)).toBe('about 40 seconds');
    expect(formatDuration(600)).toBe('about 10 minutes');
    expect(formatDuration(3900)).toBe('about 65 minutes');
    expect(formatDuration(7500)).toBe('about 2 hours 5 minutes');
    expect(formatDuration(7200)).toBe('about 2 hours');
  });
});
