/**
 * Utilities for sorting files and directories
 */

/**
 * Strip leading articles from a filename for better sorting
 * Removes "the", "a", and "and" from the start of the name (case-insensitive)
 *
 * Examples:
 * - "The Matrix" -> "Matrix"
 * - "a file.txt" -> "file.txt"
 * - "and more.mp4" -> "more.mp4"
 * - "Another File" -> "Another File" (no change, "An" is not in the list)
 */
export function stripLeadingArticles(name: string): string {
  // Match "the ", "a ", or "and " at the start (case-insensitive)
  // Must be followed by a space to avoid matching "theater" or "android"
  const pattern = /^(the|a|and)\s+/i;
  return name.replace(pattern, '');
}
