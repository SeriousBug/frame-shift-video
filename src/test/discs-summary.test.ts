import { describe, expect, test } from 'bun:test';
import { summarize } from '../routes/discs/index';
import type { DiscsState } from '../types/discs';

function state(changes: Partial<DiscsState>): DiscsState {
  return {
    available: true,
    eject: true,
    autoScan: true,
    movieOnly: true,
    drive: { media: false, label: '', updated: 1, alive: true },
    run: { state: 'idle', name: '', step: '', updated: 1 },
    next: null,
    attention: [],
    working: [],
    parked: [],
    needsYear: [],
    finishedCount: 0,
    recent: [],
    ...changes,
  } as DiscsState;
}

describe('the sentence at the top of the Discs page', () => {
  test('says all is good when nothing is going on', () => {
    expect(summarize(state({}))).toEqual({
      tone: 'ok',
      text: 'All good. Put a disc in the drive to start.',
    });
  });

  test('tells the person when something needs them, before anything else', () => {
    const result = summarize(
      state({
        attention: [{ file: 'a', name: 'A', lines: [] }],
        run: { state: 'running', name: 'A', step: 'x', updated: 1 },
      }),
    );
    expect(result.tone).toBe('attention');
    expect(result.text).toContain('One thing needs you');
  });

  test('says there is nothing to do while a disc is worked on', () => {
    const result = summarize(
      state({
        run: { state: 'running', name: 'Movie', step: 'x', updated: 1 },
      }),
    );
    expect(result.tone).toBe('busy');
    expect(result.text).toContain('Nothing to do');
  });

  test('says what to do when a disc is in and nothing starts by itself', () => {
    const result = summarize(
      state({
        autoScan: false,
        drive: { media: true, label: 'X', updated: 1, alive: true },
      }),
    );
    expect(result.text).toContain('Press “Rip the disc in the drive now”');
  });

  test('warns when the helper on the server is silent', () => {
    expect(summarize(state({ drive: null })).tone).toBe('attention');
  });
});
