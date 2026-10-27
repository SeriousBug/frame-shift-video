import { afterEach, describe, expect, test } from 'bun:test';
import {
  applyTextSize,
  describeTextSize,
  isTextSize,
  nextTextSize,
  readTextSize,
  saveTextSize,
} from '../lib/text-size';

type Fake = { fontSize: string };

// These tests swap in fakes. Whatever was there before (the DOM the other tests render into)
// is put back, not deleted, or every test file that runs after this one has no document.
const original = {
  localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
  document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
};

afterEach(() => {
  for (const [name, descriptor] of Object.entries(original)) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
});

/** Installs a fake in place of the real one; afterEach puts the real one back. */
function swapIn(name: 'localStorage' | 'document', value: unknown) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  swapIn('localStorage', {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  });
  return data;
}

describe('text size', () => {
  test('goes round the three sizes and back to the first', () => {
    expect(nextTextSize(100)).toBe(125);
    expect(nextTextSize(125)).toBe(150);
    expect(nextTextSize(150)).toBe(100);
  });

  test('only the three sizes are accepted', () => {
    expect(isTextSize(125)).toBe(true);
    expect(isTextSize(130)).toBe(false);
    expect(isTextSize('125')).toBe(false);
  });

  test('remembers the choice, and ignores anything else that is stored', () => {
    const data = fakeStorage();
    expect(readTextSize()).toBe(100);
    saveTextSize(150);
    expect(data['discs-text-size']).toBe('150');
    expect(readTextSize()).toBe(150);
    fakeStorage({ 'discs-text-size': '9999' });
    expect(readTextSize()).toBe(100);
    fakeStorage({ 'discs-text-size': 'big' });
    expect(readTextSize()).toBe(100);
  });

  test('still works when the browser will not let the page store anything', () => {
    swapIn('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readTextSize()).toBe(100);
    expect(() => saveTextSize(125)).not.toThrow();
  });

  test('sets and clears the size of the page text', () => {
    const style: Fake = { fontSize: '' };
    swapIn('document', { documentElement: { style } });
    applyTextSize(125);
    expect(style.fontSize).toBe('125%');
    applyTextSize(100);
    expect(style.fontSize).toBe('');
  });

  test('names the sizes in plain words', () => {
    expect([100, 125, 150].map((s) => describeTextSize(s as 100))).toEqual([
      'Normal',
      'Large',
      'Extra large',
    ]);
  });
});
