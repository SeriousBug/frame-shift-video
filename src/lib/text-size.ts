/**
 * The page's text size, for people who find the usual size small. Every size on the page is in
 * rem, so changing the size of the page's root text scales all of it, buttons and spacing too.
 */

export const TEXT_SIZES = [100, 125, 150] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

const KEY = 'discs-text-size';

export function isTextSize(value: unknown): value is TextSize {
  return TEXT_SIZES.some((size) => size === value);
}

/** The next size in the list, going back to the first after the last. */
export function nextTextSize(current: TextSize): TextSize {
  const index = TEXT_SIZES.indexOf(current);
  return TEXT_SIZES[(index + 1) % TEXT_SIZES.length] as TextSize;
}

/** What the person chose last time, or the usual size. */
export function readTextSize(): TextSize {
  try {
    const value = Number(localStorage.getItem(KEY));
    return isTextSize(value) ? value : 100;
  } catch {
    return 100;
  }
}

export function saveTextSize(size: TextSize) {
  try {
    localStorage.setItem(KEY, String(size));
  } catch {
    // Remembering is a convenience only.
  }
}

/** Sets the size of the page's root text; 100 puts it back to the browser's own. */
export function applyTextSize(size: TextSize) {
  document.documentElement.style.fontSize = size === 100 ? '' : `${size}%`;
}

export function describeTextSize(size: TextSize): string {
  return size === 100 ? 'Normal' : size === 125 ? 'Large' : 'Extra large';
}
