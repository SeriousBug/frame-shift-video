import { describe, expect, test } from 'bun:test';
import { subtitleHint, summarize } from '../routes/discs/index';
import type { DiscsState } from '../types/discs';
import type { SubtitleFile, SubtitlesState } from '../types/subtitles';

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
    expect(result.goto).toBe('Needs you');
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

describe('the hint about subtitles under the status sentence', () => {
  const track = {
    language: 'eng',
    codec: 'picture',
    name: '',
    default: true,
    forced: false,
  };
  function subtitles(files: Partial<SubtitleFile>[], current = null) {
    return {
      available: true,
      auto: false,
      updated: 1,
      files: files.map((f) => ({
        path: 'A/a.mkv',
        tracks: [track],
        pictures: 1,
        needsClean: false,
        status: null,
        ...f,
      })),
      held: [],
      current,
      recent: [],
    } as SubtitlesState;
  }

  test('says nothing when there is nothing to convert', () => {
    expect(subtitleHint(undefined)).toBeNull();
    expect(subtitleHint(subtitles([{ pictures: 0 }]))).toBeNull();
  });

  test('counts the movies that can be converted, not the ones already waiting', () => {
    expect(subtitleHint(subtitles([{}, {}, { status: 'queued' }]))).toContain(
      '2 movies have',
    );
    expect(subtitleHint(subtitles([{}]))).toContain('1 movie has');
  });

  test('stays quiet while a conversion is running', () => {
    expect(
      subtitleHint(
        subtitles([{}], {
          path: 'A/a.mkv',
          step: 'x',
          done: null,
          total: null,
        } as never),
      ),
    ).toBeNull();
  });
});
